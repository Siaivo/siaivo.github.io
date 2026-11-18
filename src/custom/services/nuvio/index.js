import Storage from '../../../core/storage/storage'
import Settings from './settings'
import Head from './head'
import Sync from './sync'

var started = false

function enabled(){
    try { if(window.lampa_settings && window.lampa_settings.nuvio_use === true) return true } catch(e){}
    try { return Storage.get('nuvio_use', false) === true } catch(e){ return false }
}

function boot(){
    if(started || !enabled()) return
    started = true
    Settings.init()
    Head.init()
    Sync.init()
}

if (typeof window != 'undefined') {
    // Плагіни грузяться до app ready — перевіряємо прапорець там, а не на імпорті
    var wait = function(){
        if(!window.Lampa || !Lampa.Listener){ setTimeout(wait, 50); return }
        if(window.appready) boot()
        else Lampa.Listener.follow('app', function(e){ if(e.type == 'ready') boot() })
    }
    wait()
}
