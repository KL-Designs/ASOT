'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { usePopup } from './usePopup'
import f from '@/styles/j5-fields.module.css'

export type SelectOption = {
    value: string
    label: string
    /** Mono chrome at the right of the row — a count, or a state like "unlinked". */
    note?: string
    /** Dimmed and italic: an option that exists but is not a real choice. */
    muted?: boolean
}

/**
 * A single-choice select in the console's language.
 *
 * Ours rather than MUI's for one concrete reason: MUI's Menu renders through a
 * portal onto a Paper, and Paper's elevation tint is what put a translucent red
 * wash over the toolbar's Tag list. These popups open over photographs, so the
 * panel is opaque.
 *
 * Set `searchable` for lists a person cannot scan — operations, authors, tags.
 * Below about a dozen options a filter box is friction, not help.
 */
export function Select({ label, value, onChange, options, placeholder = 'Any', searchable, disabled, className }: {
    label?: string
    value: string
    onChange: (value: string) => void
    options: SelectOption[]
    placeholder?: string
    searchable?: boolean
    disabled?: boolean
    className?: string
}) {
    const id = useId()
    const { open, setOpen, dropUp, wrap, onKeyDownEscape } = usePopup()
    const [query, setQuery] = useState('')
    const [active, setActive] = useState(0)
    const list = useRef<HTMLUListElement | null>(null)
    const search = useRef<HTMLInputElement | null>(null)
    const trigger = useRef<HTMLButtonElement | null>(null)

    const shown = useMemo(() => {
        if (!searchable || query.trim() === '') return options
        const q = query.trim().toLowerCase()
        return options.filter(o => o.label.toLowerCase().includes(q))
    }, [options, query, searchable])

    const selected = options.find(o => o.value === value)

    /* Opening lands the cursor on what is already selected, not on the top of
       the list — reopening a select and pressing Enter must not silently pick
       something else. */
    useEffect(() => {
        if (!open) { setQuery(''); return }
        const at = shown.findIndex(o => o.value === value)
        setActive(at >= 0 ? at : 0)
        if (searchable) search.current?.focus()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open; `shown` changes as the user types, and re-running would fight the arrow keys
    }, [open])

    /* Filtering can leave the cursor past the end of a shorter list. */
    useEffect(() => {
        if (open && active >= shown.length) setActive(0)
    }, [shown.length, active, open])

    useEffect(() => {
        if (!open) return
        list.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
    }, [active, open])

    const commit = (option: SelectOption) => {
        onChange(option.value)
        setOpen(false)
        trigger.current?.focus()
    }

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (onKeyDownEscape(e)) { trigger.current?.focus(); return }

        if (!open) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setOpen(true)
            }
            return
        }

        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, shown.length - 1)) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
        else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
        else if (e.key === 'End') { e.preventDefault(); setActive(Math.max(shown.length - 1, 0)) }
        else if (e.key === 'Enter') {
            e.preventDefault()
            const option = shown[active]
            if (option) commit(option)
        } else if (e.key === 'Tab') {
            /* Tab moves on rather than picking. Closing here keeps the panel
               from being orphaned over the page with focus somewhere else. */
            setOpen(false)
        }
    }

    return (
        <div className={`${f.field} ${className ?? ''}`}>
            {label && <span className={f.label} id={`${id}-label`}>{label}</span>}
            <div className={f.selectWrap} ref={wrap} onKeyDown={onKeyDown}>
                <button
                    ref={trigger}
                    type='button'
                    className={`${f.surface} ${open ? f.surfaceOpen : ''}`}
                    disabled={disabled}
                    aria-haspopup='listbox'
                    aria-expanded={open}
                    aria-labelledby={label ? `${id}-label ${id}-value` : undefined}
                    onClick={() => setOpen(!open)}
                >
                    <span className={`${f.value} ${selected ? '' : f.placeholder}`} id={`${id}-value`}>
                        {selected ? selected.label : placeholder}
                    </span>
                    <span className={f.caret} aria-hidden='true' />
                </button>

                {open && (
                    <div className={`${f.popup} ${dropUp ? f.popupUp : f.popupDown}`}>
                        {searchable && (
                            <div className={f.search}>
                                <span className={f.affix} aria-hidden='true'>/</span>
                                <input
                                    ref={search}
                                    className={f.searchInput}
                                    value={query}
                                    placeholder='Filter…'
                                    aria-label={label ? `Filter ${label.toLowerCase()}` : 'Filter options'}
                                    onChange={e => setQuery(e.target.value)}
                                />
                            </div>
                        )}
                        <ul className={f.list} role='listbox' ref={list} aria-labelledby={label ? `${id}-label` : undefined}>
                            {shown.length === 0 && <li className={f.empty}>No matches.</li>}
                            {shown.map((o, i) => (
                                <li
                                    key={o.value}
                                    data-idx={i}
                                    role='option'
                                    aria-selected={o.value === value}
                                    className={`${f.option} ${i === active ? f.optionActive : ''} ${o.value === value ? f.optionOn : ''} ${o.muted ? f.optionMuted : ''}`}
                                    /* Pointer-down, not click: a click fires after
                                       the document listener that closes on an
                                       outside press, and on a fast click the two
                                       raced — the panel closed and the row never
                                       got its event. */
                                    onPointerDown={e => { e.preventDefault(); commit(o) }}
                                    onMouseEnter={() => setActive(i)}
                                >
                                    <span className={f.value}>{o.label}</span>
                                    {o.note && <span className={f.optionNote}>{o.note}</span>}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    )
}
