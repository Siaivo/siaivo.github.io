import Storage from './storage/storage'
import Platform from './platform'
import Utils from '../utils/utils'
import Activity from '../interaction/activity/activity'

const SAVE_PREFIX = 'infuse://x-callback-url/save?'
const PLAY_PREFIX = 'infuse://x-callback-url/play?'
const SEASON_EPISODE_RE = /\[S(\d+):E(\d+)\]/i

const DEFAULTS = {
    mode: 'play', // save | play | save_and_play
    seasonOnly: true,
    maxItems: 40,
    maxUrlLength: 65536,
    // false = не добавлять [источник] в filename; true + data.source = показывать [MODS]
    filenameSource: true,
    // false = без озвучки; true + voice_name/title = показывать в filename
    filenameVoice: true
}

function parsePositiveInt(value) {
    let parsed = parseInt(value, 10)
    return !isNaN(parsed) && parsed > 0 ? parsed : null
}

function stripText(value) {
    if (!value) return ''
    let text = Utils.clearHtmlTags ? Utils.clearHtmlTags(String(value)) : String(value).replace(/<[^>]*>/g, '')
    return text.replace(/\s+/g, ' ').trim()
}

function pad2(value) {
    let num = parseInt(value, 10) || 0
    return num < 10 ? '0' + num : '' + num
}

function sanitizeStreamUrl(url) {
    return String(url || '').replace('&preload', '&play').replace(/\s/g, '%20')
}

function normalizePlayData(data) {
    if (!data) return data

    if (typeof data.url === 'string') {
        data.url = sanitizeStreamUrl(data.url)
    }

    if (Array.isArray(data.playlist)) {
        data.playlist.forEach((item) => {
            if (item && typeof item.url === 'string') {
                item.url = sanitizeStreamUrl(item.url)
            }
        })
    }

    return data
}

function serializePlaylist(playlist) {
    if (!Array.isArray(playlist) || !playlist.length) return ''

    let safe = playlist
        .filter((item) => item && !item.separator && typeof item.url === 'string')
        .map((item) => {
            let entry = {
                url: sanitizeStreamUrl(item.url)
            }

            if (item.title) entry.title = stripText(item.title)

            return entry
        })

    if (!safe.length) return ''

    try {
        return encodeURIComponent(JSON.stringify(safe))
    } catch (e) {
        return ''
    }
}

function serializeJson(value) {
    if (value == null) return ''

    try {
        return encodeURIComponent(JSON.stringify(value))
    } catch (e) {
        return ''
    }
}

function compareStreamUrl(a, b) {
    if (!a || !b) return false

    a = sanitizeStreamUrl(a)
    b = sanitizeStreamUrl(b)

    if (a === b) return true

    let baseA = a.split('?')[0]
    let baseB = b.split('?')[0]

    if (baseA !== baseB) return false

    let indexA = (a.match(/[?&]index=(\d+)/i) || [])[1]
    let indexB = (b.match(/[?&]index=(\d+)/i) || [])[1]

    if (indexA != null || indexB != null) return indexA === indexB

    return true
}

