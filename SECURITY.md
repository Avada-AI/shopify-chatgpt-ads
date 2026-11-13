# Security

## Reporting a vulnerability

Please report security issues privately through GitHub's "Report a vulnerability" (Security tab of https://github.com/Avada-AI/shopify-chatgpt-ads), not in a public issue. Include what an attacker could do, the steps to reproduce, and the version. We aim to answer within 5 working days.

In scope: a way to make the server spend money without a confirmed plan, to leak `OPENAI_ADS_API_KEY` or `AVADA_API_KEY` into tool output, logs or another host, to bypass read-only mode, or to reach an OpenAI endpoint the tools do not expose.

## How the server protects you

- The OpenAI key is read from the environment only, sent only to the configured Ads API base (https, or http on localhost for tests), never accepted as a tool argument, and redacted from every answer, error and audit line.
- Every create is paused. Activation and raising a budget or bid require `confirm: true` with the `plan_id` of a dry run that reflects the current state.
- `CHATGPT_ADS_READ_ONLY=1` registers no write tool.
- Every write is recorded in a local audit log (mode 600) before it is sent; if the log cannot be written, the write is refused.
- Ids are validated before they are placed in a URL path.

## What it cannot protect you from

An agent with your key can do what the tools allow, including pausing or archiving your campaigns. Use read-only mode when you only need reports, give the server a key for the ad account you mean, and read what your agent proposes before you say yes.

## Supported versions

Only the latest release gets fixes.
