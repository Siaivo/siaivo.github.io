---
name: security-review
description: The security rules specific to this repo — trust boundaries, what must never be trusted, and what to check before merging. Use when touching account auth, iframe templates, or autoload.
---

# Security review

## Trust boundaries in this repo

- `public/autoload.json` → `src/custom/plugins/autoload.js`: remote plugin URLs execute as first-party JS in every client. Anyone who can edit this list ships code to all users.
- `src/templates/iframe.js`: the single choke point for embedded content. What it loads runs inside the app origin.
- `src/core/account/api.js` (`Permit.token`, `token_update`): CUB account session tokens. Read-only renewal — this code carries a token someone else issued, it never decides permissions.

## Never

- Commit a real `{domain}`/`{PREFIX}` value into `index/github/**` or `msx/start.json` — placeholders are replaced at deploy time from repo variables.
- Add an autoload entry pointing at a URL you don't control without a human reviewing it first.
- Broaden what `iframe.js` may load (new schemes, origins, sandbox relaxations) without a human.

## Before merging a change to `public/autoload.json`

1. Is every URL HTTPS and owned by a known author?
2. Does the order still render as intended (JSON order = top-down)?
3. Self-hosted template still ships `[]`?
