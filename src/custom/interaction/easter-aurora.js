import Search from '../../interaction/search/global'
import Keypad from '../../core/keypad'
import Storage from '../../core/storage/storage'
import Platform from '../../core/platform'

// Пасхалка: пошук «сяйво» / «сияние» / «shining» / «aurora» / «siaivo». Людина набрала ім'я
// застосунку — і з-за кромки екрана сходить золоте світло, як схід над пшеничним
// полем, з поля здіймаються іскри, згори проступає блакитне небо. Середина екрана
// з результатами лишається відкритою, усе триває 5 с.
//
// Подій із текстом запиту пошук назовні не дає, а клавіатура тримає слухача в
// екземплярі. Тож поки пошук відкритий, після клавіші, кліку чи вводу читаємо рядок
// .search__input — ядро оновлює його з будь-якого джерела: екранна й системна
// клавіатура, голос, історія (search/global.js, change).
//
// Під найслабші ТВ (Tizen 2, Orsay WebKit 534, Chrome 38). Дорого там не JS, а
// перемальовування, кількість композитних шарів і пам'ять їхніх текстур, тож:
// - анімуються тільки transform і opacity; без blur, тіней, масок, mix-blend;
// - контейнер нерухомий і не стає шаром — кожен шар гасне сам; разом лише 5 шарів;
// - небо — смужка 1% ширини, розтягнута scaleX(100): вертикальний градієнт
//   уздовж осі X однаковий, тож без втрат, а текстура в 100 разів менша;
// - сонце малюється в чверть розміру й масштабується ×4: м'який градієнт не
//   псується, а текстура в 16 разів менша;
// - іскри летять трьома хвилями: хвиля — одна смужка 12px, де три іскри намальовані
//   фоновими градієнтами, тож шарів 3, а не 9;
// - стилі вставляються одразу під час завантаження модуля, а не в мить пасхалки:
//   новий <style> змушує старий рушій перерахувати стилі всього документа, і в мить
//   ефекту це дало б ривок;
// - полегшена версія Лампи (Platform.screen('light')) — без іскор;
// - кожна анімація програється раз, без нескінченних циклів;
// - префікси -webkit- вручну (стилі вставляються з JS, autoprefixer їх не
//   бачить), старий синтаксис радіального градієнта для WebKit 534, розміри у %
//   (без vh), без inset і will-change;
// - шар прибирається таймером, а не animationend.

const WORDS = ['сяйво', 'сияние', 'shining', 'aurora', 'siaivo']
const DURATION = 5000

// Іскри: три хвилі по три. Позиція в % ширини, колір і чи велика. Затримка — щоб
// вони вилітали вже з розгорілого світла, а не разом із ним; усі вкладаються в DURATION.
const WAVES = [
    {delay: 700, drift: 18, sparks: [{left: 12, gold: 1, big: 0}, {left: 49, gold: 0, big: 1}, {left: 86, gold: 1, big: 0}]},
    {delay: 1100, drift: -14, sparks: [{left: 21, gold: 0, big: 0}, {left: 30, gold: 1, big: 1}, {left: 67, gold: 1, big: 1}]},
    {delay: 1650, drift: 12, sparks: [{left: 40, gold: 1, big: 0}, {left: 58, gold: 1, big: 0}, {left: 76, gold: 0, big: 0}]}
]

const SPARK_TIME = 2800
const SPARK_GOLD = 'rgba(255,228,140,1),rgba(255,206,64,.5) 50%,rgba(255,206,64,0)'
const SPARK_BLUE = 'rgba(190,222,255,1),rgba(110,178,255,.5) 50%,rgba(110,178,255,0)'
const SUN = 'rgba(255,216,96,.6),rgba(255,206,64,.2) 52%,rgba(255,206,64,0)'

let opened = false
let check_timer = 0
let last_text = ''
let shown = null

