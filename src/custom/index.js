import './app/config-apply'
import './core/manifest'
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
import './interaction/advert/vast_manager'
import './lang/meta-apply'
import './interaction/news-loader'

// Фікс для старих користувачів: видаляємо стрічку з menu_hide, якщо вона там є
// Виконується після ініціалізації Lampa, але до відображення меню
(function fixFeedInMenu() {
    function tryFix() {
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
    }

    // Чекаємо, поки Lampa буде доступний
    tryFix()
})()
