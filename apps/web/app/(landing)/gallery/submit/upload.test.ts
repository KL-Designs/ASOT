import { describe, test, expect, vi } from 'vitest'
import { runUploads, type UploadJob } from './upload'

const job = (id: string): UploadJob => ({ localId: id, body: new FormData() })

describe('runUploads', () => {
    test('reports progress and completion per item', async () => {
        const events: string[] = []
        await runUploads({
            jobs: [job('a')],
            concurrency: 1,
            send: async (_j, onProgress) => { onProgress(0.5); onProgress(1); return { id: 'server-a' } },
            onChange: (localId, state) => events.push(`${localId}:${state.phase}:${Math.round(state.progress * 100)}`),
        })
        expect(events).toEqual(['a:uploading:0', 'a:uploading:50', 'a:uploading:100', 'a:processing:100'])
    })

    test('runs at most `concurrency` at once', async () => {
        let inFlight = 0
        let peak = 0
        await runUploads({
            jobs: ['a', 'b', 'c', 'd'].map(job),
            concurrency: 2,
            send: async () => {
                inFlight++; peak = Math.max(peak, inFlight)
                await new Promise(r => setTimeout(r, 5))
                inFlight--
                return { id: 'x' }
            },
            onChange: () => {},
        })
        expect(peak).toBe(2)
    })

    test('one failure does not stop the rest', async () => {
        const finished: Record<string, string> = {}
        await runUploads({
            jobs: ['a', 'b'].map(job),
            concurrency: 1,
            send: async j => {
                if (j.localId === 'a') throw new Error('network died')
                return { id: 'server-b' }
            },
            onChange: (localId, state) => { finished[localId] = state.phase },
        })
        expect(finished.a).toBe('failed')
        expect(finished.b).toBe('processing')
    })

    test('a failed item carries its message, for the Retry row', async () => {
        let message = ''
        await runUploads({
            jobs: [job('a')],
            concurrency: 1,
            send: async () => { throw new Error('Photos must be under 20MB.') },
            onChange: (_id, state) => { if (state.error) message = state.error },
        })
        expect(message).toBe('Photos must be under 20MB.')
    })

    test('returns the server ids, so the monitor knows what to poll', async () => {
        const result = await runUploads({
            jobs: ['a', 'b'].map(job),
            concurrency: 2,
            send: async j => ({ id: `server-${j.localId}` }),
            onChange: () => {},
        })
        expect(result.uploaded.sort()).toEqual(['server-a', 'server-b'])
        expect(result.failed).toEqual([])
    })
})
