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
                    let thrown = Favorite.get({type:'thrown'});
                    let viewed = Favorite.get({type:'viewed'});

                    let history = Favorite.get({type:'history'});

                    if (thrown.length) {
                        history = history.filter(h => !thrown.find(t => t.imdb_id == h.imdb_id))
                    }
                    
                    if (viewed.length) {
                        history = history.filter(h => !viewed.find(v => v.imdb_id == h.imdb_id))
                    }

                    let ongoing = history
                        .filter(h => h.next_episode_to_air && h.next_episode_to_air.episode_number > 1)
                        .map(h => {
                            let card = Arrays.clone(h)
                            let next = h.next_episode_to_air

                            card.viewed = Timeline.watchedEpisode(h, next.season_number, next.episode_number - 1)

                            return card
                        })

                    let caught_up = ongoing.filter(c => c.viewed >= 90)

                    if(caught_up.length){
                        results = results.filter(r => !caught_up.find(c => c.id == r.id))
                    }

                    let new_episode = ongoing.filter(c => c.viewed < 10)

                    new_episode = new_episode.filter((e)=>{
                        let jpan  = Utils.containsJapanese(e.original_name || e.name || '') || e.original_language == 'ja'

                        return media == 'anime' ? jpan : !jpan
                    })

                    if(new_episode.length){
                        results = results.filter(r=>!new_episode.find(h=>h.id == r.id))
                        results = [].concat(new_episode, results)
                    }

                    results = results.slice(0,19)
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
