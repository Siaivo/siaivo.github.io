// Двостороння синхронізація таймкодів і позначок «переглянуто» з Nuvio.
//
// Локальна правда — файл Timeline (file_view). Favorite.viewed не чіпаємо.
// Віддалене пишемо пачкою в обхід Timeline.update: змінили об'єкт файлу → один Storage.set →
// Timeline.read(). Подія update при цьому не виникає, тож відлуння в Nuvio немає.
// Локальні зміни ловимо з Timeline.listener 'update' у множину «брудних» хешів і відправляємо
// актуальний стан запису (сам Nuvio відкидає старіший last_watched).
import Storage from '../../../core/storage/storage'
import SettingsApi from '../../../interaction/settings/api'
import Lang from '../../../core/lang'
import Noty from '../../../interaction/noty'
import Select from '../../../interaction/select'
import Controller from '../../../core/controller'
import Api from './api'
import Auth from './auth'
import Profiles from './profiles'
import Settings from './settings'
import Keys from './keys'

var PAGE = 900
var CHUNK = 100

var chain = Promise.resolve()
var queued = false
var pulled = false
var deb = null
var cards = {} // cardKey -> картка TMDB, знайдена при pull (для історії)
var ids = null // content_id -> [cardKey, original title], кеш nuvio_ids
var miss = {} // хеші, які не вдалося впізнати (на сесію)
var want = {p: false, f: false} // що потрібно наступному циклу: p — прогрес, f — закладки
var okP = 0 // коли востаннє вдався pull прогресу
var lastP = 0 // коли востаннє запустили pull прогресу
var lastF = 0 // коли востаннє тягнули закладки
var fails = 0
var failUntil = 0 // після помилок не тягнемо до цього часу (крім пробудження)
var changes = 0 // скільки віддалених змін застосовано в поточному циклі

function timeline(){
    return Lampa.Timeline
}

function profile(){
    return parseInt(Profiles.resolveActive(), 10) || 0
}

function scope(){
    var email = (Storage.get('nuvio_email', '') + '').toLowerCase()

    return Lampa.Utils.hash(Api.base() + '|' + email) + '_' + profile()
}

function cubSync(){
    try {
        return Boolean(Lampa.Account.Permit.sync)
    }
    catch (e) {
        return false
    }
}

function ok(){
    return Boolean(Storage.get('nuvio_enable', false)) && Boolean(Api.tokens().access_token) && !cubSync() && profile() >= 1
}

function viewed(){
    return Storage.get(timeline().filename(), {})
}

function getDirty(sc){
    return Storage.get('nuvio_dirty_' + sc, {}) || {}
}

function setDirty(sc, dirty){
    Storage.set('nuvio_dirty_' + sc, dirty, true)
}

function getCursor(sc){
    var c = Storage.get('nuvio_cursor_' + sc, {})

    return c && typeof c.p == 'number' ? c : null
}

function rpc(name, args){
    args.p_profile_id = profile()

    return Api.rpc(name, args)
}

function writeArgs(args){
    args.p_origin_client_id = Auth.clientId()

    return args
}

// Одна операція за раз: pull і flush ніколи не йдуть паралельно
function run(fn){
    chain = chain.then(fn, fn).catch(function(e){
        console.log('Nuvio', 'sync error', e && e.status ? e.status : e)
        Settings.setStatus(e && e.status == 401 ? 'error' : 'offline')

        // наростаючий відступ: 15 с, 30, 60 … до 5 хв
        fails++
        failUntil = Date.now() + Math.min(15000 * Math.pow(2, fails - 1), 5 * 60 * 1000)
    })

    return chain
}

// Цикл синхронізації. parts: {p, f}; запити, що прийшли, поки цикл у черзі, зливаються в один
function sync(parts){
    parts = parts || {p: true, f: true}

    want.p = want.p || Boolean(parts.p)
    want.f = want.f || Boolean(parts.f)

    if (queued) {
        return chain
    }

    queued = true

    return run(function(){
        var need = want

        queued = false
        want = {p: false, f: false}

        if (!ok()) {
            Settings.setStatus(cubSync() ? 'paused' : 'off')
            return
        }

        Settings.setStatus('syncing')

        migrate()
        switchScope()

        changes = 0

        var fav = need.f || Object.keys(favGet('nuvio_favdirty_', scope())).length > 0

        return (need.p || !pulled ? pull() : Promise.resolve()).then(flush).then(function(){
            if (fav) {
                lastF = Date.now()

                return favSync()
            }
        }).then(function(){
            fails = 0
            failUntil = 0

            Settings.setStatus('ok')

            if (changes) {
                refreshScreens()
            }
        })
    })
}

// ---------- TMDB ----------

function tmdb(path){
    return new Promise(function(resolve, reject){
        var net = new Lampa.Reguest()
        var lang = Storage.field('tmdb_lang') || 'en'
        var url = Lampa.TMDB.api(path + (path.indexOf('?') > -1 ? '&' : '?') + 'api_key=' + Lampa.TMDB.key() + '&language=' + lang)

        net.timeout(10000)
        net.silent(url, resolve, function(xhr){
            if (xhr && xhr.status == 404) {
                resolve(null)
            }
            else {
                reject(xhr || {status: 0})
            }
        })
    })
}

// Виконати fn для кожного елемента, не більше 4 запитів одночасно
function pool(list, fn){
    var i = 0

    function next(){
        if (i >= list.length) {
            return Promise.resolve()
        }

        var item = list[i++]

        return fn(item).then(next)
    }

    return Promise.all([next(), next(), next(), next()])
}

function idCache(){
    if (!ids) {
        ids = Storage.get('nuvio_ids', {}) || {}
    }

    return ids
}

function remember(cid, cardKey, title){
    idCache()[cid] = [cardKey, title || '']
    Storage.set('nuvio_ids', ids, true)
}

