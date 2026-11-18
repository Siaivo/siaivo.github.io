import {beforeEach, expect, suite, test, vi} from 'vitest'

const mem = vi.hoisted(()=>({store: {}}))

vi.mock('../src/core/storage/storage', ()=>({default: {
    get: (name, empty)=> Object.prototype.hasOwnProperty.call(mem.store, name) ? mem.store[name] : empty,
    set: (name, value)=>{ mem.store[name] = value },
    field: (name)=> mem.store[name],
    listener: {follow(){}}
}}))

import Auth from '../src/custom/services/nuvio/auth'

beforeEach(()=>{
    mem.store = {}

    vi.stubGlobal('$', {ajax: (opts)=> opts.success({})})
})

suite('nuvio auth', ()=>{
    test('login saves tokens and never the password', async ()=>{
        const calls = []
        let sentHeaders = null

        vi.stubGlobal('$', {ajax: (opts)=>{
            calls.push(opts.url + ' ' + opts.data)
            if(opts.url.indexOf('grant_type=password') > -1) sentHeaders = opts.headers
            opts.success({access_token: 'a1', refresh_token: 'r1', expires_in: 3600})
        }})

        await Auth.login('user@example.com', 's3cret')

        expect(mem.store.nuvio_tokens.access_token).toBe('a1')
        expect(JSON.stringify(mem.store)).not.toContain('s3cret')
        expect(sentHeaders.Authorization).toBe('Bearer ' + sentHeaders.apikey)
        expect(sentHeaders.apikey).not.toContain('sb_publishable')
        expect(calls.some(c=> c.indexOf('register_current_device') > -1 || c.indexOf('grant_type=password') > -1)).toBe(true)
    })

    test('two parallel 401s cause a single refresh', async ()=>{
        mem.store.nuvio_tokens = {access_token: 'old', refresh_token: 'r1'}

        let calls = 0
        let resolvers = []

        vi.stubGlobal('$', {ajax: (opts)=>{
            calls++
            resolvers.push(opts)
            if(opts.url.indexOf('.well-known') > -1) opts.success({publishable_key: 'wk'})
        }})

        const p1 = Auth.refresh()
        const p2 = Auth.refresh()

        await new Promise(function(r){ setTimeout(r, 0) })

        expect(calls).toBe(2)
        expect(mem.store.nuvio_keys['https://api.nuvio.tv']).toBe('wk')

        resolvers[1].success({access_token: 'a2', refresh_token: 'r2', expires_in: 3600})

        const [r1, r2] = await Promise.all([p1, p2])

        expect(r1.access_token).toBe('a2')
        expect(r2.access_token).toBe('a2')
        expect(mem.store.nuvio_tokens.refresh_token).toBe('r2')
    })

    test('client id is stable', ()=>{
        expect(Auth.clientId()).toBe(Auth.clientId())
    })
})
