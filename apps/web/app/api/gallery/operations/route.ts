import { NextResponse } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

/** The operation picker's list. Behind `gallery.submit` because it is only
 *  ever used by the submit form, and there is no reason to publish the
 *  operations table to anyone who wanders past. */
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !await hasPermission(me, 'gallery.submit')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const operations = await Db.operations
        .find({ deletedAt: { $exists: false } }, { projection: { title: 1, date: 1 } })
        .sort({ date: -1 })
        .limit(300)
        .toArray()

    return NextResponse.json({
        operations: operations.map(o => ({
            id: o._id.toString(),
            title: o.title ?? 'Untitled',
            date: o.date ? new Date(o.date).toISOString() : null,
        })),
    })
}
