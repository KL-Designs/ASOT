import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'


// ── POST /api/admin/orbat/chain-of-command/reset ───────────────────────────
// Detaches every Role and Group from its chain-of-command parent, resetting
// the hierarchy to a flat structure. Roles and Groups themselves (names,
// permissions, members) are untouched — this only clears parentRoleId /
// parentGroupId. Destructive and irreversible, so J4-only.

export async function POST() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageOrbatRoles)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rolesResult = await Db.orbatRoles.updateMany(
        { $or: [{ parentRoleId: { $ne: null } }, { parentGroupId: { $ne: null } }] },
        { $set: { parentRoleId: null, parentGroupId: null } }
    )
    const groupsResult = await Db.orbatRoleGroups.updateMany(
        { $or: [{ parentRoleId: { $ne: null } }, { parentGroupId: { $ne: null } }] },
        { $set: { parentRoleId: null, parentGroupId: null } }
    )

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    logAction({
        action: 'orbat.reset_chain_of_command',
        category: 'orbat',
        performedBy: me.id,
        performedByName,
        target: 'Reset the ORBAT chain of command to a flat structure',
        details: { rolesCleared: rolesResult.modifiedCount, groupsCleared: groupsResult.modifiedCount },
    })

    return NextResponse.json({
        success: true,
        rolesCleared: rolesResult.modifiedCount,
        groupsCleared: groupsResult.modifiedCount,
    })
}
