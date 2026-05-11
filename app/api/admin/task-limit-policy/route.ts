import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { type EscalationGroup, type TaskLimitPolicy } from '@/lib/lockout'

// Default groups matching the role-based structure
const DEFAULT_GROUPS: Omit<EscalationGroup, 'firstRecipientRoles' | 'secondRecipientRoles'>[] = [
    { label: 'Section Staff',      roles: ['All Staff'],                     firstThreshold: 5,  secondThreshold: 8 },
    { label: 'PHQ / HQ Staff',     roles: ['HQ Staff'],                      firstThreshold: 8,  secondThreshold: 12 },
    { label: 'J1 Members',         roles: ['J1-Staff', 'J1-Recruiting'],      firstThreshold: 5,  secondThreshold: 8 },
    { label: 'J2 Members',         roles: ['J2-Mission Making', 'J2-Team Lead'], firstThreshold: 5, secondThreshold: 8 },
    { label: 'J3 Members',         roles: ['J3-Training', 'J3-Team Lead'],    firstThreshold: 5,  secondThreshold: 8 },
    { label: 'J4 Members',         roles: ['J4-Administration'],              firstThreshold: 10, secondThreshold: 15 },
    { label: 'J5 Members',         roles: ['J5-Media'],                       firstThreshold: 5,  secondThreshold: 8 },
    { label: 'J6 Members',         roles: ['J6-Game Master', 'J6-Department Lead'], firstThreshold: 5, secondThreshold: 8 },
    { label: 'J7 Members',         roles: ['J7 Community Development', 'J7 Staff'], firstThreshold: 5, secondThreshold: 8 },
]

// GET /api/admin/task-limit-policy — load current policy (J4 only)
export async function GET() {
    let me: User
    try { me = await client.fetchMe() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const doc = await Db.notifPolicyConfig.findOne({ type: 'task_limit_policy' } as never)
    if (!doc) {
        // Return defaults with empty recipient roles
        const defaults: EscalationGroup[] = DEFAULT_GROUPS.map(g => ({
            ...g,
            firstRecipientRoles: [],
            secondRecipientRoles: ['J4-Administration', 'HQ Staff'],
        }))
        return NextResponse.json({ groups: defaults })
    }
    const policy = doc as unknown as TaskLimitPolicy
    return NextResponse.json({ groups: policy.groups })
}

// PUT /api/admin/task-limit-policy — save updated policy (J4 only)
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
        { type: 'task_limit_policy' } as never,
        {
            type: 'task_limit_policy',
            groups,
            updatedById: me.id,
            updatedByName: updaterName,
            updatedAt: new Date(),
        } as never,
        { upsert: true }
    )

    return NextResponse.json({ ok: true })
}
