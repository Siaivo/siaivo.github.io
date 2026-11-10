import Recomend from '../../../core/recomend'
import ContentRows from '../../../core/content_rows'
import Favorite from '../../../core/favorite'
import Storage from '../../../core/storage/storage'
import Lang from '../../../core/lang'
import Router from '../../../core/router'
import Timeline from '../../../interaction/timeline'
import Player from '../../../interaction/player'
import Utils from '../../../utils/utils'
import {foreign_title, filterTitles, min_votes} from '../../core/tmdb/discover-filter'
import rank, {hash} from './recommend_rank'
import profile from './recommend_taste'
import {kind, key, delay, progress, engagement, exposure, remember, opened, today} from './recommend_signals'
import Collect from './recommend_collect'

// Стрічка «Рекомендуємо подивитись» замість core/recomend.js. Там фоновий сканер раз на 2 хв
// обходив усю історію по одному тайтлу, а стрічка показувала 20 випадкових з накопиченого.
// Тут: останні seeds_count з історії, «Переглянуто» і «Подобається», їхні рекомендації
// складаються з вагами - свіжіше й те, що зайшло, важить більше, тайтл, який радять кілька
// джерел, піднімається нагору. Поради до кинутого, навпаки, топлять картку.
//
// Поради до кожного джерела збирає у фоні recommend_collect. Стрічку теж рахуємо заздалегідь:
// після нових порад, зміни закладок чи прогресу, а не на кожен показ - показ бере готову з
// пам'яті. Пул один на всі екрани (pool()), кожен екран бере з нього джерела свого кошика.
let seeds_count   = 30
let screen_count  = 10   // щонайменше стільки своїх джерел у кожного кошика (аніме, мультфільми...)
let thrown_count  = 5
let decay         = 0.85 // вага i-го джерела: decay^i, десяте важить ~23% першого - стрічка про те, що дивишся зараз
let penalty       = -0.6 // вага кожного з кинутих
let weak          = 0.5  // /similar замість порожніх /recommendations: шумніше
let row_size      = 20   // як у recommend_rank
let channel_size  = 60   // у recomends_list: застосунок відсіює рейтинг ≤ 6 і бере до 30
let urgent_count  = 10   // перші джерела - половина ваги стрічки: їх збираємо одразу, не чекаючи фону
let wait_cold     = 2500 // нічого ще не зібрано: стільки чекаємо термінову партію
let visible_count = 8    // скільки карток стрічки видно без прокрутки: лише їх вважаємо показаними
let rebuild_wait  = 1000 // події йдуть пачками (синхронізація, кілька відповідей) - один перерахунок
let start_wait    = 5000 // перший перерахунок головної після запуску
let taste_decay   = 0.97 // свіжість у профілі смаку: сотий з історії важить ~5% першого

let marks   = ['history', 'like', 'wath', 'book', 'viewed', 'thrown', 'look', 'scheduled', 'continued']
let screens = ['movie', 'tv', 'anime', 'cartoon_movie', 'cartoon_tv'] // кошики screenMedia, крім 'all'

let state   = {snap: null, pool: [], sig: ''}
let rows    = {}    // media -> {sig, day, all}: готова стрічка
// екрани, де стрічку показували: лише їх і перераховуємо. Головну - завжди: її ряд сьомий і
// вантажиться лише при прокрутці, а з неї пишеться recomends_list для каналу Android TV (store)
let used    = {all: true}
let dirty   = false
let timer   = 0
let shown   = null  // recommend_signals: покази карток поточного профілю
let shown_name = '' // і їхній ключ у Storage

function keysOf(cards){
    let result = {}

    cards.forEach(card => result[key(card)] = true)

    return result
}

// Favorite.get без синхронізації - вкладений цикл по всіх картках закладок, тож знімок
// будуємо раз і тримаємо до зміни закладок.
function snapshot(){
    let lists = {}

    marks.forEach(type => lists[type] = Favorite.get({type}))

    return {
        lists,
        seen: keysOf([].concat.apply([], marks.map(type => lists[type]))),
        like: keysOf(lists.like),
        viewed: keysOf(lists.viewed),
        thrown: keysOf(lists.thrown)
    }
}

