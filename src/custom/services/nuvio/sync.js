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
    })

    return chain
}

function sync(){
    if (queued) {
        return chain
    }

    queued = true

    return run(function(){
        queued = false

        if (!ok()) {
            Settings.setStatus(cubSync() ? 'paused' : 'off')
            return
        }

        Settings.setStatus('syncing')

        migrate()
        switchScope()

        return pull().then(flush).then(function(){
            Settings.setStatus('ok')
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
    if (!pulled || !ok()) {
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

// ---------- local changes ----------

function onUpdate(e){
    if (!ok() || !e || !e.data || !e.data.road) {
        return
    }

    var hash = e.data.hash
    var road = e.data.road

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
    }, 3000)
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
        var name = timeline().filename()
        var parked = false

        Storage.set('file_view_nuvio_' + current, Storage.value(name, '{}'), true, function(){
            parked = true
        })

        // не вмістилось — не паркуємо, наступного разу профіль повністю підтягнеться з Nuvio
        if (parked) {
            Storage.set('nuvio_cursor_' + current, {}, true)
        }

        var data = {}

        try {
            data = JSON.parse(Storage.value('file_view_nuvio_' + next, '{}')) || {}
        }
        catch (e) {}

        Storage.set(name, data, true)

        timeline().read()
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

function start(){
    timeline().listener.follow('update', onUpdate)

    sync()

    setInterval(sync, 15 * 60 * 1000)

    document.addEventListener('visibilitychange', function(){
        if (document.hidden) {
            run(flush)
        }
        else {
            sync()
        }
    })

    window.addEventListener('online', sync)

    Storage.listener.follow('change', function(e){
        if (/^nuvio_(tokens|enable|active_profile|profile_map|email|backend_url|mode)$/.test(e.name) || e.name == 'account' || e.name == 'account_use') {
            sync()
        }
    })
}

export default {init: init, sync: sync, cleanup: cleanup}
