/**
 * Row 372 (Part A): a course's documents as a list of slots rather than the
 * two hard-coded buttons. Every course starts with Training Document and
 * Trainer's Guide; Leadership courses also get Assessment Orders (Part B);
 * J3 leads add more with "+ Add Document".
 *
 * Existing guides need no migration: a guide without `slotId` belongs to the
 * slot its old `guideType` names, so the two default slots pick them up as
 * they are.
 */

import { courseTypeOf } from './course-type'
import { sessionTemplateFor, sessionTitle, type SessionTemplateItem } from './course-sessions'

export interface DocumentSlot {
    id: string
    name: string
    order: number
    /** 'assessment' opens the Assessment Orders page instead of a guide. */
    kind: 'guide' | 'assessment'
}

export const TRAINING_DOCUMENT_SLOT = 'training_document'
export const TRAINERS_GUIDE_SLOT = 'trainers_guide'
export const ASSESSMENT_ORDERS_SLOT = 'assessment_orders'

export const DEFAULT_SLOTS: DocumentSlot[] = [
    { id: TRAINING_DOCUMENT_SLOT, name: 'Training Document', order: 0, kind: 'guide' },
    { id: TRAINERS_GUIDE_SLOT, name: "Trainer's Guide", order: 1, kind: 'guide' },
]

export const ASSESSMENT_SLOT: DocumentSlot = { id: ASSESSMENT_ORDERS_SLOT, name: 'Assessment Orders', order: 2, kind: 'assessment' }

export const isLeadership = (type: { category?: string }) => (type.category ?? '').toLowerCase() === 'leadership'

/** The slots a course shows, in order: its saved list, or the defaults for its category. */
export function slotsFor(type: { category?: string; documentSlots?: DocumentSlot[] }): DocumentSlot[] {
    const saved = type.documentSlots?.length ? type.documentSlots : DEFAULT_SLOTS
    const out = [...saved]
    for (const d of DEFAULT_SLOTS) if (!out.some(s => s.id === d.id)) out.push(d)
    if (isLeadership(type) && !out.some(s => s.id === ASSESSMENT_ORDERS_SLOT)) out.push(ASSESSMENT_SLOT)
    return out.sort((a, b) => a.order - b.order)
}

export const SESSION_SLOT_PREFIX = 'session_'

/**
 * Selection and the Reinforcement Cycle: one instructor document per session
 * of the course's session list, shown grouped by session beside the course
 * rather than in the slot list. Keyed by session number, so renaming a
 * session keeps its document. Empty for every other course.
 */
export function sessionSlotsFor(type: { courseType?: string | null; category?: string | null; name?: string | null; sessionTemplate?: SessionTemplateItem[] | null }): (DocumentSlot & { session: number; sessionName: string })[] {
    const courseType = courseTypeOf(type)
    if (!courseType) return []
    return sessionTemplateFor({ courseType, sessionTemplate: type.sessionTemplate }).map((item, i) => ({
        id: `${SESSION_SLOT_PREFIX}${i + 1}`,
        name: `${sessionTitle(i + 1, item.name)}: Instructor Document`,
        order: 100 + i,
        kind: 'guide' as const,
        session: i + 1,
        sessionName: sessionTitle(i + 1, item.name),
    }))
}

/** Which slot a guide fills. */
export function guideSlotId(guide: { slotId?: string; guideType?: string }): string {
    return guide.slotId || (guide.guideType === 'training_document' ? TRAINING_DOCUMENT_SLOT : TRAINERS_GUIDE_SLOT)
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)

/** Add a named slot to the end. Refuses a duplicate name. */
export function addSlot(slots: DocumentSlot[], name: string, kind: DocumentSlot['kind'] = 'guide'): DocumentSlot[] | null {
    const clean = name.trim().slice(0, 60)
    if (!clean || slots.some(s => s.name.toLowerCase() === clean.toLowerCase())) return null
    let id = `doc_${slug(clean) || 'document'}`
    while (slots.some(s => s.id === id)) id += '_'
    return [...slots, { id, name: clean, order: Math.max(-1, ...slots.map(s => s.order)) + 1, kind }]
}

/** What a J3 lead may save: the defaults always stay; names and order may change. */
export function sanitiseSlots(raw: unknown, type: { category?: string }): DocumentSlot[] | null {
    if (!Array.isArray(raw)) return null
    const out: DocumentSlot[] = []
    for (const [i, r] of raw.slice(0, 20).entries()) {
        if (!r || typeof r !== 'object') continue
        const x = r as Record<string, unknown>
        const id = typeof x.id === 'string' ? x.id.slice(0, 60) : ''
        const name = typeof x.name === 'string' ? x.name.trim().slice(0, 60) : ''
        if (!id || !name || out.some(s => s.id === id)) continue
        out.push({ id, name, order: i, kind: id === ASSESSMENT_ORDERS_SLOT || x.kind === 'assessment' ? 'assessment' : 'guide' })
    }
    return slotsFor({ category: type.category, documentSlots: out })
}
