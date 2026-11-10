// Сигнали стрічки «Рекомендуємо подивитись»: наскільки зайшло джерело (вага в recommend.js) і
// скільки днів картку вже показували без толку (множник у ранжуванні).
// Без імпортів Лампи, щоб перевірялось у spec/.

let strong_x     = 1.5 // вподобане, переглянуте або додивлене
let dropped_x    = 0.4 // почав і кинув
let dropped_pct  = 30  // фільм: менше - кинув
let dropped_days = 7   // днів без перегляду: інакше це «дивиться зараз», а не «кинув»
let binge        = [{episodes: 8, x: 1.4}, {episodes: 3, x: 1.2}] // серіал: серій з прогресом
let shown_x      = 0.9 // за кожен минулий день показу без переходу в картку
let shown_min    = 0.5
let opened_x     = 0.85 // відкрив картку, але дивитись не став
let shown_keep   = 30   // днів: довше не показували - забуваємо

export let day_ms = 1000 * 60 * 60 * 24

// Ключ картки: спільний для пулу, збору й ранжування - інакше зібране й ранжоване розійдуться мовчки.
export function kind(card){
    return card.media_type || (card.name ? 'tv' : 'movie')
}

export function key(card){
    return kind(card) + '_' + card.id
}

export function delay(ms){
    return new Promise(resolve => setTimeout(resolve, ms))
}

export function today(now){
    return Math.floor(now / day_ms)
}

// Прогрес за карткою з тайм-кодів, які несуть прив'язку Timeline.link ('tv_123', 'movie_5'):
// {card: {episodes, percent, updated}}. Записи без прив'язки (старі) тут не видно.
export function progress(viewed){
    let result = {}

    for (let hash in viewed) {
        let road = viewed[hash]

        if (!road || typeof road.card !== 'string' || !(road.percent > 0)) {
            continue
        }

        let row = result[road.card] || (result[road.card] = {episodes: 0, percent: 0, updated: 0})

        if (typeof road.episode !== 'undefined') {
            row.episodes++
        }

        row.percent = Math.max(row.percent, road.percent)
        row.updated = Math.max(row.updated, road.updated || 0)
    }

    return result
}

// Множник ваги джерела. info: {strong, tv, episodes, percent, updated}; невідоме - 0.
export function engagement(info, now){
    if (info.strong) {
        return strong_x
    }

    let idle = info.updated ? (now - info.updated) / day_ms : 0

    if (info.tv) {
        for (let i = 0; i < binge.length; i++) {
            if (info.episodes >= binge[i].episodes) {
                return binge[i].x
            }
        }

        return info.episodes == 1 && idle > dropped_days ? dropped_x : 1
    }

    return info.percent && info.percent < dropped_pct && idle > dropped_days ? dropped_x : 1
}

// Множник картки за минулі покази: {n - днів показу, last - останній день, opened - день переходу}.
// Сьогоднішній показ і перехід не рахуємо - порядок стрічки протягом доби не стрибає.
export function exposure(entry, day){
    if (!entry || day - entry.last > shown_keep) {
        return 1
    }

    let before = entry.last >= day ? entry.n - 1 : entry.n
    let x      = Math.max(shown_min, Math.pow(shown_x, before))

    return entry.opened && entry.opened < day ? x * opened_x : x
}

// Запам'ятати покази keys сьогодні. Повертає true, якщо щось змінилось (варто зберегти).
export function remember(shown, keys, day){
    let changed = false

    keys.forEach(key => {
        let entry = shown[key]

        if (!entry || day - entry.last > shown_keep) {
            shown[key] = {n: 1, last: day}
            changed    = true
        }
        else if (entry.last != day) {
            entry.n++
            entry.last = day
            changed    = true
        }
    })

    for (let key in shown) {
        if (day - shown[key].last > shown_keep) {
            delete shown[key]

            changed = true
        }
    }

    return changed
}

// Перейшов у картку зі стрічки. true - змінилось.
export function opened(shown, key, day){
    let entry = shown[key]

    if (!entry || entry.opened) {
        return false
    }

    entry.opened = day

    return true
}
