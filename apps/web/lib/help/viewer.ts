import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'
import { actorName } from '@/lib/operations/aar-context'
import type { HelpReaderScope } from './search'

const DEPTS = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7'] as const

/**
 * Who is reading the help wiki, and what they may do there.
 *
 * - `level` decides which articles they see: anyone signed out reads the
 *   public ones, members (dashboard access or the ASOT Member role) the member
 *   ones too, staff everything.
 * - `canSuggest`: any signed-in reader may send in edits, bugs and questions.
 * - `canAsk`: the AI's own gate, `PERMISSIONS.ai.use`, so the Ask tab follows
 *   whoever J4 lets use AI. Budgets and the master switch apply on top.
 * - `departments`: guides limited to departments (J1's guides) show only to
 *   their members; `allDepartments` (reviewers) see every one.
 * - `canReview`: J7, or anyone granted `help.review` in the Roles Manager.
 */
export interface HelpViewer extends HelpReaderScope {
    signedIn: boolean
    canSuggest: boolean
    canAsk: boolean
    canReview: boolean
    id?: string
    name?: string
    user?: User
}

export async function resolveHelpViewer(): Promise<HelpViewer> {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return { signedIn: false, level: 'public', departments: [], allDepartments: false, canSuggest: false, canAsk: false, canReview: false }

    const isStaff = client.hasRoles(me, PERMISSIONS.pages.admin)
    const isMember = isStaff || client.hasRoles(me, PERMISSIONS.ai.use) || await hasDashboardAccess(me).catch(() => false)
    const canReview = client.hasRoles(me, PERMISSIONS.help.review) || await hasPermission(me, 'help.review').catch(() => false)

    // Department membership as the site records it, plus the department
    // Discord roles the department pages themselves gate on.
    const departments = [...new Set([
        ...(me.departments ?? []).map(d => String(d).toLowerCase()),
        ...DEPTS.filter(d => client.hasRoles(me, PERMISSIONS.departments[d])),
    ])]

    return {
        signedIn: true,
        departments,
        // J7 keeps every guide, so they can see what they're editing; J4
        // administration passes hasRoles() for everything, so lands here too.
        allDepartments: canReview,
        level: isStaff || canReview ? 'staff' : isMember ? 'member' : 'public',
        canSuggest: true,
        canAsk: client.hasRoles(me, PERMISSIONS.ai.use),
        canReview,
        id: me.id,
        name: actorName(me),
        user: me,
    }
}
