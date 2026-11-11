---
name: chatgpt-traffic-report
description: Report how much traffic, how many orders and how much revenue ChatGPT sends a Shopify store, split into paid ad clicks and organic citations, with the blind spots stated. Read-only. Use when the user asks "How much traffic and sales is ChatGPT sending my store?", "is ChatGPT a real channel for us?", "ChatGPT referrals", "AI referral traffic", "utm_source=chatgpt.com", or wants ChatGPT Ads results checked against the store's own orders.
license: MIT
compatibility: Needs a way to run Admin GraphQL on the store - a Shopify CLI version that has the store auth and store execute commands, or any Admin API tool the agent already has. Scopes read_reports and read_orders only.
metadata:
  facts-checked: "2026-11-11"
  version: "0.1.0"
---

# ChatGPT traffic report

Answer one question for one store: **how many sessions, orders and how much revenue came from ChatGPT in a date range, how much of it was paid, and what the store cannot see.**

Fact ids such as (S3) point to `references/chatgpt-facts.md` at the root of this repository (`../../references/chatgpt-facts.md` from this file). It gives the date, source and confidence of each fact. If that file is not installed, use the facts as written here and tell the user they were last checked on 2026-11-11.

## Rules

1. **Read only.** Never pass `--allow-mutations`. Never run a GraphQL mutation. Never ask for a scope that starts with `write_`.
2. **Minimum scopes:** `read_reports` (ShopifyQL) and `read_orders` (order journeys, step 6 only). Do not ask for customer scopes.
3. **Unknown is not zero.** A query that failed, a scope that is missing, or a field that came back empty is reported as "could not check" with the reason. Write `0` only when a query ran and returned zero.
4. **Aggregates first.** Read single orders only when the user wants the order list or the paid/organic split needs it. Never print customer names, emails or addresses.
5. **Do not invent field names.** Use only the ShopifyQL and GraphQL names in this file. If one is rejected, read the error, look the name up in the linked schema page, and say what you changed.
6. **Show before you run.** Before the first command that signs in or reads store data, show the user the exact command and the scopes, and wait for a yes.

## Step 1. Ask what you need

- The store's `*.myshopify.com` domain.
- The date range. Default: the last 30 full days.
- Does the store run ChatGPT Ads? If yes, ask for the UTM template on the campaigns (Ads Manager, campaign tracking settings). It decides how paid clicks look (O10). If the user does not know, say the paid split will be based on `oppref` alone.

## Step 2. Sign in (read scopes only)

```bash
shopify store auth --store <store>.myshopify.com --scopes read_reports,read_orders
```

This opens a browser for the user to approve (S13). If the user has another Admin API tool, use it with the same two scopes.

Then read the store's currency and timezone. Every amount in the report is in this currency.

```bash
shopify store execute --store <store>.myshopify.com --json --query 'query { shop { name myshopifyDomain currencyCode ianaTimezone } }'
```

## Step 3. How to run a ShopifyQL query

Every query below goes through one GraphQL field (S1). Put the ShopifyQL text in the `q` variable. Keep the query and the variables in two files in a temporary folder, so the single quotes inside ShopifyQL survive the shell.

`shopifyql.graphql`:

```graphql
query RunShopifyQL($q: String!) {
  shopifyqlQuery(query: $q) {
    tableData {
      columns { name dataType displayName }
      rows
    }
    parseErrors
  }
}
```

`vars.json` (one ShopifyQL query, on one line):

```json
{"q": "FROM sessions SHOW sessions WHERE utm_source CONTAINS 'chatgpt' SINCE 2026-10-01 UNTIL 2026-10-31"}
```

```bash
shopify store execute --store <store>.myshopify.com --json \
  --query-file shopifyql.graphql --variable-file vars.json
```

Read the result this way:

- `parseErrors` is not empty: the ShopifyQL is wrong. Fix it from the error and the schema page. Do not guess a replacement name.
- An access error that names `read_reports`: the sign-in lacks the scope. Run step 2 again.
- An access error that mentions protected customer data: the app used for sign-in is not approved for it (S1). Report "could not check: ShopifyQL is not available to this login" and offer the fallback in step 8.
- Zero rows: a real zero for that query.

Replace `<FROM>` and `<TO>` below with `yyyy-MM-dd` dates (S9). The pages we read do not say which timezone a date boundary uses. Assume the store's timezone from step 2 and say so in the report.

Schema pages, for looking up a name that is rejected:

- sessions: https://shopify.dev/docs/api/shopifyql/latest/schemas/sessions_and_behavior/sessions
- sales: https://shopify.dev/docs/api/shopifyql/latest/schemas/sales_revenue/sales

## Step 4. Sessions