function parseEpisodeMeta(item) {
    if (!item) return { season: null, episode: null }

    let season = parsePositiveInt(item.season != null ? item.season : item.season_number)
    let episode = parsePositiveInt(item.episode != null ? item.episode : item.episode_number)

    if ((!season || !episode) && item.subtitle) {
        let subtitle = stripText(item.subtitle)
        let episodeMatch = subtitle.match(/(\d+)\s*$/)
        if (!episode) episode = parsePositiveInt(episodeMatch && episodeMatch[1])
    }

    if ((!season || !episode) && item.title) {
        let title = String(item.title)
        let match = title.match(SEASON_EPISODE_RE)

        if (match) {
            if (!season) season = parsePositiveInt(match[1])
            if (!episode) episode = parsePositiveInt(match[2])
        }
        else if (!episode) {
            let episodeMatch = title.match(/^(\d+)\s*\//) || title.match(/(?:^|\s)(\d{1,3})\s*[-–]\s/)
            if (episodeMatch) episode = parsePositiveInt(episodeMatch[1])
        }
    }

    return { season, episode }
}

function getRawPlaylist(data) {
    if (!data || !Array.isArray(data.playlist)) return []
    return data.playlist.filter((item) => item && !item.separator)
}

function enrichPlayItem(data, item) {
    item = item || {}
    let fromItem = parseEpisodeMeta(item)
    let patch = {}

    if (item.season == null && fromItem.season != null) patch.season = fromItem.season
    else if (item.season == null && data && data.season != null) patch.season = data.season

    if (item.episode == null && fromItem.episode != null) patch.episode = fromItem.episode

    if (!Object.keys(patch).length) return item

    return Object.assign({}, item, patch)
}

function resolvePlaylist(data) {
    let playlist = getRawPlaylist(data)

    if (!playlist.length) {
        if (data && data.url) return [enrichPlayItem(data, data)]
        return []
    }

    return playlist.map((item) => enrichPlayItem(data, item))
}

function findPlayItem(data, playlist) {
    playlist = playlist || resolvePlaylist(data)

    if (!playlist.length) return data

    let currentUrl = data && data.url ? sanitizeStreamUrl(data.url) : ''

    if (currentUrl) {
        for (let i = 0; i < playlist.length; i++) {
            if (compareStreamUrl(playlist[i].url, currentUrl)) return playlist[i]
        }
    }

    let dataMeta = parseEpisodeMeta(data)

    if (dataMeta.episode != null) {
        for (let i = 0; i < playlist.length; i++) {
            let meta = parseEpisodeMeta(playlist[i])

            if (dataMeta.episode !== meta.episode) continue
            if (dataMeta.season != null && meta.season != null && dataMeta.season !== meta.season) continue

            return playlist[i]
        }
    }

    return data
}

function normalizeLaunchMode(mode) {
    if (mode === 'save' || mode === 'play' || mode === 'save_and_play') return mode
    return DEFAULTS.mode
}

function isTorrentStream(data) {
    if (!data) return false
    if (data.torrent_hash) return true

    let url = String(data.url || '')

    return /\/stream\/[^?]+\?link=/.test(url)
}

function resolveInfuseMode(data) {
    if (data && data.infuse_mode) return normalizeLaunchMode(data.infuse_mode)

    let stored = Storage.field('infuse_launch_mode') || DEFAULTS.mode

    if (stored === 'ask') return normalizeLaunchMode(DEFAULTS.mode)

    return normalizeLaunchMode(stored)
}

function resolveOptions(data, callbacks = {}) {
    data = data || {}

    let season = data.season != null ? parseInt(data.season, 10) : null
    if ((season == null || isNaN(season)) && data) {
        season = parseEpisodeMeta(data).season
    }

    return {
        mode: resolveInfuseMode(data),
        seasonOnly: isTorrentStream(data) ? false : (data.infuse_season_only !== false),
        season,
        maxItems: data.infuse_max_items || DEFAULTS.maxItems,
        maxUrlLength: data.infuse_max_url_length || DEFAULTS.maxUrlLength,
        source: data.source || '',
        x_success: callbacks.x_success,
        x_error: callbacks.x_error
    }
}

function getExtension(item) {
    if (!item || typeof item.url !== 'string') return '.mkv'

    let path = item.url.split('?')[0].split('#')[0].toLowerCase()
    let extMatch = /\.([a-z0-9]{2,5})$/i.exec(path)

    if (extMatch) return '.' + extMatch[1].toLowerCase()

    return '.mkv'
}

function resolveCard(data) {
    if (data && (data.card || data.movie)) return data.card || data.movie

    let activity = Activity.active()

    if (activity && (activity.card || activity.movie)) return activity.card || activity.movie

    return null
}

function getHumanTitle(movie) {
    if (!movie) return ''
    let rawTitle = (movie.original_name || movie.original_title || movie.name || movie.title || '').trim()
    return stripText(rawTitle) || ''
}

function isSeriesMedia(movie, item, data) {
    if (movie) {
        if (movie.media_type === 'tv') return true
        if (movie.first_air_date || movie.number_of_seasons || movie.number_of_episodes) return true
        if (movie.name && !movie.title && !movie.release_date) return true
    }

    let meta = parseEpisodeMeta(item || data)
    if (meta.season != null || meta.episode != null) return true
    if (data && (data.season != null || data.episode != null)) return true

    return false
}

function resolveMediaTitle(movie, data, item) {
    let title = getHumanTitle(movie)
    if (title) return title

    let sources = [
        data && data.title,
        item && item.title,
        data && data.path
    ]

    for (let i = 0; i < sources.length; i++) {
        if (!sources[i]) continue

        title = stripText(String(sources[i]))
            .replace(SEASON_EPISODE_RE, '')
            .replace(/\s*\[[^\]]*\]\s*/g, ' ')
            .replace(/\s*\(\d{4}\)\s*/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()

        if (title) return title
    }

    return ''
}

function resolveMovieYear(movie, data, item) {
    let year = getMovieYear(movie)
    if (year) return year

    let text = [data && data.title, item && item.title].filter(Boolean).join(' ')
    let match = text.match(/\((\d{4})\)/)

    return match ? match[1] : ''
}

function formatSourceLabel(raw) {
    if (!raw) return ''
    let name = stripText(raw)
    if (!name) return ''

    let bracketIdx = name.indexOf('[')
    if (bracketIdx !== -1) name = name.slice(0, bracketIdx).trim()

    name = name.replace(/[^\w\u0400-\u04FF.-]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!name) return ''

    let first = name.split(/\s+/)[0]

    if (first.endsWith("'s") || first.endsWith('s')) {
        first = first.replace(/['']s$/i, '').replace(/s$/i, '')
    }

    return first || name.split(/\s+/)[0]
}

function formatVoiceLabel(item, isSeries, humanTitle) {
    if (!item) return ''

    let voiceName = stripText(item.voice_name)
    let title = stripText(item.title)

    if (!voiceName && !isSeries && title && !SEASON_EPISODE_RE.test(title)) {
        voiceName = title
    }

    if (!voiceName) return ''
    if (humanTitle && voiceName.toLowerCase() === humanTitle.toLowerCase()) return ''

    return voiceName.replace(/[\\\/:*?"<>|]/g, '').trim()
}

function sanitizeFilenamePart(text) {
    if (!text) return ''
    return stripText(text)
        .replace(/[\\\/:*?"<>|\[\]]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
}

function appendFilenameTag(base, label) {
    let part = sanitizeFilenamePart(label)
    if (!part) return base
    return base + ' [' + part + ']'
}

function getSubtitleUrl(item, data) {
    let subs = (item && item.subtitles) || (data && data.subtitles)

    if (!subs || !Array.isArray(subs) || !subs.length) return ''

    for (let i = 0; i < subs.length; i++) {
        if (subs[i] && subs[i].url) return String(subs[i].url)
    }

    return ''
}

function getMovieYear(movie) {
    if (!movie) return ''
    let year = String(movie.release_date || movie.first_air_date || '').slice(0, 4)
    return year && year !== '0000' ? year : ''
}

function shouldUseCleanFilename(mode, data) {
    let launchMode = normalizeLaunchMode(mode)

    if (launchMode === 'play') return true
    if (isTorrentStream(data) && launchMode === 'save_and_play') return true

    return false
}

function getTorrentFileMeta(item) {
    let segment = ''

    if (item && item.path) {
        segment = String(item.path).split('/').pop()
    } else if (item && item.url) {
        segment = String(item.url).split('?')[0].split('/').pop() || ''

        try {
            segment = decodeURIComponent(segment)
        } catch (e) {}
    }

    if (!segment) {
        return {
            name: 'file',
            extension: getExtension(item)
        }
    }

    let dotIndex = segment.lastIndexOf('.')

    if (dotIndex <= 0) {
        return {
            name: segment,
            extension: getExtension(item)
        }
    }

    return {
        name: segment.slice(0, dotIndex),
        extension: segment.slice(dotIndex)
    }
}

function generateTorrentFilename(item, movie, data, launchMode) {
    data = data || item || {}
    item = item || {}

    let fileMeta = getTorrentFileMeta(item)
    let isSeries = isSeriesMedia(movie, item, data)
    let mode = normalizeLaunchMode(launchMode)
    let name = fileMeta.name.replace(/\s*\{tmdb-\d+\}\s*/gi, '').trim()
    let ext = fileMeta.extension || getExtension(item)

    if (!name) name = 'file'

    if (!isSeries && mode !== 'play' && movie && movie.id && name.indexOf('{tmdb-') === -1) {
        name += ' {tmdb-' + movie.id + '}'
    }

    return name + ext
}

function generateFilename(item, movie, sourceOverride, data, launchMode) {
    data = data || item || {}
    let extension = getExtension(item)
    let meta = parseEpisodeMeta(item)
    let season = meta.season != null ? meta.season : data.season
    let episode = meta.episode != null ? meta.episode : data.episode

    if (isTorrentStream(data) && episode == null && item && item.path) {
        let match = item.path.split('/').pop().replace(/\.[^.]+$/, '').match(/[Ss][\s._-]?(\d+)[\s._-]?[Ee][\s._-]?(\d+)/i)

        if (match) {
            season = parseInt(match[1], 10) || season || 1
            episode = parseInt(match[2], 10)
        }
    }

    let playItem = Object.assign({}, data, item, { season, episode })
    let isSeries = isSeriesMedia(movie, playItem, data)
    let humanTitle = resolveMediaTitle(movie, data, playItem)
    let voiceLabel = formatVoiceLabel(playItem, isSeries, humanTitle)
    let sourceLabel = formatSourceLabel(sourceOverride || playItem.source || data.source || '')
    let cleanFilename = shouldUseCleanFilename(launchMode, data)
    let base = ''

    if (isSeries && (season || episode)) {
        let titlePart = sanitizeFilenamePart(humanTitle) || 'Series'
        base = titlePart + '-S' + pad2(season || 1) + '-E' + pad2(episode || 1)
    } else {
        let titlePart = sanitizeFilenamePart(humanTitle) || 'Movie'
        let year = resolveMovieYear(movie, data, playItem)
        base = year ? titlePart + '-' + year : titlePart
    }

    if (!cleanFilename) {
        if (voiceLabel && DEFAULTS.filenameVoice) base = appendFilenameTag(base, voiceLabel)
        if (sourceLabel && DEFAULTS.filenameSource) base = appendFilenameTag(base, sourceLabel)
    }

    if (isSeries) {
        base = base.replace(/\s*\{tmdb-\d+\}\s*/gi, '').trim()
    } else if (normalizeLaunchMode(launchMode) !== 'play' && movie && movie.id && base.indexOf('{tmdb-') === -1) {
        base += ' {tmdb-' + movie.id + '}'
    }

    return base + extension
}

function getResumePosition(data) {
    if (!data || !data.timeline) return 0
    let tl = data.timeline

    if (tl.time != null && !isNaN(tl.time) && tl.time > 1) {
        return Math.max(0, Math.floor(tl.time))
    }

    if (tl.percent != null && tl.duration != null && tl.duration > 0) {
        let percent = tl.percent > 1 ? tl.percent / 100 : tl.percent
        return Math.max(0, Math.floor(tl.duration * percent))
    }

    return 0
}

function linkToQueryPart(link, position) {
    let part = 'url=' + encodeURIComponent(link.url)

    if (position != null && !isNaN(position) && position > 0) {
        part += '&position=' + Math.floor(position)
    }

    if (link.filename) part += '&filename=' + encodeURIComponent(link.filename)
    if (link.sub) part += '&sub=' + encodeURIComponent(link.sub)

    return part
}

function appendCallbacks(query, callbacks) {
    callbacks = callbacks || {}

    if (callbacks.x_success) query += '&x-success=' + encodeURIComponent(callbacks.x_success)
    if (callbacks.x_error) query += '&x-error=' + encodeURIComponent(callbacks.x_error)

    return query
}

function buildSaveQuery(links, callbacks, data) {
    let query = links.map((link) => linkToQueryPart(link)).join('&')

    if (!isTorrentStream(data)) query += '&download=0'

    return appendCallbacks(query, callbacks)
}

function buildPlayQuery(links, resumePosition, callbacks) {
    let query = links.map((link, index) => linkToQueryPart(link, index === 0 ? resumePosition : null)).join('&')

    return appendCallbacks(query, callbacks)
}

function buildAppleTvPlayUrl(links, resumePosition, callbacks) {
    callbacks = callbacks || {}

    let playlist = encodeURIComponent(JSON.stringify(links.map((item) => ({
        url: item.url,
        filename: item.filename
    }))))

    let infuseUrl = PLAY_PREFIX
        + 'url=' + encodeURIComponent(links[0].url)

    if (links[0].filename) infuseUrl += '&filename=' + encodeURIComponent(links[0].filename)
    if (links[0].sub) infuseUrl += '&sub=' + encodeURIComponent(links[0].sub)
    if (resumePosition > 0) infuseUrl += '&position=' + Math.floor(resumePosition)

    infuseUrl += '&playlist=' + playlist

    return appendCallbacks(infuseUrl, callbacks)
}

function buildPlayLaunchUrl(playLinks, resumePosition, callbacks) {
    if (Platform.is('apple_tv') === true) {
        return buildAppleTvPlayUrl(playLinks, resumePosition, callbacks)
    }

    return PLAY_PREFIX + buildPlayQuery(playLinks, resumePosition, callbacks)
}

function buildSaveAndPlayUrl(saveLinks, playLinks, data, resumePosition, callbacks) {
    if (isTorrentStream(data)) {
        return SAVE_PREFIX + buildSaveQuery(saveLinks, callbacks, data)
    }

    let playUrl = buildPlayLaunchUrl(playLinks, resumePosition, callbacks)

    return SAVE_PREFIX + buildSaveQuery(saveLinks, {
        x_success: playUrl,
        x_error: callbacks.x_error
    }, data)
}

function buildLaunchUrl(saveLinks, playLinks, data, options) {
    playLinks = playLinks && playLinks.length ? playLinks : saveLinks
    if (!playLinks.length) return ''

    if (!saveLinks.length) saveLinks = playLinks

    options = options || {}
    let mode = normalizeLaunchMode(options.mode)
    let resumePosition = getResumePosition(data)
    let callbacks = resolveCallbacks(options)

    if (mode === 'save') {
        return SAVE_PREFIX + buildSaveQuery(saveLinks, callbacks, data)
    }

    if (mode === 'play') {
        return buildPlayLaunchUrl(playLinks, resumePosition, callbacks)
    }

    return buildSaveAndPlayUrl(saveLinks, playLinks, data, resumePosition, callbacks)
}

function buildLaunchUrlLength(saveLinks, playLinks, data, options) {
    options = options || {}
    let mode = normalizeLaunchMode(options.mode)

    if (mode === 'play') {
        return buildLaunchUrl([], playLinks, data, options).length
    }

    return buildLaunchUrl(saveLinks, playLinks, data, options).length
}

function getPlaylistItems(data) {
    return resolvePlaylist(data).filter((item) => typeof item.url === 'string')
}

function findStartIndex(items, data) {
    if (!items.length) return 0

    data = data || {}

    let currentUrl = data.url ? sanitizeStreamUrl(data.url) : ''

    if (currentUrl) {
        for (let i = 0; i < items.length; i++) {
            if (compareStreamUrl(items[i].url, currentUrl)) return i
        }
    }

    let dataMeta = parseEpisodeMeta(data)

    if (dataMeta.episode != null) {
        for (let i = 0; i < items.length; i++) {
            let meta = parseEpisodeMeta(items[i])

            if (dataMeta.episode !== meta.episode) continue
            if (dataMeta.season != null && meta.season != null && dataMeta.season !== meta.season) continue

            return i
        }
    }

    return 0
}

function rotatePlayLinks(links, startIndex) {
    if (!startIndex || startIndex <= 0 || startIndex >= links.length) return links

    return links.slice(startIndex).concat(links.slice(0, startIndex))
}

function buildLink(url, item, movie, sourceName, data, launchMode) {
    let playItem = item || {}
    if (!playItem.url) playItem.url = url

    return {
        url: sanitizeStreamUrl(url),
        filename: isTorrentStream(data)
            ? generateTorrentFilename(playItem, movie, data, launchMode)
            : generateFilename(playItem, movie, sourceName, data, launchMode),
        sub: getSubtitleUrl(playItem, data)
    }
}

function buildLinksForItems(data, items, movie, source, options, launchMode, startIndex) {
    startIndex = startIndex || 0
    let links = []
    let torrent = isTorrentStream(data)
    let probeMode = launchMode

    if (torrent) {
        if (launchMode === 'play') probeMode = 'play'
        else if (launchMode === 'save_and_play') probeMode = 'save'
    }

    for (let i = 0; i < items.length && links.length < options.maxItems; i++) {
        let playItem = enrichPlayItem(data, items[i])
        let link = buildLink(items[i].url, playItem, movie, source, data, launchMode)
        let nextSave = links.concat([link])
        let nextPlay = rotatePlayLinks(nextSave, startIndex)
        let probeLength = buildLaunchUrlLength(nextSave, nextPlay, data, {
            mode: probeMode,
            x_success: options.x_success,
            x_error: options.x_error
        })

        if (probeLength > options.maxUrlLength && links.length) break

        links.push(link)
    }

    return links
}

function buildLinksFromPlayData(data, movie, options) {
    if (!data) return { saveLinks: [], playLinks: [] }

    options = options || resolveOptions(data)
    let source = formatSourceLabel(options.source)
    let launchMode = normalizeLaunchMode(options.mode)
    let items = getPlaylistItems(data)

    if (options.seasonOnly && options.season) {
        let targetSeason = options.season
        items = items.filter((item) => {
            let meta = parseEpisodeMeta(item)
            if (meta.season == null && data.season != null) meta.season = data.season
            return meta.season === targetSeason
        })
    }

    let startIndex = findStartIndex(items, data)
    let saveLinks = buildLinksForItems(data, items, movie, source, options, launchMode, startIndex)
    let playLinks = rotatePlayLinks(saveLinks, startIndex)

    if (!saveLinks.length && data.url) {
        let link = buildLink(data.url, enrichPlayItem(data, findPlayItem(data)), movie, source, data, launchMode)
        saveLinks = [link]
        playLinks = [link]
    }

    return { saveLinks, playLinks }
}

/**
 * Сборка infuse://x-callback-url/… по документации Firecore:
 * https://support.firecore.com/hc/ru/articles/215090997
 *
 * play/save: url + filename + sub + position (сек), download=0 для save
 * save_and_play: save?…&x-success=encode(play?…)
 * torrent save_and_play: только save (play→save и save→play ломают TorrServer в Infuse)
 * torrent save: filename = имя файла из path/url (как в ITS), без download=0
 *
 * data.url — текущий поток
 * data.playlist — эпизоды (season, episode, url)
 * data.subtitles — [{url}] → параметр sub
 * data.source — в filename если DEFAULTS.filenameSource = true
 * DEFAULTS.filenameSource / filenameVoice — выкл/вкл суффиксы в имени
 */
function buildExternalUrl(data, callbacks) {
    if (!data || !data.url) return null

    let options = resolveOptions(data, callbacks)
    let { saveLinks, playLinks } = buildLinksFromPlayData(data, resolveCard(data), options)

    if (!saveLinks.length) return null

    return buildLaunchUrl(saveLinks, playLinks, data, options)
}

function resolveCallbacks(callbacks) {
    callbacks = callbacks || {}
    let appleTvClient = Storage.field('apple_tv_client') ?? 'lampa'

    return {
        x_success: callbacks.x_success || (appleTvClient + '://infuseDidFinish'),
        x_error: callbacks.x_error || (appleTvClient + '://infuseDidFail')
    }
}

function buildFallbackUrl(data, callbacks) {
    if (!data || !data.url) return null

    callbacks = resolveCallbacks(callbacks)

    let movie = resolveCard(data)
    let playItem = enrichPlayItem(data, findPlayItem(data))
    let source = formatSourceLabel(data.source || '')
    let options = resolveOptions(data, callbacks)
    let link = buildLink(data.url, playItem, movie, source, data, options.mode)
    let url = link.url

    if (Platform.is('apple_tv') === true) {
        let playlist = serializePlaylist(data.playlist)
        let infuseUrl = PLAY_PREFIX + 'url=' + encodeURIComponent(url)

        if (link.filename) infuseUrl += '&filename=' + encodeURIComponent(link.filename)
        if (link.sub) infuseUrl += '&sub=' + encodeURIComponent(link.sub)

        let resumePosition = getResumePosition(data)
        if (resumePosition > 0) infuseUrl += '&position=' + Math.floor(resumePosition)
        if (playlist) infuseUrl += '&playlist=' + playlist

        return appendCallbacks(infuseUrl, callbacks)
    }

    let query = 'url=' + encodeURIComponent(url)
    if (link.filename) query += '&filename=' + encodeURIComponent(link.filename)
    if (link.sub) query += '&sub=' + encodeURIComponent(link.sub)

    return PLAY_PREFIX + appendCallbacks(query, callbacks)
}

/**
 * Полный URL для Infuse: save_and_play + filenames, иначе простой play?url=…
 */
function resolveUrl(data, callbacks) {
    normalizePlayData(data)
    callbacks = resolveCallbacks(callbacks)

    return buildExternalUrl(data, callbacks) || buildFallbackUrl(data, callbacks)
}

export default {
    buildExternalUrl,
    buildFallbackUrl,
    buildLinksFromPlayData,
    buildLaunchUrl,
    generateFilename,
    formatSourceLabel,
    resolveCard,
    resolveCallbacks,
    resolveOptions,
    resolveUrl,
    normalizePlayData,
    serializeJson,
    serializePlaylist
}
