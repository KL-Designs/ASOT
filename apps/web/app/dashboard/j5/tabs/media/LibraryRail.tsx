'use client'

import { useState } from 'react'

import type { LibraryView } from '@/lib/gallery/library-query'
import s from '@/styles/media-console.module.css'

/**
 * Saved views on top, the archive tree below, every row with a live count.
 *
 * The counts are the point. "Unknown operation · 1,157" is a job a reviewer
 * can watch shrink; an uncounted row is a folder they have to open to find out
 * whether it is worth opening.
 */

export default function LibraryRail({ facets, view, year, operation, mission, onView, onNode }: {
    facets: LibraryFacetsAPI | null
    view: LibraryView
    year: string | null
    operation: string | null
    mission: string | null
    onView: (view: LibraryView) => void
    onNode: (year: string | null, operation: string | null, mission: string | null) => void
}) {
    const [openYears, setOpenYears] = useState<Set<string>>(new Set())
    const [openOps, setOpenOps] = useState<Set<string>>(new Set())

    const toggle = (set: Set<string>, key: string, apply: (next: Set<string>) => void) => {
        const next = new Set(set)
        if (next.has(key)) next.delete(key); else next.add(key)
        apply(next)
    }

    const n = (value: number) => value.toLocaleString('en-AU')
    const treeSelected = year !== null || operation !== null

    const views: { key: LibraryView, label: string, count: number }[] = facets ? [
        { key: 'all', label: 'All media', count: facets.views.all },
        { key: 'unknown', label: 'Unknown operation', count: facets.views.unknown },
        { key: 'nocaption', label: 'No caption', count: facets.views.nocaption },
        { key: 'videos', label: 'Videos', count: facets.views.videos },
        { key: 'health', label: 'Health', count: facets.views.health },
    ] : []

    return (
        <nav className={s.rail} aria-label='Media library'>
            <p className={s.railHead}>Views</p>
            {views.map(v => (
                <button
                    key={v.key}
                    type='button'
                    className={`${s.row} ${view === v.key && !treeSelected ? s.rowOn : ''}`}
                    onClick={() => onView(v.key)}
                    aria-current={view === v.key && !treeSelected}
                >
                    {v.label}
                    <span className={s.count}>{n(v.count)}</span>
                </button>
            ))}

            <p className={s.railHead}>Archive</p>
            {(facets?.years ?? []).map(y => (
                <div key={y.year}>
                    <button
                        type='button'
                        className={`${s.row} ${year === y.year && !operation ? s.rowOn : ''}`}
                        onClick={() => { toggle(openYears, y.year, setOpenYears); onNode(y.year, null, null) }}
                    >
                        <span className={s.caret}>{openYears.has(y.year) ? '▾' : '▸'}</span>
                        {y.year}
                        <span className={s.count}>{n(y.count)}</span>
                    </button>

                    {openYears.has(y.year) && y.operations.map(op => {
                        const key = `${y.year}/${op.operation}`
                        return (
                            <div key={key}>
                                <button
                                    type='button'
                                    className={`${s.row} ${s.rowSub} ${operation === op.operation && !mission ? s.rowOn : ''}`}
                                    onClick={() => { toggle(openOps, key, setOpenOps); onNode(y.year, op.operation, null) }}
                                >
                                    {op.missions.length > 0 && <span className={s.caret}>{openOps.has(key) ? '▾' : '▸'}</span>}
                                    {op.opLabel}
                                    <span className={s.count}>{n(op.count)}</span>
                                </button>

                                {openOps.has(key) && op.missions.map(m => (
                                    <button
                                        key={m.mission}
                                        type='button'
                                        className={`${s.row} ${s.rowSubSub} ${mission === m.mission && operation === op.operation ? s.rowOn : ''}`}
                                        onClick={() => onNode(y.year, op.operation, m.mission)}
                                    >
                                        {m.mission}
                                        <span className={s.count}>{n(m.count)}</span>
                                    </button>
                                ))}
                            </div>
                        )
                    })}
                </div>
            ))}
        </nav>
    )
}
