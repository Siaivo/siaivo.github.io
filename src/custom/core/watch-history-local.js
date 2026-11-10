import Favorite from '../../core/favorite'
import Account from '../../core/account/account'
import Timeline from '../../interaction/timeline'
import Lang from '../../core/lang'
import Storage from '../../core/storage/storage'
import SettingsApi from '../../interaction/settings/api'
import Utils from '../../utils/utils'

// «Історія» з датами й переглядами по днях (components/watch_history) у ядрі є лише з
// синхронізацією CUB: список і дати віддає сервер. Без неї збираємо те саме з локальних
// тайм-кодів: у кожного є updated - коли його дивились. Шукаємо їх за тими ж хешами, що
// Timeline.watched / watchedEpisode (назва, сезон, серія), а нові - ще й за прив'язкою до
// картки. Прямо в об'єкті тайм-кодів: watchedEpisode на кожну серію розсилав би подію 'view'.
// Картки беремо із закладки history, у тому ж порядку: картку, яку дивляться, вона й так
// піднімає нагору. Картка без тайм-кодів з датою лишається звичайною: без дати, OK відкриває її.
// Ціна: дата - останнє оновлення тайм-коду, тож повторний перегляд тієї самої серії
// заміщає попередній, а не додається.

let per_page     = 20
let max_episodes = 200 // серій у сезоні не шукаємо далі
let max_miss     = 50  // стільки поспіль без тайм-коду - сезон далі не дивились
let max_seasons  = 30  // сезонів, коли картка їх кількості не знає
let empty_stop   = 2   // ...і стільки порожніх сезонів поспіль - далі не шукаємо

let rows_cache = {} // card_id -> рядки картки зі списку: панель (watchHistoryCard) бере їх готовими

function local(){
    return !Account.Permit.sync
}

// Ключ картки в тайм-кодах (Timeline.link); серіалу link потрібні сезон і серія - будь-які
function keyOf(card){
    let ref = Timeline.link(card, 1, 1)

    return ref ? ref.card : ''
}

// Один прохід по тайм-кодах: самі записи (за хешем) і прив'язані до карток (за ключем)
function index(){
    let viewed = Storage.get(Timeline.filename(), '{}')
    let bound  = {}

    for (let hash in viewed) {
        let road = viewed[hash]

        if (road && typeof road == 'object' && typeof road.card == 'string') {
            (bound[road.card] || (bound[road.card] = [])).push(road)
        }
    }

    return {viewed, bound}
}

function seen(road){
    return road && typeof road == 'object' && parseFloat(road.percent) > 1
}

// [{season, episode, watched_at}] картки, нові першими
function rowsOf(card, key, idx){
    let found = {} // 'сезон:серія' -> рядок; одна серія могла знайтись і за хешем, і за прив'язкою

    let put = (season, episode, road) => {
        let id = season + ':' + episode

        if (seen(road) && road.updated > 0 && (!found[id] || found[id].watched_at < road.updated)) {
            found[id] = {season, episode, watched_at: road.updated}
        }
    }

    ;(idx.bound[key] || []).forEach(road => {
        put(road.season === undefined ? null : road.season, road.episode === undefined ? null : road.episode, road)
    })

    if (card.original_name) {
        let known   = parseInt(card.number_of_seasons) || 0
        let seasons = known || max_seasons
        let empty   = 0

        for (let season = 1; season <= seasons && (known || empty < empty_stop); season++) {
            let miss = 0
            let any  = false

            for (let episode = 1; episode <= max_episodes && miss < max_miss; episode++) {
                let road = idx.viewed[Utils.hash([season, season > 10 ? ':' : '', episode, card.original_name].join(''))]

                if (seen(road)) {
                    miss = 0
                    any  = true

                    put(season, episode, road)
                }
                else {
                    miss++
                }
            }

            empty = any ? 0 : empty + 1
        }
    }
    else {
        put(null, null, idx.viewed[Utils.hash(card.original_title)])
    }

    return Object.keys(found).map(id => found[id]).sort((a, b) => b.watched_at - a.watched_at)
}

