import type { ObjectId } from 'mongodb'


export { }

declare global {

    // One managed quick link on a department's (J1-J7) landing rail. Links are
    // plain data, managed from the department's Settings view. nameOverride is
    // display-only: it is never written by a URL change and never overwrites
    // fetchedTitle, so clearing it restores the site's own title.
    interface DepartmentLink {
        _id: ObjectId
        department: string                  // 'j1'..'j7', see lib/discord/dept-codes.ts DEPT_CODES
        url: string                         // normalised absolute http(s) href
        fetchedTitle: string                // page <title>, else the URL host
        nameOverride: string | null         // display-only; null = show fetchedTitle
        visibleToRoleIds: ObjectId[]        // empty = visible to every department member; non-empty = only members holding one of these DepartmentRole ids (or managers)
        order: number                       // fractional-midpoint reorder, board precedent
        faviconData: string | null          // base64, <=200KB raw, doc-embedded (atomic, no orphan files)
        faviconContentType: string | null   // one of the six canonical image types, magic-byte sniffed
        faviconFetchedAt: Date | null       // doubles as the ?v= cache buster
        faviconStatus: 'ok' | 'failed'
        createdAt: Date
        createdBy: string                   // Discord ID
        createdByName: string
        updatedAt?: Date
        updatedById?: string
        updatedByName?: string
    }

    // Wire shape returned by GET /api/admin/dept-links. faviconData is never
    // included; the bytes are served separately from the favicon route.
    interface DepartmentLinkListItem {
        _id: string
        department: string
        url: string
        fetchedTitle: string
        nameOverride: string | null
        visibleToRoleIds: string[]           // DepartmentRole ids as strings; empty = everyone
        order: number
        hasFavicon: boolean
        faviconVersion: number | null       // faviconFetchedAt.getTime(), null when never fetched
    }

}
