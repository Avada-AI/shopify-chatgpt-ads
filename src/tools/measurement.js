import * as z from 'zod';
import {AVADA_APP_URL, AVADA_DOCS_URL, DEFAULT_AVADA_BASE} from '../config.js';

// Proxy tools for Avada ChatGPT Ads' measurement API v1 (REST mirror, contract in
// docs/measurement-api.md). They return what the app measured in the store (orders attributed
// to ChatGPT ads, True ROAS, tracking health). When the data cannot be read they say why and
// what to do, and never return a number.

const date = (/** @type {string} */ what) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe(what);
const RANGE = {from: date('First day, YYYY-MM-DD'), to: date('Last day, YYYY-MM-DD')};

const SETUP_STEPS = [
  `Install Avada ChatGPT Ads (free) on the Shopify store: ${AVADA_APP_URL}`,
  'Turn on the app embed: Shopify admin > Online Store > Themes > Customize > App embeds > Avada ChatGPT Ads (the app setup guide links there). Without it the store sends no tracked events.',
  'Create an API key in the app: Settings > AI agents > API keys. Put it in the agent environment as AVADA_API_KEY=avk_live_... and restart the agent.',
  `Or, instead of a key, add Avada's hosted MCP server to your agent and approve it in the app (OAuth): ${DEFAULT_AVADA_BASE}/mcp`
];
const RECONNECT = 'In the app, connect the ad account: Tracking > Connected account, paste the Advertiser API key. get_setup_status shows what is missing.';

const WHY = "Without Avada's app the agent sees only OpenAI's attributed numbers. Orders measured in the store, True ROAS from real Shopify orders, and tracking health need the app installed with its app embed on.";

/** What each failure means for the merchant and the next step. `retry` = transient. */
const UNAVAILABLE = {
  not_connected: {reason: 'AVADA_API_KEY is not set, so the kit cannot read measured data.', steps: SETUP_STEPS},
  key_invalid: {reason: 'Avada refused the API key (401): it was revoked or mistyped, or the store uninstalled the app.', steps: SETUP_STEPS},
  locked: {reason: "Avada answered 403: this data is not available on the store's current plan in the app.", steps: ['Open Avada ChatGPT Ads in the Shopify admin and check its plan.']},
  ads_not_connected: {reason: 'No OpenAI ad account is connected in the app, so it cannot join orders to ad spend.', steps: [RECONNECT]},
  ads_key_invalid: {reason: 'The app could not read OpenAI with the ad account key saved in it (refused or revoked).', steps: [RECONNECT]},
  invalid_input: {reason: 'Avada refused an argument (400).', steps: ['Fix the argument named in avada.field and call again.']},
  not_live: {reason: 'The measurement API answered 404 not_found: it is switched off on this server, or AVADA_API_BASE is wrong.', steps: [`Check AVADA_API_BASE (default ${DEFAULT_AVADA_BASE}) and ${AVADA_DOCS_URL}.`]},
  unknown_tool: {reason: 'Avada has no tool by this name: the kit and the API disagree.', steps: ['Update the kit to the latest version, or check AVADA_API_PATH (default /data/v1).']},
  too_large: {reason: 'The request was over 64 KiB and Avada refused it (413).', steps: ['Send fewer or shorter arguments.']},
  rate_limited: {reason: 'Avada rate-limited the request (429).', steps: ['Wait the retry_after seconds, then try again.'], retry: true},
  temporarily_unavailable: {reason: "Avada's rate limiter could not count, so nothing ran (503).", steps: ['Try again in 30 seconds.'], retry: true},
  could_not_check: {reason: 'Avada could not be reached, or the read failed on its side.', steps: ['Try again later. Report the data as unknown, not zero.'], retry: true}
};

/**
 * @param {keyof typeof UNAVAILABLE} code
 * @param {Record<string, unknown>} [avada] what Avada answered: http_status, code, field, retry_after, limit
 */
