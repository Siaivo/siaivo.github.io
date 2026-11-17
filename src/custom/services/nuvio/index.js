import Storage from '../../../core/storage/storage'
import Favorite from '../../../core/favorite'
import Timeline from '../../../interaction/timeline'
import Settings from './settings'
import Api from './api'
import Profiles from './profiles'
import Idmap from './idmap'
import Dedupe from './dedupe'
import Outbox from './outbox'
import Watched from './watched'
import Progress from './progress'
import Head from './head'

var started = false
var deltaTimer = null

function enabled(){
    try { return Boolean(Storage.field('nuvio_enable')) } catch(e){}
    try { return Boolean(Storage.get('nuvio_enable', false)) } catch(e){ return false }
}

function permitOk(){
    try {
        var Permit = (window.Lampa && Lampa.Account && Lampa.Account.Permit) ? Lampa.Account.Permit : null
        if(!Permit) return true
        // Локальний режим = sync НЕ увімкнено. Permit.sync може бути
        // undefined/'' (немає Cub-акаунта) — це теж локальний режим.
        // Суворе === false ламалось саме на цьому (завжди paused).
        return !Permit.sync
    } catch(e){}
    return true
}

function active(){
    if(!enabled()) return false
    var p = Profiles.resolveActive()
    return Boolean(p)
}

// курсори: sync_get_*_cursor ПЕРЕД повним pull, щоб не втратити події
function getCursor(profile){
    try { return Storage.get('nuvio_cursor_' + profile, {}) || {} } catch(e){ return {} }
}

function setCursor(profile, c){
    try { Storage.set('nuvio_cursor_' + profile, c) } catch(e){}
}

// Варіант A: двостороннє злиття при першому імпорті.
// ТІЛЬКИ повні картки (з poster_path/overview) — голі з pull ігноруємо,
// інакше push перезапише season/episode на null (сервер пише безумовно).
function isFullCard(card){
    return Boolean(card && card.poster_path)
}

function collectLocalWatched(){
    var out = []
    var seenKeys = {}
    try {
        var lists = []
        try { lists = lists.concat(Favorite.get({type: 'history'}) || []) } catch(e){}
        try { lists = lists.concat(Favorite.get({type: 'viewed'}) || []) } catch(e){}
        lists.forEach(function(card){
            if(!isFullCard(card)) return
            var item = Idmap.fromCard(card)
            if(!item) return
            var k = [item.content_id, item.season || '', item.episode || ''].join('|')
            if(seenKeys[k]) return
            seenKeys[k] = true
            // watched_at локального: шукаємо по картці в Timeline, інакше now
            var watched_at = Date.now()
            try {
                var link = Timeline.link(card)
                var fn = Timeline.filename()
                var store = (window.Lampa && Lampa.Storage) ? Lampa.Storage.get(fn, {}) : {}
                if(link && store){
                    Object.keys(store).forEach(function(h){
                        var road = store[h]
                        if(road && road.card == link.card && road.updated > watched_at - 10 * 365 * 24 * 3600 * 1000 && road.updated < watched_at) watched_at = road.updated
                    })
                }
            } catch(e){}
            item.watched_at = watched_at
            out.push(item)
        })
    } catch(e){}
    return out
}

function firstImport(profile){
    Settings.setStatus('connecting')
    return Promise.all([
        Api.rpc('sync_get_watched_items_delta_cursor', {p_profile_id: profile}).catch(function(){ return null }),
        Api.rpc('sync_get_watch_progress_delta_cursor', {p_profile_id: profile}).catch(function(){ return null })
    ]).then(function(cursors){
        var c = {watched: cursors[0], progress: cursors[1]}
        return Watched.pullAll(profile).then(function(rows){
            rows = rows || []
            applyWatched(rows, profile)
            // чого немає в Nuvio — пушимо вгору
            var remote = {}
            rows.forEach(function(r){ remote[[r.content_id, r.season || '', r.episode || ''].join('|')] = r.watched_at || 0 })
            var missing = collectLocalWatched().filter(function(item){
                var k = [item.content_id, item.season || '', item.episode || ''].join('|')
                return (remote[k] || 0) < item.watched_at
            })
            var pushChain = missing.length ? Watched.pushBatch(missing, profile).catch(function(){ return null }) : Promise.resolve()
            return pushChain.then(function(){
                return Progress.pull(profile, 0, 1000).then(function(prows){
                    applyProgress(prows || [], profile)
                    setCursor(profile, c)
                    Settings.setStatus('ok')
                })
            })
        })
    }).catch(function(){ Settings.setStatus('offline') })
}

