#!/usr/bin/env node
// Read-only check of the kit against the real OpenAI Ads API.
//
//   OPENAI_ADS_API_KEY_FILE=/path/to/key.txt node scripts/live-readonly.js
//   (or OPENAI_ADS_API_KEY in the environment)
//
// Safety: the server runs in read-only mode (no write tool exists), and every request goes
// through a guard that refuses anything but GET and the product query POST. Nothing is
// created, changed, previewed or archived. Prints counts and error codes, never the key or ids.

import {readFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import {readConfig} from '../src/config.js';
import {createServer} from '../src/server.js';

const key = (process.env.OPENAI_ADS_API_KEY_FILE ? readFileSync(process.env.OPENAI_ADS_API_KEY_FILE, 'utf8') : process.env.OPENAI_ADS_API_KEY || '').trim();
if (!key) {
  process.stderr.write('Set OPENAI_ADS_API_KEY_FILE or OPENAI_ADS_API_KEY.\n');
  process.exit(2);
}

/** @type {typeof fetch} */
const guardedFetch = (input, init = {}) => {
  const method = (init.method || 'GET').toUpperCase();
  const path = new URL(String(input)).pathname;
  if (method !== 'GET' && !(method === 'POST' && /^\/v1\/feeds\/[^/]+\/products\/query$/.test(path))) {
    throw new Error(`live-readonly guard refused ${method} ${path}`);
  }
  return fetch(input, init);
};

const config = readConfig({
  OPENAI_ADS_API_KEY: key,
  CHATGPT_ADS_READ_ONLY: '1',
  CHATGPT_ADS_AUDIT_LOG: join(mkdtempSync(join(tmpdir(), 'cak-live-')), 'audit.log')
});
const server = createServer(config, {fetch: guardedFetch});
const [a, b] = InMemoryTransport.createLinkedPair();
await server.connect(a);
const client = new Client({name: 'live-readonly', version: '0'});
await client.connect(b);

let failures = 0;
/**
 * @param {string} name
 * @param {Record<string, unknown>} args
 * @param {(body: any) => string} summary
 */
async function check(name, args, summary) {
  const res = /** @type {any} */ (await client.callTool({name, arguments: args}));
  const body = res.structuredContent;
  const text = JSON.stringify(res);
  if (text.includes(key)) throw new Error(`${name}: the key appeared in the answer`);
  if (res.isError) {
    failures++;
    process.stdout.write(`  ${name}: ERROR ${body?.error?.code} ${body?.error?.http_status ?? ''} ${String(body?.error?.message || '').slice(0, 120)}\n`);
    return null;
  }
  process.stdout.write(`  ${name}: ok ${summary(body)}\n`);
  return body;
}

const day = (/** @type {number} */ offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
process.stdout.write(`Live read-only check, ${new Date().toISOString()}\n`);
const tools = (await client.listTools()).tools;
process.stdout.write(`  tools offered in read-only mode: ${tools.length}\n`);
const account = await check('get_ad_account', {}, b => `currency ${b.account.currency_code}, timezone ${b.account.timezone}, status ${b.account.status}`);
const campaigns = await check('list_campaigns', {include_serving_issues: true}, b => `${b.campaigns.length} campaigns, statuses ${[...new Set(b.campaigns.map((/** @type {any} */ c) => c.status))].join('/') || '-'}, budget_display ${b.campaigns[0]?.budget_display ? 'present' : 'n/a'}`);
const first = campaigns?.campaigns?.[0];
if (first) await check('get_campaign', {campaign_id: first.id, include_children: true}, b => `${b.ad_groups.length} live ad groups, ${b.ad_groups.reduce((/** @type {number} */ n, /** @type {any} */ g) => n + (g.ads?.length || 0), 0)} live ads`);
await check('get_insights', {from: day(7), to: day(1), granularity: 'none'}, b => `${b.rows.length} rows, attribution ${b.attribution.attribution_window_days}/${b.attribution.view_through_attribution_window_days}/${b.attribution.attribution_time_basis}, notes ${b.notes.length}`);
await check('get_insights', {from: day(7), to: day(1), granularity: 'none', breakdown: 'country'}, b => `${b.rows.length} country rows`);
const feeds = await check('list_feeds', {}, b => `${b.feeds.length} feeds`);
await check('list_feed_uploads', {}, b => `${b.uploads.length} uploads, statuses ${[...new Set(b.uploads.map((/** @type {any} */ u) => u.status))].join('/') || '-'}`);
const fullest = feeds?.feeds?.slice().sort((/** @type {any} */ x, /** @type {any} */ y) => (y.product_count || 0) - (x.product_count || 0))[0];
if (fullest) await check('query_feed_products', {feed_id: fullest.feed_id, limit: 3}, b => `total ${b.total_count}, matched ${b.matched_count}`);
const pixels = await check('list_pixels', {}, b => `${(b.data || []).length} pixels`);
if (pixels?.data?.[0]?.pixel_id) await check('list_recent_conversion_events', {pixel_id: pixels.data[0].pixel_id}, b => `${b.events.length} events in the window`);
await check('list_conversion_event_settings', {}, b => `${b.data.length} settings`);
await check('search_locations', {query: 'California', limit: 3}, b => `${(b.results || []).length} results, types ${[...new Set((b.results || []).map((/** @type {any} */ r) => r.type))].join('/')}`);
await check('list_audit_logs', {limit: 5}, b => `${(b.data || []).length} entries`);
await client.close();
process.stdout.write(`Done: ${failures} tool(s) answered an error. Currency ${account?.account?.currency_code ?? 'unknown'}. Nothing was written.\n`);