function unavailable(code, avada) {
  return {
    status: UNAVAILABLE[code].retry ? 'could_not_check' : 'unavailable',
    code,
    reason: UNAVAILABLE[code].reason,
    ...(avada ? {avada} : {}),
    why_it_matters: WHY,
    steps: UNAVAILABLE[code].steps,
    data: null,
    note: 'No numbers were returned. Do not report any measured figure as 0; say it is unknown.',
    isError: true
  };
}

/**
 * Avada's REST failure `{success: false, code, error, status?, field?, retryAfter?, limit?}`
 * (or `{"error": "not_found"}` while the API is off) as one of the kit's codes.
 *
 * @param {number} http
 * @param {any} body
 * @returns {keyof typeof UNAVAILABLE}
 */
function classify(http, body) {
  const code = typeof body?.code === 'string' ? body.code : '';
  if (http === 401) return 'key_invalid';
  if (http === 403) return 'locked';
  if (http === 404) return code === 'UNKNOWN_TOOL' ? 'unknown_tool' : 'not_live';
  if (http === 400) return 'invalid_input';
  if (http === 413) return 'too_large';
  if (http === 429) return 'rate_limited';
  if (http === 503) return 'temporarily_unavailable';
  if (code === 'NOT_CONNECTED') return 'ads_not_connected';
  if (code === 'KEY_INVALID') return 'ads_key_invalid';
  return 'could_not_check';
}

/**
 * The embed check from a setup object (`checks` in get_setup_status, `setup` elsewhere):
 * `on` is true, false, or null when the theme could not be read.
 *
 * @param {any} data
 */
function embedAttention(data) {
  const embed = data?.setup?.app_embed ?? data?.checks?.app_embed;
  if (!embed || embed.on === true || embed.on === undefined) return null;
  const fix = typeof embed.fix === 'string' && embed.fix.startsWith('https://') ? embed.fix : null;
  return embed.on === false
    ? {code: 'app_embed_off', reason: 'The app embed is off, so the storefront sends no tracked events; measured orders and ROAS stop growing.', fix, steps: [SETUP_STEPS[1]]}
    : {code: 'app_embed_unknown', reason: 'Avada could not read the theme, so whether the app embed is on is unknown (not off).', fix, steps: ['Check it in the theme editor: Online Store > Themes > Customize > App embeds.']};
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
  } catch {
    return unavailable('could_not_check', {http_status: null, code: 'NETWORK'});
  }
  if (!res.ok || !body || body.success !== true) {
    const retryAfter = Number(body?.retryAfter ?? res.headers.get('retry-after'));
    // Avada's own codes and numbers only; its free-text `error` sentence is not passed on.
    const avada = {
      http_status: res.status,
      code: typeof body?.code === 'string' ? body.code.slice(0, 60) : typeof body?.error === 'string' ? body.error.slice(0, 60) : null,
      ...(typeof body?.field === 'string' ? {field: body.field.slice(0, 60)} : {}),
      ...(Number.isFinite(retryAfter) && retryAfter > 0 ? {retry_after: retryAfter} : {}),
      ...(['shop', 'caller', 'ip'].includes(body?.limit) ? {limit: body.limit} : {})
    };
    const answer = unavailable(classify(res.status, body), avada);
    if (avada.limit === 'shop') answer.reason += ' The store as a whole (all its keys and agents, 100 calls a minute) is over its limit.';
    if (avada.limit === 'caller') answer.reason += ' This key is over its own limit (30 calls a minute).';
    if (avada.limit === 'ip') answer.reason += ' Too many refused keys came from this address; every call from it waits until the minute ends.';
    return answer;
  }
  const attention = embedAttention(body.data);
  return {
    source: 'Avada ChatGPT Ads (measured in the store)',
    contract: 'v1',
    data: body.data ?? null,
    ...(attention ? {attention} : {})
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
  description: `${description} From Avada ChatGPT Ads (measurement API v1, needs AVADA_API_KEY). If it answers unavailable, tell the user the reason and steps; never invent or zero-fill numbers.`,
  input: /** @type {Record<string, z.ZodType>} */ (input),
  run: (/** @type {any} */ args, /** @type {any} */ ctx) => callAvada(/** @type {string} */ (name), args, ctx)
}));
