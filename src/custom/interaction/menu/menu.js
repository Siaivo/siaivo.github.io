import Lang from '../../../core/lang'
import Router from '../../../core/router'
import Storage from '../../../core/storage/storage'

function betaAnime() {
    return Storage.get('beta_anime') == 1
}

function bindMenuPatch() {
    if (!window.Lampa || !Lampa.Listener) {
        setTimeout(bindMenuPatch, 0)
        return
    }

    Lampa.Listener.follow('menu', function (e) {
        if (e.type === 'start' && e.body) {
            e.body.find('[data-action="relise"]').remove()

            var animeItem = e.body.find('[data-action="anime"]')

            if (betaAnime()) {
                if (animeItem.length) {
                    var siaivoBtn = $(
                        '<li class="menu__item selector">' +
                        '<div class="menu__ico"><img src="./img/icons/menu/anime.svg" /></div>' +
                        '<div class="menu__text">' + Lang.translate('menu_anime') + '</div>' +
                        '</li>'
                    ).attr('data-action', 'siaivo')

                    animeItem.replaceWith(siaivoBtn)
                }
            }
            else {
                animeItem.remove()

                var cartoonItem = e.body.find('[data-action="cartoon"]')
                if (cartoonItem.length) {
                    var animeMovieBtn = $(
                        '<li class="menu__item selector">' +
                        '<div class="menu__ico"><svg><use xlink:href="#sprite-anime"></use></svg></div>' +
                        //'<div class="menu__text">' + Lang.translate('menu_movies') + '</div>' +
                        '<div class="menu__text">AMV</div>' +
                        '</li>'
                    ).attr('data-action', 'anime_movie')

                    var animeTvBtn = $(
                        '<li class="menu__item selector">' +
                        '<div class="menu__ico"><svg><use xlink:href="#sprite-anime"></use></svg></div>' +
                        //'<div class="menu__text">' + Lang.translate('menu_tv') + '</div>' +
                        '<div class="menu__text">TVA</div>' +
                        '</li>'
                    ).attr('data-action', 'anime_tv')

                    cartoonItem.after(animeMovieBtn)
                    animeMovieBtn.after(animeTvBtn)
                }
            }
        }

        if (e.type === 'action') {
            if (e.action === 'anime') {
                e.abort()
                return
            }

            if (e.action === 'siaivo') {
                e.abort()
                Router.call('category', {
                    url: 'anime',
                    title: Lang.translate('menu_anime'),
                    source: 'siaivo'
                })
                return
            }

            if (e.action === 'anime_movie') {
                e.abort()
                Router.call('category', {
                    url: 'anime_movie',
                    title: Lang.translate('menu_anime') + ' | ' + Lang.translate('menu_movies') + ' - ' + Storage.field('source').toUpperCase(),
                    source: 'tmdb'
                })
                return
            }

            if (e.action === 'anime_tv') {
                e.abort()
                Router.call('category', {
                    url: 'anime_tv',
                    title: Lang.translate('menu_anime') + ' | ' + Lang.translate('menu_tv') + ' - ' + Storage.field('source').toUpperCase(),
                    source: 'tmdb'
                })
                return
            }
        }
    })
}

bindMenuPatch()
