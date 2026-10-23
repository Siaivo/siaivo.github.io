import Recomend from '../../../core/recomend'
import ContentRows from '../../../core/content_rows'
import Favorite from '../../../core/favorite'
import TMDB from '../../../core/tmdb/tmdb'
import Storage from '../../../core/storage/storage'
import Lang from '../../../core/lang'
import Router from '../../../core/router'
import Reguest from '../../../utils/reguest'
import Utils from '../../../utils/utils'
import {foreign_title, filterTitles, min_votes} from '../../core/tmdb/discover-filter'
import rank, {hash} from './recommend_rank'
import profile from './recommend_taste'

// Стрічка «Рекомендуємо подивитись» замість core/recomend.js. Там фоновий сканер раз на 2 хв
// обходив усю історію по одному тайтлу, а стрічка показувала 20 випадкових з накопиченого.
// Тут: останні seeds_count з історії, «Переглянуто» і «Подобається» свого кошика (аніме /
// серіали / фільми / усе для головної), їхні TMDB-рекомендації складаються з вагами - свіжіше
// переглянуте важить більше, тайтл, який радять кілька джерел, піднімається нагору.
// Поради до кинутого, навпаки, топлять картку.
let seeds_count  = 10
let thrown_count = 3
let decay        = 0.85 // вага i-го джерела: decay^i
let boost        = 1.5  // вподобане, переглянуте або додивлене
let penalty      = -0.6 // вага кожного з кинутих
let weak         = 0.5  // /similar замість порожніх /recommendations: шумніше
let row_size     = 20   // як у recommend_rank
let day          = 60 * 24
let keep_min     = 10   // днів у кеші запитів: поради TMDB до тайтлу змінюються тижнями, не днями
let keep_spread  = 8    // + до стількох днів, свої для кожного тайтлу - щоб не застарівали всі разом
let parallel     = 3    // запитів одночасно: на слабкому ТВ і через проксі 13 разом заважають одне одному
let timeout      = 10000 // як у TMDB.get; без нього Reguest чекає 30 с
let wait_cold    = 2500 // без збереженої стрічки: скільки чекати відповідей, решта - наступного разу
let wait_warm    = 300  // зі збереженою: свіжа встигає лише з кешу, інакше показуємо збережену
let taste_decay  = 0.97 // свіжість у профілі смаку: сотий з історії важить ~5% першого

let network    = new Reguest()
let loaded     = {} // 'tv_123' -> Promise({results, similar}); між сесіями тримає кеш запитів
let loaded_day = 0  // ТВ місяцями не перезапускають - раз на добу перечитуємо кеш, і застарілі йдуть у мережу
let queue      = []
let active     = 0

let marks = ['history', 'like', 'wath', 'book', 'viewed', 'thrown', 'look', 'scheduled', 'continued']

function kind(card){
    return card.media_type || (card.name ? 'tv' : 'movie')
}

function key(card){
    return kind(card) + '_' + card.id
}

function keysOf(cards){
    let result = {}

    cards.forEach(card => result[key(card)] = true)

    return result
}

// Favorite.get без синхронізації - вкладений цикл по всіх картках закладок, тож на один
// показ стрічки читаємо кожен тип рівно раз і далі працюємо зі знімком.
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

// Профіль смаку з усього переглянутого (історія, потім відмітки) і кинутого. Будується раз
// на знімок: обидві збірки одного показу ділять його.
function taste(snap){
    if (snap.taste === undefined) {
        let skip     = Object.assign({}, snap.thrown)
        let positive = []

        snap.lists.history.concat(snap.lists.viewed, snap.lists.like).forEach(card => {
            let id = key(card)

            if (!skip[id]) {
                skip[id] = true

                positive.push({card, weight: Math.pow(taste_decay, positive.length) * (snap.like[id] || snap.viewed[id] ? boost : 1)})
            }
        })

        let negative = snap.lists.thrown.map((card, i) => ({card, weight: Math.pow(taste_decay, i)}))

        snap.taste = profile(positive, negative, Storage.field('tmdb_lang'))
    }

    return snap.taste
}

