// Чисті функції синхронізації з Nuvio: ідентичність запису, формат рядків, правило злиття.
// Без імпортів: хеш береться з Lampa.Utils у момент виклику, щоб модуль тестувався окремо.
//
// Формат Nuvio (з коду нативних клієнтів): content_id = IMDb tt… фільму/серіалу,
// video_id = tt…:S:E, progress_key = tt…_sSeE, час у мс, «переглянуто» = 90%+.

// 'tv_1396' -> {type:'tv', id:1396}. Ключі з префіксом джерела (kp_movie_1) не синхронізуємо:
// id різних джерел збігаються
function parseCard(key){
    var m = /^(movie|tv)_(\d+)$/.exec(key || '')

    if (!m) {
        return null
    }

    return {type: m[1], id: parseInt(m[2], 10)}
}

function isInt(n, min){
    return typeof n == 'number' && n % 1 === 0 && n >= min
}

// Ключ запису як індекс ядра (timeline.js indexKey): card|season|episode
function localKey(road){
    var card = road ? parseCard(road.card) : null

    if (!card) {
        return null
    }

    if (card.type == 'movie') {
        return road.card + '||'
    }

    if (!isInt(road.season, 0) || !isInt(road.episode, 1)) {
        return null
    }

    return [road.card, road.season, road.episode].join('|')
}

// Голе число писала лише стара гілка (з хибними «переглянуто»), такі рядки ігноруємо
function idKind(cid){
    cid = cid + ''

    if (/^tt\d+$/.test(cid)) {
        return 'imdb'
    }

    if (/^tmdb:\d+$/.test(cid)) {
        return 'tmdb'
    }

    return null
}

function toRemote(road, cid){
    if (parseCard(road.card).type == 'movie') {
        return {content_id: cid, content_type: 'movie', video_id: cid, progress_key: cid}
    }

    return {
        content_id: cid,
        content_type: 'series',
        video_id: cid + ':' + road.season + ':' + road.episode,
        progress_key: cid + '_s' + road.season + 'e' + road.episode,
        season: road.season,
        episode: road.episode
    }
}

function progressEntry(road, remote){
    var duration = Math.round((road.duration || 0) * 1000)
    var position = Math.round((road.time || 0) * 1000)

    if (!position && road.percent > 0) {
        position = Math.round(duration * road.percent / 100)
    }

    // нативний клієнт пише завершене як position = duration, інакше незавершений прогрес
    // перекриває позначку «переглянуто»
    if (road.percent >= 90) {
        position = duration
    }

    return Object.assign({}, remote, {position: position, duration: duration, last_watched: road.updated})
}

// Що відправити за станом запису
function pushKind(road){
    if (!road.percent && !road.time) {
        return 'delete'
    }

    if (road.duration > 0) {
        return 'progress'
    }

    if (road.percent >= 90) {
        return 'watched'
    }

    return 'skip'
}

function roadFromProgress(row){
    if (!(row.duration > 0)) {
        return null
    }

    return {
        percent: Math.min(100, Math.round(row.position / row.duration * 100)),
        time: Math.round(row.position / 1000),
        duration: Math.round(row.duration / 1000),
        updated: row.last_watched
    }
}

// Хеш як у ядра: Timeline.watched / watchedEpisode
function canonHash(type, title, season, episode){
    var hash = Lampa.Utils.hash

    if (type == 'movie') {
        return hash(title)
    }

    return hash([season, season > 10 ? ':' : '', episode, title].join(''))
}

// Чи застосувати віддалену подію до локального запису.
// ev = {op:'upsert'|'delete', kind:'p'|'w', ts}; dirty — запис змінено локально й ще не відправлено
function decide(local, dirty, ev){
    var lu = local ? (local.updated || 0) : 0

    if (ev.op == 'delete') {
        if (!local) {
            return false
        }

        if (dirty && lu > ev.ts) {
            return false
        }

        // видалення прогресу не знімає позначку «переглянуто», і навпаки
        return ev.kind == 'p' ? local.percent < 90 : local.percent >= 90
    }

    // незавершений прогрес головніший за позначку (як у нативних клієнтах)
    if (ev.kind == 'w' && local && local.percent > 0 && local.percent < 90 && local.duration > 0) {
        return false
    }

    // строго більше: власне відлуння повертається з тим самим часом і відсікається
    return ev.ts > lu
}

export default {
    parseCard: parseCard,
    localKey: localKey,
    idKind: idKind,
    toRemote: toRemote,
    progressEntry: progressEntry,
    pushKind: pushKind,
    roadFromProgress: roadFromProgress,
    canonHash: canonHash,
    decide: decide
}
