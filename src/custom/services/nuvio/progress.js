import Api from './api'
import Auth from './auth'
import Outbox from './outbox'
import Idmap from './idmap'

// клієнтський throttle як у сервера: не частіше 1/30с, зміна >= 15с. Фінал (>=90%) завжди.
var lastSent = {}

function pkey(entry){
    return [entry.content_id, entry.season || '', entry.episode || ''].join('|')
}

function shouldSend(entry){
    var now = Date.now()
    var k = pkey(entry)
    var prev = lastSent[k]
    if(entry.percent >= 90) return true
    if(!prev) return true
    if(now - prev.at < 30000) return false
    if(Math.abs((entry.position || 0) - (prev.pos || 0)) < 15000) return false
    return true
}

function markSent(entry){
    lastSent[pkey(entry)] = {at: Date.now(), pos: entry.position || 0}
}

function push(entry, profile_id){
    var body = {
        content_id: entry.content_id,
        content_type: entry.content_type,
        video_id: entry.video_id || Idmap.toVideoId(entry.content_id, entry.season, entry.episode),
        season: entry.season, episode: entry.episode,
        position: entry.position, duration: entry.duration, last_watched: entry.last_watched
    }
    if(entry.progress_key) body.progress_key = entry.progress_key
    return Api.rpc('sync_push_watch_progress', {
        p_entries: [body],
        p_profile_id: profile_id,
        p_origin_client_id: Auth.clientId()
    }).then(function(){ markSent(entry) })
}

function pushBatch(entries, profile_id){
    var batches = Api.chunk(entries, Outbox.MAX)
    var chain = Promise.resolve()
    batches.forEach(function(b){
        chain = chain.then(function(){
            return Api.rpc('sync_push_watch_progress', {
                p_entries: b.map(function(entry){
                    var body = {content_id: entry.content_id, content_type: entry.content_type, video_id: entry.video_id || Idmap.toVideoId(entry.content_id, entry.season, entry.episode), season: entry.season, episode: entry.episode, position: entry.position, duration: entry.duration, last_watched: entry.last_watched}
                    if(entry.progress_key) body.progress_key = entry.progress_key
                    return body
                }),
                p_profile_id: profile_id,
                p_origin_client_id: Auth.clientId()
            }).then(function(){ b.forEach(markSent) })
        })
    })
    return chain
}

function pull(profile_id, since_last_watched, limit){
    return Api.rpc('sync_pull_watch_progress', {p_profile_id: profile_id, p_since_last_watched: since_last_watched || 0, p_limit: limit || 1000})
}

function pullDelta(profile_id, since_event_id, limit){
    return Api.rpc('sync_pull_watch_progress_delta', {p_profile_id: profile_id, p_since_event_id: since_event_id || 0, p_limit: limit || 1000})
}

export default {shouldSend: shouldSend, markSent: markSent, push: push, pushBatch: pushBatch, pull: pull, pullDelta: pullDelta}
