import Storage from '../../../core/storage/storage'
import Select from '../../../interaction/select'
import Controller from '../../../core/controller'
import Lang from '../../../core/lang'
import Noty from '../../../interaction/noty'
import Input from '../../../interaction/settings/input'
import Loading from '../../../interaction/loading'
import Subscribe from '../../../utils/subscribe'
import Profiles from './profiles'
import Settings from './settings'

var icon_el = null
var listener = Subscribe()

function avatarHtml(row, size){
    size = size || 'size-medium'
    if(row.avatar_url) return '<img src="' + row.avatar_url + '" class="' + size + '" />'
    var color = row.avatar_color_hex || '#888'
    var letter = ((row.name || '#') + '').charAt(0).toUpperCase()
    return '<div class="' + size + '" style="background:' + color + ';border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#fff;">' + letter + '</div>'
}

function hasSession(){
    try {
        var enabled = Boolean(Storage.get('nuvio_enable', false))
        if(!enabled) return false
        var t = Storage.get('nuvio_tokens', {})
        return Boolean(t && t.access_token)
    } catch(e){ return false }
}

// Вбудовуємось у штатний open--profile замість окремої кнопки:
// якщо є Nuvio-сесія — клік відкриває Select профілів Nuvio, іконка — аватарка активного.
// Без сесії — штатна поведінка Cub (не чіпаємо).
function init(){
    try {
        // Чекаємо head, потім ховаємо штатний open--profile і ставимо свій поруч.
        // Свій елемент — з унікальним класом open--nuvio-profile, конфліктів з Cub немає.
        var mount = function(){
            var cub = $('.head .open--profile')
            if(!cub.length){ setTimeout(mount, 500); return }
            if($('.head .open--nuvio-profile').length){ icon_el = $('.head .open--nuvio-profile'); update(); return }
            icon_el = $('<div class="head__action selector open--nuvio-profile hide"></div>')
            icon_el.on('hover:enter', function(){ select(null) })
            cub.after(icon_el)
            Storage.listener.follow('change', function(e){
                if(e.name == 'nuvio_tokens' || e.name == 'nuvio_enable' || e.name == 'nuvio_active_profile' || e.name == 'account') update()
            })
            update()
        }
        mount()
    } catch(e){}
}

function update(){
    try {
        var cub = $('.head .open--profile')
        var own = $('.head .open--nuvio-profile')
        if(!own.length) return
        icon_el = own
        // Nuvio-сесія є — ховаємо Cub, показуємо свій з аватаркою активного
        if(hasSession() && Profiles.resolveActive()){
            cub.addClass('hide')
            own.removeClass('hide')
            var cached = null
            try { cached = Storage.get('nuvio_profiles_cache', []) || [] } catch(e){}
            var idx = Profiles.resolveActive()
            var row = null
            for(var i = 0; i < cached.length; i++){
                if(cached[i] && cached[i].profile_index == idx){ row = cached[i]; break }
            }
            own.empty()
            if(row) own.append($(avatarHtml(row, 'size-small')))
            else own.append($('<div class="size-small" style="background:#7c5cff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#fff;">N</div>'))
        }
        else {
            // Немає сесії — повертаємо штатний Cub, свій ховаємо
            own.addClass('hide')
            try {
                var Profile = window.Lampa && Lampa.Account ? Lampa.Account.Profile : null
                if(Profile && Profile.update) Profile.update()
            } catch(e){}
        }
    } catch(e){}
}

function refreshCache(){
    return Profiles.list().then(function(rows){
        rows = rows || []
        try { Storage.set('nuvio_profiles_cache', rows) } catch(e){}
        return rows
    })
}

function select(callback){
    var active = Profiles.resolveActive()
    Loading.start(function(){
        Loading.stop()
    })
    refreshCache().then(function(rows){
        Loading.stop()
        rows = rows || []
        if(!rows.length){
            Noty.show('Nuvio: ' + Lang.translate('account_profiles_empty'))
            if(callback) callback()
            return
        }
        var items = rows.map(function(r){
            return {
                title: r.name || ('#' + r.profile_index),
                template: 'selectbox_icon',
                icon: avatarHtml(r),
                subtitle: r.pin_enabled ? '🔒 PIN' : '',
                selected: active == r.profile_index,
                row: r
            }
        })
        Select.show({
            title: 'Nuvio',
            items: items,
            onSelect: function(a){
                if(callback) callback()
                pickProfile(a.row)
            },
            onBack: callback
        })
    }).catch(function(){
        Loading.stop()
        Noty.show(Lang.translate('network_error'))
        if(callback) callback()
    })
}

function pickProfile(row){
    if(!row) return
    if(row.pin_enabled){
        var controller = Controller.enabled().name
        Input.edit({title: Lang.translate('nuvio_pin'), value: '', free: true, nosave: true, nomic: true, password: true}, function(pin){
            Controller.toggle(controller)
            pin = (pin + '').replace(/\D/g, '').slice(0, 4)
            if(pin.length != 4) return
            Profiles.verifyPin(row.profile_index, pin).then(function(res){
                res = res && res[0] ? res[0] : res
                if(res && res.unlocked === false){
                    Settings.setStatus('error')
                    Noty.show('Nuvio PIN: ' + (res.retry_after_seconds || 0) + 's')
                    return
                }
                applyProfile(row.profile_index)
            }).catch(function(xhr){
                Noty.show('Nuvio: ' + (xhr && xhr.status ? xhr.status : 'error'))
            })
        })
    }
    else applyProfile(row.profile_index)
}

// Перемикання без костилів: пишемо активний профіль + мапінг на Lampa-профіль,
// розсилаємо подію — підписники (index.js deltaPoll) підхоплюють.
// Той самий контракт що Lampa: Listener.send('profile_select')
function applyProfile(idx){
    Profiles.setActive(idx)
    try {
        var m = Profiles.map()
        m[Profiles.lampaProfileId()] = idx
        Storage.set('nuvio_profile_map', m)
    } catch(e){}
    try { Settings.setStatus('ok') } catch(e){}
    update()
    listener.send('profile_select', {profile_index: idx})
}

export default {init: init, update: update, select: select, applyProfile: applyProfile, listener: listener}
