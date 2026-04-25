/**
 * Автозавантаження новин з lampa-ua-pack
 * Додає скрипт feed.js через нативний метод Lampa
 */
function initNewsAutoload() {
    // Перевіряємо, чи Lampa повністю ініціалізована
    if (!window.Lampa || !Lampa.Listener || !Lampa.Utils) {
        console.warn('Custom: Lampa ще не готова, спроба пізніше')
        return
    }

    // Чекаємо готовності аплікації
    Lampa.Listener.follow('app', function(e) {
        if (e.type !== 'ready') return

        const NEWS_SCRIPT = 'https://lampa-ua-pack.github.io/feed.js'

        // Перевіряємо, чи скрипт вже завантажено (через Plugins.loaded())
        if (window.Lampa && Lampa.Plugins && Lampa.Plugins.loaded().includes(NEWS_SCRIPT)) {
            console.log('Custom: feed.js вже завантажено')
            return
        }

        // Використовуємо Lampa.Utils.putScriptAsync — нативний метод Lampa
        Lampa.Utils.putScriptAsync(
            [NEWS_SCRIPT],
            () => {
                console.log('Custom: feed.js успішно завантажено')
            },
            (url) => {
                console.warn('Custom: не вдалося завантажити feed.js:', url)
            },
            () => {
                console.log('Custom: feed.js завантажено')
            },
            false
        )
    })
}

// Чекаємо на створення window.Lampa через полінг
(function waitLampaAndInit() {
    if (window.Lampa && Lampa.Listener && Lampa.Utils) {
        initNewsAutoload()
    } else {
        setTimeout(waitLampaAndInit, 10)
    }
})()
