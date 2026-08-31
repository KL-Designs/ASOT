'use client'

import React, { useCallback, useMemo, useState } from 'react'

import GalleryBanner from './_components/GalleryBanner'
import FeaturedRail from './_components/FeaturedRail'
import Toolbar, { type GridView, type SortKey } from './_components/Toolbar'
import FacetRail from './_components/FacetRail'
import PhotoGrid from './_components/PhotoGrid'
import Lightbox, { type LightboxItem } from './_components/Lightbox'
import { useGalleryData } from './useGalleryData'

import {
    archiveStats, emptyFilters, matches, sortPhotos, splitOperation,
    type Facet, type Filters, type Photo,
} from './gallery-data'

import s from '@/styles/gallery.module.css'

/* ============================================================================
   The gallery.

   A side rail of filters against a masonry grid. What the page it replaces got
   wrong was never the grid — it was the filter block: three interaction
   patterns in three columns, an empty MISSION panel with a stray "I" in it,
   storage ordering leaking into the operation names ("1. Op Black Hill"), and
   no result count anywhere, so you could never tell whether a filter had done
   anything.

   Everything on this page is still derived from what is actually stored and
   still invents nothing — that hasn't changed. What changed is what "stored"
   means: the gallery used to be a read of the folder tree on disk, which
   could hold years, operations, missions and files and nothing else. It now
   reads the gallery_media index instead, and an author, a caption, tags and
   a score are exactly the things that tree had nowhere to put — they are not
   invented, they were just unrepresentable until there was a database under
   the page.

   Fetching, votes and the lightbox-item shape all live in useGalleryData —
   this file is left to arrange them: filters, paging, and which of the
   several things that can open in a lightbox is currently open.
   ========================================================================== */

/*
   Paged per view, because the unit on screen changes with it. The flat grids
   window a list of photographs; the grouped one windows a list of operations,
   where 48 would be most of the archive in one go.
*/
const PAGE_SIZE: Record<GridView, number> = { masonry: 48, uniform: 48, grouped: 8 }