function prefixed(prop, value){
    return '-webkit-' + prop + ':' + value + ';' + prop + ':' + value + ';'
}

function keyframes(name, body){
    return '@-webkit-keyframes ' + name + '{' + body.replace(/transform:([^;}]+)/g, '-webkit-transform:$1;transform:$1') + '}'
        + '@keyframes ' + name + '{' + body + '}'
}

// м'яка пляма світла: старий WebKit знає лише свій синтаксис із позицією попереду
function radial(stops){
    return '-webkit-radial-gradient(50% 50%,ellipse closest-side,' + stops + ')'
}

function radial_std(stops){
    return 'radial-gradient(closest-side,' + stops + ')'
}

// Хвиля іскор: кожна іскра — окремий фон однієї смужки. Список фонів із префіксом
// і без іде двома правилами: у одному списку синтаксиси змішувати не можна.
function wave(item){
    let images = []
    let images_std = []
    let sizes = []
    let positions = []

    for(let i = 0; i < item.sparks.length; i++){
        let spark = item.sparks[i]
        let size = spark.big ? 12 : 8
        let stops = spark.gold ? SPARK_GOLD : SPARK_BLUE

        images.push(radial(stops))
        images_std.push(radial_std(stops))
        sizes.push(size + 'px ' + size + 'px')
        positions.push(spark.left + '% 50%')
    }

    return 'background-image:' + images.join(',') + ';background-image:' + images_std.join(',') + ';'
        + 'background-repeat:no-repeat;' + prefixed('background-size', sizes.join(',')) + 'background-position:' + positions.join(',') + ';'
}

function css(){
    let layer = prefixed('backface-visibility', 'hidden')
    let rise = 'cubic-bezier(0.16,1,0.3,1)'

    // Сонце намальоване в чверть розміру, тож кожен scale тут учетверо більший за
    // видимий, а зсув у % рахується від його ж (чвертної) висоти — теж учетверо
    let sun = '0%{opacity:0;transform:translate3d(0,88%,0) scale(2.8)}'
        + '30%{opacity:1;transform:translate3d(0,0,0) scale(4)}'
        + '80%{opacity:1;transform:translate3d(0,-8%,0) scale(4.16)}'
        + '100%{opacity:0;transform:translate3d(0,-12%,0) scale(4.24)}'

    // небо проступає, коли сонце вже зійшло
    let dawn = '0%{opacity:0}28%{opacity:0}50%{opacity:1}82%{opacity:1}100%{opacity:0}'

    // хвилі дрейфують у різні боки — іскри не летять строєм
    function rise_wave(drift){
        return '0%{opacity:0;transform:translate3d(0,0,0)}'
            + '18%{opacity:1}70%{opacity:.9}'
            + '100%{opacity:0;transform:translate3d(' + drift + 'px,-300px,0)}'
    }

    // тиха версія: світло лише проявляється й гасне
    let still = '0%{opacity:0}25%{opacity:1}75%{opacity:1}100%{opacity:0}'

    return keyframes('siaivo-sun', sun)
        + keyframes('siaivo-dawn', dawn)
        + WAVES.map((item, i) => keyframes('siaivo-wave-' + i, rise_wave(item.drift))).join('')
        + keyframes('siaivo-still', still)

        + '.siaivo-aurora{position:fixed;left:0;top:0;width:100%;height:100%;overflow:hidden;pointer-events:none;z-index:9999}'

        // чверть розміру (21%×22.5%) повного сонця 84%×90%: та сама вісь і нижній
        // край, бо масштаб ×4 рахується від нижнього краю
        + '.siaivo-aurora__sun{position:absolute;left:39.5%;bottom:-58%;width:21%;height:22.5%;opacity:0;'
            + 'background:' + radial(SUN) + ';background:' + radial_std(SUN) + ';'
            + prefixed('transform-origin', '50% 100%') + layer
            + prefixed('animation', 'siaivo-sun ' + DURATION + 'ms ' + rise + ' both') + '}'

        + '.siaivo-aurora__dawn{position:absolute;left:0;top:0;width:1%;height:30%;opacity:0;'
            + 'background:-webkit-linear-gradient(top,rgba(110,178,255,.36),rgba(110,178,255,.08) 50%,rgba(110,178,255,0));'
            + 'background:linear-gradient(to bottom,rgba(110,178,255,.36),rgba(110,178,255,.08) 50%,rgba(110,178,255,0));'
            + prefixed('transform-origin', '0 0') + prefixed('transform', 'scaleX(100) translateZ(0)') + layer
            + prefixed('animation', 'siaivo-dawn ' + DURATION + 'ms ease-in-out both') + '}'

        + WAVES.map((item, i) => '.siaivo-aurora__wave--' + i + '{position:absolute;left:0;bottom:8%;width:100%;height:12px;opacity:0;'
            + wave(item) + layer
            + prefixed('animation', 'siaivo-wave-' + i + ' ' + SPARK_TIME + 'ms ' + rise + ' ' + item.delay + 'ms both') + '}').join('')

        + '.siaivo-aurora--still .siaivo-aurora__sun{' + prefixed('transform', 'scale(4)') + prefixed('animation', 'siaivo-still ' + DURATION + 'ms linear both') + '}'
        + '.siaivo-aurora--still .siaivo-aurora__dawn{' + prefixed('animation', 'siaivo-still ' + DURATION + 'ms linear both') + '}'
        + '.siaivo-aurora--still .siaivo-aurora__wave,.siaivo-aurora--lite .siaivo-aurora__wave{display:none}'
}

