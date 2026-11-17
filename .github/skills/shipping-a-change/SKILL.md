---
name: shipping-a-change
description: What to update when you change something in this repo, and what "done" requires. Use before opening a pull request.
---

# Shipping a change

## Add a new fork override

1. `src/custom/<area>/<name>.js` — create it
2. `src/custom/index.js` — register the import
3. `public/autoload.json` — add `{url, name, author}` if pre-installed
4. `npx gulp build_github` — verify the bundle builds ES5-clean

## When you change this, also change that

| Change | Also update |
|---|---|
| `src/custom/**` (new file) | `src/custom/index.js` (register import) |
| `public/autoload.json` | rebuild; check order renders top-down |
| `gulpfile.js` build tasks | `.github/workflows/deploy.yml` + `ci.yml` if task names change |
| `index/github/**` template | rebuild; `build/` output is generated, never edited |
| `src/lang/*.js` | `public/lang/` via `lang_task`; `src/custom/lang/overrides.js` for fork strings |
| `docs/en/**` | mirror in `docs/ru/**` |

## Done

1. `npm test` passes and `npx gulp build_github` succeeds with the acorn ES5 check green.
2. Any behavior change ships with a vitest spec in `spec/` that fails without the change.
3. `public/autoload.json` still parses and order renders as intended if touched.
