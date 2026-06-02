// This file is generated at build time by the deploy workflow
// (`.github/workflows/deploy.yml`) from the LAMPA_AUTOLOAD_PLUGINS env var.
//
// Format of LAMPA_AUTOLOAD_PLUGINS (JSON):
//   [{"url": "https://...", "name": "DisplayName"}, ...]
//
// Default (committed) is an empty list — autoload is opt-in.
// Do not edit by hand in production; the workflow overwrites this file
// before `npx gulp build_github`.

export default {
    plugins: []
}