// Знімок, пул і його відбиток. Відбиток міняється разом зі складом пулу: зміна профілю, вхід у
// CUB, нова історія - для стрічки це одне й те саме.
function current(){
    if (!state.snap) {
        state.snap = snapshot()
        state.pool = pool(state.snap)
        state.sig  = String(hash(state.pool.map(item => key(item.card) + (item.good ? '' : '!')).join()))
    }

    return state.snap
}

// Профіль смаку з усього переглянутого (історія, потім відмітки) і кинутого.
function taste(snap){
    if (snap.taste === undefined) {
        let skip     = Object.assign({}, snap.thrown)
        let positive = []

        snap.lists.history.concat(snap.lists.viewed, snap.lists.like).forEach(card => {
            let id = key(card)

            if (!skip[id]) {
                skip[id] = true

                positive.push({card, weight: Math.pow(taste_decay, positive.length) * (snap.like[id] || snap.viewed[id] ? 1.5 : 1)})
            }
        })

        let negative = snap.lists.thrown.map((card, i) => ({card, weight: Math.pow(taste_decay, i)}))

        snap.taste = profile(positive, negative, Storage.field('tmdb_lang'))
    }

    return snap.taste
}

// Жанр 16. Аніме тут теж є - його відсікає inMedia: аніме має свій кошик і свій розділ.
function animated(card){
    return (card.genre_ids || []).indexOf(16) >= 0
}

// Кошик картки-рекомендації: 'anime' / 'tv' / 'movie', null - не показувати ніде.
function bucket(item, day){
    let date = item.release_date || item.first_air_date || ''

    // карти аніме з Hikka/Shikimori несуть постер у poster/img, а Shikimori не знає голосів
    let poster = item.poster_path || item.poster || item.img
    let few    = item.vote_count != null && item.vote_count < min_votes

    if (item.adult || !poster || !date || date > day || few) {
        return null
    }

    if (foreign_title.test(item.title || item.name || '')) {
        return null
    }

    if (Utils.isAnime(item)) {
        return 'anime'
    }

    // решта відсівів TMDB-стрічок: теленовели тощо
    if (!filterTitles([item]).length) {
        return null
    }

    return kind(item)
}

// Чи належить картка розділу: і для джерел, і для порад. 'cartoon_movie' / 'cartoon_tv' -
// сторінки жанру 16. У «Фільмах» і «Серіалах» мультфільмам не місце (на головній - навпаки,
// там усе), а exclude_genres ріже лише японські й китайські. Без жанрів у картці (буває в
// історії) мультфільмом її не вважаємо.
function inMedia(card, media){
    if (media == 'all') {
        return true
    }

    let anime = Utils.isAnime(card)

    if (media == 'anime') {
        return anime
    }

    let cartoon = media.indexOf('cartoon_') == 0

    return !anime && kind(card) == media.replace('cartoon_', '') && animated(card) == cartoon
}

// Перші count придатних кошика media; skip поповнюється взятими, щоб наступний pick їх не повторив.
function pick(cards, media, count, skip){
    let result = []

    for (let i = 0; i < cards.length && result.length < count; i++) {
        let card = cards[i]
        let id   = key(card)

        if (skip[id] || ['cub', 'tmdb'].indexOf(card.source) == -1 || !inMedia(card, media)) {
            continue
        }

        skip[id] = true

        result.push(card)
    }

    return result
}

// Не Favorite.candidates: той прибирає «Переглянуто» - для «Продовжити» це правильно, а тут
// це найсильніший сигнал «зайшло». Кожне третє місце - з відміток: інакше довга історія
// витісняла б їх повністю. skip поповнюється взятими.
function seeds(snap, media, count, skip){
    let history = pick(snap.lists.history, media, count, skip)
    let marked  = pick(snap.lists.viewed.concat(snap.lists.like), media, count, skip)
    let result  = []

    while (result.length < count && (history.length || marked.length)) {
        let mark = (result.length % 3 == 2 && marked.length) || !history.length

        result.push(mark ? marked.shift() : history.shift())
    }

    // невзяте повертаємо: його ще може взяти інший кошик
    history.concat(marked).forEach(card => delete skip[key(card)])

    return result
}

