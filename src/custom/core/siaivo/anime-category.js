import Api from '../../../core/api/api'
import Reguest from '../../../utils/reguest'
import Lang from '../../../core/lang'
import Template from '../../../interaction/template'
import LineModule from '../../../interaction/items/line/module/module'
import ContentRows from '../../../core/content_rows'
import Link from './link'

var now = new Date();
var seasonYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();

// Категорія Siaivo (каталог аніме на даних Shikimori через anime.mamoru.fun).
// Реєструється як джерело Api.sources['siaivo'] (так category-компонент рендерить
// екран за source:'siaivo'). Впровадження: parts_data + Api.partNext, декор рядів, ContentRows.
// CORS-проксі використовується завжди (не опційно).
var SOURCE = 'siaivo'
var API    = 'https://anime.mamoru.fun'
var PROXY  = 'https://cors.io/?url='
var LOCALE = 'uk'
var day    = 60 * 24

var network = new Reguest()

// Проксі увімкнено завжди (за вимогою): у API немає CORS-заголовків для браузера.
function proxied(fullUrl) {
    return PROXY + encodeURIComponent(fullUrl)
}

function apiUrl(path) {
    return proxied(API + path)
}

// MAL/Shikimori item -> картка Lampa.
// Постер кладемо в poster/img (НЕ poster_path): image.original абсолютний (anilist CDN),
// а Api.img префіксує TMDB-CDN і зламав би посилання (див. src/interaction/card.js:538-546).
function card(item) {
    var title    = item.title_ua || item.name || item.russian || ''
    var original = item.name || ''
    var year     = (item.aired_on || item.released_on || '').slice(0, 4)
    var poster   = (item.image && item.image.original) || ''
    var isMovie  = item.kind === 'movie'

    var c = {
        id: item.id,
        mal_id: item.id,
        source: SOURCE,
        overview: item.synopsis_ua || '',
        poster: poster,
        img: poster,
        vote_average: parseFloat(item.score) || 0,
        release_year: year,
        genres: []
    }

    // Lampa розрізняє фільм/серіал за набором полів: movie -> title/original_title/
    // release_date, решта (tv/ova/ona/special/...) -> name/original_name/first_air_date.
    if (isMovie) {
        c.title = title
        c.original_title = original
        c.release_date = item.aired_on || ''
    }
    else {
        c.name = title
        c.original_name = original
        c.first_air_date = item.aired_on || ''
    }

    return c
}

// API не віддає ні total_pages, ні total (total завжди 0), а ознака кінця — лише
// порожня сторінка { items:[], total:0 }. При цьому повноекранна сітка (category_full)
// читає total_pages ОДИН раз на першій сторінці (items.js:onBuild) і на довантаженні його
// НЕ перечитує (next.js: guard `object.page < this.total_pages`). Тож «плаваюче»
// total_pages=page+1 капнуло б пагінацію на 2-й сторінці. Віддаємо завідомо велике
// стале значення — знімок 1-ї сторінки покриває всі сторінки, а реальний кінець
// ловимо за порожньою сторінкою в list() (див. також пер-дескрипторну пам'ять ENDS).
var MAX_PAGES = 1000

function normalize(json, page) {
    var arr = (json && json.items) ? json.items : []
    var p = page || 1

    return {
        results: arr.map(card),
        page: p,
        total_pages: MAX_PAGES,
        total_results: arr.length,
        source: SOURCE
    }
}

// cors.io віддає не сиру відповідь, а конверт { url, status, headers, body:"<json-рядок>" }.
// Розгортаємо його перед нормалізацією.
function unwrap(json) {
    if (json && typeof json.body === 'string' && json.status !== undefined && json.url !== undefined) {
        try {
            return JSON.parse(json.body)
        } catch (e) {
            return json
        }
    }

    return json
}

function get(path, cache, oncomplite, onerror, page) {
    network.silent(apiUrl(path), function(json) {
        json = unwrap(json)

        if (!json) return onerror()

        oncomplite(normalize(json, page))
    }, onerror, false, { cache: cache })
}

// ── Категорія (сторінка-каталог) ─────────────────────────────────────────────

// Збирає функцію-частину ряду: вантажить першу сторінку і декорує лінію.
// descriptor -> json.url = 'siaivo:<descriptor>' для пагінації кнопкою "Ще".
function part(path, cache, descriptor, decorate) {
    return function(call) {
        get(path, cache, function(json) {
            if (descriptor) json.url = 'siaivo:' + descriptor
            else json.nomore = true

            decorate(json)
            call(json)
        }, call, 1)
    }
}

