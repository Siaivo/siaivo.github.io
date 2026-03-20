import Controller from '../../../../core/controller'
import Favorite from '../../../../core/favorite'
import Lang from '../../../../core/lang'
import Select from '../../../../interaction/select'
import Template from '../../../../interaction/template'
import BookmarksModule from '../../../../components/full/start/bookmarks'
import FavoriteModule from '../../../../interaction/card/module/favorite'

const MARKS = ['look', 'viewed', 'scheduled', 'continued', 'thrown']

Select.listener.follow('preshow', function(event) {
    let active = event && event.active

    if (!active || !Array.isArray(active.items)) return

    let hasMarks = active.items.some(function(item) {
        return item && item.collect && MARKS.indexOf(item.where) >= 0
    })

    if (!hasMarks) return

    active.items.forEach(function(item) {
        if (!item || !item.collect || MARKS.indexOf(item.where) === -1) return

        item.noenter = false
        item.ghost = false

        if (item.onDraw) delete item.onDraw
    })

    if (active.onDraw) active.onDraw = null
})

BookmarksModule.onCreate = function() {
    this.html.find('.button--book').on('hover:enter', () => {
        let status = Favorite.check(this.card)
        let marks = ['look', 'viewed', 'scheduled', 'continued', 'thrown']

        let label = (a) => {
            Favorite.toggle(a.type, this.card)

            if (a.collect) Controller.toggle('content')
        }

        let items = ['book', 'like', 'wath', 'history'].map(type => {
            return {
                title: Lang.translate('title_' + type),
                type: type,
                checkbox: true,
                checked: status[type]
            }
        })

        if (window.lampa_settings.account_use) {
            items.push({
                title: Lang.translate('settings_cub_status'),
                separator: true
            })

            marks.forEach(m => {
                items.push({
                    title: Lang.translate('title_' + m),
                    type: m,
                    picked: status[m],
                    collect: true
                })
            })
        }

        Select.show({
            title: Lang.translate('settings_input_links'),
            items: items,
            onCheck: label,
            onSelect: label,
            onBack: () => {
                Controller.toggle('content')
            }
        })
    })

    this.emit('updateFavorite')

    this.listenerFavorite = (e) => {
        if (e.target == 'favorite') {
            if (e.card) {
                if (e.card.id == this.card.id) this.emit('updateFavorite')
            }
            else this.emit('updateFavorite')
        }
    }

    Lampa.Listener.follow('state:changed', this.listenerFavorite)
}

FavoriteModule.onCreate = function() {
    let onCheck = (a) => {
        Favorite.toggle(a.where, this.data)
    }

    let onSelect = (a) => {
        onCheck(a)

        this.emit('menuSelect', a, this.html, this.data)
    }

    function drawMenu() {
        let status = Favorite.check(this.data)
        let menu = []
        let items_check = ['book', 'like', 'wath', 'history']
        let items_mark = ['look', 'viewed', 'scheduled', 'continued', 'thrown']

        items_check.forEach(c => {
            menu.push({
                title: Lang.translate('title_' + c),
                where: c,
                checkbox: true,
                checked: status[c],
                onCheck
            })
        })

        if (window.lampa_settings.account_use) {
            menu.push({
                title: Lang.translate('settings_cub_status'),
                separator: true
            })

            items_mark.forEach(m => {
                menu.push({
                    title: Lang.translate('title_' + m),
                    where: m,
                    picked: status[m],
                    collect: true,
                    onSelect
                })
            })
        }

        return menu
    }

    this.menu_list.push({
        title: Lang.translate('settings_input_links'),
        menu: drawMenu.bind(this),
    })

    this.listenerFavorite = (e) => {
        if (e.target == 'favorite') {
            if (e.card) {
                if (e.card.id == this.data.id) this.emit('favorite')
            }
            else this.emit('favorite')
        }
    }

    Lampa.Listener.follow('state:changed', this.listenerFavorite)
}

FavoriteModule.onUpdate = function() {
    this.emit('favorite')
}

FavoriteModule.onAddicon = function(name) {
    this.html.find('.card__icons-inner').append(Template.elem('div', { class: 'card__icon icon--' + name }))
}

FavoriteModule.onFavorite = function() {
    let status = Favorite.check(this.data)
    let marker = this.html.find('.card__marker')
    let marks = ['look', 'viewed', 'scheduled', 'continued', 'thrown']

    this.html.find('.card__icons-inner').innerHTML = ''

    if (status.book) this.emit('addicon', 'book')
    if (status.like) this.emit('addicon', 'like')
    if (status.wath) this.emit('addicon', 'wath')
    let timelineWatched = false
    if (window.Lampa && Lampa.Timeline && typeof Lampa.Timeline.watched === 'function') {
        timelineWatched = Lampa.Timeline.watched(this.data)
    }

    if (status.history || timelineWatched) this.emit('addicon', 'history')

    let any_marker = marks.find(m => status[m])

    if (any_marker) {
        if (!marker) {
            marker = Template.elem('div', {
                class: 'card__marker', children: [
                    Template.elem('span')
                ]
            })

            this.html.find('.card__view').append(marker)
        }

        marker.find('span').text(Lang.translate('title_' + any_marker))
        marker.removeClass(marks.map(m => 'card__marker--' + m).join(' ')).addClass('card__marker--' + any_marker)
    }
    else if (marker) marker.remove()
}

FavoriteModule.onDestroy = function() {
    Lampa.Listener.remove('state:changed', this.listenerFavorite)
}
