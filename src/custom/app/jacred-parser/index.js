/**
 * JacRed parser client integration
 * Enriches torrent cards with locally parsed fields (quality/HDR/codec/langs/subs/ffprobe)
 * Disabled by default, no network requests, render never throws
 */

import { init as initSettings } from './settings'
import Storage from '../../../core/storage/storage'
import Parser from './parser'
import SourceParser from '../../../core/api/sources/parser'

// Memo cache (LRU, ~100 entries), key = title + '|' + desc.length
var memo = null

try {
    memo = typeof Map !== 'undefined' ? new Map() : null
} catch (e) {
    memo = null
}

var memoFallback = {}
var memoOrder = []

function memoGet(key) {
    try {
        if (memo) return memo.get(key) || null
        return memoFallback[key] || null
    } catch (e) {
        return null
    }
}

function memoSet(key, val) {
    try {
        if (memo) {
            if (memo.has(key)) memo.delete(key)
            memo.set(key, val)
            if (memo.size > 100) memo.delete(memo.keys().next().value)
            return
        }
        if (!memoFallback.hasOwnProperty(key)) memoOrder.push(key)
        memoFallback[key] = val
        while (memoOrder.length > 100) delete memoFallback[memoOrder.shift()]
    } catch (e) {}
}

// Render queue, flushed in batches of 20 via setTimeout to keep scroll smooth.
// Кожен запис: {element, item} — item потрібен щоб домалювати ffprobe-теги,
// бо картка вже відмальована до події 'render'.
var queue = []
var flushing = false

// Defensive access, parser.js may not exist yet (parallel branch)
function getParser() {
    try {
        if (Parser && typeof Parser.parse === 'function') return Parser
    } catch (e) {}
    return null
}

// Працюємо тільки з Jackett: Prowlarr/TorrServer мають свій формат,
// користі від локального парсинга там нема, лише навантаження
function isEnabled() {
    try {
        var pv = Storage.field('jacred_parse')
        if (pv !== true && pv !== 'true') return false
        var type = Storage.field('parser_torrent_type')
        return !type || type === 'jackett'
    } catch (e) {
        return false
    }
}

// Вирізаємо нульові відео-потоки (0x0) — таке не малюємо взагалі
function sanitizeFfprobe(element) {
    try {
        if (!element || !element.ffprobe || !element.ffprobe.length) return
        var clean = []
        for (var i = 0; i < element.ffprobe.length; i++) {
            var s = element.ffprobe[i]
            if (s && s.codec_type === 'video' && !(s.width > 0 && s.height > 0)) continue
            clean.push(s)
        }
        element.ffprobe = clean
    } catch (e) {}
}

// Merge parsed fields only, never overwrite Title/Tracker/Size/Seeders
function applyParsed(element, parsed) {
    if (!parsed || typeof parsed !== 'object') return
    try {
        if (!element.ffprobe && parsed.ffprobe) element.ffprobe = parsed.ffprobe
        if (!element.languages && parsed.languages) element.languages = parsed.languages
        if (parsed.info && typeof parsed.info === 'object') {
            if (!element.info || typeof element.info !== 'object') element.info = {}
            for (var k in parsed.info) {
                if (parsed.info.hasOwnProperty(k) && typeof element.info[k] === 'undefined') {
                    element.info[k] = parsed.info[k]
                }
            }
        }
        sanitizeFfprobe(element)
    } catch (e) {}
}

function enrichOne(entry) {
    try {
        var element = entry && entry.element
        var item = entry && entry.item
        var P = getParser()
        if (!P || !element) return
        // Вже збагачено на рівні джерела і намальовано штатним кодом — домалювання дало б дублі
        if (element._jacred) return
        var title = element.Title || element.title
        if (!title) return
        var desc = element.Description || element.description || ''
        try {
            desc = String(desc).slice(0, 2000)
        } catch (e) {
            desc = ''
        }
        var key = title + '|' + desc.length
        var hit = memoGet(key)
        if (hit) {
            applyParsed(element, hit)
        }
        else {
            var parsed = P.parse(title, desc)
            if (!parsed) return
            memoSet(key, parsed)
            applyParsed(element, parsed)
        }
        // Картка вже відмальована (подія 'render' приходить після append),
        // тому домалювуємо ffprobe-теги прямо в DOM, як це робить
        // parserbridge-проксі: дані вже є в element до малювання.
        paintFfprobe(element, item)
    } catch (e) {}
}

