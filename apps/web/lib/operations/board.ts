/**
 * The shape of the public operations board.
 *
 * Two jobs, both pure so they can be tested without a database:
 *
 * 1. **Grouping.** A campaign is not a list of operations, it is a list of
 *    numbered missions each of which may have a Saturday and a Sunday. Rendered
 *    flat, "Lost Army" is eight rows that say "Lost Army" eight times; rendered
 *    as its own structure it is four. That grouping already existed inside the
 *    page component and was thrown away at the end of it — this is the same
 *    logic, lifted out so it can be checked and so the server can use it too.
 *
 * 2. **Filtering.** Three hundred-odd operations since 2019 do not want a month
 *    picker. They want search, facets that carry their own counts, and a date
 *    range — which means the filter has to exist as a value that both the query
 *    and the UI can agree on, rather than as a handful of query-string reads.
 */

// ── Titles ────────────────────────────────────────────────────────────────────
//
// Operations linked to a campaign mission carry `campaignMissionId` and
// `daySlot`. Plenty of older ones do not, and encode the same thing in the
// title — "Operation Lost Army IV — SUN". Both are read, because an archive
// that only understood the modern shape would show seven years of history as
// unrelated singletons.

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const

export function detectDaySlot(title: string): { stripped: string; day: 'saturday' | 'sunday' | null } {
    const sat = title.match(/\s*[-–—]?\s*(sat|saturday)\s*$/i)
    if (sat) return { stripped: title.slice(0, title.length - sat[0].length).trim(), day: 'saturday' }
    const sun = title.match(/\s*[-–—]?\s*(sun|sunday)\s*$/i)
    if (sun) return { stripped: title.slice(0, title.length - sun[0].length).trim(), day: 'sunday' }
    return { stripped: title, day: null }
}

export function detectRoman(title: string): { stripped: string; roman: string | null; index: number } {
    const m = title.match(/\s+(I{1,3}|IV|VI{0,3}|IX|X)\s*$/i)
    if (!m) return { stripped: title, roman: null, index: -1 }
    const roman = m[1].toUpperCase()
    return {
        stripped: title.slice(0, title.length - m[0].length).trim(),
        roman,
        index: (ROMAN as readonly string[]).indexOf(roman),
    }
}

// ── What the board renders ────────────────────────────────────────────────────

/** An operation, trimmed to what the board draws. */
export interface BoardOperation {
    id: string
    title: string
    date: string
    status?: string
    /** ORBAT categories assigned, e.g. `['platoon11', 'support']`. */
    units: string[]
    terrain?: string
    /** Banner art, shown on the band's cards. Absent on plenty of older ops. */
    coverImage?: string
    campaignId?: string
    campaignMissionId?: string
    daySlot?: 'saturday' | 'sunday'
    /** How many members a section leader confirmed actually turned out. */
    turnout?: number
    /** How many have said they are coming — the number that matters before the op. */
    attending?: number
    /** The viewer's own answer, when there is a viewer. */
    mine?: { rsvp: 'attending' | 'not_attending' | null; confirmed: boolean } | null
}

/** One numbered mission of a campaign, with its night or nights. */
export interface BoardMission {
    key: string
    name: string
    sequence: number
    /** Ordinal label — "IV" — where one can be worked out, else the sequence. */
    label: string
    saturday: BoardOperation | null
    sunday: BoardOperation | null
    /** Neither Saturday nor Sunday: a mission that ran on one unpaired night. */
    other: BoardOperation[]
}

export type BoardGroup =
    | { kind: 'campaign'; id: string; name: string; missions: BoardMission[]; from: string; to: string }
    | { kind: 'solo'; operation: BoardOperation }

/** A campaign as stored, reduced to what grouping needs. */
export interface CampaignRef { id: string; name: string }
/** A campaign mission as stored, reduced likewise. */
export interface MissionRef { id: string; campaignId: string; name: string; sequence: number }

