import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { actorName } from '@/lib/operations/aar-context'

/**
 * Who is viewing the mod wiki and what they may do.
 *
 * - `canSuggest`: any signed-in dashboard user can send in edits and bug reports.
 * - `canReview`: J7 or J4 department members, or anyone granted `mod-wiki.review`
 *   in the Roles Manager. Reviewers can edit articles directly on the page and
 *   approve/reject suggestions.
 */
export interface ModWikiViewer {
    signedIn: boolean
    canSuggest: boolean
    canReview: boolean
    id?: string
    name?: string
    user?: User
}

export async function resolveModWikiViewer(): Promise<ModWikiViewer> {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return { signedIn: false, canSuggest: false, canReview: false }

    const isJ7 = client.hasRoles(me, PERMISSIONS.departments.j7)
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)
    const hasGrant = await hasPermission(me, 'mod-wiki.review').catch(() => false)
    const canReview = isJ7 || isJ4 || hasGrant

    return {
        signedIn: true,
        canSuggest: true,
        canReview,
        id: me.id,
        name: actorName(me),
        user: me,
    }
}
