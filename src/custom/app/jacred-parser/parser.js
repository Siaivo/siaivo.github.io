// Чистий клієнтський порт парсера з .vscode/torrent.py (без мережі).
// Покриває: _parse_description, _fake_ffprobe, _extract_names_and_year,
// _normalize_tracker, _normalize_category, _guess_types, _human_size,
// LANG_MAP, HDR_MAP. Все синхронно, без fetch/Promise.
import Voices from '../../../components/torrents/voices'

// Мапи 1:1 з torrent.py
var LANG_MAP = {
    ua: 'ukr', uk: 'ukr', 'укр': 'ukr', 'укра': 'ukr', ukrainian: 'ukr',
    ru: 'rus', 'рус': 'rus', 'рос': 'rus', russian: 'rus',
    en: 'eng', 'англ': 'eng', english: 'eng',
    cn: 'chi', zh: 'chi', zho: 'chi', chi: 'chi'
}

var HDR_MAP = {
    hdr10: 'HDR10', 'hdr10+': 'HDR10+', hdr: 'HDR',
    'dolby vision': 'DV', dv: 'DV'
}

// Токени мов у тому ж порядку, що й RE_LANG у torrent.py
var LANG_TOKENS = [
    'ukr', 'uk', 'ua', 'укр', 'укра', 'ukrainian',
    'rus', 'ru', 'рус', 'рос', 'russian',
    'eng', 'en', 'англ', 'english',
    'de', 'deu', 'ger', 'german',
    'fr', 'fra', 'fre', 'french',
    'es', 'spa', 'spanish',
    'it', 'ita', 'italian',
    'pt', 'por', 'portuguese',
    'tr', 'tur', 'turkish',
    'ar', 'ara', 'arabic',
    'he', 'heb', 'hebrew',
    'ja', 'jpn', 'japanese',
    'ko', 'kor', 'korean',
    'zh', 'chi', 'zho', 'cn', 'chinese'
]

// ES5-safe джерела патернів (без lookbehind (?<!...), без (?i), без \b+кирилиця):
// - quality: (^|[^0-9]) замість (?<!\d), група 2 — число; [p\u0440]+прапорець i ловить "p"/"р"
// - langs: (^|[^a-z0-9]) + (?![a-z0-9]) (lookahead дозволений в ES5) на lowercased-рядку,
//   як у python: RE_LANG шукається саме по text.lower()
// - sub-теги: indexOf по lowercased-рядку + ручна перевірка меж (див. isWordChar)
var SRC_QUALITY = '(^|[^0-9])(2160|1080|720|480)\\s*[p\\u0440]'
var SRC_HDR = '\\b(HDR10\\+?|HDR|Dolby\\s*Vision|DV)\\b'
var SRC_CODEC = '\\b(H\\.264|H\\.265|HEVC|AVC|AV1|x264|x265)\\b'
var SRC_AUDIO_CH = '\\b(7\\.1|5\\.1|2\\.0)\\b'
var SRC_LANG = '(^|[^a-z0-9])(' + LANG_TOKENS.join('|') + ')(?![a-z0-9])'
var SRC_YEAR = '\\((19\\d{2}|20\\d{2})\\)'

// Суб-теги lowercased (SUB/Sub -> sub, СУБ/Суб -> суб), порядок як у RE_SUB_TAG
var SUB_TAGS = ['forced', 'full', 'sdh', 'sub', 'суб']

// Унікальність зі збереженням порядку
function uniq(list) {
    var out = []
    for (var i = 0; i < list.length; i++) {
        if (out.indexOf(list[i]) === -1) out.push(list[i])
    }
    return out
}

function normLang(token) {
    var t = (token || '').toLowerCase()
    return LANG_MAP[t] || t
}

function normHdr(token) {
    var t = (token || '').toLowerCase()
    return HDR_MAP[t] || (token || '').toUpperCase()
}

// Всі мови з lowercased-рядка (межі — тільки ascii, 1:1 з (?<![a-z0-9])...(?![a-z0-9]))
function findLangs(lower) {
    var rx = new RegExp(SRC_LANG, 'g')
    var out = []
    var m
    while ((m = rx.exec(lower)) !== null) out.push(normLang(m[2]))
    return uniq(out)
}

// Межа слова з урахуванням кирилиці (заміна \b, який у JS сліпий до кирилиці)
function isWordChar(ch) {
    if (!ch) return false
    if (/[a-z0-9_]/i.test(ch)) return true
    return ch >= 'Ѐ' && ch <= 'ӿ' // \u0400-\u04FF
}

