import config from './autoload.config'

/**
 * Build-time pre-installed plugins (custom layer, Type 4).
 *
 * Runs after Lampa boots. For each plugin in `config.plugins`:
 *   1. Check if a plugin with the same normalized URL is already installed.
 *   2. Only if the plugin is NOT in the installed list, call
 *      Lampa.Plugins.add() — this persists to localStorage and injects
 *      the plugin script via push().
 *
 * CRITICAL: We do NOT use a "done" flag. The plugin's presence in Lampa's
 * own plugin list (Lampa.Plugins.get()) is the single source of truth.
 * This way:
 *   - If the user disables the plugin → it stays disabled on reload.
 *   - If the user removes the plugin → it gets re-installed (autoload
 *     guarantees it's present).
 *   - If the user disables then clears localStorage → it gets re-installed.
 *
 * Source: src/custom/plugins/autoload.config.js (overwritten at build
 * time from the LAMPA_AUTOLOAD_PLUGINS GitHub Actions variable).
 */
;(function init() {
    if (!config || !Array.isArray(config.plugins) || !config.plugins.length) return

    function norm(u) {
        return (u || '')
            .replace(/[?#].*$/, '')
            .replace(/[/]+$/, '')
            .replace(/^https?:[/][/]/i, '')
            .toLowerCase()
    }

    var installed = false

    function installAll() {
        if (installed) return
        installed = true

        config.plugins.forEach(function (plugin) {
            if (!plugin || !plugin.url) return

            var list = Lampa.Plugins.get()
            var target = norm(plugin.url)

            var found = list.some(function (p) {
                return norm(p.url) === target
            })

            if (!found) {
                Lampa.Plugins.add({
                    url: plugin.url,
                    name: plugin.name || 'Autoload',
                    status: 1
                })
            }
        })
    }

    function tryInstall() {
        if (!window.Lampa || !Lampa.Listener) {
            setTimeout(tryInstall, 100)
            return
        }

        // Primary path: wait for 'app ready' event (fired in src/app.js:733
        // AFTER Plugins.init() at line 569). At that point Plugins._loaded
        // is already synced from localStorage, so Plugins.add() merges
        // instead of overwriting user-installed plugins.
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') installAll()
        })

        // Safety net: if 'app ready' never fires (e.g. user is stuck on
        // LangChoice and startApp() never runs), try anyway after 30s.
        setTimeout(function () {
            if (!installed) installAll()
        }, 30000)
    }

    tryInstall()
})()
