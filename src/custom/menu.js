import Lang from '../core/lang'
import Router from '../core/router'
import Storage from '../core/storage/storage'

function bindMenuPatch() {
    if (!window.Lampa || !Lampa.Listener) {
        setTimeout(bindMenuPatch, 0)
        return
    }

    Lampa.Listener.follow('menu', function(e) {
        if (e.type === 'start' && e.body) {
            e.body.find('[data-action="anime"]').remove()
            e.body.find('[data-action="relise"]').remove()
        }

        if (e.type === 'action' && e.action === 'anime') {
            e.abort()

            Router.call('category', {
                url: 'anime',
                title: Lang.translate('menu_anime') + ' - ' + Storage.field('source').toUpperCase(),
                source: 'tmdb'
            })
        }
    })
}

bindMenuPatch()
