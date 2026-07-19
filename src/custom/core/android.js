import Android from '../../core/android'
import Activity from '../../interaction/activity/activity'

function resolveCard(data) {
    if (data && (data.card || data.movie)) return data.card || data.movie

    let activity = Activity.active()

    if (activity && (activity.card || activity.movie)) return activity.card || activity.movie

    return null
}

let original_openPlayer = Android.openPlayer

Android.openPlayer = function(link, data) {
    if (data) data.card = resolveCard(data)

    return original_openPlayer.call(Android, link, data)
}
