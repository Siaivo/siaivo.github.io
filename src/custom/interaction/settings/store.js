import Settings from '../../../interaction/settings/settings'
import Extensions from '../../../interaction/extensions/extensions'
import Template from '../../../interaction/template'
import ExtensionClass from '../../../interaction/extensions/extension'
import Manifest from '../../core/manifest'
import Plugins from '../../../core/plugins'
import Lang from '../../../core/lang'
import Reguest from '../../../utils/reguest'
import Layer from '../../../core/layer'
import Main from '../../../interaction/extensions/main'
import Select from '../../../interaction/select'

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
    collections: '📚 Добірки', tracks: '🎵 Доріжки',
    control: '🎮 Керування', radio: '📻 Радіо', other: '🔧 Інше'
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

    // Гілка тільки для НАШОГО стора (Manifest.storeUrl).
    // Стори інших плагінів (params.store з іншим URL) ідуть штатним шляхом.
    if (params.store === Manifest.storeUrl && !params._baseJsonHandled) {
        params._baseJsonHandled = true
        this.appendLoader()

        let net = new Reguest()

        net.silent(params.store, (data) => {
            this.loader.remove()
            net = null

            // base.json — плоский масив → трансформуємо
            if (Array.isArray(data)) {
                data = transformBaseJson(data)
            }

            if (data.results && data.results.length) {
                if (params.with_installed) {
                    this.appendLine(Plugins.get().reverse(), {
                        title: Lang.translate('extensions_from_memory'),
                        type: 'installs',
                        autocheck: true,
                        hubStore: true
                    })
                }

                data.results.forEach(a => {
                    if (a.results && a.results.length) {
                        // Товар без status + autocheck => на картці малюється "Вимкнено".
                        // Для товарів стора "Вимкнено" не має сенсу — дефолимо в 1.
                        a.results.forEach(it => {
                            if (it.status === undefined) it.status = 1
                        })

                        this.appendLine(a.results, {
                            title: a.title || 'Невідомо',
                            type: 'extensions',
                            hpu: a.hpu,
                            noedit: true,
                            autocheck: true,
                            hubStore: true
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
            this.error()
        })

        return
    }

    _origLoad.call(this)
}

// Апстрім (71733ed8) лишив «Перевірити» в меню картки лише для type plugins/installs, а картки
// Hub - type extensions. Обробник (a.status -> check()) у ядрі є для всіх, тож повертаємо сам
// пункт першим, як було, - перехопивши Select.show лише на час побудови меню картки Hub.
const _origMenu = ExtensionClass.prototype.menu

ExtensionClass.prototype.menu = function () {
    if (!this.params || !this.params.hubStore) {
        return _origMenu.apply(this, arguments)
    }

    let show = Select.show

    Select.show = function (params) {
        Select.show = show

        if (params && Array.isArray(params.items) && !params.items.some(item => item.status)) {
            params.items.unshift({
                title: Lang.translate('extensions_check'),
                status: true
            })
        }

        return show.apply(this, arguments)
    }

    try {
        return _origMenu.apply(this, arguments)
    }
    finally {
        Select.show = show
    }
}

// Штатний магазин CUB після встановлення плагіна шле на CUB лічильник установок
// (/api/extensions/install). Сам магазин лишаємо, лічильник - ні: відповідаємо «не зараховано»,
// і картка просто не додає собі одиницю.
ExtensionClass.prototype.installSend = function (id, call) {
    if (call) {
        call(false)
    }
}

// Нормалізоване порівняння URL для визначення "встановленого" плагіна.
// Працює ВИКЛЮЧНО для карток нашого кастомного Hub (params.hubStore) —
// штатний магазин, CUB-списки та стори інших плагінів не зачіпаються.
const _origVisible = ExtensionClass.prototype.visible

function normalizeUrl(u) {
    return (u || '').toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^https?:\/\//, '')
}

ExtensionClass.prototype.visible = function () {
    _origVisible.call(this)

    if (!this.params || !this.params.hubStore) return

    // Якщо штатний included badge не показався — перевіряємо нормалізованим порівнянням
    let included = this.html.querySelector('.extensions__item-included')
    if (included && included.classList.contains('hide')) {
        let url = normalizeUrl(this.data.url || this.data.link)
        if (url) {
            let isInstalled = Plugins.get().some(p => normalizeUrl(p.url) === url)
            if (isInstalled) included.classList.remove('hide')
        }
    }
}

// Патчимо шаблон settings_main — додаємо статичний пункт Hub після «Плагіни».
// Ядро не чіпаємо; пункт з data-static="true", тож Main.update() не переприв'язує
// його hover:enter і плагіни (pogua1/modss/int) не можуть стерти наш бінд.
const settingsMainHtml = Template.string('settings_main')

if (settingsMainHtml && settingsMainHtml.indexOf('data-component="hub"') === -1) {
    Template.add(
        'settings_main',
        settingsMainHtml.replace(
            '        <div class="settings-folder__name">#{settings_main_plugins}</div>\n    </div>',
            `        <div class="settings-folder__name">#{settings_main_plugins}</div>
    </div>
    <div class="settings-folder selector" data-component="hub" data-static="true">
        <div class="settings-folder__icon">
            <svg width="37" height="37" viewBox="0 0 37 37" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="33" height="33" rx="4" stroke="white" stroke-width="2.5"/><circle cx="12" cy="12" r="3" fill="white"/><circle cx="25" cy="12" r="3" fill="white"/><circle cx="12" cy="25" r="3" fill="white"/><circle cx="25" cy="25" r="3" fill="white"/><line x1="15" y1="12" x2="22" y2="12" stroke="white" stroke-width="2"/><line x1="12" y1="15" x2="12" y2="22" stroke="white" stroke-width="2"/><line x1="25" y1="15" x2="25" y2="22" stroke="white" stroke-width="2"/><line x1="15" y1="25" x2="22" y2="25" stroke="white" stroke-width="2"/></svg>
        </div>
        <div class="settings-folder__name">Hub</div>
    </div>`
        )
    )
}

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
})