// Позиції суб-тегів у lowercased-рядку, за зростанням індексу
function collectTagHits(lower) {
    var hits = []
    for (var t = 0; t < SUB_TAGS.length; t++) {
        var tag = SUB_TAGS[t]
        var from = 0
        while (true) {
            var at = lower.indexOf(tag, from)
            if (at === -1) break
            var before = at === 0 ? null : lower.charAt(at - 1)
            var after = at + tag.length >= lower.length ? null : lower.charAt(at + tag.length)
            if (!isWordChar(before) && !isWordChar(after)) hits.push({ index: at, len: tag.length, tag: tag })
            from = at + 1
        }
    }
    hits.sort(function (a, b) { return a.index - b.index })
    return hits
}

// Голоси: локальний список + indexOf, як у components/torrents/parser.js
function findVoices(text) {
    if (!text) return []
    var lower = text.toLowerCase()
    var hits = []
    for (var i = 0; i < Voices.length; i++) {
        var v = typeof Voices[i] === 'string' ? Voices[i].trim() : ''
        if (!v) continue
        var at = lower.indexOf(v.toLowerCase())
        if (at !== -1) hits.push({ v: v, at: at })
    }
    hits.sort(function (a, b) { return a.at - b.at })
    var out = []
    for (var j = 0; j < hits.length; j++) {
        if (out.indexOf(hits[j].v) === -1) out.push(hits[j].v)
    }
    return out
}

// Порт _parse_description (voices — синхронно, без мережі)
function parseDescription(title, desc) {
    title = title || ''
    desc = desc || ''
    var text = (title ? title + '\n' : '') + desc
    var lower = text.toLowerCase()

    var quality = null
    var qm = new RegExp(SRC_QUALITY, 'i').exec(text)
    if (qm) quality = parseInt(qm[2], 10)

    var hdr = []
    var hrx = new RegExp(SRC_HDR, 'gi')
    var hm
    while ((hm = hrx.exec(text)) !== null) hdr.push(normHdr(hm[1]))
    hdr = uniq(hdr)

    var codec = null
    var cm = new RegExp(SRC_CODEC, 'i').exec(text)
    if (cm) {
        codec = cm[1].toUpperCase()
        codec = codec.replace('X264', 'H.264').replace('X265', 'H.265')
        codec = codec.replace('HEVC', 'H.265').replace('AVC', 'H.264')
    }

    var langs = findLangs(lower)
    var voices = findVoices(text)

    // Субтитри: вікно -32/+64 символи навколо тегу, мови шукаємо у вікні
    var subs = []
    var hits = collectTagHits(lower)
    for (var i = 0; i < hits.length; i++) {
        var start = Math.max(0, hits[i].index - 32)
        var end = Math.min(lower.length, hits[i].index + hits[i].len + 64)
        var wlangs = findLangs(lower.slice(start, end))
        for (var j = 0; j < wlangs.length; j++) subs.push({ lang: wlangs[j], type: hits[i].tag })
    }
    if (subs.length) {
        var seen = []
        var usubs = []
        for (var k = 0; k < subs.length; k++) {
            var key = subs[k].lang + '|' + subs[k].type
            if (seen.indexOf(key) === -1) {
                seen.push(key)
                usubs.push(subs[k])
            }
        }
        subs = usubs
    }

    return { quality: quality, hdr: hdr, codec: codec, audio_languages: langs, voices: voices, subtitles: subs }
}

