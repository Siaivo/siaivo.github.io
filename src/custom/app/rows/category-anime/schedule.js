import Arrays from '../../../../utils/arrays'
import Utils from '../../../../utils/utils'
import Lang from '../../../../core/lang'
import Episode from '../../../../interaction/episode/episode'
import EpisodeModule from '../../../../interaction/episode/module/module'
import Background from '../../../../interaction/background'
import Router from '../../../../core/router'

// Спільне тіло рядів розкладу. Джерело віддає {card, episode, ...} - картка для перевірки
// лежить у .card. Рендер епізодів такий самий, як у core (timetable.js:87-100).
export default function schedule(source, title){
    let results = source().filter(e => e.card && Utils.isAnime(e.card)).slice(0,20)

    if(!results.length) return

    return function(call){
        results.forEach(item => {
            item.params = {
                createInstance: (item)=> new Episode(item),
                module: EpisodeModule.only('Card', 'Callback'),
                emit: {
                    onlyEnter: Router.call.bind(Router, 'full', item.card),
                    onlyFocus: ()=>{
                        Background.change(Utils.cardImgBackgroundBlur(item.card))
                    }
                }
            }

            Arrays.extend(item, item.episode)
        })

        call({results, title: Lang.translate(title)})
    }
}
