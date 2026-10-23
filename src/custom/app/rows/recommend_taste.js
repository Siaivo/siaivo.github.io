// Профіль смаку для стрічки «Рекомендуємо подивитись»: жанри, мова оригіналу й епоха з усієї
// історії, а не лише з десяти джерел. Повертає множник для картки, усі межі м'які - профіль
// лише підсуває всередині стрічки, саму стрічку будують поради TMDB до джерел.
// Без імпортів Лампи, щоб перевірялось у spec/.

let min_cards  = 3    // з меншої історії профіль - шум
let genre_up   = 0.25 // улюблені жанри: до ×1.25
let genre_down = 0.15 // кинуті жанри: до ×0.85
let genre_min  = 2    // стільки кинутих жанру, щоб це був жанр, а не один фільм
let lang_up    = 0.15
let lang_none  = 0.9  // мова, якої в історії нема зовсім (крім мови інтерфейсу)
let era_span   = 5    // ± років навколо року картки
let era_min    = 0.9  // епоха, якої в історії нема: ×0.9, повністю своя: ×1.1

// Жанри фільмів і серіалів у TMDB мають різні id для того самого - зводимо до серіальних,
// інакше смак із серіалів не діяв би на фільми.
let same = {28: 10759, 12: 10759, 878: 10765, 14: 10765, 10752: 10768}

function genres(card){
    let ids = card.genre_ids || (card.genres || []).map(g => g.id)
    let out = []

    ids.forEach(id => {
        let g = same[id] || id

        if (out.indexOf(g) == -1) {
            out.push(g)
        }
    })

    return out
}

function year(card){
    return parseInt((card.release_date || card.first_air_date || '').slice(0, 4)) || 0
}

function add(map, name, value){
    map[name] = (map[name] || 0) + value
}

// positive / negative - [{card, weight}]: переглянуте й кинуте, вага вже з урахуванням свіжості.
// home - мова інтерфейсу: фільм своєю мовою не штрафуємо, навіть якщо таких ще не дивились.
// null - профілю нема, множник скрізь 1.
export default function profile(positive, negative, home){
    let known = positive.filter(p => genres(p.card).length)

    if (known.length < min_cards) {
        return null
    }

    let pos       = {}
    let neg       = {}
    let neg_count = {}
    let everyone  = {}
    let lang      = {}
    let years     = []
    let total     = 0
    let lang_sum  = 0
    let all       = known.length + negative.length

    known.forEach(p => {
        total += p.weight

        genres(p.card).forEach(g => {
            add(pos, g, p.weight)
            add(everyone, g, 1)
        })
    })

    positive.forEach(p => {
        if (p.card.original_language) {
            add(lang, p.card.original_language, p.weight)

            lang_sum += p.weight
        }

        if (year(p.card)) {
            years.push({year: year(p.card), weight: p.weight})
        }
    })

    negative.forEach(n => {
        genres(n.card).forEach(g => {
            add(neg, g, n.weight)
            add(neg_count, g, 1)
            add(everyone, g, 1)
        })
    })

    let years_sum = years.reduce((sum, y) => sum + y.weight, 0)

    return function(item){
        let ids  = genres(item)
        let mult = 1

        if (ids.length) {
            let share   = ids.reduce((sum, g) => sum + (pos[g] || 0) / total, 0) / ids.length
            let penalty = 0

            // кинутий жанр - лише коли кинутих кілька і їх більше за переглянуті; загальні
            // жанри (драма, комедія) майже не рахуються: кинута драма нічого не каже про смак
            ids.forEach(g => {
                let n = neg[g] || 0
                let p = pos[g] || 0

                if ((neg_count[g] || 0) >= genre_min && n > p) {
                    penalty = Math.max(penalty, (n - p) / (n + p) * (1 - everyone[g] / all))
                }
            })

            mult *= (1 + genre_up * share) * (1 - genre_down * penalty)
        }

        if (lang_sum && item.original_language) {
            let share = (lang[item.original_language] || 0) / lang_sum

            mult *= share ? 1 + lang_up * share : item.original_language == home ? 1 : lang_none
        }

        let y = year(item)

        if (years_sum && y) {
            let near = years.reduce((sum, e) => sum + (Math.abs(e.year - y) <= era_span ? e.weight : 0), 0)

            mult *= era_min + 2 * (1 - era_min) * near / years_sum
        }

        return mult
    }
}
