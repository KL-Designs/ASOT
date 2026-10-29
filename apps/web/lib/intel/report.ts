import type { RosterSlot } from '@/lib/attendance/roster'
import { canCommend } from '@/lib/operations/aar-access'

/**
 * Rows 331 and 332: the Intelligence Report's rules, pure so they can be
 * tested without Mongo. The routes are `app/api/operations/[id]/intel/**`;
 * the Mongo half is `report-db.ts`.
 *
 * The one rule everything else hangs off: **a player never receives intel
 * they are not meant to see.** Hidden future intel, entries awaiting
 * approval, deleted entries and withheld assessments are removed on the
 * server, in `forViewer`, before anything is serialised. There is no client
 * flag that hides them.
 */

export const DEFAULT_INTEL_SETTINGS: IntelReportSettings = {
    sharing: true,
    carryForward: true,
    importFromAars: true,
    requireApproval: false,
}

export function resolveSettings(saved: Partial<IntelReportSettings> | null | undefined): IntelReportSettings {
    return { ...DEFAULT_INTEL_SETTINGS, ...(saved ?? {}) }
}

export function sanitiseSettings(body: unknown): IntelReportSettings | null {
    if (!body || typeof body !== 'object') return null
    const b = body as Record<string, unknown>
    const out = { ...DEFAULT_INTEL_SETTINGS }
    for (const k of Object.keys(DEFAULT_INTEL_SETTINGS) as (keyof IntelReportSettings)[]) {
        if (typeof b[k] === 'boolean') out[k] = b[k] as boolean
    }
    return out
}

export const ASSESSMENT_STATUSES: IntelAssessmentStatus[] = ['confirmed', 'partial', 'declined', 'unassessed']

export const ASSESSMENT_LABEL: Record<IntelAssessmentStatus, string> = {
    confirmed: 'Confirmed',
    partial: 'Partially Confirmed',
    declined: 'Declined',
    unassessed: 'Unassessed',
}

export const STARTING_INTEL = 'Starting intel'

/* ── Who may do what ─────────────────────────────────────────────────────── */

export interface IntelStanding {
    canAdd: boolean
    canAssess: boolean
    canManage: boolean
}

/**
 * Granted keys first, then the positional arms: staff on the night (section
 * leads, PHQ, CHQ) may add, and the operation's owner holds everything.
 */
export function intelStanding(
    roster: RosterSlot[],
    userId: string,
    grants: IntelStanding,
    isOwner: boolean,
): IntelStanding {
    if (isOwner) return { canAdd: true, canAssess: true, canManage: true }
    const onNightStaff = canCommend(roster, userId, { canManageAll: false, isJ4: false, isMissionMaker: false })
    return {
        canAdd: grants.canAdd || grants.canAssess || grants.canManage || onNightStaff,
        canAssess: grants.canAssess || grants.canManage,
        canManage: grants.canManage,
    }
}

export const isIntelStaff = (s: IntelStanding) => s.canAdd || s.canAssess || s.canManage

export type IntelView = 'active' | 'add' | 'review' | 'deleted'

export function viewsFor(s: IntelStanding): IntelView[] {
    return [
        'active',
        ...(s.canAdd ? ['add' as const] : []),
        ...(s.canAssess ? ['review' as const] : []),
        ...(s.canManage ? ['deleted' as const] : []),
    ]
}

/* ── What is in the report ───────────────────────────────────────────────── */

export interface ReportPosition {
    campaignId: string | null
    operationId: string
    /** This operation's mission sequence; 1 for a standalone operation. */
    sequence: number
}

/**
 * Does this entry belong to the report at this position, before any
 * question of who is looking? Same campaign (or the same standalone
 * operation), and reported at or before this mission. With carry forward
 * off, only starting intel and this mission's own entries.
 */
export function inReport(entry: Pick<IntelEntry, 'campaignId' | 'operationId' | 'sourceSequence'>, at: ReportPosition, settings: IntelReportSettings): boolean {
    if (at.campaignId) {
        if (entry.campaignId !== at.campaignId) return false
    } else if (entry.campaignId || entry.operationId !== at.operationId) {
        // Outside a campaign even starting intel carries the operation's id.
        return false
    }
    if (entry.sourceSequence > at.sequence) return false
    if (!settings.carryForward && entry.sourceSequence !== 0 && entry.sourceSequence !== at.sequence) return false
    return true
}

