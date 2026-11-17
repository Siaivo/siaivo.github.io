# AGENTS.md

Fork of [yumata/lampa-source](https://github.com/yumata/lampa-source) — Lampa media-center web app (gulp + rollup + babel, ships one ES5 bundle).

## Commands

- Dev: `npm run start` (gulp watch + browser-sync, `http://localhost:3000`)
- Build: `npx gulp build_github` — output in `build/github/lampa/`
- Test: `npm test` (vitest, `spec/`)
- Docs: `npm run doc` → `build/doc/index.html`

## Conventions

- Never edit `src/*` for fork behavior. Put overrides in `src/custom/*` and register each file in `src/custom/index.js` (see `src/custom/README.MD` for the override types).
- Babel targets Chrome 38 / Safari 7 (`gulpfile.js`). Old engines (iOS 9, Android 4.4 WebView, PS3) hang on any ES6+ in the bundle — CI checks `app.min.js` with acorn `--ecma5`. No `fetch`, no arrow functions in shipped code paths.
- `public/autoload.json` is the pre-installed plugin list (remote URLs). `src/custom/plugins/autoload.js` re-adds entries newest-first, so JSON order renders top-down. `[]` in the self-hosted build is intentional.

## Adding a new plugin override

1. Create `src/custom/<area>/<name>.js`
2. Register it in `src/custom/index.js` (`import './<area>/<name>'`)
3. If pre-installed: add `{url, name, author}` to `public/autoload.json`
4. Verify: `npx gulp build_github`, then test on the target page

## Common pitfalls

- `merge` must run before `uglify_task` in any new gulp series — the bundle doesn't exist otherwise.
- The deploy patch flips `plugins_store:true→false` only in the gh-pages copy; if `app.min.js` loses `plugins_store:true`, the self-hosted build broke.
- `msx/start.json` `{domain}`/`{PREFIX}` placeholders are replaced at deploy time — never commit real values there.

## Maintenance matrix

| Change | Also update |
|---|---|
| `src/custom/**` (new file) | `src/custom/index.js` (register import) |
| `public/autoload.json` | `src/custom/plugins/autoload.js` if format changes; rebuild |
| `gulpfile.js` build tasks | `.github/workflows/deploy.yml` + `ci.yml` if task names change |
| `index/github/**` template | Rebuild; `build/` output is generated, never edited |
| `src/lang/*.js` | `public/lang/` via `lang_task`; `src/custom/lang/overrides.js` for fork strings |
| `docs/en/**` | Mirror in `docs/ru/**` (plugin docs are bilingual) |

Plugin docs live in `docs/` (Docusaurus-style markdown, en + ru). Generate API docs with `npm run doc`.

## Done means

1. `npm test` passes and `npx gulp build_github` succeeds with the acorn ES5 check green.
2. Any behavior change ships with a vitest spec in `spec/` that fails without the change.
3. `public/autoload.json` still parses and order renders as intended if touched.

## Never merges without a human

A person has to have **read this diff** before it lands. Telling an agent "merge it when you're done" is
approving a goal, not this change — so it does not count for anything on this list. Everywhere else it counts
fine, which is the point of having a list.

- Anything under `.github/workflows/` (ships to GitHub Pages + Cloudflare Workers)
- Anything in `public/autoload.json` (pre-installed remote code ships to every user)
- Anything touching `src/core/account/api.js` token handling (`token_update` session logic)
- Anything widening what `src/templates/iframe.js` may load
