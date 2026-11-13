import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {connect} from './helpers.js';

/** @type {Awaited<ReturnType<typeof connect>>} */
let kit;
before(async () => {
  kit = await connect();
});
after(() => kit.close());

/** @param {string} method @param {string} path */
const sent = (method, path) => kit.openai.requests.filter(r => r.method === method && r.path === path);

const READS = [
  ['get_ad_account', {}],
  ['list_campaigns', {include_serving_issues: true}],
  ['get_campaign', {campaign_id: 'cmpn_feed', include_children: true}],
  ['list_ad_groups', {campaign_id: 'cmpn_feed'}],
  ['get_ad_group', {ad_group_id: 'adgrp_1'}],
  ['list_ads', {ad_group_id: 'adgrp_1'}],
  ['get_ad', {ad_id: 'ad_1'}],
  ['preview_ad', {ad_id: 'ad_1'}],
  ['get_insights', {from: '2026-11-01', to: '2026-11-07'}],
  ['list_feeds', {}],
  ['list_feed_uploads', {feed_id: 'fd_1'}],
  ['query_feed_products', {feed_id: 'fd_1', filters: [{field: 'price', operator: 'lte', values: ['100']}]}],
  ['list_pixels', {}],
  ['list_recent_conversion_events', {pixel_id: '1345'}],
  ['list_conversion_event_settings', {}],
  ['search_locations', {query: 'California'}],
  ['list_audit_logs', {campaign_id: 'cmpn_live', since: '2026-11-01'}]
];

test('every read tool answers from the fake OpenAI', async () => {
  for (const [name, args] of READS) {
    const {body, isError} = await kit.call(/** @type {string} */ (name), /** @type {any} */ (args));
    assert.equal(isError, false, `${name}: ${JSON.stringify(body)}`);
  }
});

test('reads present money in the account currency beside the raw micros', async () => {
  const {body} = await kit.call('list_campaigns');
  const live = body.campaigns.find((/** @type {any} */ c) => c.id === 'cmpn_live');
  assert.deepEqual(live.budget_display, {type: 'daily', amount: '20.00', currency: 'USD', micros: 20000000});
  assert.equal(live.budget.daily_spend_limit_micros, 20000000);
});

test('archived ad groups are hidden unless asked (they stay in OpenAI lists)', async () => {
  const shown = (await kit.call('list_ad_groups', {campaign_id: 'cmpn_feed'})).body.ad_groups.map((/** @type {any} */ g) => g.id);
  assert.deepEqual(shown, ['adgrp_1']);
  const all = (await kit.call('list_ad_groups', {campaign_id: 'cmpn_feed', include_archived: true})).body.ad_groups;
  assert.equal(all.length, 2);
});

test('preview_ad returns the link inside the iframe', async () => {
  const {body} = await kit.call('preview_ad', {ad_id: 'ad_1'});
  assert.equal(body.preview_url, 'https://ads.openai.com/preview/ad_1?sig=abc&exp=1');
});

test('insights always send explicit attribution settings and a date range', async () => {
  await kit.call('get_insights', {scope: 'campaign', id: 'cmpn_live', from: '2026-11-01', to: '2026-11-07', click_window_days: 7, view_window_days: 0});
  const q = sent('GET', '/campaigns/cmpn_live/insights').at(-1)?.query;
  assert.equal(q?.get('attribution_window_days'), '7');
  assert.equal(q?.get('view_through_attribution_window_days'), '0');
  assert.equal(q?.get('attribution_time_basis'), 'ad_event_time');
  assert.deepEqual(JSON.parse(q?.get('time_ranges[]') || ''), {type: 'date_range', since: '2026-11-01', until: '2026-11-07'});
  assert.ok(q?.getAll('fields[]').includes('campaign.spend'));
  const {body} = await kit.call('get_insights', {from: '2026-11-01', to: '2026-11-07', breakdown: 'country'});
  const fields = sent('GET', '/ad_account/insights').at(-1)?.query.getAll('fields[]');
  assert.ok(fields?.includes('country.name') && fields.includes('country.spend'));
  assert.ok(!fields?.includes('conversions'), 'segments carry delivery metrics only');
  assert.equal(body.currency, 'USD');
});

test('insights fall back without sales fields before the date OpenAI names, and say so', async () => {
  const {body, isError} = await kit.call('get_insights', {from: '2026-03-01', to: '2026-03-31'});
  assert.equal(isError, false);
  assert.match(body.notes[0], /only from 2026-04-15/);
  const last = sent('GET', '/ad_account/insights').at(-1)?.query.getAll('fields[]');
  assert.ok(!last?.includes('order_created_roas'));
});

