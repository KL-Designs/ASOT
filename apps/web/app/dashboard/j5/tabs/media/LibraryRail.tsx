'use client'

import { useState } from 'react'

import type { LibraryView } from '@/lib/gallery/library-query'
import s from '@/styles/media-console.module.css'

/**
 * Saved views on top, the archive tree below, every row with a live count.
 *
 * The counts are the point. "Not linked to an operation · 1,157" is a job a
 * reviewer can watch shrink; an uncounted row is a folder they have to open
 * to find out whether it is worth opening.
 */

type NodeSelection = {
    year: string | null, yearUnset: boolean,
    operation: string | null, operationUnset: boolean,
    mission: string | null,
}

export default function LibraryRail({ facets, view, year, yearUnset, operation, operationUnset, mission, onView, onNode }: {
    facets: LibraryFacetsAPI | null
    view: LibraryView
    year: string | null
    yearUnset: boolean
    operation: string | null
    operationUnset: boolean
    mission: string | null
    onView: (view: LibraryView) => void
    onNode: (sel: NodeSelection) => void
}) {
    const [openYears, setOpenYears] = useState<Set<string>>(new Set())
    const [openOps, setOpenOps] = useState<Set<string>>(new Set())

    const toggle = (set: Set<string>, key: string, apply: (next: Set<string>) => void) => {
        const next = new Set(set)
        if (next.has(key)) next.delete(key); else next.add(key)
        apply(next)
    }

    const n = (value: number) => value.toLocaleString('en-AU')
    const treeSelected = year !== null || yearUnset || operation !== null || operationUnset

    // A year row's `unset` and a literal year of 'Unknown' both display as
    // "Unknown", so highlighting can't compare display text alone once both
    // rows exist — it has to agree on the unset flag too, the same
    // distinction facets/route.ts's tree assembly now carries through to
    // this response instead of collapsing it into one shared string.
    const yearSelected = (y: { year: string, unset: boolean }) =>
        y.unset ? yearUnset : (!yearUnset && year === y.year)
    const opSelected = (op: { operation: string, unset: boolean }) =>
        op.unset ? operationUnset : (!operationUnset && operation === op.operation)

    const views: { key: LibraryView, label: string, count: number }[] = facets ? [
        { key: 'all', label: 'All media', count: facets.views.all },
        // Label only — the filter behind 'unknown' still keys on operationId
        // being absent (facets/route.ts), which is correct. Most rows in this
        // count DO carry a folder-derived name (opLabel/operation); what they
        // lack is a link to an operation record, and "Unknown operation" read
        // as if the name itself were missing.
        { key: 'unknown', label: 'Not linked to an operation', count: facets.views.unknown },
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
            {(facets?.years ?? []).map(y => {
                // Not `y.year` alone: a field-missing row and a literal
                // "Unknown" row can now both display that same text, and a
                // plain string key would make React (and the openYears/
                // openOps toggle Sets, which are also keyed on this string)
                // treat the two as one row — expanding one would silently
                // expand or select the other.
                const yKey = `${y.unset}:${y.year}`
                return (
                    <div key={yKey}>
                        <button
                            type='button'
                            className={`${s.row} ${yearSelected(y) && !operation && !operationUnset ? s.rowOn : ''}`}
                            onClick={() => {
                                toggle(openYears, yKey, setOpenYears)
                                onNode({ year: y.year, yearUnset: y.unset, operation: null, operationUnset: false, mission: null })
                            }}
                        >
                            <span className={s.caret}>{openYears.has(yKey) ? '▾' : '▸'}</span>
                            {y.year}
                            <span className={s.count}>{n(y.count)}</span>
                        </button>

                        {openYears.has(yKey) && y.operations.map(op => {
                            const opKey = `${yKey}/${op.unset}:${op.operation}`
                            return (
                                <div key={opKey}>
                                    <button
                                        type='button'
                                        className={`${s.row} ${s.rowSub} ${opSelected(op) && !mission ? s.rowOn : ''}`}
                                        onClick={() => {
                                            toggle(openOps, opKey, setOpenOps)
                                            onNode({ year: y.year, yearUnset: y.unset, operation: op.operation, operationUnset: op.unset, mission: null })
                                        }}
                                    >
                                        {op.missions.length > 0 && <span className={s.caret}>{openOps.has(opKey) ? '▾' : '▸'}</span>}
                                        {op.opLabel}
                                        <span className={s.count}>{n(op.count)}</span>
                                    </button>

                                    {openOps.has(opKey) && op.missions.map(m => (
                                        <button
                                            key={m.mission}
                                            type='button'
                                            className={`${s.row} ${s.rowSubSub} ${mission === m.mission && opSelected(op) ? s.rowOn : ''}`}
                                            onClick={() => onNode({ year: y.year, yearUnset: y.unset, operation: op.operation, operationUnset: op.unset, mission: m.mission })}
                                        >
                                            {m.mission}
                                            <span className={s.count}>{n(m.count)}</span>
                                        </button>
                                    ))}
                                </div>
                            )
                        })}
                    </div>
                )
            })}
        </nav>
    )
}
