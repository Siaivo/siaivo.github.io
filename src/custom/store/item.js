import Controller from '../../core/controller'
import Plugins from '../../core/plugins'
import Noty from '../../interaction/noty'
import Lang from '../../core/lang'
import Template from '../../interaction/template'
import Scroll from '../../interaction/scroll'
import Utils from '../../utils/utils'

/**
 * Картка плагіна в магазині Hub.
 *
 * Поля data: { name, author, descr, url, link, category, status }
 * status: 1 = active, 0 = disabled (dead)
 */
class StoreItem {
    constructor(data) {
        this.data = data
        this.html = null
    }

    create() {
        this.html = Template.js('hub_item')
        this.update()
    }

    update() {
        let el = this.html
        let data = this.data

        el.querySelector('.hub__item-author').innerText = data.author || ''
        el.querySelector('.hub__item-name').innerText = data.name || Lang.translate('extensions_no_name')

        let descr = el.querySelector('.hub__item-descr')
        if (descr) {
            descr.innerText = (data.descr || '').replace(/[\n\t\r]/g, ' ')
        }

        // Категорія-бейдж
        let badge = el.querySelector('.hub__item-category')
        if (badge && data.category) {
            badge.innerText = StoreItem.CATEGORY_LABELS[data.category] || data.category
        }

        // Статус: встановлений чи ні
        let included = el.querySelector('.hub__item-included')
        let installed = this.isInstalled()

        if (included) {
            included.classList.toggle('hide', !installed)
        }

        // Disabled badge для dead плагінів
        let disabled = el.querySelector('.hub__item-disabled')
        if (disabled) {
            disabled.classList.toggle('hide', data.status !== 0)
        }

        // HTTP/HTTPS protocol badge
        let proto = el.querySelector('.hub__item-proto')
        if (proto) {
            let url = data.url || data.link || ''
            let isHttps = url.slice(0, 6) === 'https:'
            proto.classList.toggle('hide', false)
            proto.classList.toggle('protocol-https', isHttps)
            proto.classList.toggle('protocol-http', !isHttps)
        }

        // Встановлений + status=1 → зелений бейдж "Встановлено"
        if (installed && data.status === 1) {
            if (included) included.classList.remove('hide')
        }
    }

    isInstalled() {
        let url = (this.data.link || this.data.url || '').toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '')
        return Plugins.get().some(p => {
            let pUrl = (p.url || '').toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '')
            return pUrl === url
        })
    }

    render() {
        return this.html
    }

    /**
     * Відкрити меню дій з плагіном
     */
    menu() {
        let data = this.data
        let controller = Controller.enabled().name
        let back = () => Controller.toggle(controller)

        if (data.status === 0) {
            Noty.show(Lang.translate('extensions_no_plugin') || 'Плагін недоступний')
            return
        }

        if (this.isInstalled()) {
            Noty.show(Lang.translate('extensions_ready') || 'Вже встановлено')
            return
        }

        // Встановлюємо
        Plugins.add({
            url: data.link || data.url,
            status: 1,
            name: data.name,
            author: data.author
        })

        Noty.show(Lang.translate('plugins_add_success') || 'Плагін встановлено')

        this.update()
    }
}

StoreItem.CATEGORY_LABELS = {
    video:       '🎬 Відео',
    iptv:        '📺 IPTV',
    theme:       '🎨 Теми',
    collections: '📚 Добірки',
    tracks:      '🎵 Доріжки',
    other:       '🔧 Інше'
}

export default StoreItem
