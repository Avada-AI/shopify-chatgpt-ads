import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {test} from 'node:test';
import {ADS_KEY, AVADA_KEY, connect} from './helpers.js';

const WRITE_TOOLS = [
  'create_campaign', 'update_campaign', 'pause_campaign', 'archive_campaign', 'activate_campaign', 'set_budget',
  'create_ad_group', 'update_ad_group', 'pause_ad_group', 'archive_ad_group', 'set_bid',
  'create_ad', 'update_ad', 'pause_ad', 'archive_ad', 'update_feed_products'
];

test('tool list: 33 ads tools and 13 measurement tools; read-only mode offers no write tool', async () => {
  const kit = await connect();
  const all = (await kit.client.listTools()).tools.map(t => t.name);
  assert.equal(all.length, 46);
  assert.equal(all.filter(n => n.startsWith('measurement_')).length, 13);
  for (const name of WRITE_TOOLS) assert.ok(all.includes(name), name);
  await kit.close();

  const ro = await connect({env: {CHATGPT_ADS_READ_ONLY: '1'}});
  const reads = (await ro.client.listTools()).tools;
  assert.equal(reads.length, 30);
  for (const name of WRITE_TOOLS) assert.ok(!reads.some(t => t.name === name), `${name} hidden`);
  assert.ok(reads.every(t => t.annotations?.readOnlyHint === true));
  await assert.rejects(ro.call('create_campaign', {name: 'x', budget_type: 'daily', budget_amount: '5'}), /not found/);
  assert.equal(ro.openai.requests.filter(r => r.method !== 'GET').length, 0, 'nothing written');
  await ro.close();
});

test('activate_campaign: dry run first, confirm needs the matching plan_id, then activates bottom-up', async () => {
  const kit = await connect();
  const dry = await kit.call('activate_campaign', {campaign_id: 'cmpn_feed'});
  assert.equal(dry.body.dry_run, true);
  assert.match(dry.body.plan_id, /^plan_[0-9a-f]{16}$/);
  assert.deepEqual(dry.body.plan.budget, {type: 'daily', amount: '50.00', currency: 'USD', micros: 50000000});
  assert.equal(dry.body.plan.campaign.name, 'Shopping');
  assert.ok(dry.body.previews[0].preview_url.startsWith('https://ads.openai.com/'));
  assert.ok(dry.body.warnings.some((/** @type {string} */ w) => /in review/.test(w)));
  assert.match(dry.body.ask_the_user, /50\.00 USD/);
  const activations = () => kit.openai.requests.filter(r => r.path.endsWith('/activate'));
  assert.equal(activations().length, 0);

  const noPlan = await kit.call('activate_campaign', {campaign_id: 'cmpn_feed', confirm: true});
  assert.equal(noPlan.body.dry_run, true);
  assert.match(noPlan.body.refused, /plan_id/);
  const wrongPlan = await kit.call('activate_campaign', {campaign_id: 'cmpn_feed', confirm: true, plan_id: 'plan_0000000000000000'});
  assert.equal(wrongPlan.body.dry_run, true);
  assert.equal(activations().length, 0);

  const done = await kit.call('activate_campaign', {campaign_id: 'cmpn_feed', confirm: true, plan_id: dry.body.plan_id});
  assert.equal(done.body.activated, true);
  assert.deepEqual(activations().map(r => r.path), ['/ads/ad_1/activate', '/ads/ad_card/activate', '/ad_groups/adgrp_1/activate', '/campaigns/cmpn_feed/activate']);
  assert.equal(kit.openai.store.campaigns.get('cmpn_feed').status, 'active');
  await kit.close();
});

test('activate_campaign: a plan_id goes stale when the budget changes', async () => {
  const kit = await connect();
  const dry = await kit.call('activate_campaign', {campaign_id: 'cmpn_feed'});
  await kit.call('set_budget', {campaign_id: 'cmpn_feed', amount: '40'}); // lowering: direct
  const stale = await kit.call('activate_campaign', {campaign_id: 'cmpn_feed', confirm: true, plan_id: dry.body.plan_id});
  assert.equal(stale.body.dry_run, true);
  assert.notEqual(stale.body.plan_id, dry.body.plan_id);
  assert.equal(kit.openai.requests.filter(r => r.path.endsWith('/activate')).length, 0);
  await kit.close();
});

