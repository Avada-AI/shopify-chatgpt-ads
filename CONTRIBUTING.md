# Contributing

Short rules, because merchants run this with their ad account and their store.

## For every change

1. **Safety stays.** Creates stay paused. Nothing may activate, raise a budget or bid, or un-archive without the confirm + `plan_id` gate. Read-only mode registers no write tool. Keys never appear in output, logs or tool arguments. `test/safety.test.js` covers these; extend it, never loosen it.
2. **Every platform fact needs a source.** Add or update a row in `references/chatgpt-facts.md` with the claim, the date you checked it, the URL or the measurement, and the confidence. A field or endpoint that is not in the fact sheet does not go into the code or a skill.
3. **Unknown is not zero.** A tool or skill must report what it could not read.
4. **Say what you ran.** Run `npm run check`. If you ran anything against a real account or store, add a dated line to `docs/TESTING.md` (no store names, ids, keys or customer data). Never run writes against a real ad account in tests.
5. **Plain English, short sentences** in skills and docs. No names or email addresses of people.

## Skills

- `chatgpt-traffic-report`, `chatgpt-store-readiness` and the outside checks of `chatgpt-tracking-check` stay read-only and need no server: no mutation, no write scope, no `--allow-mutations`, no theme edit.
- The `chatgpt-ads-*` skills may use write tools only for what they describe, and always ask before acting.

## Code

Plain ESM JavaScript with JSDoc, Node.js 20+, two runtime dependencies (`@modelcontextprotocol/server`, `zod`) pinned to exact versions. Adding a dependency needs a reason in the pull request.

To report a stale fact, open an issue with the fact id (for example `A14`) and the link that shows the change.
