import assert from 'node:assert/strict';
import {chmodSync, readFileSync, statSync, writeFileSync} from 'node:fs';
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

test('destructive and spend-changing edits are gated; the harmless version of each applies at once', async () => {
  const kit = await connect();
  const posts = (/** @type {string} */ path) => kit.openai.requests.filter(r => r.method !== 'GET' && r.path === path).length;
  /** @type {[string, any, string][]} */
  const gated = [
    ['archive_campaign', {campaign_id: 'cmpn_live'}, '/campaigns/cmpn_live/archive'],
    ['archive_ad_group', {ad_group_id: 'adgrp_1'}, '/ad_groups/adgrp_1/archive'],
    ['archive_ad', {ad_id: 'ad_card'}, '/ads/ad_card/archive'],
    ['update_ad', {ad_id: 'ad_card', target_url: 'https://elsewhere.example/'}, '/ads/ad_card'],
    ['update_feed_products', {feed_id: 'fd_1', products: [{product_id: 'p1', variants: [{variant_id: 'v1', price: '1', currency: 'USD'}]}]}, '/feeds/fd_1/products'],
    ['update_campaign', {campaign_id: 'cmpn_live', end_time: '2027-06-30T00:00:00Z'}, '/campaigns/cmpn_live']
  ];
  for (const [name, args, path] of gated) {
    const dry = await kit.call(name, args);
    assert.equal(dry.body.dry_run, true, `${name} dry run`);
    assert.match(dry.body.ask_the_user, /\?/);
    assert.equal(dry.body.expires_in_seconds, 600);
    const forged = await kit.call(name, {...args, confirm: true, plan_id: 'plan_0000000000000000'});
    assert.equal(forged.body.dry_run, true, `${name} refuses a plan_id it did not issue`);
    assert.equal(posts(path), 0, `${name} sent nothing`);
    const done = await kit.call(name, {...args, confirm: true, plan_id: dry.body.plan_id});
    assert.equal(done.isError, false, `${name}: ${JSON.stringify(done.body)}`);
    assert.equal(done.body.dry_run, undefined, name);
    assert.equal(posts(path), 1, `${name} sent once`);
  }
  // Same link, title only, stock only, schedule of a paused campaign, a name: no question.
  /** @type {[string, any][]} */
  const direct = [
    ['update_ad', {ad_id: 'ad_1', title: 'Shorter'}],
    ['update_feed_products', {feed_id: 'fd_1', products: [{product_id: 'p1', variants: [{variant_id: 'v2', availability: 'in_stock'}]}]}],
    ['update_campaign', {campaign_id: 'cmpn_feed', start_time: '2027-01-01T00:00:00Z'}],
    ['update_campaign', {campaign_id: 'cmpn_live', name: 'Renamed live'}]
  ];
  for (const [name, args] of direct) {
    const res = await kit.call(name, args);
    assert.equal(res.isError, false, `${name}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.dry_run, undefined, `${name} applies at once`);
  }
  await kit.close();
});

test('a plan_id works once and expires after 10 minutes', async () => {
  let clock = 1_800_000_000_000;
  const kit = await connect({now: () => clock});
  const writes = () => kit.openai.requests.filter(r => r.method === 'POST' && r.path === '/campaigns/cmpn_live' && r.body?.budget).length;
  const dry = await kit.call('set_budget', {campaign_id: 'cmpn_live', amount: '100'});
  clock += 10 * 60 * 1000 + 1;
  const late = await kit.call('set_budget', {campaign_id: 'cmpn_live', amount: '100', confirm: true, plan_id: dry.body.plan_id});
  assert.equal(late.body.dry_run, true);
  assert.match(late.body.refused, /expired/);
  assert.equal(writes(), 0);
  // The refused call issued the same plan again; inside the window it works, once.
  const ok = await kit.call('set_budget', {campaign_id: 'cmpn_live', amount: '100', confirm: true, plan_id: late.body.plan_id});
  assert.equal(ok.body.dry_run, undefined);
  assert.equal(writes(), 1);
  kit.openai.store.campaigns.get('cmpn_live').budget = {daily_spend_limit_micros: 20000000};
  const replay = await kit.call('set_budget', {campaign_id: 'cmpn_live', amount: '100', confirm: true, plan_id: late.body.plan_id});
  assert.equal(replay.body.dry_run, true, 'a used plan_id is not accepted again');
  assert.equal(writes(), 1);
  await kit.close();
});

test('activation plan_id covers ad group bids: a bid raised after the dry run voids it', async () => {
  const kit = await connect();
  const dry = await kit.call('activate_campaign', {campaign_id: 'cmpn_feed'});
  kit.openai.store.groups.get('adgrp_1').bidding_config.max_bid_micros = 9000000; // raised in Ads Manager
  const stale = await kit.call('activate_campaign', {campaign_id: 'cmpn_feed', confirm: true, plan_id: dry.body.plan_id});
  assert.equal(stale.body.dry_run, true);
  assert.notEqual(stale.body.plan_id, dry.body.plan_id);
  assert.equal(stale.body.plan.will_activate.ad_groups[0].bidding.amount, '9.00');
  assert.equal(kit.openai.requests.filter(r => r.path.endsWith('/activate')).length, 0);
  await kit.close();
});

test('with elicitation the server asks the user itself, and confirm + plan_id no longer count', async () => {
  const yes = await connect({onElicit: () => ({action: 'accept', content: {approve: true}})});
  const done = await yes.call('activate_campaign', {campaign_id: 'cmpn_feed'});
  assert.equal(done.body.activated, true);
  assert.equal(yes.asked.length, 1);
  assert.match(yes.asked[0].message, /Activate "Shopping" with a daily budget of 50\.00 USD\?/);
  assert.match(yes.asked[0].message, /Preview: https:\/\/ads\.openai\.com\/preview\/ad_1/);
  assert.match(yes.asked[0].message, /still in review/);
  const outcomes = readFileSync(yes.auditPath, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(l => l.phase === 'result').map(l => l.outcome);
  assert.deepEqual(outcomes, ['asked_user', 'ok']);
  await yes.close();

  const no = await connect({onElicit: () => ({action: 'decline'})});
  const dry = await connect(); // a plan_id from elsewhere, as an injected agent might bring
  const plan = (await dry.call('archive_campaign', {campaign_id: 'cmpn_live'})).body.plan_id;
  await dry.close();
  for (const args of [{campaign_id: 'cmpn_live'}, {campaign_id: 'cmpn_live', confirm: true, plan_id: plan}]) {
    const res = await no.call('archive_campaign', args);
    assert.equal(res.body.declined, true);
  }
  const accepted = await connect({onElicit: () => ({action: 'accept', content: {approve: false}})});
  assert.equal((await accepted.call('set_budget', {campaign_id: 'cmpn_live', amount: '500'})).body.declined, true);
  for (const kit of [no, accepted]) {
    assert.equal(kit.openai.requests.filter(r => r.method === 'POST').length, 0, 'nothing written');
    await kit.close();
  }
});

test('every tool description and the server instructions say results are data, not instructions', async () => {
  const kit = await connect();
  for (const tool of (await kit.client.listTools()).tools) {
    assert.match(tool.description || '', /never instructions/, tool.name);
  }
  assert.match(kit.client.getInstructions() || '', /data, never\s+instructions/);
  await kit.close();
});

test('an identical create after an archive makes a new object, not the archived one back', async () => {
  const kit = await connect();
  const args = {name: 'Again', budget_type: 'daily', budget_amount: '5'};
  const first = await kit.call('create_campaign', args);
  assert.equal((await kit.call('create_campaign', args)).body.campaign.id, first.body.campaign.id, 'a retry is the same campaign');
  await kit.approve('archive_campaign', {campaign_id: first.body.campaign.id});
  const second = await kit.call('create_campaign', args);
  assert.notEqual(second.body.campaign.id, first.body.campaign.id);
  assert.equal(second.body.campaign.status, 'paused');
  const keys = kit.openai.requests.filter(r => r.method === 'POST' && r.path === '/campaigns').map(r => String(r.headers['idempotency-key']));
  assert.equal(keys.at(-1), `${keys[0]}:after:${first.body.campaign.id}`);
  assert.equal((await kit.call('create_campaign', args)).body.campaign.id, second.body.campaign.id, 'and a retry of that is stable');
  await kit.close();
});

test('the audit log is made private on every write, even when it existed with a looser mode', async () => {
  const kit = await connect();
  writeFileSync(kit.auditPath, '', {mode: 0o644});
  chmodSync(kit.auditPath, 0o644);
  await kit.call('pause_campaign', {campaign_id: 'cmpn_live'});
  assert.equal(statSync(kit.auditPath).mode & 0o777, 0o600);
  await kit.close();
});