function iconLine(json, icon, bgcolor, color) {
    json.icon_svg = Template.string(icon)
    json.icon_bgcolor = bgcolor
    json.icon_color = color
    json.params = { module: LineModule.toggle(LineModule.MASK.base, 'Icon') }
}

// ── Жанри (фільтр catalog?genre={id}) ────────────────────────────────────────
// Список жанрів; назви локалізуються (uk/ru/en). Ряди показуються у випадковому
// порядку при кожному заході, але з пріоритетом (ваги): популярні жанри частіше вгорі.
var GENRES = [
    { id: 1,   uk: 'Екшн',               ru: 'Экшен',                       en: 'Action' },
    { id: 2,   uk: 'Пригоди',            ru: 'Приключения',                 en: 'Adventure' },
    { id: 3,   uk: 'Перегони',           ru: 'Гонки',                       en: 'Racing' },
    { id: 4,   uk: 'Комедія',            ru: 'Комедия',                     en: 'Comedy' },
    { id: 5,   uk: 'Авангард',           ru: 'Авангард',                    en: 'Avant Garde' },
    { id: 6,   uk: 'Міфологія',          ru: 'Мифология',                   en: 'Mythology' },
    { id: 7,   uk: 'Містика',            ru: 'Мистика',                     en: 'Mystery' },
    { id: 8,   uk: 'Драма',              ru: 'Драма',                       en: 'Drama' },
    { id: 9,   uk: 'Еччі',               ru: 'Этти',                        en: 'Ecchi' },
    { id: 10,  uk: 'Фентезі',            ru: 'Фэнтези',                     en: 'Fantasy' },
    { id: 13,  uk: 'Історичний',         ru: 'Исторический',                en: 'Historical' },
    { id: 14,  uk: 'Жахи',               ru: 'Ужасы',                       en: 'Horror' },
    { id: 17,  uk: 'Бойові мистецтва',   ru: 'Боевые искусства',            en: 'Martial Arts' },
    { id: 18,  uk: 'Меха',               ru: 'Меха',                        en: 'Mecha' },
    { id: 19,  uk: 'Музика',             ru: 'Музыка',                      en: 'Music' },
    { id: 20,  uk: 'Пародія',            ru: 'Пародия',                     en: 'Parody' },
    { id: 21,  uk: 'Самураї',            ru: 'Самураи',                     en: 'Samurai' },
    { id: 22,  uk: 'Романтика',          ru: 'Романтика',                   en: 'Romance' },
    { id: 23,  uk: 'Школа',              ru: 'Школа',                       en: 'School' },
    { id: 24,  uk: 'Наукова фантастика', ru: 'Фантастика',                  en: 'Sci-Fi' },
    { id: 25,  uk: 'Сьодзьо',            ru: 'Сёдзё',                       en: 'Shoujo' },
    { id: 27,  uk: 'Сьонен',             ru: 'Сёнен',                       en: 'Shounen' },
    { id: 29,  uk: 'Космос',             ru: 'Космос',                      en: 'Space' },
    { id: 30,  uk: 'Спорт',              ru: 'Спорт',                       en: 'Sports' },
    { id: 31,  uk: 'Суперсила',          ru: 'Супер сила',                  en: 'Super Power' },
    { id: 32,  uk: 'Вампіри',            ru: 'Вампиры',                     en: 'Vampire' },
    { id: 35,  uk: 'Гарем',              ru: 'Гарем',                       en: 'Harem' },
    { id: 36,  uk: 'Повсякдення',        ru: 'Повседневность',              en: 'Slice of Life' },
    { id: 37,  uk: 'Надприродне',        ru: 'Сверхъестественное',          en: 'Supernatural' },
    { id: 38,  uk: 'Військове',          ru: 'Военный',                     en: 'Military' },
    { id: 39,  uk: 'Детектив',           ru: 'Детектив',                    en: 'Detective' },
    { id: 40,  uk: 'Психологічне',       ru: 'Психологическое',             en: 'Psychological' },
    { id: 42,  uk: 'Сейнен',             ru: 'Сэйнэн',                      en: 'Seinen' },
    { id: 43,  uk: 'Дзьосей',            ru: 'Дзёсэй',                      en: 'Josei' },
    { id: 102, uk: 'Командний спорт',    ru: 'Командный спорт',             en: 'Team Sports' },
    { id: 104, uk: 'Дорослі персонажі',  ru: 'Взрослые персонажи',          en: 'Adult Cast' },
    { id: 105, uk: 'Жорстокість',        ru: 'Жестокость',                  en: 'Gore' },
    { id: 107, uk: 'Любовний багатокутник', ru: 'Любовный многоугольник',   en: 'Love Polygon' },
    { id: 111, uk: 'Подорож у часі',     ru: 'Путешествие во времени',      en: 'Time Travel' },
    { id: 112, uk: 'Ґеґ-гумор',          ru: 'Гэг-юмор',                    en: 'Gag Humor' },
    { id: 114, uk: 'Відзначене нагородами', ru: 'Удостоено наград',         en: 'Award Winning' },
    { id: 117, uk: 'Трилер',             ru: 'Триллер',                     en: 'Suspense' },
    { id: 118, uk: 'Спортивні єдиноборства', ru: 'Спортивные единоборства', en: 'Combat Sports' },
    { id: 125, uk: 'Реверс-гарем',       ru: 'Реверс-гарем',                en: 'Reverse Harem' },
    { id: 130, uk: 'Ісекай',             ru: 'Исэкай',                      en: 'Isekai' },
    { id: 131, uk: 'Хулігани',           ru: 'Хулиганы',                    en: 'Delinquents' },
    { id: 136, uk: 'Шоу-бізнес',         ru: 'Шоу-бизнес',                  en: 'Showbiz' },
    { id: 138, uk: 'Організована злочинність', ru: 'Организованная преступность', en: 'Organized Crime' },
    { id: 139, uk: 'Робота',             ru: 'Работа',                      en: 'Workplace' },
    { id: 140, uk: 'Іясікей',            ru: 'Иясикэй',                     en: 'Iyashikei' },
    { id: 144, uk: 'Кросдресинг',        ru: 'Кроссдрессинг',               en: 'Crossdressing' },
    { id: 197, uk: 'Міське фентезі',     ru: 'Городское фэнтези',           en: 'Urban Fantasy' }
]

