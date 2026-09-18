import CardModule from '../../../../interaction/episode/module/card'

// Фікс: прев'ю епізода бралось лише зі still_path / backdrop_path / data.img
// (episode/module/card.js:54-57), тож картки без tmdb-зображень - аніме з Hikka, у них лише
// poster/img з готовим URL (siavo-anime.js:117-120) - завжди показували заглушку. Постер
// картки поруч має повний ланцюжок запасних полів (:48-52), епізод - ні.
//
// Не переписуємо ланцюжок, а доливаємо після оригіналу: якщо він таки дійшов до заглушки,
// пробуємо ті самі поля, що й постер. Так апстрим лишається хазяїном порядку джерел.
let original_visible = CardModule.onVisible

CardModule.onVisible = function(){
    original_visible.call(this)

    if((this.img_episode.src || '').indexOf('img_broken') == -1) return

    let src = this.card.background_image || this.card.poster || this.card.img

    if(src) this.img_episode.src = src
}
