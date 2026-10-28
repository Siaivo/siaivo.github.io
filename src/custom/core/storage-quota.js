import Storage from '../../core/storage/storage'
import Cache from '../../utils/cache'

// Коли localStorage переповнений, ядро (storage.js, QuotaExceededError) стирає ключ,
// що не вліз, і переносить нове значення в IndexedDB. Без відкритої IndexedDB (деякі ТВ
// і WebView) резерву нема: ключ зникав зовсім, а після перезавантаження — плагіни
// й налаштування. Тоді повертаємо старе значення: воно щойно займало те саме місце.
// Нове живе в пам'яті ядра до перезапуску, як і раніше.
// Storage.add і Storage.cache пишуть через внутрішній set() ядра, повз Storage.set, —
// обгортаємо і їх. У всіх трьох перший аргумент — назва ключа.

function guard(original){
    return function(name){
        if(Cache.db) {
            return original.apply(this, arguments)
        }

        let old = null

        try {
            old = window.localStorage.getItem(name)
        }
        catch(e) {}

        let result = original.apply(this, arguments)

        try {
            if(old !== null && window.localStorage.getItem(name) === null) {
                window.localStorage.setItem(name, old)
            }
        }
        catch(e) {}

        return result
    }
}

Storage.set   = guard(Storage.set)
Storage.add   = guard(Storage.add)
Storage.cache = guard(Storage.cache)
