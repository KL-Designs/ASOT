'use client'

import React from 'react'

import {
    SearchIcon, ChevronDown, CrossSmall,
    MasonryIcon, SheetIcon, GroupedIcon,
} from './icons'
import type { Facet, Filters } from '../gallery-data'
import s from '@/styles/gallery.module.css'

export type GridView = 'masonry' | 'uniform' | 'grouped'
// 'top' is not yet in SORTS below — see the comment there. It has to join the
// type regardless, because sortPhotos already has a branch for it.
export type SortKey = 'new' | 'old' | 'op' | 'top'

/*
   No "featured first": featured is a separate folder rather than a flag on an
   archive photograph, so there is nothing to sort by. Top rated is left out
   too, deliberately — sortPhotos already has a 'top' branch and the type
   admits it, but until voting ships there is no vote data behind it, so
   offering it here would be a menu item that does nothing. It joins this list
   in a later task.
*/
const SORTS: { value: SortKey, label: string }[] = [
    { value: 'new', label: 'Newest first' },
    { value: 'old', label: 'Oldest first' },
    { value: 'op', label: 'By operation' },
]

const VIEWS: { value: GridView, label: string, Icon: (p: { className?: string }) => React.JSX.Element }[] = [
    { value: 'masonry', label: 'Masonry', Icon: MasonryIcon },
    { value: 'uniform', label: 'Contact sheet', Icon: SheetIcon },
    { value: 'grouped', label: 'By operation', Icon: GroupedIcon },
]

/**
 * Search, the running total, sort and view — and under them, the active filters
 * as removable pills.
 *
 * The count is the point of this bar. On the live page nothing tells you how
 * many photographs match: you tick a filter, the grid changes, and you cannot
 * tell whether you narrowed four thousand down to forty or to four.
 */
export default function Toolbar({
    filters, total, shown, sort, view,
    onSearch, onSort, onView, onRemove, onClear,
    labelFor,
}: {
    filters: Filters
    /** Everything in the archive. */
    total: number
    /** What the current filters leave. */
    shown: number
    sort: SortKey
    view: GridView
    onSearch: (q: string) => void
    onSort: (sort: SortKey) => void
    onView: (view: GridView) => void
    onRemove: (facet: Facet | 'q', value: string) => void
    onClear: () => void
    /** Operations are stored with an ordering prefix nothing should print. */
    labelFor: (facet: Facet, value: string) => string
}) {
    const pills: { facet: Facet | 'q', value: string, label: string }[] = []
    if (filters.q) pills.push({ facet: 'q', value: '', label: `“${filters.q}”` })
    for (const facet of ['year', 'operation', 'mission'] as const) {
        for (const value of filters[facet]) pills.push({ facet, value, label: labelFor(facet, value) })
    }

    return (
        <div className={s.toolbar}>
            <div className={s.tbIn}>
                <div className={s.search}>
                    <SearchIcon />
                    <input
                        type='search'
                        value={filters.q}
                        onChange={e => onSearch(e.target.value)}
                        placeholder='Search operations, missions, years…'
                        aria-label='Search the gallery'
                    />
                </div>

                <span className={s.count}>
                    <b>{shown.toLocaleString('en-AU')}</b> photo{shown === 1 ? '' : 's'}
                    {shown !== total && <> of {total.toLocaleString('en-AU')}</>}
                </span>

                <div className={s.tbRight}>
                    {/* A native <select> under an invisible overlay: it keeps the
                        platform's own picker on touch devices, which no custom
                        dropdown does as well. */}
                    <div className={s.sel}>
                        <select value={sort} onChange={e => onSort(e.target.value as SortKey)} aria-label='Sort order'>
                            {SORTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <span>{SORTS.find(o => o.value === sort)?.label}</span>
                        <ChevronDown />
                    </div>

                    <div className={s.viewseg}>
                        {VIEWS.map(({ value, label, Icon }) => (
                            <button
                                key={value}
                                type='button'
                                className={view === value ? s.on : ''}
                                onClick={() => onView(value)}
                                aria-label={label}
                                aria-pressed={view === value}
                            >
                                <Icon />
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {pills.length > 0 && (
                <div className={s.pills}>
                    {pills.map(p => (
                        <span key={`${p.facet}:${p.value}`} className={s.pill}>
                            {p.label}
                            <button type='button' onClick={() => onRemove(p.facet, p.value)} aria-label={`Remove filter ${p.label}`}>
                                <CrossSmall />
                            </button>
                        </span>
                    ))}
                    <button type='button' className={s.clearall} onClick={onClear}>Clear all</button>
                </div>
            )}
        </div>
    )
}
