import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'

export type ChainNodeRef = { id: ObjectId; kind: 'role' | 'group' }

async function getParent(ref: ChainNodeRef): Promise<ChainNodeRef | null> {
    if (ref.kind === 'role') {
        const doc = await Db.orbatRoles.findOne({ _id: ref.id })
        if (!doc) return null
        if (doc.parentRoleId) return { id: doc.parentRoleId, kind: 'role' }
        if (doc.parentGroupId) return { id: doc.parentGroupId, kind: 'group' }
        return null
    }
    const doc = await Db.orbatRoleGroups.findOne({ _id: ref.id })
    if (!doc) return null
    if (doc.parentRoleId) return { id: doc.parentRoleId, kind: 'role' }
    if (doc.parentGroupId) return { id: doc.parentGroupId, kind: 'group' }
    return null
}

// Would setting `child`'s parent to `proposedParent` create a cycle? Walks
// proposedParent's ancestor chain — following parentRoleId/parentGroupId
// upward, hopping between the roles and groups collections as needed —
// looking for child. The depth bound is a corruption guard, not a real
// limit: no real hierarchy should ever be anywhere close to 50 levels deep.
export async function wouldCreateCycle(child: ChainNodeRef, proposedParent: ChainNodeRef): Promise<boolean> {
    let cursor: ChainNodeRef | null = proposedParent
    let depth = 0
    while (cursor && depth < 50) {
        if (cursor.id.equals(child.id) && cursor.kind === child.kind) return true
        cursor = await getParent(cursor)
        depth++
    }
    return false
}
