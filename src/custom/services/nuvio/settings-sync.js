import Storage from '../../../core/storage/storage'
import Api from './api'
import Profiles from './profiles'

// Whitelist стабільних ключів інтерфейсу/плеєра. Секрети (токени, паролі,
// ключі), серверні URL, акаунт і стан синхрону сюди не потрапляють ніколи.
// Нові UI-ключі додавати сюди вручну за потреби.
var SAFE = ['animation', 'background', 'background_type', 'black_style', 'glass_style', 'glass_opacity',
    'interface_size', 'light_version', 'mask', 'menu_always', 'helper', 'adult_content_view',
    'card_views_type', 'card_interfice_type', 'card_interfice_cover', 'card_interfice_poster', 'card_interfice_reactions',
    'card_quality', 'card_episodes', 'poster_size', 'start_page',
    'screensaver', 'screensaver_type', 'screensaver_time',
    'keyboard_type', 'navigation_type', 'scroll_type', 'hide_outside_the_screen', 'advanced_animation',
    'cache_images', 'request_caching', 'pages_save_total',
    'language', 'tmdb_lang', 'tmdb_only_released', 'parse_lang', 'parse_timeout', 'parse_in_search',
    'parser_use', 'parser_torrent_type', 'parser_use_link', 'protocol', 'source', 'time_offset',
    'player', 'player_iptv', 'player_torrent', 'player_timecode', 'player_launch_trailers', 'player_rewind',
    'player_scale_method', 'player_hls_method', 'player_nw_path', 'player_external_fullscreen',
    'player_normalization', 'player_torrent_gst_warning', 'video_quality_default', 'playlist_next',
    'subtitles_size', 'subtitles_source', 'subtitles_lang', 'subtitles_ass_mode', 'subtitles_start',
    'subtitles_stroke', 'subtitles_backdrop', 'subtitles_ass_fonts', 'subtitles_ass_readable',
    'interface_sound_play', 'interface_sound_level']

// Пояс-захист: навіть якщо ключ колись потрапить у SAFE — секрети не поїдуть
var SECRET_RE = /token|password|_key|secret|pin_hash/i

// Той самий guard, що в index.js: увімкнено + є Nuvio-профіль + Cub-sync не активний.
// Власна копія замість імпорту index.js — інакше цикл index→settings→settings-sync→index.
function canRun(){
    try { if(!Storage.field('nuvio_enable') && !Storage.get('nuvio_enable', false)) return false } catch(e){ return false }
    try {
        var Permit = (window.Lampa && Lampa.Account && Lampa.Account.Permit) ? Lampa.Account.Permit : null
        if(Permit && Permit.sync) return false
    } catch(e){}
    return Boolean(Profiles.resolveActive())
}

function collect(){
    var lampa = {}
    SAFE.forEach(function(k){
        if(SECRET_RE.test(k)) return
        var v
        try { v = Storage.get(k) } catch(e){ return }
        if(typeof v == 'undefined' || v === null || v === '') return
        lampa[k] = v
    })
    return {lampa: lampa}
}

function pull(profile){
    return Api.rpc('sync_pull_profile_settings_blob', {p_profile_id: profile, p_platform: 'tv'}).then(function(rows){
        rows = rows || []
        return rows.length ? rows[0] : null
    })
}

// Експорт: свіжий pull заради updated_at → guarded push. 409 → 'conflict', не перезаписуємо.
function push(profile){
    return pull(profile).then(function(remote){
        var payload = JSON.parse(JSON.stringify(collect()))
        return Api.rpc('sync_push_profile_settings_blob_guarded', {
            p_profile_id: profile,
            p_settings_json: payload,
            p_platform: 'tv',
            p_expected_updated_at: remote ? remote.updated_at : null
        }).then(function(){ return 'ok' }).catch(function(xhr){
            if(xhr && xhr.status == 409) return 'conflict'
            throw xhr
        })
    })
}

// Імпорт: по ключах lampa через Storage.restore (як Cub), далі reload у викликача
function apply(data){
    var lampa = (data && data.lampa) || {}
    var keys = Object.keys(lampa)
    var done = 0
    var chain = Promise.resolve()
    keys.forEach(function(k){
        chain = chain.then(function(){
            var v = lampa[k]
            var raw = (v && typeof v == 'object') ? JSON.stringify(v) : v
            return Promise.resolve(Storage.restore(k, raw + '')).then(function(ok){ if(ok) done++ })
        })
    })
    return chain.then(function(){ return {imported: done, errors: keys.length - done} })
}

export default {canRun: canRun, collect: collect, pull: pull, push: push, apply: apply, SAFE: SAFE}
