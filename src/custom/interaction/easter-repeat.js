import Storage from '../../core/storage/storage'
import Platform from '../../core/platform'

// Пасхалка: той самий фільм відкрили тричі поспіль — фон картки «перемотується», як касета:
// смуги розгортки, смуга трекінгу пробігає знизу вгору, кадр тремтить, у кутку ◀◀.
// Поспіль — без інших фільмів між відкриттями і не довше ніж за 10 хвилин.
// Повернення «Назад» у вже відкриту картку подію не шле, тож рахуються лише нові відкриття.
//
// Шар живе всередині .background — під вмістом картки, нічого не закриває.
// Обмеження ті самі, що в easter-aurora.js (найслабші ТВ): анімуються лише transform
// і opacity, без blur і тіней; смуги розгортки — смужка 1% ширини, розтягнута scaleX(100);
// ◀◀ — трикутники з рамок, а не символ (у шрифтах старих ТВ його може не бути);
// префікси -webkit- вручну, стилі вставляються одразу, шар прибирається таймером.

const TIMES = 3
const WINDOW = 10 * 60 * 1000
const DURATION = 1200
const DELAY = 200

let last = {id: null, count: 0, time: 0}
let shown = null

function prefixed(prop, value){
    return '-webkit-' + prop + ':' + value + ';' + prop + ':' + value + ';'
}

function keyframes(name, body){
    return '@-webkit-keyframes ' + name + '{' + body.replace(/transform:([^;}]+)/g, '-webkit-transform:$1;transform:$1') + '}'
        + '@keyframes ' + name + '{' + body + '}'
}

function css(){
    let layer = prefixed('backface-visibility', 'hidden')
    let fill = 'position:fixed;left:0;top:0;width:100%;height:100%;'

    // смуги проступають, мерехтять і гаснуть
    let lines = '0%{opacity:0}12%{opacity:1}30%{opacity:.6}45%{opacity:1}80%{opacity:.8}100%{opacity:0}'

    // смуга трекінгу пробігає двічі: перемотка не плавна
    let band = '0%{opacity:0;transform:translate3d(0,110%,0)}'
        + '8%{opacity:1}45%{opacity:1;transform:translate3d(0,-20%,0)}'
        + '46%{opacity:0;transform:translate3d(0,110%,0)}'
        + '52%{opacity:1}90%{opacity:1;transform:translate3d(0,-20%,0)}'
        + '100%{opacity:0;transform:translate3d(0,-20%,0)}'

    // кадр сіпається вбік рідкими поштовхами
    let jitter = '0%,100%{transform:translate3d(0,0,0)}'
        + '10%{transform:translate3d(-6px,0,0)}14%{transform:translate3d(3px,0,0)}18%{transform:translate3d(0,0,0)}'
        + '48%{transform:translate3d(5px,0,0)}52%{transform:translate3d(-2px,0,0)}56%{transform:translate3d(0,0,0)}'
        + '80%{transform:translate3d(-3px,0,0)}84%{transform:translate3d(0,0,0)}'

    // ◀◀ блимає, як напис на екрані відеомагнітофона
    let icon = '0%{opacity:0}10%{opacity:1}35%{opacity:1}40%{opacity:0}48%{opacity:1}85%{opacity:1}100%{opacity:0}'

    let triangle = 'display:inline-block;width:0;height:0;border-style:solid;border-width:.7em 1.1em .7em 0;'
        + 'border-color:transparent #fff transparent transparent;margin-right:.1em'

    return keyframes('siaivo-rewind-lines', lines)
        + keyframes('siaivo-rewind-band', band)
        + keyframes('siaivo-rewind-jitter', jitter)
        + keyframes('siaivo-rewind-icon', icon)

        + '.siaivo-rewind{' + fill + 'overflow:hidden;pointer-events:none}'

        + '.siaivo-rewind__lines{' + fill + 'width:1%;opacity:0;'
            + 'background:-webkit-repeating-linear-gradient(top,rgba(0,0,0,.35) 0,rgba(0,0,0,.35) 2px,rgba(0,0,0,0) 2px,rgba(0,0,0,0) 5px);'
            + 'background:repeating-linear-gradient(to bottom,rgba(0,0,0,.35) 0,rgba(0,0,0,.35) 2px,rgba(0,0,0,0) 2px,rgba(0,0,0,0) 5px);'
            + prefixed('transform-origin', '0 0') + prefixed('transform', 'scaleX(100) translateZ(0)') + layer
            + prefixed('animation', 'siaivo-rewind-lines ' + DURATION + 'ms linear both') + '}'

        + '.siaivo-rewind__band{position:fixed;left:0;top:0;width:100%;height:14%;opacity:0;'
            + 'background:-webkit-linear-gradient(top,rgba(255,255,255,0),rgba(255,255,255,.16) 40%,rgba(255,255,255,.28) 50%,rgba(255,255,255,.16) 60%,rgba(255,255,255,0));'
            + 'background:linear-gradient(to bottom,rgba(255,255,255,0),rgba(255,255,255,.16) 40%,rgba(255,255,255,.28) 50%,rgba(255,255,255,.16) 60%,rgba(255,255,255,0));'
            + layer + prefixed('animation', 'siaivo-rewind-band ' + DURATION + 'ms linear both') + '}'

        + '.siaivo-rewind__icon{position:fixed;right:5%;top:14%;font-size:1.6em;opacity:0;' + layer
            + prefixed('animation', 'siaivo-rewind-icon ' + DURATION + 'ms steps(1,end) both') + '}'
        + '.siaivo-rewind__icon i{' + triangle + '}'

        + '.background.siaivo-rewind-jitter{' + prefixed('animation', 'siaivo-rewind-jitter ' + DURATION + 'ms steps(1,end) both') + '}'

        // тиха версія: лише смуги й ◀◀, без руху
        + '.siaivo-rewind--still .siaivo-rewind__band{display:none}'
}

