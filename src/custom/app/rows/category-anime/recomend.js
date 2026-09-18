import Recomend from '../../../../core/recomend'
import Arrays from '../../../../utils/arrays'
import Utils from '../../../../utils/utils'
import Lang from '../../../../core/lang'

// Recomend.get знає лише 'tv' і «все інше» (recomend.js:117), тож аніме-повнометражки сюди
// не потраплять - вони в другому кошику разом з усіма фільмами.
export default {
    name: 'recomend_watch',

    build(){
        let results = Arrays.shuffle(Recomend.get('tv').filter(Utils.isAnime)).slice(0,20)

        if(!results.length) return

        // без пагінації: сторінка 'recomend' фільтра аніме не має
        return (call) => call({results, title: Lang.translate('title_recomend_watch')})
    }
}
