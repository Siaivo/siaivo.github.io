import Api from '../../../core/api/api'
import Storage from '../../../core/storage/storage'
import Reguest from '../../../utils/reguest'
import AnimeMap from '../../utils/anime-map'

// Fallback назви/опису аніме через Hikka.io для full-картки.
//
// TMDB часто не має українського перекладу аніме: назва лишається ромадзі/японською/англійською,
// а опис — порожній або лише англійський. Hikka (україномовна база) майже завжди має title_ua/
// synopsis_ua. Тут ДОЗАПОВНЮЄМО пропуски даними Hikka — ЛИШЕ для аніме (визначаємо через AnimeMap)
// і ЛИШЕ для українського UI (tmdb_lang=uk).
//
// Обгортаємо Api.sources.tmdb.full ПОВЕРХ translation-fallback (імпорт у index.js — після нього),
// тож наш oncomplite отримує дані ВЖЕ після TMDB-перекладів і латає тільки те, що лишилось порожнім/
// неперекладеним. Картку ніколи не роняємо (будь-яка помилка Hikka -> oncomplite з наявними даними).
//
// Переклад шукаємо для 1-го (найменшого) mal_id, що відповідає tmdb-елементу (AnimeMap.malsOf()[0]).
// Hikka (через той самий шлюз, що siavo-anime):
//   GET /integrations/mal/anime/{mal} -> { slug, title_ua, ... } (без синопсису)
//   GET /anime/{slug}                 -> { title_ua, synopsis_ua, ... }
// Другий запит робимо лише коли потрібен опис.
var API  = 'https://apx.lme.isroot.in/hikka'   // CORS-шлюз: /hikka/<path> -> api.hikka.io/<path>
var week = 60 * 24 * 7

var network = new Reguest()

function hasCyrillic(s) {
    return /[Ѐ-ӿ]/.test(s || '')
}

// Синопсис Hikka — markdown із футером-атрибуцією. Робимо простий текст:
//   - прибираємо хвіст «Джерело … [MyAnimeList](url)» (лише якщо там є посилання — щоб не зачепити
//     випадкове слово в тілі);
//   - markdown-посилання [текст](url "title") -> лишаємо тільки текст;
//   - базові html-сутності (&nbsp; &amp; …) -> символи; схлопуємо подвійні пробіли.
function cleanSynopsis(text) {
    if (!text) return text

    var s = String(text)

    s = s.replace(/\s*Джерело[\s\S]*$/, function(m) {
        return /\]\([^)]*\)/.test(m) ? '' : m
    })
    s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    s = s.replace(/&nbsp;/g, ' ')
         .replace(/&lt;/g, '<')
         .replace(/&gt;/g, '>')
         .replace(/&quot;/g, '"')
         .replace(/&#39;/g, "'")
         .replace(/&amp;/g, '&')
    s = s.replace(/[ \t]{2,}/g, ' ')

    return s.trim()
}

// mal -> дані Hikka. ok({ title_ua, synopsis_ua }) | ok(null). needDescr=false -> без 2-го запиту.
function fetchHikka(mal, needDescr, ok) {
    network.silent(API + '/integrations/mal/anime/' + mal, function(info) {
        if (!info) return ok(null)
        if (!needDescr || !info.slug) return ok({ title_ua: info.title_ua })

        network.silent(API + '/anime/' + info.slug, function(detail) {
            ok(detail || info)
        }, function() { ok(info) }, false, { cache: { life: week } })
    }, function() { ok(null) }, false, { cache: { life: week } })
}

function patchHikkaFallback() {
    if (!Api.sources || !Api.sources.tmdb) {
        setTimeout(patchHikkaFallback, 0)
        return
    }

    var tmdb = Api.sources.tmdb
    var prevFull = tmdb.full.bind(tmdb)

    tmdb.full = function(params, oncomplite, onerror) {
        var wrappedOnComplite = function(data) {
            var movie = data && data.movie
            if (!movie) return oncomplite(data)

            var userLang = (Storage.field('tmdb_lang') || 'uk-UA').split('-')[0]
            if (userLang !== 'uk') return oncomplite(data)   // Hikka — україномовне джерело

            var needTitle = !hasCyrillic(movie.title || movie.name || '')
            var needDescr = !movie.overview || !movie.overview.trim() || !hasCyrillic(movie.overview)
            if (!needTitle && !needDescr) return oncomplite(data)

            AnimeMap.load(function() {
                var method = params.method ||
                    (movie.name && !movie.title ? 'tv' : (movie.title ? 'movie' : undefined))
                var mal = AnimeMap.malsOf(params.id, method)[0]   // [0] — 1-й сезон
                if (!mal) return oncomplite(data)   // не аніме / нема мапінгу

                fetchHikka(mal, needDescr, function(h) {
                    if (h) {
                        if (needTitle && h.title_ua) movie.title = movie.name = h.title_ua
                        if (needDescr && h.synopsis_ua) movie.overview = cleanSynopsis(h.synopsis_ua)
                    }
                    oncomplite(data)
                })
            })
        }

        prevFull(params, wrappedOnComplite, onerror || function() {})
    }
}

patchHikkaFallback()
