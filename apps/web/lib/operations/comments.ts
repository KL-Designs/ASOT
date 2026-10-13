import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'
import { unitColoursFor } from '@/lib/orbat/unit-colour'

/**
 * Who is asking, and what they may do in an operation's comment thread.
 *
 * Every member can read and write. "Member" is the same test the dashboard
 * uses — a department, a department role or an ORBAT position — so a signed-in
 * Discord account with no place in the unit cannot post under the orders.
 * Moderating (removing somebody else's comment) is for the people who can
 * already edit operations.
 *
 * Null means "not allowed in at all"; the routes turn that into a 401.
 */
export async function commentViewer() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!(await hasDashboardAccess(me).catch(() => false))) return null
    return {
        me,
        name: me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id,
        canModerate: client.hasRoles(me, PERMISSIONS.operations.write),
    }
}

export type OperationCommentView = {
    _id: string
    parentId: string | null
    authorId: string
    authorName: string
    /** The author's callsign colour; null when they have none. */
    authorColor: string | null
    content: string
    notifiedMissionMaker: boolean
    createdAt: string
    isEdited: boolean
    isDeleted: boolean
}

/**
 * The thread as the page receives it.
 *
 * Live comments, plus any deleted comment that still has a reply beneath it —
 * as a shell with its words and author stripped — so removing one comment does
 * not cut the replies under it loose. The ticket thread makes the same choice
 * for the same reason; see `app/api/tickets/[id]/route.ts`.
 */
export async function readOperationComments(operationId: ObjectId): Promise<OperationCommentView[]> {
    const all = await Db.operationComments.find({ operationId }).sort({ createdAt: 1 }).toArray()

    const kept = new Set(all.filter(c => !c.isDeleted).map(c => String(c._id)))
    for (let grew = true; grew;) {
        grew = false
        for (const c of all) {
            if (c.parentId && kept.has(String(c._id)) && !kept.has(String(c.parentId))) {
                kept.add(String(c.parentId))
                grew = true
            }
        }
    }

    const visible = all.filter(c => kept.has(String(c._id)))
    const colours = await unitColoursFor(visible.filter(c => !c.isDeleted).map(c => c.authorId))

    return visible.map(c => toView(c, colours.get(c.authorId) ?? null))
}

export function toView(c: OperationComment, authorColor: string | null): OperationCommentView {
    return {
        _id: String(c._id),
        parentId: c.parentId ? String(c.parentId) : null,
        authorId: c.isDeleted ? '' : c.authorId,
        authorName: c.isDeleted ? '' : c.authorName,
        authorColor: c.isDeleted ? null : authorColor,
        content: c.isDeleted ? '' : c.content,
        notifiedMissionMaker: !c.isDeleted && !!c.notifiedMissionMaker,
        createdAt: c.createdAt.toISOString(),
        isEdited: c.isEdited,
        isDeleted: c.isDeleted,
    }
}
