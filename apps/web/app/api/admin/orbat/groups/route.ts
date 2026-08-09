import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'


// ── GET /api/admin/orbat/groups ────────────────────────────────────────────
// Same read gate as the roles catalog.

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbat)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const groups = await Db.orbatRoleGroups.find({}).sort({ name: 1 }).toArray()
    return NextResponse.json({ groups: JSON.parse(JSON.stringify(groups)) })
}


// ── POST /api/admin/orbat/groups ───────────────────────────────────────────
// Body: { name, memberRoleIds }

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatRoles)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const name: string = (body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const existing = await Db.orbatRoleGroups.findOne({ name })
    if (existing) return NextResponse.json({ error: 'A Group with that name already exists' }, { status: 409 })

    const memberRoleIds: ObjectId[] = Array.isArray(body.memberRoleIds)
        ? body.memberRoleIds
            .filter((id: unknown) => typeof id === 'string')
            .map((id: string) => { try { return new ObjectId(id) } catch { return null } })
            .filter((id: ObjectId | null): id is ObjectId => id !== null)
        : []

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const newGroup: OrbatRoleGroup = {
        _id: new ObjectId(),
        name,
        memberRoleIds,
        parentRoleId: null,
        parentGroupId: null,
        createdAt: new Date(),
        createdBy: me.id,
        createdByName: performedByName,
    }
    await Db.orbatRoleGroups.insertOne(newGroup)

    return NextResponse.json({ group: JSON.parse(JSON.stringify(newGroup)) })
}
