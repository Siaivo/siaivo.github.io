import {beforeEach, expect, suite, test, vi} from 'vitest'

const mem = vi.hoisted(()=>({store: {}}))
const calls = vi.hoisted(()=>({rpc: []}))
const restored = vi.hoisted(()=>({list: []}))

vi.mock('../src/core/storage/storage', ()=>({default: {
    get: (name, empty)=> Object.prototype.hasOwnProperty.call(mem.store, name) ? mem.store[name] : empty,
    set: (name, value)=>{ mem.store[name] = value },
    field: (name)=> mem.store[name],
    restore: (name, value)=>{ restored.list.push({name, value}); return Promise.resolve(true) },
    listener: {follow(){}}
}}))

vi.mock('../src/custom/services/nuvio/api', ()=>({default: {
    rpc: (name, args)=>{ calls.rpc.push({name, args}); try { return Promise.resolve(rpcResult(name, args)) } catch(e){ return Promise.reject(e) } }
}}))

// кероване через цей хук: що відповідає pull, чи б'є guarded 409
const state = vi.hoisted(()=>({remote: null, conflict: false}))
function rpcResult(name, args){
    if(name == 'sync_pull_profile_settings_blob') return state.remote ? [state.remote] : []
    if(name == 'sync_push_profile_settings_blob_guarded'){
        if(state.conflict){ var e = new Error('conflict'); e.status = 409; throw e }
        return '2026-11-17T00:00:00Z'
    }
    return null
}

vi.mock('../src/custom/services/nuvio/profiles', ()=>({default: {
    resolveActive: ()=> mem.store['nuvio_active_profile'] || 0
}}))

import SettingsSync from '../src/custom/services/nuvio/settings-sync'

beforeEach(()=>{
    mem.store = {nuvio_enable: true, nuvio_active_profile: 1}
    calls.rpc = []
    restored.list = []
    state.remote = null
    state.conflict = false
    delete globalThis.window
    globalThis.window = {Lampa: {Account: {Permit: {sync: false}}}}
    globalThis.Lampa = globalThis.window.Lampa
})

suite('nuvio settings-sync', ()=>{
    test('collect: секрети не потрапляють у payload', ()=>{
        mem.store['player'] = 'inner'
        mem.store['tmdb_lang'] = 'uk'
        mem.store['language'] = 'uk'
        mem.store['nuvio_tokens'] = {access_token: 'secret'}
        mem.store['account_email'] = 'a@b.c'
        mem.store['jackett_key'] = 'k'

        const payload = SettingsSync.collect()
        expect(payload.lampa.player).toBe('inner')
        expect(payload.lampa.tmdb_lang).toBe('uk')
        expect(payload.lampa.nuvio_tokens).toBe(undefined)
        expect(payload.lampa.account_email).toBe(undefined)
        expect(payload.lampa.jackett_key).toBe(undefined)
    })

    test('canRun: Cub-sync блокує', ()=>{
        expect(SettingsSync.canRun()).toBe(true)
        globalThis.window.Lampa.Account.Permit.sync = true
        expect(SettingsSync.canRun()).toBe(false)
    })

    test('push: без remote пише expected=null, успіх', async ()=>{
        mem.store['player'] = 'inner'
        const r = await SettingsSync.push(1)
        expect(r).toBe('ok')
        const guarded = calls.rpc.find(c=> c.name == 'sync_push_profile_settings_blob_guarded')
        expect(guarded.args.p_expected_updated_at).toBe(null)
        expect(guarded.args.p_profile_id).toBe(1)
        expect(guarded.args.p_platform).toBe('tv')
    })

    test('push: з remote передає updated_at, 409 → conflict без перезапису', async ()=>{
        state.remote = {settings_json: {lampa: {}}, updated_at: '2026-11-01T00:00:00Z'}
        mem.store['player'] = 'tizen'
        const r1 = await SettingsSync.push(1)
        expect(r1).toBe('ok')
        expect(calls.rpc.find(c=> c.name == 'sync_push_profile_settings_blob_guarded').args.p_expected_updated_at).toBe('2026-11-01T00:00:00Z')

        calls.rpc = []
        state.conflict = true
        const r2 = await SettingsSync.push(1)
        expect(r2).toBe('conflict')
        expect(calls.rpc.filter(c=> c.name == 'sync_push_profile_settings_blob_guarded').length).toBe(1)
    })

    test('apply: розкладає ключі lampa через restore', async ()=>{
        const r = await SettingsSync.apply({lampa: {player: 'inner', tmdb_lang: 'uk'}})
        expect(r).toEqual({imported: 2, errors: 0})
        expect(restored.list.map(x=> x.name).sort()).toEqual(['player', 'tmdb_lang'])
    })

    test('apply: порожній блоб — нуль імпорту', async ()=>{
        const r = await SettingsSync.apply(null)
        expect(r).toEqual({imported: 0, errors: 0})
        expect(restored.list.length).toBe(0)
    })
})
