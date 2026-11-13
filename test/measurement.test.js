import assert from 'node:assert/strict';
import {test} from 'node:test';
import {avadaError} from './fakes.js';
import {AVADA_KEY, connect} from './helpers.js';

/** @param {any} body */
const noNumbers = body => {
  assert.equal(body.data, null);
  assert.match(body.note, /unknown/);
  assert.ok(Array.isArray(body.steps) && body.steps.length > 0);
};

test('without AVADA_API_KEY: unavailable, why it matters, install steps, no call, no numbers', async () => {
  const kit = await connect({env: {AVADA_API_KEY: ''}});
  const res = await kit.call('measurement_get_ads_report', {from: '2026-11-01', to: '2026-11-07'});
  assert.equal(res.isError, true);
  assert.equal(res.body.code, 'not_connected');
  assert.match(res.body.why_it_matters, /True ROAS/);
  assert.ok(res.body.steps.some((/** @type {string} */ s) => s.includes('https://apps.shopify.com/avada-chatgpt-pixel')));
  assert.ok(res.body.steps.some((/** @type {string} */ s) => /app embed/i.test(s)));
  noNumbers(res.body);
  assert.equal(kit.avada.requests.length, 0);
  await kit.close();
});

test('with a key: POST <base>/data/v1/<tool> with bearer auth, data passed through, marked v1', async () => {
  const kit = await connect();
  const res = await kit.call('measurement_get_ads_report', {from: '2026-11-01', to: '2026-11-07', click: 7});
  assert.equal(res.isError, false);
  assert.equal(res.body.contract, 'v1');
  assert.equal(res.body.data.true_roas, 3.2);
  const req = kit.avada.requests.at(-1);
  assert.equal(req?.path, '/data/v1/get_ads_report');
  assert.deepEqual(req?.body, {from: '2026-11-01', to: '2026-11-07', click: 7});
  assert.equal(req?.auth, `Bearer ${AVADA_KEY}`);
  await kit.close();
});

