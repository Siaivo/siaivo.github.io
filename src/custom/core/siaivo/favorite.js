import Favorite from '../../../core/favorite'
import Link from './link'

// Єдина ідентичність Siaivo <-> TMDB в обраному. Система favorite матчить картки лише
// за card.id, тож картку каталогу (id=mal_id, source:'siaivo') і TMDB-картку вона вважає
// різними. Обгортаємо Favorite.toggle/add: siaivo-картку перед збереженням перетворюємо
// на TMDB-картку (id=tmdb_id, source:'tmdb'), щоб значок/відкриття були нативними.
// Немає мапінгу (ani.zip themoviedb_id === null) -> зберігаємо як є.
function isSiaivo(card) {
    return card && (card.source === 'siaivo' || (card.mal_id && card.source !== 'tmdb'))
}

function toTmdbCard(card, link) {
    var title = card.title || card.name || ''
    var orig  = card.original_title || card.original_name || ''

    var c = {
        id: link.id,
        source: 'tmdb',
        mal_id: card.mal_id || card.id,
        img: card.img,
        poster: card.poster,
        background_image: card.background_image,
        vote_average: card.vote_average,
        overview: card.overview
    }

    // router.add('full'): method = original_name ? 'tv' : 'movie'. Тож у movie НЕ має бути
    // original_name (лише title/original_title); у tv — має бути original_name.
    if (link.method === 'movie') {
        c.title = title
        c.original_title = orig
        c.release_date = card.release_date || card.first_air_date || ''
    }
    else {
        c.name = title
        c.original_name = orig
        c.first_air_date = card.first_air_date || card.release_date || ''
    }

    return c
}

function wrap(original) {
    return function(where, card, limit) {
        var self = this

        if (!isSiaivo(card)) return original.call(self, where, card, limit)

        Link.resolve(card.mal_id || card.id, function(link) {
            var target = (link && link.id) ? toTmdbCard(card, link) : card
            original.call(self, where, target, limit)
        })
    }
}

Favorite.toggle = wrap(Favorite.toggle)
Favorite.add    = wrap(Favorite.add)
