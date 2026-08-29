import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { can } from '@/lib/operations/permissions'

/**
 * The roles the attendance board's "add position" picker can offer.
 *
 * A deliberately narrow view of `orbat_roles`: id, name, tag and category
 * scope, and nothing else. The Roles Manager's own endpoint returns whole role
 * documents — Discord role ids, TeamSpeak group ids, granted permission keys —
 * and is gated on `admin.manageOrbat` for that reason. Widening that gate to
 * everyone who can manage attendance would hand out the unit's whole grant
 * configuration to make a dropdown work.
 *
 * `categories` is included rather than filtered server-side because the picker
 * needs it per section and there are five categories on a board; sending it
 * once beats five requests. It is not a secret — it is the same scoping the
 * ORBAT shows anyone who can see the ORBAT.
 *
 * This does not make the client the authority. `addSlot` re-checks the chosen
 * role's scope against the destination category before writing.
 */
export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Same three arms as the rest of the board's staff surface — see
    // PERMISSIONS.attendance.manage for why the dynamic check alone is not enough.
    const canManage = await can(me, 'attendance.roles')
    if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const roles = await Db.orbatRoles
        .find({}, { projection: { name: 1, tag: 1, categories: 1 } })
        .sort({ name: 1 })
        .toArray()

    return NextResponse.json({
        roles: roles.map(r => ({
            _id: String(r._id),
            name: r.name,
            tag: r.tag ?? null,
            categories: r.categories ?? [],
        })),
    })
}
