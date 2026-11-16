import Cache from '../../utils/cache'

// A new title has no TMDB recommendations/similar for its first days, and the core caches that
// empty answer for a week. Report such an entry as stale: the request goes to the network again,
// and the entry is still the fallback if the network fails (utils/reguest.js cacheGet).
let getData = Cache.getData

function emptyList(key, result){
    return /\/(recommendations|similar)\b/.test(key) && result && result.value && Array.isArray(result.value.results) && !result.value.results.length
}

Cache.getData = function(store_name, key, life_time, return_meta){
    return getData.apply(this, arguments).then((result)=>{
        if (store_name == 'other' && return_meta && emptyList(key, result)) {
            return Object.assign({}, result, {time: 0})
        }

        return result
    })
}
