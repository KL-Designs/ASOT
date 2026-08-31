'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { usePopup } from './usePopup'
import f from '@/styles/j5-fields.module.css'

/**
 * Multi-choice, in the console's language: chips in the box, suggestions below.
 *
 * Replaces MUI's Autocomplete with `multiple`. Same reason as Select — the
 * portal-and-Paper popup does not match anything else on the page — plus one of
 * its own: Autocomplete's chips carry MUI's pill radius, and a pill inside a
 * square box is the single most visible mismatch in the inspector.
 */
export function TagPicker({ label, value, onChange, options, labelFor, placeholder = 'Add a tag…', allowCreate, disabled, className }: {
    label?: string
    value: string[]
    onChange: (value: string[]) => void
    options: string[]
    /** What a value reads as. The gallery stores a tag's slug on the media
     *  document but shows its label everywhere a person looks — without this
     *  the console's three tag fields would each display `night-ops` where
     *  they used to display `Night Ops`. Filtering matches the display text
     *  for the same reason: nobody searches for the slug they cannot see. */
    labelFor?: (value: string) => string
    placeholder?: string
    /** Let a typed value that matches nothing become a tag. */
    allowCreate?: boolean
    disabled?: boolean
    className?: string
}) {
    const id = useId()
    const { open, setOpen, dropUp, wrap, onKeyDownEscape } = usePopup()
    const [query, setQuery] = useState('')
    const [active, setActive] = useState(0)
    const input = useRef<HTMLInputElement | null>(null)
    const list = useRef<HTMLUListElement | null>(null)

    const show = (v: string) => labelFor?.(v) ?? v

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase()
        return options
            .filter(o => !value.includes(o))
            .filter(o => q === '' || (labelFor?.(o) ?? o).toLowerCase().includes(q))
    }, [options, value, query, labelFor])

    /* An exact match must not also be offered as "create", or Enter becomes
       ambiguous about which of two identical-looking rows it picks. */
    const canCreate = allowCreate
        && query.trim() !== ''
        && !options.some(o => o.toLowerCase() === query.trim().toLowerCase())
        && !value.some(v => v.toLowerCase() === query.trim().toLowerCase())

    useEffect(() => { setActive(0) }, [query])
    useEffect(() => {
        if (!open) return
        list.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
    }, [active, open])

    const add = (tag: string) => {
        const clean = tag.trim()
        if (clean === '' || value.includes(clean)) return
        onChange([...value, clean])
        setQuery('')
        setActive(0)
    }
    const remove = (tag: string) => onChange(value.filter(v => v !== tag))

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (onKeyDownEscape(e)) return

        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(i => Math.min(i + 1, shown.length - 1)) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
        else if (e.key === 'Enter') {
            e.preventDefault()
            const option = open ? shown[active] : undefined
            if (option) add(option)
            else if (canCreate) add(query)
        } else if (e.key === 'Backspace' && query === '' && value.length > 0) {
            /* Backspace on an empty box removes the last chip — the behaviour
               every tag field has, and the only way to undo a mis-click that
               does not involve aiming at a 10px ×. */
            remove(value[value.length - 1])
        }
    }

    return (
        <div className={`${f.field} ${className ?? ''}`}>
            {label && <span className={f.label} id={`${id}-label`}>{label}</span>}
            <div className={f.selectWrap} ref={wrap} onKeyDown={onKeyDown}>
                <div
                    className={`${f.surface} ${f.tagBox} ${open ? f.surfaceOpen : ''} ${disabled ? f.disabled : ''}`}
                    onClick={() => { if (!disabled) { input.current?.focus(); setOpen(true) } }}
                >
                    {value.map(tag => (
                        <span className={f.tag} key={tag}>
                            {show(tag)}
                            <button
                                type='button'
                                className={f.tagX}
                                aria-label={`Remove ${show(tag)}`}
                                disabled={disabled}
                                onClick={e => { e.stopPropagation(); remove(tag) }}
                            >
                                &times;
                            </button>
                        </span>
                    ))}
                    <input
                        ref={input}
                        className={`${f.input} ${f.tagInput}`}
                        value={query}
                        placeholder={value.length === 0 ? placeholder : ''}
                        disabled={disabled}
                        role='combobox'
                        aria-expanded={open}
                        aria-controls={`${id}-list`}
                        aria-labelledby={label ? `${id}-label` : undefined}
                        autoComplete='off'
                        onChange={e => { setQuery(e.target.value); setOpen(true) }}
                        onFocus={() => setOpen(true)}
                    />
                </div>

                {open && (shown.length > 0 || canCreate) && (
                    <div className={`${f.popup} ${dropUp ? f.popupUp : f.popupDown}`}>
                        <ul className={f.list} role='listbox' id={`${id}-list`}>
                            {shown.map((o, i) => (
                                <li
                                    key={o}
                                    data-idx={i}
                                    role='option'
                                    aria-selected={i === active}
                                    className={`${f.option} ${i === active ? f.optionActive : ''}`}
                                    onPointerDown={e => { e.preventDefault(); add(o) }}
                                    onMouseEnter={() => setActive(i)}
                                >
                                    <span className={f.value}>{show(o)}</span>
                                </li>
                            ))}
                            {canCreate && (
                                <li
                                    role='option'
                                    aria-selected={false}
                                    className={f.option}
                                    onPointerDown={e => { e.preventDefault(); add(query) }}
                                >
                                    <span className={f.value}>{query.trim()}</span>
                                    <span className={f.optionNote}>NEW</span>
                                </li>
                            )}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    )
}
