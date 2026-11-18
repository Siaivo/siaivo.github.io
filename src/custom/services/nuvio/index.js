import Settings from './settings'
import Head from './head'
import Sync from './sync'

if (typeof window != 'undefined' && (!window.lampa_settings || window.lampa_settings.nuvio_use !== false)) {
    Settings.init()
    Head.init()
    Sync.init()
}
