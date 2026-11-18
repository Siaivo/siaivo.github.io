import Settings from './settings'
import Head from './head'
import Sync from './sync'

if (typeof window != 'undefined') {
    Settings.init()
    Head.init()
    Sync.init()
}
