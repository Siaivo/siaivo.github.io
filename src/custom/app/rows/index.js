import ContinueWatch from './continue_watch'

// Точка реєстрації кастомних стрічок ContentRows.
let rows = [
    ContinueWatch
]

function init () {
    if (!window.Lampa
        || !window.Lampa.Lang
        || window.Lampa.Lang.translate('title_continue', 'en') != 'Continue browsing') {
        setTimeout(init, 50)
        return
    }

    rows.forEach(row => {
        if(row && typeof row.add == 'function') row.add()
    })
}

init();