/** Released at this mission: never hidden, or hidden only until a mission already reached. */
export function isReleased(entry: Pick<IntelEntry, 'hiddenUntilSequence'>, sequence: number): boolean {
    return entry.hiddenUntilSequence === null || entry.hiddenUntilSequence === undefined || entry.hiddenUntilSequence <= sequence
}

const isDeleted = (e: Pick<IntelEntry, 'deletedAt'>) => !!e.deletedAt

/**
 * Could a player see this entry at this mission? Everything a player reads
 * passes through here: sharing on, not deleted, published, released.
 * Assessment plays no part — declined intel still carries forward.
 */
export function playerCanSee(entry: Pick<IntelEntry, 'deletedAt' | 'publication' | 'hiddenUntilSequence'>, sequence: number, settings: IntelReportSettings): boolean {
    return settings.sharing && !isDeleted(entry) && entry.publication === 'published' && isReleased(entry, sequence)
}

/** Which entries this view holds for a staff member. */
export function inView(entry: Pick<IntelEntry, 'deletedAt' | 'publication' | 'hiddenUntilSequence' | 'assessment'>, view: IntelView, sequence: number): boolean {
    if (view === 'deleted') return isDeleted(entry)
    if (isDeleted(entry)) return false
    if (view === 'review') {
        return entry.publication === 'pending' || !isReleased(entry, sequence) || entry.assessment.status === 'unassessed' || !entry.assessment.released
    }
    // Active, for staff: everything published and released, as players see it.
    return entry.publication === 'published' && isReleased(entry, sequence)
}

export interface ClientIntelEntry {
    id: string
    operationId: string | null
    sourceSequence: number
    callSign: string
    submittedByName: string
    title: string
    description: string
    evidence: IntelEvidence[]
    grid: string
    createdAt: string
    updatedAt: string
    assessment: { status: IntelAssessmentStatus; comment: string; released: boolean; byName: string | null; at: string | null } | null
    votes: { up: number; down: number; mine: 1 | -1 | 0 }
    // Staff only.
    hiddenUntilSequence?: number | null
    publication?: 'published' | 'pending'
    versionCount?: number
    submittedById?: string
    deleted?: { at: string; byName: string | null; reason: string | null }
}

export function tallyVotes(votes: Pick<IntelVote, 'userId' | 'value'>[], me: string) {
    let up = 0, down = 0, mine: 1 | -1 | 0 = 0
    for (const v of votes) {
        if (v.value === 1) up++
        else if (v.value === -1) down++
        if (v.userId === me) mine = v.value
    }
    return { up, down, mine }
}

/**
 * The shape that leaves the server. A player gets no hidden-until, no
 * publication state, no version count and no submitter id, and the
 * assessment only once it is released to them.
 */
export function forViewer(entry: IntelEntry & { _id: { toString(): string } }, staff: boolean, votes: ClientIntelEntry['votes']): ClientIntelEntry {
    const a = entry.assessment
    const assessment = staff || a.released
        ? { status: a.status, comment: a.comment, released: a.released, byName: a.byName ?? null, at: a.at ? new Date(a.at).toISOString() : null }
        : null
    const base: ClientIntelEntry = {
        id: entry._id.toString(),
        operationId: entry.operationId,
        sourceSequence: entry.sourceSequence,
        callSign: entry.callSign,
        submittedByName: entry.submittedByName,
        title: entry.title,
        description: entry.description,
        evidence: entry.evidence,
        grid: entry.grid,
        createdAt: new Date(entry.createdAt).toISOString(),
        updatedAt: new Date(entry.updatedAt).toISOString(),
        assessment,
        votes,
    }
    if (!staff) return base
    return {
        ...base,
        hiddenUntilSequence: entry.hiddenUntilSequence,
        publication: entry.publication,
        versionCount: entry.versions?.length ?? 0,
        submittedById: entry.submittedById,
        ...(entry.deletedAt ? { deleted: { at: new Date(entry.deletedAt).toISOString(), byName: entry.deletedByName ?? null, reason: entry.deleteReason ?? null } } : {}),
    }
}

