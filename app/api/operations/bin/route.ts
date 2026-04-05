import { NextResponse } from "next/server"
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'


export async function GET() {

    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.operations.write)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

        // Lazy-purge operations deleted more than 30 days ago
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        await Db.operations.deleteMany({ deletedAt: { $lt: cutoff } })

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
