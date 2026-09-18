import Utils from '../../utils/utils'

const BLOCKED = ['/plugin/sport', '/plugin/tsarea', '/plugin/shots']

function filterScripts(items) {
    if (!Array.isArray(items)) return items

    return items.filter(function(item) {
        if (!item) return false

        for (let i = 0; i < BLOCKED.length; i++) {
            if ((item + '').indexOf(BLOCKED[i]) >= 0) return false
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
// Обгортаємо новий метод, щоб фільтр BLOCKED працював і для нього.
Utils.putScriptOfMirrors = function(items, complite, error, success, show_logs) {
    return putScriptOfMirrors.call(this, filterScripts(items), complite, error, success, show_logs)
}
