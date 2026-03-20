import Storage from '../core/storage/storage'
import Params from '../interaction/settings/params'

function removeOption(options, key) {
    if (options && Object.prototype.hasOwnProperty.call(options, key)) {
        delete options[key]
    }
}

function applySettingsPatch() {
    removeOption(Params.values.source, 'cub')
    removeOption(Params.values.screensaver_type, 'cub')

    if (Params.defaults.source === 'cub') {
        Params.defaults.source = 'tmdb'
    }

    if (Params.defaults.screensaver_type === 'cub') {
        Params.defaults.screensaver_type = 'aerial'
    }

    if (Storage.get('source', 'tmdb') === 'cub') {
        Storage.set('source', 'tmdb')
    }

    if (Storage.get('screensaver_type', 'aerial') === 'cub') {
        Storage.set('screensaver_type', 'aerial')
    }
}

let init = Params.init.bind(Params)

Params.init = function() {
    init()
    applySettingsPatch()
}
