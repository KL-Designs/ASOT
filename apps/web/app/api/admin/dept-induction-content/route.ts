import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'

const VALID_DEPTS = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7']

function deptPermission(dept: string) {
    const map: Record<string, string[]> = {
        j1: PERMISSIONS.tickets.actionJ1,
        j2: PERMISSIONS.tickets.actionJ2,
        j3: PERMISSIONS.tickets.actionJ3,
        j4: PERMISSIONS.tickets.actionJ4,
        j5: PERMISSIONS.tickets.actionJ1, // J5 uses J1 ticket action or J4
        j6: PERMISSIONS.tickets.actionJ6,
        j7: PERMISSIONS.tickets.actionJ7,
    }
    return map[dept] ?? PERMISSIONS.tickets.actionJ4
}

/** GET /api/admin/dept-induction-content?dept=j3 — fetch dept-specific induction content. */
export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const dept = req.nextUrl.searchParams.get('dept') ?? ''
    if (!VALID_DEPTS.includes(dept)) return NextResponse.json({ error: 'Invalid dept' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.tickets.actionJ4)
    if (!isJ4 && !client.hasRoles(me, deptPermission(dept))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const content = await Db.siteSettings.findOne({ _id: `inductionContent:${dept}` }) as InductionDeptContent | null
    return NextResponse.json({ content: content ?? null })
}

/** PATCH /api/admin/dept-induction-content?dept=j3 — save dept-specific induction content. */
export async function PATCH(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const dept = req.nextUrl.searchParams.get('dept') ?? ''
    if (!VALID_DEPTS.includes(dept)) return NextResponse.json({ error: 'Invalid dept' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.tickets.actionJ4)
    if (!isJ4 && !client.hasRoles(me, deptPermission(dept))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { rulesBody, tutorialBody } = body

    if (typeof rulesBody !== 'string') {
        return NextResponse.json({ error: 'rulesBody is required' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const update: Partial<InductionDeptContent> = {
        dept,
        rulesBody: rulesBody.trim(),
        tutorialBody: typeof tutorialBody === 'string' ? tutorialBody.trim() : '',
        updatedAt: new Date(),
        updatedByName: displayName,
    }

    await Db.siteSettings.updateOne(
        { _id: `inductionContent:${dept}` },
        { $set: update },
        { upsert: true }
    )

    logAction({
        action: 'admin.deptInductionContent.updated',
        category: 'system',
        performedBy: me.id,
        performedByName: displayName,
        department: dept,
        details: { dept },
    })

    const content = await Db.siteSettings.findOne({ _id: `inductionContent:${dept}` })
    return NextResponse.json({ content })
}