function reduced(){
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

function waves(){
    let html = ''

    for(let i = 0; i < WAVES.length; i++){
        html += '<div class="siaivo-aurora__wave siaivo-aurora__wave--' + i + '"></div>'
    }

    return html
}

function show(){
    if(shown) {
        return
    }

    shown = document.createElement('div')

    // Анімації вимкнені в Лампі чи системі — слабкий пристрій або вибір людини:
    // показуємо тиху версію без руху, а не нічого
    // Полегшена версія Лампи — найслабше залізо: без іскор
    shown.className = 'siaivo-aurora'
        + (!Storage.field('animation') || reduced() ? ' siaivo-aurora--still' : '')
        + (Platform.screen('light') ? ' siaivo-aurora--lite' : '')

    shown.innerHTML = '<div class="siaivo-aurora__dawn"></div><div class="siaivo-aurora__sun"></div>' + waves()

    document.body.appendChild(shown)

    setTimeout(() => {
        if(shown && shown.parentNode) {
            shown.parentNode.removeChild(shown)
        }

        shown = null
    }, DURATION + 100)
}

function check(){
    check_timer = 0

    let input = document.querySelector('.search__input')

    if(!input) {
        return
    }

    // ядро пише пробіли як &nbsp;, а порожній рядок — підказкою «Пошук...»
    let text = (input.textContent || '').replace(/\s+/g, ' ').replace(/^ | $/g, '').toLowerCase()

    if(text == last_text) {
        return
    }

    last_text = text

    if(WORDS.indexOf(text) > -1) {
        show()
    }
}

// Ядро оновлює рядок у тому ж обробнику, але після нашого слухача — читаємо трохи пізніше
function schedule(){
    if(opened && !check_timer) {
        check_timer = setTimeout(check, 50)
    }
}

// Стилі — одразу, разом з рештою під час завантаження, а не в мить пасхалки
let style = document.createElement('style')

style.textContent = css()

document.head.appendChild(style)

Search.listener.follow('open', () => {
    opened = true
    last_text = ''
})

Search.listener.follow('close', () => {
    opened = false
})

Keypad.listener.follow('keydown', schedule)

document.addEventListener('click', schedule, true)
document.addEventListener('input', schedule, true)