Run all four. They measure the same traffic in different ways, and they will not agree.

**4a. Store total** (the denominator for "share of total"):

```
FROM sessions
  SHOW sessions, online_store_visitors, sessions_that_completed_checkout
  SINCE <FROM> UNTIL <TO>
```

**4b. Shopify's own AI channel** (S3):

```
FROM sessions
  SHOW sessions, sessions_that_completed_checkout
  GROUP BY agentic_referring_channel
  SINCE <FROM> UNTIL <TO>
  ORDER BY sessions DESC
```

Take the row whose value is `ChatGPT`. Shopify does not document how a session gets this value, so treat it as Shopify's count, not as the truth.

**4c. The UTM tag** (C1):

```
FROM sessions
  SHOW sessions, sessions_that_completed_checkout
  WHERE utm_source CONTAINS 'chatgpt' OR utm_source CONTAINS 'openai'
  GROUP BY utm_source, utm_medium, utm_campaign
  SINCE <FROM> UNTIL <TO>
  ORDER BY sessions DESC
```

`chatgpt.com` with an empty medium is the organic tag. `openai` or a paid medium comes from an ad template (O10). Whether `CONTAINS` ignores case is not documented (S8): if the result is empty, run it once more with `ChatGPT` and `OpenAI`.

**4d. The referrer** (C2):

```
FROM sessions
  SHOW sessions, sessions_that_completed_checkout
  WHERE referrer_domain CONTAINS 'chatgpt' OR referrer_domain CONTAINS 'openai'
  GROUP BY referrer_domain
  SINCE <FROM> UNTIL <TO>
  ORDER BY sessions DESC
```

Expect this to be much lower than 4c. Most ChatGPT clicks carry no referrer.

Optional, when the user asks about bots or devices: add `WHERE human_or_bot_session = 'human'`, or group 4c by `session_device_type`.

## Step 5. Orders and revenue

`total_sales` includes taxes and shipping; `net_sales` does not (S5). Report `total_sales` and say so, unless the user asks for net.

**5a. Store total:**

```
FROM sales
  SHOW orders, total_sales, net_sales
  SINCE <FROM> UNTIL <TO>
```

**5b. Orders whose last session carried the tag or the referrer:**

```
FROM sales
  SHOW orders, total_sales, net_sales
  WHERE order_utm_source CONTAINS 'chatgpt' OR order_utm_source CONTAINS 'openai'
    OR order_referrer_domain CONTAINS 'chatgpt'
  GROUP BY order_utm_source, order_utm_medium, order_referrer_domain
  SINCE <FROM> UNTIL <TO>
  ORDER BY total_sales DESC
```

**5c. Shopify's AI channel, last click** (S3, S7):

```
FROM sales
  SHOW orders, total_sales
  GROUP BY agentic_referring_channel WITH LAST_CLICK_ATTRIBUTION
  SINCE <FROM> UNTIL <TO>
  ORDER BY total_sales__last_click DESC
```

Use the `__last_click` columns of the `ChatGPT` row. If the query is refused because the dimension cannot be used with attribution, run it without the `WITH` clause and say which form you used.

Do not expect `agentic_sales_channel` to list ChatGPT (S6). A ChatGPT shopper pays on the store's own checkout (S23), so these are ordinary online store orders.

5b and 5c can count the same order. Never add them together. Report them side by side.

## Step 6. Paid or organic

Paid and organic ChatGPT visits are not separated by default (C5). Use these signals, in this order:

| Signal | Meaning | Strength |
|---|---|---|
| Landing URL contains `oppref=` | An ad click. `oppref` is OpenAI's click id (O6). | Strong, if Shopify kept the query string. |
| UTM values match the merchant's ad template (for example `utm_source=openai`, `utm_medium=paid`, a campaign id) | An ad click (O10). | Strong, if the template is known. |
| `utm_source=chatgpt.com` and no medium, no `oppref` | An organic citation (C1). | Good. |
| Referrer `chatgpt.com` only | ChatGPT, paid or organic unknown. | Weak. |

**6a. Aggregate check for the click id:**

```
FROM sessions
  SHOW sessions
  WHERE landing_page_url CONTAINS 'oppref='
  SINCE <FROM> UNTIL <TO>
```

If this returns 0 while the store ran ads in the range, do **not** report "no paid traffic". It is not confirmed that `landing_page_url` keeps the query string (C5). Report paid as "could not check from the landing URL" and rely on the UTM template.

**6b. Order level (only if the user wants it).** List the order ids first:

