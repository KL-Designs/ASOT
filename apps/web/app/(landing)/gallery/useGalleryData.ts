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

/** The lightbox's download attribute wants a real filename. GalleryItemAPI
 *  carries none — that raw name lived only in the storage tree, not in the
 *  index — but a legacy item's src is /api/gallery/fetch?...&img=<filename>,
 *  so the original name can still be read back out of it for the photographs
 *  the archive holds today. An item with no such query string (an upload)
 *  falls back to its id, which is the best a download picker can do once
 *  there is no folder-derived name to reach for. */
function downloadName(p: Photo): string {
    if (!p.src) return p.id
    const q = p.src.split('?')[1]
    const img = q ? new URLSearchParams(q).get('img') : null
    return img ?? p.id
}

export function useGalleryData() {
    const [items, setItems] = useState<Photo[]>([])
    const [featured, setFeatured] = useState<string[]>([])
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

    useEffect(() => {
        fetch('/api/gallery')
            .then(res => res.json())
            .then((json: GalleryAPI) => {
                setItems(json.items ?? [])
                // Shuffled per visit: the strip is a sample of the archive, not
                // a ranking, and a fixed order would show the same dozen photos
                // to everyone forever.
                setFeatured([...(json.featured ?? [])].sort(() => Math.random() - 0.5))
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

    /* The tag vocabulary lives here (as `tags`), not in gallery-data.ts — a
       Photo only carries slugs, and resolving them to labels needs the
       vocabulary this hook already fetched, so building the lightbox's item
       anywhere else would mean threading `tags` and `votes` through the page
       just to get here. */
    const toLightboxItem = useCallback((p: Photo): LightboxItem => {
        const rows: [string, string][] = [['Operation', p.opLabel ?? 'Unknown operation']]
        if (p.mission) rows.push(['Mission', p.mission])
        if (p.year) rows.push(['Year', p.year])

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

            vote: { mediaId: p.id, up: p.up, down: p.down, mine: votes[p.id] ?? null, canVote },
        }
    }, [tags, votes, canVote])

    return { items, featured, sotm, tags, votes, canVote, canSubmit, applyVote, toLightboxItem }
}
