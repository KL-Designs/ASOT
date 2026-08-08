import { NextResponse } from "next/server"
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'


export async function GET() {

    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.operations.write)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

        // Lazy-purge operations deleted more than 180 days ago
        const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
        await Db.operations.deleteMany({ deletedAt: { $lt: cutoff } })
        // Also purge soft-deleted campaigns and missions older than 180 days
        await Db.operationCampaigns.deleteMany({ isDeleted: true, deletedAt: { $lt: cutoff.toISOString() } })
        await Db.campaignMissions.deleteMany({ isDeleted: true, deletedAt: { $lt: cutoff.toISOString() } })

        const operations = await Db.operations
            .find({ deletedAt: { $exists: true } })
            .sort({ deletedAt: -1 })
            .toArray()

        return NextResponse.json({ operations }, { status: 200 })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
