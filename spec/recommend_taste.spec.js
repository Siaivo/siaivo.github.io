import profile from '../src/custom/app/rows/recommend_taste'

import {expect, suite, test} from 'vitest'

function card(genre_ids, extra = {}){
    return Object.assign({genre_ids, original_language: 'en', release_date: '2020-01-01'}, extra)
}

function weighted(cards){
    return cards.map(c => ({card: c, weight: 1}))
}

let drama  = 18
let horror = 27
let comedy = 35

suite('recommend_taste', () => {
    test('мала історія - профілю нема', () => {
        expect(profile(weighted([card([drama])]), [])).toBe(null)
    })

    test('улюблений жанр піднімає', () => {
        let taste = profile(weighted([card([drama]), card([drama]), card([drama, comedy])]), [])

        expect(taste(card([drama]))).toBeGreaterThan(taste(card([horror])))
    })

    test('жанри фільмів і серіалів зведені: Action дає смак до Action & Adventure', () => {
        let taste = profile(weighted([card([28]), card([28]), card([28])]), [])

        expect(taste(card([10759]))).toBeGreaterThan(taste(card([horror])))
    })

    test('один кинутий жанр - не жанр, а фільм: штрафу нема', () => {
        let positive = weighted([card([drama]), card([drama]), card([comedy])])
        let one      = profile(positive, weighted([card([horror])]))
        let none     = profile(positive, [])

        expect(one(card([horror]))).toBe(none(card([horror])))
    })

    test('кілька кинутих жанру топлять, але переглянутий і вподобаний той самий жанр знімає штраф', () => {
        let positive = weighted([card([drama]), card([drama]), card([comedy])])
        let thrown   = weighted([card([horror]), card([horror])])
        let base     = profile(positive, [])(card([horror]))

        expect(profile(positive, thrown)(card([horror]))).toBeLessThan(base)

        let liked = [{card: card([horror]), weight: 1.5}, {card: card([horror]), weight: 1.5}].concat(positive)

        expect(profile(liked, thrown)(card([horror]))).toBeGreaterThanOrEqual(base)
    })

    test('штраф не нижче 0.85 за жанр', () => {
        let taste = profile(weighted([card([drama]), card([drama]), card([drama])]), weighted([card([horror]), card([horror]), card([horror])]))
        let plain = profile(weighted([card([drama]), card([drama]), card([drama])]), [])

        expect(taste(card([horror])) / plain(card([horror]))).toBeGreaterThanOrEqual(0.85)
    })

    test('незнайома мова і чужа епоха опускають', () => {
        let taste = profile(weighted([card([drama]), card([drama]), card([drama])]), [])

        expect(taste(card([drama], {original_language: 'ko'}))).toBeLessThan(taste(card([drama])))
        expect(taste(card([drama], {release_date: '1975-01-01'}))).toBeLessThan(taste(card([drama])))
    })

    test('мову інтерфейсу не штрафуємо, навіть коли нею ще не дивились', () => {
        let taste = profile(weighted([card([drama]), card([drama]), card([drama])]), [], 'uk')

        expect(taste(card([drama], {original_language: 'uk'}))).toBeCloseTo(taste(card([drama], {original_language: 'xx', genre_ids: [drama]})) / 0.9, 10)
    })

    test('жанри з повної картки (genres) теж читаються', () => {
        let full  = c => ({genres: [{id: c}], original_language: 'en', release_date: '2020-01-01'})
        let taste = profile(weighted([full(drama), full(drama), full(drama)]), [])

        expect(taste(card([drama]))).toBeGreaterThan(taste(card([horror])))
    })
})
