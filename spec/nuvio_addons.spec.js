import {beforeEach, expect, suite, test, vi} from 'vitest'

const mem = vi.hoisted(()=>({store: {}}))

vi.mock('../src/core/storage/storage', ()=>({default: {
    get: (name, empty)=> Object.prototype.hasOwnProperty.call(mem.store, name) ? mem.store[name] : empty,
    set: (name, value)=>{ mem.store[name] = value },
    field: (name)=> mem.store[name],
    listener: {follow(){}}
}}))

import Addons from '../src/custom/services/nuvio/addons'

beforeEach(()=>{
    mem.store = {}
})

suite('nuvio addons', ()=>{
    test('inherited profile reads primary', ()=>{
        mem.store.nuvio_profiles_cache = [
            {profile_index: 1, uses_primary_addons: false},
            {profile_index: 2, uses_primary_addons: true},
        ]
        expect(Addons.inherited(2)).toBe(true)
        expect(Addons.effective(2)).toBe(1)
        expect(Addons.inherited(1)).toBe(false)
        expect(Addons.effective(1)).toBe(1)
    })

    test('computeSync: add missing, toggle changed, remove only applied', ()=>{
        const remote = [
            {url: 'https://a/x.js', name: 'A', enabled: true},
            {url: 'https://b/x.js', name: 'B', enabled: false},
        ]
        const local = [
            {url: 'https://b/x.js', name: 'B', status: 1},
            {url: 'https://c/x.js', name: 'C', status: 1},
        ]
        const plan = Addons.computeSync(remote, local, ['https://c/x.js', 'https://d/x.js'])
        expect(plan.add.map((r)=> r.url)).toEqual(['https://a/x.js'])
        expect(plan.toggle.map((r)=> r.url)).toEqual(['https://b/x.js'])
        // d gone locally already -> not in remove; c applied and missing remotely -> remove
        expect(plan.remove.map((p)=> p.url)).toEqual(['https://c/x.js'])
    })

    test('computeSync: чужі локальні (не applied) не чіпає', ()=>{
        const remote = [{url: 'https://a/x.js', enabled: true}]
        const local = [{url: 'https://zzz/x.js', status: 1}]
        const plan = Addons.computeSync(remote, local, [])
        expect(plan.remove).toEqual([])
        expect(plan.add.map((r)=> r.url)).toEqual(['https://a/x.js'])
    })

    test('toPayload мапить status в enabled зі збереженням порядку', ()=>{
        const payload = Addons.toPayload([
            {url: 'https://b/x.js', name: 'B', status: 0},
            {url: 'https://a/x.js', status: 1},
            null,
            {name: 'no-url'},
        ])
        expect(payload).toEqual([
            {url: 'https://b/x.js', name: 'B', enabled: false, sort_order: 0},
            {url: 'https://a/x.js', name: '', enabled: true, sort_order: 1},
        ])
    })
})
