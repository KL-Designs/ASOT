'use client'

import React from 'react'

import { CheckIcon, ChevronDown } from './icons'
import { matches, type Facet, type Filters, type Photo } from '../gallery-data'
import s from '@/styles/gallery.module.css'

/* ============================================================================
   The filter rail.

   One control everywhere: a checkbox row with a live count. The panel this
   replaces used three different interaction patterns in three columns — a
   vertical list for year, numbered chips for operation, another list for
   mission — so a visitor had to work each one out separately, and none of them
   told you how many photographs you would get.

   Options that currently match nothing dim rather than vanishing. Making them
   disappear would mean the rail reshuffles under the cursor every time you tick
   something, and it hides the shape of the archive: "no 2021 photographs of
   this operation" is an answer, an absent row is not.
   ========================================================================== */

type Option = { value: string, label: string, count: number }

function FacetBlock({ facet, title, options, selected, onToggle, defaultOpen }: {
    facet: Facet
    title: string
    options: Option[]
    selected: Set<string>
    onToggle: (facet: Facet, value: string, on: boolean) => void
    defaultOpen: boolean
}) {
    if (options.length === 0) return null

    return (
        <details className={s.facet} open={defaultOpen}>
            <summary>
                {title}
                <span className={s.n}>{selected.size ? `${selected.size} on` : ''}</span>
                <ChevronDown className={s.cv} />
            </summary>
            <div className={s.fbody}>
                {options.map(o => (
                    <label key={o.value} className={`${s.fopt} ${o.count || selected.has(o.value) ? '' : s.fzero}`}>
                        <input
                            type='checkbox'
                            checked={selected.has(o.value)}
                            onChange={e => onToggle(facet, o.value, e.target.checked)}
                        />
                        <span className={s.fbox}><CheckIcon /></span>
                        <span className={s.fname}>{o.label}</span>
                        <span className={s.fcount}>{o.count}</span>
                    </label>
                ))}
            </div>
        </details>
    )
}

export default function FacetRail({ photos, filters, onToggle }: {
    photos: Photo[]
    filters: Filters
    onToggle: (facet: Facet, value: string, on: boolean) => void
}) {
    /* Counted with every filter applied *except* this facet's own — see
       `matches`. A count has to answer "how many would I get if I ticked
       this", which the facet's own selections would otherwise poison. */
    const countBy = (facet: Facet, key: (p: Photo) => string) => {
        const counts = new Map<string, number>()
        for (const p of photos) {
            if (!matches(p, filters, facet)) continue
            const k = key(p)
            counts.set(k, (counts.get(k) ?? 0) + 1)
        }
        return counts
    }

    const yearCounts = countBy('year', p => p.year)
    const years: Option[] = [...new Set(photos.map(p => p.year))]
        .sort((a, b) => b.localeCompare(a))
        .map(y => ({ value: y, label: y, count: yearCounts.get(y) ?? 0 }))

    const opCounts = countBy('operation', p => p.operation)
    const operations: Option[] = [...new Map(photos.map(p => [p.operation, p])).values()]
        .sort((a, b) => a.opOrder - b.opOrder || a.opLabel.localeCompare(b.opLabel))
        .map(p => ({ value: p.operation, label: p.opLabel, count: opCounts.get(p.operation) ?? 0 }))

    /*
       Mission only exists inside an operation.

       On the live page this is an empty panel with a stray highlighted "I" in
       it, which reads as broken — and it is broken in the sense that "Mission
       II" means nothing until you know which operation's second mission. So the
       facet appears once an operation is picked, listing that operation's
       actual missions, and stays away otherwise.
    */
    const missionCounts = countBy('mission', p => p.mission)
    const missions: Option[] = filters.operation.size
        ? [...new Set(photos.filter(p => filters.operation.has(p.operation)).map(p => p.mission))]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map(m => ({ value: m, label: m, count: missionCounts.get(m) ?? 0 }))
        : []

    return (
        <aside className={s.facetRail}>
            <FacetBlock facet='year' title='Year' options={years} selected={filters.year} onToggle={onToggle} defaultOpen />
            <FacetBlock facet='operation' title='Operation' options={operations} selected={filters.operation} onToggle={onToggle} defaultOpen />
            <FacetBlock facet='mission' title='Mission' options={missions} selected={filters.mission} onToggle={onToggle} defaultOpen />
        </aside>
    )
}
