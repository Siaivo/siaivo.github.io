import Api from '../../core/api/api'
import Reguest from '../../utils/reguest'
import Lang from '../../core/lang'
import Template from '../../interaction/template'
import LineModule from '../../interaction/items/line/module/module'
import ContentRows from '../../core/content_rows'
import AnimeMap from '../utils/anime-map'

// Категорія Siaivo (каталог аніме на даних hikka.io) — самодостатній модуль. Реєструється як
// джерело Api.sources['siaivo'] (так category-компонент рендерить екран за source:'siaivo').
//
// Особливості API Hikka:
//   - каталог   POST /anime?page=<n>&size=<PAGE_SIZE>  тіло JSON { sort, genres, ... }
//               -> { list:[...], pagination:{ total, pages, page } }. Сортування СПРАВЖНЄ
//               (sort:['score:desc',...]), пагінація СПРАВЖНЯ (page). Тіло МУСИТЬ бути
//               application/json — form/text Hikka відхиляє (validation_error).
//   - жанри     GET /genres -> { list:[{ slug, name_ua, name_en, type }] } (тут статично в GENRES).
//   - деталь    GET /anime/{slug} -> синопсис/жанри/епізоди (mal_id є одразу в кожній картці).
//   - постери   item.image — АБСОЛЮТНИЙ URL cdn.hikka.io (кладемо в poster/img, без проксі).
//   - деталь у Hikka без плеєра в цьому складанні -> картка одразу нативна TMDB (id/method з карти
//     в card()), тож відкриття/обране/continue-watch працюють через джерело tmdb.
//   - дедуп/резолв через статичну карту lampa-ua (AnimeMap, utils/anime-map.js) — БЕЗ ani.zip.
var SOURCE = 'siaivo'
var API    = 'https://apx.lme.isroot.in/hikka'   // CORS-шлюз: /hikka/<path> -> api.hikka.io/<path>
var day    = 60 * 24

// Розмір сторінки Hikka (size, максимум 100). Беремо з запасом: після фільтра no-tmdb + дедупу
// сезонів сторінка лишається повною, тож у list() майже ніколи не потрібен «дочит» (1 запит на
// сторінку сітки) і грід рідше смикає наступну сторінку. Пагінація через page (skip не потрібен).
var PAGE_SIZE = 30

// Порядок сортування каталогу: спершу за оцінкою, тай-брейк за кількістю голосів (як у Hikka).
var SORT = ['score:desc', 'scored_by:desc']

var network = new Reguest()

// Повний URL до шлюзу (шлях один-в-один з api.hikka.io).
function apiUrl(path) {
    return API + path
}

