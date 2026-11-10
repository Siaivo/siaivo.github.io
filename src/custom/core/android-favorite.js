import Storage from '../../core/storage/storage'

// Застосунок Android TV бере закладки для каналів лише з події Storage 'change'. Плагіни
// синхронізації (bookmark.js, sync.js) пишуть стягнуте з сервера як
// Storage.set('favorite', data, true) - nolisten, без події: закладки, що приїхали
// синхронізацією, до каналів не доходили. Такий запис передаємо застосунку самі.
// Саму подію не шлемо: на неї підписаний експорт синхронізації, вийшла б петля.

let wait  = 1000 // синхронізація пише пачками - передаємо раз
let timer = 0

// Те, що лежить зараз, а не те, що писали: за секунду очікування людина могла додати
// закладку звичайним шляхом, і застосунок уже має новіший стан.
function send(){
    try {
        let value = Storage.get('favorite', '{}')

        AndroidJS.storageChange(JSON.stringify({name: 'favorite', value}))

        // AndroidJS.updateChannel є з версії 28; через Android.updateChannel старий застосунок
        // отримав би повідомлення «оновіть» на кожен тип закладок
        if (typeof AndroidJS.updateChannel == 'function') {
            Object.keys(value).filter(type => type != 'card' && Array.isArray(value[type])).forEach(type => AndroidJS.updateChannel(type))
        }
    }
    catch(e) {
        console.log('Favorite', 'android channels error:', e.message)
    }
}

let original = Storage.set

Storage.set = function(name, value, nolisten){
    let result = original.apply(this, arguments)

    if (nolisten && name == 'favorite' && typeof AndroidJS !== 'undefined' && AndroidJS.storageChange) {
        clearTimeout(timer)

        timer = setTimeout(send, wait)
    }

    return result
}
