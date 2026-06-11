/**
 * Badge engine for Torrents v2
 * Fetches Nuvio-style badges JSON, caches, and matches against torrent titles
 */

import Storage from '../../../core/storage/storage'

const DEFAULT_BADGES_URL = 'https://raw.githubusercontent.com/sweatycab/nuvio-minimalist-badges/main/badges-white.json'

let badgesCache = null
export let fetchPromise = null

/**
 * Отримати URL маніфесту з налаштувань
 * @returns {string}
 */
function getManifestUrl() {
    let url = Storage.get('torrents_v2_manifest', DEFAULT_BADGES_URL)
    return url || DEFAULT_BADGES_URL
}

/**
 * Запускает загрузку бейджей. Вызывается один раз после готовности Lampa.
 * @returns {Promise<void>}
 */
export function init() {
    if (fetchPromise) return fetchPromise

    return loadBadges()
}

/**
 * Перезавантажити бейджі (наприклад, після зміни URL маніфесту)
 * @returns {Promise<void>}
 */
export function reload() {
    badgesCache = null
    fetchPromise = null
    return loadBadges()
}

/**
 * Завантажити бейджі з URL
 * @returns {Promise<void>}
 */
function loadBadges() {
    let url = getManifestUrl()

    fetchPromise = new Promise((resolve) => {
        if (typeof Lampa !== 'undefined' && Lampa.Network) {
            console.log('[torrent-badges] fetching badges from:', url)
            Lampa.Network.silent(url, (data) => {
                console.log('[torrent-badges] fetch complete, data type:', typeof data, Array.isArray(data) ? 'array' : (data && data.filters ? 'object with filters' : 'unknown'))
                let filters = Array.isArray(data) ? data : (data && Array.isArray(data.filters) ? data.filters : [])
                console.log('[torrent-badges] filters count:', filters.length)
                badgesCache = filters.map(compileBadge).filter(b => b !== null)
                console.log('[torrent-badges] valid badges:', badgesCache.length)
                resolve()
            }, (err) => {
                console.log('[torrent-badges] fetch error:', err)
                badgesCache = []
                resolve()
            })
        } else {
            console.log('[torrent-badges] Lampa.Network not available')
            badgesCache = []
            resolve()
        }
    })

    return fetchPromise
}

/**
 * Перетворює сирий badge-об'єкт з JSON у готовий до використання (компілює RegExp)
 * Повертає null якщо патерн невалідний
 */
function compileBadge(badge) {
    let pattern = badge.pattern || ''
    // JS не підтримує inline-флаг (?i) на рівні синтаксису, вирізаємо його
    if (pattern.startsWith('(?i)')) {
        pattern = pattern.slice(4)
    }
    try {
        return {
            ...badge,
            regex: new RegExp(pattern, 'i')
        }
    } catch (e) {
        console.log('[torrent-badges] invalid pattern for', badge.id, badge.name, ':', e.message)
        return null
    }
}

/**
 * Повертає масив бейджів, які підходять до заголовку torrent-роздачі
 * @param {string} title - заголовок торренту
 * @returns {Array} масив співпадінь badge-об'єктів
 */
export function matchBadges(title) {
    if (!badgesCache || !title) return []

    return badgesCache.filter((badge) => {
        if (!badge.isEnabled) return false
        try {
            if (!badge.regex.test(title)) return false

            // Для мовних бейджів (id починається з 'l-') вимагаємо явну назву мови
            // Бо деякі патерни (напр. l-ru з [Ѐ-ӿ]{3,}) матчать будь-яку кирилицю
            if (badge.id && badge.id.startsWith('l-')) {
                return hasExplicitLanguage(title, badge.id)
            }

            return true
        } catch (e) {
            return false
        }
    })
}

/**
 * Перевіряє чи є явна назва мови в заголовку
 * Для мовних бейджів щоб уникнути хибних спрацювань
 */
function hasExplicitLanguage(title, badgeId) {
    let langMap = {
        'l-en': /(?<![^\s\[(_\-.,])(english|eng)(?![ .\-_]?sub)/i,
        'l-ru': /(?<![^\s\[(_\-.,])(russian|rus)(?![ .\-_]?sub)/i,
        'l-uk': /(?<![^\s\[(_\-.,])(ukrainian|ukr)(?![ .\-_]?sub)/i,
        'l-es': /(?<![^\s\[(_\-.,])(spanish|spa|esp|latino|lat)(?![ .\-_]?sub)/i,
        'l-fr': /(?<![^\s\[(_\-.,])(french|fra|fr|vf|vff|vfi|vf2|vfq|truefrench)(?![ .\-_]?sub)/i,
        'l-de': /(?<![^\s\[(_\-.,])(deu(?:tsch)?(?:land)?|ger(?:man)?|german)(?![ .\-_]?sub)/i,
        'l-it': /(?<![^\s\[(_\-.,])(italian|ita)(?![ .\-_]?sub)/i,
        'l-pt-br': /(?<![^\s\[(_\-.,])(portuguese[ .\-_]?brazil|pt[ .\-_]?br|brazilian)(?![ .\-_]?sub)/i,
        'l-pt-pt': /(?<![^\s\[(_\-.,])(portuguese(?!(?:[ .\-_]?brazil))|portuguese[ .\-_]?(?:portugal|europe(?:an)?)|pt[ .\-_]?pt)(?![ .\-_]?sub)/i,
        'l-tr': /(?<![^\s\[(_\-.,])(turkish|tur)(?![ .\-_]?sub)/i,
        'l-pl': /(?<![^\s\[(_\-.,])(polish|pol)(?![ .\-_]?sub)/i,
        'l-id': /(?<![^\s\[(_\-.,])(indonesian|ind)(?![ .\-_]?sub)/i,
        'l-th': /(?<![^\s\[(_\-.,])(thai|tha)(?![ .\-_]?sub)/i,
        'l-vi': /(?<![^\s\[(_\-.,])(vietnamese|vie)(?![ .\-_]?sub)/i,
        'l-ja': /(?<![^\s\[(_\-.,])(japanese|jap|jpn)(?![ .\-_]?sub)/i,
        'l-ko': /(?<![^\s\[(_\-.,])(korean|kor)(?![ .\-_]?sub)/i,
        'l-zh': /(?<![^\s\[(_\-.,])(chinese|chi|zho|mandarin|cantonese)(?![ .\-_]?sub)/i,
        'l-hi': /(?<![^\s\[(_\-.,])(hindi|hin)(?![ .\-_]?sub)/i,
        'l-ar': /(?<![^\s\[(_\-.,])(arabic|ara)(?![ .\-_]?sub)/i,
        'l-el': /(?<![^\s\[(_\-.,])(greek|ellinika|hellenic|grec|ell|gre)(?![ .\-_]?sub)/i,
        'l-mu': /(?<![^\s\[(_\-.,])(multi)(?![ .\-_]?sub)/i,
    }

    let regex = langMap[badgeId]
    if (!regex) return true // Якщо немає маппінгу — дозволяємо

    return regex.test(title)
}

/**
 * Повертає всі закешовані бейджі (або пустий масив, якщо ще не завантажено)
 * @returns {Array}
 */
export function getBadges() {
    return badgesCache || []
}
