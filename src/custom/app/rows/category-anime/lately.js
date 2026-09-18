import Timetable from '../../../../core/timetable'
import schedule from './schedule'

export default {
    name: 'timetable_lately',

    build: () => schedule(Timetable.lately, 'title_upcoming_episodes')
}
