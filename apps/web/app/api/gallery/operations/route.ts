import { NextResponse } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

/** The operation picker's list. Behind `gallery.submit`, `gallery.review` or
 *  `gallery.manage` — the submit form needs it to date a batch, the J5 review
 *  queue needs it to re-date a submission, and the J5 Media tab needs it to
 *  give the ~1,157 undated files an operation. Any one is enough; there is no
 *  reason to publish the operations table to anyone holding none of them.
 *
 *  `gallery.manage` is listed explicitly because `hasPermission` is flat and
 *  additive — no key implies another. A role holding `gallery.manage` alone
 *  ("archive curator, not a submitter or reviewer") passes the Media tab's
 *  own gate, opens it to a working rail, grid and inspector, and then got a
 *  403 here that the tab swallowed: the Operation select offered only
 *  "Unknown", so assigning an operation — the one job that tab exists for —
 *  was impossible with no error anywhere. This grants nothing new; the same
 *  titles and dates are already readable through admin/library. */
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    const allowed = me && (
        await hasPermission(me, 'gallery.submit')
        || await hasPermission(me, 'gallery.review')
        || await hasPermission(me, 'gallery.manage')
    )
    if (!allowed) {
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