/** Grouped by mission (oldest first, starting intel at the top), then call sign. */
export function groupByMission<T extends Pick<ClientIntelEntry, 'sourceSequence' | 'callSign'>>(entries: T[]) {
    const missions = new Map<number, Map<string, T[]>>()
    for (const e of entries) {
        if (!missions.has(e.sourceSequence)) missions.set(e.sourceSequence, new Map())
        const bySign = missions.get(e.sourceSequence)!
        if (!bySign.has(e.callSign)) bySign.set(e.callSign, [])
        bySign.get(e.callSign)!.push(e)
    }
    return [...missions.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([sequence, bySign]) => ({
            sequence,
            callSigns: [...bySign.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([callSign, list]) => ({ callSign, entries: list })),
        }))
}

/* ── Input ───────────────────────────────────────────────────────────────── */

const MAX_EVIDENCE = 12

/** Our own uploads, or an http(s) link. Anything else (javascript:, data:) is dropped. */
export function safeUrl(u: unknown): string | null {
    if (typeof u !== 'string') return null
    const s = u.trim()
    if (s.startsWith('/api/upload/')) return s
    try {
        const url = new URL(s)
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
    } catch {
        return null
    }
}

export function sanitiseEvidence(list: unknown): IntelEvidence[] {
    if (!Array.isArray(list)) return []
    const out: IntelEvidence[] = []
    for (const raw of list.slice(0, MAX_EVIDENCE)) {
        if (!raw || typeof raw !== 'object') continue
        const r = raw as Record<string, unknown>
        const kind = r.kind === 'image' || r.kind === 'video' || r.kind === 'link' ? r.kind : null
        const url = safeUrl(r.url)
        if (!kind || !url) continue
        out.push({ kind, url, caption: typeof r.caption === 'string' ? r.caption.slice(0, 300) : '' })
    }
    return out
}

export interface IntelInput {
    title: string
    description: string
    grid: string
    evidence: IntelEvidence[]
}

export function sanitiseEntryInput(body: unknown): IntelInput | null {
    if (!body || typeof body !== 'object') return null
    const b = body as Record<string, unknown>
    const text = (v: unknown, n: number) => typeof v === 'string' ? v.trim().slice(0, n) : ''
    const input = {
        title: text(b.title, 160),
        description: text(b.description, 8000),
        grid: text(b.grid, 40),
        evidence: sanitiseEvidence(b.evidence),
    }
    if (!input.title && !input.description && !input.evidence.length) return null
    if (!input.title) input.title = input.description.split('\n')[0].slice(0, 80) || 'Untitled intel'
    return input
}

/** The hidden-until field from a form: blank or ≤ the source mission means released. */
export function hiddenUntil(v: unknown, sourceSequence: number): number | null {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
    if (!Number.isInteger(n) || n <= sourceSequence) return null
    return Math.min(n, 999)
}

/** The version to push before an edit overwrites the entry. */
export function snapshotVersion(entry: Pick<IntelEntry, 'title' | 'description' | 'evidence' | 'grid'>, by: { id: string; name: string }, at = new Date()): IntelVersion {
    return { at, byId: by.id, byName: by.name, title: entry.title, description: entry.description, evidence: entry.evidence, grid: entry.grid }
}

export function changed(entry: Pick<IntelEntry, 'title' | 'description' | 'evidence' | 'grid'>, input: IntelInput): boolean {
    return entry.title !== input.title || entry.description !== input.description || entry.grid !== input.grid
        || JSON.stringify(entry.evidence) !== JSON.stringify(input.evidence)
}

/** May this person edit this entry? Managers any; anyone who may add, their own. */
export function canEditEntry(entry: Pick<IntelEntry, 'submittedById'>, userId: string, s: IntelStanding): boolean {
    return s.canManage || (s.canAdd && entry.submittedById === userId)
}