function cidOf(cardKey){
    var cache = idCache()
    var found = null

    for (var cid in cache) {
        if (cache[cid][0] == cardKey && (!found || Keys.idKind(cid) == 'imdb')) {
            found = cid
        }
    }

    return found
}

// cardKey -> content_id. Без IMDb лишається tmdb:N (лише в пам'яті: IMDb може з'явитися пізніше)
function resolveLocal(cardKeys){
    var out = {}

    return pool(cardKeys, function(cardKey){
        var cached = cidOf(cardKey)

        if (cached) {
            out[cardKey] = cached
            return Promise.resolve()
        }

        var card = Keys.parseCard(cardKey)

        return tmdb(card.type + '/' + card.id + '/external_ids').then(function(data){
            if (data && data.imdb_id) {
                remember(data.imdb_id, cardKey, '')
                out[cardKey] = data.imdb_id
            }
            else {
                out[cardKey] = 'tmdb:' + card.id
            }
        })
    }).then(function(){
        return out
    })
}

// content_id -> {cardKey, type, title}. Мережева помилка відхиляє весь pull, курсор не рухається
function resolveRemote(list){
    var out = {}
    var cache = idCache()

    return pool(list, function(ev){
        var cid = ev.cid

        if (out[cid]) {
            return Promise.resolve()
        }

        if (cache[cid] && cache[cid][1]) {
            out[cid] = {cardKey: cache[cid][0], type: Keys.parseCard(cache[cid][0]).type, title: cache[cid][1]}
            return Promise.resolve()
        }

        var tv = ev.series
        var request

        if (Keys.idKind(cid) == 'imdb') {
            request = tmdb('find/' + cid + '?external_source=imdb_id').then(function(data){
                data = data || {}

                var tvs = data.tv_results || []
                var movies = data.movie_results || []

                if (tv && tvs.length) {
                    return {type: 'tv', card: tvs[0]}
                }

                if (!tv && movies.length) {
                    return {type: 'movie', card: movies[0]}
                }

                return null
            })
        }
        else {
            var type = tv ? 'tv' : 'movie'

            request = tmdb(type + '/' + cid.split(':')[1]).then(function(card){
                return card ? {type: type, card: card} : null
            })
        }

        return request.then(function(found){
            if (!found || !found.card.id) {
                return
            }

            var cardKey = found.type + '_' + found.card.id
            var title = found.type == 'tv' ? (found.card.original_name || found.card.name) : (found.card.original_title || found.card.title)

            found.card.source = 'tmdb'
            cards[cardKey] = found.card

            remember(cid, cardKey, title)

            out[cid] = {cardKey: cardKey, type: found.type, title: title}
        })
    }).then(function(){
        return out
    })
}

// ---------- pull ----------

function pullDelta(name, since){
    var all = []

    function page(from){
        return rpc(name, {p_since_event_id: from, p_limit: PAGE}).then(function(rows){
            rows = rows || []
            all = all.concat(rows)

            if (rows.length >= PAGE) {
                return page(maxEvent(rows, from))
            }

            return all
        })
    }

    return page(since)
}

function maxEvent(rows, from){
    return rows.reduce(function(max, row){
        return Math.max(max, parseInt(row.event_id, 10) || 0)
    }, from)
}

// Дельта — історія подій. Лишаємо останню подію на кожен віддалений ключ
function collapse(rows, kind){
    var last = {}

    rows.slice().sort(function(a, b){
        return a.event_id - b.event_id
    }).forEach(function(row){
        if (!Keys.idKind(row.content_id)) {
            return
        }

        var series = row.content_type != 'movie'

        if (series && (row.season === null || row.episode === null || typeof row.season == 'undefined')) {
            return
        }

        var key = kind == 'p' ? row.progress_key : [row.content_id, row.season, row.episode].join('|')

        last[key] = {
            kind: kind,
            op: row.operation == 'delete' ? 'delete' : 'upsert',
            ts: (kind == 'p' ? row.last_watched : row.watched_at) || 0,
            cid: row.content_id + '',
            series: series,
            season: series ? row.season : undefined,
            episode: series ? row.episode : undefined,
            row: row
        }
    })

    return Object.keys(last).map(function(key){
        return last[key]
    })
}

function pull(){
    var sc = scope()
    var cursor = getCursor(sc)
    var since = cursor || {p: 0, w: 0}

    return Promise.all([
        pullDelta('sync_pull_watch_progress_delta', since.p),
        pullDelta('sync_pull_watched_items_delta', since.w)
    ]).then(function(res){
        var events = collapse(res[0], 'p').concat(collapse(res[1], 'w'))

        return resolveRemote(events).then(function(found){
            if (sc != scope()) {
                return
            }

            var result = apply(events, found, sc)

            if (!result) {
                return
            }

            Storage.set('nuvio_cursor_' + sc, {p: maxEvent(res[0], since.p), w: maxEvent(res[1], since.w)}, true)

            if (!cursor) {
                markInitial(sc, result.touched)
            }

            pulled = true
            okP = Date.now()

            return touchHistory(result.applied)
        })
    })
}

