import Utils from '../../../utils/utils'
import ContentRows from '../../../core/content_rows'
import Lang from '../../../core/lang'
import Favorite from '../../../core/favorite'
import Timeline from '../../../interaction/timeline'
import Timetable from '../../../core/timetable'
import classify from './continue_classify'

let pool_size = 100 // як у фоновому оновленні: далі серій у Timetable зазвичай нема
let max_cards = 20

// Серії, нумеровані так само, як їх відмічає повна картка. Сезон 1 TMDB вона ріже на сезони
// за паузами (tmdb.js:150) - відмітки пишуться за новою нумерацією, а Timetable тримає сиру.
// seen - коли востаннє щось відмічено, 0 - невідомо.
function judge(card, episodes, counts){
    if (!card.original_name) {
        // фільм: на головній і аніме-повнометражки в аніме
        let time = Timeline.watched(card, true)

        return {type: time.percent >= 90 ? 'hide' : 'keep', seen: time.updated}
    }

    if (!episodes) {
        return {type: Favorite.caughtUp(card) ? 'hide' : 'keep', seen: 0}
    }

    let seen = 0
    let view = (s, e) => {
        let time = Timeline.watchedEpisode(card, s, e, true)

        seen = Math.max(seen, time.updated || 0)

        return time
    }

    let season = episodes[0].season_number
    let prev   = season > 1 && counts && counts[season - 1] ? counts[season - 1] : null

    if (season == 1) {
        let parts = Utils.splitEpisodesIntoSeasons(episodes)
        let total = Object.keys(parts).length

        episodes = parts[total]
        prev     = total > 1 ? parts[total - 1].length : 0
    }

    let verdict = classify({
        episodes,
        prev,
        view,
        now: Date.now(),
        bookmarked: Favorite.checkAnyNotHistory(Favorite.check(card))
    })

    verdict.seen = seen

    return verdict
}

// За датою останньої події (#29): для нової серії - її вихід, для решти - останній перегляд.
// Історія вже йде від свіжого до старого, тож невідомий перегляд беремо від сусіда вище;
// на самому верху він невідомий - туди нова серія не стане, щойно переглянуте лишається першим.
function build(candidates, found){
    let counts = Timetable.seasons()
    let bound  = Infinity

    let list = candidates.map((card, i) => {
        let verdict = i < pool_size ? judge(card, found[card.id], counts[card.id]) : judge(card)

        if (verdict.seen) {
            bound = Math.min(bound, verdict.seen)
        }

        return {card, i, type: verdict.type, event: verdict.type == 'new' ? verdict.time : bound}
    }).filter(l => l.type != 'hide')

    // рівні - в порядку історії: на старих ТВ sort нестабільний
    list.sort((a, b) => b.event - a.event || a.i - b.i)

    return list.slice(0, max_cards).map(l => l.card)
}

/**
 * Регистрация стрічки "Продовжити перегляд" в ContentRows.
 */
function add(){
    ContentRows.add({
        name: 'continue_watch',
        title: Lang.translate('title_continue'),
        index: 0,
        screen: ['main', 'category', 'category_anime'],
        call: (params, screen)=>{
            let media  = screen == 'main' ? 'all' : screen == 'category_anime' ? 'anime' : params.url
            let series = media == 'tv' || media == 'anime' || media == 'all'

            if (!series) {
                let results = Favorite.continues(media)

                if (!results.length) {
                    return
                }

                // додивлене відсіяно, тож це вже не "Ви дивилися"
                return function(call){
                    call({results, title: Lang.translate('title_continue')})
                }
            }

            let candidates = Favorite.candidates(media)

            if (!candidates.length) {
                return
            }

            return function(call){
                let done = (results) => {
                    call({results, title: Lang.translate('title_continue')})
                }

                Timetable.getMany(candidates.slice(0, pool_size)).then(found => {
                    done(build(candidates, found))
                }).catch(() => {
                    done(Favorite.continues(media))
                })
            }
        }
    })
}

export default {
    add
}
