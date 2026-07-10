import Api from '../../../core/api/api'
import Lang from '../../../core/lang'
import Template from '../../../interaction/template'
import LineModule from '../../../interaction/items/line/module/module'
import ContentRows from '../../../core/content_rows'

function patchAnimeCategory() {
    if (!Api.sources || !Api.sources.tmdb) {
        setTimeout(patchAnimeCategory, 0)
        return
    }

    var tmdb = Api.sources.tmdb
    var originalCategory = tmdb.category.bind(tmdb)

    tmdb.category = function(params, oncomplite, onerror) {
        var clean_onerror = onerror || function() {}
        if (params.url === 'anime_movie' || params.url === 'anime_tv') {
            return animeCategory(params, oncomplite, clean_onerror)
        }
        return originalCategory(params, oncomplite, clean_onerror)
    }
}

function animeCategory(params, oncomplite, onerror) {
    var isMovie = params.url === 'anime_movie'
    var mediaType = isMovie ? 'movie' : 'tv'
    var parts_limit = 6
    var tmdb = Api.sources.tmdb

    var baseParams = {
        genres: 16,
        orig_lang: 'zh|ja'
    }

    for (var key in params) {
        if (params.hasOwnProperty(key) && key !== 'url' && key !== 'title' && key !== 'source') {
            baseParams[key] = params[key]
        }
    }

    var animeUrl = function(extra) {
        return 'discover/' + mediaType + '?with_genres=16&with_original_language=zh|ja' + (extra ? '&' + extra : '')
    }

    var parts_data = [
        function(call) {
            tmdb.get('discover/' + mediaType, { ...baseParams, sort_by: 'popularity.desc' }, function(json) {
                json.title = Lang.translate('title_popular')
                json.icon_svg = Template.string('icon_fire')
                json.icon_bgcolor = '#fff'
                json.icon_color = '#fd4518'
                json.params = {
                    module: LineModule.toggle(LineModule.MASK.base, 'Icon')
                }
                json.url = animeUrl('sort_by=popularity.desc')
                call(json)
            }, call, { life: 60 * 24 * 3 })
        },
        function(call) {
            tmdb.get('discover/' + mediaType + '?vote_count.gte=200', { ...baseParams, sort_by: 'vote_average.desc' }, function(json) {
                json.title = Lang.translate('title_hight_voite')
                json.icon_svg = Template.string('icon_star')
                json.icon_bgcolor = '#fff'
                json.icon_color = '#212121'
                json.params = {
                    module: LineModule.toggle(LineModule.MASK.base, 'Icon')
                }
                json.url = animeUrl('vote_count.gte=200&sort_by=vote_average.desc')
                call(json)
            }, call, { life: 60 * 24 * 7 })
        },
        function(call) {
            var yearParam = isMovie ? 'primary_release_year' : 'first_air_date_year'
            var year = new Date().getFullYear() - 1
            tmdb.get('discover/' + mediaType + '?' + yearParam + '=' + year, baseParams, function(json) {
                json.title = Lang.translate('title_last_year')
                json.url = animeUrl(yearParam + '=' + year)
                call(json)
            }, call, { life: 60 * 24 * 7 })
        },
        function(call) {
            var dateParam = isMovie ? 'primary_release_date' : 'first_air_date'
            tmdb.get('discover/' + mediaType, { ...baseParams, sort_by: dateParam + '.desc' }, function(json) {
                json.title = Lang.translate('title_new')
                json.url = animeUrl('sort_by=' + dateParam + '.desc')
                call(json)
            }, call, { life: 60 * 24 * 7 })
        },
        function(call) {
            tmdb.get('discover/' + mediaType, { ...baseParams, sort_by: 'vote_count.desc' }, function(json) {
                json.title = Lang.translate('title_in_top')
                json.url = animeUrl('sort_by=vote_count.desc')
                call(json)
            }, call, { life: 60 * 24 * 7 })
        },
        function(call) {
            tmdb.get('discover/' + mediaType, { ...baseParams, sort_by: 'popularity.desc' }, function(json) {
                json.title = Lang.translate('title_this_week')
                json.url = animeUrl('sort_by=popularity.desc')
                call(json)
            }, call, { life: 60 * 24 * 3 })
        }
    ]

    var years = [2000, 2010, 2015]
    years.forEach(function(year) {
        var lte = (year + 5) + '-12-31'
        var gte = year + '-01-01'
        var reg = isMovie ? 'primary_release_date' : 'first_air_date'

        parts_data.push(function(call) {
            tmdb.get('discover/' + mediaType + '?' + reg + '.gte=' + gte + '&' + reg + '.lte=' + lte, baseParams, function(json) {
                json.title = Lang.translate('title_best_of_' + year)
                json.url = animeUrl(reg + '.gte=' + gte + '&' + reg + '.lte=' + lte)
                call(json)
            }, call, { life: 60 * 24 * 7 })
        })
    })

    var animeGenres = (Api.sources.tmdb.genres[mediaType] || []).filter(function(g) {
        return g.id !== 16
    })

    animeGenres.forEach(function(genre) {
        parts_data.push(function(call) {
            tmdb.get('discover/' + mediaType, { ...baseParams, genres: '16,' + genre.id }, function(json) {
                json.title = Lang.translate(genre.title.replace(/[^a-z_]/g, ''))
                json.url = 'discover/' + mediaType + '?with_genres=16,' + genre.id + '&with_original_language=zh|ja'
                call(json)
            }, call, { life: 60 * 24 * 7 })
        })
    })

    ContentRows.call('category_anime', params, parts_data)

    function loadPart(partLoaded, partEmpty) {
        Api.partNext(parts_data, parts_limit, partLoaded, partEmpty)
    }

    loadPart(oncomplite, onerror)
    return loadPart
}

patchAnimeCategory()
