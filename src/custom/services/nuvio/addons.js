import Storage from '../../../core/storage/storage'
import Api from './api'
import Auth from './auth'
import Profiles from './profiles'

var applying = false
var deb = null

function rows(){
    try { return Storage.get('nuvio_profiles_cache', []) || [] } catch(e){ return [] }
}

function inherited(idx, list){
    list = list || rows()
    for(var i = 0; i < list.length; i++){
        if(list[i] && list[i].profile_index == idx) return Boolean(list[i].uses_primary_addons)
    }
    return false
}

// наслідування = читаємо профіль 1, писати в Y заборонено
function effective(idx, list){
    return inherited(idx, list) ? 1 : idx
}

function toPayload(list){
    return (list || []).filter(function(p){ return p && p.url }).map(function(p, i){
        return {url: p.url, name: p.name || '', enabled: p.status == 1, sort_order: i}
    })
}

// чисті обчислення для тесту: що додати/зняти/перемкнути, чужі локальні не чіпаємо
function computeSync(remote, local, applied){
    remote = remote || []
    local = local || []
    applied = applied || []
    var want = {}, has = {}
    remote.forEach(function(r){ if(r && r.url) want[r.url] = r })
    local.forEach(function(p){ if(p && p.url) has[p.url] = p })
    var add = remote.filter(function(r){ return r && r.url && !has[r.url] })
    var toggle = remote.filter(function(r){
        var p = r && r.url ? has[r.url] : null
        return p && ((p.status == 1) != Boolean(r.enabled))
    })
    var remove = applied.filter(function(url){ return url && !want[url] && has[url] }).map(function(url){ return has[url] })
    return {add: add, toggle: toggle, remove: remove}
}

function pull(pid){
    return Api.rest('/rest/v1/addons?profile_id=eq.' + pid + '&select=url,name,enabled,sort_order&order=sort_order').then(function(res){
        if(Array.isArray(res)) return res
        if(res && Array.isArray(res.rows)) return res.rows
        if(res && Array.isArray(res.data)) return res.data
        return res || []
    })
}

function push(list, pid){
    return Api.rpc('sync_push_addons', {
        p_addons: toPayload(list),
        p_profile_id: pid,
        p_origin_client_id: Auth.clientId()
    })
}

function plugins(){
    try { return (window.Lampa && Lampa.Plugins) ? Lampa.Plugins : null } catch(e){ return null }
}

function appliedGet(){
    try { return Storage.get('nuvio_addons_applied', []) || [] } catch(e){ return [] }
}

function apply(idx){
    idx = idx || Profiles.resolveActive()
    if(!idx) return Promise.resolve([])
    var P = plugins()
    if(!P) return Promise.resolve([])
    var target = effective(idx)
    return pull(target).then(function(remote){
        remote = remote || []
        var local = []
        try { local = P.get() || [] } catch(e){}
        // перший запуск: в Nuvio порожньо, локально є — пушимо вгору, нічого не тремо
        if(!remote.length && local.length && !inherited(idx)){
            return push(local, idx).then(function(){
                try { Storage.set('nuvio_addons_applied', local.map(function(p){ return p.url })) } catch(e){}
                return remote
            }).catch(function(){ return remote })
        }
        var plan = computeSync(remote, local, appliedGet())
        if(!plan.add.length && !plan.toggle.length && !plan.remove.length){
            try { Storage.set('nuvio_addons_applied', remote.map(function(r){ return r.url })) } catch(e){}
            return remote
        }
        applying = true
        try {
            plan.remove.forEach(function(p){ try { P.remove(p) } catch(e){} })
            plan.add.forEach(function(r){
                try { P.add({url: r.url, name: r.name || '', status: r.enabled ? 1 : 0}) } catch(e){}
            })
            if(plan.toggle.length){
                plan.toggle.forEach(function(r){
                    try {
                        var cur = P.get().filter(function(x){ return x && x.url == r.url })[0]
                        if(cur) cur.status = r.enabled ? 1 : 0
                    } catch(e){}
                })
                try { P.save() } catch(e){}
            }
            try { Storage.set('nuvio_addons_applied', remote.map(function(r){ return r.url })) } catch(e){}
        } finally { applying = false }
        return remote
    })
}

function pushCurrent(){
    if(applying) return Promise.resolve()
    var idx = Profiles.resolveActive()
    if(!idx || inherited(idx)) return Promise.resolve() // read-only: ніколи не пушимо з наслідуючого
    var P = plugins()
    if(!P) return Promise.resolve()
    var local = []
    try { local = P.get() || [] } catch(e){}
    return push(local, idx).then(function(){
        try { Storage.set('nuvio_addons_applied', local.map(function(p){ return p.url })) } catch(e){}
    }).catch(function(){})
}

function schedulePush(){
    clearTimeout(deb)
    deb = setTimeout(pushCurrent, 2000)
}

export default {apply: apply, pushCurrent: pushCurrent, schedulePush: schedulePush, inherited: inherited, effective: effective, toPayload: toPayload, computeSync: computeSync, isApplying: function(){ return applying }}
