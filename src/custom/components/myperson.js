import Background from '../../interaction/background'
import Utils from '../../utils/utils'
import Lang from '../../core/lang'
import Account from '../../core/account/account'
import Api from '../../core/api/api'
import Main from '../../interaction/items/main'
import TMDB from '../../core/api/sources/tmdb'
import LineModule from '../../interaction/items/line/module/module'
import CardModule from '../../interaction/card/module/module'
import Router from '../../core/router'
import Favorites from '../../core/favorite'
import Component from '../../core/component'

function CustomMyPerson(object) {
    let comp = new Main(object)
    let next = null

    comp.use({
        onCreate: function () {
            let parts = [
                (call) => {
                    let persons = Favorites.all().persons || []
                    if (!persons.length) return call()

                    persons.forEach(person => {
                        person.params = {
                            module: CardModule.only('Card', 'Release', 'Menu', 'Callback'),
                            emit: {
                                onFocus: () => {
                                    Background.change(Utils.cardImgBackground(person))
                                },
                                onEnter: Router.call.bind(Router, 'actor', person)
                            }
                        }
                    })

                    call({
                        title: Lang.translate('settings_input_links'),
                        results: persons,
                        params: {
                            module: LineModule.toggle(LineModule.MASK.base, 'More', 'Event'),
                        }
                    })
                }
            ]

            function loadPart(partLoaded, partEmpty) {
                Api.partNext(parts, 3, partLoaded, partEmpty)
            }

            next = loadPart

            let trending_loaded = false
            let popular_loaded = false

            let trending_json = null
            let popular_json = null

            let check = () => {
                if (trending_loaded && popular_loaded) {
                    if (trending_json && trending_json.results && trending_json.results.length) {
                        let persons = trending_json.results

                        persons.forEach(person => {
                            person.params = {
                                module: CardModule.only('Card', 'Release', 'Menu', 'Callback'),
                                emit: {
                                    onFocus: () => {
                                        Background.change(Utils.cardImgBackground(person))
                                    },
                                    onEnter: Router.call.bind(Router, 'actor', person)
                                }
                            }
                        })

                        parts.push((call) => {
                            call({
                                title: Lang.translate('title_trend_week'),
                                results: persons,
                                params: {
                                    module: LineModule.toggle(LineModule.MASK.base, 'More', 'Event'),
                                }
                            })
                        })
                    }

                    if (popular_json && popular_json.results && popular_json.results.length) {
                        let filtred = popular_json.results.filter(p => p.known_for_department && p.known_for)
                        let persons = filtred.filter(p => (p.known_for_department || '').toLowerCase() == 'acting' && p.known_for.length).slice(0, 20)

                        persons.forEach((person_data) => {
                            let event = (call_inner) => {
                                let cards = person_data.known_for || []
                                let src = person_data.profile_path ? TMDB.img(person_data.profile_path, 'w90_and_h90_face') : person_data.img || './img/actor.svg'

                                cards.forEach(item => {
                                    item.params = {
                                        emit: {
                                            onEnter: Router.call.bind(Router, 'full', item),
                                            onFocus: function () {
                                                Background.change(Utils.cardImgBackground(item))
                                            }
                                        }
                                    }
                                })

                                call_inner({
                                    title: person_data.name,
                                    icon_img: src,
                                    results: cards,
                                    params: {
                                        module: LineModule.toggle(LineModule.MASK.base, 'Icon', 'More', 'MoreFirst', 'Event'),
                                        text: Lang.translate('title_person_about'),
                                        emit: {
                                            onMore: Router.call.bind(Router, 'actor', person_data)
                                        }
                                    }
                                })
                            }

                            parts.push(event)
                        })
                    }

                    loadPart(this.build.bind(this), this.empty.bind(this))
                }
            }

            TMDB.get('trending/person/week', {}, (json) => {
                trending_json = json
                trending_loaded = true
                check()
            }, () => {
                trending_loaded = true
                check()
            }, { life: 60 * 24 * 3 })

            TMDB.get('person/popular', {}, (json) => {
                popular_json = json
                popular_loaded = true
                check()
            }, () => {
                popular_loaded = true
                check()
            }, { life: 60 * 24 * 3 })
        },
        onNext: function (resolve, reject) {
            if (next) next(resolve, reject)
            else reject()
        }
    })

    return comp
}

Component.add('myperson', CustomMyPerson)
