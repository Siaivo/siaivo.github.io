/**
 * Holiday Logo — Оркестратор
 * 
 * Головний модуль, що:
 * 1. Чекає появу .head__logo-icon у DOM
 * 2. Завантажує список свят через API (з кешем)
 * 3. Визначає активне свято для поточної дати
 * 4. Застосовує або скидає тему через overlay.js
 * 
 * Підключення через src/custom/index.js
 */

import Api from './api'
import Themes from './themes'
import Overlay from './overlay'
import Settings from './settings'
import Storage from '../../../core/storage/storage'

var MAX_WAIT_MS = 10000   // максимум чекаємо 10s на .head__logo-icon
var POLL_INTERVAL = 200   // перевірка DOM кожні 200ms

/**
 * Зачекати поки елемент з'явиться в DOM
 * @param {string} selector
 * @returns {Promise<Element>}
 */
function waitForElement(selector) {
    return new Promise(function (resolve, reject) {
        var el = document.querySelector(selector)
        if (el) return resolve(el)

        var elapsed = 0
        var timer = setInterval(function () {
            el = document.querySelector(selector)
            if (el) {
                clearInterval(timer)
                resolve(el)
                return
            }
            elapsed += POLL_INTERVAL
            if (elapsed >= MAX_WAIT_MS) {
                clearInterval(timer)
                reject(new Error('Timeout waiting for ' + selector))
            }
        }, POLL_INTERVAL)
    })
}

/**
 * Основна логіка ініціалізації
 */
function init() {
    // Реєструємо налаштування "siaivo"
    Settings.init()

    var today = Api.todayStr()
    console.log('HolidayLogo', 'Initializing for date:', today)

    // Завантажуємо свята та чекаємо DOM паралельно
    Promise.all([
        Api.load(),
        waitForElement('.head__logo-icon')
    ]).then(function (results) {
        var holidays = results[0]

        if (!holidays || holidays.length === 0) {
            console.log('HolidayLogo', 'No holidays available')
            return
        }

        var result = Themes.resolveTheme(holidays, today)

        if (!result) {
            console.log('HolidayLogo', 'No active or upcoming holiday found')
            return
        }

        // Ін'єкція базового CSS заздалегідь
        Overlay.injectBaseCSS()

        // Функція застосування теми
        function applyTheme() {
            var style = Storage ? Storage.get('holiday_style', '3') : '3'
            if (style == 0) {
                Overlay.reset()
                return
            }

            Overlay.apply({
                theme: result.theme,
                multiplier: result.multiplier,
                holiday: result.holiday,
                daysDiff: result.daysDiff,
                style: style
            })
        }

        // Невелика затримка для плавності
        setTimeout(function () {
            applyTheme()

            // Якщо логотип ще не в DOM
            if (!Overlay.isActive() && Storage && Storage.get('holiday_style', '3') != 0) {
                setTimeout(applyTheme, 1000)
            }
        }, 500)

        // Слухаємо зміни налаштувань
        window.addEventListener('holiday_style_changed', function () {
            applyTheme()
        })

    }).catch(function (e) {
        console.warn('[HolidayLogo] Init failed:', e.message)
    })
}

// Запускаємо після завантаження DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
} else {
    setTimeout(init, 0)
}

export default { init: init }
