import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import * as Y from 'yjs'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { can } from '@/lib/operations/permissions'
import { logAction } from '@/lib/logs'

const DAY = 86_400_000

/** Missions that have run stay where they ran. */
const FIXED_STATUSES = new Set(['Completed', 'Archived'])

/** "2026-05-12" + n days, kept as a bare date the way campaigns store it. */
function shiftIsoDate(iso: string | undefined, days: number): string | undefined {
    if (!iso) return iso
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
    if (isNaN(d.getTime())) return iso
    return new Date(d.getTime() + days * DAY).toISOString().slice(0, 10)
}

interface Plan {
    campaign: { name: string; startDate?: string; endDate?: string; newStartDate?: string; newEndDate?: string }
    missions: { id: string; title: string; date: string | null; newDate: string | null; moves: boolean; isThis: boolean }[]
}

/**
 * What moving the campaign by `deltaMs` would do. `opId` is the mission whose
 * date was just edited: it has already moved, so it is listed at its new date
 * and not moved again.
 */
async function buildPlan(campaign: OperationCampaign, opId: string, deltaMs: number): Promise<Plan> {
    const days = Math.round(deltaMs / DAY)
    const ops = await Db.operations
        .find({ campaignId: { $in: [campaign._id, campaign._id.toString()] } as any, deletedAt: { $exists: false } })
        .project<{ _id: ObjectId; title: string; date?: Date; status?: string }>({ _id: 1, title: 1, date: 1, status: 1 })
        .sort({ date: 1 })
        .toArray()

    return {
        campaign: {
            name: campaign.name,
            startDate: campaign.startDate,
            endDate: campaign.endDate,
            newStartDate: shiftIsoDate(campaign.startDate, days),
            newEndDate: shiftIsoDate(campaign.endDate, days),
        },
        missions: ops.map(op => {
            const isThis = op._id.toString() === opId
            const date = op.date ? new Date(op.date) : null
            const moves = !isThis && !!date && !FIXED_STATUSES.has(op.status ?? '')
            return {
                id: op._id.toString(),
                title: op.title,
                date: date?.toISOString() ?? null,
                newDate: date ? (moves ? new Date(date.getTime() + deltaMs) : date).toISOString() : null,
                moves,
                isThis,
            }
        }),
    }
}

async function load(request: NextRequest, params: Promise<{ id: string }>, body?: { opId?: string; deltaMs?: number }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !(await can(me, 'orders.details'))) return { error: NextResponse.json({ error: 'Access Denied' }, { status: 403 }) }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const opId = body?.opId ?? searchParams.get('opId') ?? ''
    const deltaMs = Number(body?.deltaMs ?? searchParams.get('deltaMs'))
    if (!ObjectId.isValid(id) || !ObjectId.isValid(opId) || !Number.isFinite(deltaMs) || deltaMs === 0) {
        return { error: NextResponse.json({ error: 'campaign id, opId and a non-zero deltaMs are required' }, { status: 400 }) }
    }

    const campaign = await Db.operationCampaigns.findOne({ _id: new ObjectId(id), isDeleted: { $ne: true } })
    if (!campaign) return { error: NextResponse.json({ error: 'Campaign not found' }, { status: 404 }) }

    return { me, campaign, opId, deltaMs }
}

/**
 * The edited mission's date is stored twice: on the operation, and in its
 * collab document's `meta` map, which the editor reads on open and would
 * otherwise put the old date back on screen. Best effort — a document open in
 * someone's editor right now keeps its in-memory copy until it is next saved,
 * and the operation's own date (what everything else reads) is set regardless.
 */
async function moveMetaDate(opId: ObjectId, iso: string) {
    const op = await Db.operations.findOne({ _id: opId }, { projection: { yjsState: 1 } }) as { yjsState?: { buffer: ArrayBuffer } } | null
    if (!op?.yjsState) return
    const doc = new Y.Doc()
    Y.applyUpdate(doc, new Uint8Array(op.yjsState.buffer))
    const meta = doc.getMap<string>('meta')
    if (!meta.has('date')) return
    meta.set('date', iso)
    await Db.operations.updateOne({ _id: opId }, { $set: { yjsState: Buffer.from(Y.encodeStateAsUpdate(doc)) } as any })
}

/** GET ?opId=&deltaMs= — preview of moving the rest of the campaign. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await load(request, params)
    if ('error' in ctx) return ctx.error
    return NextResponse.json(await buildPlan(ctx.campaign, ctx.opId, ctx.deltaMs))
}

/**
 * POST { opId, deltaMs } — move every other mission in the campaign by the
 * same amount the edited one moved, and the campaign's start and end by the
 * same number of whole days. Each mission's RSVP open instant follows its
 * date, as it does when a date is edited by hand (see /api/operations/update).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await load(request, params, await request.json().catch(() => ({})))
    if ('error' in ctx) return ctx.error
    const { me, campaign, opId, deltaMs } = ctx

    const plan = await buildPlan(campaign, opId, deltaMs)

    for (const m of plan.missions.filter(m => m.moves && m.newDate)) {
        const oid = new ObjectId(m.id)
        const newDate = new Date(m.newDate!)
        await Db.operations.updateOne({ _id: oid }, { $set: { date: newDate } })

        const att = await Db.operationAttendance.findOne({ operationId: oid }, { projection: { rsvpOpenOffsetMins: 1 } })
        if (typeof att?.rsvpOpenOffsetMins === 'number') {
            await Db.operationAttendance.updateOne(
                { operationId: oid },
                { $set: { rsvpOpenAt: new Date(newDate.getTime() - att.rsvpOpenOffsetMins * 60_000) } },
            )
        }
        await moveMetaDate(oid, newDate.toISOString()).catch(() => null)
    }

    const { newStartDate, newEndDate } = plan.campaign
    if (newStartDate !== campaign.startDate || newEndDate !== campaign.endDate) {
        await Db.operationCampaigns.updateOne({ _id: campaign._id }, { $set: { startDate: newStartDate, endDate: newEndDate } })
    }

    logAction({
        action: 'campaign.shift',
        category: 'operation',
        performedBy: me.id,
        performedByName: me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id,
        target: campaign.name,
        entityType: 'campaign',
        entityId: campaign._id.toString(),
        details: { fromOperationId: opId, deltaMs, moved: plan.missions.filter(m => m.moves).map(m => m.id) },
    })

    return NextResponse.json({ ok: true, ...plan })
}
