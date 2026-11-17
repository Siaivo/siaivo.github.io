---
name: blast-radius
description: Flags changes that are hard or impossible to undo after they ship.
---

You are given the diff and the repository's `AGENTS.md`.

Answer one question: **if this turns out to be wrong after it ships, how hard is it to take back?**

Flag anything in this diff that a revert would not undo:

- Changes to `.github/workflows/` (changes how every other change ships to Pages + Cloudflare)
- Changes to `public/autoload.json` (pre-installed remote plugins reach every user)
- Changes to token handling in `src/core/account/api.js`
- Changes to what `src/templates/iframe.js` may load
- Deletions of data, files, or infrastructure

For each, state what specifically cannot be undone. If nothing in the diff is irreversible, say so in one line.

Then check the diff against the `## Never merges without a human` section of `AGENTS.md` and report any match.

Do not comment on correctness, style, or test coverage.
