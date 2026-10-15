// src/custom/plugins/grey-list.js
//
// Сірий список плагінів: на відміну від blacklist нічого не блокує, а при
// кожному запуску показує, які з увімкнених плагінів користувача проблемні.
// Такі плагіни не вантажаться, доки модалку не закрито: Plugins.task прибирає
// їх з черги, а після закриття догружаються лише ті, що лишились увімкненими.
// Тому «Вимкнути»/«Вилучити» діють одразу, без перезавантаження.
//
// Джерело: public/plugins_grey_list.json (поруч з index.html, як і
// plugins_black_list.json). Формат — масив рядків або {url, reason?}:
//   "example.com"                         — весь домен (разом із піддоменами)
//   "user.github.io/repo"                 — увесь репозиторій
//   "raw.githubusercontent.com/user/repo" — те саме для raw
//   "cdn.jsdelivr.net/gh/user/repo"       — те саме через jsDelivr, з будь-якою @версією
//   "example.com/plugin.js"               — один плагін
// Протокол, регістр, query та кінцевий слеш ігноруються.
import Lang from '../../core/lang'
import Modal from '../../interaction/modal'
import Plugins from '../../core/plugins'
import Controller from '../../core/controller'
import Storage from '../../core/storage/storage'
import SettingsApi from '../../interaction/settings/api'
import Params from '../../interaction/settings/params'
import ExtensionItem from '../../interaction/extensions/item'
import Request from '../../utils/reguest'

let network = new Request()

let rules    = []
let deferred = []

// Перемикач у «Siaivo». Дефолт реєструємо одразу: Plugins.task читає його ще
// до старту, а сам пункт налаштувань додаємо пізніше (init), щоб він стояв
// після «Стрічки» й «Торренти v2».
Params.trigger('grey_list_enabled', true)

function enabled() {
    return Storage.field('grey_list_enabled') !== false
}

Lang.AddTranslation('uk', {
    grey_list_title: 'Небезпечні плагіни',
    grey_list_text: 'Ці плагіни можуть нашкодити вам, навіть якщо працюють без помилок. Рекомендуємо вимкнути або вилучити їх.',
    grey_list_removed: 'Вилучено',
    grey_list_close: 'Закрити',
    grey_list_install_title: 'Небезпечний плагін',
    grey_list_install_text: 'Цей плагін є у списку небезпечних і може нашкодити вам, навіть якщо працює без помилок. Встановити його?',
    grey_list_install_cancel: 'Скасувати',
    grey_list_install_anyway: 'Встановити все одно',
    grey_list_enable_text: 'Цей плагін є у списку небезпечних і може нашкодити вам, навіть якщо працює без помилок. Увімкнути його?',
    grey_list_enable_anyway: 'Увімкнути все одно',
    grey_list_setting: 'Захист від небезпечних плагінів',
    grey_list_setting_descr: 'Попереджати про небезпечні плагіни під час запуску, встановлення та ввімкнення і не вантажити їх до вашого рішення'
})

Lang.AddTranslation('en', {
    grey_list_title: 'Unsafe plugins',
    grey_list_text: 'These plugins may harm you, even if they seem to work fine. We recommend disabling or removing them.',
    grey_list_removed: 'Removed',
    grey_list_close: 'Close',
    grey_list_install_title: 'Unsafe plugin',
    grey_list_install_text: 'This plugin is on the list of unsafe plugins and may harm you, even if it seems to work fine. Install it?',
    grey_list_install_cancel: 'Cancel',
    grey_list_install_anyway: 'Install anyway',
    grey_list_enable_text: 'This plugin is on the list of unsafe plugins and may harm you, even if it seems to work fine. Enable it?',
    grey_list_enable_anyway: 'Enable anyway',
    grey_list_setting: 'Unsafe plugin protection',
    grey_list_setting_descr: 'Warn about unsafe plugins on startup, install and enable, and hold them back until you decide'
})

