import Timetable from '../../core/timetable'
import Favorite from '../../core/favorite'
import TMDB from '../../core/api/sources/tmdb'
import Timer from '../../core/timer'
import Cache from '../../utils/cache'
import Utils from '../../utils/utils'
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

let original_init = Timetable.init

Timetable.init = function(){
    original_init.apply(this, arguments)

    Lampa.Listener.follow('state:changed', (e) => {
        // і Timetable, і ми після parse шлемо цю подію - запис щойно оновлено
        if (e.target == 'timetable' && e.reason == 'parse') {
            times[e.id] = Date.now()
        }

        if (e.target == 'favorite') {
            pool_at = 0
        }
    })

    Timer.add(tick_time, tick)
}
