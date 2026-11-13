import assert from 'node:assert/strict';
import {test} from 'node:test';
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

test('with a key: POST <base>/data/v1/<tool> with bearer auth, data passed through, marked preview', async () => {
  const kit = await connect();
  const res = await kit.call('measurement_get_ads_report', {from: '2026-11-01', to: '2026-11-07', click: 7});
  assert.equal(res.isError, false);
  assert.equal(res.body.contract, 'preview');
  assert.equal(res.body.data.true_roas, 3.2);
  const req = kit.avada.requests.at(-1);
  assert.equal(req?.path, '/data/v1/get_ads_report');
  assert.deepEqual(req?.body, {from: '2026-11-01', to: '2026-11-07', click: 7});
  assert.equal(req?.auth, `Bearer ${AVADA_KEY}`);
  await kit.close();
});

test('app not installed, embed off, revoked key, not live, rate limit and outage are explained', async () => {
  const kit = await connect({
    avadaAnswers: {
      get_setup_status: [404, {success: false, error: {code: 'app_not_installed', message: 'Shop has no Avada install'}}],
      get_tracking_health: [409, {success: false, error: {code: 'app_embed_off'}}],
      get_feed_status: [404, {}],
      list_alerts: [429, {}],
      get_spend_pacing: [500, {success: false}],
      get_account_overview: [200, {success: true, data: {app_embed_enabled: false, store: 'x.myshopify.com'}}]
    }
  });
  const install = await kit.call('measurement_get_setup_status');
  assert.equal(install.body.code, 'app_not_installed');
  noNumbers(install.body);
  const embed = await kit.call('measurement_get_tracking_health', {days: 7});
  assert.equal(embed.body.code, 'app_embed_off');
  assert.match(embed.body.steps[0], /App embeds/);
  assert.equal((await kit.call('measurement_get_feed_status')).body.code, 'not_live');
  assert.equal((await kit.call('measurement_list_alerts')).body.status, 'could_not_check');
  assert.equal((await kit.call('measurement_get_spend_pacing')).body.code, 'could_not_check');
  const warned = await kit.call('measurement_get_account_overview');
  assert.equal(warned.isError, false);
  assert.equal(warned.body.attention.code, 'app_embed_off');
  await kit.close();

  const wrongKey = await connect({env: {AVADA_API_KEY: 'avk_live_WRONGWRONGWRONG'}});
  const refused = await wrongKey.call('measurement_list_campaigns');
  assert.equal(refused.body.code, 'key_invalid');
  assert.ok(!JSON.stringify(refused.body).includes('WRONGWRONG'), 'the refused key is not echoed back');
  await wrongKey.close();

  const down = await connect({env: {AVADA_API_BASE: 'http://127.0.0.1:9'}});
  const offline = await down.call('measurement_get_setup_status');
  assert.equal(offline.body.status, 'could_not_check');
  noNumbers(offline.body);
  await down.close();
});

test('measurement tools are read-only and stay available in read-only mode', async () => {
  const kit = await connect({env: {CHATGPT_ADS_READ_ONLY: 'true'}});
  const names = (await kit.client.listTools()).tools.map(t => t.name);
  assert.ok(names.includes('measurement_get_ads_report'));
  await kit.close();
});
