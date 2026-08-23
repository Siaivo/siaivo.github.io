import SettingsApi from '../../../interaction/settings/api'
import Settings from '../../../interaction/settings/settings'
import Extensions from '../../../interaction/extensions/extensions'
import ExtensionClass from '../../../interaction/extensions/extension'
import Manifest from '../../core/manifest'
import Plugins from '../../../core/plugins'
import Lang from '../../../core/lang'
import Reguest from '../../../utils/reguest'
import Layer from '../../../core/layer'
import Main from '../../../interaction/extensions/main'

/**
 * Компонент «Hub» — відкриває штатний Extensions overlay
 * з даними з Manifest.storeUrl (base.json з GitHub).
 *
 * base.json — плоский масив [{id, name, url, category, ...}].
 * loadCustomStore() очікує {results: [{title, results}]},
 * тому патчимо loadCustomStore для підтримки обох форматів.
 */

const CATEGORY_LABELS = {
    video: '🎬 Відео', iptv: '📺 IPTV', theme: '🎨 Теми',
    collections: '📚 Добірки', tracks: '🎵 Доріжки', other: '🔧 Інше'
}

function transformBaseJson(plugins) {
    const grouped = {}
    plugins.forEach(p => {
        const cat = p.category || 'other'
        if (!grouped[cat]) grouped[cat] = []
        grouped[cat].push(p)
    })
    return {
        results: Object.entries(grouped).map(([cat, items]) => ({
            title: CATEGORY_LABELS[cat] || cat,
            results: items.map(p => ({
                name: p.name, link: p.url, url: p.url,
                descr: p.description || '', author: p.author || '',
                status: p.dead ? 0 : 1
            }))
        }))
    }
}

// Патчимо loadCustomStore для підтримки base.json (плоский масив)
const MainClass = Main.default || Main
const _origLoad = MainClass.prototype.loadCustomStore

MainClass.prototype.loadCustomStore = function () {
    let params = this.params

    if (params.store && !params._baseJsonHandled) {
        params._baseJsonHandled = true
        this.appendLoader()

        let net = new Reguest()

        // Тимчасово патчимо Extension.visible ТІЛЬКИ на час завантаження нашого Hub:
        // нормалізоване порівняння URL для визначення "встановленого" плагіна.
        // Після завершення — відновлюємо оригінал.
        const _origVisible = ExtensionClass.prototype.visible

        ExtensionClass.prototype.visible = function () {
            _origVisible.call(this)

            let included = this.html.querySelector('.extensions__item-included')
            if (included && included.classList.contains('hide')) {
                let url = normalizeUrl(this.data.url || this.data.link)
                if (url) {
                    let isInstalled = Plugins.get().some(p => normalizeUrl(p.url) === url)
                    if (isInstalled) included.classList.remove('hide')
                }
            }
        }

        net.silent(params.store, (data) => {
            this.loader.remove()
            net = null

            // Відновлюємо оригінальний visible після завантаження даних
            ExtensionClass.prototype.visible = _origVisible

            // base.json — плоский масив → трансформуємо
            if (Array.isArray(data)) {
                data = transformBaseJson(data)
            }

            if (data.results && data.results.length) {
                if (params.with_installed) {
                    this.appendLine(Plugins.get().reverse(), {
                        title: Lang.translate('extensions_from_memory'),
                        type: 'installs',
                        autocheck: true
                    })
                }

                data.results.forEach(a => {
                    if (a.results && a.results.length) {
                        this.appendLine(a.results, {
                            title: a.title || 'Невідомо',
                            type: 'extensions',
                            hpu: a.hpu,
                            noedit: true,
                            autocheck: true
                        })
                    }
                })

                if (params.with_installed) this.add()

                this.items.slice(0, 3).forEach(i => i.display())

                Layer.visible(this.html)
                this.toggle()
            } else {
                this.error()
            }
        }, () => {
            if (this.loader) this.loader.remove()
            net = null

            // Відновлюємо оригінальний visible у випадку помилки
            ExtensionClass.prototype.visible = _origVisible

            this.error()
        })

        return
    }

    _origLoad.call(this)
}

function normalizeUrl(u) {
    return (u || '').toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^https?:\/\//, '')
}

SettingsApi.addComponent({
    component: 'hub',
    name: 'Hub',
    icon: '<svg width="37" height="37" viewBox="0 0 37 37" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="33" height="33" rx="4" stroke="white" stroke-width="2.5"/><circle cx="12" cy="12" r="3" fill="white"/><circle cx="25" cy="12" r="3" fill="white"/><circle cx="12" cy="25" r="3" fill="white"/><circle cx="25" cy="25" r="3" fill="white"/><line x1="15" y1="12" x2="22" y2="12" stroke="white" stroke-width="2"/><line x1="12" y1="15" x2="12" y2="22" stroke="white" stroke-width="2"/><line x1="25" y1="15" x2="25" y2="22" stroke="white" stroke-width="2"/><line x1="15" y1="25" x2="22" y2="25" stroke="white" stroke-width="2"/></svg>'
})

Settings.listener.follow('open', function (e) {
    if (e.name !== 'main') return

    let el = e.body.find('[data-component="hub"]')
    if (!el.length) return

    el.unbind('hover:enter').on('hover:enter', () => {
        Extensions.show({
            store: Manifest.storeUrl,
            with_installed: false
        })
    })

    let plugins = e.body.find('[data-component="plugins"]')
    if (plugins.length) {
        plugins.after(el.detach())
    }
})
