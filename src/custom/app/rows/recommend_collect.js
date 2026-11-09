import TMDB from '../../../core/tmdb/tmdb'
import Timer from '../../../core/timer'
import Storage from '../../../core/storage/storage'
import Cache from '../../../utils/cache'
import Reguest from '../../../utils/reguest'
import Utils from '../../../utils/utils'
import {hash} from './recommend_rank'
import {kind, key, delay, day_ms, today} from './recommend_signals'
import {source as animeSource, load as animeLoad} from './recommend_anime'
import '../../utils/db-get-many'

// Фоновий збір порад для стрічки «Рекомендуємо подивитись», як timetable для серіалів: стрічка
// лише читає зібране, без мережі й без очікування.
//
// Пул - [{card, good}] у порядку важливості, його веде recommend.js (start()). good - тайтл, до
// якого радимо (переглянуте, вподобане), інакше кинутий: його поради лише топлять картки.
// Поради до тайтлу від профілю не залежать, тож лежать у спільній базі за тайтлом: профілі з
// різною історією не витісняють одне одного, повернення в профіль - без запитів.
// Без IndexedDB (старі рушії) збір той самий, лише живе в пам'яті до перезапуску.

let tick_time   = 1000 * 10      // поки є незібране: один тайтл за тік
let stale_gap   = 1000 * 60      // застаріле оновлюємо не частіше
let busy_life   = 1000 * 60 * 2  // запит, чий колбек не прийшов (Api.clear() скидає їх мовчки)
let retry_min   = 1000 * 60      // після збою мережі: хвилина, далі вдвічі довше...
let retry_max   = 1000 * 60 * 60 // ...але не довше години
let timeout     = 10000          // як у TMDB.get; без нього Reguest чекає 30 с
let parallel    = 3              // термінова партія: на слабкому ТВ і через проксі більше заважають одне одному
let keep_min    = 10 // днів: поради TMDB до тайтлу змінюються тижнями, не днями
let keep_spread = 8  // + до стількох днів, свої для кожного тайтлу - щоб не застарівали всі разом
let keep_spare  = 1  // день: Hikka/Shikimori не відповіли, взяли TMDB - питаємо їх знову завтра
let forget      = 60 // днів без оновлення: тайтл пішов з усіх історій або профіль покинуто
let prefix      = 'recommend_'

let network  = new Reguest()
let answers  = {} // id -> {results, similar, spare, time}
let checked  = {} // id -> уже шукали в IndexedDB
let failed   = {} // id -> {at, n}: коли й скільки разів поспіль запит падав
let pending  = {} // id -> Promise поточного запиту
let make     = null
let changed  = null
let busy_at  = 0
let stale_at = 0

// Аніме, до якого радимо, питаємо в Hikka чи Shikimori - відповідь залежить від джерела.
function idOf(item){
    let from = item.good && Utils.isAnime(item.card) ? animeSource() : null

    return key(item.card) + (from ? '_' + from : '')
}

function life(id, answer){
    let days = answer.spare ? keep_spare : keep_min + Math.floor(keep_spread * hash(id))

    return day_ms * days
}

// null - помилка мережі, а не порожня відповідь. Власна межа: якщо колбек Reguest не прийде
// зовсім, тайтл інакше висів би в pending назавжди.
function send(url, body){
    let params = {timeout}

    if (body) {
        params.headers = {'Content-Type': 'application/json'}
    }

    let answer = new Promise(resolve => {
        network.silent(url, resolve, () => resolve(null), body || false, params)
    })

    return Promise.race([answer, delay(timeout * 2).then(() => null)])
}

// Сирий запит, а не TMDB.get: той пропускає відповідь через filterTitles, а він вирізає
// аніме - а воно потрібне на головній і в аніме. Кошики розкладає recommend.js.
function request(card, method){
    let url = TMDB.api(kind(card) + '/' + card.id + '/' + method + '?api_key=' + TMDB.key() + '&language=' + Storage.field('tmdb_lang'))

    return send(url).then(json => json && (Array.isArray(json.results) ? json.results : []))
}

// Для українських і нішевих тайтлів TMDB часто не має рекомендацій - тоді схожі. Кинутим
// схожі не потрібні: шумний штраф нічого не дає, а запит коштує. spare - аніме-джерело не
// відповіло (збій чи тайтлу там нема - не розрізнити) і взяли TMDB: живе добу, не тижні.
function ask(item){
    let card  = item.card
    let from  = item.good && Utils.isAnime(card) ? animeSource() : null
    // збій розбору відповіді джерела не має валити збір
    let anime = from ? animeLoad(card, kind(card), from, send).catch(() => null) : Promise.resolve(null)

    return anime.then(results => {
        if (results && results.length) {
            return {results, similar: false}
        }

        return request(card, 'recommendations').then(results => {
            if (!results) {
                return null
            }

            if (results.length || !item.good) {
                return {results, similar: false, spare: Boolean(from)}
            }

            return request(card, 'similar').then(similar => similar && {results: similar, similar: true, spare: Boolean(from)})
        })
    })
}

