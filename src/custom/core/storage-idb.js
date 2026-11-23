import Storage from '../../core/storage/storage'
import Cache from '../../utils/cache'

// Закладки, історія й таймкоди великі, а localStorage має ~5 МБ. Тримаємо їх у резерві ядра —
// таблиці 'storage' IndexedDB, яку Storage.task завантажує в пам'ять до Timeline.init і
// Favorite.init (app.js), і Storage.get віддає значення звідти, коли ключа немає в localStorage.
// Ядро пише в резерв лише при переповненні; тут переносимо туди ці ключі завжди: ядро записало
// як звичайно — переносимо значення в IndexedDB і прибираємо з localStorage.
// Без IndexedDB (деякі ТВ і WebView) нічого не робимо — працює localStorage, як раніше.
// Лише з nuvio_use: плагіни синхронізації читають favorite з localStorage і без нього бачать
// порожні закладки. Без прапорця все лишається в localStorage, як в оригінальній Лампі; уже
// перенесене ядро дочитає з резерву і при першому записі поверне в localStorage.

const MATCH = /^(file_view(_.+)?|favorite|favorite_nuvio_.+|nuvio_(dirty|favdirty|favknown|ids)(_.+)?)$/

// Перенесені в цій сесії: внутрішній резерв ядра назовні не видно, а Storage.value і Storage.keys
// (з них бекап) інакше не побачили б значення до перезапуску. Лише імена: саме значення ядро
// вже тримає в пам'яті (Storage.get), друга копія великих файлів на ТВ зайва
const moved = {}

function current(name){
    let value = Storage.get(name)

    return value !== null && typeof value == 'object' ? JSON.stringify(value) : value + ''
}

// checked — у localStorage точно те, що ядро щойно записало (Storage.set без помилки):
// тоді не серіалізуємо великий файл ще раз заради порівняння
function move(name, checked){
    if(!Cache.db || !MATCH.test(name)) {
        return
    }

    let raw = null

    try {
        raw = window.localStorage.getItem(name)
    }
    catch(e) {}

    // у localStorage не те, що ядро щойно записало: setItem упав на квоті, і ядро саме поклало
    // новіше значення в резерв. Переносити старе не можна — воно затерло б новіше
    if(raw === null || (!checked && raw !== current(name))) {
        return
    }

    moved[name] = true

    Cache.rewriteData('storage', name, {key: name, value: raw}).then(() => {
        // поки писали, ядро могло записати новіше — тоді його перенесе наступний виклик
        if(window.localStorage.getItem(name) === raw) {
            window.localStorage.removeItem(name)
        }
    }).catch(e => {
        delete moved[name]

        console.log('StorageIDB', name, 'not moved:', e && e.message)
    })
}

function after(original){
    return function(name){
        let result = original.apply(this, arguments)

        move(name)

        return result
    }
}

// Той самий прапорець, що вмикає Nuvio (services/nuvio/index.js)
function enabled(){
    if(window.lampa_settings && window.lampa_settings.nuvio_use === true) {
        return true
    }

    return Storage.get('nuvio_use', false) === true
}

function install(){
    // Storage.set: помилку запису (квота, серіалізація) ядро повідомляє через callerror —
    // підміняємо його, щоб знати, чи лежить у localStorage свіже значення
    const set = Storage.set

    Storage.set = function(name, value, nolisten, callerror){
        let failed = false
        let result = set.call(this, name, value, nolisten, function(){
            failed = true

            if(callerror) {
                callerror.apply(this, arguments)
            }
        })

        if(!failed) {
            move(name, true)
        }

        return result
}

// Storage.add і Storage.cache пишуть через внутрішній set() ядра без callerror — там звіряємо значення
Storage.add   = after(Storage.add)
Storage.cache = after(Storage.cache)

const value = Storage.value

// Перенесене в цій сесії — новіше за резерв ядра: той лишається знімком на момент запуску
Storage.value = function(name){
    if(moved.hasOwnProperty(name) && window.localStorage.getItem(name) === null) {
        return current(name)
    }

    return value.apply(this, arguments)
}

const keys = Storage.keys

Storage.keys = function(){
    let result = keys.apply(this, arguments)

    return result.concat(Object.keys(moved).filter(name => result.indexOf(name) == -1))
}

// Очищення: повне стирає резерв, часткове ставить у localStorage порожнє значення, яке ядро
// при наступному старті поставить вище за резерв. В обох випадках копія тут більше не актуальна
Storage.listener.follow('clear', (e) => {
    Object.keys(moved).forEach((name) => {
        // часткове очищення ядро будує за своїми keys() — перенесених у цій сесії там немає.
        // Ставимо порожнє значення, як ядро для file_view*: при наступному старті воно переважить резерв
        if(!e.full && /^file_view(_|$)/.test(name)) {
            try {
                window.localStorage.setItem(name, '')
            }
            catch(err) {}
        }

        delete moved[name]
    })
})

}

// Те, що вже лежить у localStorage з минулих запусків, переносимо, щойно відкрилась IndexedDB
function migrate(){
    if(!Cache.db) {
        return
    }

    Object.keys(window.localStorage).forEach((name) => move(name))
}

function init(){
    if(!window.Lampa || !Lampa.Listener) {
        setTimeout(init, 50)
        return
    }

    // lampa_settings плагіни виставляють до app ready — прапорець читаємо там
    let start = () => {
        if(!enabled()) {
            return
        }

        install()
        migrate()
    }

    if(window.appready) {
        start()
    }
    else {
        Lampa.Listener.follow('app', (e) => {
            if(e.type == 'ready') {
                start()
            }
        })
    }
}

init()
