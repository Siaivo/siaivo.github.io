import Arrays from '../../../utils/arrays'
import Utils from '../../../utils/utils'
import ContentRows from '../../../core/content_rows'
import Lang from '../../../core/lang'
import Favorite from '../../../core/favorite'
import Notices from '../../../interaction/notice/notice'
import Timeline from '../../../interaction/timeline'
import CardModule from '../../../interaction/card/module/module'

/**
 * Регистрация стрічки "Продовжити перегляд" в ContentRows.
 */
function add(){
    ContentRows.add({
        name: 'continue_watch',
        title: Lang.translate('title_continue'),
        index: 1,
        screen: ['main', 'category'],
        call: (params, screen)=>{
            let media;
            let results = [];

            if (screen == 'main') {
                media = 'all';
                results = Favorite.continues('tv')
                results = results.concat(Favorite.continues('anime'))
            }
            else {
                media = params.url == 'anime_tv' || params.url == 'anime_movie'
                    ? 'anime'
                    : params.url;

                results = Favorite.continues(media)
            }

            if(!results.length) return

            return function(call){
                if(media == 'tv' || media == 'anime' || media == 'all'){
                    let cub_notices = Notices.get('all').items()

                    let history = Favorite.get({type:'history'}).filter(h=>cub_notices.find(n=>n.item.card_id == h.id))

                    let new_episode = history.map(h=>{
                        let noty = cub_notices.find(n=>n.item.card_id == h.id)
                        let card = Arrays.clone(h)

                        card.params = {
                            module: CardModule.toggle(CardModule.MASK.base, 'Subscribe')
                        }

                        card.subscribe = {
                            status: 1,
                            season: noty.item.season,
                            episode: noty.item.episode,
                            voice: noty.data.voice
                        }

                        card.viewed = Timeline.watchedEpisode(h, noty.item.season, noty.item.episode)

                        return card
                    })

                    new_episode = new_episode.filter(n=>n.viewed < 10)

                    new_episode = new_episode.filter((e)=>{
                        let jpan  = Utils.containsJapanese(e.original_name || e.name || '') || e.original_language == 'ja'

                        return media == 'anime' ? jpan : !jpan
                    })

                    if(new_episode.length){
                        results = results.filter(r=>!new_episode.find(h=>h.id == r.id))
                        results = [].concat(new_episode, results)

                        results = results.slice(0,19)
                    }
                }

                call({
                    results,
                    title: media == 'tv' || media == 'anime' ? Lang.translate('title_continue') : Lang.translate('title_watched')
                })
            }
        }
    })
}

export default {
    add
}
