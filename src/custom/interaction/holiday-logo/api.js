/**
 * Holiday Logo API — завантаження та кешування свят
 * 
 * Завантажує список українських публічних свят з date.nager.at
 * Кешує результат у localStorage на добу
 */

var CACHE_KEY = 'custom_holiday_cache'
var API_URL = 'https://date.nager.at/api/v3/NextPublicHolidays/ua'

var TEST_DATE_KEY = 'custom_holiday_test_date'

/**
 * Отримати поточну дату у форматі YYYY-MM-DD
 * 
 * ⚙️ ТЕСТ: щоб симулювати іншу дату, встанови у консолі браузера:
 *   localStorage.setItem('custom_holiday_test_date', '2026-08-24')
 * Щоб скинути:
 *   localStorage.removeItem('custom_holiday_test_date')
 * 
 * @returns {string}
 */
function todayStr() {
    try {
        var override = localStorage.getItem(TEST_DATE_KEY)
        if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) {
            console.warn('[HolidayLogo] 🧪 TEST DATE OVERRIDE:', override, '(щоб скинути: localStorage.removeItem("' + TEST_DATE_KEY + '"))')
            return override
        }
    } catch (e) { }

    var d = new Date()
    var y = d.getFullYear()
    var m = String(d.getMonth() + 1).padStart(2, '0')
    var day = String(d.getDate()).padStart(2, '0')
    return y + '-' + m + '-' + day
}

/**
 * Прочитати кеш із localStorage
 * @returns {{ date: string, holidays: Array }|null}
 */
function readCache() {
    try {
        var raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return null
        var parsed = JSON.parse(raw)
        if (parsed && parsed.date && Array.isArray(parsed.holidays)) return parsed
    } catch (e) { }
    return null
}

/**
 * Записати результати у кеш
 * @param {Array} holidays
 */
function writeCache(holidays) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            date: todayStr(),
            holidays: holidays
        }))
    } catch (e) { }
}

/**
 * Завантажити свята (з кешу або API)
 * @returns {Promise<Array>}
 */
function load() {
    var today = todayStr()
    var isTestMode = false
    try {
        isTestMode = !!localStorage.getItem(TEST_DATE_KEY)
    } catch (e) { }

    var cached = readCache()

    // У тест-режимі кеш ігноруємо — щоб тест-дата завжди спрацьовувала свіжо
    if (!isTestMode && cached && cached.holidays && cached.holidays.length) {
        console.log('HolidayLogo', 'Using cached holidays for', today)
        return Promise.resolve(cached.holidays)
    }

    return fetch(API_URL, { method: 'GET' })
        .then(function (resp) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status)
            return resp.json()
        })
        .then(function (data) {
            if (!Array.isArray(data)) throw new Error('Invalid response')
            if (!isTestMode) writeCache(data)
            console.log('HolidayLogo', 'Fetched', data.length, 'holidays from API')
            return data
        })
        .catch(function (e) {
            console.warn('HolidayLogo', 'API error:', e.message, '— trying stale cache')
            // Відповідь з протермінованого кешу краща ніж нічого
            if (cached && cached.holidays) return cached.holidays
            return []
        })
}

export default { load: load, todayStr: todayStr }
