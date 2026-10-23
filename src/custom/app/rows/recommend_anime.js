// Рекомендації до аніме не з TMDB (там до «Фрірен» - загальний ісекай), а з MAL-даних мовою
// інтерфейсу: українська - Hikka, російська - Shikimori, решта мов - TMDB, як і раніше.
// Картки одразу з відповіді, без запиту на кожну: id TMDB дає статична карта AnimeMap за mal_id.
import Lang from '../../../core/lang'
import Storage from '../../../core/storage/storage'
import AnimeMap from '../../utils/anime-map'
import cors from '../../utils/cors'
import {card as hikkaCard} from '../../category/siavo-anime'

let hikka     = 'https://api.hikka.io'    // через CORS-проксі, як і каталог аніме
let shikimori = 'https://shikimori.io'    // CORS відкритий; .one/.me уже мертві - домен міняють
let size      = 20                        // як у TMDB: ранжування розраховане на 20 позицій
let recheck   = 30                        // днів: тайтл, якого Hikka не знала, питаємо знову

let slugs   = null // mal_id -> slug Hikka, або день перевірки, коли Hikka його не знала; у Storage
let waiting = {}   // mal_id -> [resolve], збираються в один пакетний запит
let timer   = 0

export function source(){
    if (Lang.selected(['uk'])) {
        return 'hikka'
    }

    if (Lang.selected(['ru'])) {
        return 'shikimori'
    }

    return null
}

function mapReady(){
    return new Promise(resolve => AnimeMap.load(resolve))
}

// Поля, з якими працюють bucket і ранжування рекомендацій.
function prepare(card){
    card.media_type        = card.method
    card.original_language = 'ja'

    return card
}

function fromHikka(item){
    let card = hikkaCard(item)

    if (!card.id || item.status == 'announced') {
        return null
    }

    card.vote_count = card._scored_by

    // card() ставить 01.01 року - анонс на грудень пройшов би як уже вихідний і ще й новинка
    if (item.start_date) {
        let date = new Date(item.start_date * 1000).toISOString().slice(0, 10)

        if (card.title) {
            card.release_date = date
        }
        else {
            card.first_air_date = date
        }
    }

    return prepare(card)
}

// Голосів Shikimori у списку не дає - vote_count лишається невідомим: поріг голосів таких карток
// не ріже, а байєсів рейтинг рахує їхню оцінку як від prior голосів (recommend_rank.js).
// Без постера Shikimori віддає заглушку /assets/globals/missing_original.jpg - це не постер.
function fromShikimori(item){
    let link   = AnimeMap.link(item.id)
    let path   = item.image && item.image.original || ''
    let poster = path && path.indexOf('missing_') == -1 ? shikimori + path : ''

    if (!link || item.status == 'anons') {
        return null
    }

    let card = {
        id: link.id,
        source: 'tmdb',
        method: link.method,
        mal_id: item.id,
        poster: poster,
        img: poster,
        vote_average: Number(item.score) || 0
    }

    if (link.method == 'movie') {
        card.title          = item.russian || item.name
        card.original_title = item.name
        card.release_date   = item.aired_on || ''
    }
    else {
        card.name           = item.russian || item.name
        card.original_name  = item.name
        card.first_air_date = item.aired_on || ''
    }

    return prepare(card)
}

// Сезони одного серіалу в MAL - окремі тайтли, а в TMDB - один: лишаємо першу позицію.
function unique(cards){
    let seen = {}

    return cards.filter(card => {
        let id = card && card.media_type + '_' + card.id

        if (!card || seen[id]) {
            return false
        }

        seen[id] = true

        return true
    })
}

function today(){
    return Math.floor(Date.now() / 86400000)
}

// Усі slug, яких бракує, - одним POST /integrations/mal/anime на всіх, хто попросив у цьому ж такті.
function slugOf(mal, get){
    slugs = slugs || Storage.get('recommend_hikka_slugs', '{}')

    let known = slugs[mal]

    if (typeof known == 'string' && known) {
        return Promise.resolve(known)
    }

    if (typeof known == 'number' && today() - known < recheck) {
        return Promise.resolve('')
    }

    return new Promise(resolve => {
        waiting[mal] = (waiting[mal] || []).concat(resolve)

        if (!timer) {
            timer = setTimeout(() => batch(get), 0)
        }
    })
}

function batch(get){
    let calls = waiting
    let ids   = Object.keys(calls)

    waiting = {}
    timer   = 0

    get(cors.apiUrl(hikka, '/integrations/mal/anime'), JSON.stringify({mal_ids: ids.map(Number)})).then(json => {
        let list = cors.unwrap(json)

        // збій мережі не запам'ятовуємо: наступний показ спитає знову
        if (Array.isArray(list)) {
            list.forEach(item => slugs[item.mal_id] = item.slug)
            ids.forEach(id => slugs[id] = typeof slugs[id] == 'string' ? slugs[id] : today())

            Storage.set('recommend_hikka_slugs', slugs)
        }

        ids.forEach(id => calls[id].forEach(resolve => resolve(typeof slugs[id] == 'string' ? slugs[id] : '')))
    })
}

// Поради до тайтлу з історії. get(url, body) - запит через чергу рекомендацій, Promise(json | null).
// null - джерело не відповіло або тайтлу там нема: тоді recommend.js бере TMDB.
export function load(card, method, from, get){
    return mapReady().then(() => {
        let mal = AnimeMap.malsOf(card.id, method)[0]

        if (!mal) {
            return null
        }

        if (from == 'shikimori') {
            return get(shikimori + '/api/animes/' + mal + '/similar').then(json => {
                return Array.isArray(json) ? unique(json.slice(0, size).map(fromShikimori)) : null
            })
        }

        return slugOf(mal, get).then(slug => {
            if (!slug) {
                return null
            }

            return get(cors.apiUrl(hikka, '/anime/' + slug + '/recommendations?page=1&size=' + size)).then(json => {
                let data = cors.unwrap(json)

                return data && Array.isArray(data.list) ? unique(data.list.map(fromHikka)) : null
            })
        })
    })
}
