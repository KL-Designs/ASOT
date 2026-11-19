'use client'

import { useCallback, useEffect, useState } from 'react'

import { wilsonScore } from '@/lib/gallery/ranking'
import type { LightboxItem } from './_components/Lightbox'
import type { Photo } from './gallery-data'

/* ============================================================================
   The archive's data, and everything derived from a vote.

   Pulled out of page.tsx because this task is what finally gives the page
   something to fetch beyond the item list itself — the caller's own votes and
   whether they can submit — and a page that owned all of that inline
   alongside filtering, paging and the lightbox would stop being a layout.
   ========================================================================== */

/**
 * The lightbox's download attribute wants a real filename.
 *
 * `file` is the item's actual name on disk and is what almost everything has
 * now. It was added because deriving the name from the URL stopped working
 * the moment the archive was indexed: every migrated item became
 * `content:`-keyed with an `/api/gallery/media/{id}` src, so all 4,781
 * downloads saved as a bare ObjectId with no extension at all.
 *
 * The `img=` fallback is kept for an item still served through
 * `/api/gallery/fetch?...&img=<filename>`, and the id for an embed, which has
 * no file to name.
 */
function downloadName(p: Photo): string {
    if (p.file) return p.file
    if (!p.src) return p.id
    const q = p.src.split('?')[1]
    const img = q ? new URLSearchParams(q).get('img') : null
    return img ?? p.id
}

