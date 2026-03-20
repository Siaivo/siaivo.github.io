import Config from './config'

window.lampa_settings = window.lampa_settings || {}

Object.assign(window.lampa_settings, Config)

window.lampa_settings.disable_features = Object.assign(
    {},
    window.lampa_settings.disable_features || {},
    Config.disable_features || {}
)
