import { NextResponse } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

/** The operation picker's list. Behind `gallery.submit` or `gallery.review` —
 *  the submit form needs it to date a batch, and the J5 review queue needs it
 *  to re-date a submission, and a reviewer does not necessarily hold
 *  `gallery.submit` themselves. Either is enough; there is no reason to
 *  publish the operations table to anyone who wanders past holding neither. */
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !(await hasPermission(me, 'gallery.submit') || await hasPermission(me, 'gallery.review'))) {
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
