# Avada Measurement API: what the kit expects (preview)

> **Preview.** The app side is being built at the same time as this kit. Paths, field names and error codes below are the contract the kit is written against; they can change before the app ships. Check this page and the [CHANGELOG](../CHANGELOG.md) before relying on them.

OpenAI's Ads API tells you what OpenAI attributed to its ads. It does not see the store. [Avada ChatGPT Ads](https://apps.shopify.com/avada-chatgpt-pixel) (free Shopify app) installs OpenAI's pixel through a theme app embed, sends server-side Conversions API events, and joins ad spend with real Shopify orders. The Measurement API lets an agent read those measured numbers.

## Two ways in

| | Hosted MCP server | API key (REST mirror) |
|---|---|---|
| Who uses it | MCP clients that can do OAuth (Claude Code, Codex, Cursor, ...) | The kit's local server (`measurement_*` tools), dashboards, scripts |
| Endpoint | `https://avada-chatgpt.firebaseapp.com/mcp` | `POST <AVADA_API_BASE><AVADA_API_PATH>/<tool>`, default `https://avada-chatgpt.firebaseapp.com/data/v1/<tool>` |
| Auth | OAuth; you approve the agent inside the app | `Authorization: Bearer avk_live_...`, created in the app: Settings > AI agents > API keys |
| Store | The one you approved | The one the key was created in. No request can name another store |
| Access | Read only | Read only |

## Tools

Same names on both paths. The kit exposes each as `measurement_<name>` and passes the arguments through as a JSON body.

| Tool | Arguments | Returns (in short) |
|---|---|---|
| `get_setup_status` | none | app installed, app embed on, ad account connected, pixel and Conversions API state |
| `get_account_overview` | none | store, connected ad account, pixel, ready-to-advertise checklist |
| `get_ads_report` | `from`, `to` (YYYY-MM-DD), `click` (7/14/30), `view` (0/1), `basis` | OpenAI totals per campaign and day beside True ROAS from Shopify orders |
| `get_ads_breakdown` | `dimension` (country/device/platform), `from`, `to` | delivery by dimension |
| `get_product_report` | `from`, `to` | products with delivery |
| `list_campaigns` | `include_issues` | campaigns with health |
| `get_campaign` | `campaign_id` | one campaign |
| `get_spend_pacing` | none | month-to-date spend, target, forecast |
| `get_feed_status` | none | the app's feed sync state |
| `list_feed_issues` | `severity`, `limit`, `after` | per-product feed problems, paged |
| `list_alerts` | none | open alerts |
| `get_tracking_health` | `days` (1-90) | events, funnel, Conversions API delivery, tracked vs real orders |
| `list_campaign_presets` | none | suggested campaign presets |

## Answers the kit understands

Success: HTTP 200 with `{"success": true, "data": {...}}` (a bare object is accepted too). The kit returns `data` unchanged, tagged `contract: "preview"`. If `data.app_embed_enabled` (or `data.setup.app_embed_enabled`) is `false`, the kit adds an `attention` block telling the user to turn the app embed on.

Failure: any non-2xx status or `success: false`, with `{"error": {"code": "...", "message": "..."}}`. The kit maps:

| `error.code` or status | Kit answer `code` | What the user is told |
|---|---|---|
| no `AVADA_API_KEY` set | `not_connected` | install the app, turn on the app embed, create a key or connect the hosted server |
| `app_not_installed`, `app_uninstalled` | `app_not_installed` | install the app (link) |
| `app_embed_off` | `app_embed_off` | Online Store > Themes > Customize > App embeds |
| `ads_not_connected` | `ads_not_connected` | connect the ad account in the app |
| 401, 403 | `key_invalid` | create a new key |
| 404 (other) | `not_live` | the API may not be live yet, or the path is wrong |
| 429 | `rate_limited` | wait a minute |
| 5xx, network | `could_not_check` | try later |

Every failure answer has `data: null` and says the numbers are unknown. The kit never fills in a zero.

## Privacy

The API returns aggregates (counts, sums, ratios) and campaign or product identifiers. It does not return customer names, emails, addresses or order-level personal data, and it never returns keys or tokens. The kit sends only the tool arguments you see in the agent.
