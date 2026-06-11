/**
 * Налаштування для Torrents v2
 * Додає перемикач "Торренти v2" у розділі Siaivo
 */

import SettingsApi from '../../../interaction/settings/api'
import Params from '../../../interaction/settings/params'

export function init() {
    if (!SettingsApi) return

    SettingsApi.addParam({
        component: 'siaivo',
        param: {
            name: 'torrents_v2',
            type: 'trigger',
            default: false
        },
        field: {
            name: 'Торренти v2',
            description: 'Показувати бейджі якості, аудіо та відео у картках торрентів'
        },
        onRender: function (item) {
            // Додаємо data-children щоб приховувати/показувати дочірні елементи
            item.attr('data-children', 'torrents_v2')
        }
    })

    SettingsApi.addParam({
        component: 'siaivo',
        param: {
            name: 'torrents_v2_manifest',
            type: 'input',
            values: '',
            default: 'https://raw.githubusercontent.com/sweatycab/nuvio-minimalist-badges/main/badges-white.json',
            placeholder: 'https://raw.githubusercontent.com/sweatycab/nuvio-minimalist-badges/main/badges-white.json'
        },
        field: {
            name: 'Badge маніфест',
            description: 'URL до JSON файлу з бейджами'
        },
        onRender: function (item) {
            // Додаємо data-parent щоб елемент приховувався коли torrents_v2 вимкнено
            item.attr('data-parent', 'torrents_v2')
        },
        onChange: function (value) {
            // При зміні URL — перезавантажуємо бейджі
            if (window.Lampa && window.Lampa.Storage && window.Lampa.Storage.field('torrents_v2') === 'true') {
                // Скидаємо кеш і перезавантажуємо
                if (window.torrentBadgesReload) {
                    window.torrentBadgesReload()
                }
            }
        }
    })
}
