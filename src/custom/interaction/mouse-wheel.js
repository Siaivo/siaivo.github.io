import Storage from '../../core/storage/storage'
import Layer from '../../core/layer'
import Lang from '../../core/lang'
import Platform from '../../core/platform'
import Controller from '../../core/controller'
import Params from '../../interaction/settings/params'
import Settings from '../../interaction/settings/settings'
import Select from '../../interaction/select'
import Utils from '../../utils/utils'

// Ядро в Scroll (interaction/scroll.js:45) перетворює колесо на Navigator.move:
// фокус стрибає по елементах, а напрям залежить від половини екрана під курсором.
// Режим навігації «Мишка» існує лише в меню: у сховище пишемо navigation_type = 'mouse'
// плюс прихований прапорець, тож ядро й плагіни бачать звичайний «Пульт з мишкою»,
// хоч би як читали налаштування. Колесо перехоплюємо раніше (capture) і крутимо
// найближчий скрол на пікселі через його ж Scroll.wheel — фокус не чіпаємо.
// Ряди ще можна тягнути затиснутою лівою кнопкою.

const MODE = 'mouse_pc'
const FLAG = 'navigation_mouse_pc'
const DRAG_THRESHOLD = 8

let drag = null
let drag_frame = 0
let suppress_click = 0
let settle_timer = 0
let settle_el = null
let settle_final = 0

Lang.add({
    settings_param_navigation_mouse_pc: {
        uk: 'Мишка',
        en: 'Mouse',
        be: 'Мышка',
        zh: '鼠标',
        pt: 'Rato',
        bg: 'Мишка',
        he: 'עכבר',
        cs: 'Myš',
        ro: 'Mouse',
        fr: 'Souris',
        pl: 'Mysz',
        ru: 'Мышка'
    }
})

function mode(){
    let value = Storage.field('navigation_type')

    return value == 'mouse' && Storage.get(FLAG) === true ? MODE : value
}

// Новим користувачам на ПК вмикаємо режим одразу. Ядро пише 'platform' на кожному
// старті (Platform.init), а наш модуль виконується раніше, тож порожнє місце означає
// перший запуск. Тим, хто вже користувався, нічого не міняємо.
let first_launch = false

try {
    first_launch = window.localStorage.getItem('platform') === null
}
catch(e) {}

let params_init = Params.init.bind(Params)

// Після Params.init платформа вже визначена, а інтерфейс ще не будувався.
// nolisten: інакше device_input.js:24 перезавантажив би застосунок на старті.
Params.init = function(){
    params_init()

    if(first_launch && Platform.pc()) {
        Storage.set(FLAG, true, true)
        Storage.set('navigation_type', 'mouse', true)
    }
}

function showMode(el){
    let labels = Params.values.navigation_type
    let value  = mode()

    el.find('.settings-param__value').text(Lang.translate(value == MODE ? '#{settings_param_navigation_mouse_pc}' : labels[value] || ''))
}

// Пункт меню ядра пише вибране значення як є, тож підміняємо лише його обробник,
// як store.js робить для Hub. Список і поведінка ті самі, що в params.js:361.
Settings.listener.follow('open', (e) => {
    if(e.name !== 'more') {
        return
    }

    let el = e.body.find('[data-name="navigation_type"]')

    if(!el.length) {
        return
    }

    showMode(el)

    el.unbind('hover:enter').on('hover:enter', () => {
        let labels  = Params.values.navigation_type
        let current = mode()
        let items   = []

        for(let key in labels){
            items.push({title: Lang.translate(labels[key]), value: key, selected: key == current})

            if(key == 'mouse') {
                items.push({title: Lang.translate('#{settings_param_navigation_mouse_pc}'), value: MODE, selected: current == MODE})
            }
        }

        let enabled_name = Controller.enabled().name

        Select.show({
            title: Lang.translate('title_choice'),
            items: items,
            onBack: () => {
                Controller.toggle(enabled_name)
            },
            onSelect: (a) => {
                // Прапорець перший: зміна navigation_type перезавантажує застосунок (device_input.js:24)
                Storage.set(FLAG, a.value == MODE)
                Storage.set('navigation_type', a.value == MODE ? 'mouse' : a.value)

                showMode(el)

                Controller.toggle(enabled_name)
            }
        })
    })
})