export default function Page() {
    const { items, featured, sotm, tags, canSubmit, applyVote, toLightboxItem } = useGalleryData()

    const [filters, setFilters] = useState<Filters>(emptyFilters)
    const [sort, setSort] = useState<SortKey>('new')
    const [view, setView] = useState<GridView>('masonry')
    const [shown, setShown] = useState(PAGE_SIZE.masonry)

    const [lightbox, setLightbox] = useState<{ list: Photo[], index: number } | null>(null)
    const [singleImage, setSingleImage] = useState<LightboxItem | null>(null)

    const stats = useMemo(() => archiveStats(items), [items])

    const results = useMemo(
        () => sortPhotos(items.filter(p => matches(p, filters)), sort),
        [items, filters, sort],
    )

    /* Any change to what is on screen resets the page window. Keeping a deep
       scroll position across a filter change would leave someone staring at
       tile 400 of a set that now has 12. */
    const update = useCallback((change: (draft: Filters) => void) => {
        setFilters(prev => {
            const next: Filters = {
                q: prev.q,
                year: new Set(prev.year),
                operation: new Set(prev.operation),
                mission: new Set(prev.mission),
                tag: new Set(prev.tag),
                author: new Set(prev.author),
                media: prev.media,
            }
            change(next)
            return next
        })
        setShown(PAGE_SIZE[view])
    }, [view])

    const toggleFacet = useCallback((facet: Facet, value: string, on: boolean) => {
        update(draft => {
            on ? draft[facet].add(value) : draft[facet].delete(value)
            // Missions are named per operation ("I", "II"), so a selection only
            // means anything while its operation is still selected.
            if (facet === 'operation' && draft.operation.size === 0) draft.mission.clear()
        })
    }, [update])

    const setMedia = useCallback((media: Filters['media']) => {
        update(draft => { draft.media = media })
    }, [update])

    const removeFilter = useCallback((facet: Facet | 'q', value: string) => {
        update(draft => {
            if (facet === 'q') draft.q = ''
            else {
                draft[facet].delete(value)
                if (facet === 'operation' && draft.operation.size === 0) draft.mission.clear()
            }
        })
    }, [update])

    const clearAll = useCallback(() => {
        setFilters(emptyFilters())
        setShown(PAGE_SIZE[view])
    }, [view])

    // Switching view changes what a page *is*, so the window resets with it —
    // 96 photographs deep is not 96 operations deep.
    const changeView = useCallback((next: GridView) => {
        setView(next)
        setShown(PAGE_SIZE[next])
    }, [])

    /* A group's "see all" is a filter, not a route: the archive's operation
       folders are not the operations board's records, so there is nowhere else
       to send someone. Year included because one folder name can appear under
       more than one year. */
    const showOperation = useCallback((year: string, operation: string) => {
        update(draft => {
            draft.year = new Set([year])
            draft.operation = new Set([operation])
            draft.mission.clear()
        })
        changeView('masonry')
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }, [update, changeView])

    /* Operations are stored with an ordering prefix. The pills print the label,
       but they hold the raw folder name, which is the key everything filters on.
       Tags are stored as slugs for the same reason — a slug is the filter key,
       and the vocabulary is what turns it back into something readable. */
    const labelFor = useCallback((facet: Facet, value: string) => {
        if (facet === 'operation') return splitOperation(value).label
        if (facet === 'tag') return tags.find(t => t.slug === value)?.label ?? value
        return value
    }, [tags])

    /* ---------- lightbox ---------- */

    const openPhoto = useCallback((photo: Photo) => {
        const index = results.findIndex(p => p.id === photo.id)
        if (index >= 0) setLightbox({ list: results, index })
    }, [results])

    const step = useCallback((delta: -1 | 1) => {
        setLightbox(prev => {
            if (!prev) return prev
            const next = prev.index + delta
            return next < 0 || next >= prev.list.length ? prev : { ...prev, index: next }
        })
    }, [])

    const closeLightbox = useCallback(() => {
        setSingleImage(null)
        setLightbox(null)
    }, [])

    /* A tag chip inside the lightbox is a shortcut to "show me more like this",
       not an addition to whatever was already selected — it replaces the tag
       filter outright and drops straight into the filtered grid. */
    const filterByTag = useCallback((slug: string) => {
        update(draft => { draft.tag = new Set([slug]) })
        closeLightbox()
    }, [update, closeLightbox])

    const openFeatured = useCallback((index: number) => {
        const item = featured[index]
        if (!item) return
        // Featured tiles are gallery_media records now (see useGalleryData),
        // so the lightbox gets their real caption and operation rather than
        // the filename it used to fall back to. kind/source are still set to
        // whatever makes the stage and the Download button behave like a
        // plain photograph, which is what a featured tile actually is — it
        // carries no `kind`/`source` of its own in FeaturedItemAPI.
        setSingleImage({
            src: item.src,
            poster: null,
            kicker: item.opLabel ?? 'Featured',
            title: item.caption ?? item.opLabel ?? 'Featured',
            rows: [],
            // Falls back to the id only in the same case GalleryItemAPI.file
            // does: no readable name exists at all behind this record.
            file: item.file ?? item.id,
            kind: 'image',
            source: 'upload',
            embedId: null,
            embedKind: null,
            embedUrl: null,
            caption: item.caption,
            authorName: null,
            tags: [],
            vote: null,
        })
    }, [featured])

    const openSotm = useCallback(() => {
        if (!sotm) return
        // The Taken row is dropped rather than shown empty when the picked
        // media has no takenAt — an unguarded `new Date(undefined)` renders
        // "Invalid Date" as though it were the date of the photograph.
        const rows: [string, string][] = [['Credit', sotm.credit]]
        if (sotm.dateTaken) {
            rows.push(['Taken', new Date(sotm.dateTaken).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })])
        }
        setSingleImage({
            src: '/api/gallery/sotm/image',
            poster: null,
            kicker: 'Screenshot of the month',
            title: sotm.operationTitle || 'This month',
            rows,
            file: sotm.filename,
            kind: 'image',
            source: 'upload',
            embedId: null,
            embedKind: null,
            embedUrl: null,
            caption: null,
            authorName: null,
            tags: [],
            vote: null,
        })
    }, [sotm])

    const current = lightbox?.list[lightbox.index]
    const item: LightboxItem | null = singleImage ?? (current ? toLightboxItem(current) : null)

    return (
        <div className={s.page}>
            <GalleryBanner stats={stats} sotm={sotm} onOpenSotm={openSotm} />

            <FeaturedRail images={featured} onOpen={openFeatured} />

            <Toolbar
                filters={filters}
                total={items.length}
                shown={results.length}
                sort={sort}
                view={view}
                onSearch={q => update(draft => { draft.q = q })}
                onSort={setSort}
                onView={changeView}
                onMedia={setMedia}
                onRemove={removeFilter}
                onClear={clearAll}
                labelFor={labelFor}
                canSubmit={canSubmit}
            />

            <div className={s.shell}>
                <FacetRail photos={items} filters={filters} tags={tags} onToggle={toggleFacet} />

                <main>
                    <PhotoGrid
                        photos={results}
                        view={view}
                        shown={shown}
                        onShowMore={() => setShown(n => n + PAGE_SIZE[view])}
                        onOpen={openPhoto}
                        onClear={clearAll}
                        onShowOperation={showOperation}
                    />
                </main>
            </div>

            {item && (
                <Lightbox
                    item={item}
                    index={singleImage ? null : lightbox!.index}
                    count={singleImage ? 1 : lightbox!.list.length}
                    onClose={closeLightbox}
                    onStep={step}
                    onTagClick={filterByTag}
                    onVote={applyVote}
                />
            )}
        </div>
    )
}