// Застосувати події до file_view. Повертає null, якщо не вдалося записати (квота)
function apply(events, found, sc){
    var name = timeline().filename()
    var data = viewed()
    var dirty = getDirty(sc)
    var index = {}
    var groups = {}
    var applied = []
    var touched = {}
    var changed = false

    for (var hash in data) {
        var key = Keys.localKey(data[hash])

        if (key && (!index[key] || (data[index[key]].updated || 0) <= (data[hash].updated || 0))) {
            index[key] = hash
        }
    }

    events.forEach(function(ev){
        var id = found[ev.cid]

        if (!id) {
            return
        }

        ev.card = id.cardKey
        ev.type = id.type
        ev.title = id.title
        ev.key = Keys.localKey({card: ev.card, season: ev.season, episode: ev.episode})

        if (ev.key) {
            groups[ev.key] = (groups[ev.key] || []).concat(ev)
        }
    })

    Object.keys(groups).forEach(function(key){
        var list = groups[key]
        var upserts = list.filter(function(ev){
            return ev.op == 'upsert'
        })
        var first = list[0]
        var hash = index[key] || Keys.canonHash(first.type, first.title, first.season, first.episode)
        var local = typeof data[hash] == 'object' ? data[hash] : null

        // є оновлення — беремо найсвіжіше, інакше видалення
        if (upserts.length) {
            var ev = upserts.sort(function(a, b){
                return b.ts - a.ts
            })[0]

            if (!Keys.decide(local, ev)) {
                return
            }

            var road = ev.kind == 'p' ? Keys.roadFromProgress(ev.row) : {
                percent: 100,
                time: local && local.duration ? local.duration : 0,
                duration: local && local.duration ? local.duration : 0,
                updated: ev.ts
            }

            if (!road) {
                return
            }

            road.card = ev.card

            if (ev.type == 'tv') {
                road.season = ev.season
                road.episode = ev.episode
            }

            data[hash] = Object.assign(local || {profile: 0}, road)
            applied.push(ev)
        }
        else {
            var hit = list.some(function(ev){
                return Keys.decide(local, ev)
            })

            if (!hit) {
                return
            }

            delete data[hash]
        }

        delete dirty[hash]
        touched[hash] = true
        changed = true
    })

    if (!changed) {
        return {applied: applied, touched: touched}
    }

    var failed = false

    Storage.set(name, data, true, function(){
        failed = true
    })

    if (failed) {
        console.log('Nuvio', 'file_view is not saved, quota')
        return null
    }

    setDirty(sc, dirty)

    timeline().read()

    changes += Object.keys(touched).length

    patchViews(touched, data)

    // read() оновлює картки, а відкритий список серій слухає лише 'update' (mark.js).
    // Шлемо його напряму в Lampa.Listener: Timeline.listener не зачіпається, відлуння немає
    var hashes = Object.keys(touched)

    if (hashes.length <= 50) {
        hashes.forEach(function(hash){
            Lampa.Listener.send('state:changed', {target: 'timeline', reason: 'update', data: {hash: hash, road: data[hash] || {percent: 0, time: 0, duration: 0}}})
        })
    }

    return {applied: applied, touched: touched}
}

// Перше підключення профілю: віддаємо в Nuvio локальні записи, яких там немає або вони новіші.
// Записи без часу (updated 0) не віддаємо: чесного часу в них немає
function markInitial(sc, touched){
    var data = viewed()
    var dirty = getDirty(sc)

    for (var hash in data) {
        var road = data[hash]

        if (!touched[hash] && road && road.percent > 0 && road.updated > 0 && Keys.localKey(road)) {
            dirty[hash] = 1
        }
    }

    setDirty(sc, dirty)
}

// Підтягнутий прогрес має бути видно в «Продовжити» та історії: вони будуються з Favorite history
function touchHistory(applied){
    var last = {}

    applied.forEach(function(ev){
        if (!last[ev.card] || last[ev.card].ts < ev.ts) {
            last[ev.card] = ev
        }
    })

    var list = Object.keys(last).map(function(card){
        return last[card]
    }).sort(function(a, b){
        return a.ts - b.ts
    }).slice(-30)

    var Favorite = Lampa.Favorite
    var saved = Favorite.full().card || []
    var history = Favorite.full().history || []

    // порядок історії між клієнтами Lampa задає синхронізований список закладок,
    // тут лише додаємо те, чого в історії ще немає (прогрес з нативного Nuvio)
    list = list.filter(function(ev){
        return history.indexOf(Keys.parseCard(ev.card).id) == -1
    })

    return pool(list, function(ev){
        if (cards[ev.card]) {
            return Promise.resolve()
        }

        var card = Keys.parseCard(ev.card)
        var found = saved.filter(function(c){
            return c.id == card.id && Boolean(c.original_name) == (card.type == 'tv')
        })[0]

        if (found) {
            cards[ev.card] = found
            return Promise.resolve()
        }

        return tmdb(card.type + '/' + card.id).then(function(data){
            if (data && data.id) {
                data.source = 'tmdb'
                cards[ev.card] = data
            }
        }).catch(function(){})
    }).then(function(){
        // по зростанню часу: останній доданий опиняється першим
        list.forEach(function(ev){
            if (cards[ev.card]) {
                Favorite.add('history', cards[ev.card], 100)
            }
        })
    })
}

// ---------- push ----------

