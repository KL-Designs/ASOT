'use client'

import { useEffect, useState } from 'react'

/**
 * The unit roster, for the author picker.
 *
 * Cached at module scope rather than fetched per mount. The inspector is
 * remounted for every tile a reviewer clicks and the bulk panel every time a
 * selection opens, and the roster is hundreds of rows that change on the scale
 * of weeks — refetching it on each click would be several hundred requests
 * across one afternoon's archive cleanup for a list that never moved.
 *
 * `inFlight` exists because the inspector and the bulk panel can mount in the
 * same tick: without it, two mounts before the first response means two
 * requests. A failure clears it so the next mount retries rather than being
 * stuck on a permanently rejected promise.
 *
 * The error is returned rather than swallowed, for the reason MediaTab's
 * operation fetch was fixed for: a roster that silently arrives empty is
 * indistinguishable from a unit with no members, and the picker would offer
 * nothing but "type a name" while looking perfectly healthy.
 */

export type GalleryMember = {
    id: string
    displayName: string
    /** CSV-imported, never matched to Discord. Shown, not hidden — most of the
     *  2021 archive was photographed by members of exactly this shape. */
    skeleton: boolean
}

let cache: GalleryMember[] | null = null
let inFlight: Promise<GalleryMember[]> | null = null

async function load(): Promise<GalleryMember[]> {
    const res = await fetch('/api/gallery/admin/members')
    if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}))
        const why = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
            ? data.error
            : `HTTP ${res.status}`
        throw new Error(why)
    }
    const data: unknown = await res.json()
    const rows = typeof data === 'object' && data !== null && 'members' in data && Array.isArray(data.members) ? data.members : []
    cache = rows.filter((m: unknown): m is GalleryMember =>
        typeof m === 'object' && m !== null
        && 'id' in m && typeof m.id === 'string'
        && 'displayName' in m && typeof m.displayName === 'string')
        .map(m => ({ id: m.id, displayName: m.displayName, skeleton: m.skeleton === true }))
    return cache
}

export function useMembers(): { members: GalleryMember[], error: string | null } {
    const [members, setMembers] = useState<GalleryMember[]>(cache ?? [])
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (cache) return
        let alive = true
        if (!inFlight) inFlight = load()
        inFlight
            .then(rows => { if (alive) setMembers(rows) })
            .catch((err: unknown) => {
                inFlight = null
                if (alive) setError(err instanceof Error ? err.message : 'Could not reach the server')
            })
        return () => { alive = false }
    }, [])

    return { members, error }
}
