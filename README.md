# Lampa Source (Fork)

[![AI Ready](https://img.shields.io/badge/AI--Ready-yes-brightgreen?style=flat)](https://github.com/johnpapa/ai-ready)

This repository is a fork of the original Lampa source:
https://github.com/yumata/lampa-source

It includes custom project-specific changes and overrides that are not part of the upstream repository.

Ideas and pull requests are welcome.

MSX app repository: https://github.com/yumata/lampa

## Run Locally

1. Install dependencies:
   `npm install`
2. Start the dev server:
   `npm run start`
3. Open:
   `http://localhost:3000`

## Documentation

Generate local docs:
`npm run doc`

Then open:
`build/doc/index.html`

## Upgrade to 3.0

Version 3.0 introduced major project structure and codebase changes.
Read the [migration guide](UPGRADE.md) before upgrading.

## Contributing

1. Fork, branch, and open a PR against `rework`.
2. Put fork behavior in `src/custom/*` (registered in `src/custom/index.js`) — don't edit `src/*` directly.
3. Run `npm test` and `npx gulp build_github` before pushing.

See [AGENTS.md](AGENTS.md) for conventions and [CHANGELOG.md](CHANGELOG.md) for release notes.
