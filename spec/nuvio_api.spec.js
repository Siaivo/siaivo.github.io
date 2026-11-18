import {beforeEach, expect, suite, test, vi} from 'vitest'

const mem = vi.hoisted(()=>({store: {}}))
const ajax = vi.hoisted(()=>({calls: [], impl: null}))

vi.mock('../src/core/storage/storage', ()=>({default: {
    get: (name, empty)=> Object.prototype.hasOwnProperty.call(mem.store, name) ? mem.store[name] : empty,
    set: (name, value)=>{ mem.store[name] = value },
    field: (name)=> mem.store[name],
    listener: {follow(){}}
}}))

import Api from '../src/custom/services/nuvio/api'

beforeEach(()=>{
    mem.store = {}
    ajax.calls = []
    ajax.impl = null

    vi.stubGlobal('$', {ajax: (opts)=>{
        ajax.calls.push(opts)

        if(ajax.impl) return ajax.impl(opts)

        opts.success({})
    }})
})

suite('nuvio api', ()=>{
    test('chunk splits into at most 500', ()=>{
        const arr = Array.from({length: 1200}, (_, i)=> i)
        const parts = Api.chunk(arr, 500)

        expect(parts.map(p=> p.length)).toEqual([500, 500, 200])
    })

    test('payload is serialized, functions are stripped', async ()=>{
        let sent = null

        ajax.impl = (opts)=>{
            sent = opts.data
            opts.success({ok: 1})
        }

        const handler = ()=>{}

        await Api.rpc('sync_push_watched_items', {p_items: [{content_id: 'tmdb:550', handler}], p_profile_id: 1})

        expect(typeof JSON.parse(sent).p_items[0].handler).toBe('undefined')
        expect(JSON.parse(sent).p_profile_id).toBe(1)
    })

    test('headers carry apikey and bearer', async ()=>{
        mem.store.nuvio_tokens = {access_token: 'tok123'}

        let headers = null

        ajax.impl = (opts)=>{
            headers = opts.headers
            opts.success({})
        }

        await Api.rpc('health_ping', {})

        expect(headers.apikey).toBe(Api.CLOUD_KEY)
        expect(headers.Authorization).toBe('Bearer tok123')
    })

    test('401 triggers one refresh and one retry', async ()=>{
        mem.store.nuvio_tokens = {access_token: 'old', refresh_token: 'r1'}

        let refreshed = 0

        Api.setRefresher(()=>{
            refreshed++

            return Promise.resolve()
        })

        let n = 0

        ajax.impl = (opts)=>{
            n++

            if(n == 1) opts.error({status: 401})
            else opts.success({ok: 1})
        }

        await Api.rpc('health_ping', {})

        expect(n).toBe(2)
        expect(refreshed).toBe(1)

        Api.setRefresher(null)
    })

    test('429 backs off and then throws', async ()=>{
        vi.useFakeTimers()

        ajax.impl = (opts)=> opts.error({status: 429})

        const pending = Api.rpc('health_ping', {})
        const assertion = expect(pending).rejects.toMatchObject({status: 429})

        for(let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(31000)

        await assertion
        expect(ajax.calls.length).toBe(4)

        vi.useRealTimers()
    })
})
