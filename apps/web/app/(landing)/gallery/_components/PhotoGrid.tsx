'use client'

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react'

import Button from '@/components/ui/Button'
import { ExpandIcon } from './icons'
import { groupByOperation, type Photo } from '../gallery-data'
import type { GridView } from './Toolbar'
import s from '@/styles/gallery.module.css'

/* Matches `--gap` and `grid-auto-rows` in gallery.module.css. Masonry spans are
   arithmetic on those two numbers, so they have to agree. */
const GAP = 12
const ROW = 10
const DEFAULT_RATIO = 16 / 10

/**
 * Measured column geometry.
 *
 * Masonry spans are computed from the column width the browser actually chose,
 * not from a guess: the grid is `repeat(4, 1fr)` at full width and drops to
 * three, two and one across the breakpoints, so anything hard-coded is wrong at
 * three sizes out of four.
 *
 * Layout effect rather than a plain one: until this has run there is no width to
 * derive spans from, and a masonry row is 10px, so every tile would paint one
 * row tall for a frame before snapping to size. Nothing here is server-rendered
 * — the archive arrives by fetch after mount — so measuring before paint costs
 * nothing.
 */
function useColumnWidth(ref: React.RefObject<HTMLDivElement | null>): number | null {
    const [width, setWidth] = useState<number | null>(null)

    useLayoutEffect(() => {
        const el = ref.current
        if (!el) return

        const measure = () => {
            const columns = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length
            if (!columns) return
            setWidth((el.clientWidth - (columns - 1) * GAP) / columns)
        }

        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(el)
        return () => observer.disconnect()
    }, [ref])

    return width
}

function Tile({ photo, onOpen, span, onRatio }: {
    photo: Photo
    onOpen: () => void
    span: number | null
    onRatio: (id: string, ratio: number) => void
}) {
    return (
        <button
            type='button'
            className={s.tile}
            onClick={onOpen}
            style={span ? { gridRow: `span ${span}` } : undefined}
            aria-label={`Open ${photo.opLabel}, ${photo.mission}`}
        >
            {/*
                A plain <img>, not next/image. Two reasons and both are about
                scale: the optimiser would have to re-encode thousands of files
                served from a local API route, and masonry needs each photo's
                real proportions, which only arrive with `naturalWidth` once the
                browser has the file. Lazy loading is doing the heavy lifting
                instead — the archive is far too large to fetch eagerly.
            */}
            <img
                src={photo.src}
                alt=''
                loading='lazy'
                decoding='async'
                onLoad={e => {
                    const img = e.currentTarget
                    if (img.naturalHeight > 0) onRatio(photo.id, img.naturalWidth / img.naturalHeight)
                }}
            />
            <span className={s.zoom}><ExpandIcon /></span>
            <span className={s.meta}>
                <span className={s.metaT}>{photo.opLabel}</span>
                <span className={s.metaS}>
                    <b>{photo.mission}</b>
                    <span>{photo.year}</span>
                </span>
            </span>
        </button>
    )
}

export default function PhotoGrid({ photos, view, shown, onShowMore, onOpen, onClear }: {
    /** Already filtered and sorted. */
    photos: Photo[]
    view: GridView
    shown: number
    onShowMore: () => void
    onOpen: (photo: Photo) => void
    onClear: () => void
}) {
    const grid = useRef<HTMLDivElement>(null)
    const colWidth = useColumnWidth(grid)
    const [ratios, setRatios] = useState<Record<string, number>>({})

    const onRatio = useCallback((id: string, ratio: number) => {
        setRatios(prev => (prev[id] === ratio ? prev : { ...prev, [id]: ratio }))
    }, [])

    const spanFor = (photo: Photo): number | null => {
        if (view !== 'masonry' || !colWidth) return null
        const ratio = ratios[photo.id] ?? DEFAULT_RATIO
        return Math.max(1, Math.ceil((colWidth / ratio + GAP) / ROW))
    }

    if (photos.length === 0) {
        return (
            <div className={s.empty}>
                <div className={s.t}>No photographs match</div>
                <p>Try removing a filter, or widening the year range.</p>
                <Button variant='ghost' size='sm' onClick={onClear}>Clear all filters</Button>
            </div>
        )
    }

    /*
       Grouped by operation, which is how the archive is actually organised on
       disk. Each group shows its first few and links into the full set rather
       than printing four hundred tiles under one heading.
    */
    if (view === 'grouped') {
        const groups = groupByOperation(photos)
        return (
            <div>
                {groups.map(group => (
                    <section key={group.key} className={s.opgroup}>
                        <div className={s.opgroupH}>
                            <span className={s.t}>{group.label}</span>
                            <span className={s.m}>
                                {group.year} · <b>{group.photos.length}</b> photo{group.photos.length === 1 ? '' : 's'}
                                {' · '}{new Set(group.photos.map(p => p.mission)).size} mission{new Set(group.photos.map(p => p.mission)).size === 1 ? '' : 's'}
                            </span>
                        </div>
                        {/* Contact-sheet proportions, not masonry. The tile's
                            image is absolutely positioned, so without a ratio to
                            hold them open the whole row collapses to nothing —
                            and a group of eight reads better even than ragged. */}
                        <div className={`${s.grid} ${s.gridUniform}`}>
                            {group.photos.slice(0, 8).map(p => (
                                <Tile key={p.id} photo={p} span={null} onRatio={onRatio} onOpen={() => onOpen(p)} />
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        )
    }

    const slice = photos.slice(0, shown)
    const remaining = photos.length - slice.length

    return (
        <div>
            <div
                ref={grid}
                className={`${s.grid} ${view === 'masonry' ? s.gridMasonry : s.gridUniform}`}
            >
                {slice.map(p => (
                    <Tile key={p.id} photo={p} span={spanFor(p)} onRatio={onRatio} onOpen={() => onOpen(p)} />
                ))}
            </div>

            {remaining > 0 && (
                <div className={s.loadmore}>
                    <Button variant='ghost' size='sm' onClick={onShowMore}>
                        Load {Math.min(48, remaining)} more · {remaining.toLocaleString('en-AU')} remaining
                    </Button>
                </div>
            )}
        </div>
    )
}