function flush(){
    // до першого pull не відправляємо, але курсор з минулої сесії теж підходить:
    // інакше при стабільній помилці pull за всю сесію нічого б не пішло
    if (!ok() || (!pulled && !getCursor(scope()))) {
        return
    }

    var sc = scope()
    var dirty = getDirty(sc)
    var data = viewed()
    var list = []

    Object.keys(dirty).forEach(function(hash){
        var road = data[hash]

        if (road && typeof road == 'object' && Keys.localKey(road)) {
            list.push({hash: hash, road: road, sent: road.updated})
        }
        else {
            delete dirty[hash]
        }
    })

    setDirty(sc, dirty)

    if (!list.length) {
        return
    }

    var keys = list.map(function(it){
        return it.road.card
    }).filter(function(card, i, all){
        return all.indexOf(card) == i
    })

    return resolveLocal(keys).then(function(cids){
        var progress = []
        var watched = []
        var delProgress = []
        var delWatched = []
        var done = []

        list.forEach(function(it){
            var cid = cids[it.road.card]

            if (!cid) {
                return
            }

            var remote = Keys.toRemote(it.road, cid)
            var kind = Keys.pushKind(it.road)

            if (kind == 'progress') {
                progress.push(Keys.progressEntry(it.road, remote))
            }
            else if (kind == 'watched') {
                watched.push({
                    content_id: cid,
                    content_type: remote.content_type,
                    title: (idCache()[cid] || [])[1] || '',
                    season: remote.season === undefined ? null : remote.season,
                    episode: remote.episode === undefined ? null : remote.episode,
                    watched_at: it.road.updated
                })
            }
            else if (kind == 'delete') {
                var key = {content_id: cid}

                if (remote.season !== undefined) {
                    key.season = remote.season
                    key.episode = remote.episode
                }

                delProgress.push(remote.progress_key)
                delWatched.push(key)
            }

            done.push(it)
        })

        return send('sync_delete_watch_progress', 'p_keys', delProgress)
            .then(function(){
                return send('sync_delete_watched_items', 'p_keys', delWatched)
            })
            .then(function(){
                return send('sync_push_watch_progress', 'p_entries', progress)
            })
            .then(function(){
                return send('sync_push_watched_items', 'p_items', watched)
            })
            .then(function(){
                var now = getDirty(sc)
                var current = viewed()

                // запис змінився під час відправки — лишаємо брудним
                done.forEach(function(it){
                    if (!current[it.hash] || current[it.hash].updated === it.sent) {
                        delete now[it.hash]
                    }
                })

                setDirty(sc, now)
            })
    })
}

// Пачками по CHUNK. Відмова сервера (4xx, крім авторизації й ліміту) — пачку пропускаємо,
// інакше вона блокувала б чергу назавжди; мережа — пробуємо наступного разу
function send(name, field, items){
    var chunks = []

    for (var i = 0; i < items.length; i += CHUNK) {
        chunks.push(items.slice(i, i + CHUNK))
    }

    return chunks.reduce(function(prev, part){
        return prev.then(function(){
            var args = {}

            args[field] = part

            return rpc(name, writeArgs(args)).catch(function(e){
                var status = e && e.status

                if (status >= 400 && status < 500 && status != 401 && status != 408 && status != 429) {
                    console.log('Nuvio', name, 'rejected', status, part)
                    return
                }

                throw e
            })
        })
    }, Promise.resolve())
}

// Відкласти файл поточного профілю й підставити збережений файл наступного.
// Не вмістилось — не паркуємо й скидаємо курсори: наступного разу профіль повністю підтягнеться з Nuvio
function park(name, prefix, current, next){
    var failed = false

    Storage.set(prefix + current, Storage.value(name, '{}'), true, function(){
        failed = true
    })

    if (failed) {
        Storage.set('nuvio_cursor_' + current, {}, true)
        Storage.set('nuvio_favknown_' + current, {}, true)
        Storage.set('nuvio_favinit_' + current, false, true)
    }

    var data = {}

    try {
        data = JSON.parse(Storage.value(prefix + next, '{}')) || {}
    }
    catch (e) {}

    Storage.set(name, data, true)
}

// ---------- bookmarks ----------
//
// Як у CUB: категорії закладок (і історія) — списки, що синхронізуються між клієнтами Lampa,
// таймкоди при цьому не чіпаються. Нативний Nuvio таких списків не має, тож тримаємо їх в
// окремому документі профілю (profile_settings_blobs, platform 'lampa'):
// {v, items: {'type|id': {t} | {t, del}}, cards: {id: card}}.
// Запис захищений: сервер відхиляє його (409), якщо документ змінив інший клієнт, — тоді
// читаємо заново, зливаємо поелементно за часом і пробуємо ще раз.

var FAV_TYPES = ['like', 'wath', 'book', 'history', 'look', 'viewed', 'scheduled', 'continued', 'thrown']
var FAV_TTL = 60 * 24 * 3600 * 1000 // скільки тримати позначки видалення
var favApplying = false
var favDeb = null
var favLast = 0

// Час зміни, що строго зростає: кілька змін за одну мілісекунду мають зберегти свій порядок
function favNow(){
    favLast = Math.max(Date.now(), favLast + 1)

    return favLast
}

function favKey(type, id){
    return type + '|' + id
}

function favGet(name, sc){
    return Storage.get(name + sc, {}) || {}
}

function favSet(name, sc, value){
    Storage.set(name + sc, value, true)
}

function favId(id){
    return /^\d+$/.test(id) ? parseInt(id, 10) : id
}

function onFavorite(method){
    return function(e){
        if (!ok() || favApplying || !e || !e.card || !e.card.id || FAV_TYPES.indexOf(e.where) == -1) {
            return
        }

        // 'remove' з method 'card' — прибирання даних картки, не дія користувача
        if (method == 'remove' && e.method != 'id') {
            return
        }

        var sc = scope()
        var key = favKey(e.where, e.card.id)
        var known = favGet('nuvio_favknown_', sc)
        var dirty = favGet('nuvio_favdirty_', sc)

        // 'add' для картки, що вже в списку, — лише оновлення її даних (Favorite.refresh), не рух у списку.
        // Підйом картки нагору приходить окремою подією 'added'
        if (method == 'add' && known[key] > 0 && !dirty[key]) {
            return
        }

        dirty[key] = method == 'remove' ? {t: favNow(), del: 1} : {t: favNow(), c: Lampa.Utils.clearCard(e.card)}

        favSet('nuvio_favdirty_', sc, dirty)

        clearTimeout(favDeb)
        favDeb = setTimeout(function(){
            run(favSync)
        }, 300)
    }
}

