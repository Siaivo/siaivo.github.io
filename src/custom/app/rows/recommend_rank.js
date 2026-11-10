// Порядок стрічки «Рекомендуємо подивитись» з TMDB-рекомендацій до кожного тайтлу з історії.
// Без імпортів Лампи, щоб перевірялось у spec/ на зібраних руками даних.
//
// answers[i] - рекомендації до i-го джерела, weights[i] - його вага (від'ємна - кинуте:
// його поради топлять картку), accept(item, key) - чи можна показувати картку взагалі,
// now - мілісекунди, від них новинки, taste - множник профілю смаку (recommend_taste) разом
// з показами (recommend_signals) або null, profile - картки джерел, з яких рахуємо, якою
// стрічка має бути за форматом, мовою й роками (калібрування).

let row_size    = 20
let per_seed    = 4    // скільки карток одне джерело може дати в перші row_size
let keep        = 60   // стільки калібруємо, далі - просто за очками
let prior_en    = 200  // байєсів рейтинг: стільки «середніх» голосів домішуємо до власних
let prior_local = 50   // неанглійським менше: голоси на TMDB вони набирають повільніше
let mean        = 6.5  // середня оцінка, до якої тягне рейтинг з малою кількістю голосів
let gate        = 6.7  // байєсова оцінка, нижче якої картка йде після всіх інших
let fresh       = 365  // днів: вийшло недавно - буст
let fresh_x     = 1.2
let lambda      = 0.97  // калібрування: 0 - лише очки, 1 - лише схожість на історію
let alpha       = 0.01 // згладжування розподілу стрічки, щоб KL не йшов у нескінченність

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
// як від prior голосів, а не зникає зовсім.
function bayes(item){
    let prior = item.original_language == 'en' ? prior_en : prior_local
    let votes = item.vote_count == null ? prior : item.vote_count || 0

    return (votes * (item.vote_average || 0) + prior * mean) / (votes + prior)
}

function released(item, now){
    let time = Date.parse(item.release_date || item.first_air_date || '')

    return isNaN(time) ? Infinity : (now - time) / day_ms
}

// Осі калібрування: формат, мова, давнина. Аніме з Hikka/Shikimori мови не має - воно японське.
function group(item){
    let lang = item.mal_id ? 'ja' : item.original_language

    return ['en', 'ja', 'ko', 'zh'].indexOf(lang) >= 0 ? lang : lang == 'cn' ? 'zh' : 'other'
}

function era(item, now){
    let year = parseInt((item.release_date || item.first_air_date || '').slice(0, 4)) || 0
    let this_year = new Date(now).getFullYear()

    return year >= this_year - 1 ? 'new' : year >= this_year - 5 ? 'recent' : 'old'
}

function axes(now){
    return [
        item => item.media_type || (item.name ? 'tv' : 'movie'),
        group,
        item => era(item, now)
    ]
}

// Частки категорій однієї осі серед карток.
function share(cards, axis){
    let result = {}

    cards.forEach(card => {
        let name = axis(card)

        result[name] = (result[name] || 0) + 1 / cards.length
    })

    return result
}

// KL(історія || стрічка) по всіх осях, якщо до стрічки додати row. Steck, «Calibrated
// Recommendations» (2018): стрічка повторює пропорції історії, а не лише найсильніший її бік.
function divergence(target, counts, total, row, list){
    let sum = 0

    target.forEach((want, a) => {
        let mine = list[a](row.item)

        Object.keys(want).forEach(name => {
            let have = ((counts[a][name] || 0) + (mine == name ? 1 : 0)) / (total + 1)
            let soft = (1 - alpha) * have + alpha * want[name]

            sum += want[name] * Math.log(want[name] / soft)
        })
    })

    return sum
}

// Жадібно: на кожне місце - картка з найкращим (1 - lambda) * очки - lambda * KL. У перших
// row_size одне джерело дає не більше per_seed. Решта після keep - за очками.
function calibrate(rows, profile, now){
    let list   = axes(now)
    let target = profile.length ? list.map(axis => share(profile, axis)) : []
    let counts = list.map(() => ({}))
    let best   = rows.length ? rows[0].score : 1
    let seeds  = {}
    let result = []
    let left   = rows.slice()

    while (result.length < keep && left.length) {
        let pick  = -1
        let value = -Infinity

        for (let i = 0; i < left.length; i++) {
            let row = left[i]

            if (result.length < row_size && (seeds[row.from] || 0) >= per_seed) {
                continue
            }

            let v = (1 - lambda) * row.score / best - lambda * divergence(target, counts, result.length, row, list)

            if (v > value) {
                value = v
                pick  = i
            }
        }

        // усі, що лишились, з уже повних джерел - беремо найсильнішу
        if (pick < 0) {
            pick = 0
        }

        let row = left.splice(pick, 1)[0]

        list.forEach((axis, a) => {
            let name = axis(row.item)

            counts[a][name] = (counts[a][name] || 0) + 1
        })

        seeds[row.from] = (seeds[row.from] || 0) + 1

        result.push(row)
    }

    return result.concat(left)
}

export default function rank(answers, weights, accept, now, taste, profile){
    let found  = {}
    let denied = {}

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

    // Скільки джерел і як сильно радять - лише підстава, вирішує якість: інакше порядок усередині
    // поради одного джерела задавала б популярність у TMDB, а не оцінка.
    sorted.forEach(row => {
        let q = bayes(row.item) / mean

        row.good  = bayes(row.item) >= gate
        row.score = Math.log(1 + row.score) * q * q
        row.score *= released(row.item, now) <= fresh ? fresh_x : 1
        row.score *= taste ? taste(row.item) : 1
    })

    sorted.sort((a, b) => b.score - a.score)

    let good = sorted.filter(row => row.good)
    let weak = sorted.filter(row => !row.good)

    return calibrate(good, profile || [], now).concat(weak).map(row => row.item)
}
