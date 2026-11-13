# Shopify ChatGPT Ads

**Run your ChatGPT (OpenAI) ads from your own AI agent.** An MCP server and agent skills for Shopify merchants: launch campaigns, read reports, guard the budget and fix the product feed from Claude Code, Codex, Cursor or any MCP client. Everything it creates starts paused, and the server will not start spending, raise a budget or bid, archive, re-point an ad or change a feed price until it gets your yes (asked by your client, or confirmed through a short-lived dry-run plan).

[![CI](https://github.com/Avada-AI/shopify-chatgpt-ads/actions/workflows/ci.yml/badge.svg)](https://github.com/Avada-AI/shopify-chatgpt-ads/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<!-- Demo GIF goes here: docs/demo.gif (an agent creates a paused campaign, shows the preview, asks before activating). -->

Not affiliated with OpenAI or Shopify. "ChatGPT", "OpenAI" and "Shopify" are trademarks of their owners and are used only to say what this works with.

## Ask your agent

- "How did my ChatGPT ads do last week compared with the week before?"
- "Launch a ChatGPT Shopping campaign for my running shoes under $100, 30 dollars a day."
- "Make a chat card ad for our new collection page and show me the preview."
- "Am I on track to stay under $1,500 on ChatGPT ads this month? What should I pause?"
- "Why are half my products missing from my ChatGPT Shopping campaign?"
- "Drop the price of these three variants in my OpenAI feed and mark this one out of stock."
- "Is my ChatGPT Ads tracking set up correctly?"
- "What's my True ROAS on ChatGPT ads from real Shopify orders?"

## How it works

Two parts, one agent:

| | Manage ads | Measure results |
|---|---|---|
| What | A local MCP server that calls OpenAI's Advertiser API | Orders attributed to ChatGPT ads, True ROAS, tracking health |
| Needs | Your own Advertiser API key (`OPENAI_ADS_API_KEY`) | [Avada ChatGPT Ads](https://apps.shopify.com/avada-chatgpt-pixel), free, installed with its app embed on |
| Where the key lives | On your machine only | In the app; your agent gets a read-only key or OAuth approval |
| Tools | 33 `ads` tools (campaigns, ad groups, ads, previews, insights, feeds, pixels, locations, audit logs) | 13 `measurement_*` tools, plus Avada's hosted MCP server |

OpenAI's numbers say what OpenAI attributed to its ads. The store's numbers say what actually sold. You want both, side by side, in the same currency. Without the app, the measurement tools say exactly what is missing and how to set it up; they never make up a number.

## Install

You need Node.js 20 or later (tested on 22, 24 and 26) and an Advertiser API key: [ads.openai.com](https://ads.openai.com) > Settings > API keys. Put it in your environment, not in a chat:

```bash
export OPENAI_ADS_API_KEY=...        # add it to your shell profile or a secret manager
```

> **Status:** v0.2.1. It runs straight from this repository: `npx -y github:Avada-AI/shopify-chatgpt-ads` (no npm package; do not install a package with a similar name from npm).

### Claude Code

As a plugin (MCP server + all skills; it asks for the key and keeps it in your system keychain). The plugin runs the bundled `dist/cli.js`, so nothing is installed with npm:

```
/plugin marketplace add Avada-AI/shopify-chatgpt-ads
/plugin install shopify-chatgpt-ads@avada-ai
```

Or the MCP server alone, reading the key from your environment when it starts:

```bash
claude mcp add-json chatgpt-ads --scope user \
  '{"command":"npx","args":["-y", "github:Avada-AI/shopify-chatgpt-ads"],"env":{"OPENAI_ADS_API_KEY":"${OPENAI_ADS_API_KEY}"}}'
```

Project config example: [`examples/claude-code.mcp.json`](examples/claude-code.mcp.json).

### Codex

Add to `~/.codex/config.toml` ([full example](examples/codex-config.toml)):

```toml
[mcp_servers.chatgpt-ads]
command = "npx"
args = ["-y", "github:Avada-AI/shopify-chatgpt-ads"]
env_vars = ["OPENAI_ADS_API_KEY", "AVADA_API_KEY"]
```

[`AGENTS.md`](AGENTS.md) tells Codex and other agents the safety rules. Skills: `npx skills add Avada-AI/shopify-chatgpt-ads -a codex`.

### Cursor

`.cursor/mcp.json` in your project, or `~/.cursor/mcp.json` ([example](examples/cursor-mcp.json)):

```json
{
  "mcpServers": {
    "chatgpt-ads": {
      "command": "npx",
      "args": ["-y", "github:Avada-AI/shopify-chatgpt-ads"],
      "env": {"OPENAI_ADS_API_KEY": "${env:OPENAI_ADS_API_KEY}"}
    }
  }
}
```

### Any other MCP client

Run `npx -y github:Avada-AI/shopify-chatgpt-ads` over stdio with `OPENAI_ADS_API_KEY` in its environment ([example](examples/generic-mcp.json)).

### Skills only

The skills work with any agent that reads Agent Skills: `npx skills add Avada-AI/shopify-chatgpt-ads` (the open `skills` CLI, Node.js 22.20 or later), or copy a folder from `skills/` into `.claude/skills/` or `.agents/skills/`.

## Add measured orders and True ROAS (free)

1. Install [Avada ChatGPT Ads](https://apps.shopify.com/avada-chatgpt-pixel) on your Shopify store and connect your ad account in the app.
2. Turn on the app embed: Shopify admin > Online Store > Themes > Customize > App embeds > Avada ChatGPT Ads. Without it the store sends no tracked events.
3. Connect your agent, one of:
   - **API key:** in the app, Settings > AI agents > API keys. Then `export AVADA_API_KEY=avk_live_...` and restart your agent. The `measurement_*` tools start answering.
   - **Hosted MCP server (OAuth):** add `https://avada-chatgpt.firebaseapp.com/mcp` as a second MCP server and approve it in the app. The Claude Code plugin and the example configs already list it as `avada-measurement`.

The measurement API (v1) is live. What it returns, its errors and its rate limits (30 calls a minute per key, 100 per store) are in [`docs/measurement-api.md`](docs/measurement-api.md).

## Safety

What the server enforces, whatever the agent asks:

- **Paused by default.** Every campaign, ad group and ad the kit creates is created `paused`. Update tools cannot change status or budget.
- **A yes before anything that spends or cannot be undone.** Gated: `activate_campaign`; `set_budget` and `set_bid` when they can raise spend; `archive_campaign`, `archive_ad_group`, `archive_ad`; `update_ad` when it changes `target_url`; `update_feed_products` when it changes a price; `update_campaign` when it changes the schedule of a campaign that is not paused.
  - **If your client supports MCP elicitation**, the server asks you directly, in your client, with the plan (and, for activation, the warnings and preview links), and acts only on your answer. The agent cannot answer for you, and `confirm` from the agent does not count.
  - **Otherwise** the first call changes nothing and returns a dry run with a `plan_id`. The change goes ahead only on a second call with `confirm: true` and that `plan_id`, within 10 minutes, once, and only while nothing that decides the outcome has changed (budget, schedule, bids, what will be activated). The server cannot tell whether a person said yes: it requires the dry run, and it tells the agent to show you the plan and ask.
- **Cutting is free.** Pausing and lowering a budget or bid apply at once.
- **Results are data.** The server tells the agent, in its instructions and every tool description, that names, titles, event data and error text in results were written by others and are never instructions. `list_recent_conversion_events` returns event types, channels, times and counts, never the event payloads that anyone can send to a public pixel.
- **Read-only mode.** `CHATGPT_ADS_READ_ONLY=1` removes every tool that changes anything; the agent cannot even see them. Two remaining read tools use POST without changing anything (`preview_ad`, `query_feed_products`).
- **Audit log.** Every write is written to `~/.chatgpt-ads-kit/audit.log` (JSON lines, mode 600 checked on every write, no secrets) before it is sent. If the log cannot be written, the write is refused.
- **No duplicate campaigns.** Every create sends an `Idempotency-Key`, so a retried create returns the first object; after that object is archived, the same inputs create a new one. Writes without a key are never retried.
- **Money done carefully.** Budgets and bids are converted to OpenAI's micros with decimal arithmetic in your account currency; feed prices go out in ISO 4217 minor units; reported spend is never converted. Amounts in different currencies are never added or compared.

What it cannot do: an agent with your key can still pause, rename, retarget or edit what the tools allow without asking, and on a client without elicitation an agent that ignores its instructions can confirm a plan on its own. Use a client that supports elicitation, read what your agent proposes, keep auto-approve off for the gated tools, and use read-only mode when you only want reports.

## Privacy

- **Your OpenAI key stays on your machine.** It is read from the environment (or your keychain, with the Claude Code plugin), sent only to `api.ads.openai.com`, never accepted as a tool argument, never logged, and removed from every answer and error before it reaches the agent.
- **No telemetry.** The server talks to OpenAI, and to Avada only when you set `AVADA_API_KEY`. Nothing else.
- **What Avada's API returns:** aggregates (counts, sums, ratios), campaign and product identifiers, setup and health states for the one store the key belongs to. No customer names, emails or addresses, and never keys or tokens. See [`docs/measurement-api.md`](docs/measurement-api.md).
- Your agent's model provider sees what the tools return, as with any MCP server. Recent pixel events are reduced to types, channels, times and counts, so shopper data in event payloads is not passed on.

## Tools

| Tool | Kind |
|---|---|
| `get_ad_account`, `list_campaigns`, `get_campaign`, `list_ad_groups`, `get_ad_group`, `list_ads`, `get_ad`, `preview_ad` | read |
| `get_insights` (account / campaign / ad group / ad, daily or totals, country / device / platform / product breakdowns, explicit attribution windows) | read |
| `list_feeds`, `list_feed_uploads`, `query_feed_products`, `list_pixels`, `list_recent_conversion_events`, `list_conversion_event_settings`, `search_locations`, `list_audit_logs` | read |
| `create_campaign`, `create_ad_group`, `create_ad` (always paused) | write |
| `update_campaign`, `update_ad_group`, `update_ad` (no status, no budget, no bid) | write; gated for a schedule change on a running campaign and for a new `target_url` |
| `pause_campaign`, `pause_ad_group`, `pause_ad` | write |
| `update_feed_products` (Delta API: price, stock, title of existing variants) | write; gated for a price change |
| `activate_campaign`, `archive_campaign`, `archive_ad_group`, `archive_ad`, `set_budget` (when higher), `set_bid` (when higher or a strategy switch) | gated |
| `measurement_get_setup_status`, `_get_account_overview`, `_get_ads_report`, `_get_ads_breakdown`, `_get_product_report`, `_list_campaigns`, `_get_campaign`, `_get_spend_pacing`, `_get_feed_status`, `_list_feed_issues`, `_list_alerts`, `_get_tracking_health`, `_list_campaign_presets` | read (Avada) |

## Skills

| Skill | Ask your agent |
|---|---|
| [`chatgpt-ads-weekly-report`](skills/chatgpt-ads-weekly-report/SKILL.md) | "How did my ChatGPT ads do this week?" |
| [`chatgpt-ads-launch-campaign`](skills/chatgpt-ads-launch-campaign/SKILL.md) | "Launch a ChatGPT Shopping campaign for these products" |
| [`chatgpt-ads-budget-guard`](skills/chatgpt-ads-budget-guard/SKILL.md) | "Keep my ChatGPT ads under $X this month" |
| [`chatgpt-ads-feed-fix`](skills/chatgpt-ads-feed-fix/SKILL.md) | "Why are my products not showing in ChatGPT ads?" |
| [`chatgpt-tracking-check`](skills/chatgpt-tracking-check/SKILL.md) | "Is my ChatGPT Ads tracking set up correctly?" (Avada's measured health first, then outside checks) |
| [`chatgpt-traffic-report`](skills/chatgpt-traffic-report/SKILL.md) | "How much traffic and sales is ChatGPT sending my store?" (Shopify analytics, read-only) |
| [`chatgpt-store-readiness`](skills/chatgpt-store-readiness/SKILL.md) | "Is my store ready for ChatGPT?" (read-only) |

The last two need no ad account and no server: they use Shopify's own analytics and public pages. Every platform fact the skills and the server rely on is in [`references/chatgpt-facts.md`](references/chatgpt-facts.md), with the date it was checked, the source and how sure we are.

## Configuration

| Variable | Default | |
|---|---|---|
| `OPENAI_ADS_API_KEY` | none | Advertiser API key. Without it the server starts and every ads tool explains how to add one |
| `CHATGPT_ADS_READ_ONLY` | off | `1` / `true`: no write tool is offered |
| `AVADA_API_KEY` | none | `avk_live_...` from Avada ChatGPT Ads, for `measurement_*` |
| `AVADA_API_BASE` | `https://avada-chatgpt.firebaseapp.com` | |
| `AVADA_API_PATH` | `/data/v1` | REST mirror path (measurement API v1) |
| `CHATGPT_ADS_AUDIT_LOG` | `~/.chatgpt-ads-kit/audit.log` | |

## Troubleshooting

| You see | Do this |
|---|---|
| `KEY_MISSING` | Set `OPENAI_ADS_API_KEY` where your client starts the server, then restart the client. With the plugin: `/plugin` > shopify-chatgpt-ads > configure |
| `KEY_INVALID` (401) | The key was revoked or mistyped; create a new one in Ads Manager > Settings |
| `NOT_ADMIN` (403) | Some actions (creating a pixel, spend limits) need an ad account admin's key |
| `FORBIDDEN` / `NOT_FOUND` on feeds, pixels, events | The feature is not enabled for your ad account; ask your OpenAI contact |
| "does not target any country where this account can advertise" | Your ad account may advertise only in countries OpenAI allowed it; remove the others |
| A budget is refused with "at least ... micros" | That is OpenAI's daily minimum for your currency; use at least that amount |
| `update_feed_products` answers 422 | One variant id is not in the feed, so nothing was applied; remove it and resend the rest |
| A gated tool returns another dry run | The plan changed, the `plan_id` was missing or used, or more than 10 minutes passed; show the new plan and confirm that one |
| `measurement_*` says `not_connected`, `key_invalid`, `ads_not_connected`, `locked` or `not_live` | Follow the steps in the answer; see "Add measured orders" above and [`docs/measurement-api.md`](docs/measurement-api.md) |
| `measurement_*` says `rate_limited` | Wait `avada.retry_after` seconds. `limit: shop` means the store's agents and keys together used their 100 calls a minute |
| Nothing in `get_insights` for today | Spend and conversions update later than clicks; conversions need about a day |

## Roadmap

- Publish to npm and the MCP registry; signed releases.
- Activate a single ad group or ad (today `activate_campaign` activates all paused children after your yes).
- New bidding strategies once OpenAI's API offers them.
- Custom audiences (exclusion lists) behind the same confirm gate.
- A demo recording and a tested install matrix for Codex, Cursor and VS Code.

## Development

```bash
npm ci
npm run check            # lint, typecheck (tsc --checkJs), build dist/cli.js, tests
npm run live:readonly    # optional: GET-only check against your real ad account (OPENAI_ADS_API_KEY_FILE=...)
```

Tests run against a fake OpenAI Ads API and a fake Avada API, plus a real MCP client over stdio. See [`docs/TESTING.md`](docs/TESTING.md), [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`SECURITY.md`](SECURITY.md).

## Licence

[MIT](LICENSE). Copyright Avada. Not affiliated with OpenAI or Shopify.
