import Background from '../../interaction/background'
import Utils from '../../utils/utils'
import Lang from '../../core/lang'
import Account from '../../core/account/account'
import Api from '../../core/api/api'
import Main from '../../interaction/items/main'
import TMDB from '../../core/api/sources/tmdb'
import LineModule from '../../interaction/items/line/module/module'
import CardModule from '../../interaction/card/module/module'
import Category from '../../interaction/items/category'
import CategoryModule from '../../interaction/items/category/module/module'
import Person from '../../interaction/person/person'
import PersonModule from '../../interaction/person/module/module'
import Router from '../../core/router'
import Favorites from '../../core/favorite'
import Component from '../../core/component'

function fixPerson(item){
    if(item.media_type === 'person' || item.known_for_department){
        item.title = item.name
        delete item.original_name
        item.params = item.params || {}
        item.params.emit = {
            onCreate: function(){
                var dept = this.data.known_for_department
                if(dept){
                    var el = document.createElement('div')
                    el.className = 'card__type'
                    el.textContent = dept
                    this.html.find('.card__view')?.append(el)
                }
            }
        }
    }
}

Component.add('trending_persons', function(object){
    let comp = Utils.createInstance(Category, object, {
        module: CategoryModule.toggle(CategoryModule.MASK.base, 'Pagination')
    })

    comp.use({
        onCreate: function(){
            Api.list(object, (data) => {
                if(data.results) data.results.forEach(fixPerson)
                this.build(data)
            }, this.empty.bind(this))
        },
        onNext: function(resolve, reject){
            Api.list(object, (data) => {
                if(data.results) data.results.forEach(fixPerson)
                resolve.call(this, data)
            }, reject.bind(this))
        },
        onInstance: function(item, data){
            item.use({
                onEnter: Router.call.bind(Router, 'actor', data),
                onFocus: function(){
                    Background.change(Utils.cardImgBackground(data))
                }
            })
        }
    })

    return comp
})

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

            let popularPage = 1
            let popularTotalPages = 1

            function pushPopular(person_data) {
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
                        results: cards,
                        params: {
                            module: LineModule.toggle(LineModule.MASK.base, 'More', 'MoreFirst', 'Event'),
                            text: Lang.translate('title_person_about'),
                            emit: {
                                onCreate: function(){
                                    var titleEl = this.html.find('.items-line__title')
                                    if(titleEl) titleEl.innerHTML = '<div class="full-person layer--visible full-person--small"><div class="full-person__photo"><img src="' + src + '" onerror="this.src=\'./img/actor.svg\';this.parentNode.parentNode.classList.add(\'full-person--loaded\')" onload="this.parentNode.parentNode.classList.add(\'full-person--loaded\')" /></div><div class="full-person__body"><div class="full-person__name">' + person_data.name.replace(/'/g, "\\'") + ' <span style="font-weight:400;opacity:.7">' + (person_data.known_for_department || '') + '</span></div></div></div>'
                                },
                                onMore: Router.call.bind(Router, 'actor', person_data)
                            }
                        }
                    })
                }
                parts.push(event)
            }

            function fetchPopular(resolve, reject) {
                popularPage++
                if (popularPage > popularTotalPages) { reject(); return }
                TMDB.get('person/popular', { page: popularPage }, (json) => {
                    if (!json.results || !json.results.length) { reject(); return }
                    let persons = json.results.filter(p => p.known_for_department && p.known_for).filter(p => (p.known_for_department || '').toLowerCase() == 'acting' && p.known_for.length)
                    persons.forEach(pushPopular)
                    loadPart(resolve, reject)
                }, reject, { life: 60 * 24 * 3 })
            }

            next = function (resolve, reject) {
                if (parts.some(p => typeof p == 'function')) loadPart(resolve, reject)
                else fetchPopular(resolve, reject)
            }

            let trending_loaded = false
            let popular_loaded = false

            let trending_json = null
            let popular_json = null

            let check = () => {
                if (trending_loaded && popular_loaded) {
                    if (trending_json && trending_json.results && trending_json.results.length) {
                        let persons = trending_json.results

                        persons.forEach(person => {
                            person.job = person.known_for_department || Lang.translate('title_actor')
                            person.params = {
                                module: PersonModule.toggle(PersonModule.MASK.base, 'Line', 'Callback'),
                                createInstance: (item) => new Person(item),
                                emit: {
                                    onEnter: Router.call.bind(Router, 'actor', person)
                                }
                            }
                        })

                        parts.push((call) => {
                            call({
                                title: Lang.translate('title_trend_week'),
                                results: persons,
                                total_pages: trending_json.total_pages || 1,
                                params: {
                                    module: LineModule.only('Items', 'Create', 'More'),
                                    emit: {
                                        onlyMore: function () {
                                            Router.call('trending_persons', {
                                                url: 'trending/person/week',
                                                title: Lang.translate('title_trend_week')
                                            })
                                        }
                                    }
                                }
                            })
                        })
                    }

                    if (popular_json && popular_json.results && popular_json.results.length) {
                        let persons = popular_json.results.filter(p => p.known_for_department && p.known_for).filter(p => (p.known_for_department || '').toLowerCase() == 'acting' && p.known_for.length)
                        persons.forEach(pushPopular)
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
                if (json) popularTotalPages = json.total_pages || 1
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
