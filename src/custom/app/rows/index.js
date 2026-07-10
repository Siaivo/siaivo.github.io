import ContinueWatch from './continue_watch'

// Точка реєстрації кастомних стрічок ContentRows.
const rows = [
    ContinueWatch
]

// Реєструє всі стрічки, у яких є метод `add`.
function register () {
    rows.forEach(row => {
        if (row && typeof row.add == 'function') row.add()
    })
}

function init () {
    // Додаток уже готовий — реєструємо одразу.
    if (window.appready) {
        register()
        return
    }

    // Lampa ще не завантажилась — чекаємо й пробуємо знову.
    if (!window.Lampa || !Lampa.Listener) {
        setTimeout(init, 50)
        return
    }

    // Чекаємо на подію готовності додатка.
    Lampa.Listener.follow('app', event => {
        if (event.type === 'ready') register()
    })
}

init()