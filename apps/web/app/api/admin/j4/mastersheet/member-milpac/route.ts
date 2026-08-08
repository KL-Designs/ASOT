import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'

// Fields that map directly to milpac top-level keys
const TOP_LEVEL: Record<string, string> = {
    rank:                'milpac.currentRank',
    enlistedDate:        'milpac.enlistedDate',
    j4Points:            'milpac.j4Points',
    disciplineDeductions:'milpac.disciplineDeductions',
}

// Billet count fields stored under milpac.billetCounts
const BILLET_COUNT_FIELDS = new Set([
    'primaryNightOps', 'secondaryNightOps', 'primaryNightFTX', 'secondaryNightFTX',
    'platoonTraining', 'sectionTraining', 'meetings', 'campaignMedals',
    'j1Interviews', 'j1InterviewBonus', 'j2MissionsRun', 'j3Bct12',
    'j3OtherTrainings', 'j5ContentCreated', 'j5MilpacsGenerated', 'j5OfficialPR',
])

// PATCH /api/admin/j4/mastersheet/member-milpac
// Body: { username: string; field: string; value: string | number }
export async function PATCH(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.view)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!client.hasRoles(me, PERMISSIONS.members.editRestricted)) {
        return NextResponse.json({ error: 'Forbidden — J4 only' }, { status: 403 })
    }

    const body = await req.json()
    const { username, field, value } = body as { username: string; field: string; value: unknown }

    if (!username || !field) {
        return NextResponse.json({ error: 'username and field required' }, { status: 400 })
    }

    const member = await Db.users.findOne({ username }, { projection: { _id: 1, id: 1, milpac: 1 } })
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    let setPath: string
    let coercedValue: string | number

    if (TOP_LEVEL[field] !== undefined) {
        setPath = TOP_LEVEL[field]
        coercedValue = (field === 'j4Points' || field === 'disciplineDeductions')
            ? (isFinite(Number(value)) ? Number(value) : 0)
            : String(value ?? '')
    } else if (BILLET_COUNT_FIELDS.has(field)) {
        setPath = `milpac.billetCounts.${field}`
        coercedValue = isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0
    } else {
        return NextResponse.json({ error: `Unknown field: ${field}` }, { status: 400 })
    }

    const before = field === 'rank'
        ? (member.milpac?.currentRank ?? '')
        : field === 'enlistedDate'
            ? (member.milpac?.enlistedDate ?? '')
            : field === 'j4Points'
                ? (member.milpac?.j4Points ?? 0)
                : field === 'disciplineDeductions'
                    ? (member.milpac?.disciplineDeductions ?? 0)
                    : ((member.milpac?.billetCounts as Record<string, number> | undefined)?.[field] ?? 0)

    await Db.users.updateOne({ username }, { $set: { [setPath]: coercedValue } })

    const editorName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'milpac.inline.edit',
        category: 'system',
        department: 'j4',
        performedBy: me.id,
        performedByName: editorName,
        entityType: 'user',
        entityId: String(member._id),
        target: username,
        details: { field, before, after: coercedValue },
    })

    return NextResponse.json({ ok: true, value: coercedValue })
}