// Домалювання ffprobe-тегів у вже відмальовану картку.
// Повторює логіку src/components/torrents.js append(): resolution/video/channels/audio/subtitle.
function paintFfprobe(element, item) {
    try {
        if (!element || !element.ffprobe || !item) return
        var box = null
        try {
            box = item.find('.torrent-item__ffprobe')
        }
        catch (e) {
            box = null
        }
        if (!box || !box.length) return
        // Не дублюємо при повторному проході
        if (box.attr('data-jacred') === '1') return

        var tags = []
        var general = element.general || {}
        var quality = general.resolution || (element.info && element.info.quality ? qualityText(element.info.quality + 'p') : '')
        if (!quality || /^0p$/i.test(quality)) quality = ''

        if (quality) tags.push({ media: 'resolution', value: quality })

        var video = null
        for (var vi = 0; vi < element.ffprobe.length; vi++) {
            var cand = element.ffprobe[vi]
            if (cand && cand.codec_type === 'video' && cand.width > 0 && cand.height > 0) {
                video = cand
                break
            }
        }

        if (!quality && video) {
            var rq = qualityText(resolutionQuality(video.width, video.height, 'p'))
            if (rq && !/^0p$/i.test(rq)) tags.push({ media: 'resolution', value: rq })
        }

        if (video && video.width > 0 && video.height > 0) tags.push({ media: 'video', value: video.width + 'x' + video.height })

        var has71 = false
        var has51 = false
        var audios = []
        var subs = []
        for (var si = 0; si < element.ffprobe.length; si++) {
            var s = element.ffprobe[si]
            if (s.codec_type === 'audio' && s.channels === 8) has71 = true
            if (s.codec_type === 'audio' && s.channels === 6) has51 = true
            if (s.codec_type === 'audio' && s.tags) audios.push(s)
            if (s.codec_type === 'subtitle' && s.tags) subs.push(s)
        }

        if (has71) tags.push({ media: 'channels', value: '7.1' })
        if (has51) tags.push({ media: 'channels', value: '5.1' })

        for (var ai = 0; ai < audios.length; ai++) {
            var line = []
            var lang = ((audios[ai].tags && audios[ai].tags.language) || '').toUpperCase()
            var aname = (audios[ai].tags && (audios[ai].tags.title || audios[ai].tags.handler_name)) || ''
            if (lang) line.push(lang)
            if (aname && lang !== 'ENG') line.push(String(aname).slice(0, 20))
            if (line.length) tags.push({ media: 'audio', value: line.join(' - ') })
        }

        var slangs = []
        for (var qi = 0; qi < subs.length; qi++) {
            var sl = ((subs[qi].tags && subs[qi].tags.language) || '').toUpperCase()
            if (sl && slangs.indexOf(sl) === -1) slangs.push(sl)
        }
        for (var ti = 0; ti < slangs.slice(0, 4).length; ti++) tags.push({ media: 'subtitle', value: slangs[ti] })
        if (slangs.length > 4) tags.push({ media: 'subtitle', value: '+' + (slangs.length - 4) })

        // Дедуп як в оригіналі
        var seen = []
        var uniqTags = []
        for (var gi = 0; gi < tags.length; gi++) {
            var gk = tags[gi].value + tags[gi].media
            if (seen.indexOf(gk) === -1) {
                seen.push(gk)
                uniqTags.push(tags[gi])
            }
        }

        for (var bi = 0; bi < uniqTags.length; bi++) {
            try {
                box.append('<div class="m-' + uniqTags[bi].media + '">' + uniqTags[bi].value + '</div>')
            }
            catch (e) {}
        }

        try {
            if (box.find('> div').length) box.removeClass('hide')
            box.attr('data-jacred', '1')
        }
        catch (e) {}
    }
    catch (e) {}
}

