// Спільна логіка CORS-проксі для кастомних джерел (siaivo тощо).
// У API цих джерел немає CORS-заголовків для браузера, тож JSON-запити йдуть через проксі.
// Поточний проксі (cors.io) віддає НЕ сиру відповідь, а конверт
// { url, status, headers, body:"<json-рядок>" }, який розгортає unwrap() (JSON.parse(body)).
//
// Альтернативний проксі (lme-proxy) віддає СИРУ відповідь; unwrap() для нього — захисний
// var PROXY = 'https://lme-proxy.vercel.app/?url='
var PROXY = 'https://cors.io/?url='

// Обгортає повний URL у проксі.
function proxied(fullUrl) {
    return PROXY + encodeURIComponent(fullUrl)
}

// Проксований URL до API за базою і шляхом: apiUrl('https://x', '/a?b') -> proxied('https://x/a?b').
function apiUrl(base, path) {
    return proxied(base + path)
}

// Розгортає конверт cors.io { url, status, headers, body } -> розпарсений JSON з body.
// Якщо це не конверт (або body не парситься) — повертає аргумент як є.
function unwrap(json) {
    if (json && typeof json.body === 'string' && json.status !== undefined && json.url !== undefined) {
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
