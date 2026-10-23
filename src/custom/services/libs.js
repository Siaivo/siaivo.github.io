import Utils from '../../utils/utils'
import Manifest from '../../core/manifest'
import Plugins from '../../core/plugins'

// Скрипти з доменів CUB вантажимо лише за білим списком: плагіни, які поставив сам користувач
// (локальний список, Hub, акаунт CUB), і iptv. Решту ядро тягне саме - sport, tsarea, shots,
// святкові events, engineer «для налагодження», - і кожен новий такий плагін апстріму
// відсікається без правки тут.
const ALLOWED = ['/plugin/iptv']

function host(url) {
    let match = url.match(/^(?:[a-z]+:)?\/\/([^/?#]+)/i)

    return match ? match[1].toLowerCase() : ''
}

// Проксі CUB у Lampac (/cub/<дзеркало>/...): сервер ще й переписує в app.js
// «protocol + cub_domain» на свою адресу, тож скрипти ядра йдуть уже з його хоста.
// Lampac віддає і застосунок, і проксі, тож такий шлях рахуємо лише на нашому ж хості:
// /cub/... на чужому сайті — звичайний скрипт.
const PROXY = /^\/cub\/[^/]+(?=\/)/

function stripHost(url) {
    return url.replace(/^(?:[a-z]+:)?\/\/[^/?#]*/i, '').replace(/[?#].*$/, '')
}

function proxied(url) {
    let name = host(url)

    return (!name || name == window.location.host.toLowerCase()) && PROXY.test(stripHost(url))
}

// Шлях без домену, параметрів і префікса проксі: дзеркало може бути інше,
// а ядро дописує до адреси email тощо.
function path(url) {
    let clean = stripHost(url)

    return proxied(url) ? clean.replace(PROXY, '') : clean
}

function isCub(url) {
    let name = host(url)

    if (name && Manifest.cub_mirrors.some(mirror => name == mirror || name.endsWith('.' + mirror))) {
        return true
    }

    return proxied(url)
}

function allowed() {
    let urls = Plugins.awaits().concat(Plugins.get().map(plugin => typeof plugin == 'string' ? plugin : plugin.url))

    return ALLOWED.concat(urls.filter(Boolean).map(url => path(url + '')))
}

function filterScripts(items) {
    if (!Array.isArray(items)) {
        return items
    }

    let list = null

    return items.filter(function(item) {
        if (!item) {
            return false
        }

        let url = item + ''

        if (!isCub(url)) {
            return true
        }

        list = list || allowed()

        if (list.indexOf(path(url)) == -1) {
            console.log('Libs', 'blocked:', url)

            return false
        }

        return true
    })
}

let putScriptAsync = Utils.putScriptAsync
let putScript = Utils.putScript
let putScriptOfMirrors = Utils.putScriptOfMirrors

Utils.putScriptAsync = function(items, complite, error, success, show_logs) {
    return putScriptAsync.call(this, filterScripts(items), complite, error, success, show_logs)
}

Utils.putScript = function(items, complite, error, success, show_logs) {
    return putScript.call(this, filterScripts(items), complite, error, success, show_logs)
}

// Апстрім замінив putScriptAsync на putScriptOfMirrors і кличе локальну
// putScriptAsync усередині модуля, тому оверрайд вище його не перехоплює.
// Обгортаємо новий метод, щоб білий список працював і для нього.
Utils.putScriptOfMirrors = function(items, complite, error, success, show_logs) {
    return putScriptOfMirrors.call(this, filterScripts(items), complite, error, success, show_logs)
}
