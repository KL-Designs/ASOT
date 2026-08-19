import client from '@/lib/discord'
import { getOrbatEntryByUserId } from '@/lib/orbat'
import { rankNameFromAbbr } from '@/lib/military/ranks'
import type { ProfileScreenProps } from './ProfileScreen'

/**
 * Everything `ProfileScreen` needs, resolved from the signed-in user.
 *
 * Shared by `/dashboard/profile` and `/me`, which render the same screen for
 * different audiences — keeping the derivation here means the two entry points
 * cannot drift on what a member's own name or rank is.
 */
export async function resolveProfile(me: User): Promise<ProfileScreenProps> {
    const orbatEntry = await getOrbatEntryByUserId(me.id)

    const strippedNickname = me.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
    const fullDisplay = strippedNickname || me.globalName || me.username
    const nameParts = fullDisplay.split(' ')
    const parsedDisplayName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : fullDisplay

    const rankAbbr = me.milpac?.currentRank || null

    return {
        me,
        orbatRole: orbatEntry?.role || null,
        displayName: me.name || parsedDisplayName,
        rank: rankAbbr ? rankNameFromAbbr(rankAbbr) : null,
        rankAbbr,
        callsign: me.milpac?.callsign || null,
        isHQ: client.hasRoles(me, ['HQ Staff']),
    }
}
