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

// Шлях без домену й параметрів: дзеркало може бути інше, а ядро дописує до адреси email тощо.
function path(url) {
    return url.replace(/^(?:[a-z]+:)?\/\/[^/?#]*/i, '').replace(/[?#].*$/, '')
}

function isCub(url) {
    let name = host(url)

    return Boolean(name) && Manifest.cub_mirrors.some(mirror => name == mirror || name.endsWith('.' + mirror))
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
