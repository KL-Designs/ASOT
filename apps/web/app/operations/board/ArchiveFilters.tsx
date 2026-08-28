'use client'

import { useEffect, useRef, useState } from 'react'
import type { BoardFilter, MonthBucket } from '@/lib/operations/board'
import { platoonShortLabel } from '@/lib/orbat/constants'
import type { BoardData, FacetCount } from './useBoard'
import s from './board.module.css'

interface Props {
    filter: BoardFilter
    data: BoardData
    update: (patch: Partial<BoardFilter>) => void
    clear: () => void
}

/**
 * Search, facets and a range — the controls that make three hundred operations
 * navigable.
 *
 * The month picker this replaces could only ever answer "which month", which is
 * the question you have when you already know the answer. These answer the ones
 * people actually arrive with: what was it called, which campaign was it part
 * of, which of these was I on.
 */
export default function ArchiveFilters({ filter, data, update, clear }: Props) {
    return (
        <div className={s.filter}>
            <div className={s.filterRow}>
                <SearchBox value={filter.q} onChange={q => update({ q })} total={data.total} />
                <span className={s.showing}>
                    <b>{data.total}</b> {data.total === 1 ? 'operation' : 'operations'}
                </span>
            </div>

            <div className={s.filterRow}>
                <Facet
                    name='Campaign'
                    options={data.facets.campaigns}
                    selected={filter.campaignId}
                    onPick={v => update({ campaignId: v })}
                    emptyLabel={`${data.facets.campaigns.length} campaigns`}
                />
                <Facet
                    name='Unit'
                    options={data.facets.units.map(u => ({ ...u, label: platoonShortLabel(u.value) }))}
                    selected={filter.unit}
                    onPick={v => update({ unit: v })}
                    emptyLabel='all'
                />
                <Facet
                    name='Terrain'
                    options={data.facets.terrains}
                    selected={filter.terrain}
                    onPick={v => update({ terrain: v })}
                    emptyLabel={`${data.facets.terrains.length} maps`}
                />
                {data.signedIn && (
                    <button
                        type='button'
                        className={`${s.facet} ${filter.mine ? s.facetMine : ''}`}
                        aria-pressed={filter.mine}
                        onClick={() => update({ mine: !filter.mine })}
                    >
                        {filter.mine ? '✓ ' : ''}Ones I was on <em>{data.facets.mine}</em>
                    </button>
                )}
            </div>

            <Applied filter={filter} data={data} update={update} clear={clear} />

            {data.histogram.length > 1 && (
                <Histogram
                    buckets={data.histogram}
                    from={filter.from}
                    to={filter.to}
                    onSelect={(from, to) => update({ from, to })}
                />
            )}
        </div>
    )
}

/**
 * Search is debounced rather than submitted: at this scale the list is small
 * enough to keep up, and making people press Enter to find out whether a word
 * matches anything is a round trip of doubt per guess.
 */
function SearchBox({ value, onChange, total }: { value: string; onChange: (v: string) => void; total: number }) {
    const [draft, setDraft] = useState(value)

    // Keep in step when the filter is cleared from elsewhere, without fighting
    // the user's own typing.
    useEffect(() => { setDraft(prev => (prev === value ? prev : value)) }, [value])

    useEffect(() => {
        if (draft === value) return
        const id = setTimeout(() => onChange(draft), 300)
        return () => clearTimeout(id)
    }, [draft, value, onChange])

    return (
        <div className={s.search}>
            <svg width='12' height='12' viewBox='0 0 14 14' fill='none' aria-hidden='true'>
                <circle cx='6' cy='6' r='4.2' stroke='currentColor' strokeWidth='1.4' />
                <path d='M9.2 9.2L12.5 12.5' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
            </svg>
            <input
                type='search'
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={`Search ${total} operations…`}
                aria-label='Search operations by name'
            />
        </div>
    )
}

/**
 * A facet carries its count, because the count is what tells you whether the
 * cut is worth making. A menu of bare names makes you pick one to find out and
 * then come back.
 */