// Застосувати віддалені зміни, новіші за ті, що ми вже бачили. За зростанням часу:
// Favorite.add ставить картку на початок, тож найсвіжіша опиниться першою
function favApply(items, cards, known, dirty){
    var Favorite = Lampa.Favorite
    var list = Object.keys(items).filter(function(key){
        return !dirty[key] && Math.abs(known[key] || 0) < items[key].t
    }).sort(function(a, b){
        return items[a].t - items[b].t
    })

    favApplying = true

    try {
        list.forEach(function(key){
            var type = key.split('|')[0]
            var id = key.slice(type.length + 1)
            var item = items[key]

            if (FAV_TYPES.indexOf(type) == -1) {
                return
            }

            if (item.del) {
                Favorite.remove(type, {id: favId(id)})
            }
            else if (cards[id]) {
                Favorite.add(type, cards[id])
            }
            else {
                return
            }

            known[key] = item.del ? -item.t : item.t

            changes++
        })
    }
    finally {
        favApplying = false
    }
}

// Перше підключення профілю: локальні закладки, яких немає в Nuvio, додаємо із збереженням порядку
function favSeed(items, dirty){
    var data = Lampa.Favorite.full()
    var now = Date.now()

    FAV_TYPES.forEach(function(type){
        (data[type] || []).forEach(function(id, i){
            var key = favKey(type, id)
            var card = data.card.filter(function(c){
                return c.id == id
            })[0]

            if (items[key] || dirty[key] || !card) {
                return
            }

            dirty[key] = {t: now - i, c: Lampa.Utils.clearCard(card)}
        })
    })
}

function favPrune(items, cards){
    var used = {}
    var old = Date.now() - FAV_TTL

    Object.keys(items).forEach(function(key){
        if (items[key].del && items[key].t < old) {
            delete items[key]
        }
        else if (!items[key].del) {
            used[key.slice(key.indexOf('|') + 1)] = true
        }
    })

    Object.keys(cards).forEach(function(id){
        if (!used[id]) {
            delete cards[id]
        }
    })
}

function favSync(attempt){
    attempt = typeof attempt == 'number' ? attempt : 0

    if (!ok()) {
        return
    }

    var sc = scope()

    return rpc('sync_pull_profile_settings_blob', {p_platform: 'lampa'}).then(function(rows){
        if (sc != scope()) {
            return
        }

        var row = rows && rows[0] ? rows[0] : {}
        var doc = row.settings_json && typeof row.settings_json == 'object' ? row.settings_json : {}
        var items = doc.items || {}
        var cards = doc.cards || {}
        var known = favGet('nuvio_favknown_', sc)
        var dirty = favGet('nuvio_favdirty_', sc)

        favApply(items, cards, known, dirty)

        if (!Storage.get('nuvio_favinit_' + sc, false)) {
            favSeed(items, dirty)
        }

        favSet('nuvio_favknown_', sc, known)

        var keys = Object.keys(dirty)

        if (!keys.length) {
            Storage.set('nuvio_favinit_' + sc, true, true)
            return
        }

        keys.forEach(function(key){
            var change = dirty[key]

            if (items[key] && items[key].t >= change.t) {
                return
            }

            if (change.del) {
                items[key] = {t: change.t, del: 1}
            }
            else {
                items[key] = {t: change.t}
                cards[key.slice(key.indexOf('|') + 1)] = change.c
            }
        })

        favPrune(items, cards)

        return rpc('sync_push_profile_settings_blob_guarded', {
            p_platform: 'lampa',
            p_settings_json: {v: 1, items: items, cards: cards},
            p_expected_updated_at: row.updated_at || null
        }).then(function(){
            var now = favGet('nuvio_favdirty_', sc)

            keys.forEach(function(key){
                if (!items[key]) {
                    return
                }

                known[key] = items[key].del ? -items[key].t : items[key].t

                // за час відправки могла з'явитися новіша зміна — лишаємо її
                if (now[key] && now[key].t <= dirty[key].t) {
                    delete now[key]
                }
            })

            favSet('nuvio_favknown_', sc, known)
            favSet('nuvio_favdirty_', sc, now)
            Storage.set('nuvio_favinit_' + sc, true, true)
        })
    }).catch(function(e){
        // документ змінив інший клієнт між читанням і записом
        if (e && e.status == 409 && attempt < 3) {
            return favSync(attempt + 1)
        }

        throw e
    })
}

// ---------- local changes ----------

function onUpdate(e){
    if (!ok() || !e || !e.data || !e.data.road) {
        return
    }

    var hash = e.data.hash
    var road = e.data.road

    // плеер закрили, нічого не подивившись: ядро перезаписало ту саму позицію зі свіжим часом.
    // Такий штамп у Nuvio затер би новіший прогрес з іншого пристрою — повертаємо старий час
    if (snap && snap.hash == hash && Math.round(snap.time) == Math.round(road.time) && snap.percent == road.percent) {
        road.updated = snap.updated
        Storage.set(timeline().filename(), viewed(), true)
        return
    }

    if (!Keys.localKey(road) && !identify(hash, road)) {
        return
    }

    var sc = scope()
    var dirty = getDirty(sc)

    dirty[hash] = 1
    setDirty(sc, dirty)

    clearTimeout(deb)
    deb = setTimeout(function(){
        run(flush)
    }, 300)
}

// Запис без прив'язки до картки (онлайн-плагіни, що кличуть Timeline.view(hash) без meta):
// шукаємо, якій серії відкритої картки відповідає хеш, і ставимо прив'язку
function identify(hash, road){
    if (miss[hash]) {
        return false
    }

    var activity = Lampa.Activity.active() || {}
    var card = activity.card || activity.movie
    var link = card ? match(hash, card) : null

    if (!link) {
        miss[hash] = true
        return false
    }

    road.card = link.card

    if (link.season !== undefined) {
        road.season = link.season
        road.episode = link.episode
    }

    Storage.set(timeline().filename(), viewed(), true)

    return Boolean(Keys.localKey(road))
}

