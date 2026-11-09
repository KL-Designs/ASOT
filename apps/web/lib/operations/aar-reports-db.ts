import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { toBoardUser } from '@/lib/attendance/board-user'
import { aarHasContent } from './aar-access'
import { canReadEntry, reportViewer, type ReportEntry, type ReportScope, type ReportViewer } from './aar-reports'

/**
 * Rows 329 and 330: the Mongo half of AAR Reports. Resolves the viewer from
 * their current ORBAT positions, the operations a scope covers, and every
 * entry and commendation the viewer may read. Pure rules are in
 * `aar-reports.ts`.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export async function loadReportViewer(me: User): Promise<ReportViewer> {
    const positions = await Db.orbatPositions.find({ userId: me.id }, { projection: { category: 1, sectionTitle: 1, isSenior: 1 } }).toArray()
    return reportViewer(positions, client.hasRoles(me, PERMISSIONS.departments.j4))
}

export interface ReportOperation { id: string; title: string; date: string; campaignId: string | null }

/** Recent operations and campaigns, for the scope pickers. */
export async function loadReportOptions() {
    const now = new Date()
    const [operations, campaigns] = await Promise.all([
        Db.operations.find({ date: { $lte: now, $gte: new Date(now.getTime() - 365 * DAY_MS) } }, { projection: { title: 1, date: 1, campaignId: 1 } })
            .sort({ date: -1 }).limit(100).toArray(),
        Db.operationCampaigns.find({}, { projection: { name: 1 } }).toArray(),
    ])
    return {
        operations: operations.map(o => ({ id: String(o._id), title: o.title, date: new Date(o.date).toISOString() })),
        campaigns: campaigns.map(c => ({ id: String(c._id), title: c.name || 'Campaign' })),
    }
}

/** The operations a scope covers, oldest first. */
export async function operationsInScope(scope: ReportScope, ref: string): Promise<ReportOperation[]> {
    const now = new Date()
    let filter: Record<string, unknown>
    if (scope === 'mission') {
        if (!ObjectId.isValid(ref)) return []
        filter = { _id: new ObjectId(ref) }
    } else if (scope === 'campaign') {
        if (!ObjectId.isValid(ref)) return []
        // Stored as either, depending on which editor saved it.
        filter = { campaignId: { $in: [new ObjectId(ref), ref] } }
    } else {
        const days = scope === '6m' ? 183 : 365
        filter = { date: { $gte: new Date(now.getTime() - days * DAY_MS), $lte: now } }
    }
    const ops = await Db.operations.find(filter, { projection: { title: 1, date: 1, campaignId: 1 } }).sort({ date: 1 }).toArray()
    return ops.map(o => ({ id: String(o._id), title: o.title, date: new Date(o.date).toISOString(), campaignId: o.campaignId ? String(o.campaignId) : null }))
}

export interface ReportCommendation {
    id: string
    operationId: string
    operationTitle: string
    authorName: string
    section: string
    platoon: string
    targetType: 'member' | 'callsign'
    targetName: string
    wording: string
    createdAt: string
}

/**
 * Every AAR entry and commendation in the operations the viewer may read.
 * An entry's platoon comes from that operation's own roster, so a call sign
 * that has since moved platoon still rolls up where it was on the night.
 */
export async function loadReportData(viewer: ReportViewer, ops: ReportOperation[]) {
    if (!ops.length || !viewer.maxLevel) return { entries: [] as ReportEntry[], commendations: [] as ReportCommendation[] }
    const ids = ops.map(o => new ObjectId(o.id))
    const opById = new Map(ops.map(o => [o.id, o]))

    const [attendances, aars, commendations] = await Promise.all([
        Db.operationAttendance.find({ operationId: { $in: ids } }, { projection: { operationId: 1, roster: 1 } }).toArray(),
        Db.operationAars.find({ operationId: { $in: ids } }).toArray(),
        Db.operationCommendations.find({ operationId: { $in: ids } }).sort({ createdAt: 1 }).toArray(),
    ])

    // operationId → section title → platoon category
    const platoonOf = new Map<string, Map<string, string>>()
    for (const a of attendances) {
        const m = new Map<string, string>()
        for (const s of a.roster ?? []) if (!m.has(s.sectionTitle)) m.set(s.sectionTitle, s.category)
        platoonOf.set(String(a.operationId), m)
    }
    const platoon = (opId: string, section: string) => platoonOf.get(opId)?.get(section) ?? ''

    const readable = aars
        .filter(a => aarHasContent(a))
        .map(a => ({ a, section: a.section || '', platoon: platoon(String(a.operationId), a.section || '') }))
        .filter(x => canReadEntry(viewer, x))

    const userIds = [...new Set(readable.map(x => x.a.userId))]
    const users = userIds.length ? await Db.users.find({ $or: [{ _id: { $in: userIds } }, { id: { $in: userIds } }] }).toArray() : []
    const userMap = new Map<string, User>()
    for (const u of users) { userMap.set(u.id, u); userMap.set(u._id, u) }

    const entries: ReportEntry[] = readable.map(({ a, section, platoon: p }) => {
        const op = opById.get(String(a.operationId))
        const u = userMap.get(a.userId)
        return {
            id: String(a._id),
            operationId: String(a.operationId),
            operationTitle: op?.title ?? 'Operation',
            operationDate: op?.date ?? '',
            userId: a.userId,
            name: u ? toBoardUser(u, a.userId).displayName : a.userId,
            section,
            platoon: p,
            fix: a.fix ?? '',
            improve: a.improve ?? '',
            sustain: a.sustain ?? '',
            updatedAt: new Date(a.updatedAt ?? a.createdAt ?? 0).toISOString(),
        }
    })

    // Row 330: a commendation rolls up from the call sign it was written in.
    const comms: ReportCommendation[] = commendations
        .map(c => {
            const opId = String(c.operationId)
            return {
                id: String(c._id),
                operationId: opId,
                operationTitle: opById.get(opId)?.title ?? 'Operation',
                authorName: c.authorName,
                section: c.authorSection || '',
                platoon: platoon(opId, c.authorSection || ''),
                targetType: c.targetType,
                targetName: c.targetName,
                wording: c.wording,
                createdAt: new Date(c.createdAt).toISOString(),
            }
        })
        .filter(c => viewer.maxLevel === 'company' || canReadEntry(viewer, c))

    return { entries, commendations: comms }
}