function Facet({ name, options, selected, onPick, emptyLabel }: {
    name: string
    options: FacetCount[]
    selected: string | null
    onPick: (value: string | null) => void
    emptyLabel: string
}) {
    const [open, setOpen] = useState(false)
    const wrap = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        window.addEventListener('mousedown', away)
        window.addEventListener('keydown', esc)
        return () => {
            window.removeEventListener('mousedown', away)
            window.removeEventListener('keydown', esc)
        }
    }, [open])

    if (options.length === 0 && !selected) return null
    const chosen = options.find(o => o.value === selected)

    return (
        <div className={s.facetWrap} ref={wrap}>
            <button
                type='button'
                className={`${s.facet} ${selected ? s.facetOn : ''}`}
                aria-expanded={open}
                aria-haspopup='menu'
                onClick={() => setOpen(v => !v)}
            >
                {name} <em>{chosen ? `${chosen.label} · ${chosen.count}` : emptyLabel}</em> ▾
            </button>

            {open && (
                <div className={s.menu} role='menu'>
                    {selected && (
                        <button type='button' onClick={() => { onPick(null); setOpen(false) }}>
                            Any {name.toLowerCase()}
                        </button>
                    )}
                    {options.map(o => (
                        <button
                            key={o.value}
                            type='button'
                            aria-pressed={o.value === selected}
                            onClick={() => { onPick(o.value === selected ? null : o.value); setOpen(false) }}
                        >
                            {o.label}<span>{o.count}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

/**
 * The applied filters, each removable on its own.
 *
 * Three filters deep, "why am I seeing twelve results" has to be answerable by
 * reading rather than by taking the controls apart one at a time.
 */
function Applied({ filter, data, update, clear }: Props) {
    const chips: { key: string; label: string; off: () => void }[] = []

    if (filter.q) chips.push({ key: 'q', label: `“${filter.q}”`, off: () => update({ q: '' }) })
    if (filter.campaignId) {
        const c = data.facets.campaigns.find(x => x.value === filter.campaignId)
            ?? data.campaigns.find(x => x.id === filter.campaignId)
        chips.push({
            key: 'campaign',
            label: (c && 'label' in c ? c.label : c?.name) ?? 'Campaign',
            off: () => update({ campaignId: null }),
        })
    }
    if (filter.unit) chips.push({ key: 'unit', label: platoonShortLabel(filter.unit), off: () => update({ unit: null }) })
    if (filter.terrain) chips.push({ key: 'terrain', label: filter.terrain, off: () => update({ terrain: null }) })
    if (filter.mine) chips.push({ key: 'mine', label: 'Ones I was on', off: () => update({ mine: false }) })
    if (filter.from || filter.to) {
        chips.push({
            key: 'range',
            label: rangeLabel(filter.from, filter.to),
            off: () => update({ from: null, to: null }),
        })
    }

    if (chips.length === 0) return null

    return (
        <div className={s.filterRow}>
            <span className={s.label}>Applied</span>
            {chips.map(c => (
                <button key={c.key} type='button' className={s.chip} onClick={c.off}>
                    {c.label} <i aria-hidden='true'>✕</i>
                    <span className='sr-only'> — remove filter</span>
                </button>
            ))}
            <button type='button' className={s.clear} onClick={clear}>Clear all</button>
        </div>
    )
}

/**
 * Eight years of scheduling on one strip.
 *
 * This is the month picker's replacement, and it does a second job the picker
 * could not: it shows where the weight of our history sits — the campaign
 * clusters, the summer quiet — so choosing a range is an informed move rather
 * than a guess. Bars outside the selection go quiet instead of disappearing,
 * so you keep your bearings while a range is applied.
 *
 * Drag to select a range; click one bar for a single month; each bar is also a
 * button, so the whole thing works from the keyboard without the drag.
 */
function Histogram({ buckets, from, to, onSelect }: {
    buckets: MonthBucket[]
    from: string | null
    to: string | null
    onSelect: (from: string | null, to: string | null) => void
}) {
    const [dragFrom, setDragFrom] = useState<number | null>(null)
    const [dragTo, setDragTo] = useState<number | null>(null)
    const max = Math.max(...buckets.map(b => b.count), 1)

    // While dragging, the preview wins; otherwise the applied range does.
    const live = dragFrom !== null && dragTo !== null
        ? [Math.min(dragFrom, dragTo), Math.max(dragFrom, dragTo)]
        : null

    /** `rest` — no range at all; `in`/`out` — inside or outside a chosen one. */
    const stateOf = (i: number): 'rest' | 'in' | 'out' => {
        if (live) return i >= live[0] && i <= live[1] ? 'in' : 'out'
        if (!from && !to) return 'rest'
        const m = buckets[i].month
        return (!from || m >= from) && (!to || m <= to) ? 'in' : 'out'
    }

    const commit = () => {
        if (dragFrom === null || dragTo === null) return
        const lo = Math.min(dragFrom, dragTo)
        const hi = Math.max(dragFrom, dragTo)
        // Selecting everything is the same as selecting nothing, and saying so
        // keeps the "applied" row honest.
        const whole = lo === 0 && hi === buckets.length - 1
        onSelect(whole ? null : buckets[lo].month, whole ? null : buckets[hi].month)
        setDragFrom(null)
        setDragTo(null)
    }

    useEffect(() => {
        if (dragFrom === null) return
        const up = () => commit()
        window.addEventListener('pointerup', up)
        return () => window.removeEventListener('pointerup', up)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dragFrom, dragTo])

    const years = [...new Set(buckets.map(b => b.month.slice(0, 4)))]

    return (
        <div className={s.hist}>
            <div className={s.histHead}>
                <span className={s.label}>By month · drag to select a range</span>
                <b>{from || to ? rangeLabel(from, to) : 'All time'}</b>
            </div>

            <div className={s.bars}>
                {buckets.map((b, i) => (
                    <button
                        key={b.month}
                        type='button'
                        data-state={stateOf(i)}
                        style={{ height: `${b.count === 0 ? 2 : Math.round((b.count / max) * 44)}px` }}
                        title={`${monthLabel(b.month)} · ${b.count} ${b.count === 1 ? 'operation' : 'operations'}`}
                        aria-label={`${monthLabel(b.month)}, ${b.count} operations`}
                        onPointerDown={() => { setDragFrom(i); setDragTo(i) }}
                        onPointerEnter={() => { if (dragFrom !== null) setDragTo(i) }}
                        onClick={() => onSelect(b.month, b.month)}
                    />
                ))}
            </div>

            <div className={s.years}>
                {years.map(y => (
                    <span
                        key={y}
                        className={(!from || y >= from.slice(0, 4)) && (!to || y <= to.slice(0, 4)) && (from || to) ? s.yearOn : ''}
                    >{y}</span>
                ))}
            </div>
        </div>
    )
}

// ── Labels ────────────────────────────────────────────────────────────────────

function monthLabel(key: string): string {
    const [y, m] = key.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function rangeLabel(from: string | null, to: string | null): string {
    if (from && to) return from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`
    if (from) return `From ${monthLabel(from)}`
    if (to) return `Up to ${monthLabel(to)}`
    return 'All time'
}
