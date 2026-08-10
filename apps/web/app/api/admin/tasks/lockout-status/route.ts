import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { DEFAULT_LOCKOUT_GROUPS, type LockoutGroup } from '@/lib/lockout'
import { hasPermission } from '@/lib/orbat/hasPermission'

export async function GET() {
    let me: User
    try { me = await client.fetchMe() }
    catch { return NextResponse.json({ locked: false }) }

    if (!(await hasPermission(me, 'pages.member'))) {
        return NextResponse.json({ locked: false })
    }

    const myRoleNames = client.roles
        .filter(r => (me.guild?.roles ?? []).includes(r.id))
        .map(r => r.name)

    const policyDoc = await Db.notifPolicyConfig.findOne({ type: 'task_lockout_policy' } as never)
    const lockoutGroups: LockoutGroup[] =
        (policyDoc as unknown as { groups?: LockoutGroup[] })?.groups ?? DEFAULT_LOCKOUT_GROUPS

    const lockoutEnabled = lockoutGroups.some(group =>
        group.enabled && group.roles.some(r => myRoleNames.includes(r))
    )

    if (!lockoutEnabled) {
        return NextResponse.json({ locked: false })
    }

    const overdueCount = await Db.tasks.countDocuments({
        $or: [
            { assignedTo: me.id },
            ...(myRoleNames.length > 0 ? [{ assignedRole: { $in: myRoleNames } }] : []),
        ],
        dueDate: { $lt: new Date() },
        completedAt: { $exists: false },
        status: { $nin: ['in_progress', 'completed'] },
        'extensionRequest.status': { $ne: 'pending' },
        'reassignmentRequest.status': { $ne: 'pending' },
        type: { $ne: 'extension_review' },
    })

    return NextResponse.json({ locked: overdueCount > 0 })
}
