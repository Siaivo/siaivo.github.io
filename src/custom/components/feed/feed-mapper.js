import cors from '../../utils/cors'
import TMDB from '../../../core/tmdb/tmdb'
import Storage from '../../../core/storage/storage'
import { RADARR, SONARR } from './feed-sources'

function getLang() {
    return Storage.field('tmdb_lang') || Storage.field('language') || 'en'
}

export function detectType(item) {
    if (item.format === 'film') return 'movie'

    if (item.format === 'serial') {
        const lastReady = item.lastReadySeason
        if (lastReady && lastReady.readyEpisodesCount === 0 && lastReady.lastReadyEpisode === null) {
            return 'movie'
        }
        return 'tv'
    }

    if (item.type === 'movie') return 'movie'
    if (item.type === 'cartoon-series') return 'tv'
    if (item.type === 'serial') return 'tv'

    return 'movie'
}

function filterByYear(results, yearStart, type) {
    if (!results || results.length === 0) return null

    for (const r of results) {
        if (type === 'tv') {
            if (r.firstAired && r.lastAired) {
                const first = new Date(r.firstAired).getFullYear()
                const last = new Date(r.lastAired).getFullYear()
                if (yearStart >= first && yearStart <= last) {
                    return { ...r, matchConfidence: 'range' }
                }
            }
        } else {
            if (r.year && Math.abs(r.year - yearStart) <= 1) {
                return { ...r, matchConfidence: 'exact' }
            }
        }
    }

    return { ...results[0], matchConfidence: 'first' }
}

export async function findTMDB(originalName, type, yearStart) {
    const config = type === 'tv' ? SONARR : RADARR

    try {
        const response = await fetch(config.search(originalName))
        const raw = await response.json()
        const results = cors.unwrap(raw)

        if (!Array.isArray(results) || results.length === 0) return null

        const match = filterByYear(results, yearStart, type)

        if (!match || !match[config.idField]) return null

        return {
            tmdbId: match[config.idField],
            matchConfidence: match.matchConfidence,
            title: match.title,
            firstAired: match.firstAired || null,
            lastAired: match.lastAired || null,
            year: match.year || null
        }
    } catch (e) {
        console.warn('Feed: TMDB match failed for', originalName, e)
        return null
    }
}

export async function findTMDBFallback(originalName, type, yearStart) {
    const endpoint = type === 'tv' ? 'search/tv' : 'search/movie'

    try {
        const url = TMDB.api(
            endpoint + '?api_key=' + TMDB.key() + '&query=' + encodeURIComponent(originalName) + '&language=' + getLang()
        )
        const response = await fetch(url)
        const data = await response.json()

        if (!data.results || data.results.length === 0) return null

        for (const result of data.results) {
            if (type === 'tv') {
                const resultYear = parseInt((result.first_air_date || '').slice(0, 4))
                if (resultYear && yearStart && Math.abs(resultYear - yearStart) <= 5) {
                    return {
                        tmdbId: result.id,
                        matchConfidence: 'year',
                        title: result.title || result.name,
                        overview: result.overview
                    }
                }
            } else {
                const resultYear = parseInt((result.release_date || '').slice(0, 4))
                if (resultYear && yearStart && Math.abs(resultYear - yearStart) <= 1) {
                    return {
                        tmdbId: result.id,
                        matchConfidence: 'year',
                        title: result.title || result.name,
                        overview: result.overview
                    }
                }
            }
        }

        const first = data.results[0]
        return {
            tmdbId: first.id,
            matchConfidence: 'first',
            title: first.title || first.name,
            overview: first.overview
        }
    } catch (e) {
        console.warn('Feed: TMDB fallback failed for', originalName, e)
        return null
    }
}

export async function mapItem(item) {
    const type = detectType(item)
    const originalName = item.originalName || item.name

    let match = await findTMDB(originalName, type, item.yearStart)
    if (!match) {
        match = await findTMDBFallback(originalName, type, item.yearStart)
    }

    let tmdbData = null
    if (match && match.tmdbId) {
        tmdbData = await fetchTMDBDetails(match.tmdbId, type)
    }

    return {
        title: item.name,
        originalName: item.originalName,
        slug: item.slug,
        posterUrl: item.posterUrl,
        imdbMark: item.imdbMark,
        yearStart: item.yearStart,
        yearEnd: item.yearEnd,
        genres: (item.genres || []).map(g => g.name),
        format: item.format,
        type: type,
        season: type === 'tv' ? (item.lastReadySeason ? item.lastReadySeason.number : null) : null,
        episode: type === 'tv' ? (item.lastReadySeason ? item.lastReadySeason.lastReadyEpisode : null) : null,
        totalEpisodes: type === 'tv' ? (item.lastReadySeason ? item.lastReadySeason.readyEpisodesCount : null) : null,
        tmdbId: match ? match.tmdbId : null,
        matchConfidence: match ? match.matchConfidence : null,
        poster_path: tmdbData ? tmdbData.poster_path : null,
        backdrop_path: tmdbData ? tmdbData.backdrop_path : null,
        overview: tmdbData ? tmdbData.overview : '',
        release_date: tmdbData ? tmdbData.release_date : '',
        first_air_date: tmdbData ? tmdbData.first_air_date : '',
        vote_average: tmdbData ? tmdbData.vote_average : 0,
        origin_country: tmdbData ? (tmdbData.origin_country || []) : [],
        tmdb_genres: tmdbData ? (tmdbData.genres || []).map(g => g.name) : []
    }
}

async function fetchTMDBDetails(tmdbId, type) {
    const endpoint = type === 'tv' ? 'tv' : 'movie'

    try {
        const url = TMDB.api(endpoint + '/' + tmdbId + '?api_key=' + TMDB.key() + '&language=' + getLang())
        const response = await fetch(url)
        return await response.json()
    } catch (e) {
        console.warn('Feed: TMDB details fetch failed', tmdbId, e)
        return null
    }
}