// Пул: останні seeds_count з усього переглянутого, далі кожен кошик добирає до screen_count
// своїх - інакше той, хто останнім часом дивиться лише серіали, лишився б без стрічки в аніме.
// Кинуті - в кінці пулу.
function pool(snap){
    let skip = Object.assign({}, snap.thrown)
    let good = seeds(snap, 'all', seeds_count, skip)

    screens.forEach(media => {
        let have = good.filter(card => inMedia(card, media)).length

        if (have < screen_count) {
            good = good.concat(seeds(snap, media, screen_count - have, skip))
        }
    })

    let bad = pick(snap.lists.thrown, 'all', thrown_count, {})

    return good.map(card => ({card, good: true})).concat(bad.map(card => ({card, good: false})))
}

// Джерела одного екрана - частина пулу того ж порядку.
function sources(media){
    current()

    return state.pool.filter(item => inMedia(item.card, media))
}

// Нічого з джерел екрана ще не зібрано (новий профіль, перший запуск) - чекаємо термінову партію
// перших, решту допише фон.
function collected(list){
    return Collect.read(list).then(found => {
        if (found.some((answer, i) => answer && list[i].good)) {
            return found
        }

        let first = list.filter(item => item.good).slice(0, urgent_count)

        return Promise.race([Collect.prefetch(first), delay(wait_cold)]).then(() => Collect.read(list))
    })
}

function profileCard(card){
    return Utils.isAnime(card) ? Object.assign({}, card, {original_language: 'ja'}) : card
}

// Вподобане, переглянуте чи додивлене - найсильніший сигнал «зайшло».
function strongOf(card, snap){
    let id = key(card)

    return Boolean(snap.like[id] || snap.viewed[id] || Favorite.caughtUp(card))
}

// Наскільки зайшло джерело. Серіали - за серіями з прив'язаних тайм-кодів; фільм без прив'язки
// (старі записи) - за тайм-кодом по назві.
function weightOf(card, snap, watched, now){
    let id   = key(card)
    let tv   = kind(card) == 'tv'
    let info = watched[id]

    if (!info && !tv) {
        let time = Timeline.watched(card, true) || {}

        info = {percent: time.percent, updated: time.updated}
    }

    info = info || {}

    return engagement({
        strong: strongOf(card, snap),
        tv,
        episodes: info.episodes || 0,
        percent: info.percent || 0,
        updated: info.updated || 0
    }, now)
}

// Покази свої в кожного профілю CUB, як і тайм-коди.
function shownName(){
    return 'recommend_shown' + Timeline.filename().replace('file_view', '')
}

function shownStore(){
    if (!shown || shown_name != shownName()) {
        shown_name = shownName()
        shown      = Storage.get(shown_name, '{}')
    }

    return shown
}

function shownSave(){
    Storage.set(shown_name, shown)
}

// Прогрес за прив'язаними тайм-кодами - прохід по всіх тайм-кодах, тож раз на перерахунок.
function watchedNow(){
    return progress(Storage.get(Timeline.filename(), '{}'))
}

function build(media, watched){
    let snap = current()
    let list = sources(media)
    let good = list.filter(item => item.good).length

    return collected(list).then(found => {
        let now     = Date.now()
        let date    = new Date(now).toISOString().slice(0, 10)
        let day     = today(now)
        watched     = watched || watchedNow()
        let seen    = shownStore()
        let liked   = taste(snap)
        let answers = found.map(answer => answer || {results: [], similar: false})

        let weights = list.map((item, i) => {
            let weight = i < good ? Math.pow(decay, i) * weightOf(item.card, snap, watched, now) : penalty

            return answers[i].similar ? weight * weak : weight
        })

        let accept = (item, id) => {
            return !snap.seen[id] && Boolean(bucket(item, date)) && inMedia(item, media)
        }

        let mult = item => (liked ? liked(item) : 1) * exposure(seen[key(item)], day)

        // калібруємо за тим, від чого радимо, з тими ж вагами: чотири останні аніме мають вести
        // стрічку, а не бути 4 з 37 рівноправних джерел
        // аніме в історії часто без мови (картка з Hikka) - для калібрування воно японське
        let profile = list.map((item, i) => ({card: profileCard(item.card), weight: weights[i]})).filter((p, i) => list[i].good && p.weight > 0)

        return Utils.addSource(rank(answers.map(a => a.results), weights, accept, now, mult, profile), 'tmdb')
    })
}

