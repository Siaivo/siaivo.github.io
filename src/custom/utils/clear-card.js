import Utils from '../../utils/utils'

let clearCard = Utils.clearCard
Utils.clearCard = function(card) {
    let cleared = clearCard.call(this, card)

    if (card && typeof card.mal_id !== 'undefined') cleared.mal_id = card.mal_id

    return cleared
}
