import Controller from '../../../core/controller'
import Reguest from '../../../utils/reguest'
import Scroll from '../../../interaction/scroll'
import Background from '../../../interaction/background'
import Activity from '../../../interaction/activity/activity'
import Empty from '../../../interaction/empty/empty'
import Lang from '../../../core/lang'
import Template from '../../../interaction/template'
import Api from '../../../core/api/api'
import Storage from '../../../core/storage/storage'
import cors from '../../utils/cors'

import { KINOSTRAIN_API } from './feed-sources'
import { detectType, mapItem } from './feed-mapper'

import './feed-templates'

function CustomFeed(object) {
    if (typeof object.page === 'undefined') object.page = 0

    let network = new Reguest()
    let scroll = new Scroll({mask: true, over: true, step: 250, end_ratio: 2})
    let html = document.createElement('div')
    let feed = []
    let domItems = []
    let last
    let observer = null
    let currentPage = 1
    let totalPages = 1
    let loadingPage = false
    let totalPagesKnown = false

    function buildBaseUrl() {
        const rating = Storage.get('feed_rating', '8')
        const year = Storage.get('feed_year', '')
        let url = KINOSTRAIN_API + '?ratingMin=' + rating
        if (year && /^\d{4}$/.test(year)) {
            url += '&year=' + year
        }
        return { url, year }
    }

    function filterByYear(items, yearStr) {
        if (!yearStr || yearStr.indexOf('-') === -1) return items
        const parts = yearStr.split('-').map(s => parseInt(s.trim()))
        const minYear = parts[0]
        const maxYear = parts.length > 1 ? parts[1] : minYear
        return items.filter(item => item.yearStart >= minYear && item.yearStart <= maxYear)
    }

    this.create = function () {
        this.activity.loader(true)
        const self = this
        const { url, year } = buildBaseUrl()

        network.silent(cors.proxied(url + '&page=1'), (response) => {
            const data = cors.unwrap(response)
            let items = (data && data.data) ? data.data : []
            const meta = (data && data.meta) ? data.meta : {}

            totalPages = meta.totalPages || 1
            totalPagesKnown = true

            items = filterByYear(items, year)

            feed = items
            currentPage = 1

            self.buildFeed()

            if (feed.length > 0) {
                self.setupLazyLoad()
            }
        }, () => {
            let empty = new Empty()
            html.append(empty.render(true))
            self.start = empty.start.bind(empty)
            self.activity.loader(false)
            self.activity.toggle()
        })

        return this.render()
    }

    this.fetchNextPage = function () {
        if (loadingPage) return
        if (totalPagesKnown && currentPage >= totalPages) return

        loadingPage = true
        const self = this
        const { url, year } = buildBaseUrl()
        const nextPage = currentPage + 1

        network.silent(cors.proxied(url + '&page=' + nextPage), (response) => {
            const data = cors.unwrap(response)
            let items = (data && data.data) ? data.data : []
            const meta = (data && data.meta) ? data.meta : {}

            totalPages = meta.totalPages || totalPages

            items = filterByYear(items, year)

            feed = feed.concat(items)
            currentPage = nextPage
            loadingPage = false

            self.append(items, true)
            self.setupLazyLoad()
        }, () => {
            loadingPage = false
        })
    }

    this.buildFeed = function () {
        html.addClass('feed')

        let head = Template.js('feed_head')
        head.find('.feed-head__title').text('Кіно Сяйво')
        head.find('.feed-head__info').html('Контент з рейтингом 8+')

        head.on('hover:focus', scroll.update.bind(scroll, head))

        scroll.minus()
        scroll.onWheel = (step) => Navigator.move(step > 0 ? 'down' : 'up')
        scroll.onEnd = this.next.bind(this)

        scroll.append(head)

        this.append(feed.slice(0, 20), false)

        html.append(scroll.render(true))

        this.activity.loader(false)
        this.activity.toggle()
    }

    this.append = function (data, append) {
        const self = this

        data.forEach((element, i) => {
            const feedIndex = append ? (feed.length - data.length + i) : i

            let isTv = detectType(element) === 'tv'
            let itemType = isTv ? 'serial' : 'movie'

            let elementData = {
                title: element.title || element.name || '',
                name: element.title || element.name || '',
                original_name: element.originalName || '',
                poster_path: element.poster_path || null,
                backdrop_path: element.backdrop_path || null,
                overview: element.overview || '',
                release_date: element.release_date || (element.yearStart ? element.yearStart + '-01-01' : ''),
                first_air_date: element.first_air_date || '',
                countries: element.origin_country || [],
                genres: (element.tmdb_genres && element.tmdb_genres.length)
                    ? element.tmdb_genres
                    : (element.genres || []).map(g => typeof g === 'string' ? g : (g.name || '')),
                genre_ids: [],
                vote_average: element.vote_average || 0,
                source: element.tmdbId ? 'tmdb' : 'kinostrain',
                feed_posterUrl: element.posterUrl,
                feed_imdbMark: element.imdbMark,
                feed_slug: element.slug
            }

            let hash = isTv && element.season
                ? 's' + String(element.season).padStart(2, '0') + ';e' + String(element.episode || 0).padStart(2, '0')
                : ''

            let item = Template.js(
                (itemType === 'serial' || hash) ? 'feed_episode' : 'feed_item'
            )

            item.addClass('feed-item--' + (isTv ? 'episode' : 'movie'))
            item.setAttribute('data-feed-index', feedIndex)

            let typeLabels = {
                serial: 'Серіали',
                movie: 'Фільми'
            }

            let sity = elementData.countries || []
            let year = ((elementData.release_date || elementData.first_air_date) + '').slice(0, 4)
            let info = []
            let tags = []

            info.push(year + (sity.length ? ' - ' + sity.slice(0, 2).join(', ') : ''))

            if (elementData.vote_average && parseFloat(elementData.vote_average) > 0) {
                info.push('TMDB ' + elementData.vote_average)
            }

            if (elementData.feed_imdbMark) {
                info.push('IMDb ' + elementData.feed_imdbMark)
            }

            if (hash) {
                tags = hash.split(';').map(a => {
                    return Lang.translate(a.slice(0, 1) === 's'
                        ? 'torrent_serial_season'
                        : 'torrent_serial_episode'
                    ) + ' - ' + a.slice(1)
                })
            } else if (elementData.genres) {
                tags.push(elementData.genres.join(', '))
            }

            item.find('.feed-item__label')
                .addClass('feed-item__label--' + (isTv ? 'episode' : 'movie'))
                .text(typeLabels[itemType] || '')

            item.find('.feed-item__title').text(elementData.title || elementData.name)
            item.find('.feed-item__info').text(info.join(' / '))
            item.find('.feed-item__descr').text(elementData.overview || '')
            item.find('.feed-item__tags').text(tags.join(' / '))

            const imgSrc = elementData.feed_posterUrl
                || (elementData.poster_path
                    ? Api.img(elementData.poster_path, 'w500')
                    : './img/img_broken.svg')

            self.loadImg(item.find('.feed-item__poster-box'), imgSrc)

            scroll.append(item)

            let btn_watch = document.createElement('div')
            btn_watch.addClass('simple-button selector')
            btn_watch.text(Lang.translate('title_watch'))

            btn_watch.on('hover:focus', () => {
                last = btn_watch
                scroll.update(item)
                if (elementData.poster_path || elementData.feed_posterUrl) {
                    Background.change(
                        elementData.feed_posterUrl
                            || Api.img(elementData.poster_path, 'w500')
                    )
                }
            })

            btn_watch.on('hover:enter', () => {
                const feedItem = feed[feedIndex]
                const cardId = feedItem ? (feedItem.tmdbId || 0) : 0
                if (cardId > 0) {
                    Activity.push({
                        url: '',
                        component: 'full',
                        id: cardId,
                        method: isTv ? 'tv' : 'movie',
                        card: elementData,
                        source: 'tmdb'
                    })
                } else {
                    if (elementData.feed_slug) {
                        window.open('https://kinostrain.com/' + elementData.feed_slug, '_blank')
                    }
                }
            })

            item.find('.feed-item__buttons').append(btn_watch)

            if (append) Controller.collectionAppend(btn_watch)

            domItems.push({ el: item[0], feedIndex: feedIndex })
        })
    }

    this.setupLazyLoad = function () {
        const self = this

        if (!observer) {
            observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const idx = parseInt(entry.target.getAttribute('data-feed-index'))
                        if (!isNaN(idx) && feed[idx] && !feed[idx]._tmdbLoaded) {
                            self.loadItemDetails(idx, entry.target)
                        }
                        observer.unobserve(entry.target)
                    }
                })
            }, { rootMargin: '400px' })
        }

        html.querySelectorAll('.feed-item[data-feed-index]').forEach(el => {
            const idx = parseInt(el.getAttribute('data-feed-index'))
            if (!isNaN(idx) && feed[idx] && !feed[idx]._tmdbLoaded) {
                observer.observe(el)
            }
        })
    }

    this.loadItemDetails = function (index, el) {
        const self = this
        const item = feed[index]
        if (!item || item._tmdbLoaded) return

        item._tmdbLoaded = true

        const rawItem = {
            originalName: item.originalName,
            name: item.title,
            format: item.format,
            yearStart: item.yearStart,
            lastReadySeason: item.season != null
                ? { number: item.season, lastReadyEpisode: item.episode || 0, readyEpisodesCount: item.totalEpisodes || 0 }
                : null
        }

        mapItem(rawItem).then(result => {
            if (!result) return

            item.tmdbId = result.tmdbId
            item.poster_path = result.poster_path
            item.backdrop_path = result.backdrop_path
            item.overview = result.overview
            item.release_date = result.release_date
            item.first_air_date = result.first_air_date
            item.vote_average = result.vote_average
            item.origin_country = result.origin_country
            item.tmdb_genres = result.tmdb_genres

            self.updateItemDOM(el, item)
        }).catch(() => {})
    }

    this.updateItemDOM = function (el, item) {
        if (item.overview) {
            const descr = el.querySelector('.feed-item__descr')
            if (descr) descr.textContent = item.overview
        }

        if (item.vote_average) {
            const info = el.querySelector('.feed-item__info')
            if (info && info.textContent.indexOf('TMDB') === -1) {
                info.textContent = info.textContent + ' / TMDB ' + item.vote_average
            }
        }

        if (item.backdrop_path) {
            const imageBox = el.querySelector('.feed-item__image-box')
            if (imageBox) {
                const img = imageBox.querySelector('img')
                if (img) {
                    img.onload = () => imageBox.classList.add('loaded')
                    img.onerror = () => { img.src = './img/img_broken.svg' }
                    img.src = Api.img(item.backdrop_path, 'w780')
                }
            }
        }

        if (item.tmdbId) {
            el._feedCardId = item.tmdbId
        }
    }

    this.next = function () {
        if (totalPagesKnown && currentPage >= totalPages) return
        if (object.page < 15) {
            object.page++
            this.fetchNextPage()
        }
    }

    this.loadImg = function (box, src) {
        let img = box.find('img')
        img.onload = () => box.addClass('loaded')
        img.onerror = () => { img.src = './img/img_broken.svg' }
        img.src = src
    }

    this.start = function () {
        Controller.add('content', {
            toggle: () => {
                Controller.collectionSet(scroll.render(true))
                Controller.collectionFocus(last || false, scroll.render(true))
            },
            left: () => {
                if (Navigator.canmove('left')) Navigator.move('left')
                else Controller.toggle('menu')
            },
            right: () => Navigator.move('right'),
            up: () => {
                if (Navigator.canmove('up')) Navigator.move('up')
                else Controller.toggle('head')
            },
            down: () => Navigator.move('down'),
            back: () => Activity.backward()
        })

        Controller.toggle('content')
    }

    this.render = function () {
        return html
    }

    this.destroy = function () {
        network.clear()
        scroll.destroy()
        if (observer) {
            observer.disconnect()
            observer = null
        }
        html.remove()
    }
}

import Component from '../../../core/component'
Component.add('feed', CustomFeed)
