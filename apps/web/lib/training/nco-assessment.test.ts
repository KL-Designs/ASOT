import { describe, expect, test } from 'vitest'
import {
    canDo, canSee, cleanLink, farEnoughAhead, holdsNight, type NcoActor, type NcoSubject,
} from './nco-assessment'

const actor = (id: string, extra: Partial<NcoActor> = {}): NcoActor => ({ id, isJ3Lead: false, staffOf: [], isChq: false, ...extra })

const candidate = actor('cand')
const assessor = actor('assessor')
const lead = actor('lead', { isJ3Lead: true })
const sectionStaff = actor('sgt', { staffOf: ['1-1 Alpha'] })
const otherStaff = actor('sgt2', { staffOf: ['1-1 Bravo'] })
const chq = actor('oc', { isChq: true })
const stranger = actor('nobody')

const base: NcoSubject = { candidateId: 'cand', candidateSection: '1-1 Alpha', status: 'requested' }
const assigned: NcoSubject = { ...base, assessorId: 'assessor', status: 'assigned' }
const confirmed: NcoSubject = { ...assigned, status: 'confirmed' }
const shadowAsked: NcoSubject = { ...confirmed, shadow: { status: 'requested' } }

describe('requesting a night', () => {
    const now = new Date(Date.UTC(2026, 9, 1, 12))

    test('needs a week of notice', () => {
        expect(farEnoughAhead(new Date(Date.UTC(2026, 9, 8, 12)), now)).toBe(true)
        expect(farEnoughAhead(new Date(Date.UTC(2026, 9, 8, 11)), now)).toBe(false)
    })

    test('a bare request does not hold the night, an assigned one does', () => {
        expect(holdsNight('requested')).toBe(false)
        expect(holdsNight('assigned')).toBe(true)
        expect(holdsNight('confirmed')).toBe(true)
        expect(holdsNight('cancelled')).toBe(false)
    })
})

describe('assigning', () => {
    test('is for J3 leads', () => {
        expect(canDo('assign', lead, base)).toBe(true)
        expect(canDo('assign', candidate, base)).toBe(false)
        expect(canDo('assign', sectionStaff, base)).toBe(false)
    })

    test('can be changed until the assessment is over', () => {
        expect(canDo('assign', lead, confirmed)).toBe(true)
        expect(canDo('assign', lead, { ...confirmed, status: 'completed' })).toBe(false)
    })
})

describe('the assessor', () => {
    test('marks themselves as assigned, once named', () => {
        expect(canDo('confirm', assessor, assigned)).toBe(true)
        expect(canDo('confirm', assessor, base)).toBe(false)
        expect(canDo('confirm', lead, assigned)).toBe(false)
    })

    test('can ask to shadow only after confirming, and only once', () => {
        expect(canDo('requestShadow', assessor, assigned)).toBe(false)
        expect(canDo('requestShadow', assessor, confirmed)).toBe(true)
        expect(canDo('requestShadow', assessor, shadowAsked)).toBe(false)
    })

    test('fills in the sheet and closes it', () => {
        expect(canDo('sheet', assessor, confirmed)).toBe(true)
        expect(canDo('complete', assessor, confirmed)).toBe(true)
        expect(canDo('sheet', candidate, confirmed)).toBe(false)
    })
})

describe('shadowing', () => {
    test('is decided by the staff of the candidate\'s section', () => {
        expect(canDo('decideShadow', sectionStaff, shadowAsked)).toBe(true)
        expect(canDo('decideShadow', otherStaff, shadowAsked)).toBe(false)
        expect(canDo('decideShadow', lead, shadowAsked)).toBe(false)
    })

    test('not by the assessor or the candidate, even if they are staff there', () => {
        expect(canDo('decideShadow', { ...assessor, staffOf: ['1-1 Alpha'] }, shadowAsked)).toBe(false)
        expect(canDo('decideShadow', { ...candidate, staffOf: ['1-1 Alpha'] }, shadowAsked)).toBe(false)
    })

    test('and only while it is waiting on them', () => {
        expect(canDo('decideShadow', sectionStaff, { ...confirmed, shadow: { status: 'approved' } })).toBe(false)
        expect(canDo('decideShadow', sectionStaff, confirmed)).toBe(false)
    })
})

describe('the rest', () => {
    test('the candidate or a J3 lead can cancel while it is live', () => {
        expect(canDo('cancel', candidate, assigned)).toBe(true)
        expect(canDo('cancel', lead, assigned)).toBe(true)
        expect(canDo('cancel', assessor, assigned)).toBe(false)
        expect(canDo('cancel', candidate, { ...confirmed, status: 'completed' })).toBe(false)
    })

    test('a recording can be linked afterwards, by those involved', () => {
        const done: NcoSubject = { ...confirmed, status: 'completed' }
        expect(canDo('recording', candidate, done)).toBe(true)
        expect(canDo('recording', assessor, done)).toBe(true)
        expect(canDo('recording', stranger, done)).toBe(false)
    })
})

describe('who can see one', () => {
    test('those in it, J3 leads, the section\'s staff and CHQ', () => {
        for (const who of [candidate, assessor, lead, sectionStaff, chq]) {
            expect(canSee(who, confirmed), who.id).toBe(true)
        }
    })

    test('nobody else', () => {
        expect(canSee(stranger, confirmed)).toBe(false)
        expect(canSee(otherStaff, confirmed)).toBe(false)
    })
})

describe('cleanLink', () => {
    test('keeps a web address and drops everything else', () => {
        expect(cleanLink(' https://docs.example.com/sheet ')).toBe('https://docs.example.com/sheet')
        expect(cleanLink('javascript:alert(1)')).toBeNull()
        expect(cleanLink('not a link')).toBeNull()
        expect(cleanLink('')).toBeNull()
        expect(cleanLink(undefined)).toBeNull()
    })
})