```
FROM sales
  SHOW total_sales
  WHERE order_utm_source CONTAINS 'chatgpt' OR order_utm_source CONTAINS 'openai'
    OR order_referrer_domain CONTAINS 'chatgpt'
  GROUP BY order_id, order_name
  SINCE <FROM> UNTIL <TO>
  ORDER BY total_sales DESC
  LIMIT 50
```

Then read their journeys (S10). Build each id as `gid://shopify/Order/<order_id>`.

`order-journeys.graphql`:

```graphql
query OrderJourneys($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Order {
      id
      name
      createdAt
      test
      cancelledAt
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      customerJourneySummary {
        ready
        daysToConversion
        firstVisit { ...Visit }
        lastVisit { ...Visit }
      }
    }
  }
}

fragment Visit on CustomerVisit {
  occurredAt
  landingPage
  referrerUrl
  source
  utmParameters { source medium campaign content term }
}
```

```bash
shopify store execute --store <store>.myshopify.com --json \
  --query-file order-journeys.graphql \
  --variables '{"ids":["gid://shopify/Order/1234567890"]}'
```

Classify each order from `lastVisit.landingPage` (look for `oppref=`), `lastVisit.utmParameters` and `lastVisit.referrerUrl`, using the table above. Notes:

- `ready: false` means Shopify has not finished the journey. Count the order as "not yet attributed".
- Leave out orders with `test: true`. Say how many were cancelled.
- Orders older than 60 days cannot be read without `read_all_orders` (S12). Do not ask for it. Say the order list covers the last 60 days only.
- `firstVisit` from ChatGPT and `lastVisit` from elsewhere is a real pattern (discovered in ChatGPT, bought later through search or email). Report those as "ChatGPT-assisted", separately.

## Step 7. What this report cannot see

Always include this paragraph, adapted to the findings:

- **Clicks with no tag and no referrer** land in Direct. Nothing in the store can recover them (C2).
- **Mobile depends on the tag.** In-app browsers rarely send a referrer, so a link that lost its tag is lost (C3).
- **2026-10-08 to 2026-10-15:** links in ChatGPT answers carried neither tag nor referrer, by a reported OpenAI bug. If the range touches these days, say that ChatGPT sessions are undercounted and Direct is inflated for them. The source is two trade reports, not an OpenAI statement (C4).
- **Last click only.** The order numbers credit the last session. A shopper who discovered the store in ChatGPT and came back another way is not in 5b.
- **Paid vs organic** is only as good as the campaign's UTM template (O10).
- **OpenAI's own numbers** (Ads Manager conversions) use OpenAI's attribution windows and include what its pixel saw. They will differ from the store's orders. This report does not read them.

## Step 8. If ShopifyQL is not available

Say so first. Then offer the smaller report:

1. Read recent orders with `read_orders` and classify them as in step 6b. The `orders` query cannot filter by UTM or referrer (S12), so page through the range and stop after 500 orders. State the cap. Use `orders(first: 50, after: $cursor, query: "created_at:>=<FROM> created_at:<=<TO>", sortKey: CREATED_AT, reverse: true) { pageInfo { hasNextPage endCursor } nodes { ... } }` and select the same order fields as in `order-journeys.graphql`.
2. Sessions: "could not check". Point the user to Analytics > Reports in the admin, sessions by referrer, filtered to `chatgpt`.

## Output

Use this template. Keep every "could not check" visible.

```markdown
## ChatGPT traffic report: <store name>

Range: <FROM> to <TO> (<timezone>). Currency: <CODE>. Source: the store's own analytics, read-only.

| Measure | Sessions | Orders | Revenue (<CODE>) | Share of store total |
|---|---|---|---|---|
| Store total | 48,210 | 1,304 | 96,412.50 | 100% |
| ChatGPT, Shopify's AI channel | 1,120 | 21 | 1,733.00 | 2.3% of sessions, 1.8% of revenue |
| ChatGPT, by UTM tag | 1,065 | 19 | 1,590.40 | 2.2% of sessions, 1.6% of revenue |
| ChatGPT, by referrer | 140 | 3 | 212.00 | 0.3% of sessions |
| of which paid (ad clicks) | 310 | 6 | 498.00 | |
| of which organic (citations) | 755 | 13 | 1,092.40 | |
| ChatGPT-assisted (first visit only) | could not check | 4 | 371.00 | |

Revenue is total sales (taxes and shipping included).
The three ChatGPT rows overlap. Do not add them.

### What this cannot see
<the paragraph from step 7>

### Could not check
- <item>: <reason>

### What to do next
- <one to three actions, for example: add utm_medium=paid to the ad template so paid and organic separate>
```

The figures above are an example of the layout, not data.

If the store runs ChatGPT Ads and the paid row is small or unknown, suggest the `chatgpt-tracking-check` skill from this repository.
