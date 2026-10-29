import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { can } from '@/lib/operations/permissions'
import { aarOpen, didAttend } from './aar'
import { aarHasContent, bypassesUnlock, consolidatedUnlocked, type ViewerStanding } from './aar-access'

/**
 * Everything the AAR routes need to decide what a viewer may see, read once.
 * Rows 328 to 330 share it so the gate is the same on every route.
 */
export async function loadAarContext(operationId: ObjectId, me: User) {
    const [operation, attendance, mine, feedback, canManageAll] = await Promise.all([
        Db.operations.findOne({ _id: operationId }, { projection: { title: 1, ownedBy: 1, campaignId: 1, missionAarEnabled: 1, date: 1 } }),
        Db.operationAttendance.findOne({ operationId }),
        Db.operationAars.findOne({ operationId, userId: me.id }),
        Db.operationFeedback.findOne({ operationId, userId: me.id }),
        can(me, 'aar.manage'),
    ])
    const roster = attendance?.roster ?? []
    const records = attendance?.records ?? []
    const standing: ViewerStanding = {
        canManageAll,
        isJ4: client.hasRoles(me, PERMISSIONS.departments.j4),
        isMissionMaker: !!operation?.ownedBy && operation.ownedBy === me.id,
    }
    const attended = didAttend(records.find(r => r.userId === me.id), roster.some(s => s.occupantUserId === me.id))
    const bypass = bypassesUnlock(standing)
    const unlocked = consolidatedUnlocked({ hasOwnAar: aarHasContent(mine), attended, hasFeedback: !!feedback, bypass })

    // A campaign's setting wins over the operation's own.
    const campaign = operation?.campaignId
        ? await Db.operationCampaigns.findOne({ _id: new ObjectId(String(operation.campaignId)) }, { projection: { missionAarEnabled: 1 } })
        : null
    const missionAarEnabled = campaign ? !!campaign.missionAarEnabled : !!operation?.missionAarEnabled

    return {
        operation, attendance, roster, records, mine, feedback, standing, attended, bypass, unlocked,
        open: aarOpen(attendance?.stage ?? null),
        missionAarEnabled,
        hasCampaign: !!campaign,
    }
}

export function actorName(me: User): string {
    return me.guild?.displayName || me.guild?.nickname || me.globalName || me.username || me.id
}