// Запитати й зберегти. Promise({results, similar, spare, time} | null), не відхиляється ніколи:
// інакше відхилений Promise лишився б у pending назавжди.
function fetch(item){
    let id = idOf(item)

    if (pending[id]) {
        return pending[id]
    }

    pending[id] = ask(item).catch(() => null).then(answer => {
        delete pending[id]

        if (!answer) {
            failed[id] = {at: Date.now(), n: failed[id] ? failed[id].n + 1 : 1}

            return null
        }

        delete failed[id]

        answer.time = Date.now()
        answers[id] = answer

        if (Cache.db) {
            Cache.rewriteData('other', prefix + id, {results: answer.results, similar: answer.similar, spare: answer.spare}).catch(() => {})
        }

        if (changed) {
            changed()
        }

        return answer
    })

    return pending[id]
}

// Зібране для списку [{card, good}], у тому ж порядку; null - ще не зібрано. Що нема в пам'яті,
// дочитуємо з IndexedDB однією транзакцією - на старті це весь пул разом.
function read(list){
    let ids     = list.map(idOf)
    let missing = Cache.db ? ids.filter(id => !answers[id] && !checked[id]) : []
    let base    = missing.length ? Cache.getMany('other', missing.map(id => prefix + id), true) : Promise.resolve({})

    return base.then(found => {
        missing.forEach(id => {
            let row = found[prefix + id]

            checked[id] = true

            if (row && row.value && !answers[id]) {
                answers[id] = {results: row.value.results || [], similar: Boolean(row.value.similar), spare: Boolean(row.value.spare), time: row.time}
            }
        })

        return ids.map(id => answers[id] || null)
    })
}

// Після збою: хвилина, дві, чотири... до години. Мережа могла лише кліпнути (ТВ увімкнули
// раніше за Wi-Fi) - тоді стрічка оживе за хвилину, а не за годину.
function waiting(id){
    let fail = failed[id]

    return Boolean(fail) && Date.now() - fail.at < Math.min(retry_min * Math.pow(2, fail.n - 1), retry_max)
}

// Термінова партія: з list - те, чого ще нема, по parallel одночасно. Промахи мережі не чекаємо
// повторно - їх підбере фон.
function prefetch(list){
    return read(list).then(found => {
        let todo = list.filter((item, i) => !found[i] && !waiting(idOf(item)))
        let next = 0

        function lane(){
            if (next >= todo.length) {
                return Promise.resolve()
            }

            return fetch(todo[next++]).then(lane)
        }

        let lanes = []

        for (let i = 0; i < Math.min(parallel, todo.length); i++) {
            lanes.push(lane())
        }

        return Promise.all(lanes)
    })
}

// Спершу те, чого ще нема зовсім (у порядку пулу - найважливіше першим), потім застаріле, але
// не частіше stale_gap: воно лише освіжає вже робочу стрічку.
function due(list, found){
    let ids   = list.map(idOf)
    let index = found.findIndex((answer, i) => !answer && !waiting(ids[i]))

    if (index < 0 && Date.now() - stale_at > stale_gap) {
        index = found.findIndex((answer, i) => answer && Date.now() - answer.time > life(ids[i], answer) && !waiting(ids[i]))

        if (index >= 0) {
            stale_at = Date.now()
        }
    }

    return index
}

// Один тайтл за тік і не під час перегляду: на слабкому ТВ ривок у відео помітніший за все.
function tick(){
    if (Date.now() - busy_at < busy_life || Lampa.Player.opened()) {
        return
    }

    let list = make()

    if (!list.length) {
        return
    }

    busy_at = Date.now()

    // пул міг змінитись, поки читали базу - працюємо зі знімком
    read(list).then(found => {
        let index = due(list, found)

        if (index < 0) {
            busy_at = 0

            return
        }

        fetch(list[index]).then(() => busy_at = 0)
    })

    cleanup()
}

// Раз на добу прибираємо давно не оновлене: усе живе оновлюється кожні keep_min..+keep_spread днів.
function cleanup(){
    let day = today(Date.now())

    if (!Cache.db || Storage.get('recommend_cleanup', 0) == day) {
        return
    }

    Storage.set('recommend_cleanup', day)

    try {
        let border = Date.now() - forget * day_ms
        let store  = Cache.db.transaction(['other'], 'readwrite').objectStore('other')
        let cursor = store.openCursor(IDBKeyRange.bound(prefix, prefix + String.fromCharCode(0xffff)))

        cursor.onsuccess = () => {
            let row = cursor.result

            if (!row) {
                return
            }

            if (row.value && row.value.time < border) {
                row.delete()
            }

            row.continue()
        }
    }
    catch (e) {
        console.log('Recomendations', 'cleanup error:', e)
    }
}

// pool_maker() синхронно повертає поточний пул [{card, good}]; on_change() - після кожної нової
// відповіді (recommend.js сам збирає їх у один перерахунок).
function start(pool_maker, on_change){
    make    = pool_maker
    changed = on_change

    Timer.add(tick_time, tick)
}

export default {
    start,
    read,
    prefetch
}
