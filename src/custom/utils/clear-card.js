import Utils from '../../utils/utils'

let clearCard = Utils.clearCard
Utils.clearCard = function(card) {
    let cleared = clearCard.call(this, card)

    if (card && typeof card.mal_id !== 'undefined') cleared.mal_id = card.mal_id

    // Зберігаємо додаткові поля для персон (акторів)
    if (card && (card.profile_path || card.known_for_department || typeof card.gender !== 'undefined')) {
        if (typeof card.profile_path !== 'undefined') cleared.profile_path = card.profile_path
        if (typeof card.known_for_department !== 'undefined') cleared.known_for_department = card.known_for_department
        if (typeof card.known_for !== 'undefined') cleared.known_for = card.known_for
        if (typeof card.gender !== 'undefined') cleared.gender = card.gender
        if (typeof card.img !== 'undefined') cleared.img = card.img
    }

    return cleared
}
