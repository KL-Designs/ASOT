import type { SimilarityResult } from './similarity'

/**
 * Row 373: orders-writing assessments for Leadership courses. Pure rules:
 * statuses, the template a trainee fills, how scenario variants are spread
 * across a cohort, and what a trainee may see. The routes are
 * `app/api/training/assessments/**`.
 */

export type AssessmentStatus = 'assigned' | 'in_progress' | 'submitted' | 'passed' | 'failed' | 'reassessment_required' | 'resubmitted'

export const STATUS_LABEL: Record<AssessmentStatus, string> = {
    assigned: 'Assigned',
    in_progress: 'In Progress',
    submitted: 'Submitted',
    passed: 'Passed',
    failed: 'Failed',
    reassessment_required: 'Reassessment Required',
    resubmitted: 'Resubmitted',
}

/** The trainee may still write. */
export const isOpenForTrainee = (s: AssessmentStatus) => s === 'assigned' || s === 'in_progress' || s === 'reassessment_required'
/** Waiting on the trainer. */
export const isAwaitingReview = (s: AssessmentStatus) => s === 'submitted' || s === 'resubmitted'

export interface TemplateField {
    id: string
    kind: 'heading' | 'text' | 'textarea'
    label: string
    hint: string
}

export interface AssessmentTemplate {
    title: string
    /** What the trainee is asked to produce, and in what format. */
    instructions: string
    fields: TemplateField[]
}

export interface SourceOrders {
    variant: number
    title: string
    /** The orders the trainee works from: higher-level orders for a section-level course, and so on. */
    body: string
    /** Free text: which course level these suit. */
    level: string
    /**
     * The orders as an operation on the site. Each trainee then gets a private
     * copy to write in (`assessment-operation.ts`) instead of the template form.
     */
    operationId?: string
    /** The operation's title when it was linked, for showing without a lookup. */
    operationTitle?: string
}

const f = (id: string, kind: TemplateField['kind'], label: string, hint = ''): TemplateField => ({ id, kind, label, hint })

export const DEFAULT_TEMPLATE: AssessmentTemplate = {
    title: 'Section Orders',
    instructions: 'Using the source orders you have been given, write the orders you would deliver to your section.',
    fields: [
        f('h1', 'heading', '1. Situation'),
        f('enemy', 'textarea', 'Enemy forces'),
        f('friendly', 'textarea', 'Friendly forces'),
        f('h2', 'heading', '2. Mission'),
        f('mission', 'textarea', 'Mission statement', 'Who, what, where, when and why.'),
        f('h3', 'heading', '3. Execution'),
        f('concept', 'textarea', 'Concept of operations'),
        f('tasks', 'textarea', 'Tasks to subordinates'),
        f('coord', 'textarea', 'Coordinating instructions'),
        f('h4', 'heading', '4. Service Support'),
        f('support', 'textarea', 'Service support'),
        f('h5', 'heading', '5. Command and Signals'),
        f('command', 'textarea', 'Command and signals'),
    ],
}

export const DEFAULT_ORDERS: SourceOrders[] = [1, 2, 3].map(variant => ({ variant, title: `Assessment Orders ${variant}`, body: '', level: '' }))

export interface AssessmentConfigShape {
    orders: SourceOrders[]
    template: AssessmentTemplate
}

const str = (v: unknown, n: number) => typeof v === 'string' ? v.slice(0, n) : ''

export function sanitiseTemplate(raw: unknown): AssessmentTemplate {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const fields: TemplateField[] = []
    for (const x of Array.isArray(r.fields) ? r.fields.slice(0, 60) : []) {
        const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
        const kind = o.kind === 'heading' || o.kind === 'text' || o.kind === 'textarea' ? o.kind : 'textarea'
        const label = str(o.label, 160).trim()
        if (!label) continue
        let id = str(o.id, 40).replace(/[^a-z0-9_-]/gi, '') || `f${fields.length + 1}`
        while (fields.some(y => y.id === id)) id += '_'
        fields.push({ id, kind, label, hint: str(o.hint, 400) })
    }
    return { title: str(r.title, 160).trim() || DEFAULT_TEMPLATE.title, instructions: str(r.instructions, 4000), fields: fields.length ? fields : DEFAULT_TEMPLATE.fields }
}