function applyWatched(rows, profile){
    rows.forEach(function(r){
        if(Dedupe.seen(profile, r.content_id, r.season, r.episode, r.watched_at)) return
        Dedupe.update(profile, r.content_id, r.season, r.episode, r.watched_at)
        markViewed(r)
    })
}

// Голу картку з Nuvio (id + назва) збагачуємо повними даними з TMDB,
// інакше список її не відрендерить. Через Reguest + TMDB.api, пакетно по 4.
var enrichNet = null
function enrichCard(num, isSeries, title, done){
    try {
        var TMDB = window.Lampa && Lampa.TMDB ? Lampa.TMDB : null
        if(!TMDB || !TMDB.api || !TMDB.key){ done(null); return }
        if(!enrichNet){
            try { enrichNet = window.Lampa && Lampa.Network ? Lampa.Network : null } catch(e){}
            if(!enrichNet){ done(null); return }
        }
        var url = TMDB.api((isSeries ? 'tv/' : 'movie/') + num + '?api_key=' + TMDB.key() + '&language=en')
        enrichNet.silent(url, function(data){
            data = data || {}
            data.id = num
            data.source = 'tmdb'
            if(isSeries && !data.original_name) data.original_name = data.name || title
            if(!isSeries && !data.original_title) data.original_title = data.title || title
            done(data)
        }, function(){ done(null) })
    } catch(e){ done(null) }
}

var enrichActive = 0
var enrichQueue = []

function enrichDrain(){
    while(enrichActive < 4 && enrichQueue.length){
        var job = enrichQueue.shift()
        enrichActive++
        enrichCard(job.num, job.isSeries, job.title, (function(j){
            return function(card){
                enrichActive--
                // TMDB не відповів — кладемо голу картку з назвою з Nuvio,
                // список її покаже, постери підтягнуться при відкритті
                if(!card) card = {id: j.num, source: 'tmdb'}
                if(isSeries2card(j, card)){
                    placeCard(card, j.isSeries, j.watched_at)
                    writeMarker(j.num, j.isSeries, j.title, j.watched_at, j.season, j.episode)
                }
                enrichDrain()
            }
        })(job))
    }
}

function isSeries2card(j, card){
    // картка вже могла з'явитись поки йшов запит — не дублюємо
    try {
        var st = Favorite.check({id: j.num})
        if(st && st.viewed) return false
    } catch(e){}
    // мінімальний набір для рендеру списку
    card.id = j.num
    card.source = card.source || 'tmdb'
    if(j.isSeries && !card.original_name) card.original_name = card.name || j.title || ('tv' + j.num)
    if(!j.isSeries && !card.original_title) card.original_title = card.title || j.title || ('movie' + j.num)
    return true
}

function placeCard(card, isSeries, watched_at){
    try {
        // Ніколи не перезаписуємо повну картку голою з pull:
        // якщо в data.card вже є poster_path — лише виставляємо прапорці
        var existing = null
        try {
            var data = Favorite.full()
            var found = (data.card || []).filter(function(c){ return c.id == card.id })
            if(found.length) existing = found[0]
        } catch(e){}
        if(existing && existing.poster_path){
            try {
                var st0 = Favorite.check({id: card.id})
                if(!(st0 && st0.viewed)) Favorite.toggle('viewed', existing)
                var st1 = Favorite.check({id: card.id})
                if(!(st1 && st1.history)) Favorite.toggle('history', existing)
            } catch(e){}
            return
        }
        // viewed — позначка перегляду (звідси push вгору і D4)
        var st = Favorite.check({id: card.id})
        if(!(st && st.viewed)) Favorite.toggle('viewed', card)
        // history — щоб картка була видима в watch_history і "Продовжити"
        // (при реальному перегляді ядро пише обидва; pull має робити те саме)
        var sth = null
        try { sth = Favorite.check({id: card.id}) } catch(e){}
        if(!(sth && sth.history)){
            Favorite.toggle('history', card)
        }
    } catch(e){}
}

