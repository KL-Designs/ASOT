import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import PERMISSIONS from '@/lib/permissions'
import {
    commendationsPost, defaultLevel, groupByUnit, levelsFor, REPORT_LEVELS, REPORT_SCOPES, sourceSignature, summaryKey,
    type ReportLevel, type ReportScope,
} from '@/lib/operations/aar-reports'
import { loadReportData, loadReportOptions, loadReportViewer, operationsInScope } from '@/lib/operations/aar-reports-db'

/**
 * `/api/aar-reports` — rows 329 and 330, the AAR Reports tab under All Staff.
 *
 * `?scope=mission|campaign|6m|1y&ref=<operation or campaign id>&level=section|platoon|company`
 *
 * Returns the entries the viewer may read grouped into units at that level,
 * any cached summary still current for each unit, and the commendations with
 * a copyable post. What a viewer may read comes from their ORBAT position
 * today: CHQ and J4 the company, a platoon HQ its platoon, a section senior
 * their own call sign.
 */
export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const viewer = await loadReportViewer(me)
    const levels = levelsFor(viewer)
    const options = await loadReportOptions()
    if (!viewer.maxLevel) {
        return NextResponse.json({ levels, level: null, options, groups: [], commendations: [], commendationsPost: '', aiEnabled: false })
    }

    const q = req.nextUrl.searchParams
    const scope = (REPORT_SCOPES as string[]).includes(q.get('scope') ?? '') ? q.get('scope') as ReportScope : '6m'
    const ref = q.get('ref') ?? ''
    const asked = q.get('level') as ReportLevel | null
    const level: ReportLevel = asked && (REPORT_LEVELS as string[]).includes(asked) && levels.includes(asked) ? asked : defaultLevel(viewer)!

    const ops = await operationsInScope(scope, ref)
    const { entries, commendations } = await loadReportData(viewer, ops)
    const groups = groupByUnit(entries, level, viewer)

    const keys = groups.map(g => summaryKey(scope, ref, level, g.unit))
    const [cached, ai] = await Promise.all([
        keys.length ? Db.aarSummaries.find({ _id: { $in: keys } }).toArray() : [],
        Db.aiConfig.findOne({ _id: 'main' }),
    ])
    const byKey = new Map(cached.map(s => [s._id, s]))

    return NextResponse.json({
        levels,
        level,
        scope,
        ref,
        options,
        operationCount: ops.length,
        aiEnabled: !!ai?.globalEnabled,
        groups: groups.map((g, i) => {
            const s = byKey.get(keys[i])
            const fresh = !!s && s.sourceHash === sourceSignature(g.entries)
            return {
                unit: g.unit,
                entries: g.entries,
                summary: s ? { text: s.summary, generatedAt: s.generatedAt, generatedByName: s.generatedByName, stale: !fresh } : null,
            }
        }),
        commendations,
        commendationsPost: commendationsPost(commendations),
    })
}
