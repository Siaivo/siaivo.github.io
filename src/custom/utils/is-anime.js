import Utils from '../../utils/utils'
import AnimeMap from './anime-map'

// Карта mal - джерело правди, поки вона в пам'яті: знає tmdb-id - аніме, не знає - ні.
// map.json їде після 'app ready', і до того malsOf() на порожній карті віддає [] для всього,
// тому поки карти нема падаємо на стару евристику - інакше все аніме разом опинилось би
// в списку серіалів. mal_id стоїть у картках з Hikka, це готова відповідь без карти.
Utils.isAnime = function(card){
    if(card.mal_id) return true

    let method = card.number_of_seasons || card.first_air_date || card.name ? 'tv' : 'movie'

    if(AnimeMap.malsOf(card.id, method).length) return true

    if(AnimeMap.ready()) return false

    return Utils.containsJapanese(card.original_name || card.name || '') || card.original_language == 'ja'
}
