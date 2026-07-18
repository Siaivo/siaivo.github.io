import { addAnimeMenuButton } from '../../category/siavo-anime'
import { addMoodMenuButton } from '../../category/mood'

function bindMenuPatch() {
    if (!window.Lampa || !Lampa.Listener) {
        setTimeout(bindMenuPatch, 0)
        return
    }

    Lampa.Listener.follow('menu', function (e) {
        if (e.type === 'start' && e.body) {
            e.body.find('[data-action="relise"]').remove()

            addAnimeMenuButton(e.body)
            addMoodMenuButton()
        }
    })
}

bindMenuPatch()
