import Reguest from '../../utils/reguest'

// Статична карта mal -> tmdb (lampa-ua-pack) — єдине джерело мапінгу для siaivo, БЕЗ ani.zip.
// Формат файлу: { movie: { "<tmdb>": [mal,...] }, tv: { "<tmdb>": [mal,...] } } — tmdb-id -> mal-и
// (усі сезони/частини серіалу під одним tv-id). Інвертуємо у mal -> { id:<tmdb>, method:'tv'|'movie' }.
//
// Дає:
//   - resolve(mal, cb) -> { id, method } | null — відкриття / значок «в обраному» / continue-watch
//     (і фільми, і серіали резолвяться нормально);
//   - groupOf(mal)     -> 'tv:<id>' для серіалів (ключ схлопування сезонів) або null для фільмів
//     та відсутніх (фільми НЕ схлопуємо; кожен реліз — окрема картка).
//
// Завантаження: сирий файл тягнемо один раз (можна одразу при старті застосунку — preload()),
// а mal->tmdb індекс будуємо ЛІНИВО — один раз і лише коли знадобиться (перше відкриття категорії).
var URL  = 'https://siaivo.isroot.in/lampa-ua-pack/anime/map.json'
var days3 = 60 * 24 * 3

var network = new Reguest()

var RAW = null        // сирий { movie, tv }
var INV = null        // Number(mal) -> { id:Number, method:'tv'|'movie' }
var fetching = false
var queue = []

function flush() {
    var cbs = queue
    queue = []
    cbs.forEach(function(cb) { cb() })
}

// Тягне сирий файл один раз (мемоізовано, персистентний кеш). Помилка -> RAW лишається null
// (резолв/дедуп деградують до no-op), повтор при наступному виклику.
function fetchRaw(cb) {
    cb = cb || function() {}

    if (RAW) return cb()

    queue.push(cb)

    if (fetching) return
    fetching = true

    network.silent(URL, function(json) {
        RAW = json || {}
        fetching = false
        flush()
    }, function() {
        fetching = false
        flush()
    }, false, { cache: { life: days3 } })
}

// Лінива побудова інвертованого індексу mal -> { id, method } — один раз.
function buildIndex() {
    if (INV || !RAW) return

    var inv = {}
    var methods = ['movie', 'tv']

    for (var mi = 0; mi < methods.length; mi++) {
        var method = methods[mi]
        var group = RAW[method] || {}

        for (var tmdb in group) {
            var mals = group[tmdb]
            for (var i = 0; i < mals.length; i++) {
                inv[Number(mals[i])] = { id: Number(tmdb), method: method }
            }
        }
    }

    INV = inv
}

// Одразу при старті застосунку — лише тягнемо файл (індекс не будуємо).
function preload() {
    fetchRaw()
}

// Прелоад карти при готовності застосунку (сирий файл; mal->tmdb індекс будується ліниво при
// першому load()). Мережа неблокуюча + персистентний кеш. ВАЖЛИВО: не раніше 'app ready' —
// Reguest усередині звертається до глобального Lampa, якого на етапі раннього бутстрапу ще
// немає (інакше ReferenceError: Lampa is not defined).
function preloadWhenReady() {
    if (window.appready) return preload()

    if (!window.Lampa || !Lampa.Listener) {
        setTimeout(preloadWhenReady, 50)
        return
    }

    Lampa.Listener.follow('app', function(e) {
        if (e.type === 'ready') preload()
    })
}

// Гарантує, що файл завантажено ТА індекс побудовано (лінива побудова), тоді cb().
function load(cb) {
    cb = cb || function() {}

    fetchRaw(function() {
        buildIndex()
        cb()
    })
}

// Синхронний lookup — лише ПІСЛЯ load(). { id:Number, method:'tv'|'movie' } | null.
// Використовується для рішення «є tmdb?» (виключення no-tmdb) і як база для groupOf.
function link(malId) {
    if (!INV || malId == null) return null
    return INV[Number(malId)] || null
}

// Синхронний — лише після load(). Ключ схлопування: серіали -> 'tv:<id>' (сезони одного
// серіалу мають той самий tv-id); фільми та відсутні -> null (не групуються).
function groupOf(malId) {
    var e = link(malId)
    return e && e.method === 'tv' ? 'tv:' + e.id : null
}

// resolve(malId, cb) -> cb({ id, method }) | cb(null). Чекає load(), далі синхронно.
function resolve(malId, cb) {
    cb = cb || function() {}

    load(function() {
        cb(link(malId))
    })
}

// Зворотний напрям tmdb -> mal. Сирий map.json уже tmdb -> [mal,...], тож читаємо RAW напряму
// (індекс INV не потрібен). Повертає ВЕСЬ масив mal_id елемента, відсортований за зростанням
// (тож [0] — найменший ≈ 1-й сезон, та сама конвенція, що й дедуп сезонів у siavo-anime.js).
// method: 'tv'|'movie'; якщо не передано — пробуємо обидва (об'єднуємо). Тільки після preload()/
// load() (потрібен RAW). Порожній масив, якщо не аніме / нема мапінгу / RAW не готовий.
function malsOf(tmdbId, method) {
    if (!RAW || tmdbId == null) return []

    var methods = method ? [method] : ['tv', 'movie']
    var out = []

    for (var i = 0; i < methods.length; i++) {
        var group = RAW[methods[i]] || {}
        var mals = group[String(tmdbId)]
        if (!mals || !mals.length) continue

        for (var j = 0; j < mals.length; j++) {
            var n = Number(mals[j])
            if (!isNaN(n) && out.indexOf(n) === -1) out.push(n)
        }
    }

    out.sort(function(a, b) { return a - b })
    return out
}

export default {
    preload: preload,
    preloadWhenReady: preloadWhenReady,
    load: load,
    link: link,
    groupOf: groupOf,
    resolve: resolve,
    malsOf: malsOf
}
