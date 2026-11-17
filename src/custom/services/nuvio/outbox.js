import Storage from '../../../core/storage/storage'

var KEY = 'nuvio_queue'
var MAX = 500
var flushing = false

function load(){
    try { return Storage.get(KEY, []) || [] }
    catch(e){ return [] }
}

function save(q){
    try { Storage.set(KEY, q) } catch(e){}
}

function add(type, payload){
    var q = load()
    q.push({t: type, p: payload, at: Date.now()})
    // при переповненні: старі прогрес-записи згортаємо до останнього на ключ
    if(q.length > 2000){
        var last = {}
        q.forEach(function(e){
            if(e.t == 'progress' && e.p && e.p.progress_key) last[e.p.progress_key] = e
        })
        var ids = {}
        Object.keys(last).forEach(function(k){ ids[q.indexOf(last[k])] = true })
        q = q.filter(function(e, i){ return e.t != 'progress' || !e.p || !e.p.progress_key || ids[i] })
        q = q.slice(-2000)
    }
    save(q)
}

// Пакетами <=500. flush(fn) де fn(batch) -> Promise
function flush(fn){
    if(flushing) return Promise.resolve()
    flushing = true
    var q = load()
    var batch = q.slice(0, MAX)
    if(!batch.length){ flushing = false; return Promise.resolve() }
    return Promise.resolve(fn(batch)).then(function(){
        var rest = load().slice(batch.length)
        save(rest)
        flushing = false
        if(rest.length) return flush(fn)
    }).catch(function(e){
        flushing = false
        throw e
    })
}

function size(){ return load().length }
function clear(){ save([]) }

export default {add: add, flush: flush, load: load, size: size, clear: clear, KEY: KEY, MAX: MAX}
