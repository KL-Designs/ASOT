import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'

const RESERVIST_ROLE_NAME = 'Reservist'

/**
 * Atomically finds or creates the seeded "Reservist" OrbatRole and returns
 * its _id. Every reservist position should have its roleId set to this, so
 * reservists have a real, editable grant vehicle (Discord roles / TeamSpeak
 * groups / permissions) via the Roles Manager, same as any other position.
 * Unscoped (categories: []) since activeReservist/inactiveReservist aren't
 * part of PLATOON_CATEGORY_IDS, the taxonomy OrbatRole.categories scopes
 * against.
 *
 * Uses an atomic upsert (not findOne-then-insertOne) so concurrent callers
 * can never create two different "Reservist" role documents.
 */
export async function ensureReservistRole(): Promise<ObjectId> {
    const result = await Db.orbatRoles.findOneAndUpdate(
        { name: RESERVIST_ROLE_NAME },
        {
            $setOnInsert: {
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
            },
        },
        { upsert: true, returnDocument: 'after' },
    )
    return result!._id
}
