---
name: chatgpt-ads-feed-fix
description: Find products that OpenAI rejected or holds with bad data in a ChatGPT Ads product feed, explain each problem, and say exactly what to fix in Shopify (title, image, price, GTIN, availability), plus fix stale prices and stock through the Delta API. Use when the user asks "why are my products not showing in ChatGPT ads?", "fix my ChatGPT product feed", "feed errors", "rejected products", "products missing from my Shopping campaign", or "OpenAI shows the wrong price".
license: MIT
compatibility: Needs the shopify-chatgpt-ads MCP server (OPENAI_ADS_API_KEY). Price and stock fixes need write tools. Optional - Avada's Measurement API (feed status and per-product issues) and read_products on the store.
metadata:
  facts-checked: "2026-11-13"
  version: "0.2.0"
---

# ChatGPT Ads feed fix

Answer: **which products cannot serve, why, and what to change - in Shopify, or at OpenAI through the Delta API.**

Fact ids such as (A14) point to `references/chatgpt-facts.md`; (O12) is the product field spec.

## Rules

1. **Shopify is the source.** Titles, descriptions, images, GTINs and policies are fixed in the Shopify admin (or by whatever app builds the feed). This skill tells the user what to change; it does not edit products.
2. **Only price, stock and title through the Delta API**, and only for variants already in the feed (A14). Show the list first and send only on the user's yes.
3. **Evidence per product.** Every finding names the product (item id and title), the field, what OpenAI holds and what it should be.
4. **Unknown is not zero.** If a list could not be read, say so; do not report "no issues".

## Steps

1. `list_feeds`: feeds with `product_count` (ads-eligible products OpenAI holds) and `countries`. A feed with 0 products after an upload is the first finding.
2. `list_feed_uploads` (with `feed_id`): the latest upload's `status`, `rows_accepted`, `rows_rejected`, `rows_ads_eligible` and `diagnostics`.
   - `missing_required_column`: the file lacks one of the nine required fields (O12).
   - `invalid_value` on `price`: format must be `79.99 USD`; on `gtin`: 8, 12, 13 or 14 digits with a valid check digit.
   - `failed` / `skipped`: nothing changed at OpenAI; the previous data is still live.
   - No upload record at all: the feed may be updated by another path (an app). Say so.
3. If Avada is connected: `measurement_get_feed_status` and `measurement_list_feed_issues` (page with `after`). They list per-product problems from the last snapshot (missing image, GTIN, price, rejected by OpenAI). If `unavailable`, continue with OpenAI's data only.
4. `query_feed_products` with no filter (OpenAI's own copy): compare `total_count` with the number of products the merchant expects. Spot-check prices and titles against the store (the user, `read_products`, or the public `/products/<handle>.js`, whose prices are integers in minor units).
5. Shopping campaigns: for each ad group, run its product filters through `query_feed_products`. `matched_count: 0` means the ad group can show nothing.
6. Group findings by fix:
   - **Fix in Shopify** (images, GTIN/barcode, brand/vendor, description, policies): give the product and the field to edit. A re-uploaded file did NOT change items OpenAI already held in Avada's test (A14); after editing, the change may need the Delta API (price, stock, title) or OpenAI's next full refresh.
   - **Fix at OpenAI now** (price, stock, title on existing variants): build one `update_feed_products` call. `product_id` = group id (item id when not grouped), `variant_id` = item id, price in major units with its currency. A price change is gated like a budget raise: the server asks the user, or returns a plan to show them and confirm with its `plan_id` after their yes.
7. On yes, send the Delta call. If OpenAI answers 422, nothing was applied: drop the variant ids it names (not in the feed; they need a full upload) and send the rest again. Check with `query_feed_products` after about a minute.

## Output

```markdown
## ChatGPT product feed check: <feed name> (<countries>)

OpenAI holds <n> ads-eligible products. Last upload: <status> on <date>, <accepted> accepted, <rejected> rejected.

| # | Product (item id) | Problem | OpenAI has | Should be | Fix where |
|---|---|---|---|---|---|

Ad groups with no matching product: <list or none>.

Price/stock fixes ready to send through the Delta API (<k> variants): send them? (yes / no)
```