// Поза ТВ-екраном Scroll і так нативний (scrollTop), там нам нічого робити
function enabled(){
    return mode() == MODE && Platform.screen('tv')
}

function find(target, horizontal){
    let selector = horizontal ? '.scroll--horizontal' : '.scroll:not(.scroll--horizontal)'
    let el = target.closest(selector)

    while(el && !el.Scroll) {
        el = el.parentElement && el.parentElement.closest(selector)
    }

    return el
}

// Тягнемо й показуємо стрілки лише в рядах стрічки й розширень (плагіни, Hub):
// у фільтрах, історії пошуку чи консолі горизонтальний скрол — це кнопки й текст, а не картки
function row(target){
    let el = find(target, true)

    if(el) {
        return el.closest('.items-line, .extensions__block') ? el : null
    }

    return plugRow(target)
}

// Ряди плагінів (nova_plus тощо) — не Scroll ядра, а свій елемент, що їде transform'ом
// у рамці з overflow:hidden. Спільна мова з ними одна — колесо: його вони вже крутять.
// Тож гортаємо їх синтетичним wheel на самому ряду, а крок (скільки пікселів плагін
// дає на одиницю deltaX) міряємо пробою по зсуву transform.
let ratios = new WeakMap()

// Ряди зі звичайною прокруткою (overflow-x: auto) гортаємо через scrollLeft — тут
// плагін ні до чого, і проба не потрібна. Рамка такого ряду — він сам.
let natives = new WeakSet()

// overflow-y: auto робить і overflow-x з visible на auto, тож текстова панель з довгим
// посиланням теж «гортається вбік». Ряд — лише без вертикальної прокрутки і з кнопками.
function scrollable(el){
    let style = window.getComputedStyle(el)
    let x     = style.overflowX == 'auto' || style.overflowX == 'scroll'
    let y     = (style.overflowY == 'auto' || style.overflowY == 'scroll') && el.scrollHeight > el.clientHeight + 1

    return x && !y && el.scrollWidth > el.clientWidth + 1 && Boolean(el.querySelector('.selector'))
}

// Браузер гортає такий ряд і сам (тачпад, смуга прокрутки) — стрілки мають це бачити
function nativeAdd(el){
    if(natives.has(el)) {
        return
    }

    natives.add(el)

    el.addEventListener('scroll', () => {
        if(arrows.el == el) {
            arrowsUpdate()
        }
    }, {passive: true})
}

// Пробуємо лише всередині скролу ядра: деінде (плеєр, віджети) чужий wheel міг би
// крутити гучність чи перемотку. І не на першому ж кандидаті: картка з overflow:hidden,
// з якої вилазить постер, теж «переповнена», а ряд — вище.
function plugRow(target){
    let candidates = []

    for(let el = target; el && el.parentElement; el = el.parentElement){
        if(el.matches('.scroll, .scroll__content, .scroll__body')) {
            return candidates.find(probe) || null
        }

        if(scrollable(el)) {
            nativeAdd(el)
            candidates.push(el)

            continue
        }

        let frame = el.parentElement

        if(el.scrollWidth > frame.clientWidth + 1 && window.getComputedStyle(frame).overflowX != 'visible') {
            candidates.push(el)
        }
    }

    return null
}

