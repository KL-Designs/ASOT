import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/admin/j1/discharge-info — return a discordId→discharge summary map (J1 access)
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const snapshots = await Db.dischargeSnapshots
        .find(
            {},
            { projection: { discordId: 1, dischargeDate: 1, dischargeType: 1, rankAtDischarge: 1, displayName: 1 } }
        )
        .toArray()

    const discharges: Record<string, { dischargeDate: string; dischargeType: string; rankAtDischarge: string; displayName: string }> = {}
    for (const s of snapshots) {
        const snap = s as unknown as DischargeSnapshot
        if (snap.discordId) {
            discharges[snap.discordId] = {
                dischargeDate: snap.dischargeDate,
                dischargeType: snap.dischargeType,
                rankAtDischarge: snap.rankAtDischarge,
                displayName: snap.displayName,
            }
        }
    }

    return NextResponse.json({ discharges })
}
