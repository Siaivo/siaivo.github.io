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

// 1. Override Favorite.all using property definition to prevent other plugins from breaking it
let original_all = Favorite.all
Object.defineProperty(Favorite, 'all', {
    get: function() {
        return function() {
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
    },
    set: function(val) {
        original_all = val
    },
    configurable: true,
    enumerable: true
})

// 2. Override Favorite.check using property definition
let original_check = Favorite.check
Object.defineProperty(Favorite, 'check', {
    get: function() {
        return function(card) {
            let res = original_check.apply(this, arguments) || {}
            let data = Favorite.full()
            let is_person = card.profile_path || card.known_for_department || typeof card.gender !== 'undefined' || (data.persons && data.persons.indexOf(card.id) > -1)
            if(is_person){
                res.persons = data.persons && data.persons.indexOf(card.id) > -1
                if(res.persons) res.any = true
            }
            return res
        }
    },
    set: function(val) {
        original_check = val
    },
    configurable: true,
    enumerable: true
})

// 3. Override Favorite.toggle using property definition
let original_toggle = Favorite.toggle
Object.defineProperty(Favorite, 'toggle', {
    get: function() {
        return function(where, card) {
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
            return original_toggle.apply(this, arguments)
        }
    },
    set: function(val) {
        original_toggle = val
    },
    configurable: true,
    enumerable: true
})

// 4. Override Favorite.get using property definition
let original_get = Favorite.get
Object.defineProperty(Favorite, 'get', {
    get: function() {
        return function(params) {
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
    },
    set: function(val) {
        original_get = val
    },
    configurable: true,
    enumerable: true
})
