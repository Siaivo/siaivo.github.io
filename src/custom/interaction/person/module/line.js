import Favorite from '../../../../core/favorite'
import PersonMap from '../../../../interaction/person/module/map'

// -------------------------------------------------------------------
// Відображення іконки обраного на круглих аватарах акторів (Person/Line)
// у каруселі «Актори» / «Режисер» на сторінках деталей фільмів/серіалів
// -------------------------------------------------------------------

let original_onCreate = PersonMap.Line.onCreate
PersonMap.Line.onCreate = function() {
    original_onCreate.apply(this, arguments)

    let updateIcon = () => {
        let status = Favorite.check(this.data)
        let photo = this.html.find('.full-person__photo')
        if (!photo.length) return

        photo.find('.person-fav-icon').remove()

        if (status.persons) {
            let icon = document.createElement('div')
            icon.className = 'person-fav-icon'
            icon.style.cssText = 'position:absolute;top:0.3em;right:0.3em;z-index:10;background:rgba(0,0,0,0.55);padding:0.25em;border-radius:50%;width:1.7em;height:1.7em;display:flex;align-items:center;justify-content:center;pointer-events:none;box-sizing:border-box;'
            icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" style="width:100%;height:100%;display:block;"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>'
            photo.css('position', 'relative')
            photo.append(icon)
        }
    }

    updateIcon()

    this.listenerPersonFavorite = (e) => {
        if (e.target == 'favorite' && e.card && e.card.id == this.data.id) {
            updateIcon()
        }
    }
    Lampa.Listener.follow('state:changed', this.listenerPersonFavorite)
}

let original_onDestroy = PersonMap.Line.onDestroy
PersonMap.Line.onDestroy = function() {
    if (original_onDestroy) original_onDestroy.apply(this, arguments)
    if (this.listenerPersonFavorite) {
        Lampa.Listener.remove('state:changed', this.listenerPersonFavorite)
    }
}