function shiftOf(el){
    if(natives.has(el)) {
        return -el.scrollLeft
    }

    let match = /translate(?:3d|X)?\(\s*(-?[\d.]+)px/.exec(el.style.transform || el.style.webkitTransform || '')

    return match ? parseFloat(match[1]) : 0
}

// bubbles:false — подія лише для обробника на самому ряду, до скролів ядра не дійде.
// Дельта в обох осях: плагіни гортають ряд хто по deltaX, хто по звичайному колесу (deltaY).
function plugWheel(el, delta){
    let ev = new WheelEvent('wheel', {deltaX: delta, deltaY: delta, cancelable: true})

    el.dispatchEvent(ev)

    return ev.defaultPrevented
}

// Штовхаємо на 10 і повертаємо назад (в одному кадрі — оком не видно).
// Біля правого краю вперед нема куди, тож пробуємо й у зворотний бік.
function probe(el){
    if(natives.has(el)) {
        return 1
    }

    if(ratios.has(el)) {
        return ratios.get(el)
    }

    let ratio = 0
    let sides = [10, -10]

    for(let i = 0; i < sides.length && !ratio; i++){
        let before = shiftOf(el)

        if(plugWheel(el, sides[i])) {
            ratio = Math.abs(shiftOf(el) - before) / 10

            plugWheel(el, -sides[i])
        }
    }

    ratios.set(el, ratio)

    return ratio
}

function plugMove(el, delta){
    // Без smooth: кожен новий плавний scrollBy (тачпад, подвійний клік по стрілці)
    // обриває попередній і губить решту його відстані
    if(natives.has(el)) {
        el.scrollLeft += delta

        return
    }

    let ratio = probe(el)

    if(ratio) {
        plugWheel(el, delta / ratio)
    }
}

// Стрілки — fixed на body, тож мають стати над шаром, у якому живе ряд: на сторінці
// це 12 (над .wrap і .navigation-bar, під .head), в оверлеї — його z-index + 1
// (розширення й Hub на 20, пошук на 50, вікна плагінів — які вже є)
function layer(el){
    let z = 12

    for(let node = el.parentElement; node && node != document.body; node = node.parentElement){
        let style = window.getComputedStyle(node)

        if(style.position == 'fixed' && style.zIndex != 'auto') {
            z = Math.max(z, parseInt(style.zIndex) + 1)
        }
    }

    return z
}

// Рамка ряду: у ядра й у звичайної прокрутки це сам ряд, у плагіна — батько,
// бо сам ряд ширший за екран
function frameOf(el){
    return el.Scroll || natives.has(el) ? el : el.parentElement
}

// На ТВ-екрані ряд домальовує картки лише до активної (line/module/items.js:69),
// а активну ставить фокус. Позначаємо останню видиму картку через hover:touch —
// він міняє активну без прокрутки, як дотик на сенсорі.
// Рахуємо від цільової позиції в координатах body: поки йде transition,
// getBoundingClientRect карток ще показує проміжне положення.
function touchVisible(el){
    let body  = el.Scroll.body(true)
    let left  = body.getBoundingClientRect().left
    let right = el.offsetWidth - el.Scroll.position()
    let items = body.children

    for(let i = items.length - 1; i >= 0; i--){
        if(items[i].getBoundingClientRect().left - left < right && !items[i].classList.contains('card-more')) {
            if(el.closest('.extensions__block')) {
                focusQuiet(el, items[i])
            }
            else {
                Utils.trigger(items[i], 'hover:touch')
            }

            break
        }
    }
}

// Картка фільму так само домальовує ряди лише до активного + 3 (components/full.js:onScroll),
// а активним ряд стає, коли картка в ньому дістає hover:touch чи фокус. Колесо не робить
// ні того, ні іншого — тож позначаємо останній видимий ряд з картками, як у touchVisible.
function touchRows(el){
    let body  = el.Scroll.body(true)
    let top   = body.getBoundingClientRect().top
    let limit = el.offsetHeight - el.Scroll.position()
    let rows  = body.children

    for(let i = rows.length - 1; i >= 0; i--){
        if(rows[i].getBoundingClientRect().top - top >= limit) {
            continue
        }

        // Лише ряди карток, як у row(): у кнопок опису чи фільтрів hover:touch
        // переставив би, куди піде фокус з пульта
        let line = rows[i].querySelector('.items-line .scroll--horizontal, .extensions__block .scroll--horizontal')

        if(line && line.Scroll) {
            touchVisible(line)

            return
        }

        // Сітка каталогу (items/category) тримає в DOM лише сторінки по 60 карток
        // довкола активної (onPageView) — решта підміняється заглушками
        let cards = rows[i].querySelectorAll('.card')

        for(let j = cards.length - 1; j >= 0; j--){
            if(cards[j].getBoundingClientRect().top - top < limit) {
                Utils.trigger(cards[j], 'hover:touch')

                return
            }
        }
    }
}

// Ряд розширень (extensions/line.js:attach) теж домальовує лише до активного, але
// hover:touch не слухає — активний ставить hover:focus, який ще й підкручує ряд до
// картки. Підкрутку на цей час глушимо, щоб ряд не смикався під курсором.
function focusQuiet(el, item){
    let update = el.Scroll.update

    el.Scroll.update = () => {}

    try {
        Utils.trigger(item, 'hover:focus')
    }
    finally {
        el.Scroll.update = update
    }
}

// Те саме, що scrollEnded у ядрі: Scroll.shift його не викликає
function scrolled(el){
    let scroll = el.Scroll

    if(scroll.onScroll) {
        scroll.onScroll(-scroll.position())
    }
    else {
        Layer.visible(el)
    }

    if(scroll.onEnd && scroll.isEnd()) {
        scroll.onEnd()
    }
}

function wheel(e){
    // !isTrusted — наш же plugWheel, він для плагіна
    if(!enabled() || !e.isTrusted) {
        return
    }

    // Ядро (core/switcher.js) після будь-якої клавіші вимикає мишу на всій сторінці
    // (pointer-events: none) і вмикає лише на mousemove — колесо без руху миші летить
    // у <html> і нічого не крутить. Будимо так само: ця подія пропаде, наступні дійдуть.
    if(e.target === document.documentElement) {
        document.dispatchEvent(new MouseEvent('mousemove', {clientX: e.clientX, clientY: e.clientY}))

        return
    }

    if(!e.target.closest || e.target.closest('.endless')) {
        return
    }

    let over_arrow = e.target.closest('.mouse-pc-arrow') && arrows.el

    // Колесо над стрілкою ряду плагіна: подія до ряду не дійде, тож бічне гортаємо самі,
    // а звичайне віддаємо сторінці під рядом — як над стрілкою ряду ядра
    if(over_arrow && !arrows.el.Scroll) {
        if(e.type == 'wheel') {
            if(Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                e.preventDefault()

                move(arrows.el, e.deltaX * (e.deltaMode == 1 ? 40 : e.deltaMode == 2 ? window.innerWidth : 1), true)
            }
            else {
                pixels(e, frameOf(arrows.el))
            }
        }

        return
    }

    // Стрілки лежать на body, поза скролами — колесо над ними належить їхньому ряду
    let target = over_arrow ? arrows.el : e.target

    // mousewheel ядра слухає теж — просто глушимо його, рахуємо лише по wheel
    if(e.type == 'mousewheel') {
        if(find(target, false) || find(target, true)) {
            e.stopPropagation()
        }

        return
    }

    // Плагіни (nova_plus тощо) вішають свій wheel усередині скролу ядра й крутять свої
    // ряди самі. Тож не забираємо подію одразу, а ловимо її на елементі під скролом —
    // після всіх вкладених обробників, але до wheel ядра на самому скролі.
    // Плагін забрав (preventDefault) — його справа, ні — крутимо як завжди.
    // Слухач із минулої події міг не спрацювати (плагін зупинив її вище) — знімаємо
    ungate()

    let el = below(target)

    if(!el) {
        pixels(e, target)

        return
    }

    let fn = (ev) => {
        if(ev !== e) {
            return
        }

        ungate()

        if(!ev.defaultPrevented) {
            pixels(e, target)
        }
    }

    el.addEventListener('wheel', fn, {passive: false})

    gate = {el, fn}
}

let gate = null

function ungate(){
    if(gate) {
        gate.el.removeEventListener('wheel', gate.fn)

        gate = null
    }
}

// Предок target, що лежить прямо під найближчим скролом ядра
function below(target){
    let el = target

    // Сам скрол (колесо над стрілкою — target підмінено на ряд): нижче нікого
    if(el.Scroll) {
        return null
    }

    while(el.parentElement) {
        if(el.parentElement.Scroll) {
            return el
        }

        el = el.parentElement
    }

    return null
}

function pixels(e, target){
    let dx = e.deltaX
    let dy = e.deltaY

    let horizontal = Math.abs(dx) > Math.abs(dy)
    let el = find(target, horizontal)

    if(!el) {
        // Бічний свайп повз ряд: не віддаємо ядру, бо воно рушить фокус вгору/вниз.
        // Над рядом зі звичайною прокруткою браузер гортає його сам — дію не глушимо.
        if(horizontal && find(target, false)) {
            e.stopPropagation()

            let own = row(target)

            if(!own || !natives.has(own)) {
                e.preventDefault()
            }
        }

        return
    }

    let page  = horizontal ? window.innerWidth : window.innerHeight
    let delta = (horizontal ? dx : dy) * (e.deltaMode == 1 ? 40 : e.deltaMode == 2 ? page : 1)

    e.stopPropagation()
    e.preventDefault()

    move(el, delta, horizontal)
}

// Головна стрічка має scroll_by_item: wheel() на будь-яку дельту стрибає на цілий ряд,
// і тачпад з десятками подій проганяє всю сторінку. Крутимо її теж на пікселі.
function move(el, delta, horizontal){
    if(el.Scroll) {
        let params  = el.Scroll.params()
        let by_item = params.scroll_by_item

        params.scroll_by_item = false

        el.Scroll.wheel(delta)

        params.scroll_by_item = by_item

        if(horizontal) {
            touchVisible(el)
        }

        settle(el)
    }
    else {
        plugMove(el, delta)
    }

    // Ряд домальовує картки лише після анімації (scrollEnded -> onScroll), тож одразу
    // правій стрілці вірити не можна: біля краю домальованого вона б зникла й знов з'явилась
    if(horizontal && arrows.el == el) {
        arrowsUpdate(true)

        let later = () => {
            if(arrows.el == el) {
                arrowsUpdate()
            }
        }

        setTimeout(later, 400)
        setTimeout(later, 900)
    }
}

// Ядро показує ряди (Layer.visible) і домальовує нові (onAnimateEnd) лише після
// transitionend. Колесо перезапускає анімацію на кожній події, тож при швидкій прокрутці
// вона не закінчується, і сторінка їде в ще приховані ряди. А біля краю домальованого
// startScroll і зовсім мовчки виходить. Тому кличемо це самі — одразу й далі не частіше
// ніж раз на 100 мс, і ще раз, коли анімація (0.3 с) точно доїхала.
function settle(el){
    clearTimeout(settle_final)

    settle_final = setTimeout(() => settleRun(el), 350)

    if(settle_timer) {
        settle_el = el

        return
    }

    settleRun(el)

    settle_timer = setTimeout(() => {
        settle_timer = 0

        if(settle_el) {
            let last = settle_el

            settle_el = null

            settle(last)
        }
    }, 100)
}

function settleRun(el){
    if(!el.isConnected) {
        return
    }

    // Тут, а не на кожну подію колеса: settle кличе не частіше ніж раз на 100 мс,
    // а сітка каталогу — це сотні getBoundingClientRect
    if(!el.classList.contains('scroll--horizontal')) {
        touchRows(el)
    }

    scrolled(el)

    if(el.Scroll.onAnimateEnd) {
        el.Scroll.onAnimateEnd()
    }
}

// Стрілки по краях ряду під курсором. Один fixed-шар на всю сторінку, а не в кожному ряду:
// розмітку рядів не чіпаємо, і стрілки не їдуть разом з карткою, на яку навели.
let arrows = {el: null, left: null, right: null, frame: 0, tick: 0}
let pointer = {x: 0, y: 0}

let chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'

function arrowsCreate(){
    let style = document.createElement('style')

    // Кольори як у фокусу Лампи: темна підкладка, при наведенні — білий з чорним
    style.textContent = `
        .mouse-pc .items-line .scroll--horizontal,
        .mouse-pc .items-line .scroll--horizontal *,
        .mouse-pc .extensions__block .scroll--horizontal,
        .mouse-pc .extensions__block .scroll--horizontal *{cursor:grab}
        .mouse-pc--drag,
        .mouse-pc--drag *{cursor:grabbing !important}
        .mouse-pc-arrow{position:fixed;z-index:12;width:3em;height:3em;margin-top:-1.5em;border-radius:50%;background:rgba(0,0,0,.7);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;visibility:hidden;box-shadow:0 .3em 1em rgba(0,0,0,.4);transition:opacity .15s ease-out,visibility .15s,background-color .15s ease-out,color .15s ease-out}
        .mouse-pc-arrow--visible{opacity:1;visibility:visible}
        .mouse-pc-arrow--instant{transition:none}
        .mouse-pc-arrow:hover{background:#fff;color:#000}
        .mouse-pc-arrow svg{width:1.4em;height:1.4em;transform:translateX(.05em)}
        .mouse-pc-arrow--left svg{transform:scaleX(-1) translateX(.05em)}
    `

    document.head.appendChild(style)

    bodyMode()

    // Нова активність прибирає ряд з-під курсору, а миша могла й не ворухнутись
    Lampa.Listener.follow('activity', arrowsHide)

    let sides = ['left', 'right']

    sides.forEach(side => {
        let arrow = document.createElement('div')

        arrow.className = 'mouse-pc-arrow mouse-pc-arrow--' + side
        arrow.innerHTML = chevron

        arrow.addEventListener('click', e => {
            e.stopPropagation()

            // швидкий другий клик у згаслу стрілку інакше відкрив би картку під нею
            suppress_click = Date.now() + 500

            if(arrows.el) {
                let page = frameOf(arrows.el).offsetWidth * 0.8

                move(arrows.el, side == 'left' ? -page : page, true)
            }
        })

        document.body.appendChild(arrow)

        arrows[side] = arrow
    })
}

// Праворуч є куди: ще не домальовані картки ряд додасть сам, щойно активна стане остання
function canRight(el){
    let scroll  = el.Scroll
    let content = el.querySelector('.scroll__content') || el
    let padding = parseInt(window.getComputedStyle(content).paddingLeft) || 0

    if(scroll.body(true).scrollWidth + padding * 2 - el.offsetWidth + scroll.position() <= 1) {
        return false
    }

    // Залишок за краєм буває кілька пікселів (padding, тінь) — останню картку вже видно цілком,
    // і стрілка лише смикнула б ряд. Рахуємо від цільової позиції, як у touchVisible.
    let body = scroll.body(true)
    let last = body.lastElementChild

    if(!last) {
        return false
    }

    let hidden = last.getBoundingClientRect().right - body.getBoundingClientRect().left - (el.offsetWidth - scroll.position())

    return hidden > 16
}

let placed = ''

function arrowsPlace(rect){
    let key = rect.top + ':' + rect.left + ':' + rect.right

    // arrowsFollow кличе щокадру — без змін не чіпаємо стилі, щоб не смикати перерахунок
    if(key == placed) {
        return
    }

    placed = key

    let top = rect.top + rect.height / 2

    arrows.left.style.top   = top + 'px'
    arrows.left.style.left  = (rect.left + 12) + 'px'
    arrows.right.style.top  = top + 'px'
    arrows.right.style.left = (rect.right - arrows.right.offsetWidth - 12) + 'px'
}

function arrowsUpdate(keep_right){
    let el = arrows.el

    if(!el || !el.isConnected) {
        arrowsHide()

        return
    }

    arrowsPlace(frameOf(el).getBoundingClientRect())

    // Ряд плагіна: цільовий зсув — в інлайн-transform, по ньому й рахуємо, як у touchVisible
    let shift = el.Scroll ? el.Scroll.position() : shiftOf(el)

    arrows.left.classList.toggle('mouse-pc-arrow--visible', shift < 0)
    if(!keep_right) {
        arrows.right.classList.toggle('mouse-pc-arrow--visible', el.Scroll ? canRight(el) : el.scrollWidth + shift - frameOf(el).clientWidth > 16)
    }
}

// Інший ряд: гасимо без анімації й ставимо на нове місце, інакше видима стрілка
// перелітала б туди за 0.15 с згасання
function arrowsAttach(el){
    if(arrows.el != el) {
        let sides = [arrows.left, arrows.right]

        let z = layer(el)

        sides.forEach(arrow => {
            arrow.classList.add('mouse-pc-arrow--instant')
            arrow.classList.remove('mouse-pc-arrow--visible')
            arrow.style.zIndex = z
        })

        arrows.el = el

        arrowsPlace(frameOf(el).getBoundingClientRect())

        // примусовий reflow, щоб transition:none спрацював до повернення анімації
        arrows.left.offsetWidth

        sides.forEach(arrow => arrow.classList.remove('mouse-pc-arrow--instant'))
    }

    arrowsUpdate()

    // Той самий ряд теж: висота скролу — за першою карткою, а довгі назви сусідніх
    // звисають нижче, тож arrowsFollow бачить курсор «поза рядом» і знаходить його ж
    if(!arrows.frame) {
        arrows.frame = requestAnimationFrame(arrowsFollow)
    }
}

// Ряд їде й без руху миші: вертикальна прокрутка, домальовування рядів, пульт.
// Поки стрілки на ряду, щокадру тримаємо їх на ньому, а коли ряд пішов з-під
// курсору — перескакуємо на той, що тепер під ним.
function arrowsFollow(){
    arrows.frame = 0

    let el = arrows.el

    if(!el) {
        return
    }

    // Вікно звузилось до не-ТВ екрана — режим вимкнувся, а цикл ще живий
    if(!enabled()) {
        arrowsHide()

        return
    }

    // Від'єднаний ряд плагіна лишається без батька — рамки в нього вже нема
    let rect  = el.isConnected ? frameOf(el).getBoundingClientRect() : null
    // Ряд перекрив інший шар (меню, налаштування, оверлей плагіна, відкриті пультом):
    // стрілки інакше малювались би й клікались крізь нього. Хіт-тест — раз на ~10 кадрів:
    // щокадру він смикав би розкладку на слабких ТВ-приставках, а шар і так відкривається не миттєво.
    let check = ++arrows.tick % 10 == 0 || !rect || pointer.y < rect.top || pointer.y > rect.bottom
    let under = check ? document.elementFromPoint(pointer.x, pointer.y) : null
    let covered = rect && under && !under.closest('.mouse-pc-arrow') && !frameOf(el).contains(under)

    if(!rect || covered || pointer.y < rect.top || pointer.y > rect.bottom) {
        let next  = under && under.closest && !under.closest('.endless') ? row(under) : null

        if(next) {
            arrowsAttach(next)
        }
        else {
            arrowsHide()
        }

        return
    }

    arrowsPlace(rect)

    arrows.frame = requestAnimationFrame(arrowsFollow)
}

function arrowsHide(){
    arrows.el = null

    if(arrows.frame) {
        cancelAnimationFrame(arrows.frame)

        arrows.frame = 0
    }

    if(arrows.left) {
        arrows.left.classList.remove('mouse-pc-arrow--visible')
        arrows.right.classList.remove('mouse-pc-arrow--visible')
    }
}

function hover(e){
    pointer.x = e.clientX
    pointer.y = e.clientY

    if(!enabled() || drag || !e.target.closest) {
        return
    }

    if(!arrows.left) {
        arrowsCreate()
    }

    // курсор на самій стрілці — ряд той самий
    if(e.target.closest('.mouse-pc-arrow')) {
        return
    }

    let el = row(e.target)

    if(!el || e.target.closest('.endless')) {
        if(arrows.el) {
            arrowsHide()
        }

        return
    }

    arrowsAttach(el)
}

function dragStart(e){
    if(!enabled() || e.button !== 0 || !e.target.closest) {
        return
    }

    let el = row(e.target)

    // Смугу прокрутки звичайного ряду тягне сам браузер — інакше ми гортали б назустріч
    if(el && natives.has(el) && e.target == el && e.offsetY >= el.clientHeight) {
        return
    }

    if(el) {
        // Без цього браузер виділяє назви карток і тягне постери як картинки
        e.preventDefault()

        drag = {el, x: e.clientX, moved: false}
    }
}

function dragMove(e){
    if(!drag) {
        return
    }

    // mouseup міг піти повз вікно (alt-tab, iframe) — тоді кнопку вже відпущено
    if(!(e.buttons & 1)) {
        dragEnd()

        return
    }

    let dx = e.clientX - drag.x

    if(!drag.moved && Math.abs(dx) < DRAG_THRESHOLD) {
        return
    }

    let el = drag.el

    if(!drag.moved) {
        document.body.classList.add('mouse-pc--drag')

        arrowsHide()

        // Ряд плагіна їде з CSS-transition — під курсором він би відставав
        if(!el.Scroll) {
            drag.transition = el.style.transition
            el.style.transition = 'none'
        }
    }

    drag.moved = true
    drag.x = e.clientX

    if(!el.Scroll) {
        plugMove(el, -dx)

        return
    }

    el.Scroll.shift(-dx)

    // Домальовування — раз на кадр, а не на кожен mousemove

    if(!drag_frame) {
        drag_frame = requestAnimationFrame(() => {
            drag_frame = 0

            touchVisible(el)
            scrolled(el)
        })
    }
}

function dragEnd(){
    // Після перетягування браузер усе одно шле click — він відкрив би картку
    if(drag && drag.moved) {
        suppress_click = Date.now() + 100

        if(!drag.el.Scroll) {
            drag.el.style.transition = drag.transition
        }
    }

    drag = null

    document.body.classList.remove('mouse-pc--drag')
}

function click(e){
    // повторні кліки по самій стрілці — це гортання далі, їх не глушимо
    if(Date.now() < suppress_click && !(e.target.closest && e.target.closest('.mouse-pc-arrow'))) {
        e.stopPropagation()
        e.preventDefault()
    }
}

document.addEventListener('wheel', wheel, {capture: true, passive: false})
document.addEventListener('mousewheel', wheel, {capture: true, passive: false})
document.addEventListener('mousedown', dragStart, true)
document.addEventListener('click', click, true)
window.addEventListener('mousemove', dragMove)
window.addEventListener('mousemove', hover)
window.addEventListener('mouseup', dragEnd)

// Клас для курсору grab: режим міняється лише з перезапуском, а екран — з розміром вікна
function bodyMode(){
    document.body.classList.toggle('mouse-pc', enabled())

    if(!enabled()) {
        arrowsHide()
    }
}

window.addEventListener('resize', bodyMode)
