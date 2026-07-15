import Lang from '../../../core/lang'
import Router from '../../../core/router'
import Storage from '../../../core/storage/storage'

function siaivoAnimeEnabled() {
    return Storage.get('beta_anime') == 1 && Lang.selected(['uk'])
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

            if (siaivoAnimeEnabled()) {
                if (animeItem.length) {
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

                    return;
                }
            }

            animeItem.remove()

            var cartoonItem = e.body.find('[data-action="cartoon"]')
            if (cartoonItem.length) {
                var animeMovieBtn = $(
                    '<li class="menu__item selector">' +
                        '<div class="menu__ico"><svg><use xlink:href="#sprite-anime"></use></svg></div>' +
                        '<div class="menu__text">AMV</div>' +
                    '</li>'
                ).attr('data-action', 'anime_movie')

                animeMovieBtn.on('hover:enter', function () {
                    Router.call('category', {
                        url: 'anime_movie',
                        title: Lang.translate('menu_anime') + ' | ' + Lang.translate('menu_movies') + ' - ' + Storage.field('source').toUpperCase(),
                        source: 'tmdb'
                    })
                })

                var animeTvBtn = $(
                    '<li class="menu__item selector">' +
                        '<div class="menu__ico"><svg><use xlink:href="#sprite-anime"></use></svg></div>' +
                        '<div class="menu__text">TVA</div>' +
                    '</li>'
                ).attr('data-action', 'anime_tv')

                animeTvBtn.on('hover:enter', function () {
                    Router.call('category', {
                        url: 'anime_tv',
                        title: Lang.translate('menu_anime') + ' | ' + Lang.translate('menu_tv') + ' - ' + Storage.field('source').toUpperCase(),
                        source: 'tmdb'
                    })
                })

                cartoonItem.after(animeMovieBtn)
                animeMovieBtn.after(animeTvBtn)
            }
        }
    })
}

bindMenuPatch()