function match(hash, card){
    var hashFn = Lampa.Utils.hash
    var link = timeline().link
    var titles = [card.original_name, card.original_title].filter(Boolean)

    hash = hash + ''

    if (!card.original_name) {
        return titles.length && hashFn(titles[0]) + '' == hash ? link(card) : null
    }

    for (var t = 0; t < titles.length; t++) {
        for (var s = 0; s <= 50; s++) {
            for (var e = 1; e <= 200; e++) {
                // ядро ставить ':' для сезонів > 10, онлайн-плагіни — ні
                if (hashFn([s, s > 10 ? ':' : '', e, titles[t]].join('')) + '' == hash || hashFn([s, e, titles[t]].join('')) + '' == hash) {
                    return link(card, s, e)
                }
            }
        }
    }

    return null
}

// ---------- profiles ----------

// Профілі Nuvio ділять один file_view: при зміні профілю паркуємо його й підставляємо збережений
function switchScope(){
    var next = scope()
    var current = Storage.get('nuvio_scope', '') + ''

    if (current == next) {
        return
    }

    pulled = false

    // перше ввімкнення: локальні дані зливаються в перший профіль
    if (current) {
        park(timeline().filename(), 'file_view_nuvio_', current, next)
        park('favorite', 'favorite_nuvio_', current, next)

        timeline().read()
        Lampa.Favorite.read()
    }

    Storage.set('nuvio_scope', next, true)
}

// ---------- migration ----------

// Прибрати локальний слід попередньої реалізації (маркери й записи під хешем progress_key)
function migrate(){
    if (Storage.get('nuvio_v2', false)) {
        return
    }

    var data = viewed()
    var hashFn = Lampa.Utils.hash
    var changed = false

    for (var hash in data) {
        var road = data[hash]

        if (!road || typeof road != 'object') {
            continue
        }

        var card = Keys.parseCard(road.card)
        var old = card ? [hashFn(card.id + '') + '', hashFn(card.id + '_s' + road.season + 'e' + road.episode) + ''] : []

        if (road.nuvio_marker || old.indexOf(hash + '') > -1) {
            delete data[hash]
            changed = true
        }
    }

    if (changed) {
        Storage.set(timeline().filename(), data, true)
        timeline().read()
    }

    Storage.set('nuvio_queue', [], true)
    Storage.set('nuvio_v2', true, true)
}

// ---------- cleanup ----------

// Видалити з Nuvio рядки з голим числовим id, які записала попередня реалізація
function cleanup(){
    return run(function(){
        return Promise.all([
            pullDelta('sync_pull_watch_progress_delta', 0),
            pullDelta('sync_pull_watched_items_delta', 0)
        ]).then(function(res){
            var junk = function(ev){
                return ev.operation != 'delete' && /^\d+$/.test(ev.content_id + '')
            }
            var progress = last(res[0], function(row){
                return row.progress_key
            }).filter(junk)
            var watched = last(res[1], function(row){
                return [row.content_id, row.season, row.episode].join('|')
            }).filter(junk)

            var keys = watched.map(function(row){
                var key = {content_id: row.content_id}

                if (row.season !== null && row.season !== undefined) {
                    key.season = row.season
                    key.episode = row.episode
                }

                return key
            })

            return send('sync_delete_watch_progress', 'p_keys', progress.map(function(row){
                return row.progress_key
            })).then(function(){
                return send('sync_delete_watched_items', 'p_keys', keys)
            }).then(function(){
                return progress.length + watched.length
            })
        })
    })
}

function last(rows, keyOf){
    var map = {}

    rows.slice().sort(function(a, b){
        return a.event_id - b.event_id
    }).forEach(function(row){
        map[keyOf(row)] = row
    })

    return Object.keys(map).map(function(key){
        return map[key]
    })
}

function cleanupButton(){
    Lang.add({
        nuvio_cleanup: {uk: 'Прибрати старі записи', en: 'Remove old records', ru: 'Убрать старые записи'},
        nuvio_cleanup_descr: {uk: 'Видалити з Nuvio записи, які зробила попередня версія синхронізації (з числовим id)', en: 'Delete records with numeric ids written by the previous sync version', ru: 'Удалить из Nuvio записи, сделанные прошлой версией синхронизации (с числовым id)'},
        nuvio_cleanup_done: {uk: 'Видалено записів', en: 'Records removed', ru: 'Удалено записей'}
    })

    SettingsApi.addParam({
        component: 'nuvio',
        param: {name: 'nuvio_cleanup', type: 'button'},
        field: {name: ''},
        onRender: function(item){
            item.find('.settings-param__name').text(Lang.translate('nuvio_cleanup'))
            item.find('.settings-param__descr').text(Lang.translate('nuvio_cleanup_descr'))
            item.on('hover:enter', confirmCleanup)
        }
    })
}

function confirmCleanup(){
    Select.show({
        title: Lang.translate('nuvio_cleanup'),
        items: [{title: Lang.translate('settings_param_yes'), confirm: true}, {title: Lang.translate('settings_param_no')}],
        onSelect: function(a){
            Controller.toggle('settings_component')

            if (!a.confirm) {
                return
            }

            if (!ok()) {
                Noty.show('Nuvio: ' + Settings.statusText())
                return
            }

            cleanup().then(function(count){
                if (typeof count == 'number') {
                    Noty.show(Lang.translate('nuvio_cleanup_done') + ': ' + count)
                }
            })
        },
        onBack: function(){
            Controller.toggle('settings_component')
        }
    })
}

// ---------- start ----------

var started = false

function init(){
    if (started) {
        return
    }

    // модуль імпортується раніше, ніж app.js створює window.Lampa
    if (!window.Lampa || !Lampa.Listener) {
        setTimeout(init, 50)
        return
    }

    started = true

    cleanupButton()

    if (window.appready) {
        start()
    }
    else {
        Lampa.Listener.follow('app', function(e){
            if (e.type == 'ready') {
                start()
            }
        })
    }
}