// Нормалізація назви: прибираємо хвостові маркери сезону/частини, щоб схлопнута картка
// мала базову назву серіалу («Проводжальниця Фрірен - 2 сезон» -> «Проводжальниця Фрірен»).
// Маркер має йти в КІНЦІ й після роздільника/пробілу, тож двокрапкові підзаголовки (арки,
// фільми: «Людина-бензопила: Арка Резе», «Повелитель Фільм 1») не чіпаємо. Порожній
// результат (назва = самий маркер) -> лишаємо оригінал.
var TITLE_TAILS = [
    /[\s\-–—,:]+сезон(?:[ауи]|ів)?\s*\d+\s*$/i,                                     // "..., сезон 3" / "- сезон 2" / "Сезон 2"
    /[\s\-–—,:]+\d+\s*[-\s]*(?:й|ий)?\s*сезон(?:[ауи]|ів)?\s*$/i,                   // "- 2 сезон" / "2-й сезон" / "3 сезон"
    /[\s\-–—,:]+(?:перший|другий|третій|четвертий|п['’]ятий|шостий|сьомий|наступний|фінальний|завершальний|останній|остаточний)\s+сезон(?:[ауи]|ів)?\s*$/i, // "другий сезон" / "Наступний/Фінальний сезон"
    /[\s\-–—,:]+(?:частина|частину|частини|part)\s*\d+\s*$/i,            // "..., частина 2" / "- part 2"
    /[\s\-–—,:]+\d+(?:\s*[-–—]\s*\d+)?\s*(?:а|га|я|й|ий)?\s*(?:частина|частину|частини|part)\s*$/i, // "..., 2 частина" / "- 3-4 частина" / "2-га частина"
    /[\s\-–—,:]+season\s*\d+\s*$/i,                                      // "... Season 2"
    /[\s\-–—,:]+\d+(?:st|nd|rd|th)\s*season\s*$/i,                       // "... 2nd Season"
    /[\s\-–—,:]+(?:пів)?фінал(?:ьн(?:ий|а|е|ого))?(?:\s+(?:сезон(?:[ауи]|ів)?|част(?:ина|ину|ини)|розділ[ауи]?|сері[яії]))?\s*$/i, // "Хвіст феї: Фінал" / "Ґінтама: Півфінал" / "Рілайф: Фінальний розділ"
    /[\s\-–—,:]+(?:спешл(?:и|ів)?|спецвипуск(?:и|ів)?|special(?:s)?|ova|ona)\s*$/i,       // "...урядника Спешл" / "...Богом! OVA" / "... Special"
    /[\s\-–—,:]+(?:the\s+)?(?:second|third|fourth|fifth|sixth|seventh|final)\s+(?:season|series)\s*$/i, // "... Second Season" / "... Final Season/Series"
    /[\s\-–—,:]+season\s+[ivx]+\s*$/i                                    // "... Season I" (римська)
]

function normalizeTitle(name) {
    var original = String(name || '')
    var s = original

    for (var changed = true; changed; ) {
        changed = false

        for (var i = 0; i < TITLE_TAILS.length; i++) {
            var next = s.replace(TITLE_TAILS[i], '')
            if (next === s) continue          // не матчнуло — далі
            next = next.trim()
            if (next.length) { s = next; changed = true; break }
            // матч дав порожній рядок (сам маркер) -> лишаємо s, пробуємо наступний regex
        }
    }

    return s.trim() || original
}

function card(item) {
    var display  = normalizeTitle(item.title_ua || item.title_en || item.title_ja || item.slug || '')
    var original = normalizeTitle(item.title_ja || item.title_en || item.title_ua || '') || display
    var year     = item.year ? String(item.year) : ''
    var poster   = item.image || ''
    var link     = AnimeMap.link(item.mal_id)                     // { id, method } | null
    var method   = link ? link.method : null
    var isMovie  = method ? method === 'movie' : item.media_type === 'movie'

    var c = {
        id: link ? link.id : null,
        source: link ? 'tmdb' : SOURCE,
        method: method,
        mal_id: item.mal_id,
        slug: item.slug,
        _type: item.media_type,      // Hikka media_type — для дедупу сезонів у processPage
        _scored_by: Number(item.scored_by) || 0,  // к-сть голосів — тай-брейк пост-сортування розкладу
        overview: '',
        poster: poster,
        img: poster,
        vote_average: Number(item.score) || 0,
        release_year: year,
        genres: []
    }

    if (isMovie) {
        c.title = display
        c.original_title = original
        c.release_date = year ? year + '-01-01' : ''
    }
    else {
        c.name = display
        c.original_name = original
        c.first_air_date = year ? year + '-01-01' : ''
    }

    return c
}

// Резервне велике total_pages, коли справжній pages відсутній. Реальний кінець тоді ловимо
// за порожньою сторінкою.
var MAX_PAGES = 1000

// normalize з відповіді Hikka { list, pagination:{ total, pages, page } }. Із pagination.pages
// беремо коректний total_pages, тож повноекранна сітка (category_full) зупиняє пагінацію на
// реальному кінці (див. коментар у list()).
function normalize(json, page) {
    var arr   = (json && json.list) ? json.list : []
    var pg    = json && json.pagination
    var pages = pg && typeof pg.pages === 'number' ? pg.pages : null
    var total = pg && typeof pg.total === 'number' ? pg.total : null

    return {
        results: arr.map(card),
        page: page || 1,
        total_pages: pages != null ? Math.max(1, pages) : MAX_PAGES,
        total_results: total != null ? total : arr.length,
        source: SOURCE
    }
}

// Поточний рік — обчислюємо на льоту з дати пристрою (не хардкодимо).
function currentYear() {
    return new Date().getFullYear()
}

// Тіло POST /anime за дескриптором ряду:
//   'rated'        -> з високим рейтингом: sort=score (тай-брейк scored_by) — найкраще оцінене за весь час
//   'top'          -> у топі: популярне останніх ~6 років (scored_by у вікні [рік-6, рік]) — «сучасний
//                     мейнстрім», відповідник cub ?cat=anime&sort=top (trending, а не легенди всіх часів)
//   'ongoing'      -> що зараз виходить цьогоріч, за нативною оцінкою (status:ongoing + years:[рік,рік])
//   'translated'   -> «Солов'їною»: лише з укр. локалізацією (only_translated), найновіші (start_date:desc)
//   'movie'        -> повнометражні аніме (media_type:movie), за оцінкою
//   'classic'      -> класика 1990–2009, за популярністю (scored_by у вікні тих років)
//   'novel'        -> екранізації ранобе (source:light_novel), за оцінкою
//   'original'     -> оригінальні твори, не за мангою/ранобе (source:original), за оцінкою
//   'genre:<slug>' -> найкращі жанру (sort=score) + фільтр жанру
function bodyFor(descriptor) {
    if (descriptor === 'top') {
        var yt = currentYear()
        return { sort: ['scored_by:desc'], years: [yt - 6, yt] }
    }

    if (descriptor === 'ongoing') {
        var y = currentYear()
        return { sort: ['native_score:desc'], status: ['ongoing'], years: [y, y] }
    }

    if (descriptor === 'movie')    return { sort: SORT, media_type: ['movie'] }
    if (descriptor === 'novel')    return { sort: SORT, source: ['light_novel'] }
    if (descriptor === 'original') return { sort: SORT, source: ['original'] }
    if (descriptor === 'classic')  return { sort: ['scored_by:desc'], years: [1990, 2009] }

    var body = { sort: SORT }   // 'rated' і жанрові ряди — базове сортування за оцінкою

    if (descriptor.indexOf('genre:') === 0) body.genres = [descriptor.slice('genre:'.length)]

    return body
}

// POST /anime (json-тіло) через шлюз -> normalize. Content-Type МУСИТЬ бути application/json
// (Hikka відхиляє form/text). jQuery шле з crossDomain:true, тож X-Requested-With не додається
// і preflight просить лише content-type — шлюз його дозволяє (ACAH: content-type).
function fetchCatalog(descriptor, page, cache, oncomplite, onerror) {
    var body = JSON.stringify(bodyFor(descriptor))

    network.silent(apiUrl('/anime?page=' + page + '&size=' + PAGE_SIZE), function(json) {
        if (!json) return onerror()

        // Карта має бути готова ДО card() — саме там проставляємо tmdb-ідентичність (синхронний AnimeMap.link).
        AnimeMap.load(function() {
            oncomplite(normalize(json, page))
        })
    }, onerror, body, { cache: cache, headers: { 'Content-Type': 'application/json' } })
}

// ── Дедуплікація сезонів -> одна картка на серіал ────────────────────────────
//
// Hikka (MAL-подібно) віддає окремий запис на кожен сезон/частину (свій mal_id). Групуємо
// за tmdb-id серіалу (id/method уже проставлені в card() зі статичної карти) — БЕЗ мережі.
// Правило: схлопуємо ЛИШЕ не-movie (сезони/OVA/спешли -> один tv-id); фільми лишаються
// окремими картками. mal->tmdb резолв (для закладок/значка) робиться зі статичної карти.

// Пам'ять уже показаних груп (крос-сторінковий дедуп), per-descriptor.
var SEEN = {}

function malNum(card) {
    var n = Number(card && card.mal_id)
    return isNaN(n) ? Infinity : n
}

// Обробка сторінки:
// (1) ВИКЛЮЧЕННЯ тайтлів без tmdb (не показуємо — їх не відкрити, і закладку
// на них не можна коректно зберегти);
// (2) ДЕДУП сезонів серіалу за tmdb tv-id (сезони одного
// серіалу -> одна картка, представник з найменшим mal_id); фільми (за картою або за Hikka
// media_type) не групуємо. Синхронно: id/method (tmdb) уже на картках (проставлені в card()).
// seenKey — ключ крос-сторінкового дедупу (descriptor); isReset — 1-ша сторінка.
function processPage(json, seenKey, isReset, done) {
    var cards = json.results || []

    if (!cards.length) return done()

    if (isReset || !SEEN[seenKey]) SEEN[seenKey] = {}

    var seen = SEEN[seenKey]
    var groups = {}   // 'tv:<id>' -> представник серіалу з цієї сторінки
    var order = []    // порядок появи ключів (стабільний вивід)
    var kept = []     // фільми -> лишаємо кожен окремо

    cards.forEach(function(c) {
        if (!c.id) return   // ВИКЛЮЧЕННЯ: немає tmdb-мапінгу (id=null) -> не показуємо

        // Серіал -> групуємо за tv-id; фільм (за tmdb-методом або Hikka) -> окремою карткою.
        var key = (c.method === 'tv' && c._type !== 'movie') ? ('tv:' + c.id) : null
        if (!key) { kept.push(c); return }

        if (!groups[key]) { groups[key] = c; order.push(key) }
        else if (malNum(c) < malNum(groups[key])) groups[key] = c   // ≈ 1-й сезон
    })

    // Крос-сторінковий дедуп: лишаємо лише не бачені серіали (порожню сторінку доганяє list()).
    // Один прохід у порядку появи ключів (order стабільний) -> без проміжних масивів.
    order.forEach(function(key) {
        if (seen[key]) return
        seen[key] = true
        kept.push(groups[key])
    })

    json.results = kept

    done()
}

// ── Ряди розкладу «Вийшло сьогодні» / «Очікується завтра» (Hikka /schedule/anime) ──
//
// Один POST /schedule/anime повертає найближчі епізоди, ВІДСОРТОВАНІ за airing_at (від сьогодні
// вперед) — тіло { status:['ongoing','announced'] } (announced ловить прем'єри; без airing_season,
// щоб не губити перехідні кури). Відповідь: { list:[{ anime:{...}, airing_at:<unix сек>, episode }] }.
// anime-об'єкт має ТІ САМІ поля, що й каталог, тож картку будуємо тим самим card() (без scheduleCard).
// Обидва ряди читають з ОДНОГО запиту (мемоізація loadSchedule), розбиваючи список за локальною
// датою пристрою. Ряди статичні (без пагінації) -> json.url НЕ ставимо (без кнопки "Ще").
var SCHEDULE_SIZE = 50
var SCHEDULE_BODY = JSON.stringify({ status: ['ongoing', 'announced'] })

// Межі локального дня (unix, сек): offset 0 = сьогодні, 1 = завтра. airing_at — абсолютний unix,
// тож порівняння з локальною північчю коректно розкладає шоу за календарним днем глядача.
function dayRange(offset) {
    var start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() + (offset || 0))
    var from = Math.floor(start.getTime() / 1000)
    return { from: from, to: from + 24 * 60 * 60 }
}

// ── Мемоізований розклад: 1 мережевий запит на відкриття категорії (обидва ряди читають з нього) ──
// Обидва schedulePart() вантажаться конкурентно через Api.partNext; черга дедупить одночасні
// виклики, тож POST /schedule/anime йде РІВНО один раз. scheduleList скидається на вході в category()
// (свіжий розклад на кожне відкриття) та в clear().
var scheduleList     = null   // [{ anime, airing_at, ... }] | null
var scheduleQueue    = []
var scheduleFetching = false

function loadSchedule(oncomplite, onerror) {
    if (scheduleList) return oncomplite(scheduleList)

    scheduleQueue.push({ ok: oncomplite, err: onerror })
    if (scheduleFetching) return
    scheduleFetching = true

    network.silent(apiUrl('/schedule/anime?page=1&size=' + SCHEDULE_SIZE), function(json) {
        var arr = (json && json.list) ? json.list : []

        // Карта mal->tmdb має бути готова ДО card() (синхронний AnimeMap.link у processPage/card).
        AnimeMap.load(function() {
            scheduleList = arr
            scheduleFetching = false

            var q = scheduleQueue
            scheduleQueue = []
            q.forEach(function(c) { c.ok(scheduleList) })
        })
    }, function() {
        scheduleFetching = false

        var q = scheduleQueue
        scheduleQueue = []
        q.forEach(function(c) { c.err() })
    }, SCHEDULE_BODY, { cache: { life: 60 }, headers: { 'Content-Type': 'application/json' } })
}

// Пост-сортування ряду за оцінкою (тай-брейк — к-сть голосів), як каталожний SORT
// ['score:desc','scored_by:desc']. Розклад приходить за airing_at, тож упорядковуємо картки самі.
function byScore(a, b) {
    var d = (b.vote_average || 0) - (a.vote_average || 0)
    return d !== 0 ? d : (b._scored_by || 0) - (a._scored_by || 0)
}

// Частина ряду розкладу (offset днів від сьогодні): читає мемоізований список, фільтрує за днем,
// далі те саме виключення no-tmdb/дедуп сезонів, що й каталог, і пост-сортування за оцінкою.
// seenKey — окремий ключ дедупу на кожен ряд, щоб «сьогодні» й «завтра» не з'їдали картки одне в одного.
function schedulePart(offset, seenKey, decorate) {
    return function(call) {
        loadSchedule(function(list) {
            var range = dayRange(offset)

            var entries = list.filter(function(e) {
                return e && e.anime && e.airing_at >= range.from && e.airing_at < range.to
            })

            var json = {
                results: entries.map(function(e) { return card(e.anime) }),
                page: 1,
                total_pages: 1,
                total_results: entries.length,
                source: SOURCE
            }

            // Дедуп сезонів (processPage) переупорядковує (фільми -> серіали), тож сортуємо ПІСЛЯ нього.
            processPage(json, seenKey, true, function() {
                json.results.sort(byScore)
                decorate(json)
                call(json)
            })
        }, call)
    }
}

// ── Категорія (сторінка-каталог) ─────────────────────────────────────────────

// Збирає функцію-частину ряду: вантажить першу сторінку (POST /anime) і декорує лінію.
// descriptor -> json.url = 'siaivo:<descriptor>' для пагінації кнопкою "Ще".
function part(descriptor, cache, decorate) {
    return function(call) {
        fetchCatalog(descriptor, 1, cache, function(json) {
            // Обробка (виключення no-tmdb + дедуп сезонів). Ряд — 1 сторінка, тож дочит не
            // потрібен: показуємо що лишилось. Ключ дедупу = descriptor (той самий, що в list()).
            processPage(json, descriptor, true, function() {
                json.url = 'siaivo:' + descriptor

                decorate(json)
                call(json)
            })
        }, call)
    }
}

// icon — або назва шаблона ('icon_star'), або готовий SVG-рядок ('<svg><use .../></svg>' для спрайтів).
function iconLine(json, icon, color) {
    json.icon_svg = /^\s*</.test(icon) ? icon : Template.string(icon)
    json.icon_bgcolor = '#fff'
    json.icon_color = color
    json.params = { module: LineModule.toggle(LineModule.MASK.base, 'Icon') }
}

// Робить ряд «широким» (як у cub): менше карток на екран (view:3) + кожній картці стиль 'wide'.
// Hikka не має backdrop, тож wide-картка показує портретний постер (через card.img) у широкій
// рамці. Застосовуємо ЛИШЕ до ряду на головній сітці; повноекранний список (list) — звичайний.
function wideLine(json) {
    json.params = json.params || {}
    json.params.items = { view: 3 }

    ;(json.results || []).forEach(function(c) {
        c.params = { style: { name: 'wide' } }
    })
}

// ── Жанри (фільтр POST /anime { genres:[<slug>] }) ───────────────────────────
// Список жанрів Hikka (GET /genres). Slug'и збігаються з нашими; назви локалізовано (uk/en).
// Ряди показуються у зваженому випадковому порядку: популярні жанри частіше вгорі.
var GENRES = [
    { slug: 'action',            uk: 'Бойовик',                        en: 'Action' },
    { slug: 'adventure',         uk: 'Пригоди',                        en: 'Adventure' },
    { slug: 'comedy',            uk: 'Комедія',                        en: 'Comedy' },
    { slug: 'drama',             uk: 'Драма',                          en: 'Drama' },
    { slug: 'fantasy',           uk: 'Фентезі',                        en: 'Fantasy' },
    { slug: 'isekai',            uk: 'Ісекай',                         en: 'Isekai' },
    { slug: 'romance',           uk: 'Романтика',                      en: 'Romance' },
    { slug: 'sci-fi',            uk: 'Фантастика',                     en: 'Sci-Fi' },
    { slug: 'shounen',           uk: 'Шьонен',                         en: 'Shounen' },
    { slug: 'supernatural',      uk: 'Надприродне',                    en: 'Supernatural' },
    { slug: 'slice-of-life',     uk: 'Буденність',                     en: 'Slice of Life' },
    { slug: 'mystery',           uk: 'Загадкове',                      en: 'Mystery' },
    { slug: 'psychological',     uk: 'Психологія',                     en: 'Psychological' },
    { slug: 'suspense',          uk: 'Трилер',                         en: 'Suspense' },
    { slug: 'school',            uk: 'Школа',                          en: 'School' },
    { slug: 'sports',            uk: 'Спорт',                          en: 'Sports' },
    { slug: 'seinen',            uk: 'Сейнен',                         en: 'Seinen' },
    { slug: 'ecchi',             uk: 'Еччі',                           en: 'Ecchi' },
    { slug: 'harem',             uk: 'Гарем',                          en: 'Harem' },
    { slug: 'super-power',       uk: 'Супергерої',                     en: 'Super Power' },
    { slug: 'mecha',             uk: 'Мехи',                           en: 'Mecha' },
    { slug: 'horror',            uk: 'Жахи',                           en: 'Horror' },
    { slug: 'military',          uk: 'Війна',                          en: 'Military' },
    { slug: 'historical',        uk: 'Історичне',                      en: 'Historical' },
    { slug: 'music',             uk: 'Музика',                         en: 'Music' },
    { slug: 'martial-arts',      uk: 'Бойові мистецтва',               en: 'Martial Arts' },
    { slug: 'detective',         uk: 'Детектив',                       en: 'Detective' },
    { slug: 'space',             uk: 'Космос',                         en: 'Space' },
    { slug: 'vampire',           uk: 'Вампіри',                        en: 'Vampire' },
    { slug: 'shoujo',            uk: 'Шьоджьо',                        en: 'Shoujo' },
    { slug: 'mythology',         uk: 'Міфологія',                       en: 'Mythology' },
    { slug: 'parody',            uk: 'Пародія',                        en: 'Parody' },
    { slug: 'samurai',           uk: 'Самураї',                        en: 'Samurai' },
    { slug: 'josei',             uk: 'Джьосей',                        en: 'Josei' },
    { slug: 'gore',              uk: 'Гротеск',                        en: 'Gore' },
    { slug: 'time-travel',       uk: 'Подорожі в часі',                en: 'Time Travel' },
    { slug: 'reincarnation',     uk: 'Переродження',                   en: 'Reincarnation' },
    { slug: 'love-polygon',      uk: 'Любовний багатокутник',          en: 'Love Polygon' },
    { slug: 'reverse-harem',     uk: 'Реверсивний гарем',              en: 'Reverse Harem' },
    { slug: 'gag-humor',         uk: 'Жарти',                          en: 'Gag Humor' },
    { slug: 'racing',            uk: 'Гонки',                          en: 'Racing' },
    { slug: 'award-winning',     uk: 'Відзначений нагородами',         en: 'Award Winning' },
    { slug: 'adult-cast',        uk: 'Про дорослих',                   en: 'Adult Cast' },
    { slug: 'team-sports',       uk: 'Командний спорт',                en: 'Team Sports' },
    { slug: 'combat-sports',     uk: 'Бойовий спорт',                  en: 'Combat Sports' },
    { slug: 'organized-crime',   uk: 'Організована злочинність',       en: 'Organized Crime' },
    { slug: 'iyashikei',         uk: 'Іяшікей',                        en: 'Iyashikei' },
    { slug: 'workplace',         uk: 'Робота',                         en: 'Workplace' },
    { slug: 'delinquents',       uk: 'Порушники',                      en: 'Delinquents' },
    { slug: 'crossdressing',     uk: 'Переодягання',                   en: 'Crossdressing' },
    { slug: 'video-game',        uk: 'Комп\'ютерні ігри',              en: 'Video Game' },
    { slug: 'villainess',        uk: 'Лиходійка',                      en: 'Villainess' },
    { slug: 'mahou-shoujo',      uk: 'Дівчина-чарівниця',              en: 'Mahou Shoujo' },
    { slug: 'boys-love',         uk: 'Хлопчаче кохання',               en: 'Boys Love' },
    { slug: 'girls-love',        uk: 'Дівчаче кохання',                en: 'Girls Love' },
    { slug: 'avant-garde',       uk: 'Авангард',                       en: 'Avant Garde' },
    { slug: 'anthropomorphic',   uk: 'Антропоморфізм',                 en: 'Anthropomorphic' },
    { slug: 'cgdct',             uk: 'Милі дівчата',                   en: 'CGDCT' },
    { slug: 'gourmet',           uk: 'Про їжу',                        en: 'Gourmet' },
    { slug: 'pets',              uk: 'Тварини',                        en: 'Pets' },
    { slug: 'survival',          uk: 'Виживання',                      en: 'Survival' },
    { slug: 'high-stakes-game',  uk: 'Високі ставки',                  en: 'High Stakes Game' },
    { slug: 'strategy-game',     uk: 'Стратегія',                      en: 'Strategy Game' },
    { slug: 'idols-female',      uk: 'Ідоли (дівчата)',                en: 'Idols (Female)' },
    { slug: 'idols-male',        uk: 'Ідоли (чоловіки)',               en: 'Idols (Male)' },
    { slug: 'otaku-culture',     uk: 'Культура отаку',                 en: 'Otaku Culture' },
    { slug: 'showbiz',           uk: 'Шоу-біз',                        en: 'Showbiz' },
    { slug: 'medical',           uk: 'Медицина',                       en: 'Medical' },
    { slug: 'childcare',         uk: 'Догляд за дітьми',               en: 'Childcare' },
    { slug: 'educational',       uk: 'Освітнє',                        en: 'Educational' },
    { slug: 'performing-arts',   uk: 'Виконавче мистецтво',            en: 'Performing Arts' },
    { slug: 'visual-arts',       uk: 'Візуальне мистецтво',            en: 'Visual Arts' },
    { slug: 'memoir',            uk: 'Мемуари',                        en: 'Memoir' },
    { slug: 'kids',              uk: 'Для дітей',                      en: 'Kids' },
    { slug: 'magical-sex-shift', uk: 'Зміна статі',                    en: 'Magical Sex Shift' },
    { slug: 'romantic-subtext',  uk: 'Романтичний підтекст',           en: 'Romantic Subtext' }
]

// Вага жанру = наскільки часто ряд спливає у верхні позиції видачі. Задаємо ЯВНО за
// популярністю (не лінійно за рангом): у Efraimidis–Spirakis P(ряд угорі) ∝ вага, тож
// щоб мейнстрім реально домінував, топові жанри мають отримати В РАЗИ більшу вагу, а не
// «на кілька пунктів». Тири: 30-22 мейнстрім (майже завжди вгорі) -> 16-9 дуже популярні
// -> 6-4 помітні -> 3-2 нішеві-але-впізнавані. Жанр поза мапою -> вага 1 (рідко вгорі).
var GENRE_WEIGHTS = {
    // Мейнстрім — кістяк будь-якого каталогу, майже завжди у верхніх рядах.
    action: 30, fantasy: 28, adventure: 26, comedy: 26, isekai: 24, romance: 24, drama: 22, shounen: 22,

    // Дуже популярні — стабільно високо, трохи нижче за мейнстрім.
    'sci-fi': 16, supernatural: 16, 'slice-of-life': 14, mystery: 14, ecchi: 13, seinen: 12,
    sports: 11, psychological: 11, horror: 10, school: 10, 'super-power': 9, mecha: 9, harem: 9,

    // Помітні — з'являються регулярно, але не щоразу вгорі.
    military: 6, historical: 6, 'martial-arts': 5, detective: 5, suspense: 5, music: 4,
    space: 4, vampire: 4, shoujo: 4,

    // Нішеві, але впізнавані — легкий підйом над базовою вагою.
    mythology: 3, samurai: 3, parody: 3, gore: 3, josei: 3, 'time-travel': 3, reincarnation: 3,
    'adult-cast': 2, 'love-polygon': 2, 'gag-humor': 2, 'award-winning': 2
}

function genreWeight(slug) {
    return GENRE_WEIGHTS[slug] || 1
}

// Зважений випадковий порядок (Efraimidis–Spirakis): key = random^(1/weight),
// сортуємо за спаданням key -> більша вага частіше опиняється вище, але з рандомом.
function genresWeightedOrder() {
    return GENRES.map(function(g) {
        return { g: g, k: Math.pow(Math.random(), 1 / genreWeight(g.slug)) }
    }).sort(function(a, b) {
        return b.k - a.k
    }).map(function(x) {
        return x.g
    })
}

// Локалізація: en -> nameEn, решта (uk/ru/be) -> uk (Hikka — україномовне джерело).
function t(uk, ru, en) {
    if (Lang.selected(['en'])) return en
    return uk
}

function genreTitle(g) {
    return Lang.selected(['en']) ? g.en : g.uk
}

function category(params, oncomplite, onerror) {
    params = params || {}

    // Карта франшиз для дедупу/tmdb — вантажимо один раз при відкритті категорії (паралельно
    // з каталогом; card()/fetchCatalog усе одно чекають на неї через AnimeMap.load).
    AnimeMap.load()

    // Свіжий розклад на кожне відкриття категорії: скидаємо мемо, щоб loadSchedule зробив
    // рівно один POST /schedule/anime (обидва ряди «сьогодні»/«завтра» читають з нього).
    scheduleList = null
    scheduleFetching = false
    scheduleQueue = []

    var parts_limit = 6

    var parts_data = [
        // Вийшло сьогодні — Hikka /schedule/anime, епізоди з airing_at у межах сьогодні (лок. день).
        // Статичний ряд (без пагінації/кнопки "Ще").
        schedulePart(0, 'today', function(json) {
            json.title = t('Вийшло сьогодні', 'Вышло сегодня', 'Aired today')
            iconLine(json, '<svg><use xlink:href="#sprite-calendar"></use></svg>', '#4caf50')
        }),

        // Очікується завтра — той самий розклад Hikka, епізоди з airing_at у межах завтра (offset +1).
        schedulePart(1, 'tomorrow', function(json) {
            json.title = t('Очікується завтра', 'Ожидается завтра', 'Expected tomorrow')
            iconLine(json, '<svg><use xlink:href="#sprite-calendar"></use></svg>', '#3ea6ff')
        }),

        // З високим рейтингом — POST /anime { sort:['score:desc','scored_by:desc'] } (найкраще оцінене).
        part('rated', { life: day }, function(json) {
            json.title = t('З високим рейтингом', 'С высоким рейтингом', 'Top rated')
            iconLine(json, 'icon_star', '#ffb300')
        }),

        // У топі — POST /anime { sort:['scored_by:desc'], years:[рік-6,рік] } (популярне останніх років).
        // Широкі картки (wide, як у cub) + іконка-стрічка #sprite-feed.
        part('top', { life: day }, function(json) {
            json.title = t('У топі', 'В топе', 'Top')
            iconLine(json, 'icon_fire', '#fd4518')
            //wideLine(json)
        }),

        // Зараз виходить — POST /anime { sort:['native_score:desc'], status:['ongoing'], years:[рік,рік] }.
        part('ongoing', { life: day }, function(json) {
            json.title = t('Зараз виходить', 'Сейчас выходит', 'Airing now')
            iconLine(json, '<svg><use xlink:href="#sprite-feed"></use></svg>', '#3ea6ff')
        }),

        // Фільми — POST /anime { media_type:['movie'] }, за оцінкою.
        part('movie', { life: day }, function(json) {
            json.title = t('Фільми', 'Фильмы', 'Movies')
            iconLine(json, '<svg><use xlink:href="#sprite-movie"></use></svg>', '#b06bff')
        }),

        // Класика — POST /anime { years:[1990,2009], sort:['scored_by:desc'] } (ретро-хіти).
        part('classic', { life: day }, function(json) {
            json.title = t('Класика', 'Классика', 'Classics')
            iconLine(json, '<svg><use xlink:href="#sprite-history"></use></svg>', '#c9a227')
        }),

        // За ранобе — POST /anime { source:['light_novel'] }, за оцінкою (переважно ісекай/фентезі).
        part('novel', { life: day }, function(json) {
            json.title = t('За ранобе', 'По ранобэ', 'From light novels')
            iconLine(json, '<svg><use xlink:href="#sprite-book"></use></svg>', '#ff6b9d')
        }),

        // Оригінальні — POST /anime { source:['original'] }, за оцінкою (не за мангою/ранобе).
        part('original', { life: day }, function(json) {
            json.title = t('Оригінальні', 'Оригинальные', 'Original works')
            iconLine(json, '<svg><use xlink:href="#sprite-collection"></use></svg>', '#2ec4b6')
        })
    ]

    // Жанрові ряди — після топу, у зваженому випадковому порядку (кожен: sort=score + фільтр жанру).
    genresWeightedOrder().forEach(function(g) {
        parts_data.push(part('genre:' + g.slug, { life: day }, function(json) {
            json.title = genreTitle(g)
        }))
    })

    ContentRows.call('category_anime', params, parts_data)

    function loadPart(partLoaded, partEmpty) {
        Api.partNext(parts_data, parts_limit, partLoaded, partEmpty)
    }

    loadPart(oncomplite, onerror)
    return loadPart
}

// ── Пагінація кнопки "Ще" / компонент category_full ──────────────────────────
//
// Виключення no-tmdb може лишити сиру сторінку порожньою ПІСЛЯ фільтра, а сітка без нових
// карток не тригерить наступне довантаження -> застопориться. Тому робимо обмежений «дочит»:
// тягнемо сирі сторінки (за власним курсором page, per-descriptor), доки не набереться >=1
// картка або не впремось у кінець.
// Фіксовані (не жанрові) дескриптори ряду — для валідації в list() (мають збігатися з category()).
var FIXED_ROWS = ['rated', 'top', 'ongoing', 'translated', 'movie', 'classic', 'novel', 'original']

var ENDS   = {}   // descriptor -> true: сира відповідь порожня / досягнуто pages -> стоп
var CURSOR = {}   // descriptor -> наступна api-сторінка (скидається на page===1)
var PAGES  = {}   // descriptor -> реальна к-сть сторінок API (pagination.pages) -> total_pages сітки
var MAX_LOOKAHEAD = 5   // максимум сирих сторінок за один виклик list (бар'єр від довгого no-tmdb хвоста)

function batchResult(page, results, descriptor) {
    // total_pages — реальна к-сть сторінок API (pagination.pages, з відповіді). Оскільки через
    // фільтр no-tmdb грід-сторінка не завжди 1:1 з api-сторінкою, точний кінець усе одно ловить
    // ENDS (порожня сира сторінка / apiPage >= pages). Fallback MAX_PAGES, якщо API не дав pages.
    return { results: results, page: page, total_pages: PAGES[descriptor] || MAX_PAGES, total_results: results.length, source: SOURCE }
}

function list(params, oncomplite, onerror) {
    onerror = onerror || function() {}

    var url = params && params.url ? String(params.url) : ''
    if (url.indexOf('siaivo:') !== 0) return onerror()

    var descriptor = url.slice('siaivo:'.length)
    var page = parseInt(params.page || 1, 10)

    // Дозволені дескриптори: фіксовані ряди + будь-який жанровий (genre:<slug>).
    if (FIXED_ROWS.indexOf(descriptor) < 0 && descriptor.indexOf('genre:') !== 0) return onerror()

    // 1-ша сторінка сітки -> нова сесія: скидаємо курсор і пам'ять дедупу/кінця/сторінок.
    if (page === 1) {
        CURSOR[descriptor] = 1
        SEEN[descriptor] = {}
        ENDS[descriptor] = false
        PAGES[descriptor] = 0
    }

    if (ENDS[descriptor]) return onerror()   // реальний кінець уже досягнуто

    fetchBatch([], 0)

    // Акумулює оброблені картки, доти доки >=1 або кінець/ліміт дочиту.
    function fetchBatch(acc, tries) {
        var apiPage = CURSOR[descriptor] || 1

        fetchCatalog(descriptor, apiPage, { life: day }, function(json) {
            PAGES[descriptor] = json.total_pages       // реальна к-сть сторінок API (для total_pages сітки)

            if (!json.results.length) {                 // порожня СИРА відповідь -> реальний кінець
                ENDS[descriptor] = true
                return acc.length ? oncomplite(batchResult(page, acc, descriptor)) : onerror()
            }

            var isLast = json.total_pages && apiPage >= json.total_pages
            CURSOR[descriptor] = apiPage + 1

            // Виключення no-tmdb + дедуп (isReset=false: курсор/SEEN підготовлені на page===1).
            processPage(json, descriptor, false, function() {
                acc = acc.concat(json.results)

                if (acc.length) return oncomplite(batchResult(page, acc, descriptor))   // є що показати
                if (isLast) { ENDS[descriptor] = true; return onerror() }     // остання сира сторінка
                if (tries + 1 >= MAX_LOOKAHEAD) return onerror()              // довгий no-tmdb хвіст -> стоп

                fetchBatch(acc, tries + 1)   // сторінка порожня після фільтра -> дочит наступної
            })
        }, function() {
            acc.length ? oncomplite(batchResult(page, acc, descriptor)) : onerror()
        })
    }
}

// ── Службове ─────────────────────────────────────────────────────────────────
//
// full/person/seasons НЕ реєструємо: картки каталогу мають source:'tmdb' (ідентичність
// проставлена в card()), тож відкриття/актори/сезони йдуть нативно через джерело tmdb.
// Siaivo лишає за собою тільки екран каталогу (main/category) і пагінацію (list).

function clear() {
    network.clear()

    // Звільняємо пам'ять дедупу/пагінації, щоб вона не накопичувалась за довгу сесію.
    // Безпечно: clear() — тільки teardown (Api.clear при зміні профілю/ai), а list()/part()
    // реініціалізують ці мапи per-descriptor на 1-й сторінці (page===1 / isReset).
    SEEN   = {}
    ENDS   = {}
    CURSOR = {}
    PAGES  = {}

    // Звільняємо мемоізований розклад (обидва ряди «сьогодні»/«завтра»).
    scheduleList     = null
    scheduleFetching = false
    scheduleQueue    = []
}

var source = {
    main: category,
    category: category,
    list: list,
    clear: clear
}

function register() {
    if (!Api.sources) {
        setTimeout(register, 0)
        return
    }

    Api.sources[SOURCE] = source
}

register()

// Прелоад карти mal->tmdb при готовності застосунку (сирий файл; індекс будується ліниво).
AnimeMap.preloadWhenReady()

export default source
