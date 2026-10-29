import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { actorName } from '@/lib/operations/aar-context'
import { loadReport, missionNames } from '@/lib/intel/report-db'
import { forViewer, hiddenUntil, sanitiseEntryInput, STARTING_INTEL, viewsFor, type IntelView } from '@/lib/intel/report'
import { intelGate } from './gate'

/**
 * `/api/operations/{id}/intel` — rows 331 and 332, the Intelligence Report.
 *
 * GET `?view=active|review|deleted` returns the report as this viewer may
 * see it, or `?source=aar` the viewer's own submissions from this
 * operation's AAR. Players only ever get the Active view, filtered on the
 * server (see `lib/intel/report.ts`).
 *
 * POST adds one entry: from the Add tab, from an AAR's Intelligence block
 * (`fromAar`), or as the campaign's starting intel (`starting`, assessors).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const gate = await intelGate(id)
    if ('error' in gate) return gate.error
    const { me, ctx } = gate

    const views = viewsFor(ctx.standing)
    const base = {
        standing: ctx.standing,
        views,
        settings: ctx.settings,
        sequence: ctx.position.sequence,
        campaignName: ctx.campaign?.name ?? null,
        myCallSign: ctx.myCallSign,
    }

    if (req.nextUrl.searchParams.get('source') === 'aar') {
        if (!ctx.standing.canAdd) return NextResponse.json({ ...base, entries: [] })
        const mine = await Db.intelEntries.find({ operationId: id, submittedById: me.id, deletedAt: null }).sort({ createdAt: 1 }).toArray()
        return NextResponse.json({ ...base, entries: mine.map(e => forViewer(e as IntelEntry & { _id: { toString(): string } }, true, { up: 0, down: 0, mine: 0 })) })
    }

    if (!ctx.staff && !ctx.settings.sharing) {
        return NextResponse.json({ ...base, sharedOff: true, missionNames: {}, entries: [] })
    }

    const asked = req.nextUrl.searchParams.get('view') as IntelView | null
    const view: IntelView = asked && views.includes(asked) ? asked : 'active'
    const [entries, names] = await Promise.all([loadReport(ctx, view, me), missionNames(ctx)])
    return NextResponse.json({ ...base, view, missionNames: names, entries })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const gate = await intelGate(id)
    if ('error' in gate) return gate.error
    const { me, ctx } = gate
    if (!ctx.standing.canAdd) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await req.json().catch(() => null)
    const input = sanitiseEntryInput(body)
    if (!input) return NextResponse.json({ error: 'An entry needs a title, a description or some evidence' }, { status: 400 })

    const starting = !!body?.starting
    const fromAar = !!body?.fromAar
    if (starting && !ctx.standing.canAssess) return NextResponse.json({ error: 'Only assessors enter starting intel' }, { status: 403 })
    if (fromAar && !ctx.settings.importFromAars) return NextResponse.json({ error: 'This campaign does not take intel from AARs' }, { status: 403 })

    const sourceSequence = starting ? 0 : ctx.position.sequence
    const now = new Date()
    const name = actorName(me)
    const entry: IntelEntry = {
        campaignId: ctx.position.campaignId,
        // Outside a campaign, starting intel still belongs to the operation.
        operationId: starting && ctx.position.campaignId ? null : id,
        sourceSequence,
        sourceAarUserId: fromAar ? me.id : null,
        callSign: starting ? STARTING_INTEL : (typeof body?.callSign === 'string' && body.callSign.trim() && ctx.standing.canAssess ? body.callSign.trim().slice(0, 60) : ctx.myCallSign),
        submittedById: me.id,
        submittedByName: name,
        ...input,
        // Only an assessor may hold intel back for a later mission.
        hiddenUntilSequence: ctx.standing.canAssess ? hiddenUntil(body?.hiddenUntil, sourceSequence) : null,
        publication: ctx.settings.requireApproval && !ctx.standing.canAssess ? 'pending' : 'published',
        assessment: { status: 'unassessed', comment: '', released: false },
        versions: [],
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
    }
    const res = await Db.intelEntries.insertOne(entry)

    await logAction({
        action: 'intel.entry.create',
        category: 'operation',
        performedBy: me.id,
        performedByName: name,
        entityType: 'intelEntry',
        entityId: String(res.insertedId),
        actionUrl: `/operations/${id}`,
        details: { operationId: id, title: input.title, fromAar, starting, hiddenUntil: entry.hiddenUntilSequence, publication: entry.publication },
    })

    return NextResponse.json({ ok: true, id: String(res.insertedId), publication: entry.publication })
}
