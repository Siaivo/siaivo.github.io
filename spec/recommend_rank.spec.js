import rank from '../src/custom/app/rows/recommend_rank'

import {expect, suite, test} from 'vitest'

let now = new Date(2026, 9, 23, 12).getTime()
let day = 1000 * 60 * 60 * 24

function movies(ids, extra = {}){
    return ids.map(id => Object.assign({id, title: 'm' + id, vote_average: 7, vote_count: 1000, release_date: '2010-01-01'}, extra))
}

let all = () => true

suite('recommend_rank', () => {
    test('тайтл, який радять кілька джерел, вище за першу пораду одного', () => {
        let list = rank([movies([1, 2]), movies([3, 2])], [1, 1], all, now)

        expect(list[0].id).toBe(2)
    })

    test('свіжіше з історії важить більше', () => {
        let list = rank([movies([1]), movies([2])], [1, 0.5], all, now)

        expect(list.map(i => i.id)).toEqual([1, 2])
    })

    test('accept відсіює, фільм і серіал з одним id - різні картки', () => {
        let answers = [[{id: 5, title: 'm'}, {id: 5, name: 't'}, {id: 6, title: 'x'}]]
        let list    = rank(answers, [1], item => item.id != 6, now)

        expect(list.length).toBe(2)
    })

    test('одне джерело дає в стрічку не більше 4, решта в хвості', () => {
        let list = rank([movies([1, 2, 3, 4, 5, 6]), movies([7, 8])], [1, 0.1], all, now)
        let head = list.slice(0, 6).map(i => i.id)

        expect(head.filter(id => id <= 6).length).toBe(4)
        expect(head).toContain(7)
        expect(head).toContain(8)
        expect(list.length).toBe(8)
    })

    test('порада кинутого топить картку, а лише його поради зникають', () => {
        let list = rank([movies([1, 2]), movies([2, 3])], [1, -0.6], all, now)

        expect(list.map(i => i.id)).toEqual([1, 2])
    })

    test('багато голосів важать більше за трохи вищу оцінку з кількох', () => {
        let few  = {id: 1, title: 'a', vote_average: 8.1, vote_count: 40, release_date: '2010-01-01'}
        let many = {id: 2, title: 'b', vote_average: 7.8, vote_count: 20000, release_date: '2010-01-01'}
        let list = rank([[few], [many]], [1, 1], all, now)

        expect(list[0].id).toBe(2)
    })

    test('новинка обганяє рівну за всім іншим стару', () => {
        let old  = movies([1])[0]
        let news = movies([2], {release_date: '2026-06-01'})[0]
        let list = rank([[old], [news]], [1, 1], all, now)

        expect(list[0].id).toBe(2)
    })

    test('перемішування стабільне протягом доби і змінюється між днями', () => {
        let answers = [movies([1, 2, 3, 4]), movies([5, 6, 7, 8]), movies([9, 10, 11, 12])]
        let order   = time => rank(answers, [1, 1, 1], all, time).map(i => i.id).join()
        let days    = [1, 2, 3, 4, 5, 6, 7].map(n => order(now + n * day))

        expect(order(now)).toBe(order(now + 1000 * 60 * 60))
        expect(new Set(days).size).toBeGreaterThan(1)
    })
})