// Те самі поля, що Account.Api.watchHistory кладе в card.watch_history
function summary(card, key, rows){
    let episodes = rows.filter(row => row.season > 0 && row.episode > 0)
    let days     = {}

    rows.forEach(row => {
        let date = new Date(row.watched_at)

        date.setHours(0, 0, 0, 0)

        days[date.getTime()] = true
    })

    return {
        id: key,
        card_id: key,
        season: episodes.length ? episodes[0].season : null,
        episode: episodes.length ? episodes[0].episode : null,
        watched_at: rows[0].watched_at,
        first_at: rows[rows.length - 1].watched_at,
        source: card.source,
        episodes: episodes.map(row => ({season: row.season, episode: row.episode, watched_at: row.watched_at})),
        last: episodes.length ? {season: episodes[0].season, episode: episodes[0].episode, watched_at: episodes[0].watched_at} : null,
        views: rows.length,
        days: Object.keys(days).length
    }
}

let watchHistory = Account.Api.watchHistory

Account.Api.watchHistory = function(params, secuses, error){
    if (!local()) {
        return watchHistory.apply(this, arguments)
    }

    params = params || {}

    let page    = params.page || 1
    let history = Favorite.get({type: 'history'})
    let list    = history.filter(card => {
        return !params.filter || (params.filter == 'tv') == Boolean(card.original_name)
    })

    // історії нема зовсім - не 403: екран покаже звичайну історію з її порожнім станом,
    // а не кнопку входу. Порожньо лише за фільтром - порожній екран, як із сервера
    if (!history.length) {
        if (error) {
            error({})
        }

        return
    }

    if (page == 1) {
        rows_cache = {}
    }

    let idx     = index()
    let results = list.slice((page - 1) * per_page, page * per_page).map(card => {
        let copy = Object.assign({}, card)
        let key  = keyOf(card)
        let rows = key ? rowsOf(card, key, idx) : []

        if (rows.length) {
            rows_cache[key] = rows

            copy.watch_history = summary(card, key, rows)
        }

        return copy
    })

    secuses({
        results,
        page,
        total_pages: Math.ceil(list.length / per_page),
        total: list.length
    })
}

let watchHistoryCard = Account.Api.watchHistoryCard

Account.Api.watchHistoryCard = function(card_id, secuses, error){
    if (!local()) {
        return watchHistoryCard.apply(this, arguments)
    }

    secuses(rows_cache[card_id] || [])
}

Lang.add({
    settings_watch_history_days: {
        uk: 'Історія по днях',
        en: 'History by days',
        be: 'Гісторыя па днях',
        zh: '按天显示历史',
        pt: 'Histórico por dias',
        bg: 'История по дни',
        he: 'היסטוריה לפי ימים',
        cs: 'Historie po dnech',
        ro: 'Istoric pe zile',
        fr: 'Historique par jours',
        pl: 'Historia według dni',
        es: 'Historial por días',
        ru: 'История по дням'
    },
    settings_watch_history_days_descr: {
        uk: 'Показувати в історії дати переглядів і перегляди по днях',
        en: 'Show watch dates and views by day in the history',
        be: 'Паказваць у гісторыі даты праглядаў і прагляды па днях',
        zh: '在历史记录中显示观看日期和按天的观看',
        pt: 'Mostrar no histórico as datas e as visualizações por dia',
        bg: 'Показване на датите и гледанията по дни в историята',
        he: 'להציג בהיסטוריה תאריכי צפייה וצפיות לפי ימים',
        cs: 'Zobrazovat v historii data a zhlédnutí po dnech',
        ro: 'Afișează în istoric datele și vizionările pe zile',
        fr: 'Afficher dans l’historique les dates et les visionnages par jour',
        pl: 'Pokazuj w historii daty i oglądanie według dni',
        es: 'Mostrar en el historial las fechas y las visualizaciones por día',
        ru: 'Показывать в истории даты просмотров и просмотры по дням'
    }
})

SettingsApi.addParam({
    component: 'more',
    param: {
        name: 'watch_history_days',
        type: 'trigger',
        default: true
    },
    // назву/опис ставимо в onRender: addParams() вставляє їх у DOM без перекладу
    field: {name: '', description: ' '},
    onRender: function(item){
        item.find('.settings-param__name').text(Lang.translate('settings_watch_history_days'))
        item.find('.settings-param__descr').text(Lang.translate('settings_watch_history_days_descr'))
    }
})

// Екран з датами для всіх, а не лише з синхронізацією CUB; вимкнено в налаштуваннях -
// звичайний список закладки history, і з CUB теж
Favorite.historyActivity = function(){
    let title = Lang.translate('title_history')

    if (!Storage.field('watch_history_days')) {
        return {component: 'favorite', type: 'history', title}
    }

    return {component: 'watch_history', title}
}
