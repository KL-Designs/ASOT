import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { can } from '@/lib/operations/permissions'
import { sectionOf } from '@/lib/operations/aar-access'
import {
    forViewer, inReport, intelStanding, inView, isIntelStaff, playerCanSee, resolveSettings, STARTING_INTEL, tallyVotes,
    type ClientIntelEntry, type IntelView, type ReportPosition,
} from './report'

/**
 * Rows 331 and 332: the Mongo half of the Intelligence Report. Every route
 * starts from `loadIntelContext` so the position (campaign and mission
 * sequence), the settings and the viewer's standing are worked out once and
 * the same way.
 */

export async function loadIntelContext(operationId: ObjectId, me: User) {
    const id = String(operationId)
    const [operation, attendance, mission, add, assess, manage] = await Promise.all([
        Db.operations.findOne({ _id: operationId }, { projection: { title: 1, ownedBy: 1, campaignId: 1, intelSettings: 1, date: 1 } }),
        Db.operationAttendance.findOne({ operationId }, { projection: { roster: 1, records: 1 } }),
        Db.campaignMissions.findOne({ $or: [{ saturdayOpId: id }, { sundayOpId: id }], isDeleted: { $ne: true } }),
        can(me, 'intel.add'),
        can(me, 'intel.assess'),
        can(me, 'intel.manage'),
    ])
    if (!operation) return null

    const campaignId = operation.campaignId ? String(operation.campaignId) : null
    const campaign = campaignId && ObjectId.isValid(campaignId)
        ? await Db.operationCampaigns.findOne({ _id: new ObjectId(campaignId) }, { projection: { name: 1, intelSettings: 1 } })
        : null

    const roster = attendance?.roster ?? []
    const standing = intelStanding(roster, me.id, { canAdd: add, canAssess: assess, canManage: manage }, !!operation.ownedBy && operation.ownedBy === me.id)
    const position: ReportPosition = { campaignId: campaign ? campaignId : null, operationId: id, sequence: campaign ? (mission?.sequence ?? 1) : 1 }
    const settings = resolveSettings(campaign ? campaign.intelSettings : operation.intelSettings)

    // The call sign a submission is filed under: the slot they held on the night.
    const record = attendance?.records?.find(r => r.userId === me.id)
    const myCallSign = sectionOf(roster, me.id) || record?.lateJoinSection || record?.orbatSection || 'Staff'

    return { operation, campaign, roster, standing, staff: isIntelStaff(standing), position, settings, myCallSign }
}

export type IntelContext = NonNullable<Awaited<ReturnType<typeof loadIntelContext>>>

/** The Mongo filter for everything that could be in this report, before the per-entry rules. */
function scopeFilter(at: ReportPosition) {
    return at.campaignId
        ? { campaignId: at.campaignId, sourceSequence: { $lte: at.sequence } }
        : { campaignId: null, operationId: at.operationId }
}

/** Mission names for the report's headings, by sequence. */
export async function missionNames(ctx: IntelContext): Promise<Record<number, string>> {
    const names: Record<number, string> = { 0: STARTING_INTEL }
    if (!ctx.position.campaignId) {
        names[1] = ctx.operation.title
        return names
    }
    const missions = await Db.campaignMissions.find({ campaignId: ctx.position.campaignId, isDeleted: { $ne: true } }, { projection: { sequence: 1, name: 1 } }).toArray()
    for (const m of missions) names[m.sequence] = m.name
    return names
}

/**
 * The entries for one view, already shaped for the viewer. A player only
 * ever gets the Active view, and only what `playerCanSee` passes.
 */
export async function loadReport(ctx: IntelContext, view: IntelView, me: User): Promise<ClientIntelEntry[]> {
    const staffView = ctx.staff ? view : 'active'
    const raw = await Db.intelEntries.find(scopeFilter(ctx.position)).sort({ sourceSequence: 1, createdAt: 1 }).toArray()
    const entries = raw.filter(e => inReport(e, ctx.position, ctx.settings) && (
        ctx.staff
            ? inView(e, staffView, ctx.position.sequence)
            : playerCanSee(e, ctx.position.sequence, ctx.settings)
    ))
    const votes = entries.length ? await Db.intelVotes.find({ entryId: { $in: entries.map(e => e._id!) } }).toArray() : []
    const byEntry = new Map<string, IntelVote[]>()
    for (const v of votes) {
        const k = String(v.entryId)
        if (!byEntry.has(k)) byEntry.set(k, [])
        byEntry.get(k)!.push(v)
    }
    return entries.map(e => forViewer(e as IntelEntry & { _id: ObjectId }, ctx.staff, tallyVotes(byEntry.get(String(e._id)) ?? [], me.id)))
}

/**
 * One entry, only if it belongs to this report and the viewer may see it.
 * A player asking for a hidden entry by id gets the same null as for one
 * that does not exist.
 */
export async function loadEntryInScope(ctx: IntelContext, entryId: string): Promise<(IntelEntry & { _id: ObjectId }) | null> {
    if (!ObjectId.isValid(entryId)) return null
    const entry = await Db.intelEntries.findOne({ _id: new ObjectId(entryId) })
    if (!entry || !inReport(entry, ctx.position, ctx.settings)) return null
    if (!ctx.staff && !playerCanSee(entry, ctx.position.sequence, ctx.settings)) return null
    return entry as IntelEntry & { _id: ObjectId }
}
