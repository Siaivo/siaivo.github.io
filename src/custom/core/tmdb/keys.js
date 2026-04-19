import Keys from '../../../core/tmdb/keys'

function reset(list) {
    if (Array.isArray(list)) {
        list.length = 0
        return list
    }

    return []
}

Keys.filter = reset(Keys.filter)
Keys.adult = reset(Keys.adult)
Keys.lgbt = reset(Keys.lgbt)

export default Keys