test('every error of the live API maps to a code, a reason and steps, never numbers', async () => {
  const cases = /** @type {const} */ ([
    ['get_ads_report', avadaError(400, 'INVALID_INPUT', {status: 'invalid_input', field: 'click'}), 'invalid_input', 'unavailable'],
    ['get_account_overview', avadaError(403, 'DASHBOARD_LOCKED', {status: 'locked'}), 'locked', 'unavailable'],
    ['get_feed_status', [404, {error: 'not_found'}], 'not_live', 'unavailable'],
    ['list_alerts', avadaError(404, 'UNKNOWN_TOOL'), 'unknown_tool', 'unavailable'],
    ['get_campaign', avadaError(413, 'REQUEST_TOO_LARGE'), 'too_large', 'unavailable'],
    ['get_spend_pacing', avadaError(429, 'RATE_LIMITED', {retryAfter: 41, limit: 'shop'}), 'rate_limited', 'could_not_check'],
    ['get_product_report', avadaError(429, 'RATE_LIMITED', {retryAfter: 7, limit: 'caller'}), 'rate_limited', 'could_not_check'],
    ['list_feed_issues', avadaError(429, 'RATE_LIMITED', {status: 'rate_limited', retryAfter: 12}), 'rate_limited', 'could_not_check'],
    ['get_setup_status', avadaError(502, 'NOT_CONNECTED', {status: 'could_not_check'}), 'ads_not_connected', 'unavailable'],
    ['get_ads_breakdown', avadaError(502, 'KEY_INVALID', {status: 'could_not_check'}), 'ads_key_invalid', 'unavailable'],
    ['get_tracking_health', avadaError(502, 'UPSTREAM', {status: 'could_not_check'}), 'could_not_check', 'could_not_check'],
    ['list_campaign_presets', avadaError(503, 'TEMPORARILY_UNAVAILABLE'), 'temporarily_unavailable', 'could_not_check'],
    ['list_campaigns', [500, {success: false}], 'could_not_check', 'could_not_check']
  ]);
  const kit = await connect({avadaAnswers: Object.fromEntries(cases.map(([tool, answer]) => [tool, answer]))});
  for (const [tool, , code, status] of cases) {
    const args = tool === 'get_ads_breakdown' ? {dimension: 'country'} : tool === 'get_campaign' ? {campaign_id: 'cmpn_1'} : {};
    const res = await kit.call(`measurement_${tool}`, args);
    assert.equal(res.isError, true, tool);
    assert.equal(res.body.code, code, tool);
    assert.equal(res.body.status, status, tool);
    noNumbers(res.body);
    assert.ok(!JSON.stringify(res.body).includes('Try again after Retry-After'), 'Avada sentences are not passed on');
  }
  const byTool = async (/** @type {string} */ tool, /** @type {any} */ args = {}) => (await kit.call(`measurement_${tool}`, args)).body;
  assert.equal((await byTool('get_ads_report')).avada.field, 'click');
  const shop = await byTool('get_spend_pacing');
  assert.deepEqual(shop.avada, {http_status: 429, code: 'RATE_LIMITED', retry_after: 41, limit: 'shop'});
  assert.match(shop.reason, /store as a whole/);
  assert.match((await byTool('get_product_report')).reason, /30 calls a minute/);
  assert.equal((await byTool('list_campaign_presets')).avada.retry_after, 30, 'Retry-After header is read');
  assert.equal((await byTool('get_feed_status')).avada.code, 'not_found');
  assert.match((await byTool('get_account_overview')).reason, /plan/);
  assert.match((await byTool('get_setup_status')).steps[0], /Connected account/);
  await kit.close();

  const wrongKey = await connect({env: {AVADA_API_KEY: 'avk_live_WRONGWRONGWRONG'}});
  const refused = await wrongKey.call('measurement_list_campaigns');
  assert.equal(refused.body.code, 'key_invalid');
  assert.deepEqual(refused.body.avada, {http_status: 401, code: 'UNAUTHORIZED'});
  assert.ok(!JSON.stringify(refused.body).includes('WRONGWRONG'), 'the refused key is not echoed back');
  await wrongKey.close();

  const down = await connect({env: {AVADA_API_BASE: 'http://127.0.0.1:9'}});
  const offline = await down.call('measurement_get_setup_status');
  assert.equal(offline.body.status, 'could_not_check');
  noNumbers(offline.body);
  await down.close();
});

test('the app embed check: off and unknown are flagged with the fix link, on passes quietly', async () => {
  const fix = 'https://demo.myshopify.com/admin/themes/1/editor?context=apps';
  const embed = (/** @type {boolean|null} */ on) => ({on, state: on ? 'done' : on === false ? 'todo' : 'unknown', reason: on ? null : on === false ? 'embed_off' : 'read_failed', fix: on ? null : fix});
  const kit = await connect({
    avadaAnswers: {
      get_setup_status: [200, {success: true, data: {app_installed: true, ready: false, checks: {app_embed: embed(false)}}}],
      get_tracking_health: [200, {success: true, data: {days: 7, setup: {app_embed: embed(null)}}}],
      get_ads_report: [200, {success: true, data: {app: {roas: 6.78}, setup: {app_embed: embed(true)}}}]
    }
  });
  const off = await kit.call('measurement_get_setup_status');
  assert.equal(off.isError, false);
  assert.deepEqual([off.body.attention.code, off.body.attention.fix], ['app_embed_off', fix]);
  assert.equal(off.body.data.ready, false, 'the data is passed through beside the warning');
  const unknown = await kit.call('measurement_get_tracking_health', {days: 7});
  assert.equal(unknown.body.attention.code, 'app_embed_unknown');
  assert.match(unknown.body.attention.reason, /unknown \(not off\)/);
  const on = await kit.call('measurement_get_ads_report', {});
  assert.equal(on.body.attention, undefined);
  assert.equal(on.body.data.app.roas, 6.78);
  await kit.close();
});

test('measurement tools are read-only and stay available in read-only mode', async () => {
  const kit = await connect({env: {CHATGPT_ADS_READ_ONLY: 'true'}});
  const names = (await kit.client.listTools()).tools.map(t => t.name);
  assert.ok(names.includes('measurement_get_ads_report'));
  await kit.close();
});