function markViewed(r){
    try {
        var num = parseInt((r.content_id + '').replace(/^tmdb:/, ''), 10)
        if(isNaN(num)) return
        var isSeries = Boolean(r.content_type == 'series' || r.season)
        // маркери дописуємо завжди (навіть якщо картка вже у viewed) —
        // при минулих запусках вони могли не записатись
        writeMarker(num, isSeries, r.title, r.watched_at, r.season, r.episode)
        var st = null
        try { st = Favorite.check({id: num}) } catch(e){}
        if(st && st.viewed) return
        // спочатку збагачуємо з TMDB, потім кладемо повну картку
        enrichQueue.push({num: num, isSeries: isSeries, title: r.title, watched_at: r.watched_at, season: r.season, episode: r.episode})
        enrichDrain()
    } catch(e){}
}

function writeMarker(num, isSeries, title, watched_at, season, episode){
    try {
        var card = {id: num, source: 'tmdb'}
        if(isSeries) card.original_name = title || ('tv' + num)
        else card.original_title = title || ('movie' + num)
        var link = null
        try { link = Timeline.link(card, season, episode) } catch(e){}
        if(!link) return
        var fn = Timeline.filename()
        var store = (window.Lampa && Lampa.Storage) ? Lampa.Storage.get(fn, {}) : {}
        if(season && episode){
            var h = link.card + ':' + season + ':' + episode
            var ex = store[h]
            if(ex && ex.percent > 1 && ex.updated > 0) return
            store[h] = {percent: 100, time: 0, duration: 0, card: link.card, season: season, episode: episode, updated: watched_at || Date.now(), nuvio_marker: true}
        }
        else {
            var h2 = link.card + ':nuvio'
            var ex2 = store[h2]
            if(ex2 && ex2.percent > 1 && ex2.updated > 0) return
            store[h2] = {percent: 100, time: 0, duration: 0, card: link.card, updated: watched_at || Date.now(), nuvio_marker: true}
        }
        Lampa.Storage.set(fn, store)
    } catch(e){}
}

function applyProgress(rows, profile){
    rows.forEach(function(r){
        try {
            var num = parseInt((r.content_id + '').replace(/^tmdb:/, ''), 10)
            if(isNaN(num)) return
            // хеш детермінований зі стабільного ключа: повторний pull оновлює той самий запис
            var hkey = r.progress_key || (r.video_id || (r.content_id + '|' + (r.season || '') + '|' + (r.episode || '')))
            Timeline.update({
                hash: Idmap.hashOf({id: hkey, original_title: hkey}),
                percent: r.duration ? Math.min(100, Math.round(r.position / r.duration * 100)) : 0,
                time: Idmap.msToSec(r.position),
                duration: Idmap.msToSec(r.duration),
                card: (r.content_type == 'series' ? 'tv_' : 'movie_') + num,
                season: r.season, episode: r.episode,
                received: true
            })
        } catch(e){}
    })
}

function deltaPoll(){
    if(!active() || !permitOk()) return Promise.resolve()
    var profile = Profiles.resolveActive()
    var c = getCursor(profile)
    Settings.setStatus('syncing')
    return Promise.all([
        Watched.pullDelta(profile, (c.watched && c.watched.event_id) || 0).catch(function(){ return [] }),
        Progress.pullDelta(profile, (c.progress && c.progress.event_id) || 0).catch(function(){ return [] })
    ]).then(function(res){
        var wrows = res[0] || [], prows = res[1] || []
        wrows.forEach(function(ev){
            if(ev.operation == 'delete'){
                try {
                    var num = parseInt((ev.content_id + '').replace(/^tmdb:/, ''), 10)
                    if(!isNaN(num)) Favorite.remove('viewed', {id: num})
                } catch(e){}
            }
            else applyWatched([ev], profile)
            // курсор після кожної сторінки
            if(ev.event_id){ c.watched = {event_id: ev.event_id}; setCursor(profile, c) }
        })
        if(prows.length) applyProgress(prows, profile)
        if(prows.length){ var lastEv = prows[prows.length - 1]; if(lastEv.event_id){ c.progress = {event_id: lastEv.event_id}; setCursor(profile, c) } }
        Settings.setStatus(Outbox.size() ? 'offline' : 'ok')
    }).catch(function(){ Settings.setStatus('offline') })
}