// Порт _fake_ffprobe: відео за quality, канали за 5.1/7.1, аудіо на мову, суб на суб
function fakeFfprobe(parsed, title) {
    parsed = parsed || {}
    var q = parsed.quality
    var codec = parsed.codec || 'H.264'
    var w = 0
    var h = 0
    if (q === 2160) { w = 3840; h = 2160 }
    else if (q === 1080) { w = 1920; h = 1080 }
    else if (q === 720) { w = 1280; h = 720 }
    else if (q === 480) { w = 854; h = 480 }

    var ch = 2
    var am = new RegExp(SRC_AUDIO_CH).exec(title || '')
    if (am) {
        if (am[1] === '5.1') ch = 6
        else if (am[1] === '7.1') ch = 8
    }

    // Без quality відео-заглушку 0x0 не емітимо — нема даних, нема тега
    var ff = []
    var idx = 0

    if (w > 0 && h > 0) {
        ff.push({
            index: idx,
            codec_type: 'video',
            codec_name: codec.toLowerCase().replace(/\./g, ''),
            width: w,
            height: h,
            tags: {}
        })
        idx++
    }
    var lower = (title || '').toLowerCase()
    var audioTitle = (lower.indexOf('dub') !== -1 || lower.indexOf('дуб') !== -1) ? 'Dubbing' : 'Original'
    var langs = parsed.audio_languages || []
    for (var i = 0; i < langs.length; i++) {
        ff.push({
            index: idx, codec_type: 'audio', codec_name: 'ac3', channels: ch,
            tags: { language: langs[i], title: audioTitle }
        })
        idx++
    }

    var subs = parsed.subtitles || []
    for (var s = 0; s < subs.length; s++) {
        ff.push({
            index: idx, codec_type: 'subtitle', codec_name: 'subrip',
            tags: { language: subs[s].lang, title: subs[s].type || 'full' }
        })
        idx++
    }

    return ff
}

// Порт _extract_names_and_year: рік з (YYYY), split " / " на name/originalname
function extractNamesAndYear(title) {
    if (!title) return { name: null, originalname: null, year: null }
    var year = null
    var ym = new RegExp(SRC_YEAR).exec(title)
    if (ym) year = parseInt(ym[1], 10)
    var part = title.split('(')[0].trim()
    var cut = part.indexOf(' / ')
    if (cut !== -1) {
        return { name: part.slice(0, cut).trim(), originalname: part.slice(cut + 3).trim(), year: year }
    }
    return { name: part, originalname: part, year: year }
}

// Порт _normalize_tracker: TrackerId як є, інакше перший сегмент Tracker
function normalizeTracker(item) {
    item = item || {}
    var tid = item.TrackerId
    if (typeof tid === 'string' && tid.trim()) return tid.trim()
    var t = item.Tracker
    if (typeof t === 'string' && t.trim()) return t.trim().toLowerCase().split('.')[0]
    return null
}

// Порт _normalize_category: пріоритет 2000 > 5000 > перший елемент
function normalizeCategory(cat) {
    var c = cat == null ? [] : (Array.isArray(cat) ? cat : [cat])
    if (!c.length) return []
    if (c.indexOf(2000) !== -1) return [2000]
    if (c.indexOf(5000) !== -1) return [5000]
    return [c[0]]
}

// Порт _guess_types: 5000 -> serial, інакше movie
function guessTypes(categoryList) {
    if (categoryList && categoryList.indexOf(5000) !== -1) return ['serial']
    return ['movie']
}

// Порт _human_size: GB/MB з двома знаками, null на нечислах
function humanSize(bytes) {
    try {
        if (typeof bytes !== 'number' || !isFinite(bytes)) return null
        var gb = bytes / Math.pow(1024, 3)
        if (gb >= 1) return gb.toFixed(2) + ' GB'
        return (bytes / Math.pow(1024, 2)).toFixed(2) + ' MB'
    }
    catch (e) {
        return null
    }
}

// Зручна обгортка: все разом + ffprobe.
// Форма як у torrent.py _transform: {ffprobe, languages, info} + плоскі поля для сумісності
function parse(title, desc) {
    var names = extractNamesAndYear(title)
    var p = parseDescription(title, desc)
    return {
        name: names.name,
        originalname: names.originalname,
        year: names.year,
        quality: p.quality,
        hdr: p.hdr,
        codec: p.codec,
        audio_languages: p.audio_languages,
        languages: p.audio_languages,
        voices: p.voices,
        subtitles: p.subtitles,
        ffprobe: fakeFfprobe(p, title),
        info: {
            name: names.name,
            originalname: names.originalname,
            quality: p.quality,
            relased: names.year,
            videotype: (p.hdr && p.hdr.length) ? 'hdr' : 'sdr',
            voices: p.voices
        }
    }
}

export { parseDescription, fakeFfprobe, extractNamesAndYear, normalizeTracker, normalizeCategory, guessTypes, humanSize, parse, LANG_MAP, HDR_MAP }

export default {
    parseDescription: parseDescription,
    fakeFfprobe: fakeFfprobe,
    extractNamesAndYear: extractNamesAndYear,
    normalizeTracker: normalizeTracker,
    normalizeCategory: normalizeCategory,
    guessTypes: guessTypes,
    humanSize: humanSize,
    parse: parse
}