// ---------- triggers ----------
//
// Realtime у Nuvio немає (нативні клієнти теж лише опитують), тож тягнемо зміни в момент,
// коли користувач от-от їх побачить або продовжить перегляд.
//   intent  — явна дія (картка, торрент, список файлів): не частіше за 5 с, пропущений запит
//             переноситься на кінець вікна, а не губиться;
//   ambient — фон (будь-який екран, повернення у вкладку): 15 с;
//   screen  — головна, закладки, історія: 15 с, разом із закладками;
//   focus   — повернулися у вікно (два вікна поруч не дають visibilitychange): 3 с, усе;
//   wake    — пробудження після сну чи простою: одразу, усе.
// Документ закладок великий, тож попутно його тягнемо не частіше за раз на хвилину.

var GAP = {intent: 5000, focus: 3000, ambient: 15000, screen: 15000, wake: 0}
var SCREENS = ['main', 'category', 'bookmarks', 'favorite', 'watch_history']
var FRESH = 20 * 1000 // дані свіжі, якщо pull вдався не раніше
var pendingKick = null

function kick(kind){
    var now = Date.now()

    if (kind != 'wake' && now < failUntil) {
        return
    }

    // прогрес і закладки мають окремі вікна: екран одразу після картки все одно тягне закладки
    var needP = now - lastP >= GAP[kind]
    var needF = kind == 'wake' || now - lastF > 60 * 1000 || (kind == 'screen' && now - lastF > 15 * 1000) || (kind == 'focus' && now - lastF > GAP.focus)

    if (!needP && !needF) {
        // явну дію не губимо, а переносимо на кінець вікна
        if (kind != 'ambient' && !pendingKick) {
            pendingKick = setTimeout(function(){
                pendingKick = null
                kick(kind)
            }, lastP + GAP[kind] - now)
        }

        return
    }

    if (needP) {
        lastP = now
    }

    if (needF) {
        lastF = now
    }

    return sync({p: needP, f: needF})
}

// Віддати все накопичене одразу: вкладку чи застосунок можуть закрити
function flushAll(){
    clearTimeout(deb)
    clearTimeout(favDeb)

    return run(function(){
        return Promise.resolve(flush()).then(function(){
            if (Object.keys(favGet('nuvio_favdirty_', scope())).length) {
                return favSync()
            }
        })
    })
}

// Після pull перебудувати відкриті головну, історію чи закладки («Продовжити» береться з Favorite).
// Поки грає плеєр — відкладаємо до його закриття
var refreshLater = false

function refreshScreens(){
    var active = Lampa.Activity.active()

    if (playing) {
        refreshLater = true
        return
    }

    if (active && SCREENS.indexOf(active.component) > -1) {
        Lampa.Activity.refresh()
    }
}

// Оновити на місці смужки прогресу (як Timeline.update у ядрі) і позицію плеєра, що ще не стартував
function patchViews(touched, data){
    Object.keys(touched).forEach(function(hash){
        var road = data[hash] || {percent: 0, time: 0, duration: 0}
        var f = timeline().format(road)

        $('.time-line[data-hash="' + hash + '"]').toggleClass('hide', !road.percent).find('> div').css({width: road.percent + '%'})

        $('.time-line-details[data-hash="' + hash + '"]').each(function(){
            $(this).find('[a="t"]').text(f.time)
            $(this).find('[a="p"]').text(f.percent)
            $(this).find('[a="d"]').text(f.duration)
            $(this).toggleClass('hide', !road.duration)
        })
    })

    [playing, starting].forEach(function(data){
        if (data && data.timeline && touched[data.timeline.hash]) {
            reread(data.timeline)
        }
    })
}

// ---------- playback ----------
//
// Список файлів (торрент, онлайн-плагін) будує об'єкт таймкоду ще при відмальовуванні й віддає
// його плеєру, тож до старту він міг застаріти. Плеєр читає позицію лише на першому timeupdate
// (player/timeline.js), тож свіже значення ще встигає потрапити в той самий об'єкт.

var playing = null // дані плеєра, що грає
var starting = null // дані плеєра між create і start (реклама, дисклеймер)
var snap = null // таймкод на старті, щоб розпізнати закриття без перегляду
var bypass = false

// Підтягнути в об'єкт таймкоду збережене, якщо воно новіше. Поки плеєр не перемотав (continued)
function reread(tl){
    if (!tl || !tl.hash || tl.continued) {
        return
    }

    var meta = tl.card ? {card: tl.card, season: tl.season, episode: tl.episode} : null
    var v = timeline().view(tl.hash, meta)

    if ((v.updated || 0) > (tl.updated || 0)) {
        tl.time = v.time
        tl.percent = v.percent
        tl.updated = v.updated

        // торрент ставить тривалість з runtime картки, нулем її не затираємо
        if (v.duration) {
            tl.duration = v.duration
        }
    }
}

function rereadAll(data){
    reread(data.timeline)

    if (Array.isArray(data.playlist)) {
        data.playlist.forEach(function(item){
            reread(item.timeline)
        })
    }
}

