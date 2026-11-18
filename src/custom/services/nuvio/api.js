import Storage from '../../../core/storage/storage'

var CLOUD_URL = 'https://api.nuvio.tv'
var CLOUD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTIxMzQ2LCJleHAiOjE5MzkyMDEzNDZ9.tmQaj682pwzehpqlgCDMnySOqiUvpgRbrE43T4VJpDI'

function base(){
    var mode = Storage.field('nuvio_mode') || Storage.get('nuvio_mode', 'cloud')
    if(mode == 'selfhost'){
        var url = Storage.get('nuvio_backend_url', '')
        return (url + '').replace(/\/$/, '')
    }
    return CLOUD_URL
}

function anonKey(){
    try { var manual = Storage.get('nuvio_anon_key', ''); if(manual) return manual } catch(e){}
    try {
        var keys = Storage.get('nuvio_keys', {}) || {}
        var hit = keys[base()]
        if(hit) return hit
        if(base() == CLOUD_URL) return Storage.get('nuvio_cloud_key', '') || CLOUD_KEY
    } catch(e){}
    return base() == CLOUD_URL ? CLOUD_KEY : ''
}

var keyFlight = null

// Ключ крутиться на боці Nuvio: перед логіном тягнемо свіжий з
// base() + /.well-known/nuvio, ручний ключ і хардкод лишаються фолбеками
function refreshAnonKey(){
    if(keyFlight) return keyFlight
    keyFlight = new Promise(function(resolve){
        $.ajax({
            url: base() + '/.well-known/nuvio',
            method: 'GET',
            timeout: 10000,
            success: function(data){
                try {
                    if(data && data.publishable_key){
                        var keys = {}
                        try { keys = Storage.get('nuvio_keys', {}) || {} } catch(e){}
                        keys[base()] = data.publishable_key
                        Storage.set('nuvio_keys', keys)
                    }
                } catch(e){}
                resolve()
            },
            error: function(){ resolve() }
        })
    })
    // скидання асинхронно: success може прийти синхронно ще до присвоєння keyFlight
    keyFlight.then(function(){ keyFlight = null }, function(){ keyFlight = null })
    return keyFlight
}

function tokens(){
    try { return Storage.get('nuvio_tokens', {}) || {} } catch(e){ return {} }
}

function anonHeaders(){
    var k = anonKey()
    var h = {'Content-Type': 'application/json'}
    if(k){ h['apikey'] = k; h['Authorization'] = 'Bearer ' + k }
    return h
}

function headers(){
    var t = tokens()
    var h = {'Content-Type': 'application/json', 'apikey': anonKey()}
    if(t.access_token) h['Authorization'] = 'Bearer ' + t.access_token
    return h
}

function serialize(args){
    return JSON.parse(JSON.stringify(args || {}))
}

var refresher = null

function setRefresher(fn){ refresher = fn }

// Без повторів усередині запиту: вони тримали б чергу синхронізації до 36 с. Повтор робить
// сама синхронізація за наступною подією, а невідправлене лежить у Storage
function request(method, path, body, retryAuth){
    return new Promise(function(resolve, reject){
        $.ajax({
            url: base() + path,
            method: method,
            headers: headers(),
            data: body ? JSON.stringify(serialize(body)) : undefined,
            contentType: 'application/json',
            timeout: 15000,
            success: resolve,
            error: function(xhr){ reject(xhr) }
        })
    }).catch(function(xhr){
        var status = xhr && xhr.status
        if(status == 401 && !retryAuth && refresher){
            return Promise.resolve(refresher()).then(function(){
                return request(method, path, body, true)
            })
        }
        throw xhr
    })
}

function rpc(name, args){ return request('POST', '/rest/v1/rpc/' + name, args || {}) }
function rest(path){ return request('GET', path) }
function chunk(arr, n){ var out = []; for(var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }

export default {setRefresher: setRefresher, base: base, anonKey: anonKey, anonHeaders: anonHeaders, refreshAnonKey: refreshAnonKey, tokens: tokens, headers: headers, rpc: rpc, rest: rest, chunk: chunk, CLOUD_URL: CLOUD_URL, CLOUD_KEY: CLOUD_KEY}
