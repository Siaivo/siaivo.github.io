import FavoriteModule from '../../../interaction/card/module/favorite'
import Link from './link'

// Лінивий апгрейд картки каталогу Siaivo до нативної TMDB-ідентичності.
// Коли siaivo-картка вперше потрапляє у в'юпорт (onVisible спрацьовує раз через layer.js),
// резолвимо mal_id -> tmdb_id (ani.zip) і переписуємо ідентичність ПРЯМО в card.data (той
// самий об'єкт, що бачать Router.call('full', data) і Favorite.check). Після цього
// відкриття/обране/continue-watch працюють нативно, без ani.zip у момент кліку.
//
// emit('visible') викликає onVisible на ВСІХ модулях картки, тож додавання onVisible до
// спільного об'єкта FavoriteModule виконується поряд зі штатним завантажувачем постера
// (у Card-модуля свій onVisible) і нічого не перетирає.
FavoriteModule.onVisible = function() {
    let card = this.data

    if (!card || card._siaivo_upgraded || card._siaivo_resolving || card.source !== 'siaivo') return

    let malId = card.mal_id || card.id
    if (malId == null) return

    let self = this
    card._siaivo_resolving = true

    Link.resolve(malId, function(link) {
        card._siaivo_resolving = false

        if (!link) return                  // помилка мережі -> без прапорця, повторимо при наст. появі
        card._siaivo_upgraded = true       // {id:null} (немає мапінгу) теж -> більше не пробуємо

        if (!link.id) return               // мапінгу на TMDB немає -> картка лишається siaivo

        let title = card.title || card.name || ''
        let orig  = card.original_title || card.original_name || ''

        card.id = link.id                  // Number
        card.source = 'tmdb'
        card.method = link.method

        // router.add('full'): method = original_name ? 'tv' : 'movie'.
        if (link.method === 'movie') {
            card.title = title
            card.original_title = orig
            delete card.name
            delete card.original_name
            card.release_date = card.release_date || card.first_air_date || ''
        }
        else {
            card.name = title
            card.original_name = orig
            card.first_air_date = card.first_air_date || card.release_date || ''
        }

        self.emit('favorite')              // перемалювати значок під нативну ідентичність
    })
}