test('set_budget: lower applies at once; higher or a type switch needs confirm + plan_id', async () => {
  const kit = await connect();
  const budgetWrites = () => kit.openai.requests.filter(r => r.method === 'POST' && r.path === '/campaigns/cmpn_live' && r.body?.budget);
  const lower = await kit.call('set_budget', {campaign_id: 'cmpn_live', amount: '15'});
  assert.equal(lower.body.dry_run, undefined);
  assert.deepEqual(budgetWrites().at(-1)?.body, {budget: {daily_spend_limit_micros: 15000000}});

  const higher = await kit.call('set_budget', {campaign_id: 'cmpn_live', amount: '100', confirm: true});
  assert.equal(higher.body.dry_run, true);
  assert.equal(higher.body.plan.to.amount, '100.00');
  assert.equal(budgetWrites().length, 1);
  const switchType = await kit.call('set_budget', {campaign_id: 'cmpn_live', amount: '1', budget_type: 'lifetime'});
  assert.equal(switchType.body.dry_run, true, 'type switch is gated even when the number is smaller');

  const ok = await kit.call('set_budget', {campaign_id: 'cmpn_live', amount: '100', confirm: true, plan_id: higher.body.plan_id});
  assert.equal(ok.isError, false);
  assert.deepEqual(budgetWrites().at(-1)?.body, {budget: {daily_spend_limit_micros: 100000000}});
  await kit.close();
});

test('set_bid: lowering a fixed bid applies; raising or switching strategy is gated', async () => {
  const kit = await connect();
  const writes = () => kit.openai.requests.filter(r => r.method === 'POST' && r.path === '/ad_groups/adgrp_1');
  const lower = await kit.call('set_bid', {ad_group_id: 'adgrp_1', strategy: 'fixed_bid', max_bid: '1.50'});
  assert.equal(lower.body.dry_run, undefined);
  assert.deepEqual(writes().at(-1)?.body.bidding_config, {billing_event_type: 'click', strategy: 'fixed_bid', max_bid_micros: 1500000, custom_audience_bid_multipliers: []});
  const raise = await kit.call('set_bid', {ad_group_id: 'adgrp_1', strategy: 'fixed_bid', max_bid: '3'});
  assert.equal(raise.body.dry_run, true);
  const toMax = await kit.call('set_bid', {ad_group_id: 'adgrp_1', strategy: 'maximize_clicks'});
  assert.equal(toMax.body.dry_run, true);
  assert.equal(writes().length, 1);
  await kit.call('set_bid', {ad_group_id: 'adgrp_1', strategy: 'maximize_clicks', confirm: true, plan_id: toMax.body.plan_id});
  assert.deepEqual(writes().at(-1)?.body.bidding_config, {billing_event_type: 'click', strategy: 'maximize_clicks', custom_audience_bid_multipliers: []});
  await kit.close();
});

