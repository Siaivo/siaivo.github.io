import Api from '../../../core/api/api'
import Storage from '../../../core/storage/storage'

function patchTranslationFallback() {
    if (!Api.sources || !Api.sources.tmdb) {
        setTimeout(patchTranslationFallback, 0)
        return
    }

    var tmdb = Api.sources.tmdb
    var originalFull = tmdb.full.bind(tmdb)

    tmdb.full = function(params, oncomplite, onerror) {
        var wrappedOnComplite = function(data) {
            var movie = data && data.movie
            if (movie) {
                var title = movie.title || movie.name || ''
                var hasNonLatin = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0400-\u04ff]/.test(title)
                var overviewEmpty = !movie.overview || !movie.overview.trim()
                var originalLang = movie.original_language
                var userLang = (Storage.field('tmdb_lang') || 'uk-UA').split('-')[0]
                var langMismatch = originalLang && originalLang !== userLang

                if ((hasNonLatin || overviewEmpty) && langMismatch) {
                    var mediaType = params.method || 'tv'
                    var mediaId = params.id

                    tmdb.get(mediaType + '/' + mediaId + '?append_to_response=translations', {}, function(transData) {
                        if (transData && transData.translations && transData.translations.translations) {
                            var tmdbLang = Storage.field('tmdb_lang') || 'uk-UA'
                            var langCode = tmdbLang.split('-')[0]

                            var currentTrans = transData.translations.translations.find(function(t) {
                                return t.iso_639_1 === langCode
                            })

                            if (currentTrans && currentTrans.data) {
                                if (!movie.overview || !movie.overview.trim()) {
                                    if (currentTrans.data.overview && currentTrans.data.overview.trim()) {
                                        movie.overview = currentTrans.data.overview
                                    }
                                }
                            }

                            var currentHasName = currentTrans && currentTrans.data && (currentTrans.data.name || currentTrans.data.title)
                            if (!currentHasName) {
                                var enTrans = transData.translations.translations.find(function(t) {
                                    return t.iso_639_1 === 'en' && t.data && (t.data.name || t.data.title)
                                })
                                if (enTrans && enTrans.data) {
                                    if (enTrans.data.title) movie.title = enTrans.data.title
                                    if (enTrans.data.name) movie.name = enTrans.data.name
                                    if (!movie.overview || !movie.overview.trim()) {
                                        if (enTrans.data.overview && enTrans.data.overview.trim()) {
                                            movie.overview = enTrans.data.overview
                                        }
                                    }
                                }
                            }
                        }
                        oncomplite(data)
                    }, function() {
                        oncomplite(data)
                    }, { life: 60 * 24 * 7 })
                    return
                }
            }
            oncomplite(data)
        }

        originalFull(params, wrappedOnComplite, onerror || function(){})
    }
}

patchTranslationFallback()