function reduced(){
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

function show(){
    let background = document.querySelector('.background')

    if (shown || !background) {
        return
    }

    let still = !Storage.field('animation') || reduced() || Platform.screen('light')

    shown = document.createElement('div')
    shown.className = 'siaivo-rewind' + (still ? ' siaivo-rewind--still' : '')
    shown.innerHTML = '<div class="siaivo-rewind__lines"></div><div class="siaivo-rewind__band"></div>'
        + '<div class="siaivo-rewind__icon"><i></i><i></i></div>'

    background.appendChild(shown)

    if (!still) {
        background.classList.add('siaivo-rewind-jitter')
    }

    setTimeout(() => {
        background.classList.remove('siaivo-rewind-jitter')

        if (shown && shown.parentNode) {
            shown.parentNode.removeChild(shown)
        }

        shown = null
    }, DURATION + 100)
}

function onFull(e){
    if (e.type != 'complite' || !e.data || !e.data.movie) {
        return
    }

    let movie = e.data.movie
    let id = (movie.name ? 'tv' : 'movie') + movie.id
    let now = Date.now()

    if (last.id == id && now - last.time < WINDOW) {
        last.count++
    }
    else {
        last.id = id
        last.count = 1
    }

    last.time = now

    if (last.count >= TIMES) {
        last.count = 0

        // фон картки ще підвантажується — даємо йому з'явитись
        setTimeout(show, DELAY)
    }
}

// Lampa зʼявляється вже після завантаження модулів
function init(){
    if (!window.Lampa || !Lampa.Listener) {
        setTimeout(init, 50)

        return
    }

    Lampa.Listener.follow('full', onFull)
}

init()

// Стилі — одразу, разом з рештою під час завантаження, а не в мить пасхалки
let style = document.createElement('style')

style.textContent = css()

document.head.appendChild(style)