// Сирий запит, а не TMDB.get: той пропускає відповідь через filterTitles, а він вирізає
// аніме - а воно потрібне на головній і в аніме. Розкладаємо по кошиках самі в bucket().
// null - помилка мережі, а не порожня відповідь.
function request(card, method){
    let url  = TMDB.api(kind(card) + '/' + card.id + '/' + method + '?api_key=' + TMDB.key() + '&language=' + Storage.field('tmdb_lang'))
    let life = day * (keep_min + Math.floor(keep_spread * hash(key(card))))

    return enqueue(() => new Promise(resolve => {
        network.silent(url, json => {
            resolve(json && Array.isArray(json.results) ? json.results : [])
        }, () => resolve(null), false, {cache: {life}, timeout})
    }))
}

// Черга в порядку постановки: build ставить джерела від найважчого, кинуті в кінці, тож за
// wait_cold встигають найважливіші. З кешу відповідь приходить одразу, черга її майже не тримає.
function enqueue(task){
    return new Promise(resolve => {
        queue.push({task, resolve})

        next()
    })
}

function next(){
    while (active < parallel && queue.length) {
        let job = queue.shift()

        active++

        // Reguest сам кличе помилку за таймаутом, але якщо колбек не прийде зовсім, слот
        // зайнятий назавжди і стрічка мертва до перезапуску - тому власна межа
        Promise.race([job.task(), delay(timeout * 2).then(() => null)]).then(result => {
            active--

            job.resolve(result)

            next()
        })
    }
}

// Для українських і нішевих тайтлів TMDB часто не має рекомендацій - тоді схожі.
// Кинутим схожі не потрібні: шумний штраф нічого не дає, а запит коштує.
function load(card, fallback){
    let today = Math.floor(Date.now() / (day * 60 * 1000))

    if (today != loaded_day) {
        loaded     = {}
        loaded_day = today
    }

    let id = key(card)

    if (loaded[id]) {
        return loaded[id]
    }

    loaded[id] = request(card, 'recommendations').then(results => {
        if (!results || results.length || !fallback) {
            return results && {results, similar: false}
        }

        return request(card, 'similar').then(similar => similar && {results: similar, similar: true})
    }).then(answer => {
        // мережа впала - наступний показ спробує ще раз
        if (!answer) {
            delete loaded[id]
        }

        return answer || {results: [], similar: false}
    })

    return loaded[id]
}

function delay(ms){
    return new Promise(resolve => setTimeout(resolve, ms))
}

