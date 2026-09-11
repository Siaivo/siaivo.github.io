/**
 * JacRed parser settings
 * Registers disabled-by-default toggle + proxy URL stub in Siaivo section
 */

import SettingsApi from '../../../interaction/settings/api'

export function init() {
    if (!SettingsApi) return

    SettingsApi.addParam({
        component: 'siaivo',
        param: {
            name: 'jacred_parse',
            type: 'trigger',
            default: false
        },
        field: {
            name: 'Jackett like JacRed'
        },
        onRender: function (item) {
            // Parent toggle, child params hide/show via data-parent
            item.attr('data-children', 'jacred_parse')
        }
    })
}
