# Shopify ChatGPT Ads

Agent skills that help a Shopify store sell through ChatGPT. Ask your AI agent (Claude Code, Codex, Cursor and others) how much ChatGPT really sends your store, whether your ChatGPT Ads tracking is right, and whether your catalog is ready.

> **Coming next:** an MCP server to manage ChatGPT ad campaigns from your agent (campaigns start paused, nothing spends without your yes), and measured orders and True ROAS through Avada's free Shopify app. Watch or star the repository to follow.

Three read-only Agent Skills that let an AI agent answer one question for a Shopify store:
**how much does ChatGPT really send this store, and is its ChatGPT Ads tracking right?**
They work with no app installed. Markdown only: no scripts, no hooks, no telemetry.

Not affiliated with Shopify or OpenAI. "Shopify" and "ChatGPT" are trademarks of their owners and are used here only to say what the skills work with.

Facts last verified: **2026-11-11** ([fact sheet](references/chatgpt-facts.md)). Status: v0.1.0, not yet run on a live store ([what was tested](docs/TESTING.md)).

## Who it is for

- **Agencies and freelancers** who look after several stores and need the same audit each time.
- **Technical merchants and marketers** who already use a coding agent (Claude Code, Codex, Cursor and others).

It is not a one-click tool for a merchant with no agent set up.

## The three skills

| Skill | Ask your agent | Needs | Never asks for |
|---|---|---|---|
| [`chatgpt-traffic-report`](skills/chatgpt-traffic-report/SKILL.md) | "How much traffic and sales is ChatGPT sending my store?" | Shopify CLI or another Admin API tool; scopes `read_reports`, `read_orders` | any write scope, customer scopes |
| [`chatgpt-tracking-check`](skills/chatgpt-tracking-check/SKILL.md) | "Is my ChatGPT Ads tracking set up correctly?" | `curl` or a browser tool. Optional: an OpenAI Advertiser API key in an environment variable (GET requests only) | a key pasted in chat, any write |
| [`chatgpt-store-readiness`](skills/chatgpt-store-readiness/SKILL.md) | "Is my store ready for ChatGPT?" | `curl`. Optional: scope `read_products` | any write scope |

### chatgpt-traffic-report

