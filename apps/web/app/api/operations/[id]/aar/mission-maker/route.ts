import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { can } from '@/lib/operations/permissions'
import { callText } from '@/lib/ai/service'
import { logAction } from '@/lib/logAction'
import { inCompanyHq } from '@/lib/operations/aar-access'
import { actorName, loadAarContext } from '@/lib/operations/aar-context'
import {
    buildMissionMakerInput, hasMissionMakerInput, missionMakerKey, missionMakerSignature,
    MISSION_MAKER_SCOPE, MISSION_MAKER_SYSTEM_PROMPT, type MissionMakerSource,
} from '@/lib/operations/aar-mission-maker'

/**
 * `/api/operations/{id}/aar/mission-maker` — row 342's summary for the mission maker.
 *
 * GET returns the cached summary (and whether the reports have moved on since);
 * POST makes it, or remakes it with `{ force: true }`. Read by the same people
 * who read the feedback comments in the consolidated view: the mission maker,
 * J4, `aar.manage` and company HQ. It is made from every AAR of the operation,
 * not only the sections the viewer may read, because what reaches them is the
 * mission points with no names attached, never a call sign's raw write-up.
 */

async function gate(id: string) {
    if (!ObjectId.isValid(id)) return { error: NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 }) }
    const operationId = new ObjectId(id)

    const me = await client.fetchMe().catch(() => null)
    if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!(await can(me, 'aar.view'))) return { error: NextResponse.json({ error: 'Access Denied' }, { status: 403 }) }

    const ctx = await loadAarContext(operationId, me)
    if (!ctx.open) return { error: NextResponse.json({ error: 'The operation has not finished yet' }, { status: 403 }) }
    const allowed = ctx.standing.isMissionMaker || ctx.standing.isJ4 || ctx.standing.canManageAll || inCompanyHq(ctx.roster, me.id)
    if (!allowed) return { error: NextResponse.json({ error: 'Access Denied' }, { status: 403 }) }
    if (!ctx.unlocked) return { error: NextResponse.json({ error: 'Save your own report and feedback first', locked: true }, { status: 403 }) }

    return { me, ctx, operationId }
}

async function loadSource(operationId: ObjectId): Promise<MissionMakerSource> {
    const [aars, feedback] = await Promise.all([
        Db.operationAars.find({ operationId }).toArray(),
        Db.operationFeedback.find({ operationId }).toArray(),
    ])
    return {
        aars: aars.map(a => ({
            id: String(a._id), section: a.section, fix: a.fix, improve: a.improve, sustain: a.sustain,
            updatedAt: new Date(a.updatedAt).toISOString(),
        })),
        feedback: feedback.map(f => ({
            id: String(f._id), server: f.server, combat: f.combat, story: f.story, enjoyment: f.enjoyment ?? null,
            comment: f.comment, updatedAt: new Date(f.updatedAt).toISOString(),
        })),
    }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const g = await gate(id)
    if ('error' in g) return g.error

    const [source, cached, ai] = await Promise.all([
        loadSource(g.operationId),
        Db.aarSummaries.findOne({ _id: missionMakerKey(id) }),
        Db.aiConfig.findOne({ _id: 'main' }),
    ])

    return NextResponse.json({
        aiEnabled: !!ai?.globalEnabled,
        hasInput: hasMissionMakerInput(source),
        summary: cached
            ? {
                text: cached.summary,
                generatedAt: cached.generatedAt,
                generatedByName: cached.generatedByName,
                stale: cached.sourceHash !== missionMakerSignature(source),
            }
            : null,
    })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const g = await gate(id)
    if ('error' in g) return g.error
    const { me, ctx, operationId } = g

    const body = await req.json().catch(() => ({}))
    const source = await loadSource(operationId)
    if (!hasMissionMakerInput(source)) return NextResponse.json({ error: 'No reports or feedback comments to summarise yet' }, { status: 404 })

    const key = missionMakerKey(id)
    const signature = missionMakerSignature(source)
    const existing = await Db.aarSummaries.findOne({ _id: key })
    if (existing && existing.sourceHash === signature && !body?.force) {
        return NextResponse.json({ text: existing.summary, generatedAt: existing.generatedAt, generatedByName: existing.generatedByName, stale: false, cached: true })
    }

    let text: string
    try {
        const result = await callText(
            {
                systemPrompt: MISSION_MAKER_SYSTEM_PROMPT,
                messages: [{ role: 'user', content: buildMissionMakerInput(ctx.operation?.title ?? 'Operation', source) }],
                maxTokens: 1200,
            },
            { userId: me.id, userName: actorName(me), feature: 'aar.missionMaker', relatedId: key },
        )
        text = result.content.trim()
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'The summary could not be made' }, { status: 503 })
    }

    const now = new Date()
    await Db.aarSummaries.updateOne(
        { _id: key },
        {
            $set: {
                scope: MISSION_MAKER_SCOPE,
                level: 'operation',
                unit: id,
                sourceIds: [...source.aars.map(a => a.id), ...source.feedback.map(f => f.id)],
                sourceHash: signature,
                summary: text,
                generatedAt: now,
                generatedById: me.id,
                generatedByName: actorName(me),
            },
        },
        { upsert: true },
    )
    await logAction({
        action: 'aar.missionMaker.generate',
        category: 'operation',
        performedBy: me.id,
        performedByName: actorName(me),
        entityType: 'aarSummary',
        entityId: key,
        actionUrl: `/operations/${id}/aar`,
        details: { aars: source.aars.length, feedback: source.feedback.length },
    })

    return NextResponse.json({ text, generatedAt: now, generatedByName: actorName(me), stale: false, cached: false })
}