function flushOutbox(){
    var profile = Profiles.resolveActive()
    if(!profile) return Promise.resolve()
    var watched = [], progress = []
    Outbox.load().forEach(function(e){
        if(e.t == 'watched') watched.push(e.p)
        else if(e.t == 'progress') progress.push(e.p)
        else if(e.t == 'watched_delete') watched.push(e.p)
    })
    // Просто: watched пачками, прогрес через pushBatch; видалення окремо
    Settings.setStatus('syncing')
    return Outbox.flush(function(batch){
        var w = batch.filter(function(e){ return e.t == 'watched' }).map(function(e){ return e.p })
        var d = batch.filter(function(e){ return e.t == 'watched_delete' }).map(function(e){ return e.p })
        var p = batch.filter(function(e){ return e.t == 'progress' }).map(function(e){ return e.p })
        var chain = Promise.resolve()
        if(w.length) chain = chain.then(function(){ return Watched.pushBatch(w, profile) })
        if(d.length) chain = chain.then(function(){ return Watched.remove(d, profile) })
        if(p.length) chain = chain.then(function(){ return Progress.pushBatch(p, profile) })
        return chain
    }).then(function(){
        Settings.setStatus(Outbox.size() ? 'offline' : 'ok')
    }).catch(function(e){
        var status = e && e.status
        Settings.setStatus(status == 401 ? 'error' : 'offline')
    })
}

var flushDeb = null
function scheduleFlush(){
    clearTimeout(flushDeb)
    flushDeb = setTimeout(flushOutbox, 2000)
}

var subscribed = false
var syncStarted = false

// Перезапускаємий старт: boot при app ready + після логіну (nuvio_tokens) +
// після ввімкнення (nuvio_enable). Повторні виклики — лише deltaPoll.
function startSync(){
    if(!enabled()){ syncStarted = false; Settings.setStatus('off'); return Promise.resolve() }
    if(!permitOk()){ syncStarted = false; Settings.setStatus('paused'); return Promise.resolve() }
    var profile = Profiles.resolveActive()
    if(!profile){ syncStarted = false; Settings.setStatus('off'); return Promise.resolve() }
    subscribe()
    if(syncStarted) return deltaPoll()
    syncStarted = true
    Settings.setStatus('connecting')
    // кеш профілів для аватарки в head
    Profiles.list().then(function(rows){
        try { Storage.set('nuvio_profiles_cache', rows || []) } catch(e){}
        try { Head.update() } catch(e){}
    }).catch(function(){})
    return Api.rpc('health_ping', {}).then(function(){
        return firstImport(profile)
    }).catch(function(){
        Settings.setStatus('offline')
    }).then(function(){
        if(deltaTimer) clearInterval(deltaTimer)
        deltaTimer = setInterval(deltaPoll, 5 * 60 * 1000)
    })
}

