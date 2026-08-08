import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { DEFAULT_LOCKOUT_GROUPS, type LockoutGroup, type TaskLockoutPolicy } from '@/lib/lockout'

// GET — return current policy (J4 only)
export async function GET() {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const doc = await Db.notifPolicyConfig.findOne({ type: 'task_lockout_policy' } as never)
    if (!doc) return NextResponse.json({ groups: DEFAULT_LOCKOUT_GROUPS })

    const policy = doc as unknown as TaskLockoutPolicy
    return NextResponse.json({ groups: policy.groups })
}

// PUT — save updated policy (J4 only)
export async function PUT(req: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { groups } = await req.json()
    if (!Array.isArray(groups)) return NextResponse.json({ error: 'groups must be an array' }, { status: 400 })

    const updaterName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    await Db.notifPolicyConfig.replaceOne(
        { type: 'task_lockout_policy' } as never,
        { type: 'task_lockout_policy', groups, updatedById: me.id, updatedByName: updaterName, updatedAt: new Date() } as never,
        { upsert: true }
    )

    return NextResponse.json({ ok: true })
}
