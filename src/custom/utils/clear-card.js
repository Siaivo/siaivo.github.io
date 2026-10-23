import Utils from '../../utils/utils'

let clearCard = Utils.clearCard
Utils.clearCard = function(card) {
    let cleared = clearCard.call(this, card)

    // Зберігаємо додаткові поля для персон (акторів)
    if (card && (card.profile_path || card.known_for_department || typeof card.gender !== 'undefined')) {
        if (typeof card.profile_path !== 'undefined') cleared.profile_path = card.profile_path
        if (typeof card.known_for_department !== 'undefined') cleared.known_for_department = card.known_for_department
        if (typeof card.known_for !== 'undefined') cleared.known_for = card.known_for
        if (typeof card.gender !== 'undefined') cleared.gender = card.gender
        if (typeof card.img !== 'undefined') cleared.img = card.img
    }

    // Повна картка TMDB несе жанри як genres: [{id, name}], а не genre_ids - без цього в історії
    // жанри лишались лише в тих картках, що прийшли зі списочного ряду (профіль смаку рекомендацій).
    if (card && !(cleared.genre_ids && cleared.genre_ids.length) && Array.isArray(card.genres)) {
        cleared.genre_ids = card.genres.filter(g => g && g.id).map(g => g.id)
    }

    return cleared
}
