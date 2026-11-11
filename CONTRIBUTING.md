# Contributing

Short rules, because merchants run these skills with store access.

1. **Read-only stays read-only.** No pull request may add a mutation, a write scope, `--allow-mutations`, a theme edit, or a request that creates something at OpenAI.
2. **Markdown only.** No scripts, hooks, binaries or network calls of our own. No telemetry.
3. **Every platform fact needs a source.** Add or update a row in `references/chatgpt-facts.md` with the claim, the date you checked it, the URL, and the confidence. A field name that is not in the fact sheet does not go into a skill.
4. **Say what you ran.** If you ran a query or a command on a real store, add a line to `docs/TESTING.md` with the date and what you saw. Never include store names, order numbers, keys or customer data.
5. **Unknown is not zero.** A skill must report what it could not check.
6. **Plain English, short sentences.** No names or email addresses of people.

To report a stale fact, open an issue with the fact id (for example `S3`) and the link that shows the change.
