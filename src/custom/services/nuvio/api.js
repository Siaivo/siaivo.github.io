import Storage from '../../../core/storage/storage'

var CLOUD_URL = 'https://api.nuvio.tv'
var CLOUD_KEY = 'sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN'

function base(){
    var mode = Storage.field('nuvio_mode') || Storage.get('nuvio_mode', 'cloud')
    if(mode == 'selfhost'){
        var url = Storage.get('nuvio_backend_url', '')
        return (url + '').replace(/\/$/, '')
    }
    return CLOUD_URL
}

function anonKey(){
    var mode = Storage.field('nuvio_mode') || Storage.get('nuvio_mode', 'cloud')
    if(mode == 'selfhost') return Storage.get('nuvio_anon_key', '')
    return CLOUD_KEY
}

function tokens(){
    try { return Storage.get('nuvio_tokens', {}) || {} } catch(e){ return {} }
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

export default {setRefresher: setRefresher, base: base, anonKey: anonKey, tokens: tokens, headers: headers, rpc: rpc, rest: rest, chunk: chunk, CLOUD_URL: CLOUD_URL, CLOUD_KEY: CLOUD_KEY}
