import Timetable from '../../core/timetable'
import Favorite from '../../core/favorite'
import TMDB from '../../core/api/sources/tmdb'
import Timer from '../../core/timer'
import Cache from '../../utils/cache'
import Utils from '../../utils/utils'
import Storage from '../../core/storage/storage'
import Arrays from '../../utils/arrays'
import '../utils/db-get-many'

let pool_size   = 100
let pool_life   = 1000 * 60 * 60 // запасний перерахунок, якщо подія про зміну закладок не прийшла
let tick_time   = 1000 * 60
let busy_life   = 1000 * 60 * 2  // запит, чий колбек не прийшов (Api.clear() скидає їх мовчки)
let life_active = 1000 * 60 * 60 * 24 * 3  // збігається з кешем відповідей TMDB, частіше він віддав би те саме
let life_ended  = 1000 * 60 * 60 * 24 * 30 // завершені теж перевіряємо - їх можуть продовжити
let life_retry  = 1000 * 60 * 60           // перша повторна спроба, далі вдвічі довше

let times    = {} // id -> коли епізоди серіалу востаннє записані в IndexedDB
let attempts = {} // id -> скільки спроб поспіль невдалі
let pool     = []
let pool_at  = 0
let busy_at  = 0

// Епізоди останнього сезону для кількох серіалів разом. Закладки Timetable тримає в пам'яті,
// а картки лише з історії він пише тільки в IndexedDB (full.js:221 -> parse(true)) - їх
// дочитуємо однією транзакцією. Повертає {id: episodes}, серіалів без даних у ньому нема.
Timetable.getMany = function(cards){
    let result  = {}
    let missing = []
    let memory  = Timetable.all()

    cards.forEach(card => {
        let item = memory.find(a => a.id == card.id)

        if (item && item.episodes.length) {
            result[card.id] = item.episodes
        }
        else {
            missing.push(card.id)
        }
    })

    return Cache.getMany('timetable', missing).then(found => {
        Object.keys(found).forEach(id => {
            if (found[id].episodes && found[id].episodes.length) {
                result[id] = found[id].episodes
            }
        })

        return result
    })
}

// Скільки серій у кожному сезоні: без цього не перевірити, чи додивився фінал попереднього.
// Окремим ключем, бо запис серіалу в timetable core перезаписує цілком (parse()).
let seasons_name = 'timetable_seasons'
let seasons_max  = 500

// {id: {номер сезону: серій}}
Timetable.seasons = function(){
    return Storage.get(seasons_name, '{}')
}

function rememberSeasons(id, json){
    let counts = {}
    let list   = json.seasons || []

    list.forEach(s => {
        if (s.season_number > 0 && s.episode_count > 0) {
            counts[s.season_number] = s.episode_count
        }
    })

    if (!Object.keys(counts).length) {
        return
    }

    let all = Storage.cache(seasons_name, seasons_max, {})

    if (JSON.stringify(all[id]) == JSON.stringify(counts)) {
        return
    }

    all[id] = counts

    Storage.set(seasons_name, all)
}

// Фонове оновлення серіалів з історії. Timetable сам оновлює лише закладки, а картки лише з
// історії - тільки при відкритті повної картки. Без цього серіал, який не відкривали, назавжди
// лишився б без нового сезону і без серій, які TMDB додав пізніше.
//
// Timetable.update() тут не годиться: колбеки parse() пишуть у спільний object, і фоновий
// виклик, що збігся з extract(), записав би сезони чи епізоди в чужий серіал.

// Останні pool_size серіалів з історії, крім тих, що веде сам Timetable, і закинутих/переглянутих.
// Favorite.get() у локальному режимі - вкладений прохід по всіх картках, тому перераховуємо
// лише після зміни закладок, а не щотіку.
function buildPool(){
    let tracked = new Set(Timetable.all().map(a => a.id))
    let skip    = new Set(Favorite.get({type: 'viewed'}).concat(Favorite.get({type: 'thrown'})).map(c => c.id))

    pool = Favorite.get({type: 'history'}).filter(card => {
        if (!card.original_name || typeof card.id !== 'number' || (card.source !== 'tmdb' && card.source !== 'cub')) {
            return false
        }

        return !tracked.has(card.id) && !skip.has(card.id)
    }).slice(0, pool_size)

    pool_at = Date.now()
}

function life(card){
    return card.status == 'Ended' || card.status == 'Canceled' ? life_ended : life_active
}

function stale(card){
    return Date.now() - (times[card.id] || 0) > life(card)
}

// Наступна спроба через life_retry, 2x, 4x... але не рідше за звичайне оновлення:
// мережа могла лише кліпнути, а серіал могли й видалити з TMDB (404 щоразу).
function postpone(card){
    let delay = Math.min(life_retry * Math.pow(2, attempts[card.id] || 0), life(card))

    attempts[card.id] = (attempts[card.id] || 0) + 1

    times[card.id] = Date.now() - life(card) + delay
}

