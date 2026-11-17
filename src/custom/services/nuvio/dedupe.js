// Кеш max(watched_at) на ключ. watched_at ніколи не знижується.
var cache = {}

function key(profile, content_id, season, episode){
    return [profile, content_id, season || '', episode || ''].join('|')
}

function get(profile, content_id, season, episode){
    return cache[key(profile, content_id, season, episode)] || 0
}

// true -> подію пропускаємо (синтетичний add або вже бачене з >= watched_at)
function seen(profile, content_id, season, episode, watched_at){
    return get(profile, content_id, season, episode) >= (watched_at || 0)
}

function update(profile, content_id, season, episode, watched_at){
    var k = key(profile, content_id, season, episode)
    if((watched_at || 0) > (cache[k] || 0)) cache[k] = watched_at
}

function reset(){ cache = {} }

export default {key: key, get: get, seen: seen, update: update, reset: reset}
