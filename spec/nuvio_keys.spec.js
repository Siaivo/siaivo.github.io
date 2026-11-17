import {expect, test} from 'vitest'

globalThis.Lampa = {Utils: {hash: (s)=> 'h' + s}}

import Keys from '../src/custom/services/nuvio/keys'

test('card keys with a source prefix are not synced', ()=>{
    expect(Keys.parseCard('tv_1396')).toEqual({type: 'tv', id: 1396})
    expect(Keys.parseCard('kp_movie_1')).toBe(null)
    expect(Keys.parseCard(undefined)).toBe(null)
})

test('local key needs season and episode for series', ()=>{
    expect(Keys.localKey({card: 'movie_550'})).toBe('movie_550||')
    expect(Keys.localKey({card: 'tv_1', season: 0, episode: 3})).toBe('tv_1|0|3')
    expect(Keys.localKey({card: 'tv_1', season: 1, episode: 0})).toBe(null)
    expect(Keys.localKey({card: 'tv_1', season: NaN, episode: 2})).toBe(null)
    expect(Keys.localKey({hash: 1})).toBe(null)
})

test('only imdb and tmdb: ids are accepted', ()=>{
    expect(Keys.idKind('tt0903747')).toBe('imdb')
    expect(Keys.idKind('tmdb:550')).toBe('tmdb')
    expect(Keys.idKind('550')).toBe(null)
})

test('remote ids match the native clients', ()=>{
    expect(Keys.toRemote({card: 'movie_550'}, 'tt0137523')).toEqual({content_id: 'tt0137523', content_type: 'movie', video_id: 'tt0137523', progress_key: 'tt0137523'})
    expect(Keys.toRemote({card: 'tv_1396', season: 1, episode: 2}, 'tt0903747')).toEqual({
        content_id: 'tt0903747', content_type: 'series', video_id: 'tt0903747:1:2', progress_key: 'tt0903747_s1e2', season: 1, episode: 2
    })
})

test('push kind follows the road state', ()=>{
    expect(Keys.pushKind({percent: 0, time: 0})).toBe('delete')
    expect(Keys.pushKind({percent: 40, time: 600, duration: 1500})).toBe('progress')
    expect(Keys.pushKind({percent: 95, time: 0, duration: 0})).toBe('watched')
    expect(Keys.pushKind({percent: 30, time: 0, duration: 0})).toBe('skip')
})

test('progress entry is in ms and finished means position = duration', ()=>{
    let e = Keys.progressEntry({percent: 95, time: 0, duration: 3000, updated: 7}, {content_id: 'tt1'})

    expect(e).toEqual({content_id: 'tt1', position: 3000000, duration: 3000000, last_watched: 7})
    expect(Keys.progressEntry({percent: 40, time: 1200, duration: 3000, updated: 7}, {}).position).toBe(1200000)
})

test('road from progress converts back to seconds', ()=>{
    expect(Keys.roadFromProgress({position: 1500000, duration: 3000000, last_watched: 9})).toEqual({percent: 50, time: 1500, duration: 3000, updated: 9})
    expect(Keys.roadFromProgress({position: 0, duration: 0})).toBe(null)
})

test('canonical hash matches the core formulas', ()=>{
    expect(Keys.canonHash('movie', 'Fight Club')).toBe('hFight Club')
    expect(Keys.canonHash('tv', 'Breaking Bad', 1, 2)).toBe('h12Breaking Bad')
    expect(Keys.canonHash('tv', 'X', 11, 2)).toBe('h11:2X')
})

test('merge rule', ()=>{
    let local = {percent: 40, duration: 3000, updated: 100}

    // своё отражение возвращается с тем же временем
    expect(Keys.decide(local, false, {op: 'upsert', kind: 'p', ts: 100})).toBe(false)
    expect(Keys.decide(local, false, {op: 'upsert', kind: 'p', ts: 101})).toBe(true)
    expect(Keys.decide(null, false, {op: 'upsert', kind: 'p', ts: 1})).toBe(true)

    // удаление не перебивает более свежую неотправленную правку
    expect(Keys.decide(local, true, {op: 'delete', kind: 'p', ts: 50})).toBe(false)
    expect(Keys.decide(local, false, {op: 'delete', kind: 'p', ts: 50})).toBe(true)
    expect(Keys.decide(null, false, {op: 'delete', kind: 'p', ts: 50})).toBe(false)

    // удаление прогресса не снимает отметку, удаление отметки снимает
    let done = {percent: 95, duration: 3000, updated: 100}

    expect(Keys.decide(done, false, {op: 'delete', kind: 'p', ts: 200})).toBe(false)
    expect(Keys.decide(done, false, {op: 'delete', kind: 'w', ts: 200})).toBe(true)

    // отметка не перебивает незаконченный прогресс
    expect(Keys.decide(local, false, {op: 'upsert', kind: 'w', ts: 999})).toBe(false)
})
