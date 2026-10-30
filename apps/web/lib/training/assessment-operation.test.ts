import { describe, expect, test } from 'vitest'
import { copyAccess, operationBlocks, writtenText } from './assessment-operation'

const staff = { isLead: false, isTrainingStaff: false }
const doc = { traineeId: 't', trainerId: 'r', status: 'in_progress' as const, operationId: 'op2' }

describe('who opens a trainee copy', () => {
    test('the trainee writes only their current copy while it is open', () => {
        expect(copyAccess(doc, 'op2', 't', staff)).toBe('write')
        expect(copyAccess(doc, 'op1', 't', staff)).toBe('read')
        expect(copyAccess({ ...doc, status: 'submitted' }, 'op2', 't', staff)).toBe('read')
    })
    test('trainer, J3 training staff and leads read; anyone else is shut out', () => {
        expect(copyAccess(doc, 'op2', 'r', staff)).toBe('read')
        expect(copyAccess(doc, 'op2', 'x', { isLead: false, isTrainingStaff: true })).toBe('read')
        expect(copyAccess(doc, 'op2', 'x', { isLead: true, isTrainingStaff: true })).toBe('read')
        expect(copyAccess(doc, 'op2', 'x', staff)).toBe('none')
    })
})

describe('what the trainee wrote', () => {
    const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
    const source = { sections: [{ title: 'Situation', content: { type: 'doc', content: [p('Enemy holds the ridge.')] } }] }
    const copy = {
        pages: [{ id: 'main' }, { id: 'pg1' }],
        sections: [{ title: 'Situation', content: { type: 'doc', content: [p('Enemy holds the ridge.'), p('1 Section will clear the ridge from the south.')] } }],
        extraPageSections: { pg1: [{ title: 'Section Orders', content: { type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [p('Gun group on the left.')] }] }] } }] },
    }
    test('blocks come out in page order, titles included', () => {
        expect(operationBlocks(copy)).toEqual(['Situation', 'Enemy holds the ridge.', '1 Section will clear the ridge from the south.', 'Section Orders', 'Gun group on the left.'])
    })
    test('anything carried over from the source is left out', () => {
        expect(writtenText(operationBlocks(copy), operationBlocks(source))).toBe('1 Section will clear the ridge from the south.\n\nSection Orders\n\nGun group on the left.')
    })
})
