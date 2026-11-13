# Changelog

## 0.2.1 - 2026-11-13

Fixes from a security review of 0.2.0.

- **Gates hold beyond the agent's goodwill.** Archiving (`archive_campaign`, `archive_ad_group`, `archive_ad`), a new ad `target_url`, a feed price change and a schedule change on a campaign that is not paused are now gated like activation and budget or bid raises. Where the client supports MCP elicitation the server asks the user directly and only their answer counts; otherwise a `plan_id` works once and expires after 10 minutes, and the activation plan covers every ad group's bidding.
- **Results are data.** The server instructions and every tool description say that names, titles, event data and error text are never instructions. `list_recent_conversion_events` returns types, channels, times and counts only, no event payloads.
- **Plugin starts on a fresh machine.** The Claude Code plugin runs `dist/cli.js`, one bundled file (built with esbuild from `src/`, licences in `dist/THIRD_PARTY_LICENSES.txt`), so it needs no `npm install`. CI fails when `dist/` is not the build of `src/`.
- **Measurement API v1.** The `measurement_*` tools follow the live contract: `{success: false, code, error}` with the HTTP status, `locked`, `ads_not_connected`, `ads_key_invalid`, `invalid_input` (with `field`), `unknown_tool`, `too_large`, `rate_limited` (with `retry_after` and `limit`), `temporarily_unavailable`, and the app embed check from `setup.app_embed.on` (`false` and `null` flagged with the fix link). `docs/measurement-api.md` is the v1 contract.
- An identical create after an archive makes a new object instead of returning the archived one (`<key>:after:<archived id>`).
- The audit log is set to mode 600 on every write, not only on creation.
- Fact sheet: measured facts are marked `observed`, without account details; a fact not on OpenAI's public pages was removed.
- `server.json` removed: there is no npm package (install from GitHub).
- CI actions pinned to commit SHAs.

## 0.2.0 - unreleased

- **MCP server** (`shopify-chatgpt-ads-mcp`, stdio, Node.js 20+) for OpenAI's Advertiser API with your own key: ad account; campaigns, ad groups and ads (list, get, create, edit, pause, archive); chat card creatives from an image URL; ad previews; Insights with explicit attribution settings and country / device / platform / product breakdowns; product feeds, upload history, product queries and Delta API price / stock / title updates; pixels, recent events and conversion event settings; location lookup; audit logs.
- **Safety:** every create is paused; `activate_campaign`, and `set_budget` / `set_bid` when they raise spend, need `confirm: true` with the `plan_id` of a dry run; `CHATGPT_ADS_READ_ONLY=1` removes every write tool; a local audit log records each write before it is sent; keys are redacted from every answer.
- **Measurement (preview):** 13 `measurement_*` tools for Avada ChatGPT Ads' Measurement API (measured orders, True ROAS, tracking and feed health) with `AVADA_API_KEY`, and Avada's hosted MCP server in the plugin and example configs. Without the app they explain what is missing and never return numbers. Contract: `docs/measurement-api.md`.
- **Skills:** `chatgpt-ads-weekly-report`, `chatgpt-ads-launch-campaign`, `chatgpt-ads-budget-guard`, `chatgpt-ads-feed-fix`; `chatgpt-tracking-check` now starts from Avada's measured health and uses the server's read tools when present.
- Fact sheet section A (Ads API facts, dated 2026-11-13).
- Claude Code plugin with the MCP servers and a keychain prompt for keys; `AGENTS.md`; Codex, Cursor and generic MCP examples; `server.json` for the MCP registry.

## 0.1.0 - 2026-11-13

- Three read-only skills: `chatgpt-traffic-report`, `chatgpt-tracking-check`, `chatgpt-store-readiness`, with a dated fact sheet.
