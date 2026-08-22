import Controller from '../../core/controller'
import Scroll from '../../interaction/scroll'
import Lang from '../../core/lang'
import Reguest from '../../utils/reguest'
import Layer from '../../core/layer'
import Template from '../../interaction/template'
import Noty from '../../interaction/noty'
import HeadBackward from '../../interaction/head/backward'
import Manifest from '../../core/manifest'
import StoreItem from './item'

let overlay = null

/**
 * Повноекранний overlay магазину Hub.
 *
 * Завантажує store з Manifest.storeUrl, групує плагіни по категоріях,
 * рендерить горизонтальні рядки з картками.
 *
 * Формат JSON: { results: [{ title, results: [{ name, link, url, descr, author, status }] }] }
 * Або плоский масив base.json — трансформується on-the-fly.
 */
class HubOverlay {
    constructor() {
        this.items = []      // StoreItem[]
        this.lines = []      // { title, items: StoreItem[], el }
        this.active = 0
        this.scroll = null
        this.html = null
        this.loading = true
    }

    create() {
        this.html = Template.js('hub')

        this.scroll = new Scroll({ mask: true })
        this.scroll.onWheel = (step) => {
            if (step > 0) this.down()
            else this.up()
        }

        this.scroll.append(HeadBackward('Hub', true))
        this.scroll.height()

        this.html.querySelector('.hub__body').appendChild(this.scroll.render(true))

        this.appendLoader()
        this.fetch()
    }

    fetch() {
        let net = new Reguest()
        let url = Manifest.storeUrl

        net.silent(url, (data) => {
            this.loader.remove()
            this.loading = false
            net = null

            // Підтримуємо два формати:
            // 1) store.json: { results: [{ title, results: [...] }] }
            // 2) base.json:  [{ id, name, url, category, ... }]  — плоский масив
            let categories

            if (data.results && data.results.length && data.results[0].results) {
                // Вже згруповано (store.json)
                categories = data.results
            } else if (Array.isArray(data)) {
                // Плоский масив (base.json) — групуємо on-the-fly
                categories = HubOverlay.groupByCategory(data)
            } else {
                this.error()
                return
            }

            categories.forEach(category => {
                if (category.results && category.results.length) {
                    this.appendLine(category.results, category.title)
                }
            })

            if (this.lines.length) {
                this.items.slice(0, 3).forEach(i => this.displayItem(i))
            }

            Layer.visible(this.html)
            this.toggle()
        }, () => {
            if (this.loader) this.loader.remove()
            this.loading = false
            net = null
            this.error()
        })
    }

    appendLoader() {
        this.loader = document.createElement('div')
        this.loader.classList.add('broadcast__scan')
        this.loader.appendChild(document.createElement('div'))
        this.scroll.body(true).appendChild(this.loader)
    }

    error() {
        let empty = new Lampa.Empty()
        this.scroll.body(true).appendChild(empty.render(true))
    }

    appendLine(data, title) {
        let line = {
            title: title,
            items: [],
            el: null,
            scroll: null,
            active: 0
        }

        // Створюємо контейнер рядка
        let block = document.createElement('div')
        block.classList.add('hub__block', 'layer--visible', 'layer--render')

        let head = document.createElement('div')
        head.classList.add('hub__block-head')
        head.innerHTML = '<div class="hub__block-title">' + (title || '') + '</div>'
        block.appendChild(head)

        let body = document.createElement('div')
        body.classList.add('hub__block-body')
        block.appendChild(body)

        // Горизонтальний scroll для рядка
        let lineScroll = new Scroll({ horizontal: true, step: window.innerWidth / 4 })
        lineScroll.onWheel = (step) => {
            if (!Controller.own(line)) this.focusLine(line)
            let dir = step > 0 ? 'right' : 'left'
            Controller.enabled().controller[dir]()
        }
        lineScroll.onScroll = () => this.attachItems(line)

        body.appendChild(lineScroll.render(true))

        line.el = block
        line.scroll = lineScroll

        this.scroll.body(true).appendChild(block)
        this.lines.push(line)

        // Додаємо картки
        data.forEach(d => {
            let item = new StoreItem(d)
            item.create()

            item.render().addEventListener('hover:focus', () => {
                line.active = line.items.indexOf(item)
                line.scroll.update(item.render(), true)
            })

            item.render().addEventListener('hover:enter', () => {
                item.menu()
            })

            line.scroll.body(true).appendChild(item.render())
            line.items.push(item)
            this.items.push(item)
        })
    }

    displayItem(item) {
        // Lazy visibility (for virtual scroll)
        Layer.visible(item.render())
    }

    attachItems(line) {
        let size = line.items.length
        line.items.forEach(i => Layer.visible(i.render()))
        Layer.visible(line.scroll.render(true))
    }

    focusLine(line) {
        this.active = this.lines.indexOf(line)
        if (line.items.length) {
            Controller.collectionSet(line.el)
            line.items[line.active] && Controller.focus(line.items[line.active].render())
        }
    }

    down() {
        this.active++
        this.active = Math.min(this.active, this.lines.length - 1)
        this.focusLine(this.lines[this.active])
    }

    up() {
        this.active--
        this.active = Math.max(0, this.active)
        this.focusLine(this.lines[this.active])
    }

    render() {
        return this.html
    }

    toggle() {
        Controller.add('hub', {
            toggle: () => {
                Controller.collectionSet(this.html)
                if (this.lines.length) {
                    this.focusLine(this.lines[this.active])
                }
            },
            back: this.onBack
        })
        Controller.toggle('hub')
    }

    destroy() {
        this.lines.forEach(l => {
            l.scroll && l.scroll.destroy()
        })
        this.scroll && this.scroll.destroy()
        this.html && this.html.remove()
    }

    /**
     * Групує плоский масив base.json по category.
     * Повертає [{ title, results: [{ name, link, url, descr, author, status }] }]
     */
    static groupByCategory(plugins) {
        const CATEGORY_LABELS = {
            video:       '🎬 Відео',
            iptv:        '📺 IPTV',
            theme:       '🎨 Теми',
            collections: '📚 Добірки',
            tracks:      '🎵 Доріжки',
            other:       '🔧 Інше'
        }

        const grouped = {}

        plugins.forEach(p => {
            let cat = p.category || 'other'

            if (!grouped[cat]) grouped[cat] = []

            grouped[cat].push(p)
        })

        return Object.entries(grouped).map(([cat, items]) => ({
            title: CATEGORY_LABELS[cat] || cat,
            results: items.map(p => ({
                name:   p.name,
                link:   p.url,
                url:    p.url,
                descr:  p.description || '',
                author: p.author || '',
                status: p.dead ? 0 : 1
            }))
        }))
    }
}

/**
 * Показати / сховати overlay
 */
function show() {
    if (overlay) return

    let controller = Controller.enabled().name

    overlay = new HubOverlay()

    overlay.onBack = () => {
        overlay.destroy()
        overlay = null
        document.body.toggleClass('ambience--enable', false)
        Controller.toggle(controller)
    }

    overlay.create()

    document.body.toggleClass('ambience--enable', true)
    document.body.appendChild(overlay.render(true))

    overlay.toggle()
}

export default { show }
