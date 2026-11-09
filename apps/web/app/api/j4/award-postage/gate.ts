import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import { canManagePostage } from '@/lib/military/award-postage'

/**
 * Row 384's gate, shared by every route under /api/j4/award-postage.
 * Deliberately not `hasRoles`: J4-Administration does not get in.
 */
export async function postageGate() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!canManagePostage(me.id)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    const name = me.guild?.nickname || me.globalName || me.username || 'Unknown'
    return { me, actor: { id: me.id, name } }
}
