import Reguest from '../../../utils/reguest'

var ANIZIP = 'https://api.ani.zip'

var network = new Reguest()
var MEM = {}   // mal_id -> { id: <Number|null>, method }

// tmdb_id канонічно ЧИСЛО (так його віддає TMDB API і зберігає решта Lampa). ani.zip
// присилає рядок — приводимо до числа, інакше Favorite.remove/Arrays.remove (строге
// indexOf) не знайдуть запис, і доданий тайтл не зніметься через TMDB.
function numId(v) {
    if (v == null || v === '') return null
    var n = Number(v)
    return isNaN(n) ? null : n
}

// resolve(malId, cb) -> cb({ id: <Number|null>, method }) або cb(null) при помилці мережі.
function resolve(malId, cb) {
    cb = cb || function() {}

    if (malId == null) return cb(null)

    if (MEM[malId]) return cb(MEM[malId])

    network.silent(ANIZIP + '/mappings?mal_id=' + malId, function(json) {
        var map = (json && json.mappings) || {}
        var res = {
            id: numId(map.themoviedb_id),
            method: String(map.type || '').toUpperCase() === 'MOVIE' ? 'movie' : 'tv'
        }

        MEM[malId] = res

        cb(res)
    }, function() {
        cb(null)
    }, false, false)
}

export default {
    resolve: resolve
}
