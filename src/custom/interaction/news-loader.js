/**
 * Автозавантаження новин з lampa-ua-pack
 * Додає скрипт news.js через нативний метод Lampa
 */
function initNewsAutoload() {
    // Чекаємо готовності аплікації
    Lampa.Listener.follow('app', function(e) {
        if (e.type !== 'ready') return

        const NEWS_SCRIPT = 'https://lampa-ua-pack.github.io/news.js'

        // Перевіряємо, чи скрипт вже завантажено (через Plugins.loaded())
        if (window.Lampa && Lampa.Plugins && Lampa.Plugins.loaded().includes(NEWS_SCRIPT)) {
            console.log('Custom: news.js вже завантажено')
            return
        }

        // Використовуємо Utils.putScriptAsync — нативний метод Lampa
        Utils.putScriptAsync(
            [NEWS_SCRIPT],
            () => {
                console.log('Custom: news.js успішно завантажено')
            },
            (url) => {
                console.warn('Custom: не вдалося завантажити news.js:', url)
            },
            () => {
                console.log('Custom: news.js завантажено')
            },
            false
        )
    })
}

// Запускаємо ініціалізацію, коли Lampa буде доступний
if (window.Lampa) {
    initNewsAutoload()
} else {
    // Чекаємо на завантаження Lampa
    document.addEventListener('DOMContentLoaded', () => {
        const checkLampa = () => {
            if (window.Lampa) {
                initNewsAutoload()
            } else {
                setTimeout(checkLampa, 50)
            }
        }
        checkLampa()
    })
}
