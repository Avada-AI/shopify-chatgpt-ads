# Shopify ChatGPT Ads

**Run your ChatGPT (OpenAI) ads from your own AI agent.** An MCP server and agent skills for Shopify merchants: launch campaigns, read reports, guard the budget and fix the product feed from Claude Code, Codex, Cursor or any MCP client. Everything starts paused, and nothing spends without your explicit yes.

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

## Install (60 seconds)

You need Node.js 20 or later (tested on 22, 24 and 26) and an Advertiser API key: [ads.openai.com](https://ads.openai.com) > Settings > API keys. Put it in your environment, not in a chat:

```bash
export OPENAI_ADS_API_KEY=...        # add it to your shell profile or a secret manager
```

> **Status:** v0.2.0, not yet published to npm. Until it is, use the Claude Code plugin (it runs from the repository), or clone and run from source: `git clone https://github.com/Avada-AI/shopify-chatgpt-ads && cd shopify-chatgpt-ads && npm ci`, then use `node /path/to/shopify-chatgpt-ads/src/cli.js` wherever the examples below say `npx -y shopify-chatgpt-ads-mcp`.

### Claude Code

As a plugin (MCP server + all skills; it asks for the key and keeps it in your system keychain):

```
/plugin marketplace add Avada-AI/shopify-chatgpt-ads
/plugin install shopify-chatgpt-ads@avada-ai
```

Or the MCP server alone, reading the key from your environment when it starts:

```bash
claude mcp add-json chatgpt-ads --scope user \
  '{"command":"npx","args":["-y","shopify-chatgpt-ads-mcp"],"env":{"OPENAI_ADS_API_KEY":"${OPENAI_ADS_API_KEY}"}}'
```

Project config example: [`examples/claude-code.mcp.json`](examples/claude-code.mcp.json).

### Codex

Add to `~/.codex/config.toml` ([full example](examples/codex-config.toml)):

```toml
[mcp_servers.chatgpt-ads]
command = "npx"
args = ["-y", "shopify-chatgpt-ads-mcp"]
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
      "args": ["-y", "shopify-chatgpt-ads-mcp"],
      "env": {"OPENAI_ADS_API_KEY": "${env:OPENAI_ADS_API_KEY}"}
    }
  }
}
```

### Any other MCP client

Run `npx -y shopify-chatgpt-ads-mcp` over stdio with `OPENAI_ADS_API_KEY` in its environment ([example](examples/generic-mcp.json)). Registry metadata: [`server.json`](server.json).

### Skills only

The skills work with any agent that reads Agent Skills: `npx skills add Avada-AI/shopify-chatgpt-ads` (the open `skills` CLI, Node.js 22.20 or later), or copy a folder from `skills/` into `.claude/skills/` or `.agents/skills/`.

## Add measured orders and True ROAS (free)

1. Install [Avada ChatGPT Ads](https://apps.shopify.com/avada-chatgpt-pixel) on your Shopify store and connect your ad account in the app.
2. Turn on the app embed: Shopify admin > Online Store > Themes > Customize > App embeds > Avada ChatGPT Ads. Without it the store sends no tracked events.
3. Connect your agent, one of:
   - **API key:** in the app, Settings > AI agents > API keys. Then `export AVADA_API_KEY=avk_live_...` and restart your agent. The `measurement_*` tools start answering.
   - **Hosted MCP server (OAuth):** add `https://avada-chatgpt.firebaseapp.com/mcp` as a second MCP server and approve it in the app. The Claude Code plugin and the example configs already list it as `avada-measurement`.

> **Preview:** the Measurement API is being released by the app now. The contract the kit uses is in [`docs/measurement-api.md`](docs/measurement-api.md); until it is live for your store, the measurement tools answer "not live yet" with the steps above.

## Safety

- **Paused by default.** Every campaign, ad group and ad the kit creates is created `paused`, whatever the agent asks. Update tools cannot change status or budget.
- **Spending needs your yes.** `activate_campaign`, and `set_budget` or `set_bid` when they raise spend, first return a dry run: what will run, the budget and currency, preview links, warnings, and a `plan_id`. The agent must show it to you and call again with `confirm: true` and that exact `plan_id`. If anything changed in between, the old `plan_id` no longer works.
- **Cutting is free.** Pausing, lowering a budget or bid, and archiving work directly (archiving is permanent at OpenAI, and the tool says so).
- **Read-only mode.** `CHATGPT_ADS_READ_ONLY=1` removes every write tool from the server; the agent cannot even see them.
- **Audit log.** Every write is written to `~/.chatgpt-ads-kit/audit.log` (JSON lines, readable only by you, no secrets) before it is sent. If the log cannot be written, the write is refused.
- **No duplicate campaigns.** Every create sends an `Idempotency-Key`; a retried create returns the first object. Writes without one are never retried.
- **Money done carefully.** Budgets and bids are converted to OpenAI's micros with decimal arithmetic in your account currency; feed prices go out in ISO 4217 minor units; reported spend is never converted. Amounts in different currencies are never added or compared.

The agent still acts with your key. Read the tool list your client shows, and use read-only mode when you only want reports.

## Privacy

- **Your OpenAI key stays on your machine.** It is read from the environment (or your keychain, with the Claude Code plugin), sent only to `api.ads.openai.com`, never accepted as a tool argument, never logged, and removed from every answer and error before it reaches the agent.
- **No telemetry.** The server talks to OpenAI, and to Avada only when you set `AVADA_API_KEY`. Nothing else.
- **What Avada's API returns:** aggregates (counts, sums, ratios), campaign and product identifiers, setup and health states for the one store the key belongs to. No customer names, emails or addresses, and never keys or tokens. See [`docs/measurement-api.md`](docs/measurement-api.md).
- Your agent's model provider sees what the tools return, as with any MCP server.

## Tools

| Tool | Kind |
|---|---|
| `get_ad_account`, `list_campaigns`, `get_campaign`, `list_ad_groups`, `get_ad_group`, `list_ads`, `get_ad`, `preview_ad` | read |
| `get_insights` (account / campaign / ad group / ad, daily or totals, country / device / platform / product breakdowns, explicit attribution windows) | read |
| `list_feeds`, `list_feed_uploads`, `query_feed_products`, `list_pixels`, `list_recent_conversion_events`, `list_conversion_event_settings`, `search_locations`, `list_audit_logs` | read |
| `create_campaign`, `create_ad_group`, `create_ad` (always paused) | write |
| `update_campaign`, `update_ad_group`, `update_ad` (no status, no budget, no bid) | write |
| `pause_campaign`, `pause_ad_group`, `pause_ad`, `archive_campaign`, `archive_ad_group`, `archive_ad` | write |
| `update_feed_products` (Delta API: price, stock, title of existing variants) | write |
| `activate_campaign`, `set_budget` (when higher), `set_bid` (when higher or a strategy switch) | confirm-gated |
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
| `AVADA_API_PATH` | `/data/v1` | REST mirror path (preview) |
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
| Activation returns another dry run | The plan changed (or `plan_id` was missing); show the new plan and confirm that one |
| `measurement_*` says `not_connected` / `app_embed_off` / `not_live` | Follow the steps in the answer; see "Add measured orders" above |
| Nothing in `get_insights` for today | Spend and conversions update later than clicks; conversions need about a day |

## Roadmap

- Publish to npm and the MCP registry; signed releases.
- Activate a single ad group or ad (today `activate_campaign` activates all paused children after your yes).
- Target CPA / Target CPC bidding once OpenAI's API offers it (Max CPC retires for existing campaigns on 2027-01-01).
- Custom audiences (exclusion lists) behind the same confirm gate.
- A demo recording and a tested install matrix for Codex, Cursor and VS Code.

## Development

```bash
npm ci
npm run check            # lint, typecheck (tsc --checkJs), tests
npm run live:readonly    # optional: GET-only check against your real ad account (OPENAI_ADS_API_KEY_FILE=...)
```

Tests run against a fake OpenAI Ads API and a fake Avada API, plus a real MCP client over stdio. See [`docs/TESTING.md`](docs/TESTING.md), [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`SECURITY.md`](SECURITY.md).

## Licence

[MIT](LICENSE). Copyright Avada. Not affiliated with OpenAI or Shopify.
