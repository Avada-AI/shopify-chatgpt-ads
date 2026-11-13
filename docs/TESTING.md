# What was tested, and what was not

## v0.2.0: MCP server and the `chatgpt-ads-*` skills (2026-11-13)

### Automated (`npm run check`)

- ESLint and `tsc --checkJs` over `src/`, `test/` and `scripts/`: clean.
- `node --test`: 34 tests, all passing on Node.js 26 (CI runs Node.js 22 and 24 once pushed). They run the real server against a fake OpenAI Ads API and a fake Avada API (`test/fakes.js`), whose shapes follow OpenAI's documented examples and Avada's measurements:
  - every read tool; money in micros and minor units (USD, EUR, VND, JPY, KWD, HUF); idempotency keys; error codes by HTTP status (401, 403 admin, 404, 409, 413, 422, 429, 5xx) with `server_error` bodies on 4xx; retries for reads and keyed creates only;
  - safety: creates paused even when the agent asks for active; updates never carry status or budget; `activate_campaign`, `set_budget`, `set_bid` refuse without `confirm` and the current `plan_id`, and a plan goes stale when the budget changes; activation order ads -> ad groups -> campaign; read-only mode registers 30 read tools and no write tool; the audit log gets a request and a result line per write, none for reads, mode 600, and a write is refused when the log cannot be written; keys never appear in answers, errors or the log, even when the upstream echoes the bearer token;
  - Delta API: minor units, one request, a 422 explained as nothing applied;
  - measurement proxy: without a key (no call, steps, no numbers), with a key, app not installed, app embed off (error and warning forms), revoked key (not echoed), 404, 429, 500, network failure, read-only mode;
  - end to end: the official MCP client (`@modelcontextprotocol/client` 2.4.0) starts `src/cli.js` over stdio, lists 46 tools and calls `get_ad_account`; stderr says the key is set and never prints it.
- `claude plugin validate .` (Claude Code 2.1.323): passed, with directory-listing warnings (no icon).

### Live, read-only (`npm run live:readonly`, 2026-11-13)

Against Avada's probe ad account (currency VND, no payment method). Server in read-only mode and a guard that refuses any request but GET and the product query POST. All 13 tool calls answered: account, 2 campaigns with `budget_display`, a campaign tree (1 live ad group, 1 live ad), Insights totals and a country breakdown (0 rows: no delivery), 5 feeds, upload history (empty), a product query (102 of 102), 2 pixels, recent events (0 in the window), 12 conversion event settings, location search, 5 audit log entries. Finding fixed the same day: feeds are listed with `feed_id`, not `id` (fact A15). Nothing was created, changed or previewed.

### Not tested in v0.2.0

