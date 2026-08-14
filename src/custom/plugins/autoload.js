/**
 * Pre-installed plugins (custom layer, Type 4).
 *
 * Source: public/autoload.json — copied next to index.html by gulp
 * (`sync_github` in gulpfile.js). Format: JSON array of
 * {url, name, author?} (a {plugins: [...]} wrapper is also accepted).
 * Omitted `author` falls back to Manifest.author (src/custom/core/manifest.js).
 *
 * Runs after Lampa boots. For each plugin in the list (json order preserved,
 * see install()): re-add it so name/author/order match autoload.json, keeping
 * the existing `status` so a disabled plugin stays disabled.
 *
 * CRITICAL: We do NOT use a "done" flag. The plugin's presence in Lampa's
 * own plugin list (Lampa.Plugins.get()) is the single source of truth.
 * This way:
 *   - If the user disables the plugin → it stays disabled on reload.
 *   - If the user removes the plugin → it gets re-installed (autoload
 *     guarantees it's present).
 *   - If the user disables then clears localStorage → it gets re-installed.
 *
 * A missing autoload.json (404) simply means no autoload — the self-hosted
 * template build has it removed on purpose.
 */
;(function init() {
    function norm(u) {
        return (u || '')
            .replace(/[?#].*$/, '')
            .replace(/[/]+$/, '')
            .replace(/^https?:[/][/]/i, '')
            .toLowerCase()
    }

    var installed = false

    function install(list) {
        if (!Array.isArray(list)) list = (list && list.plugins) || []

        // Reversed: the extensions list renders newest-first
        // (Plugins.get().reverse() in src/interaction/extensions/main.js), so
        // adding from the bottom up makes autoload.json order show top-down.
        list.slice().reverse().forEach(function (plugin) {
            if (!plugin || !plugin.url) return

            var target = norm(plugin.url)

            // Plugins.get() returns a shallow copy of the array, but the same
            // objects — remove() matches them by identity.
            var found = Lampa.Plugins.get().filter(function (p) {
                return norm(p.url) === target
            })

            // Drop existing entries and re-add one at the tail: this refreshes
            // name/author (older builds saved neither) and fixes the order.
            // push() is a no-op for an already-injected script, so re-adding
            // does not load the plugin twice.
            found.forEach(function (p) {
                Lampa.Plugins.remove(p)
            })

            var data = found[0] || { url: plugin.url, status: 1 }

            data.name   = plugin.name || 'Autoload'
            data.author = plugin.author || Lampa.Manifest.author

            Lampa.Plugins.add(data)
        })
    }

    function installAll() {
        if (installed) return
        installed = true

        fetch('autoload.json', { cache: 'no-cache' })
            .then(function (r) {
                return r.ok ? r.json() : []
            })
            .then(install)
            .catch(function () {})
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
