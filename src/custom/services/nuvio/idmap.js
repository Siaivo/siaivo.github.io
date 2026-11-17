import Utils from '../../../utils/utils'

// Картка Lampa -> {content_id: '<TMDB id>', ...} (V1: реальний Nuvio зберігає голий id без префікса). Персони -> null.
function isPerson(card){
    if(!card || typeof card != 'object') return true
    return Boolean(card.profile_path || card.known_for_department || typeof card.gender != 'undefined')
}

function fromCard(card, season, episode){
    if(!card || !card.id || isPerson(card)) return null
    var id = parseInt(card.id)
    if(isNaN(id)) return null
    var isSeries = Boolean(card.original_name)
    var item = {
        content_id: id + '',
        content_type: isSeries ? 'series' : 'movie',
        title: card.original_name || card.original_title || card.name || card.title || ''
    }
    if(typeof season != 'undefined' && season !== null) item.season = season
    else if(card.season) item.season = card.season
    if(typeof episode != 'undefined' && episode !== null) item.episode = episode
    else if(card.episode) item.episode = card.episode
    return item
}

// road.card з Timeline: 'tv_1396' / 'movie_550' (+ можливий префікс джерела)
function fromRoadCard(key, season, episode){
    if(!key) return null
    var clean = (key + '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(-64)
    var m = clean.match(/(?:^|_)(tv|movie)_(\d+)$/)
    if(!m) return null
    var item = {content_id: m[2], content_type: m[1] == 'tv' ? 'series' : 'movie', title: ''}
    if(typeof season != 'undefined' && season !== null) item.season = season
    if(typeof episode != 'undefined' && episode !== null) item.episode = episode
    return item
}

function toVideoId(content_id, season, episode){
    var num = (content_id + '').replace(/^tmdb:/, '')
    if(season && episode) return num + '_s' + season + 'e' + episode
    return num
}

function secToMs(s){ return Math.round((parseFloat(s) || 0) * 1000) }
function msToSec(ms){ return Math.round((parseInt(ms, 10) || 0) / 1000) }

function hashOf(card){
    try { return Utils.hash(card.original_name || card.original_title || (card.id + '')) }
    catch(e){ return 0 }
}

export default {fromCard: fromCard, fromRoadCard: fromRoadCard, toVideoId: toVideoId, secToMs: secToMs, msToSec: msToSec, isPerson: isPerson, hashOf: hashOf}
