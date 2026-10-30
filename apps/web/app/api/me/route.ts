import { NextRequest, NextResponse } from "next/server"
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'
import { createNotification } from '@/lib/notifications'
import { BIO_MAX_LENGTH, bioApproversFor } from '@/lib/military/bio-approval'


/*
   Never cached, and never rendered ahead of time.

   This is one member's own record, selected by their `token` cookie, and it was
   going out with no cache headers at all — which leaves the browser free to
   reuse it on its own heuristics. That is how a rank or callsign updated in
   Discord could stay missing from the navbar until something else forced a
   fresh request, and it is a privacy problem well before it is a staleness one:
   a response keyed on a cookie must not be storable.
*/
export const dynamic = 'force-dynamic'

const PRIVATE = { 'Cache-Control': 'no-store, private' }


export async function GET(request: NextRequest) {

    try {
        const me = await client.fetchMe()
        const isStaff = client.hasRoles(me, PERMISSIONS.pages.admin)
        const isMember = await hasDashboardAccess(me)
        return NextResponse.json({ ...me, isStaff, isMember }, { status: 200, headers: PRIVATE })
    }

    catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401, headers: PRIVATE })
    }
}


export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()

    if ('timezone' in body) {
        if (typeof body.timezone !== 'string' || !Intl.supportedValuesOf('timeZone').includes(body.timezone)) {
            return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
        }
        await Db.users.updateOne({ _id: me._id }, { $set: { timezone: body.timezone } }, { upsert: true })
        return NextResponse.json({ success: true }, { status: 200 })
    }

    /*
       Biography. The only other thing this endpoint writes.

       This used to copy every key of the body under `bio.` — any key, any
       value — so the request decided the shape of the member's own record. It
       takes `content`, a string, and nothing else now.

       And it no longer publishes. A biography is public, so an edit is held as
       `bioPending` until somebody up the member's chain of command approves it
       (lib/military/bio-approval.ts decides who; /api/milpac/bio-approvals is
       where they do it). What is live stays live until then.
    */
    if (typeof body.content !== 'string') {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }
    const content = body.content.trim().slice(0, BIO_MAX_LENGTH)
    const live = (me.bio?.content ?? '').trim()

    // Back to what is already live: there is nothing to approve, so any
    // request still waiting is withdrawn.
    if (content === live) {
        await Db.users.updateOne({ _id: me._id }, { $unset: { bioPending: '', bioRejected: '' } })
        return NextResponse.json({ success: true, pending: false }, { status: 200 })
    }

    const positions = await Db.orbatPositions
        .find({}, { projection: { userId: 1, category: 1, sectionTitle: 1 } })
        .toArray()
    const { level, approverIds } = bioApproversFor(me.id, positions)

    const existing = await Db.users.findOne({ _id: me._id }, { projection: { bioPending: 1 } })
    const alreadyWaiting = !!existing?.bioPending

    await Db.users.updateOne(
        { _id: me._id },
        { $set: { bioPending: { content, submittedAt: new Date(), level, approverIds } }, $unset: { bioRejected: '' } },
    )

    // One notification per request, not per keystroke-then-save: a member
    // tidying their wording while it waits should not page their PHQ again.
    if (!alreadyWaiting) {
        const memberName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
        const recipients = level === 'j4'
            ? (await Db.users
                .find({ 'guild.roles': { $in: PERMISSIONS.departments.j4 }, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } })
                .project<{ id: string }>({ id: 1 })
                .toArray()).map(u => u.id).filter(id => id !== me.id)
            : approverIds

        await Promise.all(recipients.map(userId => createNotification({
            userId,
            type: 'system',
            title: `Biography change to approve: ${memberName}`,
            body: `${memberName} has changed their MILPAC biography. It will not go live until it is approved.`,
            actionUrl: `/milpacs/${me.username}`,
        }).catch(() => {})))
    }

    return NextResponse.json({ success: true, pending: true, level }, { status: 200 })
}