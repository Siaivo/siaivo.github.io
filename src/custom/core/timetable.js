import Timetable from '../../core/timetable'
import Cache from '../../utils/cache'
import '../utils/db-get-many'

// Епізоди останнього сезону для кількох серіалів разом. Закладки Timetable тримає в пам'яті,
// а картки лише з історії він пише тільки в IndexedDB (full.js:221 -> parse(true)) - їх
// дочитуємо однією транзакцією. Повертає {id: episodes}, серіалів без даних у ньому нема.
Timetable.getMany = function(cards){
    let result  = {}
    let missing = []
    let memory  = Timetable.all()

    cards.forEach(card => {
        let item = memory.find(a => a.id == card.id)

        if (item && item.episodes.length) {
            result[card.id] = item.episodes
        }
        else {
            missing.push(card.id)
        }
    })

    return Cache.getMany('timetable', missing).then(found => {
        Object.keys(found).forEach(id => {
            if (found[id].episodes && found[id].episodes.length) {
                result[id] = found[id].episodes
            }
        })

        return result
    })
}
