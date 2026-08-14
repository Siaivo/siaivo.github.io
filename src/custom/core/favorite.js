import Favorite from '../../core/favorite'
import Arrays from '../../utils/arrays'
import Utils from '../../utils/utils'

Favorite.init = function() {
    Favorite.read()
}

// Помічник для отримання локальних улюблених персон
function getLocalPersons() {
    let data = Favorite.full()
    let result = []
    let ids = data.persons || []
    ids.forEach(id => {
        for (let i = 0; i < data.card.length; i++) {
            const card = data.card[i]
            if(card.id == id) {
                let clone = Arrays.clone(card)
                if (!clone.profile_path && !clone.img) {
                    clone.img = 'img/actor.svg'
                }
                result.push(clone)
            }
        }
    })
    return result
}

// Базовий remove()/clear() чистить data.card через внутрішній check(), який
// не знає про кастомну категорію 'persons'. Тому видалення будь-якої іншої
// закладки (напр. фільму) викидало з data.card і картки персон, хоча їх id
// лишались у data.persons. Знімаємо знімок карток персон до виклику і
// відновлюємо їх після.
function snapshotPersonCards() {
    let data = Favorite.full()

    return (data.persons || []).map(id => {
        return data.card.find(c => c.id == id)
    }).filter(Boolean)
}

function restorePersonCards(saved) {
    let data     = Favorite.full()
    let persons  = data.persons || []
    let restored = false

    saved.forEach(pc => {
        if(persons.indexOf(pc.id) > -1 && !data.card.find(c => c.id == pc.id)){
            data.card.push(Arrays.clone(pc))

            restored = true
        }
    })

    if(restored){
        Lampa.Storage.set('favorite', data)

        Lampa.Listener.send('state:changed', {
            target: 'favorite',
            reason: 'update',
            method: 'update',
            type: 'persons',
            card: null
        })
    }

    return restored
}

// Обгортки нижче — звичайне присвоєння, а не accessor-властивість. Геттер, що
// повертає обгортку, разом із сеттером, який перезаписує саме внутрішню ціль,
// утворює цикл для будь-якого плагіна, що робить класичне
// `var orig = Favorite.x; Favorite.x = function(){ orig.apply(...) }` —
// його функція потрапляє в original_*, і виклик іде по колу до RangeError.

// 1. Override Favorite.all
let original_all = Favorite.all
Favorite.all = function() {
    let res = original_all.apply(this, arguments) || {}
    if (!res.persons) res.persons = []
    let local = getLocalPersons()
    local.forEach(person => {
        if (!res.persons.some(p => p.id == person.id)) {
            res.persons.push(person)
        }
    })
    return res
}

// 2. Override Favorite.check
let original_check = Favorite.check
Favorite.check = function(card) {
    let res = original_check.apply(this, arguments) || {}
    let data = Favorite.full()
    let is_person = card.profile_path || card.known_for_department || typeof card.gender !== 'undefined' || (data.persons && data.persons.indexOf(card.id) > -1)
    if(is_person){
        res.persons = data.persons && data.persons.indexOf(card.id) > -1
        if(res.persons) res.any = true
    }
    return res
}

// 3. Override Favorite.toggle
let original_toggle = Favorite.toggle
Favorite.toggle = function(where, card) {
    if(where === 'persons'){
        let data = Favorite.full()
        if(!data.persons) data.persons = []
        let idx = data.persons.indexOf(card.id)
        if(idx > -1){
            Arrays.remove(data.persons, card.id)
            let status = Favorite.check(card)
            if(!status.any){
                for (let i = 0; i < data.card.length; i++) {
                    if(data.card[i].id == card.id) {
                        data.card.splice(i, 1)
                        break
                    }
                }
            }
        } else {
            Arrays.insert(data.persons, 0, card.id)
            if(!data.card.find(c => c.id == card.id)){
                let clean = Arrays.clone(card)
                delete clean.biography
                Arrays.insert(data.card, 0, Utils.clearCard(clean))
            }
        }
        Lampa.Storage.set('favorite', data)
        Lampa.Listener.send('state:changed', {
            target: 'favorite',
            reason: 'update',
            method: idx > -1 ? 'remove' : 'add',
            type: 'persons',
            card: card
        })
        return idx > -1 ? false : true
    }

    let saved  = snapshotPersonCards()
    let result = original_toggle.apply(this, arguments)

    restorePersonCards(saved)

    return result
}

// 4. Override Favorite.remove — захищаємо картки персон при прямому видаленні
let original_remove = Favorite.remove
Favorite.remove = function(where, card){
    let saved  = snapshotPersonCards()
    let result = original_remove.apply(this, arguments)

    restorePersonCards(saved)

    return result
}

// 4.1. Override Favorite.clear — захищаємо картки персон при очищенні категорії
let original_clear = Favorite.clear
Favorite.clear = function(where, card){
    let saved  = snapshotPersonCards()
    let result = original_clear.apply(this, arguments)

    restorePersonCards(saved)

    return result
}

// 5. Override Favorite.get
let original_get = Favorite.get
Favorite.get = function(params) {
    if(params && params.type === 'persons'){
        let res = original_get.apply(this, arguments) || []
        if(!Array.isArray(res)) res = []
        let local = getLocalPersons()
        local.forEach(person => {
            if(!res.some(p => p.id == person.id)){
                res.push(person)
            }
        })
        return res
    }
    return original_get.apply(this, arguments)
}
