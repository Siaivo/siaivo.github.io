// src/custom/plugins/etor-notice.js
//
// Попередження для користувачів, у яких встановлений (і увімкнений) плагін
// etor.js. Цей плагін лише перевизначає window.lampa_settings (torrents_use,
// demo, read_only) — те саме вже робить src/custom/app/config.js, тому в
// цьому додатку він не потрібен.
//
// Активність перевіряється через офіційне API Lampa.Plugins.get(): плагін
// вважається активним, якщо він присутній у списку і має status == 1
// (увімкнений). status == 0 означає вимкнений — тоді алерт не показуємо.
import Lang from '../../core/lang'
import Modal from '../../interaction/modal'

// Тексти через систему перекладів (без хардкоду в логіці).
Lang.AddTranslation('uk', {
    etor_notice_title: 'Плагін Etor',
    etor_notice_text: 'У вас встановлений плагін Etor. У цьому додатку він не потрібен — його можна видалити або вимкнути в розділі «Розширення».'
})

Lang.AddTranslation('ru', {
    etor_notice_title: 'Плагин Etor',
    etor_notice_text: 'У вас установлен плагин Etor. В этом приложении он не нужен — его можно удалить или отключить в разделе «Расширения».'
})

Lang.AddTranslation('en', {
    etor_notice_title: 'Etor plugin',
    etor_notice_text: 'You have the Etor plugin installed. It is not needed in this app — you can remove or disable it in the Extensions section.'
})

/**
 * Нормалізує URL плагіна для порівняння (без протоколу, слешів, query).
 * @param {string} url
 * @returns {string}
 */
function norm(url) {
    return (url || '')
        .replace(/[?#].*$/, '')
        .replace(/[/]+$/, '')
        .replace(/^https?:[/][/]/i, '')
        .toLowerCase()
}

/**
 * Перевіряє наявність активного плагіна etor.js і показує алерт.
 * @returns {void}
 */
function check() {
    if (!window.Lampa || !Lampa.Plugins || !Lampa.Modal) {
        setTimeout(check, 100)
        return
    }

    let found = Lampa.Plugins.get().find(p => norm(p.url).indexOf('etor.js') >= 0)

    if (found && found.status == 1) {
        Lampa.Modal.open({
            title: Lampa.Lang.translate('etor_notice_title'),
            html: $('<div class="about">' + Lampa.Lang.translate('etor_notice_text') + '</div>'),
            buttons: [{
                name: Lampa.Lang.translate('settings_param_yes'),
                onSelect: () => Lampa.Modal.close()
            }]
        })
    }
}

/**
 * Ініціалізація: чекаємо готовності Lampa, потім реагуємо на подію 'ready'.
 * @returns {void}
 */
function init() {
    if (!window.Lampa || !Lampa.Listener) {
        setTimeout(init, 100)
        return
    }

    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') check()
    })
}

init()
