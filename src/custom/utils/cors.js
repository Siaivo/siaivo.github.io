// Спільна логіка CORS-проксі для кастомних джерел (siaivo тощо).
// У API цих джерел немає CORS-заголовків для браузера, тож JSON-запити йдуть через проксі.
// Поточний проксі (cors.io) віддає НЕ сиру відповідь, а конверт
// { url, status, headers, body:"<json-рядок>" }, який розгортає unwrap() (JSON.parse(body)).
//
// Альтернативний проксі (lme-proxy) віддає СИРУ відповідь; unwrap() для нього — захисний
// var PROXY = 'https://lme-proxy.vercel.app/?url='
var PROXY = 'https://cors.io/?url='

// Конверт cors.io { url, status, headers, body }.
function isEnvelope(json) {
    return !!json && typeof json.body === 'string' && json.status !== undefined && json.url !== undefined
}

// Конверт з не-2xx статусом цілі (cors.io сам відповідає 200, навіть коли ціль дала 404/5xx).
function isFailed(json) {
    return isEnvelope(json) && !(json.status >= 200 && json.status < 300)
}

// Reguest кешує відповідь ДО complite -> помилка в конверті осіла б у кеші на весь cache.life.
// request_secuses отримує той самий params, тож знімаємо з нього cache. Ліниво: custom
// імпортується раніше, ніж з'являється window.Lampa.
var guarded = false

function guardCache() {
    if (guarded || !window.Lampa || !Lampa.Listener) return
    guarded = true

    Lampa.Listener.follow('request_secuses', function(e) {
        if (e.params && e.params.url && e.params.url.indexOf(PROXY) === 0 && isFailed(e.data)) e.params.cache = null
    })
}

// Обгортає повний URL у проксі.
function proxied(fullUrl) {
    guardCache()
    return PROXY + encodeURIComponent(fullUrl)
}

// Проксований URL до API за базою і шляхом: apiUrl('https://x', '/a?b') -> proxied('https://x/a?b').
function apiUrl(base, path) {
    return proxied(base + path)
}

// Розгортає конверт cors.io { url, status, headers, body } -> розпарсений JSON з body.
// Не-2xx статус цілі -> null (виклики трактують як помилку/порожньо).
// Якщо це не конверт (або body не парситься) — повертає аргумент як є.
function unwrap(json) {
    if (isFailed(json)) return null

    if (isEnvelope(json)) {
        try {
            return JSON.parse(json.body)
        } catch (e) {
            return json
        }
    }

    return json
}

export default {
    PROXY: PROXY,
    proxied: proxied,
    apiUrl: apiUrl,
    unwrap: unwrap
}
