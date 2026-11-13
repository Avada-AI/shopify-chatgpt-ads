import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {startFakeOpenAI} from './fakes.js';
import {ADS_KEY} from './helpers.js';

// src/ is what developers run; dist/cli.js is the bundle the Claude Code plugin starts.
for (const entry of ['../src/cli.js', '../dist/cli.js']) test(`a real MCP client starts ${entry.slice(3)} over stdio, lists tools and calls a read tool`, async () => {
  const openai = await startFakeOpenAI({key: ADS_KEY});
  const stderr = new PassThrough();
  let stderrText = '';
  stderr.on('data', chunk => (stderrText += chunk));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL(entry, import.meta.url))],
    env: {
      PATH: process.env.PATH || '',
      OPENAI_ADS_API_KEY: ADS_KEY,
      OPENAI_ADS_API_BASE: `${openai.url}/v1`,
      CHATGPT_ADS_AUDIT_LOG: join(mkdtempSync(join(tmpdir(), 'cak-e2e-')), 'audit.log')
    },
    stderr: 'pipe'
  });
  transport.stderr?.pipe(stderr);
  const client = new Client({name: 'e2e', version: '0'});
  await client.connect(transport);
  try {
    assert.equal(client.getServerVersion()?.name, 'shopify-chatgpt-ads');
    assert.match(client.getInstructions() || '', /PAUSED/);
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 46);
    const res = /** @type {any} */ (await client.callTool({name: 'get_ad_account', arguments: {}}));
    assert.equal(res.isError, undefined);
    assert.equal(res.structuredContent.account.currency_code, 'USD');
    assert.ok(!JSON.stringify(res).includes(ADS_KEY));
  } finally {
    await client.close();
    await openai.close();
  }
  assert.match(stderrText, /OpenAI key set/);
  assert.ok(!stderrText.includes(ADS_KEY), 'the key is never printed');
});
