import ContentRows from '../../../core/content_rows'
import ContinueWatch from './continue_watch'
import AnimeRecomend from './category-anime/recomend'
import AnimeLately from './category-anime/lately'
import AnimeRecently from './category-anime/recently'

// Точка реєстрації кастомних стрічок ContentRows.
const rows = [
    ContinueWatch
]

// Ряди, які core оголошує лише для main/category (recomend.js:50, timetable.js:78, :114) і
// яких через це нема на нашій сторінці аніме. Дописуємо їм екран і підміняємо ТІЛЬКИ цю
// гілку: на головній і в категоріях далі працює тіло core, дублювати його не треба.
//
// Чому не викликаємо тіло core з фільтром після нього: воно ріже список до 20 ще до того, як
// ми могли б відсіяти не-аніме (recomend.js:56, timetable.js:82), і з двадцяти випадкових
// серіалів аніме лишалось би нуль. Тому на цьому екрані ряд будується власним build().
const SCREEN = 'category_anime'

const patched = [AnimeRecomend, AnimeLately, AnimeRecently]

// Перехоплюємо саму реєстрацію, бо ContentRows тримає ряди у приватному масиві. Модуль
// виконується на імпорті (app.js:128), а core реєструє ряди пізніше, у loadApp() (app.js:570) -
// на відміну від register() нижче, який чекає 'app ready' і для перехоплення був би запізно.
let builders = {}

patched.forEach(row => builders[row.name] = row.build)

let original_add = ContentRows.add

ContentRows.add = function (row) {
    let build = row && builders[row.name]

    if (build) {
        let original_call = row.call

        row.screen = row.screen.concat(SCREEN)
        row.call   = (params, screen) => screen == SCREEN ? build() : original_call(params, screen)
    }

    return original_add.call(this, row)
}

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
