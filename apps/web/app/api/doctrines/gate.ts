import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { can } from '@/lib/operations/permissions'
import { actorName } from '@/lib/operations/aar-context'

/**
 * Who may do what with Enemy Doctrine. Reading needs `doctrine.view`
 * (Zeus-facing; players never see it). Writing a faction needs
 * `doctrine.edit`; writing a campaign or mission level also opens to whoever
 * may write that operation's orders. Approving is the J2 Lead's.
 */
export async function doctrineStanding(me: User, doctrine?: Doctrine | null) {
    const [view, edit, approve, orders] = await Promise.all([
        can(me, 'doctrine.view'), can(me, 'doctrine.edit'), can(me, 'doctrine.approve'), can(me, 'orders.write'),
    ])
    let owner = false
    if (doctrine?.operationId && ObjectId.isValid(doctrine.operationId)) {
        const op = await Db.operations.findOne({ _id: new ObjectId(doctrine.operationId) }, { projection: { ownedBy: 1 } })
        owner = !!op?.ownedBy && op.ownedBy === me.id
    }
    const canEdit = approve || edit || (doctrine?.level !== 'faction' && (orders || owner))
    return { canView: view || canEdit || approve || owner, canEdit, canApprove: approve }
}

export async function doctrineGate(id: string) {
    if (!ObjectId.isValid(id)) return { error: NextResponse.json({ error: 'Invalid doctrine' }, { status: 400 }) }
    const me = await client.fetchMe().catch(() => null)
    if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    const doctrine = await Db.doctrines.findOne({ _id: new ObjectId(id), deletedAt: null }) as (Doctrine & { _id: ObjectId }) | null
    if (!doctrine) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
    const standing = await doctrineStanding(me, doctrine)
    if (!standing.canView) return { error: NextResponse.json({ error: 'Access Denied' }, { status: 403 }) }
    return { me, doctrine, standing, by: { id: me.id, name: actorName(me) } }
}
