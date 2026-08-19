'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'

import GalleryBanner from './_components/GalleryBanner'
import FeaturedRail from './_components/FeaturedRail'
import Toolbar, { type GridView, type SortKey } from './_components/Toolbar'
import FacetRail from './_components/FacetRail'
import PhotoGrid from './_components/PhotoGrid'
import Lightbox, { type LightboxItem } from './_components/Lightbox'

import {
    archiveStats, emptyFilters, flatten, matches, sortPhotos, splitOperation,
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

   Everything on this page is derived from what storage actually holds. The
   archive is a tree of years, operations, missions and files and nothing more,
   so there is no photographer facet, no tags and no likes — the mockup carried
   all three, and every one of them would have had to be invented.
   ========================================================================== */

/*
   Paged per view, because the unit on screen changes with it. The flat grids
   window a list of photographs; the grouped one windows a list of operations,
   where 48 would be most of the archive in one go.
*/
const PAGE_SIZE: Record<GridView, number> = { masonry: 48, uniform: 48, grouped: 8 }

export default function Page() {
    const [years, setYears] = useState<GalleryAPI['years']>([])
    const [featured, setFeatured] = useState<string[]>([])
    const [sotm, setSotm] = useState<ScreenshotOfMonth | null>(null)

    const [filters, setFilters] = useState<Filters>(emptyFilters)
    const [sort, setSort] = useState<SortKey>('new')
    const [view, setView] = useState<GridView>('masonry')
    const [shown, setShown] = useState(PAGE_SIZE.masonry)

    const [lightbox, setLightbox] = useState<{ list: Photo[], index: number } | null>(null)
    const [singleImage, setSingleImage] = useState<LightboxItem | null>(null)

    useEffect(() => {
        fetch('/api/gallery')
            .then(res => res.json())
            .then((json: GalleryAPI) => {
                setYears(json.years ?? [])
                // Shuffled per visit: the strip is a sample of the archive, not
                // a ranking, and a fixed order would show the same dozen photos
                // to everyone forever.
                setFeatured([...(json.featured ?? [])].sort(() => Math.random() - 0.5))
            })
            .catch(() => { })

        // A month with no winner set is a normal state — the banner simply drops
        // that column rather than showing an empty card.
        fetch('/api/gallery/sotm')
            .then(res => res.ok ? res.json() : null)
            .then(json => setSotm(json?.filename ? json : null))
            .catch(() => { })
    }, [])

    const photos = useMemo(() => flatten(years), [years])
    const stats = useMemo(() => archiveStats(years), [years])

    const results = useMemo(
        () => sortPhotos(photos.filter(p => matches(p, filters)), sort),
        [photos, filters, sort],
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
       but they hold the raw folder name, which is the key everything filters on. */
    const labelFor = useCallback((facet: Facet, value: string) =>
        facet === 'operation' ? splitOperation(value).label : value, [])

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

    const openFeatured = useCallback((index: number) => {
        const file = featured[index]
        if (!file) return
        setSingleImage({
            src: `/api/gallery/featured?img=${encodeURIComponent(file)}`,
            kicker: 'Featured',
            title: file.replace(/\.[^.]+$/, ''),
            rows: [],
            file,
        })
    }, [featured])

    const openSotm = useCallback(() => {
        if (!sotm) return
        setSingleImage({
            src: '/api/gallery/sotm/image',
            kicker: 'Screenshot of the month',
            title: sotm.operationTitle || 'This month',
            rows: [
                ['Credit', sotm.credit],
                ['Taken', new Date(sotm.dateTaken).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })],
            ],
            file: sotm.filename,
        })
    }, [sotm])

    const current = lightbox?.list[lightbox.index]
    const item: LightboxItem | null = singleImage ?? (current ? {
        src: current.src,
        kicker: `${current.opLabel} · Mission ${current.mission}`,
        title: current.opLabel,
        rows: [
            ['Operation', current.opLabel],
            ['Mission', current.mission],
            ['Year', current.year],
            ['File', current.file],
        ],
        file: current.file,
    } : null)

    return (
        <div className={s.page}>
            <GalleryBanner stats={stats} sotm={sotm} onOpenSotm={openSotm} />

            <FeaturedRail images={featured} onOpen={openFeatured} />

            <Toolbar
                filters={filters}
                total={photos.length}
                shown={results.length}
                sort={sort}
                view={view}
                onSearch={q => update(draft => { draft.q = q })}
                onSort={setSort}
                onView={changeView}
                onRemove={removeFilter}
                onClear={clearAll}
                labelFor={labelFor}
            />

            <div className={s.shell}>
                <FacetRail photos={photos} filters={filters} onToggle={toggleFacet} />

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
                    onClose={() => { setSingleImage(null); setLightbox(null) }}
                    onStep={step}
                />
            )}
        </div>
    )
}
