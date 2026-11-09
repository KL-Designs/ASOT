import type { AssessmentTemplate } from './orders-assessment'
import { isOpenForTrainee, type AssessmentStatus, type ReviewerStanding } from './orders-assessment'

/**
 * Row 373: orders assessments written in the operations editor. Pure.
 *
 * A variant whose source orders are an operation on the site hands each
 * trainee a private copy of that operation with their name on it. They write
 * their section orders into it like any other orders page. Only the trainee,
 * their trainer, J3 training staff and J4 can open it, and only the trainee
 * can write in it, and only while the assessment is open and it is their
 * current copy (a reassessment issues a fresh one and keeps the old one
 * read-only).
 *
 * On submit, what they wrote (the copy's text less everything that came
 * from the source) is snapshotted into the assessment's answers, so the
 * review page and the similarity check work on it unchanged.
 */

export const ORDERS_DOCUMENT_FIELD = 'orders'

export const ORDERS_DOCUMENT_TEMPLATE: AssessmentTemplate = {
    title: 'Orders',
    instructions: 'Open your copy of the orders and write your section orders in it, as you would on any operation. Submit here when you are done.',
    fields: [{ id: ORDERS_DOCUMENT_FIELD, kind: 'textarea', label: 'Orders as written', hint: 'Taken from the orders document when it was submitted.' }],
}

export type CopyAccess = 'none' | 'read' | 'write'

export function copyAccess(
    doc: { traineeId: string; trainerId: string; status: AssessmentStatus; operationId?: string | null } | null,
    operationId: string,
    me: string,
    standing: ReviewerStanding,
): CopyAccess {
    if (!doc) return standing.isLead ? 'read' : 'none'
    if (doc.traineeId === me) return isOpenForTrainee(doc.status) && doc.operationId === operationId ? 'write' : 'read'
    if (doc.trainerId === me || standing.isLead || standing.isTrainingStaff) return 'read'
    return 'none'
}

/* ── Text ───────────────────────────────────────────────────────────────── */

interface PMNode { type?: string; text?: string; content?: PMNode[] }
interface SectionLike { title?: string; content?: PMNode | null }

const BLOCKS = new Set(['paragraph', 'heading', 'codeBlock', 'tableCell', 'tableHeader'])

function blocksOf(node: PMNode | null | undefined, out: string[]) {
    if (!node) return
    if (node.type && BLOCKS.has(node.type)) {
        const text = inline(node).trim()
        if (text) out.push(text)
        return
    }
    for (const c of node.content ?? []) blocksOf(c, out)
}

function inline(node: PMNode): string {
    if (typeof node.text === 'string') return node.text
    return (node.content ?? []).map(inline).join(node.type === 'tableRow' ? ' ' : '')
}

/** Every paragraph, heading and cell of an operation's orders, every page, in order. Section titles included. */
export function operationBlocks(op: { sections?: SectionLike[] | null; extraPageSections?: Record<string, SectionLike[]> | null; pages?: { id: string }[] | null }): string[] {
    const out: string[] = []
    const pageOrder = op.pages?.map(p => p.id) ?? ['main']
    const sectionsFor = (id: string) => id === 'main' ? op.sections ?? [] : op.extraPageSections?.[id] ?? []
    const seen = new Set<string>()
    for (const id of [...pageOrder, ...Object.keys(op.extraPageSections ?? {})]) {
        if (seen.has(id)) continue
        seen.add(id)
        for (const s of sectionsFor(id)) {
            if (s.title?.trim()) out.push(s.title.trim())
            blocksOf(s.content ?? null, out)
        }
    }
    return out
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** What the trainee wrote: the copy's blocks that were not already in the source. */
export function writtenText(copy: string[], source: string[]): string {
    const given = new Set(source.map(norm))
    return copy.filter(b => !given.has(norm(b))).join('\n\n')
}
