# What was tested, and what was not

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