Counts ChatGPT sessions, orders and revenue three ways (Shopify's own AI referral channel, the `utm_source=chatgpt.com` tag, the referrer), explains why the three differ, and splits paid ad clicks from organic citations where the data allows. Sample of the output (layout only, not real data):

```
| Measure                        | Sessions | Orders | Revenue (USD) | Share of store total |
| Store total                    | 48,210   | 1,304  | 96,412.50     | 100%                 |
| ChatGPT, Shopify's AI channel  | 1,120    | 21     | 1,733.00      | 2.3% of sessions     |
| ChatGPT, by UTM tag            | 1,065    | 19     | 1,590.40      | 2.2% of sessions     |
| ChatGPT, by referrer           | 140      | 3      | 212.00        | 0.3% of sessions     |
| of which paid (ad clicks)      | 310      | 6      | 498.00        |                      |

What this cannot see: clicks that arrive with no tag and no referrer are filed as Direct...
```

### chatgpt-tracking-check

Audits conversion tracking from outside the store, whatever installed the pixel: OpenAI's own Shopify app, a third-party pixel app, a tag manager, or code pasted by hand. Sample:

```
| # | Check                  | Result          | Evidence                                   | Fix                      |
| 1 | Pixel present          | PASS            | oaiq("init") in home page, app block <x>   | none                     |
| 2 | Single install         | FAIL            | same pixel id also loaded by GTM-XXXX      | remove one of the two    |
| 3 | Waits for consent      | FAIL            | init runs with no consent call             | gate it on store consent |
| 4 | Checkout events arrive | COULD NOT CHECK | no API key, no test session                | run a test session       |
```

### chatgpt-store-readiness

Scores product data (title, description, brand, image, price, availability, GTIN), structured data on product pages, access for OpenAI's crawlers in `robots.txt`, the agent discovery files, Shopify's agentic channel and the policy pages. Sample:

```
Score: 71.5 of 90 points checked (79%). 10 points not checked.
| A. Product data       | 29.5 / 40 | GTIN on 22% of variants                  |
| C. Crawler access     | 15 / 15   | OpenAI crawlers fall under *; none blocked |
| F. Policies           | 4 / 10    | no return window stated                   |
```

## Install

**Claude Code** (installs the whole repository as a plugin, fact sheet included):

```
/plugin marketplace add Avada-AI/shopify-chatgpt-ads
/plugin install shopify-chatgpt-ads@avada-ai
```

From a shell: `claude plugin marketplace add Avada-AI/shopify-chatgpt-ads`, then `claude plugin install shopify-chatgpt-ads@avada-ai`.

**Codex, Cursor, Copilot, OpenCode and most other agents** (through the open `skills` CLI, Node.js 22.20 or later):

```bash
npx skills add Avada-AI/shopify-chatgpt-ads
npx skills add Avada-AI/shopify-chatgpt-ads --skill chatgpt-traffic-report   # one skill
npx skills add Avada-AI/shopify-chatgpt-ads -a codex -g                      # one agent, all projects
```

This copies the three skill folders only. The fact sheet stays in this repository; each skill carries the facts it needs and the date they were checked.

**Codex and the ChatGPT desktop app, as a plugin:**

```bash
codex plugin marketplace add Avada-AI/shopify-chatgpt-ads
```

Then install it from the plugin browser. The root `plugin.json` is the portable Agent Plugins manifest. This path is documented by OpenAI but has not been tested by us.

**By hand:** copy a folder from `skills/` into your agent's skills directory (for example `.claude/skills/` or `.agents/skills/`).

## What it will never do

- **No writes.** No mutation, no `--allow-mutations`, no write scope. It never creates a pixel, a key, a campaign or an order.
- **No theme edits.** It never touches theme files, `robots.txt` or tracking code.
- **No scripts.** The repository is Markdown and three small JSON manifests. Nothing here executes.
- **No hooks, no telemetry, no network calls of its own.** The only requests are the ones your agent makes while it follows a skill: to your store, and to OpenAI's API if you supply a key.
- **No customer data.** It asks for aggregates first and never requests customer scopes. Order-level reads happen only when you ask for them.
- **No guesses presented as numbers.** A check that could not run is reported as "could not check", never as zero or as a pass.

Read each `SKILL.md` before you install it. A skill runs with your agent's permissions.

## What it cannot see

Most clicks from ChatGPT arrive with no referrer, and on mobile the UTM tag is often the only signal. A click with no tag and no referrer is filed as Direct, and nothing in the store can recover it. From about 8 to 15 October 2026, links in ChatGPT answers carried neither, according to trade press reports. The traffic report states these limits in every result.

## How facts are kept current

- Every platform fact the skills rely on is in [`references/chatgpt-facts.md`](references/chatgpt-facts.md): the claim, the date it was checked, the source, and how sure we are.
- Facts are re-read at the source before each release. Each skill's front matter carries the date (`facts-checked`).
- Some things could not be confirmed. They are listed at the end of the fact sheet, and the skills tell the agent to check them on the store.
- Found a stale or wrong fact? Open an issue with the source link. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Going further

These skills diagnose; they do not fix. For what they find:

- Product data and policies are fixed in the Shopify admin.
- Tracking is fixed in whatever installed the pixel. OpenAI publishes its own Shopify app, and several third-party pixel apps exist.
- The team that publishes these skills also makes **Avada ChatGPT Ads**, a Shopify app that installs OpenAI's pixel and server-side Conversions API events with one event id per event and follows the store's consent settings. Install: https://apps.shopify.com/avada-chatgpt-pixel. Documentation: https://docs.avada.io/chatgpt-ads. The skills do not need it and do not check for it.

## Licence

[MIT](LICENSE). Copyright Avada.

Not affiliated with Shopify or OpenAI.
