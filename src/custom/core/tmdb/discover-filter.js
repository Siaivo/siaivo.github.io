import Utils from '../../../utils/utils'
import Api from '../../../core/api/api'
import AnimeMap from '../../utils/anime-map'

// Пороги vote_count по original_language для discover-запитів TMDB.
//
// TMDB віддає в discover купу локального контенту без жодної аудиторії —
// щоденні корейські шоу, турецькі теленовели, філіппінські токшоу з 3 голосами.
// vote_count.gte у самому запиті не підходить: він глобальний і зрізав би разом
// з цим свіжі en/uk тайтли, які потрібні. Тому поріг окремий на мову.
//
// Цифри підбираються на око — крутити тут. Значення нижче min_votes сюди ставити
// немає сенсу: такі картки жорсткий поріг зрізає раніше, ніж дійде до цієї мапи.
export const vote_floor = {
    //'ko': 40,
    //'az': 20,
    //'tr': 30,
    //'th': 40,
    //'zh': 30,
    //'ja': 20,
    //'pt': 20
}

// Жорсткий мінімум голосів. Картка з парою голосів це не контент, а заготовка
// в базі TMDB. Нижче цього не показуємо взагалі — навіть підлога min_keep не
// повертає.
export const min_votes = 15

// Виняток: мови на кирилиці — те, що аудиторія читає. Такого контенту на TMDB
// просто менше, тому 15 голосів для нього завищена планка. Латинописні сусіди
// (uz, tk, az, mo) і власні писемності (hy, ka) сюди не входять свідомо.
export const min_votes_local = 5
export const cyrillic_langs = ['uk', 'ru', 'be', 'kk', 'ky', 'tg']

// Виняток з min_votes: свіжий (і ще не вийшовший) реліз фізично не може мати
// голосів. Мовний поріг на нього все одно діє — свіже корейське щоденне шоу
// лишається шумом, а свіжий en/uk/fr тайтл видно відразу.
export const fresh_days = 60

// Назва мусить читатися: дозволені латиниця (з діакритикою) і кирилиця. Будь-яка
// інша писемність — CJK, хангиль, тайська, арабіка, іврит, деванагарі, грецька —
// означає, що TMDB не має перекладу назви, і картку однаково не прочитати.
// Дозволено: ASCII + латиниця з розширеннями й діакритикою, кирилиця, латиниця
// Extended Additional, пунктуація/символи, CJK-пунктуація та сурогатні
// пари емодзі — самі по собі вони картку не ріжуть.
const foreign_title = /[^\u0000-\u036f\u0400-\u052f\u1e00-\u1eff\u2000-\u2bff\u3000-\u303f\ud800-\udfff\ufe0f]/

// Жанри, які викидаємо назовсім, за типом контенту.
// 10766 Soap — теленовели. Порогом голосів їх не взяти: у «Corazón Indomable»
// 496 голосів і 7.8, і назва латиницею, тож ні vote_floor, ні foreign_title його
// не бачать. Soap позначає його точно й незалежно від мови — турецькі,
// бразильські, філіппінські теленовели теж. Перевірено, що не чіпає Grey's
// Anatomy, Money Heist, Elite, Dark, Kuruluş Osman, Breaking Bad.
// Сусіди на випадок потреби: 10767 Talk, 10763 News, 10764 Reality.
//
// 16 Animation під 'ja' і 'zh' — аніме й донхуа. Карта аніме (exclude_anime)
// лишається як додатковий відсів, але сама по собі дірява: у ній ~6 тис. записів,
// донхуа в ній не буде взагалі (вона про MAL), а «Суперкуб» (tv/279182) має
// 94 голоси, 8.1 і назву українською, тож жоден інший відсів його не бачить.
// Жанр ловить усе одразу, карта добирає те, що TMDB позначив не як ja або без
// жанру 16. Додати 'ko', якщо схочеш і корейську анімацію.
//
// Ключ '*' — будь-яка мова оригіналу, решта ключів точні.
export const exclude_genres = {
    tv: {
        '*': [10766],
        'ja': [16],
        'zh': [16]
    },
    movie: {
        'ja': [16],
        'zh': [16]
    }
}

// Типи, з яких аніме викидається назовсім: у TMDB-серіалах воно зайве, під нього
// є окремий розділ на hikka.
export const exclude_anime = ['tv', 'movie']

// Підлога: скільки карток мінімум лишається на сторінці, щоб лінія не облисіла.
// Добирає тільки з тих, що не пройшли мовний поріг, але пройшли жорсткі відсіви.
export const min_keep = 12

// Скільки TMDB-сторінок зливається в одну сторінку сітки повної категорії.
// items/category тягне наступну сторінку лише коли скрол дійшов до дна, тож
// після фільтра сторінка з 20 карток стає короткою і пауза на запит приходить
// частіше за меншу кількість карток. Мапінг 2:1 фіксований — ні дублів, ні
// пропусків, і перехід «Сторінка N» з навігатора лишається живим.
export const pages_per_view = 2

