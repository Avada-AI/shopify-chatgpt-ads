---
name: chatgpt-ads-budget-guard
description: Check ChatGPT Ads spend against a monthly target, forecast the month end, find campaigns that spend without results, and propose pauses or budget cuts - never a raise without the user's explicit yes. Use when the user asks "am I overspending on ChatGPT ads?", "keep my ChatGPT ads under $X a month", "which ChatGPT campaigns are wasting money?", "budget check", or "pacing".
license: MIT
compatibility: Needs the shopify-chatgpt-ads MCP server (OPENAI_ADS_API_KEY). Pausing and lowering budgets need write tools; in read-only mode the skill only proposes. Optional - Avada's Measurement API for True ROAS and the app's own pacing target.
metadata:
  facts-checked: "2026-11-13"
  version: "0.2.0"
---

# ChatGPT Ads budget guard

Answer: **at this pace, where will spend end the month, against what target, and what should stop or shrink?**

Fact ids such as (A4) point to `references/chatgpt-facts.md` at the root of this repository.

## Rules

1. **Cut freely, raise never on your own.** Pausing and lowering a budget are allowed after the user agrees to the list. Raising a budget or a bid goes through `set_budget` / `set_bid` dry runs and needs an explicit yes to that exact plan (where the client supports it the server asks the user itself; otherwise it wants `confirm` and the `plan_id` of the dry run, within 10 minutes). This skill never proposes a raise unless the user asked for one.
2. **Propose, then act.** Show the full list of proposed changes first; apply only the ones the user approves.
3. **One currency.** Target, spend and budgets are all in the ad account currency (`get_ad_account`). If the user gives the target in another currency, ask them to restate it; do not convert.
4. **Unknown is not zero.** Days with no report are unknown; recent spend can still change (A5).

## Steps

1. `get_ad_account`: currency, timezone. Month = calendar month in that timezone.
2. Target: ask the user, or read `measurement_get_spend_pacing` (Avada's target and forecast, if the app is connected). If both exist and differ, ask which one counts.
3. `get_insights` with `level: campaign`, `granularity: none`, from the 1st of the month to yesterday: spend per campaign. And `granularity: daily`, `level: ad_account` for the daily run rate.
4. `list_campaigns`: status and budget per campaign (`budget_display`).
5. **Forecast.** Month-end spend = spend so far + (average daily spend over the last 7 complete days x days left). Also show the ceiling: sum of daily budgets of active campaigns x days left (+ remaining lifetime budgets). Say which campaigns have lifetime budgets.
6. **Find waste** (last 14 days, per campaign): spend with 0 conversions and 0 attributed sales, or OpenAI ROAS (or Avada True ROAS when available) below the user's break-even. Rank by spend. A campaign younger than 7 days or with conversions still processing is "too early", not waste.
7. **Propose** the smallest set of changes that brings the forecast under target: pause the worst campaigns first, then lower daily budgets (`set_budget` with a lower amount applies at once). Show the forecast after each step.
8. On approval: `pause_campaign` / `set_budget` (lower) for the approved items only. Report each result. The local audit log records every change.

## Output

```markdown
## ChatGPT Ads budget check, <month> (<CUR>, <timezone>)

Spent so far: <x> of target <t> (<p>%) after <d> of <n> days.
Forecast at the last 7 days' pace: <f> (<over|under> by <diff>). Ceiling if every active budget is used: <c>.

| Campaign | Status | Budget | Spend MTD | Conversions | ROAS (source) | Verdict |
|---|---|---|---|---|---|---|

Proposed (nothing changed yet):
1. Pause "<campaign>": <reason>. Forecast after: <f1>
2. Lower "<campaign>" daily budget <a> -> <b> <CUR>. Forecast after: <f2>

Apply which? (all / 1 / none)
```
