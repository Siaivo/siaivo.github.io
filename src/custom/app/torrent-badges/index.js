/**
 * Torrents v2 — entry point
 * Додає бейджі якості, аудіо та відео у картки торрентів
 */

import { init as initSettings } from './settings'
import { init as initBadges, matchBadges, getBadges, fetchPromise, reload } from './badges'
import { renderBadges } from './renderer'
import Storage from '../../../core/storage/storage'

/**
 * Інжекція CSS-стилів для бейджів
 * Стилі визначені в style.scss, але оскільки gulp збирає SCSS лише з src/sass/,
 * вставляємо їх inline після завантаження сторінки
 */
function injectStyles() {
    if (document.getElementById('torrent-badges-style')) return

    let style = document.createElement('style')
    style.id = 'torrent-badges-style'
    style.textContent =
        '.torrent-item__badges{display:flex;flex-wrap:wrap;gap:.4em;margin-top:.5em;align-items:center}' +
        '.torrent-item__badges-group{display:flex;gap:.3em;align-items:center}' +
        '.torrent-item__badges-group+.torrent-item__badges-group{margin-left:.3em}' +
        '.torrent-item__badges img{height:1.4em;width:auto;vertical-align:middle}'
    document.head.appendChild(style)
}

function init() {
    if (!window.Lampa || !Lampa.Listener) {
        setTimeout(init, 50)
        return
    }

    // 1. Реєструємо налаштування
    initSettings()

    // 2. Інжектимо стилі
    injectStyles()

    // 3. Починаємо завантаження бейджів
    initBadges()

    // 4. Реєструємо глобальну функцію перезавантаження (викликається при зміні URL маніфесту)
    window.torrentBadgesReload = function () {
        console.log('[torrent-badges] reloading badges...')
        reload().then(() => {
            console.log('[torrent-badges] badges reloaded')
        })
    }

    // 5. Слухаємо подію render торрентів
    Lampa.Listener.follow('torrent', function (e) {
        if (e.type !== 'render') return

        let v2 = Storage.field('torrents_v2')
        if (v2 !== true && v2 !== 'true') return

        let title = e.element.Title || e.element.title
        if (!title) return

        // Якщо бейджі ще не завантажені — чекаємо
        if (!getBadges().length) {
            fetchPromise.then(() => {
                let badges = renderBadges(title)
                if (badges) {
                    e.item.find('.torrent-item__title').after(badges)
                }
            })
            return
        }

        let badges = renderBadges(title)
        if (badges) {
            e.item.find('.torrent-item__title').after(badges)
        }
    })
}

// Стартуємо з очікуванням Lampa
init()
