/**
 * Badge renderer for Torrents v2
 * Створює jQuery-елемент з HTML бейджів для заданого заголовку
 */

import { matchBadges } from './badges'

/**
 * Групує бейджі за їх groupId
 * @param {Array} badges - масив співставлених бейджів
 * @returns {Object} об'єкт де ключ — groupId, значення — масив бейджів групи
 */
function groupBadges(badges) {
    let groups = {}

    badges.forEach((badge) => {
        let gid = badge.groupId || 'other'
        if (!groups[gid]) {
            groups[gid] = []
        }
        groups[gid].push(badge)
    })

    return groups
}

/**
 * Створює jQuery-елемент з бейджами для заголовку торренту
 * @param {string} title - заголовок торренту
 * @returns {jQuery|null} jQuery-елемент з бейджами або null, якщо співпадінь немає
 */
export function renderBadges(title) {
    let matched = matchBadges(title)
    if (!matched || matched.length === 0) return null

    let groups = groupBadges(matched)
    let container = $('<div class="torrent-item__badges"></div>')

    Object.keys(groups).forEach((groupId) => {
        let groupEl = $('<div class="torrent-item__badges-group"></div>')

        groups[groupId].forEach((badge) => {
            let img = $(`<img src="${badge.imageURL}" alt="${badge.name}" title="${badge.name}">`)

            // Якщо є borderColor (і це не прозорий колір) — додаємо бордер
            if (badge.borderColor && badge.borderColor !== '#00000000') {
                img.css({
                    border: '1px solid ' + badge.borderColor,
                    borderRadius: '0.2em'
                })
            }

            groupEl.append(img)
        })

        container.append(groupEl)
    })

    return container
}
