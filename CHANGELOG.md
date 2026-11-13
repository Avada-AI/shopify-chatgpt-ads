# Changelog

## 0.2.0 - unreleased

- **MCP server** (`shopify-chatgpt-ads-mcp`, stdio, Node.js 20+) for OpenAI's Advertiser API with your own key: ad account; campaigns, ad groups and ads (list, get, create, edit, pause, archive); chat card creatives from an image URL; ad previews; Insights with explicit attribution settings and country / device / platform / product breakdowns; product feeds, upload history, product queries and Delta API price / stock / title updates; pixels, recent events and conversion event settings; location lookup; audit logs.
- **Safety:** every create is paused; `activate_campaign`, and `set_budget` / `set_bid` when they raise spend, need `confirm: true` with the `plan_id` of a dry run; `CHATGPT_ADS_READ_ONLY=1` removes every write tool; a local audit log records each write before it is sent; keys are redacted from every answer.
- **Measurement (preview):** 13 `measurement_*` tools for Avada ChatGPT Ads' Measurement API (measured orders, True ROAS, tracking and feed health) with `AVADA_API_KEY`, and Avada's hosted MCP server in the plugin and example configs. Without the app they explain what is missing and never return numbers. Contract: `docs/measurement-api.md`.
- **Skills:** `chatgpt-ads-weekly-report`, `chatgpt-ads-launch-campaign`, `chatgpt-ads-budget-guard`, `chatgpt-ads-feed-fix`; `chatgpt-tracking-check` now starts from Avada's measured health and uses the server's read tools when present.
- Fact sheet section A (Ads API facts, dated 2026-11-13).
- Claude Code plugin with the MCP servers and a keychain prompt for keys; `AGENTS.md`; Codex, Cursor and generic MCP examples; `server.json` for the MCP registry.

## 0.1.0 - 2026-11-13

- Three read-only skills: `chatgpt-traffic-report`, `chatgpt-tracking-check`, `chatgpt-store-readiness`, with a dated fact sheet.