// Пріоритет жанрів (за спаданням актуальної популярності), повний ранжир усіх жанрів.
// Мега-топ -> високий -> середній -> нішеві. Isekai/Fantasy підняті (поточний тренд).
var GENRE_PRIORITY = [
    1, 10, 2, 4, 130, 22, 8, 27, 24, 37,        // мега-топ
    36, 7, 40, 117, 23, 30, 42, 9, 35, 31,       // высокий
    18, 14, 38, 13, 19, 17, 39, 29, 32, 25,      // средний
    6, 105, 43, 20, 21, 104, 111, 107, 112, 114, // ниже
    125, 102, 118, 131, 138, 139, 140, 136, 197, 5, 144, 3  // нишевые
]

function genreWeight(id) {
    var i = GENRE_PRIORITY.indexOf(id)
    // вага = позиція в ранжирі (топ -> len, низ -> 1); невідомий жанр -> базова 1.
    return i === -1 ? 1 : (GENRE_PRIORITY.length - i)
}

// Зважений випадковий порядок (Efraimidis–Spirakis): key = random^(1/weight),
// сортуємо за спаданням key -> більша вага частіше опиняється вище, але з рандомом.
function genresWeightedOrder() {
    return GENRES.map(function(g) {
        return { g: g, k: Math.pow(Math.random(), 1 / genreWeight(g.id)) }
    }).sort(function(a, b) {
        return b.k - a.k
    }).map(function(x) {
        return x.g
    })
}

// Локалізація: підтримуються лише ru / uk / en. Будь-яка інша мова -> uk (fallback),
// бо дефолт ядра — ru, а нам потрібна українська за замовчуванням.
function t(uk, ru, en) {
    if (Lang.selected(['ru', 'be'])) return ru
    if (Lang.selected(['en'])) return en
    return uk
}

function genreTitle(g) {
    return t(g.uk, g.ru, g.en)
}