- **No write against a real ad account** from this kit: create, edit, pause, archive, activate, budget, bid and Delta calls were tested against the fake only. Their bodies follow the docs and the shapes Avada measured on its own app (fact sheet A).
- **Avada's Measurement API** is a preview contract; the proxy was tested against a fake only.
- **Install paths not run:** plugin install from GitHub (including Claude Code's dependency install from `package-lock.json`), `npx` (not published), Codex, Cursor, the `skills` CLI with the new skills.
- **No skill was run inside an agent** end to end.
- Node.js 20 and Windows were not run.

## v0.1.0: the three read-only skills

Date of this record: **2026-11-11**. Version: 0.1.0.

Short version: the field names, queries and manifests were checked against documentation, a schema validator and public pages. **No skill has been run end to end on a live store, on an ad account, or inside an agent.** Treat every query as unproven until the checklist at the end has been done.

## Verified

### Against vendor documentation (fetched on 2026-11-11)

Each page was downloaded as its Markdown twin and read. The facts taken from them are in `references/chatgpt-facts.md`.

- shopify.dev: the ShopifyQL `sessions` and `sales` schemas, the `WHERE`, `WITH` and `SINCE/UNTIL/DURING` syntax pages, the `shopifyqlQuery` query, `Order`, `CustomerJourneySummary`, `CustomerVisit`, `UTMParameters`, `OrderAttribution`, the `orders` and `products` queries, `Product`, `ProductVariant`, `ShopPolicy`, the CLI pages `store auth` and `store execute`, web pixels (sandbox), the Web Pixels API (`checkout_completed`, `browser`, `init`), the Customer Privacy API, the theme templates `agents.md.liquid`, `llms.txt.liquid`, `robots.txt.liquid`, and the Liquid filter `structured_data`.
- developers.openai.com: Measurement Pixel, Conversion Tracking, Conversions API, Supported Events, Multiple Pixel IDs, Image Tag, Conversion Setup reference, Campaign Management (tracking parameters), the product feed field spec, and the crawler overview.
- The ISO 4217 currency list (published 2026-09-17) for minor units.
- help.shopify.com (agentic storefronts, Thank you page upgrade) and the App Store listing of OpenAI's app were read through a page summary, not as raw text.

### Admin GraphQL documents: schema validation

Every GraphQL document printed in a skill was extracted from the `SKILL.md` and checked with the schema validator bundled in Shopify's AI Toolkit (it validated against Admin API 2026-07). All passed:

| Document | Skill | Scopes the validator reported |
|---|---|---|
| `RunShopifyQL` | traffic report | `read_reports` |
| `OrderJourneys` | traffic report | `read_orders` |
| `ReadinessCounts`, `ReadinessProducts` | store readiness | `read_products` |

The paged `orders` query described in step 8 of the traffic report, and the `shopPolicies` query (`read_legal_policies`), passed the same validator in a longer form.

This proves the GraphQL is well formed and the fields exist. It does **not** check the ShopifyQL text inside the `q` variable.

### Shopify CLI

`shopify store auth --help` and `shopify store execute --help` were read on a locally installed CLI. The flags used in the skills (`--store`, `--scopes`, `--query`, `--query-file`, `--variables`, `--variable-file`, `--json`) exist, and mutations need `--allow-mutations`. No command was run against a store.

### Public storefront checks

Run with `curl` and the macOS system `grep` (BSD grep 2.6.0) against three large public Shopify stores:

- Home page HTML: `webPixelsConfigList` present, with `"type":"APP"` / `"type":"CUSTOM"` entries and names on custom pixels; app block comments present; a `GTM-` id present; the tag manager container downloaded and searched.
- `/robots.txt`, `/agents.md`, `/llms.txt`: all 200. The three default robots files named no OpenAI crawler.
- On one store: a product page (two JSON-LD blocks, one `Product` with `offers`), `/products.json`, `/products/<handle>.js` (has `barcode`), the five `/policies/...` URLs (all 200), a product page requested with the `OAI-SearchBot` user agent (200), and a product URL with `?oppref=tracking-check-test` (the final URL kept the parameter).

**None of those stores had OpenAI's pixel in its page source.** The patterns that find the pixel (`oaiq(`, `bzrcdn.openai.com`, the image tag, the app block around it) were tested only on a hand-made page that contains OpenAI's documented snippet.

### Packaging

- `claude plugin validate .` (Claude Code 2.1.322): "Validation passed" for the plugin and the marketplace file. One warning: no icon.
- `npx skills add <local path> --list` (the `skills` CLI, Node 26): found the three skills. An install into an empty scratch project copied `skills/<name>/SKILL.md` for each skill and nothing else. So `references/chatgpt-facts.md` is **not** installed by this path.
- Root `plugin.json`: checked by hand against the Agent Plugins 1.0.0 schema file (required keys, no unknown keys, name pattern). Not run through a JSON Schema validator.
- Front matter: `name` matches the folder, descriptions are under 1,024 characters, `metadata` values are strings, as the Agent Skills specification requires.

## Not tested

- **No ShopifyQL query was run.** Open risks: whether `agentic_referring_channel` accepts `WITH LAST_CLICK_ATTRIBUTION` in the `sales` schema; whether `CONTAINS` ignores case; whether `landing_page_url` keeps the query string (and so `oppref`); whether a merchant's CLI login may run `shopifyqlQuery` at all (the docs mention protected customer data).
- **No store command was run**: no `shopify store auth`, no `shopify store execute`.
- **No request was sent to OpenAI's API.** The three GET endpoints in the tracking check come from the documentation only. Response field names (`api_channel`, `event_data_json`) are from the documented example.
- **No store with OpenAI's pixel was audited.** How OpenAI's own Shopify app, or any third-party app, actually places the pixel is unknown to us.
- **The Ads Manager steps** (test session, Event Stream) are copied from OpenAI's documentation and were not clicked through.
- **No skill was triggered inside an agent.** Whether the descriptions trigger on the intended questions, and whether an agent follows the steps correctly, is untested in Claude Code, Codex, Cursor or any other client.
- **Install paths not run:** `claude plugin marketplace add` + `install`, `codex plugin marketplace add`, VS Code, Cursor, the ChatGPT desktop app.
- **Platforms:** commands were run on macOS (zsh, BSD grep) only. Not on Linux (GNU grep) or Windows.
- **The readiness score** uses weights and thresholds chosen for this skill. They have not been calibrated on real stores.

## Checklist for the first real run

1. Traffic report on a store with known ChatGPT traffic: run every query in steps 4 to 6, note each `parseErrors`, and correct the skill and the fact sheet.
2. On the same store, compare the report's order count with the admin's own report for one week.
3. Tracking check on three stores: one with OpenAI's own app, one with a third-party pixel app, one with a hand-pasted snippet. Record how each install looks in the page source.
4. Tracking check with an Advertiser API key: confirm the three GET responses.
5. Readiness on one small and one large catalogue; check the 250-product sample and the query cost.
6. Run each skill from Claude Code and from one other agent, from a cold start, with only the trigger sentence.
7. Record the results here with the date. No store names, no order numbers, no keys.
