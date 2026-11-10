// Порядок стрічки «Рекомендуємо подивитись» з TMDB-рекомендацій до кожного тайтлу з історії.
// Без імпортів Лампи, щоб перевірялось у spec/ на зібраних руками даних.
//
// answers[i] - рекомендації до i-го джерела, weights[i] - його вага (від'ємна - кинуте:
// його поради топлять картку), accept(item, key) - чи можна показувати картку взагалі,
// now - мілісекунди, від них новинки і щоденне перемішування, taste - множник профілю смаку
// (recommend_taste) разом з показами (recommend_signals) або null.

let per_seed = 4    // скільки карток одне джерело може дати на кожну сторінку з row_size
let row_size = 20
let head_sources = 12 // джерел, що по колу набирають перші row_size
let top_floor = 6.8 // оцінка, нижче якої картка не потрапляє в перші row_size (лише добирає недобір)
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

// 8.1 з 40 голосів не обганяє 7.8 з 20 тисяч. Голоси невідомі (Shikimori) - оцінка важить
// наполовину, як від prior голосів, а не зникає зовсім.
function quality(item){
    let votes = item.vote_count == null ? prior : item.vote_count || 0

    return (votes * (item.vote_average || 0) + prior * mean) / (votes + prior) / mean
}

function released(item, now){
    let time = Date.parse(item.release_date || item.first_air_date || '')

    return isNaN(time) ? Infinity : (now - time) / day_ms
}

// Перші row_size - по колу: кожне з head_sources джерел дає свою найсильнішу картку, у колі -
// за очками, потім друге коло... Інакше вага свіжості віддавала весь ряд п'ятьом останнім
// тайтлам історії. Вподобане й переглянуте (roles[i] = 1) у колі завжди, решта - за найкращою
// карткою; слабке джерело (roles[i] = -1) місця в колі не має, його поради лише добирають недобір.
function head(sorted, roles){
    let lists = {}
    let order = []

    sorted.forEach(row => {
        if (!lists[row.from]) {
            lists[row.from] = []

            order.push(row.from)
        }

        lists[row.from].push(row)
    })

    let chosen = order.filter(from => roles[from] > 0).slice(0, head_sources)

    order.forEach(from => {
        if (chosen.length < head_sources && chosen.indexOf(from) < 0 && !(roles[from] < 0)) {
            chosen.push(from)
        }
    })

    let result = []

    for (let round = 0; round < per_seed && result.length < row_size; round++) {
        let lap = chosen.map(from => lists[from][round]).filter(Boolean).sort((a, b) => b.score - a.score)

        result = result.concat(lap.slice(0, row_size - result.length))
    }

    return result
}

// Кожна сторінка по row_size - так само по колу з того, що лишилось: ліміт на джерело тут
// не допомагає - п'ять сильних джерел по per_seed уже заповнюють сторінку. Джерел замало
// на повну сторінку - добираємо найсильнішими з решти. Перша сторінка - лише з карток від top_floor.
function pages(rows, roles){
    let result = []

    while (rows.length) {
        let pool  = result.length ? rows : rows.filter(row => (row.item.vote_average || 0) >= top_floor)
        let page  = head(pool, roles)
        let taken = {}

        page.forEach(row => taken[row.id] = true)

        let rest = rows.filter(row => !taken[row.id])

        // недобір - спершу з тих, що пройшли поріг, потім з решти
        pool.concat(rest).forEach(row => {
            if (page.length < row_size && !taken[row.id]) {
                taken[row.id] = true

                page.push(row)
            }
        })

        rest = rest.filter(row => !taken[row.id])

        result = result.concat(page)
        rows   = rest
    }

    return result
}

// roles[i] - роль i-го джерела в колі: 1 - вподобане чи переглянуте, завжди в ньому; -1 - слабке,
// без місця в колі; 0 чи нема - за найкращою карткою.
export default function rank(answers, weights, accept, now, taste, roles){
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

    return pages(sorted, roles || []).map(row => row.item)
}
