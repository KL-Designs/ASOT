import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { RESERVIST_CATEGORY_IDS } from '@/lib/orbat/constants'
import { logAction } from '@/lib/logs'
import { syncOrbatDiscordRoles } from '@/lib/orbat/discord'
import { swapRoleDiscordRoles, swapRoleTsGroups } from '@/lib/orbat/role-sync'
import { ensureReservistRole } from '@/lib/orbat/reservist-role'
import { applyOrbatMove } from '@/lib/orbat/move'


async function authStructure() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatStructure)) return null
    return me
}

async function authMembers() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatMembers)) return null
    return me
}

function parseId(positionId: string): ObjectId | null {
    try { return new ObjectId(positionId) } catch { return null }
}


// ── PATCH /api/admin/orbat/[positionId] ───────────────────────────────────────
// Body: { userId: string | null, skipAutoMove?: boolean }  — assign/unassign user
//       { role: string }                                   — rename role
//       { positionOrder: number }                          — reorder within section

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ positionId: string }> }
) {
    const { positionId } = await params
    const objectId = parseId(positionId)
    if (!objectId) return NextResponse.json({ error: 'Invalid positionId' }, { status: 400 })

    const position = await Db.orbatPositions.findOne({ _id: objectId })
    if (!position) return NextResponse.json({ error: 'Position not found' }, { status: 404 })

    const body = await request.json()

    // User assignment
    if ('userId' in body) {
        const me = await authMembers()
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { userId, skipAutoMove } = body
        const isUnassign = !userId
        const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

        if (!isUnassign) {
            // Conflict check — prevent dual assignment
            const existing = await Db.orbatPositions.findOne({ userId, _id: { $ne: objectId } })
            if (existing) {
                if (RESERVIST_CATEGORY_IDS.includes(existing.category)) {
                    // Moving a reservist straight into an active position is a normal
                    // transition, not a dual-assignment conflict — applyOrbatMove()
                    // already handles vacating the reservist slot and swapping both
                    // section-level and Role-level Discord/TeamSpeak grants for
                    // exactly this case (it's the same path ticket-approved moves use).
                    await applyOrbatMove({ fromPos: existing, toPos: position, toIsReservist: false, targetUserId: userId })

                    const movedUser = await Db.users.findOne({ $or: [{ id: userId }, { _id: userId }] })
                    const movedName = movedUser
                        ? (movedUser.guild?.nickname || movedUser.guild?.displayName || movedUser.globalName || movedUser.username || userId)
                        : userId
                    logAction({
                        action: 'orbat.assign',
                        category: 'orbat',
                        performedBy: me.id,
                        performedByName,
                        target: `${movedName} assigned to ${position.sectionTitle} (${position.role})`,
                        details: { positionId, category: position.category, sectionTitle: position.sectionTitle, role: position.role },
                    })
                    return NextResponse.json({ success: true, reservistPosition: null, vacatedPositionId: existing._id.toString() })
                }
                return NextResponse.json({ error: 'User already assigned', conflict: existing }, { status: 409 })
            }
        }

        // Auto-move evicted user to activeReservist (unless suppressed or this IS a reservist position)
        let reservistPosition: OrbatPosition | null = null
        if (isUnassign && position.userId && !skipAutoMove && !RESERVIST_CATEGORY_IDS.includes(position.category)) {
            const [last, reservistRoleId] = await Promise.all([
                Db.orbatPositions.find({ category: 'activeReservist' }).sort({ positionOrder: -1 }).limit(1).toArray(),
                ensureReservistRole(),
            ])
            const positionOrder = (last[0]?.positionOrder ?? -1) + 1

            reservistPosition = {
                _id: new ObjectId(),
                category: 'activeReservist',
                sectionTitle: '',
                role: 'Active Reservist',
                roleId: reservistRoleId,
                userId: position.userId,
                sectionOrder: 0,
                positionOrder,
            }
        }

        await Db.orbatPositions.updateOne({ _id: objectId }, { $set: { userId: userId ?? null } })
        if (reservistPosition) await Db.orbatPositions.insertOne(reservistPosition)

        // Sync Discord/TeamSpeak roles for section + platoon, and Role-level grants
        if (isUnassign && position.userId) {
            const evictedId = position.userId
            const toRoleId = reservistPosition ? reservistPosition.roleId : undefined
            Promise.allSettled([
                syncOrbatDiscordRoles(evictedId, 'remove', position.category, position.sectionTitle),
                reservistPosition ? syncOrbatDiscordRoles(evictedId, 'add', 'activeReservist', '') : Promise.resolve(),
                swapRoleDiscordRoles(evictedId, position.roleId, toRoleId),
                swapRoleTsGroups(evictedId, position.roleId, toRoleId),
            ]).catch(err => console.error('[orbat] Discord/TeamSpeak role sync failed:', err))
        } else if (!isUnassign && userId) {
            Promise.allSettled([
                syncOrbatDiscordRoles(userId, 'add', position.category, position.sectionTitle),
                swapRoleDiscordRoles(userId, null, position.roleId),
                swapRoleTsGroups(userId, null, position.roleId),
            ]).catch(err => console.error('[orbat] Discord/TeamSpeak role sync failed:', err))
        }

        // Resolve display name of the member being assigned/unassigned
        const targetUserId = isUnassign ? position.userId : userId
        const targetUser = targetUserId ? await Db.users.findOne({ $or: [{ id: targetUserId }, { _id: targetUserId }] }) : null
        const targetName = targetUser
            ? (targetUser.guild?.nickname || targetUser.guild?.displayName || targetUser.globalName || targetUser.username || targetUserId)
            : targetUserId

        if (isUnassign) {
            logAction({
                action: 'orbat.unassign',
                category: 'orbat',
                performedBy: me.id,
                performedByName,
                target: `${targetName} removed from ${position.sectionTitle} (${position.role})`,
                details: { positionId, category: position.category, sectionTitle: position.sectionTitle, role: position.role },
            })
        } else {
            logAction({
                action: 'orbat.assign',
                category: 'orbat',
                performedBy: me.id,
                performedByName,
                target: `${targetName} assigned to ${position.sectionTitle} (${position.role})`,
                details: { positionId, category: position.category, sectionTitle: position.sectionTitle, role: position.role },
            })
        }

        return NextResponse.json({
            success: true,
            reservistPosition: reservistPosition ? JSON.parse(JSON.stringify(reservistPosition)) : null,
        })
    }

    // Field updates (role select, reorder) — structure permission required
    const me = await authStructure()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    const updates: Partial<OrbatPosition> = {}
    let newRoleDoc: OrbatRole | null = null

    if ('roleId' in body) {
        if (body.roleId === null) {
            updates.roleId = null
            updates.role = ''
        } else {
            let roleObjectId: ObjectId
            try { roleObjectId = new ObjectId(body.roleId) } catch { return NextResponse.json({ error: 'Invalid roleId' }, { status: 400 }) }
            newRoleDoc = await Db.orbatRoles.findOne({ _id: roleObjectId })
            if (!newRoleDoc) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
            updates.roleId = roleObjectId
            updates.role = newRoleDoc.name
        }
    }
    if (typeof body.positionOrder === 'number') updates.positionOrder = body.positionOrder
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    await Db.orbatPositions.updateOne({ _id: objectId }, { $set: updates })

    // If the position is currently occupied and its Role changed, swap the
    // occupant's Role-level Discord/TeamSpeak grants (stacks on top of the
    // unaffected section/category-level sync — see lib/orbat/discord.ts).
    if ('roleId' in body && position.userId) {
        Promise.allSettled([
            swapRoleDiscordRoles(position.userId, position.roleId, updates.roleId),
            swapRoleTsGroups(position.userId, position.roleId, updates.roleId),
        ]).catch(err => console.error('[orbat] Role-level Discord/TeamSpeak sync failed:', err))
    }

    if ('roleId' in body) {
        logAction({
            action: 'orbat.change_role',
            category: 'orbat',
            performedBy: me.id,
            performedByName,
            target: `${position.sectionTitle}: "${position.role}" → "${updates.role}"`,
            details: { positionId, category: position.category, sectionTitle: position.sectionTitle, oldRole: position.role, newRole: updates.role },
        })
    }

    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/orbat/[positionId] ──────────────────────────────────────

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ positionId: string }> }
) {
    const me = await authStructure()
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { positionId } = await params
    const objectId = parseId(positionId)
    if (!objectId) return NextResponse.json({ error: 'Invalid positionId' }, { status: 400 })

    const position = await Db.orbatPositions.findOne({ _id: objectId })
    await Db.orbatPositions.deleteOne({ _id: objectId })

    if (position) {
        const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
        logAction({
            action: 'orbat.delete_position',
            category: 'orbat',
            performedBy: me.id,
            performedByName,
            target: `Deleted position "${position.role}" in ${position.sectionTitle}`,
            details: { positionId, category: position.category, sectionTitle: position.sectionTitle, role: position.role },
        })
    }

    return NextResponse.json({ success: true })
}
