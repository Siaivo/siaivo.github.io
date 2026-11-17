import Storage from '../../../core/storage/storage'
import Api from './api'
Api.setRefresher(refresh)

var flight = null

function saveTokens(data){
    Storage.set('nuvio_tokens', {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (parseInt(data.expires_in, 10) || 3600) * 1000 - 60000
    })
}

function login(email, password){
    return new Promise(function(resolve, reject){
        $.ajax({
            url: Api.base() + '/auth/v1/token?grant_type=password',
            method: 'POST',
            headers: {'apikey': Api.anonKey(), 'Content-Type': 'application/json'},
            data: JSON.stringify({email: email, password: password}),
            success: function(data){
                saveTokens(data)
                registerDevice().then(function(){ resolve(data) }, function(){ resolve(data) })
            },
            error: function(xhr){ reject(xhr) }
        })
    })
}

// single-flight: два паралельні 401 дають один refresh
function refresh(){
    if(flight) return flight
    var t = Api.tokens()
    if(!t.refresh_token) return Promise.reject({status: 401})
    flight = new Promise(function(resolve, reject){
        $.ajax({
            url: Api.base() + '/auth/v1/token?grant_type=refresh_token',
            method: 'POST',
            headers: {'apikey': Api.anonKey(), 'Content-Type': 'application/json'},
            data: JSON.stringify({refresh_token: t.refresh_token}),
            success: function(data){ saveTokens(data); flight = null; resolve(data) },
            error: function(xhr){ flight = null; reject(xhr) }
        })
    })
    return flight
}

function logout(){
    try { Storage.set('nuvio_tokens', {}) } catch(e){}
}

function clientId(){
    var id = Storage.get('nuvio_client_id', '')
    if(!id){
        // Nuvio приймає 16..96 символів [A-Za-z0-9_-]
        id = 'lampa-' + (Math.random().toString(36).slice(2) + Date.now().toString(36) + '0000000000').slice(0, 20)
        try { Storage.set('nuvio_client_id', id) } catch(e){}
    }
    return id
}

function registerDevice(){
    var info = {p_installation_id: clientId(), p_client_name: 'lampa-me'}
    try {
        if(window.navigator && window.navigator.userAgent) info.p_device_name = window.navigator.userAgent.slice(0, 128)
        if(window.lampa_settings && window.lampa_settings.version) info.p_client_version = window.lampa_settings.version + ''
    } catch(e){}
    return Api.rpc('register_current_device', info).catch(function(){ return null })
}

export default {login: login, refresh: refresh, logout: logout, clientId: clientId, registerDevice: registerDevice, saveTokens: saveTokens}
