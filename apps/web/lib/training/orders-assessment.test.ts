import { describe, expect, test } from 'vitest'
import { assignVariants, canSeeSimilarity, DEFAULT_TEMPLATE, nextVariant, sanitiseAnswers, shapeFor, templateStrip, answersText } from './orders-assessment'
import { compareSubmission, levelOf } from './similarity'
import { addSlot, guideSlotId, sessionSlotsFor, slotsFor } from './document-slots'

describe('document slots', () => {
    test('every course has the two defaults; Leadership adds Assessment Orders', () => {
        expect(slotsFor({ category: 'Medical' }).map(s => s.id)).toEqual(['training_document', 'trainers_guide'])
        expect(slotsFor({ category: 'Leadership' }).map(s => s.name)).toEqual(['Training Document', "Trainer's Guide", 'Assessment Orders'])
    })
    test('old guides land in their slot without a migration', () => {
        expect(guideSlotId({ guideType: 'training_document' })).toBe('training_document')
        expect(guideSlotId({})).toBe('trainers_guide')
        expect(guideSlotId({ slotId: 'doc_range_card' })).toBe('doc_range_card')
    })
    test('adding a slot appends it and refuses a duplicate', () => {
        const next = addSlot(slotsFor({}), 'Range Card')!
        expect(next.at(-1)).toMatchObject({ name: 'Range Card', id: 'doc_range_card', order: 2 })
        expect(addSlot(next, 'range card')).toBeNull()
    })
    test('Selection and RC get one instructor document per session; other courses none', () => {
        expect(sessionSlotsFor({ category: 'Medical', name: 'CLS' })).toEqual([])
        const rc = sessionSlotsFor({ courseType: 'reinforcement_cycle' })
        expect(rc).toHaveLength(14)
        expect(rc[2]).toMatchObject({ id: 'session_3', session: 3, sessionName: 'Session 3 — CQB' })
        expect(sessionSlotsFor({ category: 'Selection', name: 'Selection' }).map(s => s.id)).toEqual(['session_1', 'session_2', 'session_3', 'session_4'])
    })
})

describe('variants', () => {
    test('three variants across five trainees go 1, 2, 3, 1, 2', () => {
        expect(Object.values(assignVariants([1, 2, 3], ['a', 'b', 'c', 'd', 'e']))).toEqual([1, 2, 3, 1, 2])
    })
    test('a trainee who sat a variant gets another', () => {
        expect(assignVariants([1, 2, 3], ['a'], { a: [1] }).a).toBe(2)
        expect(nextVariant([1, 2, 3], [1, 2])).toBe(3)
        expect(nextVariant([1, 2], [1, 2, 1])).toBe(2)
    })
})

describe('trainees never see similarity', () => {
    const doc = { trainerId: 't', traineeId: 'x', similarity: { score: 0.9, level: 'high' as const, matches: [], checkedAt: '', comparedWith: 3 }, attempts: [{ similarity: null }] }
    const none = { isLead: false, isTrainingStaff: false }
    test('stripped for the trainee, kept for the trainer and leads', () => {
        expect(shapeFor(doc, 'x', none)).not.toHaveProperty('similarity')
        expect(shapeFor(doc, 'x', none).attempts?.[0]).not.toHaveProperty('similarity')
        expect(shapeFor(doc, 't', none).similarity?.score).toBe(0.9)
        expect(canSeeSimilarity(doc, 'staff', { isLead: false, isTrainingStaff: true })).toBe(false)
        expect(canSeeSimilarity(doc, 'lead', { isLead: true, isTrainingStaff: false })).toBe(true)
    })
})

describe('similarity', () => {
    const strip = templateStrip(DEFAULT_TEMPLATE)
    const a = 'Alpha section will move north along the creek line to the old farmhouse and establish a support by fire position facing east toward the ridge.'
    test('a copied answer scores high; an unrelated one does not', () => {
        const copy = compareSubmission(a, [{ id: '1', label: 'Pte B', kind: 'submission', text: a }], strip)
        expect(copy.level).toBe('high')
        expect(copy.matches[0].passages.length).toBeGreaterThan(0)
        const other = compareSubmission(a, [{ id: '2', label: 'Pte C', kind: 'submission', text: 'Bravo will clear the compound from the south using smoke, then consolidate and report.' }], strip)
        expect(other.matches).toEqual([])
    })
    test('stock headings alone do not make two orders similar', () => {
        const x = 'Situation. Mission. Execution. Service support. Command and signals.'
        expect(compareSubmission(x, [{ id: '3', label: 'Pte D', kind: 'submission', text: x }], strip).score).toBe(0)
        expect(levelOf(0.3)).toBe('moderate')
    })
    test('answers are read in template order, headings excluded', () => {
        expect(answersText(DEFAULT_TEMPLATE, sanitiseAnswers({ h1: 'x', mission: 'Seize the bridge', enemy: 'Two sections' }, DEFAULT_TEMPLATE))).toBe('Two sections\n\nSeize the bridge')
    })
})
