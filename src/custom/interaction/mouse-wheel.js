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

Lang.add({
    settings_param_navigation_mouse_pc: {
        uk: 'Мишка (експериментально)',
        en: 'Mouse (experimental)',
        be: 'Мышка (эксперыментальна)',
        zh: '鼠标（实验性）',
        pt: 'Rato (experimental)',
        bg: 'Мишка (експериментално)',
        he: 'עכבר (ניסיוני)',
        cs: 'Myš (experimentální)',
        ro: 'Mouse (experimental)',
        fr: 'Souris (expérimental)',
        pl: 'Mysz (eksperymentalne)',
        ru: 'Мышка (экспериментально)'
    }
})

function mode(){
    let value = Storage.field('navigation_type')

    return value == 'mouse' && Storage.get(FLAG, false) === true ? MODE : value
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

    while(el && !el.Scroll){
        el = el.parentElement && el.parentElement.closest(selector)
    }

    return el
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
        if(items[i].getBoundingClientRect().left - left < right && !items[i].classList.contains('card-more')){
            Utils.trigger(items[i], 'hover:touch')

            break
        }
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
    if(!enabled() || !e.target.closest || e.target.closest('.endless')) {
        return
    }

    // mousewheel ядра слухає теж — просто глушимо його, рахуємо лише по wheel
    if(e.type == 'mousewheel'){
        if(find(e.target, false) || find(e.target, true)) {
            e.stopPropagation()
        }

        return
    }

    let dx = e.deltaX
    let dy = e.deltaY

    if(e.shiftKey && !dx){
        dx = dy
        dy = 0
    }

    let horizontal = Math.abs(dx) > Math.abs(dy)
    let el = find(e.target, horizontal)

    if(!el) {
        // Бічний свайп повз ряд: не віддаємо ядру, бо воно рушить фокус вгору/вниз
        if(horizontal && find(e.target, false)){
            e.stopPropagation()
            e.preventDefault()
        }

        return
    }

    let page  = horizontal ? window.innerWidth : window.innerHeight
    let delta = (horizontal ? dx : dy) * (e.deltaMode == 1 ? 40 : e.deltaMode == 2 ? page : 1)

    e.stopPropagation()
    e.preventDefault()

    // сторінка поїде, а стрілки стоять fixed — сховаємо до наступного руху миші
    if(!horizontal) {
        arrowsHide()
    }

    move(el, delta, horizontal)
}

// Головна стрічка має scroll_by_item: wheel() на будь-яку дельту стрибає на цілий ряд,
// і тачпад з десятками подій проганяє всю сторінку. Крутимо її теж на пікселі.
function move(el, delta, horizontal){
    let params  = el.Scroll.params()
    let by_item = params.scroll_by_item
    let before  = el.Scroll.position()

    params.scroll_by_item = false

    el.Scroll.wheel(delta)

    params.scroll_by_item = by_item

    if(horizontal) {
        touchVisible(el)
    }

    // Уперлися в край домальованого: startScroll ядра мовчки виходить і не кличе
    // ні scrollEnded, ні onAnimateEnd, тож нові ряди й картки не з'являються
    if(el.Scroll.position() == before){
        scrolled(el)

        if(el.Scroll.onAnimateEnd) {
            el.Scroll.onAnimateEnd()
        }
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

// Стрілки по краях ряду під курсором. Один fixed-шар на всю сторінку, а не в кожному ряду:
// розмітку рядів не чіпаємо, і стрілки не їдуть разом з карткою, на яку навели.
let arrows = {el: null, left: null, right: null}

let chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'

function arrowsCreate(){
    let style = document.createElement('style')

    // Кольори як у фокусу Лампи: темна підкладка, при наведенні — білий з чорним
    style.textContent = `
        .mouse-pc .scroll--horizontal,
        .mouse-pc .scroll--horizontal *{cursor:grab}
        .mouse-pc--drag,
        .mouse-pc--drag *{cursor:grabbing !important}
        .mouse-pc-arrow{position:fixed;z-index:30;width:3em;height:3em;margin-top:-1.5em;border-radius:50%;background:rgba(0,0,0,.7);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;visibility:hidden;box-shadow:0 .3em 1em rgba(0,0,0,.4);transition:opacity .15s ease-out,visibility .15s,background-color .15s ease-out,color .15s ease-out}
        .mouse-pc-arrow--visible{opacity:1;visibility:visible}
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

        // mousedown ядро ловить для фокусу, а наш dragStart — для перетягування
        arrow.addEventListener('mousedown', e => e.stopPropagation())

        arrow.addEventListener('click', e => {
            e.stopPropagation()

            // швидкий другий клик у згаслу стрілку інакше відкрив би картку під нею
            suppress_click = Date.now() + 500

            if(arrows.el) {
                let page = arrows.el.offsetWidth * 0.8

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

    return scroll.body(true).scrollWidth + padding * 2 - el.offsetWidth + scroll.position() > 1
}

function arrowsUpdate(keep_right){
    let el = arrows.el

    if(!el || !el.isConnected) {
        arrowsHide()

        return
    }

    let rect = el.getBoundingClientRect()
    let top  = rect.top + rect.height / 2

    arrows.left.style.top   = top + 'px'
    arrows.left.style.left  = (rect.left + 12) + 'px'
    arrows.right.style.top  = top + 'px'
    arrows.right.style.left = (rect.right - arrows.right.offsetWidth - 12) + 'px'

    arrows.left.classList.toggle('mouse-pc-arrow--visible', el.Scroll.position() < 0)
    if(!keep_right) {
        arrows.right.classList.toggle('mouse-pc-arrow--visible', canRight(el))
    }
}

function arrowsHide(){
    arrows.el = null

    if(arrows.left) {
        arrows.left.classList.remove('mouse-pc-arrow--visible')
        arrows.right.classList.remove('mouse-pc-arrow--visible')
    }
}

function hover(e){
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

    let el = find(e.target, true)

    if(!el || e.target.closest('.endless')) {
        if(arrows.el) {
            arrowsHide()
        }

        return
    }

    arrows.el = el

    arrowsUpdate()
}

function dragStart(e){
    if(!enabled() || e.button !== 0 || !e.target.closest) {
        return
    }

    let el = find(e.target, true)

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

    if(!drag.moved) {
        document.body.classList.add('mouse-pc--drag')

        arrowsHide()
    }

    drag.moved = true
    drag.x = e.clientX

    drag.el.Scroll.shift(-dx)

    // Домальовування — раз на кадр, а не на кожен mousemove
    let el = drag.el

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
    }

    drag = null

    document.body.classList.remove('mouse-pc--drag')
}

function click(e){
    // повторні кліки по самій стрілці — це гортання далі, їх не глушимо
    if(Date.now() < suppress_click && !(e.target.closest && e.target.closest('.mouse-pc-arrow'))){
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
}

window.addEventListener('resize', bodyMode)
