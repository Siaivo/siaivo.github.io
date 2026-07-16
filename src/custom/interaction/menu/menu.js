import Lang from '../../../core/lang'
import Router from '../../../core/router'

function bindMenuPatch() {
    if (!window.Lampa || !Lampa.Listener) {
        setTimeout(bindMenuPatch, 0)
        return
    }

    Lampa.Listener.follow('menu', function (e) {
        if (e.type === 'start' && e.body) {
            e.body.find('[data-action="relise"]').remove()

            var animeItem = e.body.find('[data-action="anime"]')

            if (animeItem.length && Lang.selected(['uk'])) {
                var siaivoAnimeBtn = $(
                    '<li class="menu__item selector">' +
                        '<div class="menu__ico"><img src="./img/icons/menu/anime.svg" /></div>' +
                        '<div class="menu__text">' + Lang.translate('menu_anime') + '</div>' +
                    '</li>'
                ).attr('data-action', 'siaivo')

                siaivoAnimeBtn.on('hover:enter', function () {
                    Router.call('category', {
                        url: 'anime',
                        title: Lang.translate('menu_anime'),
                        source: 'siaivo'
                    })
                })

                animeItem.replaceWith(siaivoAnimeBtn)
            }
        }
    })
}

bindMenuPatch()
