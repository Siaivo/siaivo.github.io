import Api from './api'
import Auth from './auth'
import Outbox from './outbox'
import Dedupe from './dedupe'
import Idmap from './idmap'

function push(item, profile_id){
    return Api.rpc('sync_push_watched_items', {
        p_items: [{content_id: item.content_id, content_type: item.content_type, title: item.title || '', season: item.season, episode: item.episode, watched_at: item.watched_at}],
        p_profile_id: profile_id,
        p_origin_client_id: Auth.clientId()
    }).then(function(){
        Dedupe.update(profile_id, item.content_id, item.season, item.episode, item.watched_at)
    })
}

function pushBatch(items, profile_id){
    var batches = Api.chunk(items, Outbox.MAX)
    var chain = Promise.resolve()
    batches.forEach(function(b){
        chain = chain.then(function(){
            return Api.rpc('sync_push_watched_items', {
                p_items: b.map(function(item){
                    return {content_id: item.content_id, content_type: item.content_type, title: item.title || '', season: item.season, episode: item.episode, watched_at: item.watched_at}
                }),
                p_profile_id: profile_id,
                p_origin_client_id: Auth.clientId()
            }).then(function(){
                b.forEach(function(item){ Dedupe.update(profile_id, item.content_id, item.season, item.episode, item.watched_at) })
            })
        })
    })
    return chain
}

function remove(keys, profile_id){
    return Api.rpc('sync_delete_watched_items', {
        p_keys: keys.map(function(item){ return {content_id: item.content_id, season: item.season, episode: item.episode} }),
        p_profile_id: profile_id,
        p_origin_client_id: Auth.clientId()
    })
}

function pullAll(profile_id, limit){
    limit = limit || 500
    var all = []
    function page(p){
        return Api.rpc('sync_pull_watched_items', {p_profile_id: profile_id, p_page: p, p_page_size: limit}).then(function(rows){
            rows = rows || []
            all = all.concat(rows)
            if(rows.length == limit) return page(p + 1)
            return all
        })
    }
    return page(1)
}

function pullDelta(profile_id, since_event_id, limit){
    return Api.rpc('sync_pull_watched_items_delta', {p_profile_id: profile_id, p_since_event_id: since_event_id || 0, p_limit: limit || 1000})
}

export default {push: push, pushBatch: pushBatch, remove: remove, pullAll: pullAll, pullDelta: pullDelta}
