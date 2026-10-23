// Порядок стрічки «Рекомендуємо подивитись» з TMDB-рекомендацій до кожного тайтлу з історії.
// Без імпортів Лампи, щоб перевірялось у spec/ на зібраних руками даних.
//
// answers[i] - рекомендації до i-го джерела, weights[i] - його вага (від'ємна - кинуте:
// його поради топлять картку), accept(item, key) - чи можна показувати картку взагалі,
// now - мілісекунди, від них новинки і щоденне перемішування, taste - множник профілю смаку
// (recommend_taste) або null.

let per_seed = 4    // скільки карток одне джерело може дати в перші row_size
let row_size = 20
let prior    = 200  // байєсів рейтинг: стільки «середніх» голосів домішуємо до власних
let mean     = 6.5  // середня оцінка, до якої тягне рейтинг з малою кількістю голосів
let fresh    = 365  // днів: вийшло недавно - буст
let fresh_x  = 1.2
let shake    = 0.2  // щоденне перемішування: до +20% очок, стабільно протягом доби

let day_ms = 1000 * 60 * 60 * 24

function key(item){
    return (item.media_type || (item.name ? 'tv' : 'movie')) + '_' + item.id
}

// детерміноване число [0, 1) з рядка
export function hash(text){
    let h = 2166136261

    for (let i = 0; i < text.length; i++) {
        h = Math.imul(h ^ text.charCodeAt(i), 16777619)
    }

    return (h >>> 0) / 4294967296
}

// 8.1 з 40 голосів не обганяє 7.8 з 20 тисяч
function quality(item){
    let votes = item.vote_count || 0

    return (votes * (item.vote_average || 0) + prior * mean) / (votes + prior) / mean
}

function released(item, now){
    let time = Date.parse(item.release_date || item.first_air_date || '')

    return isNaN(time) ? Infinity : (now - time) / day_ms
}

export default function rank(answers, weights, accept, now, taste){
    let found  = {}
    let denied = {}
    let today  = Math.floor(now / day_ms)

    answers.forEach((results, i) => {
        results.forEach((item, rank) => {
            let id = key(item)

            if (denied[id]) {
                return
            }

            if (!found[id]) {
                if (!accept(item, id)) {
                    denied[id] = true

                    return
                }

                found[id] = {item, id, score: 0, top: 0, from: i}
            }

            // вище в списку TMDB - сильніша порада, двадцята важить удвічі менше першої
            let gain = weights[i] * (1 - rank / 40)
            let row  = found[id]

            row.score += gain

            if (gain > row.top) {
                row.top  = gain
                row.from = i
            }
        })
    })

    // радили лише кинуті або вони переважили
    let sorted = Object.keys(found).map(id => found[id]).filter(row => row.score > 0)

    sorted.forEach(row => {
        row.score *= quality(row.item)
        row.score *= released(row.item, now) <= fresh ? fresh_x : 1
        row.score *= 1 + shake * hash(today + row.id)
        row.score *= taste ? taste(row.item) : 1
    })

    sorted.sort((a, b) => b.score - a.score)

    // одне джерело не забиває стрічку: зайве з нього їде в хвіст, на сторінку «Ще»
    let head = []
    let tail = []
    let used = {}

    sorted.forEach(row => {
        used[row.from] = (used[row.from] || 0) + 1

        if (head.length < row_size && used[row.from] <= per_seed) {
            head.push(row.item)
        }
        else {
            tail.push(row.item)
        }
    })

    return head.concat(tail)
}
