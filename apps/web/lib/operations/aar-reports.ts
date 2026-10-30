import { isHeadquartersSection } from '@/lib/military/bio-approval'

/**
 * Rows 329 and 330: AAR Reports, under All Staff. Pure half — who may see
 * which call signs, how entries roll up, and the prompt for the summary.
 * The routes are `app/api/aar-reports/**`.
 */

export type ReportScope = 'mission' | 'campaign' | '6m' | '1y'
export type ReportLevel = 'section' | 'platoon' | 'company'

export const REPORT_SCOPES: ReportScope[] = ['mission', 'campaign', '6m', '1y']
export const REPORT_LEVELS: ReportLevel[] = ['section', 'platoon', 'company']

const LEVEL_RANK: Record<ReportLevel, number> = { section: 0, platoon: 1, company: 2 }

export const COMPANY_UNIT = 'Company'

const PLATOON_LABELS: Record<string, string> = {
    companyHQ: 'Company HQ',
    platoon11: '1-1 Platoon',
    platoon12: '1-2 Platoon',
    support: 'Support',
    gamemaster: 'Game Masters',
}

export function platoonLabel(category: string): string {
    return PLATOON_LABELS[category] ?? category.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())
}

type PositionLike = { category: string; sectionTitle: string; isSenior?: boolean }

export interface ReportViewer {
    /** The widest level this viewer may open, or null for none. */
    maxLevel: ReportLevel | null
    /** Platoon categories they may read (PHQ). */
    platoons: string[]
    /** Sections they may read (their own as a section lead). */
    sections: string[]
}

/**
 * From the viewer's current ORBAT positions: CHQ and J4 read the company,
 * a platoon HQ reads its platoon, a section's senior reads that section.
 * Anyone else on All Staff sees nothing here (Q8: no cross-call-sign
 * requests in the first version).
 */
export function reportViewer(positions: PositionLike[], isJ4: boolean): ReportViewer {
    if (isJ4 || positions.some(p => p.category === 'companyHQ')) return { maxLevel: 'company', platoons: [], sections: [] }
    const platoons = [...new Set(positions.filter(p => isHeadquartersSection(p.sectionTitle)).map(p => p.category))]
    const sections = [...new Set(positions.filter(p => p.isSenior && !isHeadquartersSection(p.sectionTitle)).map(p => p.sectionTitle))]
    if (platoons.length) return { maxLevel: 'platoon', platoons, sections }
    if (sections.length) return { maxLevel: 'section', platoons: [], sections }
    return { maxLevel: null, platoons: [], sections: [] }
}

export function levelsFor(viewer: ReportViewer): ReportLevel[] {
    if (!viewer.maxLevel) return []
    return REPORT_LEVELS.filter(l => LEVEL_RANK[l] <= LEVEL_RANK[viewer.maxLevel!])
}

/** PHQ defaults to platoon, CHQ to company, a section lead to their section. */
export function defaultLevel(viewer: ReportViewer): ReportLevel | null {
    return viewer.maxLevel
}

export interface ReportEntry {
    id: string
    operationId: string
    operationTitle: string
    operationDate: string
    userId: string
    name: string
    section: string
    /** Platoon category, from the operation's own roster. */
    platoon: string
    fix: string
    improve: string
    sustain: string
    updatedAt: string
}

/** May this viewer read this entry at all? */
export function canReadEntry(viewer: ReportViewer, entry: Pick<ReportEntry, 'section' | 'platoon'>): boolean {
    if (viewer.maxLevel === 'company') return true
    if (viewer.platoons.includes(entry.platoon)) return true
    return viewer.sections.includes(entry.section)
}

export function unitOf(entry: Pick<ReportEntry, 'section' | 'platoon'>, level: ReportLevel): string {
    if (level === 'company') return COMPANY_UNIT
    if (level === 'platoon') return platoonLabel(entry.platoon)
    return entry.section
}

/** Group what the viewer may read into units at the chosen level, largest first. */
export function groupByUnit<T extends Pick<ReportEntry, 'section' | 'platoon'>>(entries: T[], level: ReportLevel, viewer: ReportViewer) {
    const map = new Map<string, T[]>()
    for (const e of entries) {
        if (!canReadEntry(viewer, e)) continue
        const unit = unitOf(e, level)
        if (!map.has(unit)) map.set(unit, [])
        map.get(unit)!.push(e)
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([unit, list]) => ({ unit, entries: list }))
}

/** One cache key per scope, reference, level and unit. */
export function summaryKey(scope: ReportScope, ref: string, level: ReportLevel, unit: string): string {
    return [scope, ref || '-', level, unit].join('|')
}

/** What the summary was made from: changes whenever an entry is added, edited or removed. */
export function sourceSignature(entries: Pick<ReportEntry, 'id' | 'updatedAt'>[]): string {
    return entries.map(e => `${e.id}@${e.updatedAt}`).sort().join(',')
}

export const SUMMARY_SYSTEM_PROMPT = [
    'You summarise after action reports for a military simulation (ARMA 3) unit.',
    'Each report has Fix (what went wrong), Improve (what could be sharper) and Sustain (what worked).',
    'Write three short headed sections, Fix, Improve and Sustain, each a list of the recurring points,',
    'most frequent first, with how many reports raised each. Merge points that say the same thing.',
    'Use only what the reports say. Do not invent, do not name individual members, and do not add advice of your own.',
].join(' ')

/** The user message for the summary. Names are left out; only call sign and operation are kept. */
export function buildSummaryInput(unit: string, entries: Pick<ReportEntry, 'operationTitle' | 'section' | 'fix' | 'improve' | 'sustain'>[], maxChars = 60_000): string {
    const blocks: string[] = []
    let used = 0
    for (const e of entries) {
        const block = `[${e.operationTitle} · ${e.section}]\nFix: ${e.fix.trim() || '-'}\nImprove: ${e.improve.trim() || '-'}\nSustain: ${e.sustain.trim() || '-'}`
        if (used + block.length > maxChars) break
        blocks.push(block)
        used += block.length
    }
    return `Unit: ${unit}\nReports: ${blocks.length}${blocks.length < entries.length ? ` (of ${entries.length}; the rest did not fit)` : ''}\n\n${blocks.join('\n\n')}`
}

/** Row 330: the copyable list for Monday's Discord post. */
export function commendationsPost(items: { targetName: string; targetType: 'member' | 'callsign'; wording: string; authorName: string; operationTitle: string }[]): string {
    if (!items.length) return ''
    return items
        .map(c => `**${c.targetName}**${c.targetType === 'callsign' ? ' (call sign)' : ''} — ${c.operationTitle}\n${c.wording.trim()}\n— ${c.authorName}`)
        .join('\n\n')
}
