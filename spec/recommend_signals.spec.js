import {progress, engagement, exposure, remember, opened, today} from '../src/custom/app/rows/recommend_signals'

import {expect, suite, test} from 'vitest'

let day = 1000 * 60 * 60 * 24
let now = new Date(2026, 10, 9, 12).getTime()

suite('recommend_signals', () => {
    test('progress рахує серії з прогресом за прив\'язкою, старі записи без неї пропускає', () => {
        let found = progress({
            a: {card: 'tv_1', season: 1, episode: 1, percent: 100, updated: 5},
            b: {card: 'tv_1', season: 1, episode: 2, percent: 40, updated: 9},
            c: {card: 'tv_1', season: 1, episode: 3, percent: 0, updated: 20},
            d: {card: 'movie_2', percent: 25, updated: 3},
            e: {percent: 100, updated: 1}
        })

        expect(found.tv_1).toEqual({episodes: 2, percent: 100, updated: 9})
        expect(found.movie_2).toEqual({episodes: 0, percent: 25, updated: 3})
        expect(Object.keys(found)).toHaveLength(2)
    })

    test('engagement: вподобане найсильніше, запоєм - сильніше за звичайне', () => {
        expect(engagement({strong: true}, now)).toBe(1.5)
        expect(engagement({tv: true, episodes: 10}, now)).toBe(1.4)
        expect(engagement({tv: true, episodes: 3}, now)).toBe(1.2)
        expect(engagement({tv: true, episodes: 0}, now)).toBe(1)
    })

    test('engagement: кинуте слабшає, лише якщо давно не повертався', () => {
        expect(engagement({tv: true, episodes: 1, updated: now - 10 * day}, now)).toBe(0.4)
        expect(engagement({tv: true, episodes: 1, updated: now - 2 * day}, now)).toBe(1)
        expect(engagement({percent: 20, updated: now - 10 * day}, now)).toBe(0.4)
        expect(engagement({percent: 60, updated: now - 10 * day}, now)).toBe(1)
        expect(engagement({percent: 0}, now)).toBe(1)
    })

    test('exposure: сьогоднішній показ не змінює порядок до завтра', () => {
        let shown = {}
        let d     = today(now)

        remember(shown, ['tv_1'], d)

        expect(exposure(shown.tv_1, d)).toBe(1)
        expect(exposure(shown.tv_1, d + 1)).toBeCloseTo(0.9)
    })

    test('exposure: кожен день показу опускає, але не нижче межі', () => {
        let shown = {}
        let d     = today(now)

        for (let i = 0; i < 20; i++) {
            remember(shown, ['tv_1'], d + i)
        }

        expect(shown.tv_1.n).toBe(20)
        expect(exposure(shown.tv_1, d + 20)).toBe(0.5)
    })

    test('exposure: відкрив і не дивився - ще нижче, з наступного дня', () => {
        let shown = {}
        let d     = today(now)

        remember(shown, ['tv_1'], d)
        opened(shown, 'tv_1', d)

        expect(exposure(shown.tv_1, d)).toBe(1)
        expect(exposure(shown.tv_1, d + 1)).toBeCloseTo(0.9 * 0.85)
    })

    test('remember: повторний показ того ж дня нічого не змінює, давнє забувається', () => {
        let shown = {}
        let d     = today(now)

        expect(remember(shown, ['tv_1'], d)).toBe(true)
        expect(remember(shown, ['tv_1'], d)).toBe(false)
        expect(remember(shown, ['tv_2'], d + 40)).toBe(true)
        expect(shown.tv_1).toBeUndefined()
        expect(exposure({n: 5, last: d}, d + 40)).toBe(1)
    })
})
