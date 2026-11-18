import Storage from '../../../core/storage/storage'
import Api from './api'

function list(){
    return Api.rpc('sync_pull_profiles', {})
}

function verifyPin(profile_id, pin){
    return Api.rpc('verify_profile_pin', {p_profile_id: profile_id, p_pin: pin})
}

// n/n/nuvio_profile_map {lampa_profile_id: profile_index}
function map(){
    try { return Storage.get('nuvio_profile_map', {}) || {} } catch(e){ return {} }
}

function activeProfile(){
    // 1 — основний профіль Nuvio, він є навіть коли список профілів порожній
    try { return Storage.get('nuvio_active_profile', 1) || 1 } catch(e){ return 1 }
}

function setActive(profile_index){
    try { Storage.set('nuvio_active_profile', profile_index) } catch(e){}
}

function lampaProfileId(){
    try {
        if(window.Lampa && Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.profile) return Lampa.Account.Permit.profile.id || 0
    } catch(e){}
    return 0
}

function resolveActive(){
    var m = map()
    var lid = lampaProfileId()
    if(m && typeof m[lid] != 'undefined') return m[lid]
    return activeProfile()
}

export default {list: list, verifyPin: verifyPin, map: map, activeProfile: activeProfile, setActive: setActive, resolveActive: resolveActive, lampaProfileId: lampaProfileId}
