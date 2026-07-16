import cors from '../../utils/cors'

export const KINOSTRAIN_API = 'https://api.kinostrain.com/api/catalog'

export const RADARR = {
    search: (title) => cors.proxied(
        'https://api.radarr.video/v1/search?q=' + encodeURIComponent(title)
    ),
    idField: 'TmdbId'
}

export const SONARR = {
    search: (term) => cors.proxied(
        'https://skyhook.sonarr.tv/v1/tvdb/search/en?term=' + encodeURIComponent(term)
    ),
    idField: 'tmdbId'
}