// Для збереженої стрічки: clearCard не знає полів карток аніме з Hikka/Shikimori.
function light(card){
    let result = Utils.clearCard(card)
    let extra  = ['media_type', 'mal_id', 'method']

    extra.forEach(field => {
        if (typeof card[field] !== 'undefined') {
            result[field] = card[field]
        }
    })

    return result
}

// Готова стрічка в пам'ять, перші row_size - у localStorage для першого показу після запуску.
// localStorage на ТВ повільний - пишемо, лише коли склад змінився.
function store(media, sig, all){
    let day   = today(Date.now())
    let total = Math.ceil(all.length / row_size)
    let top   = all.slice(0, row_size)
    let ids   = top.map(key).join()
    let saved = Storage.get('recommend_rows', '{}')
    let old   = saved[media]

    rows[media] = {sig, day, all}

    // порожньо - найімовірніше, мережа ще не піднялась: не зберігаємо, наступний показ порахує знову
    if (!all.length) {
        delete rows[media]

        return
    }

    let channel = media == 'all'
    let fresh   = old && old.sig == sig && old.day == day && old.ids == ids && old.total == total

    if (fresh && !(channel && !window.localStorage.getItem('recomends_list'))) {
        return
    }

    saved[media] = {sig, day, ids, total, results: top.map(light)}

    Storage.set('recommend_rows', saved)

    // Канал «Рекомендації» на Android TV застосунок бере з recomends_list (раніше його писав сканер core)
    if (channel) {
        Storage.set('recomends_list', all.slice(0, channel_size).map(card => {
            let result = light(card)

            result.media_type = kind(card)

            return result
        }))
    }
}

function rebuild(){
    dirty = false

    current()

    let sig     = state.sig
    let watched = watchedNow()

    Object.keys(used).forEach(media => {
        build(media, watched).then(all => store(media, sig, all)).catch(e => {
            console.log('Recomendations', 'build error:', e)
        })
    })
}

// Щось змінилось - перерахуємо. Під час перегляду стрічки не видно: рахуємо, коли плеєр закриють.
function touch(wait){
    dirty = true

    if (Player.opened()) {
        return
    }

    clearTimeout(timer)

    timer = setTimeout(rebuild, typeof wait == 'number' ? wait : rebuild_wait)
}

// Закладки змінились. Новий склад пулу - зміна профілю, вхід у CUB, нова історія: перші джерела
// без порад збираємо одразу, навіть під час перегляду - це кілька легких запитів.
function favoriteChanged(){
    let before = state.sig

    state.snap = null

    current()

    if (state.sig != before) {
        Collect.prefetch(state.pool.filter(item => item.good).slice(0, urgent_count))
    }

    // події закладок уже зібрані в пачку - другий раз не чекаємо
    touch(0)
}

// Стрічка екрана: готова з пам'яті, збережена з минулого запуску, або порахована зараз.
// {all, total}
function ready(media){
    used[media] = true

    current()

    let row = rows[media]

    if (row && row.sig == state.sig) {
        if (row.day != today(Date.now())) {
            touch()
        }

        return Promise.resolve({all: row.all, total: Math.ceil(row.all.length / row_size)})
    }

    let saved = Storage.get('recommend_rows', '{}')[media]

    if (saved && saved.sig == state.sig && Array.isArray(saved.results)) {
        touch()

        return Promise.resolve({all: saved.results, total: saved.total})
    }

    let sig = state.sig

    return build(media).then(all => {
        store(media, sig, all)

        return {all, total: Math.ceil(all.length / row_size)}
    })
}

