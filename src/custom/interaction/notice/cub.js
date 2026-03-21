import Notice from '../../../interaction/notice/notice'
import NoticeCub from '../../../interaction/notice/cub'

function removeCubTab(notice) {
    if (notice.classes && notice.classes.cub) {
        delete notice.classes.cub
    }

    if (notice.display === 'cub') {
        notice.display = 'all'
    }
}

let init = Notice.init.bind(Notice)
Notice.init = function() {
    init()
    removeCubTab(this)
}

let open = Notice.open.bind(Notice)
Notice.open = function() {
    removeCubTab(this)
    open()
}

NoticeCub.prototype.update = function() {
    this.notices = []
}

NoticeCub.prototype.count = function() {
    return 0
}

NoticeCub.prototype.items = function() {
    return []
}