test('keys never appear in answers, errors or the audit log; writes are logged, reads are not', async () => {
  const kit = await connect();
  await kit.call('get_ad_account');
  const leak = await kit.call('get_campaign', {campaign_id: 'cmpn_leak'});
  assert.equal(leak.isError, true);
  assert.match(JSON.stringify(leak.body), /\[redacted\]/);
  await kit.call('create_campaign', {name: 'Logged', budget_type: 'daily', budget_amount: '5'});
  await kit.call('activate_campaign', {campaign_id: 'cmpn_feed'});
  await kit.call('measurement_get_ads_report', {from: '2026-11-01', to: '2026-11-07'});
  for (const answer of kit.transcript) {
    assert.ok(!answer.includes(ADS_KEY), 'OpenAI key leaked');
    assert.ok(!answer.includes(AVADA_KEY), 'Avada key leaked');
  }
  const log = readFileSync(kit.auditPath, 'utf8');
  assert.ok(!log.includes(ADS_KEY) && !log.includes(AVADA_KEY));
  const lines = log.trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(lines.map(l => `${l.phase}:${l.tool}`), ['request:create_campaign', 'result:create_campaign', 'request:activate_campaign', 'result:activate_campaign']);
  assert.equal(lines[3].outcome, 'dry_run');
  assert.ok(lines[1].ids.campaign_id);
  assert.equal(statSync(kit.auditPath).mode & 0o777, 0o600);
  // No tool takes a key as an argument.
  for (const tool of (await kit.client.listTools()).tools) {
    assert.ok(!/key|token|secret/i.test(Object.keys(tool.inputSchema.properties || {}).join(' ')), tool.name);
  }
  await kit.close();
});

test('a write is refused when the audit log cannot be written', async () => {
  const kit = await connect({env: {CHATGPT_ADS_AUDIT_LOG: '/dev/null/cannot/audit.log'}});
  const res = await kit.call('pause_campaign', {campaign_id: 'cmpn_live'});
  assert.equal(res.isError, true);
  assert.equal(res.body.error.code, 'AUDIT_LOG_UNAVAILABLE');
  assert.equal(kit.openai.requests.filter(r => r.method === 'POST').length, 0);
  await kit.close();
});

test('errors map by HTTP status, with retries only where safe', async () => {
  const kit = await connect();
  const cases = [[401, 'KEY_INVALID'], [403, 'NOT_ADMIN'], [409, 'CONFLICT'], [422, 'INVALID_REQUEST']];
  for (const [status, code] of cases) {
    kit.openai.failures.push({status: Number(status), times: 1, path: '/ad_account'});
    const res = await kit.call('list_feeds'); // warm path unaffected
    assert.equal(res.isError, false);
    const failed = await kit.call('get_ad_account');
    assert.equal(failed.body.error.code, code, `HTTP ${status}`);
    assert.equal(failed.body.error.http_status, status);
    assert.ok(failed.body.error.what_to_do);
  }
  // GET: a 500 then success is retried.
  kit.openai.failures.push({status: 500, times: 1, path: '/feeds'});
  assert.equal((await kit.call('list_feeds')).isError, false);
  // A write without an Idempotency-Key is never retried.
  kit.openai.failures.push({status: 503, times: 1, path: '/campaigns/cmpn_live/pause'});
  const pause = await kit.call('pause_campaign', {campaign_id: 'cmpn_live'});
  assert.equal(pause.body.error.code, 'UPSTREAM');
  assert.equal(kit.openai.requests.filter(r => r.path === '/campaigns/cmpn_live/pause').length, 1);
  // A create with a key is retried and still makes one campaign.
  kit.openai.failures.push({status: 502, times: 1, path: '/campaigns'});
  const created = await kit.call('create_campaign', {name: 'Retried', budget_type: 'daily', budget_amount: '5'});
  assert.equal(created.isError, false);
  const posts = kit.openai.requests.filter(r => r.method === 'POST' && r.path === '/campaigns');
  assert.equal(posts.length, 2);
  assert.equal(posts[0].headers['idempotency-key'], posts[1].headers['idempotency-key']);
  // 429 on GET: retried twice, then reported.
  kit.openai.failures.push({status: 429, times: 3, path: '/feeds'});
  assert.equal((await kit.call('list_feeds')).body.error.code, 'RATE_LIMITED');
  await kit.close();
});

test('without OPENAI_ADS_API_KEY the server still starts and says how to fix it', async () => {
  const kit = await connect({env: {OPENAI_ADS_API_KEY: ''}});
  const res = await kit.call('get_ad_account');
  assert.equal(res.body.error.code, 'KEY_MISSING');
  assert.match(res.body.error.what_to_do, /Ads Manager > Settings/);
  assert.equal(kit.openai.requests.length, 0);
  await kit.close();
});
