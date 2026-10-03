import cors from '../../utils/cors'
import TMDB from '../../../core/tmdb/tmdb'
import Api from '../../../core/api/api'
import Storage from '../../../core/storage/storage'
import { RADARR, SONARR } from './feed-sources'

// Reguest кешує в IndexedDB (якщо увімкнено request_caching) — повторні відкриття стрічки без запитів.
const CACHE = { cache: { life: 60 * 24 * 3 } }

function getLang() {
    return Storage.field('tmdb_lang') || Storage.field('language') || 'en'
}

function get(network, url) {
    return new Promise((resolve, reject) => network.silent(url, resolve, reject, false, CACHE))
}

export function detectType(item) {
    if (item.type === 'cartoon-movie') return 'cartoon-movie'
    if (item.type === 'cartoon-series') return 'cartoon-series'

    if (item.type === 'anime') {
        if (item.format === 'film') return 'anime-movie'
        return 'anime'
    }

    if (item.format === 'film') return 'movie'
    if (item.format === 'serial') return 'serial'

    if (item.type === 'movie') return 'movie'
    if (item.type === 'serial') return 'serial'

    return 'movie'
}

function isTvType(type) {
    return ['serial', 'cartoon-series', 'anime'].includes(type)
}

function filterByYear(results, yearStart, type) {
    if (!results || results.length === 0) return null

    for (const r of results) {
        if (isTvType(type)) {
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

// Sonarr/Radarr через cors-проксі — лише tmdbId, деталі треба добирати окремо.
async function findTMDB(network, originalName, type, yearStart) {
    const config = isTvType(type) ? SONARR : RADARR

    try {
        const results = cors.unwrap(await get(network, config.search(originalName)))

        if (!Array.isArray(results) || results.length === 0) return null

        const match = filterByYear(results, yearStart, type)

        if (!match || !match[config.idField]) return null

        return {
            tmdbId: match[config.idField],
            matchConfidence: match.matchConfidence
        }
    } catch (e) {
        console.warn('Feed: TMDB match failed for', originalName, e)
        return null
    }
}

// Прямий пошук TMDB: без проксі і вже з усім, що треба картці (backdrop, overview, рейтинг, genre_ids).
async function searchTMDB(network, originalName, type) {
    const endpoint = isTvType(type) ? 'search/tv' : 'search/movie'

    try {
        const data = await get(network, TMDB.api(
            endpoint + '?api_key=' + TMDB.key() + '&query=' + encodeURIComponent(originalName) + '&language=' + getLang()
        ))
        return data.results || []
    } catch (e) {
        console.warn('Feed: TMDB search failed for', originalName, e)
        return []
    }
}

// Збіг за роком: серіал — рік старту ±tvRange, фільм — ±1.
function pickByYear(results, type, yearStart, tvRange) {
    const tv = isTvType(type)

    return results.find(r => {
        const year = parseInt(((tv ? r.first_air_date : r.release_date) || '').slice(0, 4))
        return year && yearStart && Math.abs(year - yearStart) <= (tv ? tvRange : 1)
    }) || null
}

async function fetchTMDBDetails(network, tmdbId, type) {
    const endpoint = isTvType(type) ? 'tv' : 'movie'

    try {
        return await get(network, TMDB.api(endpoint + '/' + tmdbId + '?api_key=' + TMDB.key() + '&language=' + getLang()))
    } catch (e) {
        console.warn('Feed: TMDB details fetch failed', tmdbId, e)
        return null
    }
}

// Порядок: точний збіг у пошуку TMDB (1 запит) -> Sonarr/Radarr + details -> нестрогий збіг у тому ж пошуку.
export async function mapItem(item, network) {
    const type = detectType(item)
    const originalName = item.originalName || item.name
    const results = await searchTMDB(network, originalName, type)

    let tmdbData = pickByYear(results, type, item.yearStart, 0)
    let matchConfidence = 'year'
    let tmdbId = tmdbData ? tmdbData.id : null

    if (!tmdbData) {
        const match = await findTMDB(network, originalName, type, item.yearStart)

        if (match) {
            tmdbId = match.tmdbId
            matchConfidence = match.matchConfidence
            tmdbData = await fetchTMDBDetails(network, tmdbId, type)
        } else {
            tmdbData = pickByYear(results, type, item.yearStart, 5) || results[0] || null
            matchConfidence = tmdbData ? 'first' : null
            tmdbId = tmdbData ? tmdbData.id : null
        }
    }

    const genres = !tmdbData ? []
        : tmdbData.genres ? tmdbData.genres.map(g => g.name)
        : Api.sources.tmdb.getGenresNameFromIds(isTvType(type) ? 'tv' : 'movie', tmdbData.genre_ids || [])

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
        season: isTvType(type) ? (item.lastReadySeason ? item.lastReadySeason.number : null) : null,
        episode: isTvType(type) ? (item.lastReadySeason ? item.lastReadySeason.lastReadyEpisode : null) : null,
        totalEpisodes: isTvType(type) ? (item.lastReadySeason ? item.lastReadySeason.readyEpisodesCount : null) : null,
        tmdbId: tmdbId,
        matchConfidence: matchConfidence,
        poster_path: tmdbData ? tmdbData.poster_path : null,
        backdrop_path: tmdbData ? tmdbData.backdrop_path : null,
        overview: tmdbData ? tmdbData.overview : '',
        release_date: tmdbData ? tmdbData.release_date : '',
        first_air_date: tmdbData ? tmdbData.first_air_date : '',
        vote_average: tmdbData ? tmdbData.vote_average : 0,
        origin_country: tmdbData ? (tmdbData.origin_country || []) : [],
        tmdb_genres: genres
    }
}