function screenMedia(params, screen){
    if (screen == 'main') {
        return 'all'
    }

    let type = ['movie', 'tv'].indexOf(params.url) >= 0 ? params.url : null

    // Раніше за аніме: на жанрах аніме стрічки теж нема. «Мультфільми» з меню - категорія
    // фільмів із genres: 16 (interaction/menu/menu.js), жанр «Анімація» в серіалах - те саме
    // для серіалів; на інших жанрах і ключових словах стрічки нема
    if (params.genres || params.keywords) {
        return params.genres == 16 && type ? 'cartoon_' + type : null
    }

    if (screen == 'category_anime' || params.url == 'anime') {
        return 'anime'
    }

    return type
}

function add(){
    // index 0: ряди з однаковим index стають перед раніше зареєстрованими, а «Продовжити»
    // реєструється пізніше (на 'app ready') - тож ми одразу за ним, у першій партії рядів
    ContentRows.add({
        name: 'recomend_watch',
        title: Lang.translate('title_recomend_watch'),
        index: 0,
        genres: true,
        screen: ['main', 'category', 'category_anime'],
        call: (params, screen) => {
            let media = screenMedia(params, screen)

            if (!media || !sources(media).some(item => item.good)) {
                return
            }

            return function(call){
                ready(media).then(row => {
                    // переглянуте після перерахунку не чекає наступного
                    let results = row.all.filter(card => !state.snap.seen[key(card)]).slice(0, row_size)

                    if (remember(shownStore(), results.slice(0, visible_count).map(key), today(Date.now()))) {
                        shownSave()
                    }

                    call({
                        results,
                        title: Lang.translate('title_recomend_watch'),
                        total_pages: row.total,
                        page: 1,
                        params: {
                            emit: {
                                onlyMore: () => {
                                    Router.call('recomend', {media, total_pages: row.total})
                                },
                                // перейшов у картку саме зі стрічки - для показів це «бачив і відкрив»
                                onAppend: (item, element) => {
                                    item.html.on('hover:enter', () => {
                                        if (opened(shownStore(), key(element), today(Date.now()))) {
                                            shownSave()
                                        }
                                    })
                                }
                            }
                        }
                    })
                }).catch(e => {
                    console.log('Recomendations', 'build error:', e)

                    call({results: []})
                })
            }
        }
    })
}

// app.js викликає Recomend.init() у loadApp(), уже після імпорту custom - підміна встигає.
// Сканер core не запускаємо, його накопичене прибираємо. recomends_list лишаємо - це канал Android TV (store).
Recomend.init = function(){
    window.localStorage.removeItem('recomends_scan')

    add()

    let favorite_timer = 0

    Lampa.Listener.follow('state:changed', (e) => {
        if (e.target == 'favorite') {
            clearTimeout(favorite_timer)

            favorite_timer = setTimeout(favoriteChanged, rebuild_wait)
        }

        // прогрес міняє вагу джерела (запоєм, кинув); під час перегляду touch чекає плеєр
        if (e.target == 'timeline') {
            touch()
        }
    })

    Player.listener.follow('destroy', () => {
        if (dirty) {
            touch()
        }
    })

    Collect.start(() => {
        current()

        return state.pool
    }, touch)

    // головну рахуємо й без показу ряду; після старту, щоб не заважати першим рядам
    touch(start_wait)
}

// Сторінка «Ще» (components/recomend.js): готова стрічка цілком, а не лише перші row_size.
Recomend.page = function(object, call, empty){
    current()

    let page = object.page || 1
    let row  = rows[object.media]
    let all  = row && row.sig == state.sig ? Promise.resolve(row.all) : build(object.media)

    all.then(all => {
        // як у стрічці: переглянуте й відкладене після перерахунку не повертається
        all = all.filter(card => !state.snap.seen[key(card)])

        let results = all.slice((page - 1) * row_size, page * row_size)

        if (!results.length) {
            return empty({status: 404})
        }

        call({
            results,
            title: Lang.translate('title_recomend_watch'),
            total_pages: Math.ceil(all.length / row_size),
            page
        })
    }).catch(() => empty({status: 404}))
}
