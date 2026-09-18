import Timetable from '../../../../core/timetable'
import schedule from './schedule'

export default {
    name: 'timetable_recently',

    build: () => schedule(Timetable.recently, 'title_recent_episodes')
}