Lang.AddTranslation('ru', {
    grey_list_title: 'Опасные плагины',
    grey_list_text: 'Эти плагины могут навредить вам, даже если работают без ошибок. Рекомендуем отключить или удалить их.',
    grey_list_removed: 'Удалено',
    grey_list_close: 'Закрыть',
    grey_list_install_title: 'Опасный плагин',
    grey_list_install_text: 'Этот плагин есть в списке опасных и может навредить вам, даже если работает без ошибок. Установить его?',
    grey_list_install_cancel: 'Отмена',
    grey_list_install_anyway: 'Установить всё равно',
    grey_list_enable_text: 'Этот плагин есть в списке опасных и может навредить вам, даже если работает без ошибок. Включить его?',
    grey_list_enable_anyway: 'Включить всё равно',
    grey_list_setting: 'Защита от опасных плагинов',
    grey_list_setting_descr: 'Предупреждать об опасных плагинах при запуске, установке и включении и не загружать их до вашего решения'
})

/**
 * Нормалізує URL: без протоколу, query/hash, кінцевих слешів, у нижньому регістрі.
 * @param {string} url
 * @returns {string}
 */
function norm(url) {
    return (url || '')
        .replace(/[?#].*$/, '')
        .replace(/[/]+$/, '')
        .replace(/^https?:[/][/]/i, '')
        .toLowerCase()
}

/**
 * Чи підпадає URL плагіна під правило. Збіг лише по межі сегмента шляху,
 * тож "user.github.io/repo" не зачепить "user.github.io/repo2". Правило без
 * шляху (чистий домен) також покриває піддомени.
 * @param {string} url
 * @param {string} rule
 * @returns {boolean}
 */
function match(url, rule) {
    let u = norm(url) + '/'
    let r = norm(rule)

    if (!r) {
        return false
    }

    // '@' теж межа: jsDelivr пише версію як gh/user/repo@main/file.js
    if (u.indexOf(r) === 0 && '/@'.indexOf(u.charAt(r.length)) >= 0) {
        return true
    }

    if (r.indexOf('/') >= 0) {
        return false
    }

    let host = u.slice(0, u.indexOf('/'))

    return host.slice(-(r.length + 1)) === '.' + r
}

/**
 * Домен з адреси плагіна - замість назви, якої в більшості плагінів нема.
 * @param {string} url
 * @returns {string}
 */
function host(url) {
    let clean = norm(url)

    return clean.split('/')[0] || url
}

let warning = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>'

// Кольори й радіуси - з карток екрана «Розширення» (extensions.scss), кнопки - modal__button.
// Без flex gap: старі ТВ-браузери його не знають. SCSS gulp бере лише з src/sass, тому inline.
function styles() {
    if (document.getElementById('grey-list-style')) {
        return
    }

    let style = document.createElement('style')

    style.id = 'grey-list-style'
    style.textContent = `
        .grey-list{font-size:1.2em;line-height:1.4}
        .grey-list__text{color:rgba(255,255,255,.7);margin-bottom:1.4em}
        .grey-list__item{background:rgba(255,255,255,.06);border-radius:1em;padding:1.1em 1.3em 1.3em}
        .grey-list__item+.grey-list__item{margin-top:1em}
        .grey-list__name{font-size:1.25em;font-weight:500;line-height:1.2;word-break:break-word}
        .grey-list__url{color:#8d8d8d;font-size:.8em;margin-top:.35em;word-break:break-all}
        .grey-list__reason{display:flex;align-items:flex-start;margin-top:1em}
        .grey-list__reason svg{width:1.1em;height:1.1em;flex-shrink:0;margin:.15em .6em 0 0;color:#ffd016}
        .grey-list__state{display:inline-block;margin-top:1em;padding:.3em .6em .35em;border-radius:.3em;background:rgba(0,0,0,.25);color:#8d8d8d;font-size:.8em}
        .grey-list__state--removed{color:#dd7337}
        .grey-list__actions{display:flex;flex-wrap:wrap;margin-top:1.2em}
        .grey-list__actions .modal__button{font-size:1em}
        @media screen and (max-width:480px){
            .grey-list__actions{display:block}
            .grey-list__actions .modal__button{text-align:center}
        }
    `

    document.head.appendChild(style)
}

/**
 * Тягне список. Без мережі чи за таймаутом бере останню збережену копію, щоб
 * запуск офлайн не пропускав проблемні плагіни. Відсутній файл (404) = порожній
 * список: self-hosted збірка його може не мати.
 * @param {function(Array)} call
 * @returns {void}
 */
function loadRules(call) {
    function finish(list) {
        if (!Array.isArray(list)) {
            list = []
        }

        call(list.map(item => typeof item == 'string' ? { url: item } : item).filter(item => item && item.url))
    }

    function save(list) {
        Storage.set('plugins_grey_list', Array.isArray(list) ? list : [])

        finish(list)
    }

    // Час у query - щоб браузер не віддав старий список з HTTP-кешу.
    network.silent('./plugins_grey_list.json?_=' + Date.now(), save, (jqXHR) => {
        // Сервер відповів (404, порожній чи битий JSON) - списку просто нема.
        // status 0 - мережа/таймаут: беремо збережену копію.
        if (jqXHR && jqXHR.status) {
            save([])
        }
        else {
            finish(Storage.get('plugins_grey_list', '[]'))
        }
    }, false, {
        timeout: 1000 * 5
    })
}

/**
 * Догружає відкладені плагіни, крім вимкнених або вилучених у модалці.
 * Plugins.awaits() - це сам масив черги, тож підміняємо його вміст і
 * запускаємо штатний Plugins.load (кеш, помилки, Plugins.loaded()).
 * @param {Array} found
 * @returns {void}
 */
function release(found) {
    let urls = deferred.filter(url => !found.some(entry => entry.plugin.url == url && (entry.removed || entry.plugin.status != 1)))

    deferred = []

    if (!urls.length) {
        return
    }

    let awaits = Plugins.awaits()

    awaits.length = 0
    awaits.push.apply(awaits, urls)

    Plugins.load(() => {})
}

/**
 * Картка плагіна: назва, адреса, причина зі списку.
 * @param {object} plugin
 * @param {object} rule
 * @returns {jQuery}
 */
function card(plugin, rule) {
    let item = $('<div class="grey-list__item"></div>')

    // без назви плагін упізнають за доменом, а повна адреса йде рядком нижче
    item.append($('<div class="grey-list__name"></div>').text(plugin.name || host(plugin.url)))
    item.append($('<div class="grey-list__url"></div>').text(plugin.url))

    if (rule.reason) {
        let reason = $('<div class="grey-list__reason"></div>').html(warning)

        reason.append($('<span></span>').text(rule.reason))

        item.append(reason)
    }

    return item
}

/**
 * Попередження перед встановленням плагіна зі списку. Встановлює лише після
 * «Встановити все одно».
 * @param {object} plugin
 * @param {object} rule
 * @param {function} install
 * @param {function} cancel
 * @param {string} [mode=install] - install | enable: тексти питання й кнопки
 * @returns {void}
 */
function confirmInstall(plugin, rule, install, cancel, mode = 'install') {
    let prev = Controller.enabled().name

    function close() {
        Modal.close()

        Controller.toggle(prev)
    }

    function abort() {
        close()

        cancel()
    }

    let html = $('<div class="grey-list"></div>')

    html.append($('<div class="grey-list__text"></div>').text(Lang.translate('grey_list_' + mode + '_text')))
    html.append(card(plugin, rule))

    styles()

    Modal.open({
        title: Lang.translate('grey_list_install_title'),
        html,
        size: 'medium',
        onBack: abort,
        buttons: [
            {
                name: Lang.translate('grey_list_install_cancel'),
                onSelect: abort
            },
            {
                name: Lang.translate('grey_list_' + mode + '_anyway'),
                onSelect: () => {
                    close()

                    install()
                }
            }
        ]
    })
}

/**
 * Знаходить увімкнені плагіни зі списку і показує їх у модалці з кнопками
 * «Вимкнути» / «Вилучити». Після закриття догружає ті, що лишились.
 * @returns {void}
 */
function show() {
    let found = []

    Plugins.get().filter(plugin => plugin.status == 1).forEach(plugin => {
        let rule = rules.find(item => match(plugin.url, item.url))

        if (rule) {
            found.push({ plugin, rule })
        }
    })

    if (!found.length) {
        release(found)

        return
    }

    let prev = Controller.enabled().name

    // Плагіни з Plugins.get() — ті самі об'єкти, що в Plugins._loaded, тож
    // зміна status + Plugins.save() зберігає їх так само, як екран «Розширення».
    function action(entry, remove) {
        if (remove) {
            Plugins.remove(entry.plugin)

            entry.removed = true
        }
        else {
            entry.plugin.status = 0

            Plugins.save()
        }

        Modal.update(render())
    }

    // Та сама кнопка, що й «Закрити» у футері модалки.
    function button(name, onEnter) {
        return $('<div class="modal__button selector"></div>').text(name).on('hover:enter', onEnter)
    }

    function render() {
        let html = $('<div class="grey-list"></div>')

        html.append($('<div class="grey-list__text"></div>').text(Lang.translate('grey_list_text')))

        found.forEach((entry, index) => {
            let plugin = entry.plugin
            let item   = card(plugin, entry.rule)

            if (entry.removed || plugin.status != 1) {
                let state = $('<div class="grey-list__state"></div>').text(Lang.translate(entry.removed ? 'grey_list_removed' : 'player_disabled'))

                item.append(state.toggleClass('grey-list__state--removed', Boolean(entry.removed)))
            }

            if (!entry.removed) {
                let actions = $('<div class="grey-list__actions"></div>')

                if (plugin.status == 1) {
                    actions.append(button(Lang.translate('extensions_disable'), () => action(entry, false)))
                }

                actions.append(button(Lang.translate('extensions_remove'), () => action(entry, true)))

                // Modal підкручує під верхній край саму кнопку, і назва/причина
                // картки (не selector) лишаються вище, куди фокусом не дістатись.
                // Тому крутимо до верху картки (для першої - до початку списку
                // з описом), а скрол Modal глушимо: два підряд смикали контент.
                // Наш обробник стоїть раніше за Modal.bind(), тож спрацьовує першим.
                let top = index ? item : html

                actions.find('.selector').on('hover:focus', e => {
                    e.stopImmediatePropagation()

                    Modal.scroll().update(top)
                })

                item.append(actions)
            }

            html.append(item)
        })

        // Футер у контенті, а не через buttons у Modal.open: Modal.update()
        // чистить увесь скрол разом із футером, і «Закрити» зникала.
        let footer = $('<div class="modal__footer"></div>')

        footer.append(button(Lang.translate('grey_list_close'), close))

        return html.append(footer)
    }

    function close() {
        Modal.close()

        Controller.toggle(prev)

        release(found)
    }

    styles()

    Modal.open({
        title: Lang.translate('grey_list_title'),
        html: render(),
        size: 'medium',
        onBack: close
    })
}

// Plugins.task збирає чергу Plugins.awaits() (з урахуванням blacklist), а
// Plugins.load вантажить її пізніше (src/app.js loadTask). Між ними й
// відкладаємо збіги зі списком. app.js кличе Plugins.task через об'єкт, тож
// підміна властивості спрацьовує.
let task = Plugins.task

Plugins.task = function (call) {
    // Вимкнено - список не тягнемо, rules лишаються порожніми: нічого не
    // відкладається, модалка при старті не відкриється.
    if (!enabled()) {
        return task(call)
    }

    task(() => {
        loadRules(list => {
            let awaits = Plugins.awaits()

            rules    = list
            deferred = awaits.filter(url => rules.some(rule => match(url, rule.url)))

            deferred.forEach(url => awaits.splice(awaits.indexOf(url), 1))

            call()
        })
    })
}

// Встановлення: «Розширення» (додати за адресою, каталог) і сторонні плагіни
// кличуть Plugins.add (Lampa.Plugins - той самий об'єкт). Збіг зі списком -
// спершу попередження, а сам add лише після згоди. Модалку відкриваємо в
// наступному тіку: main.js одразу після add робить line.toggle() і забрав
// би контролер у щойно відкритої модалки.
let add = Plugins.add

Plugins.add = function (plug) {
    // enabled() окремо: перемикач могли вимкнути вже після старту
    let rule = plug && enabled() && rules.find(item => match(plug.url, item.url))

    if (!rule) {
        return add.apply(this, arguments)
    }

    let args = arguments

    setTimeout(() => confirmInstall(plug, rule, () => add.apply(Plugins, args), () => revert(plug)))
}

// Картки «Розширень» малюються до питання: main.js вставляє нову картку у
// «Встановлені» ще до Plugins.add, а extension.js після add одразу ставить
// позначку «встановлено». Тож картка пам'ятає свій екземпляр, щоб після
// «Скасувати» її можна було прибрати.
let create = ExtensionItem.prototype.create

ExtensionItem.prototype.create = function () {
    create.apply(this, arguments)

    this.html.greyListItem = this
}

/**
 * Прибирає з екрана «Розширення» сліди скасованого встановлення.
 * @param {object} plug
 * @returns {void}
 */
function revert(plug) {
    $('.extensions__item').each(function () {
        let item = this.greyListItem

        if (!item) {
            return
        }

        // нова картка з main.js ділить з Plugins.add той самий об'єкт data
        if (item.data === plug) {
            item.destroy()
        }
        else if ((item.data.link || item.data.url) == plug.url && Plugins.loaded().indexOf(plug.url) < 0) {
            $(this).find('.extensions__item-included').addClass('hide')
        }
    })
}

// Увімкнення: меню картки (extension.js) ставить status = 1, зберігає й кличе
// Plugins.push - повз Plugins.add. Сам add кличе push усередині модуля, не
// через об'єкт, тож ця підміна його не зачіпає. «Скасувати» - вимикаємо назад.
let push = Plugins.push

Plugins.push = function (plug) {
    let rule = plug && plug.status == 1 && enabled() && rules.find(item => match(plug.url, item.url))

    // вже завантажений push і так пропустить
    if (!rule || Plugins.loaded().indexOf(plug.url) >= 0) {
        return push.apply(this, arguments)
    }

    let args = arguments

    setTimeout(() => confirmInstall(plug, rule, () => push.apply(Plugins, args), () => disable(plug), 'enable'))
}

/**
 * Вимикає плагін після скасованого увімкнення і оновлює його картку.
 * @param {object} plug
 * @returns {void}
 */
function disable(plug) {
    plug.status = 0

    Plugins.save()

    $('.extensions__item').each(function () {
        if (this.greyListItem && this.greyListItem.data === plug) {
            this.greyListItem.update()
        }
    })
}

/**
 * Чекаємо Lampa.Listener, після 'app ready' показуємо модалку.
 * @returns {void}
 */
function init() {
    if (!window.Lampa || !Lampa.Listener) {
        setTimeout(init, 100)
        return
    }

    SettingsApi.addParam({
        component: 'siaivo',
        param: {
            name: 'grey_list_enabled',
            type: 'trigger',
            default: true
        },
        field: {
            name: Lang.translate('grey_list_setting'),
            description: Lang.translate('grey_list_setting_descr')
        }
    })

    Lampa.Listener.follow('app', function (e) {
        if (e.type !== 'ready') {
            return
        }

        // Стартова активність вмикає 'content' вже після ready, і toContent()
        // закриває все відкрите - модалка зникала одразу. Вмикає двічі: при
        // відкритті, ще в завантаженні, і після build (slide.js start()). Тож
        // чекаємо перемикання вже без завантаження. Список на цей момент уже є:
        // Plugins.task дочекався його ще до старту.
        function toggled(t) {
            // activity--active слайд отримує вже після start(), тож дивимось лише на завантаження
            if (t.name == 'content' && !$('.activity--load').length) {
                Controller.listener.remove('toggle', toggled)

                // toggle() ще не завершив свій прохід
                setTimeout(show)
            }
        }

        Controller.listener.follow('toggle', toggled)
    })
}

init()
