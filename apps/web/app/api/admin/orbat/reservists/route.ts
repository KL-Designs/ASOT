import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { RESERVIST_CATEGORY_IDS } from '@/lib/orbat/constants'
import { syncOrbatDiscordRoles } from '@/lib/orbat/discord'

const RESERVIST_ROLE_NAME = 'Reservist'

// Lazily finds or creates the seeded "Reservist" OrbatRole — every reservist
// position gets this role's id, giving reservists a real, editable grant
// vehicle (Discord roles / TeamSpeak groups / permissions) via the Roles
// Manager, same as any other position. Unscoped (categories: []) since
// activeReservist/inactiveReservist aren't part of PLATOON_CATEGORY_IDS,
// the taxonomy OrbatRole.categories scopes against.
async function ensureReservistRole(): Promise<ObjectId> {
    const existing = await Db.orbatRoles.findOne({ name: RESERVIST_ROLE_NAME })
    if (existing) return existing._id

    const role: OrbatRole = {
        _id: new ObjectId(),
        name: RESERVIST_ROLE_NAME,
        categories: [],
        tag: null,
        discordRoleIds: [],
        tsGroupIds: [],
        permissions: [],
        parentRoleId: null,
        parentGroupId: null,
        createdAt: new Date(),
        createdBy: 'system',
        createdByName: 'System',
    }
    await Db.orbatRoles.insertOne(role)
    return role._id
}


async function auth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return false
    return client.hasRoles(me, PERMISSIONS.admin.manageOrbatMembers)
}

function parseId(id: string): ObjectId | null {
    try { return new ObjectId(id) } catch { return null }
}


// ── POST /api/admin/orbat/reservists ──────────────────────────────────────────
// Body (move):   { positionId: string, targetCategory: 'activeReservist' | 'inactiveReservist' }
// Body (add new): { userId: string, category: 'activeReservist' | 'inactiveReservist' }

export async function POST(request: NextRequest) {
    if (!await auth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()

    if (!RESERVIST_CATEGORY_IDS.includes(body.targetCategory ?? body.category)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    // Add a new user to the reservist pool
    if (body.userId) {
        const { userId, category } = body
        const existing = await Db.orbatPositions.findOne({ userId })
        if (existing) {
            return NextResponse.json({ error: 'User already on orbat', conflict: existing }, { status: 409 })
        }

        const [last, reservistRoleId] = await Promise.all([
            Db.orbatPositions.find({ category }).sort({ positionOrder: -1 }).limit(1).toArray(),
            ensureReservistRole(),
        ])
        const positionOrder = (last[0]?.positionOrder ?? -1) + 1

        const newPosition: OrbatPosition = {
            _id: new ObjectId(),
            category,
            sectionTitle: '',
            role: category === 'activeReservist' ? 'Active Reservist' : 'Inactive Reservist',
            roleId: reservistRoleId,
            userId,
            sectionOrder: 0,
            positionOrder,
        }
        await Db.orbatPositions.insertOne(newPosition)
        syncOrbatDiscordRoles(userId, 'add', category, '').catch(err =>
            console.error('[orbat/reservists] Discord role add failed:', err),
        )

        return NextResponse.json({ position: JSON.parse(JSON.stringify(newPosition)) })
    }

    // Move an existing reservist between active and inactive
    const { positionId, targetCategory } = body
    const objectId = parseId(positionId)
    if (!objectId) return NextResponse.json({ error: 'Invalid positionId' }, { status: 400 })

    const pos = await Db.orbatPositions.findOne({ _id: objectId })
    if (!pos || !RESERVIST_CATEGORY_IDS.includes(pos.category)) {
        return NextResponse.json({ error: 'Not a reservist position' }, { status: 404 })
    }

    await Db.orbatPositions.updateOne({ _id: objectId }, { $set: { category: targetCategory } })
    if (pos.userId) {
        Promise.allSettled([
            syncOrbatDiscordRoles(pos.userId, 'remove', pos.category, ''),
            syncOrbatDiscordRoles(pos.userId, 'add', targetCategory, ''),
        ]).catch(err => console.error('[orbat/reservists] Discord role swap failed:', err))
    }
    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/orbat/reservists ────────────────────────────────────────
// Body: { positionId: string }
// Removes a user from the reservist pool entirely.

export async function DELETE(request: NextRequest) {
    if (!await auth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { positionId } = await request.json()
    const objectId = parseId(positionId)
    if (!objectId) return NextResponse.json({ error: 'Invalid positionId' }, { status: 400 })

    const pos = await Db.orbatPositions.findOne({ _id: objectId })
    if (!pos || !RESERVIST_CATEGORY_IDS.includes(pos.category)) {
        return NextResponse.json({ error: 'Not a reservist position' }, { status: 404 })
    }

    await Db.orbatPositions.deleteOne({ _id: objectId })
    if (pos.userId) {
        syncOrbatDiscordRoles(pos.userId, 'remove', pos.category, '').catch(err =>
            console.error('[orbat/reservists] Discord role remove failed:', err),
        )
    }
    return NextResponse.json({ success: true })
}
