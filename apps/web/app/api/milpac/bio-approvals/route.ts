import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotification } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'

/**
 * `/api/milpac/bio-approvals` — deciding a pending biography change.
 *
 * A member's biography edit is held as `bioPending` on their user record until
 * somebody in their chain of command approves it (see
 * lib/military/bio-approval.ts for who that is; `POST /api/me` is where the
 * request is made and the approvers are resolved and stored).
 *
 * GET `?member=<discordId>` — the pending change for that member, for a viewer
 * entitled to decide it; `{ pending: null }` for anybody else, and when there
 * is none. One shape for "nothing to do" either way, so the milpac page can
 * mount the approval panel for every visitor without it revealing whether a
 * change exists.
 *
 * POST `{ memberId, action: 'approve' | 'reject', reason? }` — decide it.
 */

async function viewer() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    return { me, isJ4: !!client.hasRoles(me, PERMISSIONS.departments.j4) }
}

/** May this viewer decide this member's pending biography? Never their own. */
function mayDecide(v: NonNullable<Awaited<ReturnType<typeof viewer>>>, memberId: string, pending: NonNullable<User['bioPending']>) {
    if (v.me.id === memberId) return false
    return v.isJ4 || pending.approverIds.includes(v.me.id)
}

export async function GET(req: NextRequest) {
    const v = await viewer()
    if (!v) return NextResponse.json({ pending: null })

    const memberId = new URL(req.url).searchParams.get('member')
    if (!memberId) return NextResponse.json({ error: 'member is required' }, { status: 400 })

    const member = await Db.users.findOne({ id: memberId }, { projection: { bioPending: 1, 'bio.content': 1 } })
    if (!member?.bioPending || !mayDecide(v, memberId, member.bioPending)) return NextResponse.json({ pending: null })

    return NextResponse.json({
        pending: {
            content: member.bioPending.content,
            submittedAt: member.bioPending.submittedAt,
            current: member.bio?.content ?? '',
        },
    })
}

export async function POST(req: NextRequest) {
    const v = await viewer()
    if (!v) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const memberId = typeof body.memberId === 'string' ? body.memberId : ''
    const action = body.action
    if (!memberId || (action !== 'approve' && action !== 'reject')) {
        return NextResponse.json({ error: 'memberId and an action of approve or reject are required' }, { status: 400 })
    }

    const member = await Db.users.findOne(
        { id: memberId },
        { projection: { bioPending: 1, username: 1, name: 1, globalName: 1, 'guild.nickname': 1, 'guild.displayName': 1 } },
    )
    if (!member?.bioPending) return NextResponse.json({ error: 'There is no pending biography change for this member.' }, { status: 404 })
    if (!mayDecide(v, memberId, member.bioPending)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
    if (action === 'reject' && !reason) {
        return NextResponse.json({ error: 'Say why it is being sent back, so the member knows what to change.' }, { status: 400 })
    }

    const deciderName = v.me.guild?.nickname || v.me.guild?.displayName || v.me.globalName || v.me.username || v.me.id
    const memberName = member.guild?.nickname || member.guild?.displayName || member.name || member.globalName || member.username || memberId
    const pending = member.bioPending

    // Matched on the pending text as well as the member, so two approvers
    // acting at once — or an approval racing the member's own re-edit — cannot
    // publish something other than what this approver actually read.
    const result = await Db.users.updateOne(
        { id: memberId, 'bioPending.content': pending.content },
        action === 'approve'
            ? { $set: { 'bio.content': pending.content }, $unset: { bioPending: '', bioRejected: '' } }
            : { $set: { bioRejected: { reason, byName: deciderName, at: new Date() } }, $unset: { bioPending: '' } },
    )
    if (result.modifiedCount === 0) {
        return NextResponse.json({ error: 'That change was already decided, or the member has edited it since. Reload and look again.' }, { status: 409 })
    }

    await createNotification({
        userId: memberId,
        type: 'system',
        title: action === 'approve' ? 'Your biography was approved' : 'Your biography change was sent back',
        body: action === 'approve'
            ? `${deciderName} approved your new biography. It is now live on your milpac.`
            : `${deciderName} sent your biography change back: ${reason}`,
        actionUrl: '/me',
    }).catch(() => {})

    logAction({
        action: action === 'approve' ? 'milpac.bio.approve' : 'milpac.bio.reject',
        category: 'member',
        performedBy: v.me.id,
        performedByName: deciderName,
        target: memberName,
        details: { memberId, ...(reason ? { reason } : {}) },
    })

    return NextResponse.json({ success: true })
}
