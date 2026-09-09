import FolderModule from '../../../../interaction/card/module/folder'
import TMDB from '../../../../core/api/sources/tmdb'

// Фікс: тека брала прев'ю лише з poster_path, тож картки без tmdb-постера (аніме з Hikka —
// у них лише poster/img з готовим URL) не давали жодної обкладинки і тека показувала заглушку.
// Тепер тягнемо той самий ланцюжок, що й звичайна картка (card/module/card.js: getPosterPath).
function posterOf(item) {
    if (item.poster_path)  return TMDB.img(item.poster_path)
    if (item.profile_path) return TMDB.img(item.profile_path)
    return item.poster || item.img || ''
}

FolderModule.onVisible = function() {
    let filtred = this.data.results.map(posterOf).filter(Boolean).slice(0, 3)

    filtred.forEach((src, i) => {
        this.emit('image', src, i)
    })

    if (filtred.length == 0) this.emit('image', './img/img_load.svg')
}
