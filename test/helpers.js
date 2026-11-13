import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import {readConfig} from '../src/config.js';
import {createServer} from '../src/server.js';
import {startFakeAvada, startFakeOpenAI} from './fakes.js';

export const ADS_KEY = 'sk-test-ADSKEY-0123456789abcdef';
export const AVADA_KEY = 'avk_live_TESTKEY0123456789abcdefghijklmnopqrstuvw';

/**
 * A client connected in memory to a kit server pointed at fresh fakes.
 *
 * @param {{env?: Record<string, string>, currency?: string, avadaAnswers?: Record<string, [number, any]>}} [opts]
 */
export async function connect(opts = {}) {
  const openai = await startFakeOpenAI({key: ADS_KEY, currency: opts.currency});
  const avada = await startFakeAvada({key: AVADA_KEY, answers: opts.avadaAnswers});
  const auditPath = join(mkdtempSync(join(tmpdir(), 'cak-')), 'audit.log');
  const config = readConfig({
    OPENAI_ADS_API_KEY: ADS_KEY,
    OPENAI_ADS_API_BASE: `${openai.url}/v1`,
    AVADA_API_KEY: AVADA_KEY,
    AVADA_API_BASE: avada.url,
    CHATGPT_ADS_AUDIT_LOG: auditPath,
    ...opts.env
  });
  const server = createServer(config, {retryBaseMs: 1});
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({name: 'test', version: '0'});
  await client.connect(clientSide);
  /** Every raw answer, to check later that no secret ever left the server. */
  const transcript = [];
  /**
   * @param {string} name
   * @param {Record<string, unknown>} [args]
   * @returns {Promise<{body: any, isError: boolean}>}
   */
  const call = async (name, args = {}) => {
    const res = /** @type {any} */ (await client.callTool({name, arguments: args}));
    transcript.push(JSON.stringify(res));
    return {body: res.structuredContent ?? res.content?.[0]?.text, isError: Boolean(res.isError)};
  };
  const close = async () => {
    await client.close();
    await openai.close();
    await avada.close();
  };
  return {client, call, openai, avada, auditPath, transcript, close};
}
