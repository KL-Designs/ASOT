import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

/**
 * Who keeps the Mod Database: J2 (mission making, who depend on the mods) and
 * J7 (community development, who test them). Everybody else reads it.
 */
export function canEditMods(me: User): boolean {
    return client.hasRoles(me, [...PERMISSIONS.departments.j2, ...PERMISSIONS.departments.j7])
}

export function toModView(m: ModEntry) {
    return {
        id: String(m._id),
        name: m.name,
        workshopUrl: m.workshopUrl ?? null,
        status: m.status,
        notes: m.notes ?? '',
        testedByName: m.testedByName ?? '',
        testedOn: m.testedOn ?? '',
        sourceTicketId: m.sourceTicketId ?? null,
        updatedAt: new Date(m.updatedAt).toISOString(),
        updatedByName: m.updatedByName ?? '',
    }
}

export type ModView = ReturnType<typeof toModView>
