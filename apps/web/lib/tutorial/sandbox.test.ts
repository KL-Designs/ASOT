import { describe, it, expect, vi } from 'vitest'
import { createSandboxFetch, matchHandler, DEFAULT_WRITE_RESPONSE, type SandboxHandler, type SandboxWrite } from './sandbox'
import { pathMatches } from './paths'
import { TUTORIAL_DEFINITIONS, tutorialsForPath, getTutorial } from './registry'
import { ticketsDeptPath } from './tutorials/dept-tickets'

const BASE = 'https://asot.test/dashboard/j1'

function setup(handlers: SandboxHandler[] = [], real?: (url: string, init?: RequestInit) => Response) {
    const realFetch = vi.fn(async (input: any, init?: RequestInit) =>
        real ? real(String(input), init) : new Response(JSON.stringify({ real: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const writes: SandboxWrite[] = []
    const f = createSandboxFetch(realFetch as any, () => handlers, w => writes.push(w), () => BASE)
    return { f, realFetch, writes }
}

describe('sandbox fetch', () => {
    it('passes reads through untouched', async () => {
        const { f, realFetch } = setup()
        const res = await f('/api/things')
        expect(await res.json()).toEqual({ real: true })
        expect(realFetch).toHaveBeenCalledOnce()
    })

    it('never sends a write, even with no handler for it', async () => {
        const { f, realFetch, writes } = setup()
        for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
            const res = await f('/api/admin/j1/applications/abc', { method, body: JSON.stringify({ status: 'accepted' }) })
            expect(res.ok).toBe(true)
            expect(await res.json()).toEqual(DEFAULT_WRITE_RESPONSE)
        }
        expect(realFetch).not.toHaveBeenCalled()
        expect(writes.map(w => w.method)).toEqual(['POST', 'PATCH', 'PUT', 'DELETE'])
        expect(writes[0].body).toEqual({ status: 'accepted' })
        expect(writes[0].url.pathname).toBe('/api/admin/j1/applications/abc')
    })

    it('never sends a write made with a Request object', async () => {
        const { f, realFetch, writes } = setup()
        await f(new Request('https://asot.test/api/x', { method: 'POST', body: '{"a":1}' }))
        expect(realFetch).not.toHaveBeenCalled()
        expect(writes[0].body).toEqual({ a: 1 })
    })

    it('blocks writes to other origins too', async () => {
        const { f, realFetch } = setup()
        await f('https://discord.com/api/webhooks/1', { method: 'POST' })
        expect(realFetch).not.toHaveBeenCalled()
    })

    it('answers a write with its handler', async () => {
        const { f } = setup([{ method: 'POST', path: /^\/api\/x$/, respond: () => ({ status: 201, body: { id: 'fake' } }) }])
        const res = await f('/api/x', { method: 'POST' })
        expect(res.status).toBe(201)
        expect(await res.json()).toEqual({ id: 'fake' })
    })

    it('transforms a real read', async () => {
        const { f, realFetch } = setup([{ method: 'GET', path: '/api/list', transform: d => ({ ...d, extra: 1 }) }])
        expect(await (await f('/api/list?x=1')).json()).toEqual({ real: true, extra: 1 })
        expect(realFetch).toHaveBeenCalledOnce()
    })

    it('leaves a failed read alone', async () => {
        const { f } = setup([{ method: 'GET', path: '/api/list', transform: () => 'nope' }], () => new Response('denied', { status: 403 }))
        const res = await f('/api/list')
        expect(res.status).toBe(403)
        expect(await res.text()).toBe('denied')
    })

    it('matches handlers by method and path', () => {
        const hs: SandboxHandler[] = [{ method: 'GET', path: '/a' }, { path: /^\/b\// }]
        expect(matchHandler(hs, 'get', new URL('https://x/a'))).toBe(hs[0])
        expect(matchHandler(hs, 'POST', new URL('https://x/a'))).toBeUndefined()
        expect(matchHandler(hs, 'DELETE', new URL('https://x/b/1'))).toBe(hs[1])
    })
})

describe('pathMatches', () => {
    it('needs the pathname and only the params the step names', () => {
        expect(pathMatches({ pathname: '/dashboard/j1', search: '?tab=1&app=9' }, '/dashboard/j1?tab=1')).toBe(true)
        expect(pathMatches({ pathname: '/dashboard/j1', search: '?tab=0' }, '/dashboard/j1?tab=1')).toBe(false)
        expect(pathMatches({ pathname: '/dashboard/j1/', search: '' }, '/dashboard/j1')).toBe(true)
        expect(pathMatches({ pathname: '/dashboard/j2', search: '' }, '/dashboard/j1')).toBe(false)
    })
})

describe('tutorial registry', () => {
    it('has unique ids and steps', () => {
        const ids = TUTORIAL_DEFINITIONS.map(t => t.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const t of TUTORIAL_DEFINITIONS) expect(t.steps.length).toBeGreaterThan(0)
    })

    it('lists tutorials by page', () => {
        expect(tutorialsForPath('/dashboard/j1').map(t => t.id)).toEqual(['j1-applications', 'dept-tickets'])
        expect(tutorialsForPath('/dashboard/j3').map(t => t.id)).toEqual(['dept-tickets'])
        expect(tutorialsForPath('/dashboard/j10')).toEqual([])
    })

    it('runs the tickets tutorial on the department it was started from', () => {
        expect(ticketsDeptPath({ startedFrom: '/dashboard/j3' })).toBe('/dashboard/j3')
        expect(ticketsDeptPath({ startedFrom: '/dashboard/j4' })).toBe('/dashboard/j1')
        expect(ticketsDeptPath({ startedFrom: '/help' })).toBe('/dashboard/j1')
    })
})

describe('j1-applications practice data', () => {
    it('adds the practice application and keeps practice edits across reloads', async () => {
        const handlers = getTutorial('j1-applications')!.sandbox!({ startedFrom: '/dashboard/j1', userId: 'u1' })
        const { f } = setup(handlers, () => new Response(JSON.stringify({ applications: [{ _id: 'real1', status: 'pending' }] }), { status: 200 }))

        let apps = (await (await f('/api/admin/j1/applications')).json()).applications
        expect(apps.map((a: any) => a._id)).toEqual(['tutorial-practice-application', 'real1'])
        expect(apps[0].assignedReviewerId).toBe('u1')

        await f('/api/admin/j1/applications/tutorial-practice-application', { method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) })
        await f('/api/admin/j1/applications/real1', { method: 'DELETE' })
        apps = (await (await f('/api/admin/j1/applications')).json()).applications
        expect(apps).toHaveLength(1)
        expect(apps[0].status).toBe('accepted')
    })
})

describe('dept-tickets practice data', () => {
    it('shows the practice ticket until it is transferred away', async () => {
        const handlers = getTutorial('dept-tickets')!.sandbox!({ startedFrom: '/dashboard/j3' })
        const { f } = setup(handlers, () => new Response(JSON.stringify([{ _id: 'real' }]), { status: 200 }))

        let list = await (await f('/api/feedback?department=j3')).json()
        expect(list.map((t: any) => t._id)).toEqual(['tutorial-practice-ticket', 'real'])
        expect(await (await f('/api/feedback?department=j3&category=bug')).json()).toHaveLength(1)

        await f('/api/tickets/tutorial-practice-ticket/transfer', { method: 'POST', body: JSON.stringify({ toDepartment: 'j5' }) })
        list = await (await f('/api/feedback?department=j3')).json()
        expect(list.map((t: any) => t._id)).toEqual(['real'])
    })
})
