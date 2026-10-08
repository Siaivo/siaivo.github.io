import classify from '../src/custom/app/rows/continue_classify'

import {expect, suite, test} from 'vitest'

let day = 1000 * 60 * 60 * 24
let now = new Date(2026, 9, 8, 12).getTime()

// air_date серії, що вийшла days днів тому
function ago(days){
    let d = new Date(now - days * day)

    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function season(number, dates){
    return dates.map((days, i) => ({season_number: number, episode_number: i + 1, air_date: days === null ? '' : ago(days)}))
}

// marks: {'2:3': [percent, коли відмічено днів тому]}
function run(episodes, marks, prev = 0, bookmarked = false){
    let view = (s, e) => {
        let mark = marks[s + ':' + e]

        return mark ? {percent: mark[0], updated: mark[1] === null ? 0 : now - mark[1] * day} : {percent: 0, updated: 0}
    }

    return classify({episodes, prev, view, now, bookmarked})
}

suite('continue classify', () => {
    test('щотижневий онгоінг: вийшла наступна серія після перегляду', () => {
        let r = run(season(2, [15, 8, 1]), {'2:1': [100, 14], '2:2': [95, 7]}, 10)

        expect(r.type).toBe('new')
        // вийшла вчора, вважається вийшлою з сьогоднішньої півночі
        expect(r.time).toBe(new Date(2026, 9, 8).getTime())
    })

    test('усе, що вийшло, переглянуто - чекаємо наступну', () => {
        expect(run(season(2, [15, 8, -6]), {'2:1': [100, 14], '2:2': [95, 7]}, 10).type).toBe('hide')
    })

    test('серія "сьогодні" ще не вийшла: +1 день', () => {
        expect(run(season(2, [15, 8, 0]), {'2:1': [100, 14], '2:2': [95, 7]}, 10).type).toBe('hide')
    })

    test('завершений сезон досмотрено', () => {
        expect(run(season(1, [30, 20, 10]), {'1:1': [100, 29], '1:2': [100, 19], '1:3': [92, 9]}).type).toBe('hide')
    })

    test('новий сезон, вийшли вже 2 серії, фінал попереднього переглянуто', () => {
        let r = run(season(3, [5, 2]), {'2:10': [100, 200]}, 10)

        expect(r.type).toBe('new')
    })

    test('сезон вийшов цілком одного дня', () => {
        expect(run(season(3, [3, 3, 3, 3]), {'2:10': [100, 200]}, 10).type).toBe('new')
    })

    test('новий сезон, але фінал попереднього не додивився - відстає', () => {
        expect(run(season(3, [5, 2]), {'2:4': [100, 200]}, 10).type).toBe('keep')
    })

    test('анонс без вийшлих серій, попередній додивився - ховаємо', () => {
        expect(run(season(3, [-20, -13]), {'2:10': [100, 200]}, 10).type).toBe('hide')
    })

    test('анонс, попередній не додивився - на місці', () => {
        expect(run(season(3, [-20, null]), {}, 10).type).toBe('keep')
    })

    test('жодної відмітки (інший пристрій без синку) - на місці', () => {
        expect(run(season(2, [15, 8, 1]), {}, 10).type).toBe('keep')
    })

    test('попередній сезон невідомий: прем\'єра лише для закладок', () => {
        expect(run(season(3, [5]), {}, null, true).type).toBe('new')
        expect(run(season(3, [5]), {}, null, false).type).toBe('keep')
    })

    test('перший сезон, нічого не дивився - на місці навіть у закладках', () => {
        expect(run(season(1, [5]), {}, 0, true).type).toBe('keep')
    })

    test('вікно минуло - на місці', () => {
        expect(run(season(2, [40, 30]), {'2:1': [100, 39]}, 10).type).toBe('keep')
    })

    test('попередню додивився вже після виходу наступної - відстає', () => {
        expect(run(season(2, [15, 8, 5]), {'2:1': [100, 14], '2:2': [100, 2]}, 10).type).toBe('keep')
    })

    test('відмітка без updated (старий запис) - лише вікно', () => {
        expect(run(season(2, [15, 8, 5]), {'2:1': [100, null], '2:2': [100, null]}, 10).type).toBe('new')
    })

    test('наступну вже почав - на місці', () => {
        expect(run(season(2, [15, 8, 1]), {'2:1': [100, 14], '2:2': [95, 7], '2:3': [30, 0]}, 10).type).toBe('keep')
    })
})
