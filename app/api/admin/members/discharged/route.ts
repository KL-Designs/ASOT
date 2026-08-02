import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'

// GET /api/admin/members/discharged — list discharged members (J4 only)
// GET /api/admin/members/discharged?memberId=xxx — return snapshot summary for one member
export async function GET(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const memberId = req.nextUrl.searchParams.get('memberId')

    if (memberId) {
        const snapshot = await Db.dischargeSnapshots.findOne({ discordId: memberId })
        if (!snapshot) return NextResponse.json({ snapshot: null })

        const milpac = (snapshot as unknown as DischargeSnapshot).milpac
        const bc = milpac?.billetCounts
        return NextResponse.json({
            snapshot: {
                qualifications: milpac?.qualifications?.length ?? 0,
                awards: milpac?.awards?.length ?? 0,
                trainings: (bc?.platoonTraining ?? 0) + (bc?.sectionTraining ?? 0) + (bc?.j3Bct12 ?? 0) + (bc?.j3OtherTrainings ?? 0),
                operations: milpac?.operations?.length ?? 0,
                campaignMedals: bc?.campaignMedals ?? 0,
            },
        })
    }

    const users = await Db.users
        .find({ discharged: { $exists: true } })
        .project({ id: 1, globalName: 1, username: 1, name: 1, 'guild.nickname': 1, 'guild.displayName': 1, discharged: 1 })
        .toArray()

    const members = users.map(u => ({
        id: u.id,
        displayName: u.guild?.nickname || u.guild?.displayName || u.globalName || u.username || u.id,
        discharged: u.discharged,
    }))

    return NextResponse.json({ members })
}

// PATCH /api/admin/members/discharged — reinstate a member (J4 only)
// Body: { targetUserId: string, restoreItems?: ('qualifications'|'awards'|'trainings'|'operations')[] }
export async function PATCH(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { targetUserId, restoreItems = [] } = await req.json()
    if (!targetUserId) {
        return NextResponse.json({ error: 'Missing targetUserId' }, { status: 400 })
    }

    const user = await Db.users.findOne({ id: targetUserId })
    if (!user) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    if (!user.discharged) return NextResponse.json({ error: 'Member is not discharged' }, { status: 400 })

    // Apply selective data restoration from discharge snapshot
    if (Array.isArray(restoreItems) && restoreItems.length > 0) {
        const snapshot = await Db.dischargeSnapshots.findOne({ discordId: targetUserId })
        if (snapshot) {
            const snap = snapshot as unknown as DischargeSnapshot
            const milpac = snap.milpac
            const setOps: Record<string, unknown> = {}

            if (restoreItems.includes('qualifications') && milpac?.qualifications?.length) {
                setOps['milpac.qualifications'] = milpac.qualifications
            }
            if (restoreItems.includes('awards') && milpac?.awards?.length) {
                setOps['milpac.awards'] = milpac.awards
            }
            if (restoreItems.includes('trainings') && milpac?.billetCounts) {
                const bc = milpac.billetCounts
                setOps['milpac.billetCounts.platoonTraining'] = bc.platoonTraining ?? 0
                setOps['milpac.billetCounts.sectionTraining'] = bc.sectionTraining ?? 0
                setOps['milpac.billetCounts.j3Bct12'] = bc.j3Bct12 ?? 0
                setOps['milpac.billetCounts.j3OtherTrainings'] = bc.j3OtherTrainings ?? 0
            }
            if (restoreItems.includes('operations')) {
                if (milpac?.operations?.length) {
                    setOps['milpac.operations'] = milpac.operations
                }
                if (milpac?.billetCounts?.campaignMedals) {
                    setOps['milpac.billetCounts.campaignMedals'] = milpac.billetCounts.campaignMedals
                }
            }

            if (Object.keys(setOps).length > 0) {
                await Db.users.updateOne({ id: targetUserId }, { $set: setOps })
            }
        }
    }

    await Db.users.updateOne({ id: targetUserId }, { $unset: { discharged: '' } })

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    const targetName = user.guild?.nickname || user.guild?.displayName || user.globalName || user.username || targetUserId
    logAction({
        action: 'member.reinstate',
        category: 'member',
        performedBy: me.id,
        performedByName,
        target: `Reinstated ${targetName}`,
        details: { targetUserId, dischargeType: user.discharged.type, restoreItems },
    })

    return NextResponse.json({ ok: true })
}