function onCreate(e){
    var data = e.data

    if (!ok() || !data || data.iptv || !data.timeline) {
        return
    }

    rereadAll(data)

    // свіже, наступна серія, немає мережі, відступ після помилок — нічого не тягнемо
    if (bypass || data.continue_play || Date.now() - okP < FRESH || navigator.onLine === false || Date.now() < failUntil) {
        return
    }

    // вбудований плеєр бере позицію лише на першому timeupdate, після буферизації:
    // стартуємо одразу, а свіжа позиція встигне потрапити в той самий об'єкт (patchViews)
    if (!external(data)) {
        starting = data
        lastP = Date.now()
        sync({p: true})
        return
    }

    // зовнішній плеєр бере позицію одразу при запуску — чекаємо pull, але не довше за 1,5 с
    e.abort()

    var done = false
    var go = function(cancel){
        if (done) {
            return
        }

        done = true

        Lampa.Loading.stop()

        if (cancel) {
            return
        }

        rereadAll(data)

        bypass = true

        try {
            Lampa.Player.play(data)
        }
        finally {
            bypass = false
        }
    }

    Lampa.Loading.start(function(){
        go(true)
    })

    setTimeout(function(){
        go()
    }, 1500)

    lastP = Date.now()

    sync({p: true}).then(function(){
        go()
    })
}

// Чи відкриється зовнішній плеєр (Android, webOS, VLC, Infuse…), як вирішує Player.start у ядрі
function external(data){
    var choice = data.launch_player || Storage.field('player' + (data.torrent_hash ? '_torrent' : ''))

    return Boolean(choice) && ['inner', 'lampa', 'ios', 'tizen', 'orsay'].indexOf(choice) == -1
}

function onStart(data){
    playing = data
    starting = null

    var tl = data && data.timeline

    snap = tl ? {hash: tl.hash, time: tl.time, percent: tl.percent, updated: tl.updated || 0} : null
}

function onDestroy(){
    // збереження позиції ядро робить раніше за цю подію (player.js destroy: Timeline.destroy)
    playing = null
    starting = null
    snap = null

    flushAll()
    kick('intent')

    if (refreshLater) {
        refreshLater = false
        setTimeout(refreshScreens, 1000)
    }
}

// Зберегти поточну позицію плеєра, якщо вона зрушила (ядро робить це лише раз на 2 хв і при закритті)
function savePlaying(){
    var tl = playing && playing.timeline

    if (!tl || !tl.handler || tl.stop_recording || !tl.continued) {
        return
    }

    if (snap && Math.round(snap.time) == Math.round(tl.time)) {
        return
    }

    tl.handler(tl.percent, tl.time, tl.duration)

    snap = null
}

// ---------- start ----------

function start(){
    timeline().listener.follow('update', onUpdate)

    Lampa.Favorite.listener.follow('add', onFavorite('add'))
    Lampa.Favorite.listener.follow('added', onFavorite('added'))
    Lampa.Favorite.listener.follow('remove', onFavorite('remove'))

    lastP = Date.now()

    sync()

    // картка
    Lampa.Listener.follow('full', function(e){
        if (e.type == 'complite') {
            kick('intent')
        }
    })

    // торренти: відкрили роздачу чи список файлів («Мої торренти» без картки)
    Lampa.Listener.follow('torrent', function(e){
        if (e.type == 'onenter') {
            kick('intent')
        }
    })

    Lampa.Listener.follow('torrent_file', function(e){
        if (e.type == 'list_open') {
            kick('intent')
        }
    })

    // екрани
    Lampa.Listener.follow('activity', function(e){
        if (e.type == 'start') {
            kick(SCREENS.indexOf(e.component) > -1 ? 'screen' : 'ambient')
        }
    })

    // плеєр
    Lampa.Player.listener.follow('create', onCreate)
    Lampa.Player.listener.follow('start', onStart)
    Lampa.Player.listener.follow('destroy', onDestroy)

    var pauseTimer = null

    Lampa.PlayerVideo.listener.follow('pause', function(){
        clearTimeout(pauseTimer)
        pauseTimer = setTimeout(savePlaying, 10 * 1000)
    })

    Lampa.PlayerVideo.listener.follow('play', function(){
        clearTimeout(pauseTimer)
    })

    // вихід із застосунку на ТВ: діалог виходу з'являється на 'backward' з однією активністю
    Lampa.Activity.listener.follow('backward', function(e){
        if (e.count == 1) {
            savePlaying()
            flushAll()
        }
    })

    document.addEventListener('visibilitychange', function(){
        if (document.hidden) {
            savePlaying()
            flushAll()
        }
        else {
            kick('wake')
        }
    })

    window.addEventListener('focus', function(){
        kick('focus')
    })

    window.addEventListener('pagehide', function(){
        savePlaying()
        flushAll()
    })

    window.addEventListener('online', function(){
        fails = 0
        failUntil = 0

        kick('wake')
    })

    // простій: перше натискання після 5 хв тиші
    var lastKey = Date.now()

    Lampa.Keypad.listener.follow('keydown', function(){
        if (Date.now() - lastKey > 5 * 60 * 1000) {
            kick('wake')
        }

        lastKey = Date.now()
    })

    // сон: таймер простояв довше, ніж мав (ТВ у standby, ноутбук закрили);
    // і запасний опит, якщо 10 хв не було жодного вдалого pull
    var lastTick = Date.now()

    setInterval(function(){
        var now = Date.now()

        if (now - lastTick > 20 * 1000) {
            kick('wake')
        }
        else if (!document.hidden && now - okP > 10 * 60 * 1000) {
            kick('ambient')
        }

        lastTick = now
    }, 5 * 1000)

    var hadToken = Boolean(Api.tokens().access_token)

    Storage.listener.follow('change', function(e){
        // оновлення токена змінює nuvio_tokens щогодини — синхронізуємо лише на вхід і вихід
        if (e.name == 'nuvio_tokens') {
            var has = Boolean(Api.tokens().access_token)

            if (has != hadToken) {
                hadToken = has
                sync()
            }

            return
        }

        if (/^nuvio_(enable|active_profile|profile_map|email|backend_url|mode)$/.test(e.name) || e.name == 'account' || e.name == 'account_use') {
            sync()
        }
    })
}

export default {init: init, sync: sync, cleanup: cleanup}