test('insights refuse more than 365 days and a reversed range without calling OpenAI', async () => {
  const before = kit.openai.requests.length;
  assert.equal((await kit.call('get_insights', {from: '2025-01-01', to: '2026-11-01'})).isError, true);
  assert.equal((await kit.call('get_insights', {from: '2026-11-02', to: '2026-11-01'})).isError, true);
  assert.equal(kit.openai.requests.length, before);
});

test('create_campaign: paused, micros, idempotency key, oppref refused', async () => {
  const args = {name: 'Spring shoes', budget_type: 'daily', budget_amount: '50', objective: 'clicks', location_ids: ['1000232'], query_string_template: 'utm_source=chatgpt&utm_medium=cpc'};
  const first = await kit.call('create_campaign', {...args, status: 'active'});
  assert.equal(first.isError, false, JSON.stringify(first.body));
  const post = sent('POST', '/campaigns').at(-1);
  assert.equal(post?.body.status, 'paused', 'status from the agent is ignored');
  assert.deepEqual(post?.body.budget, {daily_spend_limit_micros: 50000000});
  assert.deepEqual(post?.body.targeting, {locations: {include: [{id: '1000232'}]}});
  assert.match(String(post?.headers['idempotency-key']), /^cak-campaign-[0-9a-f]{40}$/);
  const again = await kit.call('create_campaign', args);
  assert.equal(again.body.campaign.id, first.body.campaign.id, 'same request, same campaign');
  const bad = await kit.call('create_campaign', {...args, query_string_template: 'utm_source=x&oppref={oppref}'});
  assert.equal(bad.isError, true);
  assert.equal(bad.body.error.code, 'INVALID_INPUT');
  const conv = await kit.call('create_campaign', {...args, objective: 'conversions'});
  assert.match(conv.body.error.message, /conversion_event_setting_id/);
});

test('create_ad_group and create_ad: paused, idempotency keys, image uploaded first', async () => {
  const group = await kit.call('create_ad_group', {campaign_id: 'cmpn_feed', name: 'Under 100', strategy: 'maximize_clicks', product_filters: [{field: 'price', operator: 'lte', values: ['100']}]});
  assert.equal(group.isError, false, JSON.stringify(group.body));
  const g = sent('POST', '/ad_groups').at(-1);
  assert.equal(g?.body.status, 'paused');
  assert.deepEqual(g?.body.bidding_config, {billing_event_type: 'click', strategy: 'maximize_clicks'});
  assert.deepEqual(g?.body.product_set, {product_feed_id: 'fd_1', filters: [{field: 'price', operator: 'lte', values: ['100']}]});
  assert.ok(g?.headers['idempotency-key']);
  const fixed = await kit.call('create_ad_group', {campaign_id: 'cmpn_live', name: 'Fixed', strategy: 'fixed_bid', max_bid: '1.25'});
  assert.equal(sent('POST', '/ad_groups').at(-1)?.body.bidding_config.max_bid_micros, 1250000);
  assert.equal(fixed.body.ad_group.max_bid_display.amount, '1.25');
  assert.equal((await kit.call('create_ad_group', {campaign_id: 'cmpn_live', name: 'Bad', strategy: 'fixed_bid'})).isError, true);

  const uploadsBefore = sent('POST', '/upload').length;
  const ad = await kit.call('create_ad', {ad_group_id: group.body.ad_group.id, name: 'Card', type: 'chat_card', title: 'Trail shoes', body: 'Made for rocky trails', target_url: 'https://shop.example/trail', image_url: 'https://cdn.shopify.com/a.png', status: 'active'});
  assert.equal(ad.isError, false, JSON.stringify(ad.body));
  assert.equal(sent('POST', '/upload').length, uploadsBefore + 1);
  const a = sent('POST', '/ads').at(-1);
  assert.equal(a?.body.status, 'paused');
  assert.match(String(a?.body.creative.file_id), /^file_/);
  assert.ok(a?.headers['idempotency-key']);
  const http = await kit.call('create_ad', {ad_group_id: 'adgrp_1', name: 'Card', type: 'chat_card', title: 'Trail shoes', body: 'x', target_url: 'http://shop.example', file_id: 'file_1'});
  assert.equal(http.isError, true);
  const template = await kit.call('create_ad', {ad_group_id: 'adgrp_1', name: 'Template 2', type: 'product_ad_template'});
  assert.deepEqual(sent('POST', '/ads').at(-1)?.body.creative, {type: 'product_ad_template', title: '{{product.title}}', body: '{{product.body}}', price: '{{product.price}}'});
  assert.equal(template.isError, false);
});

