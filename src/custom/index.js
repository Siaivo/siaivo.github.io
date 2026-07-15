import './app/custom-welcome'
import './app/custom-head'
import './app/config-apply'
import './app/markers-visibility'
import './plugins/autoload'
import './core/manifest'
import './interaction/settings/siaivo'
import './interaction/holiday-logo'
import './core/personal'
import './interaction/settings/params'
import './core/vpn'
import './core/tmdb/keys'
import './core/api/api'
import './interaction/menu/menu'
import './interaction/card/module/favorite'
import './interaction/person/module/about'
import './interaction/template'
import './interaction/notice/cub'
import './services/libs'
import './services/watched'
import './services/metric'
import './interaction/screensaver'
import './interaction/lang'
import './interaction/advert'
import './lang/meta-apply'
import './interaction/news-loader'
import './interaction/profile-window'
//import './interaction/player-compatibility'
import './app/torrent-badges'
import './core/favorite'
import './app/rows'
import './components/bookmarks'
import './components/myperson'

import './core/socket'
import './core/tmdb/translation-fallback'
import './core/tmdb/anime-category'
import './core/siaivo'
import './utils/clear-card'

// Фікс для старих користувачів: видаляємо стрічку з menu_hide, якщо вона там є
// Виконується після ініціалізації Lampa, але до відображення меню
(function fixFeedInMenu() {
    function tryFix() {
        // One-time migration guard — skip if already applied
        if (window.localStorage.getItem('menu_hide_feed_fix_applied') === '1') return

        if (!window.Lampa || !Lampa.Listener) {
            setTimeout(tryFix, 50)
            return
        }

        // Відомі варіанти назви "Стрічка" в різних мовах (з мовних файлів)
        const feedVariants = ['Стрічка', 'Лента', 'Feed', 'Новини', 'Стужка', 'Kanál']

        // Отримуємо поточну локалізацію, якщо Lang доступний
        let currentFeed = null
        try {
            if (Lampa.Lang && typeof Lampa.Lang.translate === 'function') {
                currentFeed = Lampa.Lang.translate('menu_feed')
                if (currentFeed && !feedVariants.includes(currentFeed)) {
                    feedVariants.push(currentFeed)
                }
            }
        } catch (e) {}

        // Видаляємо всі варіанти з menu_hide
        try {
            let menuHide = window.localStorage.getItem('menu_hide')
            if (menuHide) {
                menuHide = JSON.parse(menuHide)
                if (Array.isArray(menuHide)) {
                    let changed = false
                    for (const variant of feedVariants) {
                        const idx = menuHide.indexOf(variant)
                        if (idx > -1) {
                            menuHide.splice(idx, 1)
                            changed = true
                        }
                    }
                    if (changed) {
                        window.localStorage.setItem('menu_hide', JSON.stringify(menuHide))
                        console.log('Custom: видалено варіанти стрічки з menu_hide')
                    }
                }
            }
        } catch (e) {
            console.warn('Custom: помилка фіксу menu_hide', e)
        }

        // Mark migration as complete so it never runs again
        window.localStorage.setItem('menu_hide_feed_fix_applied', '1')
    }

    // Чекаємо, поки Lampa буде доступний
    tryFix()
})()
import './interaction/person/module/line'
