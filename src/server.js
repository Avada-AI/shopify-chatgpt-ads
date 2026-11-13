import {readFileSync} from 'node:fs';
import {McpServer} from '@modelcontextprotocol/server';
import * as z from 'zod';
import {ADS_ERRORS, AdsError, InputError, createAdsClient} from './ads-client.js';
import {createAuditLog} from './audit.js';
import {adsTools} from './tools/ads.js';
import {measurementTools} from './tools/measurement.js';

export const VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;

const INSTRUCTIONS = [
  "Manage the merchant's ChatGPT (OpenAI) ads with their own Advertiser API key.",
  'Safety rules: everything this server creates starts PAUSED. activate_campaign, and set_budget',
  'or set_bid when they raise spend, first return a dry run with a plan_id: show the user what',
  'will spend (name, budget, currency, preview link), get an explicit yes in the conversation,',
  'then call again with confirm: true and that plan_id. Never pass confirm on your own.',
  'Budgets and bids are amounts in the ad account currency (get_ad_account). Insights spend is',
  'already in major units. Never add or compare amounts in different currencies.',
  'measurement_* tools read measured orders and True ROAS from the Avada ChatGPT Ads app; when',
  'they say unavailable, report that and the steps, never a number. Unknown is not zero.'
].join(' ');

/**
 * Remove every secret from a value before it leaves the server (answers, errors, audit log).
 *
 * @param {unknown} value
 * @param {string[]} secrets
 * @returns {any}
 */
export function redact(value, secrets) {
  let text = JSON.stringify(value ?? null);
  for (const secret of secrets) if (secret && secret.length >= 6) text = text.split(secret).join('[redacted]');
  text = text
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/\bavk_live_[A-Za-z0-9]{4,}/g, '[redacted]')
    .replace(/Bearer [A-Za-z0-9._~+/=-]{8,}/g, 'Bearer [redacted]');
  return JSON.parse(text);
}

/**
 * @param {unknown} e
 * @returns {Record<string, unknown>}
 */
function describeError(e) {
  if (e instanceof AdsError) {
    return {code: e.code, http_status: e.status, message: e.message, param: e.param, what_to_do: ADS_ERRORS[e.code]};
  }
  if (e instanceof InputError || e instanceof RangeError) {
    return {code: 'INVALID_INPUT', message: e.message, what_to_do: 'Fix the input; nothing was sent to OpenAI.'};
  }
  return {code: 'INTERNAL', message: e instanceof Error ? e.message : String(e)};
}

/**
 * @typedef {'read'|'write'|'gated'} ToolKind  gated = may spend; needs confirm + plan_id
 * @typedef {{name: string, title: string, description: string, kind: ToolKind,
 *   input: Record<string, z.ZodType>, annotations?: Record<string, boolean>,
 *   run: (args: any, ctx: any) => Promise<any>}} ToolDef
 */

/**
 * @param {import('./config.js').Config} config
 * @param {{fetch?: typeof fetch, retryBaseMs?: number}} [deps]
 * @returns {McpServer}
 */
export function createServer(config, deps = {}) {
  const secrets = [config.adsKey, config.avadaKey];
  const ads = createAdsClient({apiKey: config.adsKey, baseUrl: config.adsBase, fetch: deps.fetch, retryBaseMs: deps.retryBaseMs});
  const audit = createAuditLog(config.auditPath);
  /** @type {{at: number, value: any}|null} */
  let accountCache = null;
  const ctx = {
    ads,
    config,
    fetch: deps.fetch || fetch,
    /** The ad account (currency, timezone), cached for 5 minutes. */
    async account() {
      if (!accountCache || Date.now() - accountCache.at > 300000) {
        accountCache = {at: Date.now(), value: await ads.get('/ad_account')};
      }
      return accountCache.value;
    }
  };

  const server = new McpServer({name: 'shopify-chatgpt-ads', version: VERSION}, {instructions: INSTRUCTIONS});
  /** @type {ToolDef[]} */
  const tools = [...adsTools, ...measurementTools];
  for (const tool of tools) {
    // Read-only mode: write tools are not offered at all, not merely refused.
    if (config.readOnly && tool.kind !== 'read') continue;
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: z.object(tool.input),
        annotations: {
          readOnlyHint: tool.kind === 'read',
          destructiveHint: tool.name.startsWith('archive_'),
          openWorldHint: true,
          ...tool.annotations
        }
      },
      async (/** @type {any} */ args) => {
        const logged = tool.kind !== 'read';
        if (logged) {
          try {
            await audit.write({phase: 'request', tool: tool.name, args: redact(args, secrets)});
          } catch (e) {
            // No audit line, no write.
            const reason = e instanceof Error ? e.message : String(e);
            return toolResult({error: {code: 'AUDIT_LOG_UNAVAILABLE', message: `Cannot write ${config.auditPath}: ${reason}`}}, true, secrets);
          }
        }
        let body;
        let isError;
        try {
          body = await tool.run(args, ctx);
          isError = Boolean(body && body.isError);
          if (body && 'isError' in body) delete body.isError;
        } catch (e) {
          body = {error: describeError(e)};
          isError = true;
        }
        if (logged) {
          const outcome = isError ? 'error' : body?.dry_run ? 'dry_run' : 'ok';
          await audit
            .write({phase: 'result', tool: tool.name, outcome, ids: body?.ids, error: body?.error ? redact(body.error, secrets) : undefined})
            .catch(() => {});
        }
        return toolResult(body, isError, secrets);
      }
    );
  }
  return server;
}

/**
 * @param {unknown} body
 * @param {boolean} isError
 * @param {string[]} secrets
 */
function toolResult(body, isError, secrets) {
  const clean = redact(body, secrets);
  return {
    content: [{type: /** @type {const} */ ('text'), text: JSON.stringify(clean, null, 2)}],
    structuredContent: clean,
    ...(isError ? {isError: true} : {})
  };
}