test('updates never carry status or budget, and keep targeting not mentioned', async () => {
  const res = await kit.call('update_campaign', {campaign_id: 'cmpn_live', name: 'Renamed', status: 'active', budget: {daily_spend_limit_micros: 1}, excluded_location_ids: ['2000043']});
  assert.equal(res.isError, false, JSON.stringify(res.body));
  const body = sent('POST', '/campaigns/cmpn_live').at(-1)?.body;
  assert.equal(body.status, undefined);
  assert.equal(body.budget, undefined);
  assert.deepEqual(body.targeting, {locations: {include: [{id: '1000232'}]}, excluded_locations: {include: [{id: '2000043'}]}, platforms: {included: ['web']}});
  await kit.call('update_ad_group', {ad_group_id: 'adgrp_1', context_hints: ['trail running'], status: 'active'});
  assert.deepEqual(sent('POST', '/ad_groups/adgrp_1').at(-1)?.body, {context_hints: ['trail running']});
  await kit.call('update_ad', {ad_id: 'ad_card', title: 'New title', status: 'active'});
  assert.deepEqual(sent('POST', '/ads/ad_card').at(-1)?.body, {creative: {type: 'chat_card', title: 'New title', body: 'Made for rocks', target_url: 'https://shop.example/trail', file_id: 'file_9'}});
});

test('pause applies directly; archive asks first, then archives', async () => {
  for (const [name, path] of [['pause_ad', '/ads/ad_card/pause'], ['pause_ad_group', '/ad_groups/adgrp_old/pause'], ['pause_campaign', '/campaigns/cmpn_live/pause']]) {
    const arg = name.endsWith('_ad') ? {ad_id: 'ad_card'} : name.includes('group') ? {ad_group_id: 'adgrp_old'} : {campaign_id: 'cmpn_live'};
    assert.equal((await kit.call(name, arg)).isError, false);
    assert.equal(sent('POST', path).length, 1, name);
  }
  const created = await kit.call('create_campaign', {name: 'To archive', budget_type: 'lifetime', budget_amount: '10'});
  const ad = await kit.call('create_ad', {ad_group_id: 'adgrp_1', name: 'To archive', type: 'chat_card', title: 'Abc', body: 'x', target_url: 'https://a.example', file_id: 'file_1'});
  assert.equal((await kit.approve('archive_ad', {ad_id: ad.body.ad.id})).isError, false);
  assert.equal((await kit.approve('archive_ad_group', {ad_group_id: 'adgrp_1'})).body.ad_group.status, 'archived');
  kit.openai.store.groups.get('adgrp_1').status = 'paused';
  assert.equal((await kit.approve('archive_campaign', {campaign_id: created.body.campaign.id})).body.campaign.status, 'archived');
  assert.equal((await kit.call('archive_campaign', {campaign_id: created.body.campaign.id})).body.already_archived, true);
});

test('Delta API: minor units, one request, 422 explained as nothing applied', async () => {
  const ok = await kit.approve('update_feed_products', {feed_id: 'fd_1', products: [{product_id: 'p1', variants: [{variant_id: 'v1', price: '79.99', currency: 'USD'}, {variant_id: 'v2', availability: 'out_of_stock'}]}]});
  assert.equal(ok.body.accepted, true);
  assert.deepEqual(sent('PATCH', '/feeds/fd_1/products').at(-1)?.body, {products: [{id: 'p1', variants: [{id: 'v1', price: {amount: 7999, currency: 'USD'}}, {id: 'v2', availability: {status: 'out_of_stock'}}]}]});
  const unknown = await kit.call('update_feed_products', {feed_id: 'fd_1', products: [{product_id: 'p1', variants: [{variant_id: 'v1', availability: 'in_stock'}, {variant_id: 'v404', availability: 'in_stock'}]}]});
  assert.equal(unknown.isError, true);
  assert.equal(unknown.body.error.http_status, 422);
  assert.match(unknown.body.error.message, /v404.*NOTHING was applied/);
  const noCurrency = await kit.call('update_feed_products', {feed_id: 'fd_1', products: [{product_id: 'p1', variants: [{variant_id: 'v1', price: '70'}]}]});
  assert.match(noCurrency.body.error.message, /needs currency/);
});

test('ids cannot reach other endpoints through the path', async () => {
  const res = await kit.call('get_campaign', {campaign_id: '../ad_account'});
  assert.equal(res.isError, true);
});

test('recent pixel events: types, channels, times and counts only, never the payload', async () => {
  const {body} = await kit.call('list_recent_conversion_events', {pixel_id: '1345'});
  assert.equal(body.total, 2);
  assert.deepEqual(body.by_event_type, {checkout_started: 1, custom: 1});
  assert.deepEqual(body.by_channel, {pixel_sdk: 2});
  const text = JSON.stringify(body);
  assert.ok(!text.includes('event_data_json') && !text.includes('8900') && !text.includes('SYSTEM'), text);
  assert.equal(body.events[1].custom_event_name, '[not shown]', 'free text is not passed on');
});
