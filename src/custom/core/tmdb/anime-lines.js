import Api from '../../../core/api/api'
import Reguest from '../../../utils/reguest'
import AnimeMap from '../../utils/anime-map'
import cors from '../../utils/cors'
import {source, shikimoriByMal, hikkaCards, shikimoriCards} from '../../app/rows/recommend_anime'

// Ряди «Рекомендації» й «Схожі» у картці аніме — з Hikka замість TMDB (той до «Фрірен»
// радить загальний ісекай). Ряди про різне:
//   рекомендації — «кому сподобалось це, радять…»: рекомендації користувачів MAL;
//   схожі        — «таке саме за змістом»: каталог Hikka за найрідкіснішим тегом тайтлу,
//                  ранжований за збігом усіх його жанрів і тем.
// Запитів мінімум: тайтл з Hikka (slug і жанри) -> паралельно рекомендації й каталог.
// Українські назви вже в цих відповідях; для ru — ще один спільний запит назв до Shikimori.
// Готові ряди пам'ятаємо до перезапуску. Інші мови й не-аніме — TMDB, як і було.
// Запити стартують разом з TMDB, чекаємо не довше WAIT: джерело мовчить — лишається TMDB.

const WAIT  = 3000
const WEEK  = 60 * 24 * 7
const HIKKA = 'https://api.hikka.io'
const SIZE  = 20

// Найпоширеніші теги — від найширшого. Тег для пошуку схожих беремо найвужчий:
// спершу будь-який, якого тут нема (тема на кшталт video-game, military), далі — нижчий у списку.
const COMMON = ['shounen', 'seinen', 'shoujo', 'josei', 'kids', 'comedy', 'action', 'adult-cast', 'school', 'romance', 'drama', 'fantasy', 'adventure', 'love-polygon', 'romantic-subtext', 'gag-humor', 'slice-of-life', 'sci-fi', 'supernatural', 'mystery', 'suspense']
const WEIGHT = {theme: 3, genre: 2, demographic: 1}

let network = new Reguest()
let memo    = {}

function get(url, body){
    let params = {timeout: WAIT}

    if (body) {
        params.headers = {'Content-Type': 'application/json'}
    }
    else {
        params.cache = {life: WEEK}
    }

    return new Promise(resolve => {
        network.silent(url, resolve, () => resolve(null), body || false, params)
    })
}

function info(mal){
    return get(cors.apiUrl(HIKKA, '/integrations/mal/anime'), JSON.stringify({mal_ids: [mal]})).then(json => {
        let list = cors.unwrap(json)

        return Array.isArray(list) && list[0] || null
    })
}

function recommendations(item){
    return get(cors.apiUrl(HIKKA, '/anime/' + item.slug + '/recommendations?page=1&size=' + SIZE)).then(json => {
        let data = cors.unwrap(json)

        return data && Array.isArray(data.list) ? data.list : []
    })
}

function rarity(tag){
    let i = COMMON.indexOf(tag.slug)

    return i == -1 ? 100 : i
}

function similar(item){
    let genres = item.genres || []

    if (!genres.length) {
        return Promise.resolve([])
    }

    let seed = genres.slice().sort((a, b) => rarity(b) - rarity(a))[0].slug
    let mine = {}

    genres.forEach(g => mine[g.slug] = WEIGHT[g.type] || 1)

    let body = {genres: [seed], media_type: [item.media_type], score: [7, null], sort: ['score:desc']}

    return get(cors.apiUrl(HIKKA, '/anime?page=1&size=50'), JSON.stringify(body)).then(json => {
        let data = cors.unwrap(json)
        let list = data && Array.isArray(data.list) ? data.list : []

        let rank = x => (x.genres || []).reduce((sum, g) => sum + (mine[g.slug] || 0), 0) + (x.score || 0) / 10

        return list.filter(x => x.mal_id != item.mal_id).sort((a, b) => rank(b) - rank(a))
    })
}

// [рекомендації, схожі] картками; схожі — без того, що вже є в рекомендаціях
function build(mal, from){
    return info(mal).then(item => {
        if (!item || !item.slug) {
            return [null, null]
        }

        return Promise.all([recommendations(item), similar(item)]).then(found => {
            let recs = found[0]
            let seen = {}

            recs.forEach(x => seen[x.mal_id] = true)

            let like = found[1].filter(x => !seen[x.mal_id]).slice(0, SIZE * 2)

            if (from == 'hikka') {
                return [hikkaCards(recs), hikkaCards(like)]
            }

            // ru: назви й постери Shikimori — один запит на обидва ряди
            let ids    = recs.concat(like).map(x => x.mal_id)
            let images = {}

            recs.concat(like).forEach(x => images[x.mal_id] = x.image)

            return shikimoriByMal(ids.slice(0, 50), get).then(list => {
                let by = {}

                ;(list || []).forEach(x => by[x.id] = x)

                let pick = part => part.map(x => by[x.mal_id]).filter(Boolean)

                // у нових тайтлів Shikimori замість постера заглушка — беремо постер Hikka
                let fill = cards => cards && cards.map(card => {
                    if (!card.poster && images[card.mal_id]) {
                        card.poster = card.img = images[card.mal_id]
                    }

                    return card
                })

                return [fill(shikimoriCards(pick(recs))), fill(shikimoriCards(pick(like)))]
            })
        })
    })
}

function lines(mal, from){
    let key = from + mal

    if (!memo[key]) {
        memo[key] = build(mal, from).then(found => {
            // збій не запам'ятовуємо — наступне відкриття спитає знову
            if (!found[0] && !found[1]) {
                delete memo[key]
            }

            return found
        }, () => {
            delete memo[key]

            return [null, null]
        })
    }

    return memo[key]
}

function settle(promise){
    let timer = new Promise(resolve => setTimeout(() => resolve(null), WAIT))

    return Promise.race([promise.catch(() => null), timer])
}

// Картку відкривають і з джерела cub: у нього свій full(), але id ті самі, що в TMDB
function wrap(api){
    let prev = api.full.bind(api)

    api.full = function(params, oncomplite, onerror){
        let from = source()

        if (!from) {
            return prev(params, oncomplite, onerror)
        }

        // Карта mal <-> tmdb могла ще не завантажитись — вантажимо разом із TMDB
        let waits = new Promise(resolve => AnimeMap.load(resolve)).then(() => {
            let mal = AnimeMap.malsOf(params.id, params.method)[0]

            if (!mal) {
                return [null, null]
            }

            return lines(mal, from)
        })

        prev(params, data => {
            settle(waits).then(found => {
                // без постера (Shikimori віддає заглушку для нових тайтлів) — не показуємо
                found = (found || [null, null]).map(cards => cards && cards.filter(card => card.id != params.id && card.poster).slice(0, SIZE))

                // ряд підміняємо, лише якщо TMDB його взагалі дав: у дитячому режимі рядів нема
                if (data && data.recomend && found[0] && found[0].length) {
                    data.recomend.results = found[0]
                }

                if (data && data.simular && found[1] && found[1].length) {
                    data.simular.results = found[1]
                }

                oncomplite(data)
            })
        }, onerror)
    }
}

function patch(){
    if (!Api.sources || !Api.sources.tmdb) {
        setTimeout(patch, 0)

        return
    }

    wrap(Api.sources.tmdb)

    if (Api.sources.cub && Api.sources.cub.full) {
        wrap(Api.sources.cub)
    }
}

patch()