function subscribe(){
    if(subscribed) return
    subscribed = true
    // Lampa-об'єкти беремо в рантаймі: при circular imports статичний імпорт
    // може дати битий об'єкт (саме так Timeline.listener губився).
    var Fav = null, Tline = null
    try { Fav = (window.Lampa && Lampa.Favorite) ? Lampa.Favorite : Favorite } catch(e){ Fav = Favorite }
    try { Tline = (window.Lampa && Lampa.Timeline) ? Lampa.Timeline : Timeline } catch(e){ Tline = Timeline }
    if(!Fav) Fav = Favorite
    if(!Tline) Tline = Timeline
    // push: viewed (ручна позначка) / remove viewed / Timeline.update (прогрес)
    // D3: watched — лише ручна позначка; серіал цілком без S/E не пушимо
    // (сервер сам робить watched з прогресу при ≥90%, інакше буде дубль з null)
    Fav.listener.follow('add', function(e){
        if(!active() || !permitOk()) return
        if(e.where !== 'viewed') return
        var item = Idmap.fromCard(e.card)
        if(!item) return
        if(item.content_type == 'series' && (typeof item.season == 'undefined' || item.season === null)) return
        var profile = Profiles.resolveActive()
        item.watched_at = Date.now()
        if(Dedupe.seen(profile, item.content_id, item.season, item.episode, item.watched_at)) return // синтетичні add від Favorite.refresh
        Dedupe.update(profile, item.content_id, item.season, item.episode, item.watched_at)
        Outbox.add('watched', item)
        scheduleFlush()
    })

    Fav.listener.follow('remove', function(e){
        if(!active() || !permitOk()) return
        if(e.where !== 'viewed' || e.method != 'id') return
        var item = Idmap.fromCard(e.card)
        if(!item) return
        Outbox.add('watched_delete', item)
        scheduleFlush()
    })

    var _handler = function(e){
        if(!active() || !permitOk()) return
        try {
        var data = (e && (e.road || (e.data && e.data.road))) || null
        if(!data || !data.card || data.received || data.nuvio_marker) return
        try { console.log('NuvioDBG', 'upd', data.card, data.season, data.episode, data.percent, data.time, data.duration) } catch(err){}
        var base = Idmap.fromRoadCard(data.card, data.season, data.episode)
        if(!base) { try { console.log('NuvioDBG', 'skip:base', data.card) } catch(err){} return }
        var profile = Profiles.resolveActive()
        var duration = Idmap.secToMs(data.duration)
        // Ручна відмітка серії (95%, duration невідома): пушимо watched напряму з S/E.
        // D3: сервер сам робить watched з прогресу, але без duration прогрес безглуздий.
        if((parseInt(data.percent, 10) || 0) >= 90 && data.season && data.episode && duration < 60000){
            var witem = {
                content_id: base.content_id, content_type: base.content_type,
                title: '', season: data.season, episode: data.episode,
                watched_at: Date.now()
            }
            if(!Dedupe.seen(profile, witem.content_id, witem.season, witem.episode, witem.watched_at)){
                Dedupe.update(profile, witem.content_id, witem.season, witem.episode, witem.watched_at)
                Outbox.add('watched', witem)
                try { console.log('NuvioDBG', 'pushed:watched', witem.content_id, witem.season, witem.episode) } catch(err){}
                scheduleFlush()
            }
            else { try { console.log('NuvioDBG', 'skip:dedupe') } catch(err){} }
            return
        }
        if(duration < 60000) { try { console.log('NuvioDBG', 'skip:duration', duration) } catch(err){} return }
        var entry = {
            content_id: base.content_id, content_type: base.content_type,
            season: data.season, episode: data.episode,
            video_id: Idmap.toVideoId(base.content_id, data.season, data.episode),
            position: Idmap.secToMs(data.time), duration: duration,
            last_watched: Date.now(),
            percent: parseInt(data.percent, 10) || 0
        }
        if(!Progress.shouldSend(entry)) { try { console.log('NuvioDBG', 'skip:throttle') } catch(err){} return }
        Outbox.add('progress', entry)
        try { console.log('NuvioDBG', 'pushed:progress', entry.content_id, entry.season, entry.episode) } catch(err){}
        Progress.markSent(entry)
        scheduleFlush()
        } catch(err){}
    }
    Tline.listener.follow('update', _handler)

    Storage.listener.follow('change', function(e){
        if(e.name != 'account') return
        // Cub увімкнув синхрон -> paused, черга зберігається
        try {
            if(window.Lampa && Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.sync) Settings.setStatus('paused')
            else if(active()){ Settings.setStatus('ok'); deltaPoll() }
        } catch(err){}
    })
}

function init(){
    if(started) return
    started = true
    // Settings.init вже викликано при імпорті — компонент реєструється одразу,
    // пункт меню не залежить від app ready
    Head.init()
    // перемикання профілю в head: свіжий pull нового профілю
    try {
        Head.listener.follow('profile_select', function(e){
            if(!active() || !permitOk()) return
            var profile = (e && e.profile_index) || Profiles.resolveActive()
            Settings.setStatus('syncing')
            firstImport(profile).then(function(){ deltaPoll() })
        })
    } catch(err){}
    // після app ready, без блокування UI
    var boot = function(){
        startSync()
    }
    try {
        if(window.Lampa && Lampa.Listener) Lampa.Listener.follow('app', function(e){ if(e.type == 'ready') setTimeout(boot, 0) })
        else setTimeout(boot, 0)
    } catch(e){ setTimeout(boot, 0) }
}

if(typeof window != 'undefined'){
    try { Settings.init() } catch(e){}
    try { init() } catch(e){}
}

// Слухач перезапуску — назовні subscribe/init: спрацьовує і до першого boot
// (логін / ввімкнення / вибір профілю). Двічі не стартує: startSync ідемпотентний
// через syncStarted, підписки — через subscribed.
try {
    Storage.listener.follow('change', function(e){
        if(e.name == 'nuvio_tokens' || e.name == 'nuvio_enable' || e.name == 'nuvio_profile_map' || e.name == 'nuvio_active_profile'){
            startSync()
        }
    })
} catch(e){}

export default {init: init, collectLocalWatched: collectLocalWatched, active: active, permitOk: permitOk, enabled: enabled, subscribe: subscribe, deltaPoll: deltaPoll, flushOutbox: flushOutbox, applyWatched: applyWatched, applyProgress: applyProgress, setCursor: setCursor, getCursor: getCursor}
