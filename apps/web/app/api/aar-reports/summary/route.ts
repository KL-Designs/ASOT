import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import PERMISSIONS from '@/lib/permissions'
import { callText } from '@/lib/ai/service'
import { logAction } from '@/lib/logAction'
import { actorName } from '@/lib/operations/aar-context'
import {
    buildSummaryInput, groupByUnit, levelsFor, REPORT_SCOPES, sourceSignature, summaryKey, SUMMARY_SYSTEM_PROMPT,
    type ReportLevel, type ReportScope,
} from '@/lib/operations/aar-reports'
import { loadReportData, loadReportViewer, operationsInScope } from '@/lib/operations/aar-reports-db'

/**
 * POST `/api/aar-reports/summary` `{ scope, ref, level, unit, force? }` —
 * row 329's AI summary of one unit's Fix, Improve and Sustain.
 *
 * Cached in `aar_summaries` by scope, reference, level and unit, and reused
 * while the entries it was made from are unchanged, so opening the tab twice
 * costs one call. Commendations are never sent. When AI is off the tab shows
 * the raw entries instead and this refuses.
 */
export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await req.json().catch(() => null)
    const scope = body?.scope as ReportScope
    const ref = typeof body?.ref === 'string' ? body.ref : ''
    const level = body?.level as ReportLevel
    const unit = typeof body?.unit === 'string' ? body.unit : ''
    if (!REPORT_SCOPES.includes(scope) || !unit) return NextResponse.json({ error: 'Malformed body' }, { status: 400 })

    const viewer = await loadReportViewer(me)
    if (!levelsFor(viewer).includes(level)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const ops = await operationsInScope(scope, ref)
    const { entries } = await loadReportData(viewer, ops)
    const group = groupByUnit(entries, level, viewer).find(g => g.unit === unit)
    if (!group || !group.entries.length) return NextResponse.json({ error: 'Nothing to summarise' }, { status: 404 })

    const key = summaryKey(scope, ref, level, unit)
    const signature = sourceSignature(group.entries)
    const existing = await Db.aarSummaries.findOne({ _id: key })
    if (existing && existing.sourceHash === signature && !body?.force) {
        return NextResponse.json({ text: existing.summary, generatedAt: existing.generatedAt, generatedByName: existing.generatedByName, stale: false, cached: true })
    }

    let text: string
    try {
        const result = await callText(
            { systemPrompt: SUMMARY_SYSTEM_PROMPT, messages: [{ role: 'user', content: buildSummaryInput(unit, group.entries) }], maxTokens: 1200 },
            { userId: me.id, userName: actorName(me), feature: 'aar.summary', relatedId: key },
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
                scope, level, unit,
                sourceIds: group.entries.map(e => e.id),
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
        action: 'aar.summary.generate',
        category: 'operation',
        performedBy: me.id,
        performedByName: actorName(me),
        entityType: 'aarSummary',
        entityId: key,
        details: { scope, ref, level, unit, entries: group.entries.length },
    })

    return NextResponse.json({ text, generatedAt: now, generatedByName: actorName(me), stale: false, cached: false })
}
