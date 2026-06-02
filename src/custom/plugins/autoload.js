import config from './autoload.config'

/**
 * Build-time pre-installed plugins (custom layer, Type 4).
 *
 * Runs after Lampa boots. For each plugin in `config.plugins`:
 *   1. Skip if the "done" flag for this URL is set in Lampa.Storage.
 *   2. Skip if a plugin with the same normalized URL is already installed.
 *   3. Otherwise call Lampa.Plugins.add() — this persists to localStorage
 *      and injects the plugin script via push() (same path BanderaOnline
 *      uses in ensureCommunityWatchesPlugin()).
 *   4. Set the "done" flag so the user can later remove/disable the
 *      plugin without it being re-installed on next launch.
 *
 * Source: src/custom/plugins/autoload.config.js (overwritten at build
 * time from the LAMPA_AUTOLOAD_PLUGINS GitHub Actions variable).
 */
;(function init() {
    if (!config || !Array.isArray(config.plugins) || !config.plugins.length) return

    function flagFor(url) {
        // djb2 hash → base36, stable per URL, short
        let hash = 5381
        for (let i = 0; i < url.length; i++) {
            hash = ((hash << 5) + hash) + url.charCodeAt(i)
            hash = hash | 0
        }
        return 'lampa_autoload_' + (hash >>> 0).toString(36)
    }

    function norm(u) {
        return (u || '')
            .replace(/[?#].*$/, '')
            .replace(/[/]+$/, '')
            .replace(/^https?:[/][/]/i, '')
            .toLowerCase()
    }

    function tryInstall() {
        if (!window.Lampa || !Lampa.Plugins || !Lampa.Storage) {
            setTimeout(tryInstall, 100)
            return
        }

        config.plugins.forEach(function (plugin) {
            if (!plugin || !plugin.url) return

            var flag = flagFor(plugin.url)

            if (Lampa.Storage.get(flag, false)) return

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

            Lampa.Storage.set(flag, true)
        })
    }

    tryInstall()
})()
