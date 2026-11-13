#!/usr/bin/env node
import {StdioServerTransport} from '@modelcontextprotocol/server/stdio';
import {readConfig} from './config.js';
import {VERSION, createServer} from './server.js';

const HELP = `shopify-chatgpt-ads-mcp ${VERSION}: MCP server for ChatGPT (OpenAI) ads, over stdio.

Environment:
  OPENAI_ADS_API_KEY     Advertiser API key (Ads Manager > Settings). Never logged or echoed.
  CHATGPT_ADS_READ_ONLY  1 = offer no write tool at all
  AVADA_API_KEY          avk_live_... key from Avada ChatGPT Ads (Settings > AI agents) for measured data
  AVADA_API_BASE         default https://avada-chatgpt.firebaseapp.com
  AVADA_API_PATH         default /data/v1 (measurement API v1)
  CHATGPT_ADS_AUDIT_LOG  default ~/.chatgpt-ads-kit/audit.log (every write, no secrets)
`;

const arg = process.argv[2];
if (arg === '--help' || arg === '-h') {
  process.stdout.write(HELP);
} else if (arg === '--version' || arg === '-v') {
  process.stdout.write(`${VERSION}\n`);
} else {
  const config = readConfig(process.env);
  const server = createServer(config);
  await server.connect(new StdioServerTransport());
  // stderr only: stdout is the MCP channel. Say whether keys are set, never what they are.
  process.stderr.write(
    `shopify-chatgpt-ads-mcp ${VERSION} on stdio: ${config.readOnly ? 'read-only' : 'read-write'}, ` +
      `OpenAI key ${config.adsKey ? 'set' : 'NOT set'}, Avada key ${config.avadaKey ? 'set' : 'not set'}, ` +
      `audit log ${config.auditPath}\n`
  );
}
