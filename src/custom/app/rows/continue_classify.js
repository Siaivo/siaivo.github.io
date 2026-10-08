// Місце серіалу в стрічці "Продовжити перегляд" за серіями останнього сезону і відмітками
// перегляду. Без імпортів Лампи, щоб перевірялось у spec/ на зібраних руками даних.
//
// Діємо лише за доказами: відміток нема (дивились на іншому пристрої без синку таймкодів,
// плеєр не повернув позицію) - серіал лишається на своєму місці в історії.

let day     = 1000 * 60 * 60 * 24
let delay   = day      // серія "виходить" наступного дня: часові пояси, та й озвучка пізніше
let window  = day * 21 // скільки тримати нагорі невідкриту серію, далі вона вже не цікава
let watched = 90

function airTime(episode){
    let parts = (episode.air_date || '').split('-')

    if (parts.length != 3) {
        return 0
    }

    return new Date(parts[0], parts[1] - 1, parts[2]).getTime() + delay
}

/**
 * @param {object} params
 * @param {array} params.episodes - серії сезону в нумерації, якою пишуться відмітки
 * @param {number|null} params.prev - серій у попередньому сезоні: 0 - його нема, null - невідомо
 * @param {function} params.view - (season, episode) => {percent, updated}
 * @param {number} params.now
 * @param {boolean} params.bookmarked - серіал у закладках, а не лише в історії
 * @returns {{type: string, time?: number}} hide - все, що вийшло, переглянуто, new - нагору, keep - на місці
 */
export default function classify({episodes, prev, view, now, bookmarked}){
    let keep    = {type: 'keep'}
    let season  = episodes[0].season_number
    let finale  = prev ? view(season - 1, prev).percent >= watched : false
    let aired   = episodes.filter(e => {
        let time = airTime(e)

        return time && time <= now
    }).sort((a, b) => a.episode_number - b.episode_number)

    // сезон анонсовано, серій ще нема: якщо попередній додивився - чекаємо прем'єру
    if (!aired.length) {
        return finale ? {type: 'hide'} : keep
    }

    let marks = aired.map(e => view(e.season_number, e.episode_number))
    let last  = -1

    marks.forEach((mark, i) => {
        if (mark.percent >= watched) {
            last = i
        }
    })

    if (last == aired.length - 1) {
        return {type: 'hide'}
    }

    let time = airTime(aired[last + 1])

    // вікно від першої непереглянутої: закинутий щотижневий серіал не висітиме весь сезон
    if (now - time > window) {
        return keep
    }

    // наступну вже почав - це звичайне "продовжити", місце в історії правильне
    if (marks[last + 1].percent) {
        return keep
    }

    if (last >= 0) {
        let updated = marks[last].updated

        // попередню додивився вже після виходу наступної - він просто відстає
        return updated && updated > time ? keep : {type: 'new', time}
    }

    // у сезоні нічого не дивився: новий сезон, якщо фінал попереднього переглянуто
    if (marks.some(mark => mark.percent)) {
        return keep
    }

    if (prev === null) {
        // попередній сезон невідомий: прем'єру піднімаємо лише для закладок, бо це явний інтерес
        return bookmarked && season > 1 ? {type: 'new', time} : keep
    }

    return finale ? {type: 'new', time} : keep
}