// Останній сезон, у якому є серії. Utils.countSeasons() рахує й спецвипуски (сезон 0), тож
// при анонсованому порожньому сезоні вказав би саме на нього.
function lastSeason(json){
    let seasons = (json.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0)

    if (!seasons.length) {
        return Utils.countSeasons(json) || 1
    }

    return Math.max.apply(null, seasons.map(s => s.season_number))
}

function filter(episodes){
    let fields = ['air_date', 'season_number', 'episode_number', 'name', 'still_path']

    return episodes.map(episode => {
        let item = {}

        fields.forEach(field => {
            if (typeof episode[field] !== 'undefined') {
                item[field] = episode[field]
            }
        })

        return item
    })
}

function refresh(card, done){
    let cache = {life: 60 * 24 * 3}

    // наперед як невдача: якщо колбек так і не прийде або впаде, картку не смикатимемо щотіку
    postpone(card)

    TMDB.get('tv/' + card.id, {}, (json) => {
        // Як при відкритті повної картки, але лише поля про вихід серій: сирий tv/{id} без
        // англійського запасного опису затер би overview, а source 'tmdb' - картку з CUB.
        // Відсутнє поле не передаємо: clearCard() викинув би його і зі збереженої картки.
        let fresh  = {id: card.id}
        let fields = ['status', 'number_of_seasons', 'number_of_episodes', 'next_episode_to_air']

        fields.forEach(field => {
            if (typeof json[field] !== 'undefined') {
                fresh[field] = json[field]
            }
        })

        Favorite.refresh(fresh)

        rememberSeasons(card.id, json)

        let season = lastSeason(json)

        TMDB.get('tv/' + card.id + '/season/' + season, {}, (data) => {
            let episodes = data.episodes_original || data.episodes || []

            // порожній сезон не пишемо поверх збережених серій
            if (episodes.length) {
                Cache.rewriteData('timetable', card.id, {id: card.id, season, episodes: filter(episodes)}).catch(() => {})
            }

            times[card.id] = Date.now()

            delete attempts[card.id]

            Lampa.Listener.send('state:changed', {
                target: 'timetable',
                reason: 'parse',
                id: card.id
            })

            done()
        }, done, cache)
    }, done, cache)
}

// Одна картка за тік, і не під час перегляду: на слабкому ТВ ривок у відео помітніший за все.
function tick(){
    if (Date.now() - busy_at < busy_life || Lampa.Player.opened()) {
        return
    }

    // без IndexedDB нікуди писати, а getMany() віддав би {} і все виглядало б застарілим
    if (!Cache.db) {
        return
    }

    if (Date.now() - pool_at > pool_life) {
        buildPool()
    }

    let unknown = pool.filter(card => !(card.id in times)).map(card => card.id)

    busy_at = Date.now()

    Cache.getMany('timetable', unknown, true).then(found => {
        unknown.forEach(id => {
            times[id] = found[id] ? found[id].time : 0
        })

        let card = pool.find(stale)

        if (card) {
            refresh(card, () => busy_at = 0)
        }
        else {
            busy_at = 0
        }
    })
}

// Заміна core update(). Колбеки core parse() пишуть у спільний object, який міняє і extract() по
// таймеру, і update() при відкритті картки чи додаванні в закладки. Відповідь TMDB, що прийшла
// після перемикання, записувала сезони й епізоди одного серіалу в інший. Тож update() тримає свій
// запис. extract() сам із собою майже не перетинається: поки запис не scaned, він бере той самий.
// Лишається випадок, коли запис прибрали з data посеред запиту (видалили із закладок) - тоді
// наступний тік візьме інший, і запізніла відповідь запишеться в нього. Без заміни приватного
// extract() звідси не виправити, а ймовірність мала: час відповіді до 30 с тіку.
let time_season = 1000 * 60 * 60 * 24 * 7 // як у core

function nextEpisode(episodes){
    let now_date = new Date()

    now_date.setHours(0, 0, 0)

    let now_time = now_date.getTime()
    let now_year = now_date.getFullYear()

    return episodes.find(ep => {
        if (!ep.air_date || (ep.air_date.indexOf(now_year) !== 0 && ep.air_date.indexOf(now_year + 1) !== 0)) {
            return false
        }

        return Utils.parseToDate(ep.air_date).getTime() >= now_time
    }) || false
}