export function sanitiseOrders(raw: unknown): SourceOrders[] {
    const out: SourceOrders[] = []
    for (const x of Array.isArray(raw) ? raw.slice(0, 12) : []) {
        const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
        const variant = out.length + 1
        const operationId = /^[a-f0-9]{24}$/i.test(str(o.operationId, 24)) ? str(o.operationId, 24) : undefined
        out.push({
            variant, title: str(o.title, 160).trim() || `Assessment Orders ${variant}`, body: str(o.body, 60_000), level: str(o.level, 120),
            ...(operationId ? { operationId, operationTitle: str(o.operationTitle, 200) } : {}),
        })
    }
    return out.length ? out : DEFAULT_ORDERS
}

/** Variants that have something in them (written orders or a linked operation); an empty one is never handed out. */
export const usableVariants = (orders: SourceOrders[]) => orders.filter(o => o.operationId || o.body.trim()).map(o => o.variant)

/**
 * Spread variants across a cohort: with three variants and five trainees,
 * 1, 2, 3, 1, 2. A trainee who has sat a variant before gets one they have
 * not, where there is one.
 */
export function assignVariants(variants: number[], traineeIds: string[], previous: Record<string, number[]> = {}): Record<string, number> {
    const out: Record<string, number> = {}
    if (!variants.length) return out
    traineeIds.forEach((id, i) => {
        const rotated = [...variants.slice(i % variants.length), ...variants.slice(0, i % variants.length)]
        const sat = previous[id] ?? []
        out[id] = rotated.find(v => !sat.includes(v)) ?? rotated[0]
    })
    return out
}

/** For a reassessment: a different variant from any this trainee has had, where possible. */
export function nextVariant(variants: number[], used: number[]): number | null {
    if (!variants.length) return null
    const fresh = variants.find(v => !used.includes(v))
    if (fresh !== undefined) return fresh
    const counts = variants.map(v => ({ v, n: used.filter(u => u === v).length }))
    return counts.sort((a, b) => a.n - b.n)[0].v
}

export function sanitiseAnswers(raw: unknown, template: AssessmentTemplate): Record<string, string> {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const field of template.fields) {
        if (field.kind === 'heading') continue
        const v = str(r[field.id], field.kind === 'text' ? 400 : 20_000)
        if (v.trim()) out[field.id] = v
    }
    return out
}

/** The text the similarity check reads: answers only, in template order. */
export function answersText(template: AssessmentTemplate, answers: Record<string, string>): string {
    return template.fields.filter(x => x.kind !== 'heading').map(x => answers[x.id] ?? '').filter(Boolean).join('\n\n')
}

/** Headings, labels and hints come from the template, not the trainee, so they are stripped before comparing. */
export function templateStrip(template: AssessmentTemplate): string[] {
    return template.fields.flatMap(x => [x.label, x.hint]).concat(template.title).filter(Boolean)
}

/* ── Who sees what ──────────────────────────────────────────────────────── */

export interface ReviewerStanding {
    /** J3 leads and J4: everything, similarity included. */
    isLead: boolean
    /** J3 training staff: assign and read, but not similarity unless assigned. */
    isTrainingStaff: boolean
}

export function canReview(doc: { trainerId: string }, me: string, s: ReviewerStanding): boolean {
    return doc.trainerId === me || s.isLead
}

/** Similarity goes only to the assigned trainer, J3 leads and J4. Never the trainee. */
export function canSeeSimilarity(doc: { trainerId: string; traineeId: string }, me: string, s: ReviewerStanding): boolean {
    if (doc.traineeId === me && doc.trainerId !== me && !s.isLead) return false
    return doc.trainerId === me || s.isLead
}

export function canRead(doc: { trainerId: string; traineeId: string }, me: string, s: ReviewerStanding): boolean {
    return doc.traineeId === me || doc.trainerId === me || s.isLead || s.isTrainingStaff
}

/**
 * Strip everything a viewer may not have. A trainee gets their own copy,
 * their source orders and the outcome: no similarity, no hint that a check
 * ran, and no other variant.
 */
export function shapeFor<T extends { similarity?: SimilarityResult | null; attempts?: { similarity?: SimilarityResult | null }[]; trainerId: string; traineeId: string }>(doc: T, me: string, s: ReviewerStanding): T {
    if (canSeeSimilarity(doc, me, s)) return doc
    const { similarity: _drop, ...rest } = doc
    void _drop
    return { ...rest, attempts: (doc.attempts ?? []).map(a => { const { similarity: _x, ...r } = a; void _x; return r }) } as unknown as T
}