function earliest(group: BoardGroup): number {
    if (group.kind === 'solo') return new Date(group.operation.date).getTime()
    const dates = group.missions.flatMap(m =>
        [m.saturday, m.sunday, ...m.other].filter(Boolean).map(o => new Date(o!.date).getTime()))
    return dates.length ? Math.min(...dates) : Infinity
}

/**
 * Turn a flat list of operations into campaign brackets and standalone rows.
 *
 * An operation joins a campaign by `campaignId`, or by a `campaignMissionId`
 * that resolves to one. Within a campaign it joins a numbered mission the same
 * way; anything left over is matched on its title, so "Lost Army IV — SAT" and
 * "Lost Army IV — SUN" pair up even with no mission record behind them.
 *
 * Groups come back newest-first by their earliest operation, which is how the
 * archive reads. A campaign spanning a month boundary therefore appears once,
 * at its earliest date — the caller splits it across month headings if it wants
 * to, because only the caller knows which months it is drawing.
 */
export function groupOperations(
    operations: BoardOperation[],
    campaigns: CampaignRef[] = [],
    missions: MissionRef[] = [],
): BoardGroup[] {
    const campaignById = new Map(campaigns.map(c => [c.id, c]))
    const missionById = new Map(missions.map(m => [m.id, m]))

    // Which campaign an operation belongs to, by either route.
    const campaignOf = (op: BoardOperation): string | undefined => {
        if (op.campaignId && campaignById.has(op.campaignId)) return op.campaignId
        const viaMission = op.campaignMissionId ? missionById.get(op.campaignMissionId)?.campaignId : undefined
        return viaMission && campaignById.has(viaMission) ? viaMission : undefined
    }

    const byCampaign = new Map<string, BoardOperation[]>()
    const solos: BoardOperation[] = []

    for (const op of operations) {
        const cid = campaignOf(op)
        if (!cid) { solos.push(op); continue }
        if (!byCampaign.has(cid)) byCampaign.set(cid, [])
        byCampaign.get(cid)!.push(op)
    }

    const groups: BoardGroup[] = []

    for (const [cid, ops] of byCampaign) {
        const campaign = campaignById.get(cid)!
        const built = new Map<string, BoardMission>()

        // Pass one: operations that name their mission outright.
        for (const op of ops) {
            const mission = op.campaignMissionId ? missionById.get(op.campaignMissionId) : undefined
            if (!mission) continue
            const entry = built.get(mission.id) ?? {
                key: mission.id,
                name: mission.name,
                sequence: mission.sequence,
                label: labelFor(mission.name, mission.sequence),
                saturday: null, sunday: null, other: [],
            }
            place(entry, op, op.daySlot ?? detectDaySlot(op.title).day)
            built.set(mission.id, entry)
        }

        // Pass two: everything else, paired on its own title. `Lost Army IV`
        // and `Lost Army IV — SUN` reduce to the same key.
        const placed = new Set<string>()
        for (const m of built.values()) {
            for (const op of [m.saturday, m.sunday, ...m.other]) if (op) placed.add(op.id)
        }

        for (const op of ops) {
            if (placed.has(op.id)) continue
            const { stripped, day } = detectDaySlot(op.title)
            const { roman, index } = detectRoman(stripped)
            const key = `t:${stripped.toLowerCase()}`
            const entry = built.get(key) ?? {
                key,
                name: stripped,
                // Ordered after the real missions, in Roman order among themselves.
                sequence: 1000 + (index >= 0 ? index : 99),
                label: roman ?? '·',
                saturday: null, sunday: null, other: [],
            }
            place(entry, op, op.daySlot ?? day)
            built.set(key, entry)
        }

        const missionList = [...built.values()].sort((a, b) => b.sequence - a.sequence)
        const dates = ops.map(o => new Date(o.date).getTime())

        groups.push({
            kind: 'campaign',
            id: cid,
            name: campaign.name,
            missions: missionList,
            from: new Date(Math.min(...dates)).toISOString(),
            to: new Date(Math.max(...dates)).toISOString(),
        })
    }

    for (const op of solos) groups.push({ kind: 'solo', operation: op })

    return groups.sort((a, b) => earliest(b) - earliest(a))
}

