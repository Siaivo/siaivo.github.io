import {expect, test, vi} from 'vitest'

const env = vi.hoisted(()=>{
    const data = {}
    const localStorage = {
        getItem: (k)=> Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null,
        setItem: (k, v)=> { data[k] = v + '' },
        removeItem: (k)=> { delete data[k] }
    }

    Object.defineProperty(localStorage, 'keys', {value: ()=> Object.keys(data)})

    globalThis.window = {localStorage, appready: true, lampa_settings: {nuvio_use: true}}
    globalThis.Lampa = {Listener: {follow(){}}}
    globalThis.window.Lampa = globalThis.Lampa

    return {data, idb: {}, listeners: {}, readed: {}, quota: false}
})

vi.mock('../src/utils/cache', ()=>({default: {
    db: {},
    rewriteData: (store, key, value)=> { env.idb[key] = value.value; return Promise.resolve() }
}}))

vi.mock('../src/core/storage/storage', ()=>({default: {
    // как ядро: значение в памяти всегда, в localStorage — если влезло
    set: (name, value, nolisten, callerror)=> {
        env.readed[name] = value

        if (env.quota) {
            if (callerror) {
                callerror(new Error('QuotaExceededError'))
            }
        }
        else {
            window.localStorage.setItem(name, typeof value == 'object' ? JSON.stringify(value) : value)
        }
    },
    get: (name)=> env.readed.hasOwnProperty(name) ? env.readed[name] : JSON.parse(window.localStorage.getItem(name) || 'null'),
    add(){},
    cache(){},
    value: (name, empty)=> window.localStorage.getItem(name) || empty || '',
    keys: ()=> Object.keys(env.data),
    listener: {follow: (name, fn)=> { env.listeners[name] = fn }}
}}))

import Storage from '../src/core/storage/storage'
import '../src/custom/core/storage-idb'

const flush = ()=> new Promise(r => setTimeout(r, 0))

test('timecodes and bookmarks move from localStorage to IndexedDB', async ()=>{
    Storage.set('file_view', {a: {percent: 50}})
    Storage.set('favorite', {history: [1]})
    Storage.set('nuvio_dirty_x_1', {a: 1})
    Storage.set('player', 'inner')

    await flush()

    expect(window.localStorage.getItem('file_view')).toBe(null)
    expect(window.localStorage.getItem('favorite')).toBe(null)
    expect(window.localStorage.getItem('nuvio_dirty_x_1')).toBe(null)
    expect(env.idb.file_view).toBe('{"a":{"percent":50}}')

    // остальное остаётся в localStorage
    expect(window.localStorage.getItem('player')).toBe('inner')
    expect(env.idb.player).toBe(undefined)
})

test('moved values stay visible to backup in the same session', async ()=>{
    Storage.set('file_view', {b: 1})

    await flush()

    expect(Storage.value('file_view')).toBe('{"b":1}')
    expect(Storage.keys()).toContain('file_view')
})

test('cache clear drops the session copy', async ()=>{
    Storage.set('favorite', {like: [2]})

    await flush()

    env.listeners.clear({full: false})

    expect(Storage.value('favorite')).toBe('')
})

test('a value the core could not write to localStorage is not overwritten by the stale one', async ()=>{
    window.localStorage.setItem('file_view', '{"old":1}')

    env.quota = true
    Storage.set('file_view', {new: 1})
    env.quota = false

    await flush()

    // ядро само положило новое в резерв; старое из localStorage переносить нельзя
    expect(env.idb.file_view).not.toBe('{"old":1}')
})

test('without nuvio_use nothing is moved: sync plugins read favorite from localStorage', async ()=>{
    window.lampa_settings.nuvio_use = false
    vi.resetModules()

    const fresh = {
        set: (name, value)=> window.localStorage.setItem(name, JSON.stringify(value)),
        get: ()=> false,
        listener: {follow(){}}
    }

    vi.doMock('../src/core/storage/storage', ()=>({default: fresh}))
    await import('../src/custom/core/storage-idb')

    delete env.idb.favorite
    fresh.set('favorite', {book: [3]})

    await flush()

    expect(window.localStorage.getItem('favorite')).toBe('{"book":[3]}')
    expect(env.idb.favorite).toBe(undefined)

    window.lampa_settings.nuvio_use = true
})
