import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'

/**
 * Who may do what with objective suggestions.
 *
 *  - **Read**: J2, and staff (the All Staff dashboard mirrors the list).
 *  - **Edit**: anybody in J2 — mission makers tidy the pool as they use it.
 *  - **Confirm** a ticket into the pool, or remove an entry: J2 leads.
 */
export async function objectiveAccess(me: User) {
    const isJ4 = client.hasRoles(me, PERMISSIONS.departments.j4)
    const isJ2 = client.hasRoles(me, PERMISSIONS.departments.j2)
    return {
        canRead: isJ4 || isJ2 || client.hasRoles(me, PERMISSIONS.pages.admin),
        canEdit: isJ4 || isJ2,
        canConfirm: isJ4 || await hasPermission(me, 'departmentLeads.j2'),
    }
}

export function toObjectiveView(o: ObjectiveSuggestion) {
    return {
        id: String(o._id),
        name: o.name,
        overview: o.overview,
        intel: o.intel ?? '',
        linkedIntel: o.linkedIntel ?? '',
        comments: o.comments ?? '',
        sourceTicketId: o.sourceTicketId ?? null,
        suggestedByName: o.suggestedByName ?? null,
        addedByName: o.addedByName,
        updatedAt: new Date(o.updatedAt).toISOString(),
        updatedByName: o.updatedByName,
    }
}

export type ObjectiveView = ReturnType<typeof toObjectiveView>