function place(mission: BoardMission, op: BoardOperation, day: 'saturday' | 'sunday' | null) {
    if (day === 'saturday' && !mission.saturday) mission.saturday = op
    else if (day === 'sunday' && !mission.sunday) mission.sunday = op
    else mission.other.push(op)
}

/** "Lost Army IV" → "IV". Falls back to the stored sequence. */
function labelFor(name: string, sequence: number): string {
    return detectRoman(name).roman ?? String(sequence)
}

/** How many operations a group holds — what a month heading counts. */
export function countOperations(group: BoardGroup): number {
    if (group.kind === 'solo') return 1
    return group.missions.reduce(
        (n, m) => n + (m.saturday ? 1 : 0) + (m.sunday ? 1 : 0) + m.other.length, 0)
}

// ── Filtering ─────────────────────────────────────────────────────────────────

export interface BoardFilter {
    /** Free text over the title. */
    q: string
    campaignId: string | null
    /** An ORBAT category from `assignedPlatoons`. */
    unit: string | null
    terrain: string | null
    /** Only operations the viewer was confirmed on. Ignored when signed out. */
    mine: boolean
    /** Inclusive month bounds as `YYYY-MM`, from the histogram's range. */
    from: string | null
    to: string | null
    skip: number
}

export const PAGE_SIZE = 20

export function parseBoardFilter(params: URLSearchParams): BoardFilter {
    const month = (key: string) => {
        const raw = params.get(key)
        return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : null
    }
    const skip = Number.parseInt(params.get('skip') ?? '0', 10)

    return {
        q: (params.get('q') ?? '').trim().slice(0, 120),
        campaignId: params.get('campaign') || null,
        unit: params.get('unit') || null,
        terrain: params.get('terrain') || null,
        mine: params.get('mine') === '1',
        from: month('from'),
        to: month('to'),
        skip: Number.isFinite(skip) && skip > 0 ? Math.min(skip, 10_000) : 0,
    }
}

/** True when anything is narrowing the archive — drives the "clear all" control. */
export function isFiltered(f: BoardFilter): boolean {
    return !!(f.q || f.campaignId || f.unit || f.terrain || f.mine || f.from || f.to)
}

/**
 * Escape a user's search text for use in a Mongo regex.
 *
 * Without this a stray `(` is a syntax error the driver throws on, and `.*` is
 * a search that matches everything — a filter box that can crash the endpoint
 * or silently ignore itself.
 */
export function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── The month histogram ───────────────────────────────────────────────────────

export interface MonthBucket { month: string; count: number }

/** `2026-08`, the key the histogram and the range filter both speak. */
export function monthKey(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Fill the gaps between the first and last month that has anything.
 *
 * A histogram drawn only from months that exist is a lie about spacing: a
 * six-month break reads as a single step, and the shape of the year — which is
 * the entire reason to draw it — disappears. Empty months are real information.
 */
export function fillMonths(buckets: MonthBucket[]): MonthBucket[] {
    if (buckets.length === 0) return []
    const sorted = [...buckets].sort((a, b) => a.month.localeCompare(b.month))
    const counts = new Map(sorted.map(b => [b.month, b.count]))

    const [firstY, firstM] = sorted[0].month.split('-').map(Number)
    const [lastY, lastM] = sorted[sorted.length - 1].month.split('-').map(Number)

    const out: MonthBucket[] = []
    for (let y = firstY, m = firstM; y < lastY || (y === lastY && m <= lastM);) {
        const key = `${y}-${String(m).padStart(2, '0')}`
        out.push({ month: key, count: counts.get(key) ?? 0 })
        if (m === 12) { y++; m = 1 } else m++
    }
    return out
}
