import { describe, expect, test } from 'vitest'
import { buildThread, MAX_DEPTH } from './thread'

const c = (_id: string, parentId?: string | null) => ({ _id, parentId })
const shape = (rows: ReturnType<typeof buildThread<ReturnType<typeof c>>>) =>
    rows.map(r => `${'>'.repeat(r.depth)}${r.comment._id}`)

describe('buildThread', () => {
    test('a flat list stays in the order it arrived', () => {
        expect(shape(buildThread([c('a'), c('b'), c('c')]))).toEqual(['a', 'b', 'c'])
    })

    test('a reply follows the comment it answers, not its own timestamp', () => {
        // b was written before the reply to a, but the reply belongs under a.
        expect(shape(buildThread([c('a'), c('b'), c('a1', 'a'), c('a1x', 'a1')])))
            .toEqual(['a', '>a1', '>>a1x', 'b'])
    })

    test('counts every comment beneath one, at any depth', () => {
        const rows = buildThread([c('a'), c('a1', 'a'), c('a2', 'a'), c('a1x', 'a1')])
        expect(rows.find(r => r.comment._id === 'a')?.descendants).toBe(3)
        expect(rows.find(r => r.comment._id === 'a1')?.descendants).toBe(1)
        expect(rows.find(r => r.comment._id === 'a2')?.descendants).toBe(0)
    })

    test('a reply to a comment that is not in the list becomes top-level', () => {
        expect(shape(buildThread([c('a'), c('orphan', 'gone')]))).toEqual(['a', 'orphan'])
    })

    test('a collapsed comment keeps its row and count but hides its replies', () => {
        const rows = buildThread([c('a'), c('a1', 'a'), c('a1x', 'a1'), c('b')], new Set(['a']))
        expect(shape(rows)).toEqual(['a', 'b'])
        expect(rows[0].descendants).toBe(2)
    })

    test('indent stops at the cap while the order keeps threading', () => {
        const chain = [c('0')]
        for (let i = 1; i <= MAX_DEPTH + 3; i++) chain.push(c(String(i), String(i - 1)))
        const rows = buildThread(chain)
        expect(rows.map(r => r.comment._id)).toEqual(chain.map(x => x._id))
        expect(Math.max(...rows.map(r => r.depth))).toBe(MAX_DEPTH)
    })

    test('a comment naming itself as parent, or a cycle, is still shown', () => {
        expect(shape(buildThread([c('a', 'a')]))).toEqual(['a'])
        const ids = buildThread([c('a', 'b'), c('b', 'a'), c('z')]).map(r => r.comment._id).sort()
        expect(ids).toEqual(['a', 'b', 'z'])
    })
})