export function useGalleryData() {
    const [items, setItems] = useState<Photo[]>([])
    const [featured, setFeatured] = useState<FeaturedItemAPI[]>([])
    const [sotm, setSotm] = useState<ScreenshotOfMonth | null>(null)
    const [tags, setTags] = useState<{ slug: string, label: string }[]>([])
    const [votes, setVotes] = useState<Record<string, 1 | -1>>({})

    /* `/api/me/permission` 401s before it ever asks whether the key is held —
       `hasPermission` needs a signed-in member to check against, and
       fetchMe() throws first when there isn't one. So a guest and a member
       who simply lacks gallery.submit both fail the permission check, but
       only the guest fails to reach it at all: the response's ok/not-ok split
       is also the only "is anyone signed in" signal this page has, and voting
       needs exactly that, not the submit key itself. */
    const [canVote, setCanVote] = useState(false)
    const [canSubmit, setCanSubmit] = useState(false)
    // Section staff with a callsign queue. J5 have their dashboard tab.
    const [canReviewCallsign, setCanReviewCallsign] = useState(false)
    /* gallery.manage — the same key the J5 Media tab's Delete and
       DELETE /api/gallery/admin/media/[id] check. Only decides whether the
       lightbox offers Delete; the route re-checks it either way. */
    const [canManage, setCanManage] = useState(false)

    useEffect(() => {
        fetch('/api/gallery')
            .then(res => res.json())
            .then((json: GalleryAPI) => {
                setItems(json.items ?? [])
                // Held in the order the server sent it — featuredOrder on
                // gallery_media, curated by J5 through the Featured tab. This
                // used to be reshuffled here on every visit
                // (`.sort(() => Math.random() - 0.5)`), which discarded that
                // curation on arrival and, on top of that, wasn't a uniform
                // shuffle to begin with. Randomising it now happens once,
                // deliberately, server-side, when J5 presses Shuffle.
                setFeatured(json.featured ?? [])
                setTags(json.tags ?? [])
            })
            .catch(() => { })

        // A month with no winner set is a normal state — the banner simply drops
        // that column rather than showing an empty card.
        fetch('/api/gallery/sotm')
            .then(res => res.ok ? res.json() : null)
            .then(json => setSotm(json?.filename ? json : null))
            .catch(() => { })

        fetch('/api/gallery/vote')
            .then(res => res.json())
            .then(json => setVotes(json.votes ?? {}))
            .catch(() => { })

        fetch('/api/gallery/submissions/scope')
            .then(res => res.ok ? res.json() : null)
            .then(json => setCanReviewCallsign(!!json && !json.all && json.callsigns?.length > 0))
            .catch(() => { })

        fetch('/api/me/permission?key=gallery.manage')
            .then(res => res.ok ? res.json() : null)
            .then(json => setCanManage(!!json?.access))
            .catch(() => { })

        fetch('/api/me/permission?key=gallery.submit')
            .then(async res => {
                setCanVote(res.ok)
                if (!res.ok) return
                const json = await res.json()
                setCanSubmit(!!json.access)
            })
            .catch(() => { })
    }, [])

    /* A vote cast in the lightbox has to move the tile behind it too — they
       show the same item from the same `items` array, so updating it here
       once is what keeps both in sync rather than each holding its own copy.
       `score` is recomputed rather than left stale: Top rated sorts on it, and
       a vote that didn't move it would leave that sort order visibly wrong
       until the next full fetch. */
    const applyVote = useCallback((mediaId: string, next: { up: number, down: number, mine: 1 | -1 | null }) => {
        setItems(prev => prev.map(p => (p.id === mediaId
            ? { ...p, up: next.up, down: next.down, score: wilsonScore(next.up, next.down) }
            : p)))

        setVotes(prev => {
            if (next.mine === null) {
                const { [mediaId]: _dropped, ...rest } = prev
                return rest
            }
            return { ...prev, [mediaId]: next.mine }
        })
    }, [])

    /* Deletes the record and its file (the route removes both, plus its
       votes), then drops it from every list this page renders it in. Answers
       an error message to show, or null on success. */
    const deleteItem = useCallback(async (mediaId: string): Promise<string | null> => {
        try {
            const res = await fetch(`/api/gallery/admin/media/${mediaId}`, { method: 'DELETE' })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                return typeof data.error === 'string' ? data.error : 'Could not delete.'
            }
        } catch {
            return 'Could not reach the server.'
        }
        setItems(prev => prev.filter(p => p.id !== mediaId))
        setFeatured(prev => prev.filter(f => f.id !== mediaId))
        return null
    }, [])

    /* The tag vocabulary lives here (as `tags`), not in gallery-data.ts — a
       Photo only carries slugs, and resolving them to labels needs the
       vocabulary this hook already fetched, so building the lightbox's item
       anywhere else would mean threading `tags` and `votes` through the page
       just to get here. */
    const toLightboxItem = useCallback((p: Photo): LightboxItem => {
        const rows: [string, string][] = [['Operation', p.opLabel ?? 'Unknown operation']]
        if (p.mission) rows.push(['Mission', p.mission])
        // The operation's date, which is what `takenAt` holds — every item in
        // one operation shares it. Replaces the bare Year row when it is known,
        // and is left out rather than guessed when it is not.
        if (p.takenAt) {
            rows.push(['Mission date', new Date(p.takenAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })])
        } else if (p.year) {
            rows.push(['Year', p.year])
        }

        return {
            src: p.src,
            poster: p.poster,
            kicker: p.mission ? `${p.opLabel ?? 'Unknown operation'} · Mission ${p.mission}` : p.opLabel,
            title: p.opLabel ?? 'Gallery item',
            rows,
            file: downloadName(p),

            kind: p.kind,
            source: p.source,
            embedId: p.embedId,
            embedKind: p.embedKind,
            embedUrl: p.embedUrl,

            caption: p.caption,
            authorName: p.authorName,
            tags: p.tags.map(slug => ({ slug, label: tags.find(t => t.slug === slug)?.label ?? slug })),

            manageId: canManage ? p.id : null,
            vote: { mediaId: p.id, up: p.up, down: p.down, mine: votes[p.id] ?? null, canVote },
        }
    }, [tags, votes, canVote, canManage])

    // `votes` and `canVote` are deliberately not returned: nothing outside
    // this hook needs the raw state, only what `toLightboxItem` builds from
    // it, and returning them anyway would be an API surface with no caller.
    return { items, featured, sotm, tags, canSubmit, canReviewCallsign, canManage, applyVote, deleteItem, toLightboxItem }
}
