import Socket from '../../core/socket'
import Storage from '../../core/storage/storage'

let origInit = Socket.init

Socket.init = function() {
    if (!Storage.field('account_use')) return
    origInit()
}