function category(params, oncomplite, onerror) {
    params = params || {}

    var parts_limit = 6

    var parts_data = [
        part('/api/shikimori/catalog?order=ranked&status=released,ongoing&score=8&limit=20&locale=' + LOCALE + '&page=1', { life: day },
            'catalog?order=ranked&status=released,ongoing&score=8&limit=20&locale=' + LOCALE, function(json) {
            json.title = t('У топі', 'В топе', 'Top')
            iconLine(json, 'icon_star', '#fff', '#ffb300')
        }),

        // ПОПУЛЯРНЫЕ — лучшее по рейтингу за текущий год, без анонсов
        part('/api/shikimori/catalog?status=released,ongoing&order=ranked&score=7&season=' + seasonYear + '&limit=20&locale=' + LOCALE + '&page=1', { life: day },
            'catalog?status=released,ongoing&order=ranked&score=7&season=' + seasonYear + '&limit=20&locale=' + LOCALE, function(json) {
            json.title = t('Популярні', 'Популярные', 'Popular')
            iconLine(json, 'icon_fire', '#fff', '#fd4518')
        }),

        // СЕЙЧАС СМОТРЯТ — популярное среди вещаемого сейчас
        part('/api/shikimori/catalog?order=popularity&status=ongoing&score=7&season=' + seasonYear + '&limit=20&locale=' + LOCALE + '&page=1', { life: day },
            'catalog?order=popularity&status=ongoing&score=7&season=' + seasonYear + '&limit=20&locale=' + LOCALE, function(json) {
            json.title = t('Зараз дивляться', 'Сейчас смотрят', 'Watching now')
        }),


        // v2

        // part('/api/shikimori/catalog?order=popularity&score=8&limit=20&locale=' + LOCALE + '&page=1', { life: day },
        //     'catalog?order=popularity&score=8&limit=20&locale=' + LOCALE, function(json) {
        //     json.title = t('У топі', 'В топе', 'Top')
        //     iconLine(json, 'icon_star', '#fff', '#ffb300')
        // }),

        // part('/api/shikimori/catalog?status=released,ongoing&order=ranked&score=7&season=' + seasonYear + '&limit=20&locale=' + LOCALE + '&page=1', { life: day },
        //     'catalog?status=released,ongoing&order=ranked&score=7&season=' + seasonYear + '&limit=20&locale=' + LOCALE, function(json) {
        //     json.title = t('Популярні', 'Популярные', 'Popular')
        //     iconLine(json, 'icon_fire', '#fff', '#fd4518')
        // }),

        // part('/api/shikimori/catalog?order=popularity&status=ongoing&score=7&season=' + seasonYear + '&limit=20&locale=' + LOCALE + '&page=1', { life: day },
        //     'catalog?order=popularity&status=ongoing&score=7&season=' + seasonYear + '&limit=20&locale=' + LOCALE, function(json) {
        //     json.title = t('Зараз дивляться', 'Сейчас смотрят', 'Watching now')
        // }),

        // v2



        part('/api/shikimori/catalog?status=ongoing&score=7&limit=20&locale=' + LOCALE + '&page=1', { life: day },
            'catalog?status=ongoing&score=7&limit=20&locale=' + LOCALE, function(json) {
            json.title = t('Зараз виходить', 'Сейчас выходит', 'Airing now')
        }),
        part('/api/shikimori/catalog?status=latest&score=7&limit=20&locale=' + LOCALE + '&page=1', { life: day },
            'catalog?status=latest&score=7&limit=20&locale=' + LOCALE, function(json) {
            json.title = t('Нещодавно випущене', 'Недавно вышедшее', 'Recently released')
        }),
        part('/api/shikimori/catalog?status=released&score=7&limit=20&locale=' + LOCALE + '&page=1', { life: day },
            'catalog?status=released&score=7&limit=20&locale=' + LOCALE, function(json) {
            json.title = t('Випущене', 'Вышедшее', 'Released')
        })
    ]

    // Жанрові ряди — після фіксованих, у зваженому випадковому порядку.
    genresWeightedOrder().forEach(function(g) {
        parts_data.push(part(
            '/api/shikimori/catalog?genre=' + g.id + '&limit=20&locale=' + LOCALE + '&page=1', { life: day },
            'catalog?genre=' + g.id + '&limit=20&locale=' + LOCALE, function(json) {
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

// Пер-дескрипторна пам'ять останньої НЕПОРОЖНЬОЇ сторінки: щойно натрапили на порожню
// сторінку, запам'ятовуємо межу, щоб подальші довантаження (page росте безкінечно через
// велике total_pages) не смикали мережу даремно.
var ENDS = {}

function list(params, oncomplite, onerror) {
    onerror = onerror || function() {}

    var url = params && params.url ? String(params.url) : ''
    if (url.indexOf('siaivo:') !== 0) return onerror()

    var descriptor = url.slice('siaivo:'.length)
    var page = parseInt(params.page || 1, 10)

    if (descriptor.indexOf('catalog?') !== 0) return onerror()

    // Вже знаємо, що далі порожньо — не ходимо в мережу.
    if (ENDS[descriptor] && page > ENDS[descriptor]) return onerror()

    var path = '/api/shikimori/catalog?' + descriptor.slice('catalog?'.length) + '&page=' + page

    get(path, { life: day }, function(json) {
        if (!json.results.length) {
            ENDS[descriptor] = page - 1   // последняя непустая страница
            return onerror()
        }

        oncomplite(json)
    }, onerror, page)
}

// ── Детальна сторінка: mal_id -> ani.zip -> themoviedb_id -> деталь TMDB ───────
//
// У MAL/Shikimori немає власної детальної сторінки, тож беремо точний мапінг з
// api.ani.zip (за mal_id, через кешований Link) і відкриваємо деталь TMDB за
// themoviedb_id. Метод — з mappings.type (MOVIE -> movie, решта -> tv).

function full(params, oncomplite, onerror) {
    onerror = onerror || function() {}

    var tmdb = Api.sources.tmdb
    var data = (params && params.card) || params || {}
    var malId = data.mal_id || data.id

    if (!tmdb || !malId) return softFail(onerror)

    Link.resolve(malId, function(link) {
        // Немає мапінгу на TMDB (themoviedb_id === null) або ani.zip недоступний ->
        // будуємо деталь з уже наявних даних картки.
        if (!link || !link.id) return buildFromCard(data, oncomplite, onerror)

        tmdb.full({ method: link.method, id: link.id }, oncomplite, onerror)
    })
}

// Компонент full чекає об'єкт { movie: <картка> }. Будуємо картку з MAL-деталі за mal_id:
// деталь має ту саму форму, що й елемент каталогу, тож проганяємо її через card(). Це
// працює і при deep-link (холодний старт), коли Lampa створює мінімальну картку
// { id, source } без title/постера (activity.js parseStart). Ряди persons/episodes/similar
// тощо під guard'ами і просто не відрендеряться, коли даних немає.
function buildFromCard(incoming, oncomplite, onerror) {
    var malId = (incoming && (incoming.mal_id || incoming.id)) || null
    if (malId == null) return softFail(onerror)

    network.silent(apiUrl('/api/shikimori/anime/' + malId + '?locale=' + LOCALE), function(json) {
        var d = unwrap(json)
        var movie = (d && (d.title_ua || d.name || d.russian)) ? card(d) : incoming

        finishFromCard(movie, d, oncomplite, onerror)
    }, function() {
        finishFromCard(incoming, null, oncomplite, onerror)
    }, false, { cache: { life: day } })
}

function finishFromCard(movie, detail, oncomplite, onerror) {
    if (!movie || !(movie.title || movie.name)) return softFail(onerror)

    // Компоненти full очікують у картки TMDB-масиви і падають на .length/.join,
    // коли їх немає: start.js/descr.js -> production_countries (через parseCountries),
    // descr.js:54 -> production_companies. Проставляємо порожні масиви.
    if (!movie.production_countries) movie.production_countries = []
    if (!movie.production_companies) movie.production_companies = []

    enrichCard(movie, detail)

    oncomplite({ movie: movie })
}

function enrichCard(card, d) {
    if (!d) return

    // Опис: для ru — поле description, для решти мов — synopsis_ua.
    var overview = Lang.selected(['ru']) ? d.description : d.synopsis_ua
    if (overview) card.overview = overview

    if (Array.isArray(d.genres) && d.genres.length) {
        card.genres = d.genres.map(function(g) {
            return { id: g.id, name: Lang.selected(['ru']) ? (g.russian || g.name) : g.name }
        })
    }

    if (d.episodes) card.number_of_episodes = d.episodes
    if (d.duration) card.runtime = d.duration
}

function softFail(onerror) {
    try {
        if (window.Lampa && Lampa.Noty) Lampa.Noty.show(t(
            'Деталі для цього тайтлу поки недоступні',
            'Детали для этого тайтла пока недоступны',
            'Details for this title are not available yet'
        ))
    } catch (e) {}

    // full-компонент: onerror = emit('error', status) -> onError читає status.blocked.
    // Передаємо { empty:true }, інакше status=undefined і onError падає на .blocked.
    onerror({ empty: true })
}

// ── Делегування / службове ───────────────────────────────────────────────────

function person(params, oncomplite, onerror) {
    Api.sources.tmdb.person(params, oncomplite, onerror)
}

function seasons(params, oncomplite, onerror) {
    Api.sources.tmdb.seasons(params, oncomplite, onerror)
}

function clear() {
    network.clear()
}

var source = {
    main: category,
    category: category,
    list: list,
    full: full,
    person: person,
    seasons: seasons,
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

export default source