function parseOwn(item, to_database){
    let cache = {life: 60 * 24 * 3}

    if (!to_database && !Favorite.checkAnyNotHistory(Favorite.check(item))) {
        Arrays.remove(Timetable.all(), item)

        Storage.remove('timetable', item.id)

        return
    }

    if (!item.season || Date.now() - item.ssn > time_season) {
        TMDB.get('tv/' + item.id, {}, (json) => {
            item.season = Utils.countSeasons(json) || 1
            item.ssn    = Date.now()

            parseOwn(item, to_database)
        }, () => {}, cache)

        return
    }

    TMDB.get('tv/' + item.id + '/season/' + item.season, {}, (ep) => {
        if (!ep.episodes) {
            return
        }

        item.episodes = filter(ep.episodes_original || ep.episodes)
        item.next     = nextEpisode(item.episodes)

        Cache.getData('timetable', item.id).then(obj => {
            if (obj) {
                // core лишає season від першого запису - оновлюємо, щоб не розходився з episodes
                obj.episodes = item.episodes
                obj.season   = item.season
            }
            else {
                obj = Arrays.clone(item)
            }

            return Cache.rewriteData('timetable', item.id, obj)
        }).then(() => {
            Lampa.Listener.send('state:changed', {
                target: 'timetable',
                reason: 'parse',
                id: item.id
            })
        }).catch(() => {})
    }, () => {}, cache)
}

Timetable.update = function(elem){
    if (!elem.original_name || typeof elem.id !== 'number' || (elem.source !== 'tmdb' && elem.source !== 'cub')) {
        return
    }

    let season = elem.number_of_seasons ? Utils.countSeasons(elem) : 0

    if (Favorite.checkAnyNotHistory(Favorite.check(elem))) {
        // додасть запис, якщо його нема, і збереже список; next/ssn core допише при наступному extract()
        Timetable.add([elem], 'update')

        let item = Timetable.all().find(a => a.id == elem.id)

        if (season) {
            item.season = season
        }

        parseOwn(item)
    }
    else {
        parseOwn({id: elem.id, season, episodes: [], ssn: Date.now()}, true)
    }
}

// Одноразово чистимо сліди тієї гонки. Чужі епізоди видно за номером сезону, що не збігається
// із сезоном запису; хибний збіг лише змусить перечитати серіал зайвий раз.
let race_fix_name = 'timetable_race_fixed'

function raceFix(){
    if (Storage.get(race_fix_name, 'false')) {
        return
    }

    let memory = Timetable.all()

    // кількість сезонів могла теж прийти чужа і застигнути на тиждень - перечитуємо всім
    memory.forEach(item => {
        item.ssn    = 0
        item.scaned = 0

        delete item.next
    })

    // add() завжди зберігає список - не чекаємо extract(), бо ТВ можуть вимкнути раніше
    Timetable.add([], 'race-fix')

    if (!Cache.db) {
        return Storage.set(race_fix_name, true)
    }

    let bad = []

    Cache.getData('timetable').then(records => {
        bad = (records || []).filter(record => {
            return record && record.id && record.season && (record.episodes || []).some(e => e.season_number != record.season)
        }).map(record => record.id)

        console.log('Timetable', 'race fix, broken:', bad.length)

        return Promise.all(bad.map(id => Cache.deleteData('timetable', id)))
    }).then(() => {
        // після видалення: core loadEpisodes() міг дочитати базу пізніше за нас і повернути старе
        memory.forEach(item => {
            if (bad.indexOf(item.id) >= 0) {
                item.episodes = []
            }
        })

        Storage.set(race_fix_name, true)
    }).catch(() => {})
}

let original_init = Timetable.init

Timetable.init = function(){
    // core init() вішає на state:changed виклик свого приватного update() - підміняємо його нашим
    let follow  = Lampa.Listener.follow
    let skipped = false

    // впізнаємо за рядком 'added' - рядки мініфікатор не чіпає, на відміну від імен
    Lampa.Listener.follow = function(name, listener){
        if (name == 'state:changed' && !skipped && String(listener).indexOf('added') >= 0) {
            skipped = true

            return
        }

        return follow.apply(this, arguments)
    }

    try {
        original_init.apply(this, arguments)
    }
    finally {
        Lampa.Listener.follow = follow
    }

    if (!skipped) {
        console.log('Timetable', 'core favorite listener not found - core changed, check update() override')
    }

    Lampa.Listener.follow('state:changed', (e) => {
        if (e.target == 'favorite' && e.reason == 'update' && (e.method == 'add' || e.method == 'added') && e.type !== 'history') {
            Timetable.update(e.card)
        }
    })

    raceFix()

    Lampa.Listener.follow('state:changed', (e) => {
        // і Timetable, і ми після parse шлемо цю подію - запис щойно оновлено
        if (e.target == 'timetable' && e.reason == 'parse') {
            times[e.id] = Date.now()
        }

        if (e.target == 'favorite') {
            pool_at = 0
        }
    })

    // закладки фон не оновлює, тож сезони для них беремо з повної картки
    Lampa.Listener.follow('full', (e) => {
        if (e.type == 'complite' && e.data.movie && e.data.movie.original_name) {
            rememberSeasons(e.data.movie.id, e.data.movie)
        }
    })

    Timer.add(tick_time, tick)
}
