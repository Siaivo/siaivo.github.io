import Api from '../../core/api/api'
import Reguest from '../../utils/reguest'
import Lang from '../../core/lang'
import LineModule from '../../interaction/items/line/module/module'
import ContentRows from '../../core/content_rows'
import Router from '../../core/router'

// Категорія «Настрій» — самодостатній модуль. Реєструється як джерело Api.sources['mood']
// (category-компонент рендерить екран за source:'mood').
//
// Дані: зовнішній статичний репозиторій, що оновлюється раз на день:
//   index   GET /mood/index.json -> { updated_at, themes:[{ slug, title_uk, title_ru,
//           count, uk_url, ru_url, stale }] } (uk_url/ru_url — відносні від домену).
//   тема    GET /<uk_url|ru_url> -> { slug, icon, title, lang, items:[TMDB-like] }.
//           icon — рядок SVG (fill/stroke=currentColor), кладемо його в іконку лінії.
//           item: { id, media_type:'movie'|'tv', title, original_title, overview,
//           poster_path, backdrop_path, genre_ids, vote_average, vote_count, release_date }.
//           УВАГА: у tv-елементів теж поле title/release_date (не name/first_air_date) —
//           ремапимо в card() для tv.
//
// Особливості:
//   - кожна лінія = одна тема (10 карток), СТАТИЧНА (без пагінації/кнопки «Ще»).
//   - порядок ліній рандомний ПРИ КОЖНОМУ відкритті (як жанри в siavo-anime).
//   - іконка лінії — emoji з файлу теми.
//   - картки одразу нативні TMDB (source:'tmdb' + id + method), тож відкриття/обране/
//     continue-watch працюють через джерело tmdb.
//   - GitHub Pages віддає ACAO:* -> CORS-проксі не потрібен, звичайний GET.
var SOURCE = 'mood'
var BASE = 'https://siaivo.isroot.in/lampa-ua-pack/'
var CACHE  = { life: 0 }        // хвилини; дані оновлюються раз на день, годинний кеш ок
var parts_limit = 4

var network = new Reguest()

// ru -> ru; uk та будь-яка інша мова -> uk (fallback на uk).
function langKey() {
    return Lang.selected(['ru']) ? 'ru' : 'uk'
}

function card(item) {
    var isMovie = item.media_type === 'movie' || !!item.original_title

    var c = {
        id: item.id,
        source: 'tmdb',
        method: isMovie ? 'movie' : 'tv',
        media_type: item.media_type,
        overview: item.overview || '',
        poster_path: item.poster_path || '',
        backdrop_path: item.backdrop_path || '',
        genre_ids: item.genre_ids || [],
        vote_average: Number(item.vote_average) || 0,
        vote_count: Number(item.vote_count) || 0
    }

    if (isMovie) {
        c.title = item.title
        c.original_title = item.original_title
        c.release_date = item.release_date || ''
    }
    else {
        c.name = item.title
        c.original_name = item.original_title
        c.first_air_date = item.release_date || ''
    }

    return c
}

function loadIndex(ok, err) {
    network.silent(BASE + 'mood/index.json', function(json) {
        var themes = json && json.themes ? json.themes : []
        themes.length ? ok(themes) : err()
    }, err, false, { cache: CACHE })
}

function fetchTheme(theme, ok, err) {
    var url = BASE + (langKey() === 'ru' ? theme.ru_url : theme.uk_url)
    network.silent(url, ok, err, false, { cache: CACHE })
}

var DEFAULT_ICON = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
                   '<circle cx="12" cy="12" r="8" fill="currentColor"/></svg>'

var ICON_COLORS = [
    '#ef5350', '#ec407a', '#ab47bc', '#7e57c2', '#5c6bc0', '#42a5f5',
    '#26a69a', '#66bb6a', '#ffa726', '#ff7043', '#8d6e63', '#78909c'
]

function colorFor(slug) {
    var h = 0
    for (var i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0
    return ICON_COLORS[h % ICON_COLORS.length]
}

function iconLine(json, icon, color) {
    json.icon_svg = icon || DEFAULT_ICON
    json.icon_bgcolor = '#fff'
    json.icon_color = color
    json.params = { module: LineModule.toggle(LineModule.MASK.base, 'Icon') }
}

function part(theme) {
    return function(call) {
        fetchTheme(theme, function(data) {
            var items = data && data.items ? data.items : []

            var json = {
                results: items.map(card).filter(function(c) { return c.id }),
                title: (langKey() === 'ru' ? theme.title_ru : theme.title_uk) || (data && data.title) || theme.slug,
                page: 1,
                total_pages: 1,
                total_results: items.length,
                source: SOURCE
            }

            iconLine(json, data && data.icon, colorFor(theme.slug))

            call(json)
        }, function() {
            call({ results: [], source: SOURCE })
        })
    }
}

function shuffle(arr) {
    return arr.map(function(x) {
        return { x: x, k: Math.random() }
    }).sort(function(a, b) {
        return a.k - b.k
    }).map(function(o) {
        return o.x
    })
}

function category(params, oncomplite, onerror) {
    params = params || {}

    var parts_data = []
    var ready = false
    var queue = []

    function run(l, e) {
        Api.partNext(parts_data, parts_limit, l, e)
    }

    function loadPart(l, e) {
        ready ? run(l, e) : queue.push([l, e])
    }

    loadIndex(function(themes) {
        shuffle(themes).forEach(function(t) {
            parts_data.push(part(t))
        })

        ready = true

        var q = queue
        queue = []
        q.forEach(function(c) { run(c[0], c[1]) })
    }, function() {
        ready = true

        var q = queue
        queue = []
        q.forEach(function(c) { c[1]() })
    })

    loadPart(oncomplite, onerror)

    return loadPart
}

function list(params, oncomplite, onerror) {
    (onerror || function() {})()
}

function clear() {
    network.clear()
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

export function addMoodMenuButton() {
    var label = Lang.selected(['ru']) ? 'Настроение' : (Lang.selected(['uk']) ? 'Настрій' : 'Mood')

    var ico =
        '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">' +
            '<rect x="3" y="3" width="26" height="26" rx="4" ry="4"/>' +
            '<path d="M18,12a3.11,3.11,0,0,1,3-3,3,3,0,0,1,3,3"/>' +
            '<path d="M8,12a3.11,3.11,0,0,1,3-3,3,3,0,0,1,3,3"/>' +
            '<path d="M15.5,25a9.74,9.74,0,0,0,6-2,9.59,9.59,0,0,0,3-4"/>' +
        '</svg>'

    Lampa.Menu.addButton(ico, label, function () {
        Router.call('category', { url: 'mood', title: label, source: SOURCE })
    }).attr('data-action', 'mood')
}

export default source
