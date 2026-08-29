import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'
import { can } from '@/lib/operations/permissions'

export async function GET(request: NextRequest) {
    const token = request.headers.get('x-collab-token')
    if (!token) return NextResponse.json({ authorized: false })
    try {
        const me = await client.fetchMe(token)
        if (!me) return NextResponse.json({ authorized: false })

        // att-* and sop-* → any ASOT member; ws-* → J2 members/leads;
        // cfb-* → J3 trainers; all others → staff collab role
        //
        // att-{operationId} is the live attendance board's signal channel. It
        // is deliberately the widest gate here: every member watches the board
        // fill up on operation night, and the doc carries only a revision
        // counter and presence — no operation content, and no authority. All
        // actual writes go through the roster route, which checks permissions
        // per action. Connecting grants nothing but the ability to be told the
        // board changed.
        const doc = request.nextUrl.searchParams.get('doc') ?? ''

        /*
         * An operation's orders — a bare id, the fall-through below.
         *
         * Two capabilities, not one. `orders.view` opens the socket, because
         * the editor reads the document *through* it and a reviewer who cannot
         * connect cannot review anything. `orders.write` decides whether the
         * connection may push updates, which the server applies as Hocuspocus's
         * own `connection.readOnly`.
         *
         * That distinction has to be made here rather than in the client. The
         * editor can hide its toolbar from somebody without write access, but
         * hiding a control is not a permission check — the socket is the actual
         * boundary, and until now it had only one side to it.
         *
         * `auth.collab` stays as the legacy arm: it is what this branch has
         * always checked, and a holder of it keeps full write access.
         */
        /*
         * `{operationId}-map` is its own document, not part of the orders — the
         * layers and annotations live in a separate Y.Doc. So it gets its own
         * pair of capabilities, and this branch has to come first: without it
         * the map falls through to the orders branch below and drawing on it
         * would be governed by `orders.write`, which is the wrong permission
         * and would make `map.edit` control nothing.
         */
        const isMapDoc = doc.endsWith('-map')
        const isOperationDoc = !!doc && !isMapDoc
            && !doc.startsWith('sop-') && !doc.startsWith('att-')
            && !doc.startsWith('ws-') && !doc.startsWith('cfb-')

        const authorized = doc.startsWith('sop-') || doc.startsWith('att-')
            ? await hasDashboardAccess(me)
            : doc.startsWith('ws-')
                ? client.hasRoles(me, PERMISSIONS.departments.j2) || (await hasPermission(me, 'departmentLeads.j2')) || client.hasRoles(me, PERMISSIONS.pages.admin)
                : doc.startsWith('cfb-')
                    ? client.hasRoles(me, PERMISSIONS.training.manage)
                    : isMapDoc
                        ? (await can(me, 'map.view')) || (await hasPermission(me, 'auth.collab'))
                        : (await can(me, 'orders.view')) || (await hasPermission(me, 'auth.collab'))

        const writeCap = isMapDoc ? 'map.edit' as const : 'orders.write' as const
        const readOnly = (isMapDoc || isOperationDoc) && authorized
            ? !((await can(me, writeCap)) || (await hasPermission(me, 'auth.collab')))
            : false

        const userName = me.guild?.displayName || me.globalName || me.username || 'Unknown'
        const userAvatar = me.guild?.avatarURL || me.avatarURL || null
        return NextResponse.json({ authorized, readOnly, userId: me._id, userName, userAvatar })
    } catch {
        return NextResponse.json({ authorized: false })
    }
}
