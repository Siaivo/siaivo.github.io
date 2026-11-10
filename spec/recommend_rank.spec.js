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

    test('перший ряд набирають по колу кілька джерел, а не лише найсвіжіші', () => {
        let answers = []
        let weights = []

        for (let s = 0; s < 12; s++) {
            answers.push(movies([1, 2, 3, 4, 5].map(n => s * 10 + n)))
            weights.push(Math.pow(0.85, s))
        }

        let from = rank(answers, weights, all, now).slice(0, 20).map(i => Math.floor(i.id / 10))

        expect(new Set(from).size).toBe(12)
    })

    test('вподобане джерело в першому ряду, навіть якщо слабке', () => {
        let answers = []
        let weights = []

        for (let s = 0; s < 14; s++) {
            answers.push(movies([1, 2, 3, 4, 5].map(n => s * 10 + n)))
            weights.push(Math.pow(0.85, s))
        }

        let strong = answers.map((a, s) => s == 13 ? 1 : 0)
        let head   = rank(answers, weights, all, now, null, strong).slice(0, 20).map(i => Math.floor(i.id / 10))

        expect(head).toContain(13)
        expect(rank(answers, weights, all, now).slice(0, 20).map(i => Math.floor(i.id / 10))).not.toContain(13)
    })

    test('слабке джерело не має місця в першому ряду, хоч і свіже', () => {
        let answers = []
        let weights = []

        for (let s = 0; s < 12; s++) {
            answers.push(movies([1, 2, 3, 4, 5].map(n => s * 10 + n)))
            weights.push(Math.pow(0.85, s))
        }

        let roles = answers.map((a, s) => s == 0 ? -1 : 0)
        let head  = rank(answers, weights, all, now, null, roles).slice(0, 20).map(i => Math.floor(i.id / 10))

        expect(head).not.toContain(0)
    })

    test('картка з оцінкою нижче 6.8 у першому ряду лише на недобір', () => {
        let weak = movies([1], {vote_average: 6.5})
        let good = movies([2, 3])
        let many = []

        for (let s = 0; s < 25; s++) {
            many.push(movies([100 + s]))
        }

        expect(rank([weak, good], [1, 0.5], all, now).map(i => i.id)).toEqual([2, 3, 1])
        expect(rank([weak].concat(many), [1].concat(many.map(() => 0.5)), all, now).slice(0, 20).map(i => i.id)).not.toContain(1)
    })

    test('картка з парою голосів у першому ряду лише на недобір, навіть з 9.6', () => {
        let few  = movies([1], {vote_average: 9.6, vote_count: 60})
        let many = []

        for (let s = 0; s < 25; s++) {
            many.push(movies([100 + s]))
        }

        expect(rank([few].concat(many), [1].concat(many.map(() => 0.5)), all, now).slice(0, 20).map(i => i.id)).not.toContain(1)
    })

    test('вподобане дає за коло дві картки, звичайне - одну', () => {
        let answers = []
        let weights = []

        for (let s = 0; s < 12; s++) {
            answers.push(movies([1, 2, 3, 4, 5].map(n => s * 10 + n)))
            weights.push(1)
        }

        let roles = answers.map((a, s) => s == 11 ? 1 : 0)
        let head  = rank(answers, weights, all, now, null, roles).slice(0, 20).map(i => Math.floor(i.id / 10))
        let count = from => head.filter(f => f == from).length

        expect(count(11)).toBeGreaterThanOrEqual(3)
        expect(count(0)).toBeLessThanOrEqual(2)
    })

    test('хвіст теж по колу: сильне джерело не забиває наступну сторінку', () => {
        let answers = [movies(Array.from({length: 30}, (v, n) => 100 + n))]
        let weights = [1]

        for (let s = 1; s < 12; s++) {
            answers.push(movies([1, 2, 3, 4, 5, 6].map(n => s * 10 + n)))
            weights.push(0.2)
        }

        let page = rank(answers, weights, all, now).slice(20, 40)

        expect(page.filter(i => i.id >= 100).length).toBeLessThanOrEqual(4)
        expect(new Set(page.map(i => i.id >= 100 ? 0 : Math.floor(i.id / 10))).size).toBeGreaterThanOrEqual(10)
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

    test('без кількості голосів (Shikimori) оцінка все одно важить', () => {
        let low  = {id: 1, title: 'a', vote_average: 6, release_date: '2010-01-01'}
        let high = {id: 2, title: 'b', vote_average: 8.7, release_date: '2010-01-01'}
        let list = rank([[low], [high]], [1, 1], all, now)

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
