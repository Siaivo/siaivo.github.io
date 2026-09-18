import Utils from '../../utils/utils'

// Чи це одна й та сама картка. imdb_id надійніший - він не залежить від джерела, - але
// є не в усіх картках, тоді порівнюємо за id. Перевірки на порожнечу обов'язкові:
// без них два undefined збігаються і будь-яка картка без imdb_id "дорівнює" будь-якій іншій.
Utils.sameCard = function(a, b){
    return (a.imdb_id && b.imdb_id && a.imdb_id == b.imdb_id) || a.id == b.id
}
