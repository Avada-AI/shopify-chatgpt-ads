import * as z from 'zod';
import {AVADA_APP_URL, AVADA_DOCS_URL, DEFAULT_AVADA_BASE} from '../config.js';

// Proxy tools for Avada ChatGPT Ads' Measurement API (PREVIEW: the app side ships in
// parallel; contract in docs/measurement-api.md). They return what the app measured in the
// store (orders attributed to ChatGPT ads, True ROAS, tracking health). When the data cannot
// be read they say why and what to do, and never return a number.

const date = (/** @type {string} */ what) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe(what);
const RANGE = {from: date('First day, YYYY-MM-DD'), to: date('Last day, YYYY-MM-DD')};

const SETUP_STEPS = [
  `Install Avada ChatGPT Ads (free) on the Shopify store: ${AVADA_APP_URL}`,
  'Turn on the app embed: Shopify admin > Online Store > Themes > Customize > App embeds > Avada ChatGPT Ads (the app setup guide links there). Without it the store sends no tracked events.',
  'Create an API key in the app: Settings > AI agents > API keys. Put it in the agent environment as AVADA_API_KEY=avk_live_... and restart the agent.',
  `Or, instead of a key, add Avada's hosted MCP server to your agent and approve it in the app (OAuth): ${DEFAULT_AVADA_BASE}/mcp`
];

const WHY = "Without Avada's app the agent sees only OpenAI's attributed numbers. Orders measured in the store, True ROAS from real Shopify orders, and tracking health need the app installed with its app embed on.";

/** What each failure means for the merchant and the next step. */
const UNAVAILABLE = {
  not_connected: {reason: 'AVADA_API_KEY is not set, so the kit cannot read measured data.', steps: SETUP_STEPS},
  key_invalid: {reason: 'Avada refused the API key (revoked, mistyped, or for another store).', steps: SETUP_STEPS.slice(2)},
  app_not_installed: {reason: 'Avada ChatGPT Ads is not installed on this store (or was uninstalled).', steps: SETUP_STEPS},
  app_embed_off: {reason: "The app embed is off, so the storefront sends no tracked events; measured orders and ROAS are missing or stale.", steps: [SETUP_STEPS[1]]},
  ads_not_connected: {reason: 'No OpenAI ad account is connected in the app, so it cannot join orders to ad spend.', steps: ['In the app, connect the ad account: Tracking > Connected account, paste the Advertiser API key.']},
  not_live: {reason: 'The Measurement API answered 404: it may not be live for this store yet (the contract is in preview) or AVADA_API_PATH is wrong.', steps: [`Check ${AVADA_DOCS_URL} for the current endpoint, or connect the hosted MCP server: ${DEFAULT_AVADA_BASE}/mcp`]},
  rate_limited: {reason: 'Avada rate-limited the request.', steps: ['Wait a minute and try again.']},
  could_not_check: {reason: 'Avada could not be reached or failed to answer.', steps: ['Try again later. Report the data as unknown, not zero.']}
};

/**
 * @param {keyof typeof UNAVAILABLE} code
 * @param {string} [detail]
 */
function unavailable(code, detail) {
  return {
    status: code === 'could_not_check' || code === 'rate_limited' ? 'could_not_check' : 'unavailable',
    code,
    reason: UNAVAILABLE[code].reason,
    ...(detail ? {detail: detail.slice(0, 300)} : {}),
    why_it_matters: WHY,
    steps: UNAVAILABLE[code].steps,
    data: null,
    note: 'No numbers were returned. Do not report any measured figure as 0; say it is unknown.',
    isError: true
  };
}

/**
 * @param {string} name Avada's tool name
 * @param {any} args
 * @param {any} ctx
 */