// Кошик картки-рекомендації: 'anime' / 'tv' / 'movie', null - не показувати ніде.
function bucket(item, today){
    let date = item.release_date || item.first_air_date || ''

    if (item.adult || !item.poster_path || !date || date > today || (item.vote_count || 0) < min_votes) {
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

function inMedia(card, media){
    if (media == 'all') {
        return true
    }

    let anime = Utils.isAnime(card)

    return media == 'anime' ? anime : !anime && kind(card) == media
}

// Перші count придатних; skip поповнюється взятими, щоб наступний pick їх не повторив.
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
// витісняла б їх повністю.
function seeds(media, snap){
    let skip    = Object.assign({}, snap.thrown)
    let history = pick(snap.lists.history, media, seeds_count, skip)
    let marked  = pick(snap.lists.viewed.concat(snap.lists.like), media, seeds_count, skip)
    let result  = []

    while (result.length < seeds_count && (history.length || marked.length)) {
        let mark = (result.length % 3 == 2 && marked.length) || !history.length

        result.push(mark ? marked.shift() : history.shift())
    }

    return result
}

// wait - скільки чекати кожну відповідь: 0 - лише те, що вже прийшло, без нього - усі.
// Запити, що не встигли, не скасовуються: допишуть кеш для наступного build.
function build(media, snap, wait){
    let good = seeds(media, snap)
    let bad  = pick(snap.lists.thrown, media, thrown_count, {})
    let list = good.concat(bad)

    let answers = list.map((card, i) => {
        let answer = load(card, i < good.length)

        return wait === undefined ? answer : Promise.race([answer, delay(wait).then(() => ({results: [], similar: false}))])
    })

    return Promise.all(answers).then(answers => {
        let today = new Date().toISOString().slice(0, 10)

        let weights = list.map((card, i) => {
            let id     = key(card)
            let strong = snap.like[id] || snap.viewed[id] || Favorite.caughtUp(card)
            let weight = i < good.length ? Math.pow(decay, i) * (strong ? boost : 1) : penalty

            return answers[i].similar ? weight * weak : weight
        })

        let accept = (item, id) => {
            let type = !snap.seen[id] && bucket(item, today)

            return Boolean(type) && (media == 'all' || type == media)
        }

        return Utils.addSource(rank(answers.map(a => a.results), weights, accept, Date.now(), taste(snap)), 'tmdb')
    })
}

function pack(all){
    return {
        results: all.slice(0, row_size),
        total_pages: Math.ceil(all.length / row_size)
    }
}

// Збережена з минулого показу стрічка без того, що відтоді переглянуто чи відкладено.
// Копія: Storage.get віддає спільний об'єкт зі свого кешу (storage.js:85).
function stored(media, snap){
    let row     = Storage.get('recommend_rows', '{}')[media]
    let results = row ? row.results.filter(card => !snap.seen[key(card)]) : []

    return results.length ? {results, total_pages: row.total_pages} : null
}

// localStorage на ТВ повільний - пишемо, лише коли склад стрічки змінився.
function save(media, all){
    let row  = pack(all)
    let rows = Storage.get('recommend_rows', '{}')
    let old  = rows[media]
    let ids  = row.results.map(key).join()

    if (!old || old.total_pages != row.total_pages || old.results.map(key).join() != ids) {
        rows[media] = {
            results: row.results.map(card => Utils.clearCard(card)),
            total_pages: row.total_pages
        }

        Storage.set('recommend_rows', rows)
    }

    return row
}

function screenMedia(params, screen){
    if (screen == 'main') {
        return 'all'
    }

    if (screen == 'category_anime' || params.url == 'anime') {
        return 'anime'
    }

    return ['movie', 'tv'].indexOf(params.url) >= 0 ? params.url : null
}

function add(){
    // index 0: ряди з однаковим index стають перед раніше зареєстрованими, а «Продовжити»
    // реєструється пізніше (на 'app ready') - тож ми одразу за ним, у першій партії рядів
    ContentRows.add({
        name: 'recomend_watch',
        title: Lang.translate('title_recomend_watch'),
        index: 0,
        screen: ['main', 'category', 'category_anime'],
        call: (params, screen) => {
            let media = screenMedia(params, screen)
            let snap  = media && snapshot()

            if (!media || !seeds(media, snap).length) {
                return
            }

            return function(call){
                let respond = (row) => {
                    call({
                        results: row.results,
                        title: Lang.translate('title_recomend_watch'),
                        total_pages: row.total_pages,
                        page: 1,
                        params: {
                            emit: {
                                onlyMore: () => {
                                    Router.call('recomend', {media, total_pages: row.total_pages})
                                }
                            }
                        }
                    })
                }

                let last = stored(media, snap)
                let done = false
                let full = build(media, snap).then(all => save(media, all))

                // перша партія рядів чекає найповільніший, тож довго не тримаємо: збережена
                // стрічка або те, що встигло; повна збірка в будь-якому разі ляже на наступний раз
                let quick = delay(last ? wait_warm : wait_cold).then(() => {
                    if (done) {
                        return null
                    }

                    return last || build(media, snap, 0).then(pack)
                })

                Promise.race([full, quick]).then(row => {
                    done = true

                    respond(row)
                }).catch(e => {
                    console.log('Recomendations', 'build error:', e)

                    call({results: []})
                })
            }
        }
    })
}

// app.js викликає Recomend.init() у loadApp(), уже після імпорту custom - підміна встигає.
// Сканер core не запускаємо, його накопичене прибираємо.
Recomend.init = function(){
    window.localStorage.removeItem('recomends_scan')
    window.localStorage.removeItem('recomends_list')

    add()
}

// Сторінка «Ще» (components/recomend.js). Починається зі збереженої стрічки - тієї, яку
// людина щойно бачила, - далі свіжа збірка без її карток.
Recomend.page = function(object, call, empty){
    let page = object.page || 1
    let snap = snapshot()
    let last = stored(object.media, snap)

    build(object.media, snap).then(all => {
        if (last) {
            let first = keysOf(last.results)

            all = last.results.concat(all.filter(card => !first[key(card)]))
        }

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