// Дата, до якої реліз вважається свіжим. Рахуємо на кожен виклик, а не на
// завантаженні модуля: Lampa на телевізорі живе тижнями.
function freshCutoff() {
    return new Date(Date.now() - fresh_days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function hasGenre(ids, genres) {
    return !!genres && ids.some(id => genres.indexOf(id) !== -1)
}

function excludedGenre(item, type) {
    let by_lang = exclude_genres[type]

    if (!by_lang) return false

    // Два окремі проходи, а не concat: інакше алокація масиву на кожну картку.
    let ids = item.genre_ids || []

    return hasGenre(ids, by_lang['*']) || hasGenre(ids, by_lang[item.original_language])
}

// Аніме визначає карта mal, а не жанр 16: якщо AnimeMap знає mal-id для tmdb-id,
// це аніме. Синхронно і без запиту — на порожній карті просто повертає [], тож на
// холодному старті, поки map.json ще їде, аніме один раз просочиться в лінію.
// Свідомо: чекати на карту означало б тримати кожну лінію на мережевому запиті.
function isAnime(item, type) {
    if (exclude_anime.indexOf(type) === -1) return false

    return AnimeMap.malsOf(item.id, type).length > 0
}

function hardFloor(lang) {
    return cyrillic_langs.indexOf(lang) === -1 ? min_votes : min_votes_local
}

// Жорсткі відсіви: назад їх не повертає навіть підлога min_keep.
function allowed(item, type, cutoff) {
    if (!item) return false

    // Порядок за вартістю: спочатку те, що не алокує і ріже найбільшу частку, і
    // лише в кінці AnimeMap — найдорожчий з відсівів. Результат від порядку не
    // залежить, усі перевірки незалежні.

    // Порожня дата лексикографічно менша за будь-яку — тайтл без дати свіжим не є.
    let fresh = (item.release_date || item.first_air_date || '') >= cutoff

    if (!fresh && (item.vote_count || 0) < hardFloor(item.original_language)) return false
    if (foreign_title.test(item.title || item.name || '')) return false
    if (excludedGenre(item, type)) return false

    return !isAnime(item, type)
}

// discover/tv... -> 'tv', усе інше discover -> 'movie'.
function mediaType(url) {
    return url.indexOf('discover/tv') === 0 ? 'tv' : 'movie'
}

function partition(results, floors) {
    let keep = []
    let drop = []

    results.forEach(item => {
        let floor = floors[item.original_language]

        if (floor && (item.vote_count || 0) < floor) drop.push(item)
        else keep.push(item)
    })

    return [keep, drop]
}

/**
 * Викидає назовсім аніме (для exclude_anime), жанри з exclude_genres, картки з-під
 * жорсткого порога голосів (крім свіжих релізів)
 * і з нечитабельною назвою, а потім ті,
 * що не добрали голосів для своєї мови. Якщо після цього лишилося менше keep_min —
 * добирає найкращих із других у хвіст. Повертає новий масив; вхідний не мутується.
 */
export function filterDiscoverResults(results, type, floors = vote_floor, keep_min = min_keep, cutoff = freshCutoff()) {
    if (!Array.isArray(results)) return results

    let alive        = results.filter(item => allowed(item, type, cutoff))
    let [keep, drop] = partition(alive, floors)

    if (!drop.length) return alive
    if (keep.length >= keep_min) return keep

    drop.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))

    return keep.concat(drop.slice(0, keep_min - keep.length))
}

function isDiscover(url) {
    return typeof url === 'string' && url.indexOf('discover/') === 0
}

// Лінії на сторінках TMDB збираються всередині src/core/api/sources/tmdb.js
// через локальний get(), тому обгортка над Api.sources.tmdb.get їх не перехопить.
// Спільна точка для всіх відповідей get() — Utils.addSource, який викликається
// перед oncomplite і вже має проставлений json.url = method.
let addSource = Utils.addSource

Utils.addSource = function(data, source) {
    if (source == 'tmdb' && data && isDiscover(data.url)) {
        data.results = filterDiscoverResults(data.results, mediaType(data.url))
    }

    return addSource.call(this, data, source)
}

// Повний перегляд категорії йде через Api.list, який url у відповідь не кладе —
// тут він відомий лише з params, тому обгортка окрема — і тут же зливаємо
// pages_per_view сторінок в одну, щоб фільтр не залишав сітку напівпорожньою.
function patchList() {
    let tmdb = Api.sources && Api.sources.tmdb

    if (!tmdb) {
        setTimeout(patchList, 0)
        return
    }

    let list = tmdb.list.bind(tmdb)

    tmdb.list = function(params, oncomplite, onerror) {
        if (!isDiscover(params && params.url)) return list(params, oncomplite, onerror)

        let view_page = parseInt(params.page) || 1
        let first     = (view_page - 1) * pages_per_view + 1
        let parts     = new Array(pages_per_view)
        let waiting   = pages_per_view

        function done() {
            if (--waiting) return

            // head — перша відповідь, що піднялася: з неї беремо все крім results.
            let head    = parts.find(Boolean)
            let results = []

            if (!head) return onerror ? onerror() : undefined

            parts.forEach(part => {
                if (part && Array.isArray(part.results)) results = results.concat(part.results)
            })

            // Копіюємо, а не мутуємо: reguest тримає ці об'єкти в кеші.
            oncomplite(Object.assign({}, head, {
                results: filterDiscoverResults(results, mediaType(params.url)),
                page: view_page,
                total_pages: Math.ceil((head.total_pages || 1) / pages_per_view)
            }))
        }

        // Паралельно, а не послідовно: reguest.silent веде кожен запит окремо, тож
        // пауза на підгрузку не довша за одну сторінку. Сторінку за межами
        // total_pages TMDB віддає просто з порожнім results, перевіряти не треба.
        for (let i = 0; i < pages_per_view; i++) {
            list(Object.assign({}, params, {page: first + i}), function(data) {
                parts[i] = data
                done()
            }, done)
        }
    }
}

patchList()