async function callAvada(name, args, ctx) {
  const {avadaKey, avadaBase, avadaPath} = ctx.config;
  if (!avadaKey) return unavailable('not_connected');
  let res;
  let body;
  try {
    res = await ctx.fetch(`${avadaBase}${avadaPath}/${name}`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${avadaKey}`, 'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify(args || {}),
      signal: AbortSignal.timeout(20000)
    });
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = null;
    }
  } catch (e) {
    return unavailable('could_not_check', e instanceof Error ? e.message : String(e));
  }
  const err = body && typeof body.error === 'object' && body.error ? body.error : {};
  const code = String(err.code || (typeof body?.error === 'string' ? body.error : '') || '').toLowerCase();
  const message = String(err.message || '');
  if (Object.hasOwn(UNAVAILABLE, code)) return unavailable(/** @type {keyof typeof UNAVAILABLE} */ (code), message);
  if (code === 'app_uninstalled') return unavailable('app_not_installed', message);
  if (res.status === 401 || res.status === 403) return unavailable('key_invalid', message);
  if (res.status === 404) return unavailable('not_live', message);
  if (res.status === 429) return unavailable('rate_limited', message);
  if (!res.ok || body === null || body.success === false) {
    return unavailable('could_not_check', message || `HTTP ${res.status}`);
  }
  const data = 'data' in body ? body.data : body;
  // The app can answer and still warn that tracking is off; pass the data with the warning.
  const embedOff = data && typeof data === 'object' && (data.app_embed_enabled === false || data.setup?.app_embed_enabled === false);
  return {
    source: 'Avada ChatGPT Ads (measured in the store)',
    contract: 'preview',
    data,
    ...(embedOff ? {attention: {code: 'app_embed_off', reason: UNAVAILABLE.app_embed_off.reason, steps: UNAVAILABLE.app_embed_off.steps}} : {})
  };
}

const TOOLS = [
  ['get_setup_status', 'Measurement setup status', 'Is Avada ChatGPT Ads installed, the app embed on, the ad account connected, pixel and Conversions API working. Call this first when measured data is missing.', {}],
  ['get_account_overview', 'Measured account overview', 'The store, the connected ad account, pixel and Conversions API state and the ready-to-advertise checklist, as Avada sees them.', {}],
  [
    'get_ads_report',
    'Ads report with True ROAS',
    "OpenAI's totals per campaign and per day beside True ROAS from the store's own Shopify orders. App-side figures are null with a reason when currencies differ or tracking is too new. Amounts are in the currency named in the answer.",
    {
      ...RANGE,
      click: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional().describe('Click window days, default 30'),
      view: z.union([z.literal(0), z.literal(1)]).optional().describe('View window days, default 1'),
      basis: z.enum(['ad_event_time', 'conversion_time']).optional()
    }
  ],
  ['get_ads_breakdown', 'Measured breakdown', 'Delivery by country, device or platform for a date range.', {dimension: z.enum(['country', 'device', 'platform']), ...RANGE}],
  ['get_product_report', 'Measured product report', 'Products that received ad delivery, with measured orders where the app has them.', RANGE],
  ['list_campaigns', 'Campaigns as Avada sees them', 'Campaigns with status, budget and health; include_issues adds ad groups, ads and serving issues (slow).', {include_issues: z.boolean().optional()}],
  ['get_campaign', 'Campaign as Avada sees it', 'One campaign with its health and measured results.', {campaign_id: z.string().max(100)}],
  ['get_spend_pacing', 'Spend pacing', 'Month-to-date spend against the target set in the app, with a forecast.', {}],
  ['get_feed_status', 'Feed status (Avada)', "The app's product feed sync to OpenAI: last snapshot, delta updates, quality score.", {}],
  [
    'list_feed_issues',
    'Feed issues (Avada)',
    'Products the last feed snapshot found problems with (missing image, GTIN, price, rejected by OpenAI), one page at a time.',
    {severity: z.enum(['error', 'warning']).optional(), limit: z.number().int().min(1).max(50).optional(), after: z.string().max(1500).optional()}
  ],
  ['list_alerts', 'Alerts', 'Open alerts the app raised: tracking stopped, feed failing, campaign not serving, overspend.', {}],
  [
    'get_tracking_health',
    'Tracking health',
    'Events by type, the funnel, Conversions API delivery and purchases tracked against real Shopify orders. Counts and sums only.',
    {days: z.number().int().min(1).max(90).optional()}
  ],
  ['list_campaign_presets', 'Campaign presets', 'Campaign presets the app suggests from the catalogue (bestsellers, new arrivals, ...).', {}]
];

/** @type {import('../server.js').ToolDef[]} */
export const measurementTools = TOOLS.map(([name, title, description, input]) => ({
  name: `measurement_${name}`,
  title: /** @type {string} */ (title),
  kind: 'read',
  description: `${description} From Avada ChatGPT Ads (preview API, needs AVADA_API_KEY). If it answers unavailable, tell the user the reason and steps; never invent or zero-fill numbers.`,
  input: /** @type {Record<string, z.ZodType>} */ (input),
  run: (/** @type {any} */ args, /** @type {any} */ ctx) => callAvada(/** @type {string} */ (name), args, ctx)
}));
