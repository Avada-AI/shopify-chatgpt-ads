---
name: chatgpt-ads-weekly-report
description: Write a weekly ChatGPT Ads report for a Shopify store - spend, impressions, clicks, CTR, CPC, conversions and attributed sales from OpenAI, week over week, plus orders measured in the store and True ROAS from Avada ChatGPT Ads when it is connected. Read-only. Use when the user asks "how did my ChatGPT ads do this week?", "weekly ChatGPT Ads report", "ChatGPT ads ROAS", "compare to last week", or wants a summary to send to a client or a team.
license: MIT
compatibility: Needs the shopify-chatgpt-ads MCP server (OPENAI_ADS_API_KEY). Optional - AVADA_API_KEY or Avada's hosted MCP server for measured orders and True ROAS.
metadata:
  facts-checked: "2026-11-13"
  version: "0.2.0"
---

# ChatGPT Ads weekly report

One report for one ad account: **what did ChatGPT ads cost last week, what did they bring, and how does that compare with the week before.**

Fact ids such as (A5) point to `references/chatgpt-facts.md` at the root of this repository.

## Rules

1. **Read only.** Use only read tools. Never pause, edit or activate anything from this skill; propose it instead.
2. **Never mix currencies.** OpenAI's numbers are in the ad account currency (`get_ad_account`). Avada's measured numbers carry their own currency. If the two differ, show them side by side and do not compute a ROAS across them, or convert.
3. **Unknown is not zero.** A missing metric, a `null`, a tool error or a `measurement_*` answer of `unavailable` is written as "unknown" with the reason. Write 0 only when a tool returned 0.
4. **Name the source of every number:** "OpenAI (attributed)" or "Avada (measured in the store)". They count different things and will not match.
5. **Same settings both weeks.** Use the same attribution windows and time basis for both weeks (defaults 30-day click, 1-day view, `ad_event_time`, as Ads Manager shows) and state them in the report (A6).

## Steps

1. `get_ad_account`: currency, timezone. Weeks are Monday to Sunday in that timezone unless the user asks otherwise. Default: the last full week and the week before.
2. `get_insights` with `granularity: none`, `level: campaign`, `from`/`to` of last week. Then the same for the week before. Keep `notes`: they say when sales were left out (A7).
3. `get_insights` with `granularity: daily`, `level: ad_account` for last week, for the day-by-day line.
4. `measurement_get_ads_report` for each week (`from`, `to`, same windows as `click`, `view`, `basis`).
   - Answer with data: take orders, revenue and True ROAS as measured, with the currency it names.
   - Answer `unavailable` or `could_not_check`: write one line with its `reason` and the first step from `steps`, and continue with OpenAI's numbers only.
5. Optional, if spend rose or fell by more than a third: `list_campaigns` with `include_serving_issues: true` to explain why (paused, review, budget, serving issues).

## Compute

- Change = (this week - last week) / last week. If last week is 0 or unknown, write "new" or "unknown", not a percentage.
- OpenAI ROAS = `order_created_attributed_sales` / `spend`, or OpenAI's `order_created_roas` when the row has it.
- True ROAS: take it from Avada; do not recompute it from OpenAI spend unless both currencies match and Avada did not return one.
- Conversions from the last 1-2 days are still being processed (A5): mark them "may still rise".

## Output

```markdown
## ChatGPT Ads, week of <Mon date> (<timezone>)

Ad account currency: <CUR>. Attribution: 30-day click, 1-day view, ad event time.

| Metric | This week | Last week | Change |
|---|---|---|---|
| Spend (<CUR>) | | | |
| Impressions | | | |
| Clicks / CTR | | | |
| CPC (<CUR>) | | | |
| Conversions (OpenAI) | | | |
| Attributed sales (OpenAI, <CUR>) | | | |
| Orders measured in the store (Avada) | | | |
| True ROAS (Avada) | | | |

Top campaigns by spend: <name: spend, clicks, conversions>, ...

What changed and why: <2-4 short lines, each tied to a number above>.

Next steps to consider: <pause, budget or feed actions as suggestions; the user decides>.
```

Rows with no data say "unknown (<reason>)". If Avada is not connected, the last two rows say: "unknown: measured orders need Avada ChatGPT Ads (free) with the app embed on - https://apps.shopify.com/avada-chatgpt-pixel".
