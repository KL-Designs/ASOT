import { NextResponse } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { logAction } from '@/lib/logAction'
import { normaliseHex, resolveMemberAccent } from '@/lib/military/accent'

/**
 * A member's own accent colour.
 *
 * Own-record only, deliberately: there is no `id` parameter and no staff
 * override, so the route cannot be used to recolour anyone else. The gate is
 * simply "are you signed in", because the only record it can reach is yours.
 */

const PRIVATE = { 'Cache-Control': 'no-store, private' }

/** Set it. Body: `{ accent: '#rrggbb' }`. */
export async function PUT(req: Request) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE })

    const body = await req.json().catch(() => null) as { accent?: unknown } | null

    // Validated to `#rrggbb` before it is stored, not on the way out. This
    // value ends up inside a `style` attribute on every surface that paints the
    // member, so an unchecked string here is a stored-XSS shaped problem later.
    const accent = normaliseHex(body?.accent)
    if (!accent) return NextResponse.json({ error: 'Expected a #rrggbb colour' }, { status: 400, headers: PRIVATE })

    await Db.users.updateOne({ _id: me.id }, { $set: { profileAccent: accent } })

    await logAction({
        action: 'milpac.accent_set',
        category: 'member',
        performedBy: me.id,
        performedByName: me.username,
        before: { profileAccent: me.profileAccent ?? null },
        after: { profileAccent: accent },
        entityType: 'user',
        entityId: me.id,
    })

    return NextResponse.json({ accent }, { headers: PRIVATE })
}

/** Clear it, falling back to the Discord accent or the unit red. */
export async function DELETE() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE })

    await Db.users.updateOne({ _id: me.id }, { $unset: { profileAccent: '' } })

    await logAction({
        action: 'milpac.accent_clear',
        category: 'member',
        performedBy: me.id,
        performedByName: me.username,
        before: { profileAccent: me.profileAccent ?? null },
        after: { profileAccent: null },
        entityType: 'user',
        entityId: me.id,
    })

    // What they will actually see now that the pick is gone, so the UI can
    // repaint without a round trip or a guess at the fallback order.
    return NextResponse.json(
        { accent: resolveMemberAccent({ ...me, profileAccent: null }) },
        { headers: PRIVATE },
    )
}