// Локальні копії Utils.resolutionToQuality/qualityToText (без важкого імпорту Utils)
function resolutionQuality(width, height, symbol) {
    if (!(width > 0) || !(height > 0)) return symbol ? '' : 0
    var quality = 0
    if (width >= 3830) quality = 2160
    else if (width >= 2550) quality = 1440
    else if (width >= 1910) quality = 1080
    else if (width >= 1014) quality = 720
    else if (width >= 710) quality = 480
    else if (width >= 630) quality = 360
    if (!quality) return symbol ? '' : 0
    if (symbol) quality += symbol
    return quality
}

function qualityText(quality) {
    if (!quality || /^0p$/i.test(quality)) return ''
    if (quality === '2160p') return '4K'
    if (quality === '1440p') return '2K'
    if (quality === '1080p') return 'FHD'
    if (quality === '720p') return 'HD'
    if (quality === '480p') return 'SD'
    if (quality === '360p') return 'LD'
    return quality ? String(quality) : ''
}

function flush() {
    try {
        var batch = queue.splice(0, 20)
        for (var i = 0; i < batch.length; i++) {
            try {
                enrichOne(batch[i])
            } catch (e) {}
        }
    } catch (e) {}
    if (queue.length) setTimeout(flush, 0)
    else flushing = false
}

function schedule() {
    if (flushing) return
    flushing = true
    setTimeout(flush, 0)
}

function init() {
    if (!window.Lampa || !Lampa.Listener) {
        setTimeout(init, 50)
        return
    }

    try {
        initSettings()
    } catch (e) {}

    // Manual cache reset hook, mirrors torrentBadgesReload pattern
    window.jacredReload = function () {
        try {
            if (memo && memo.clear) memo.clear()
            memoFallback = {}
            memoOrder = []
        } catch (e) {}
        // Скидаємо прапорці щоб повторний рендер/перезавантаження списку підхопило дані
        try {
            queue.length = 0
            flushing = false
        } catch (e) {}
    }

    // Патч рівня джерела: збагачуємо Results ДО build()/append(),
    // як це робить parserbridge-проксі — дані вже є в element до малювання.
    // Синхронний парсинг в колбеку Parser.get: дані приходять готовими,
    // картка малює ffprobe-теги штатним кодом, без paintFfprobe.
    try {
        if (SourceParser && typeof SourceParser.get === 'function' && !SourceParser.get._jacred_patched) {
            var origGet = SourceParser.get
            var patchedGet = function (params, oncomplite, onerror) {
                return origGet.call(SourceParser, params, function (data) {
                    try {
                        if (isEnabled() && data && data.Results && typeof Parser.parse === 'function') {
                            for (var i = 0; i < data.Results.length; i++) {
                                (function (element) {
                                    try {
                                        if (!element) return
                                        var title = element.Title || element.title
                                        if (!title) return
                                        var desc = String(element.Description || element.description || '').slice(0, 2000)
                                        var key = title + '|' + desc.length
                                        var hit = memoGet(key)
                                        if (!hit) {
                                            hit = Parser.parse(title, desc)
                                            if (hit) memoSet(key, hit)
                                        }
                                        if (hit) {
                                            applyParsed(element, hit)
                                            element._jacred = true
                                        }
                                    } catch (e) {}
                                })(data.Results[i])
                            }
                        }
                    } catch (e) {}
                    if (typeof oncomplite === 'function') oncomplite(data)
                }, onerror)
            }
            patchedGet._jacred_patched = true
            patchedGet._jacred_orig = origGet
            SourceParser.get = patchedGet
        }
    } catch (e) {}

    Lampa.Listener.follow('torrent', function (e) {
        try {
            if (!e || e.type !== 'render') return

            // Off by default + Jackett only, zero parse cost otherwise
            if (!isEnabled()) return

            var el = e.element
            if (!el || el._jacred_queued) return
            // Збагачено до append() — штатний код вже намалював теги, черга не потрібна
            if (el._jacred) return
            el._jacred_queued = true
            // Fallback для елементів, що обійшли патч джерела, — розпарсити і домалювати тут же.
            queue.push({ element: el, item: e.item })
            schedule()
        } catch (err) {}
    })
}

init()
