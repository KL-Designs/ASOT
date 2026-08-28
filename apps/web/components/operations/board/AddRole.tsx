'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { rolesFor } from '@/lib/orbat/roleScope'
import s from './board.module.css'

export interface PickableRole {
    _id: string
    name: string
    tag: string | null
    categories: string[]
}

interface Props {
    /** The section's ORBAT category — what the role list is scoped against. */
    category: string
    roles: PickableRole[]
    busy: boolean
    onPick: (roleId: string) => void
}

/**
 * Add a position to a section after the snapshot has been taken.
 *
 * The list is scoped by the same rule the ORBAT enforces: a role restricted to
 * certain platoons only appears in those platoons (`rolesFor`). That filtering
 * is a convenience — the server re-checks the chosen role against the
 * destination category before writing, because a dropdown that hides an option
 * is not a permission check.
 *
 * Roles are fetched once by the board and passed down, rather than fetched per
 * section: a full ORBAT has ~15 sections and they all want the same list.
 */
export default function AddRole({ category, roles, busy, onPick }: Props) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        function onDown(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    const available = useMemo(() => rolesFor(roles, category), [roles, category])
    const filtered = query.trim()
        ? available.filter(r => r.name.toLowerCase().includes(query.trim().toLowerCase()))
        : available

    return (
        <div ref={ref} className={s.addRoleWrap}>
            <button
                type='button'
                className={s.addRole}
                aria-label={`Add a position to this section`}
                aria-expanded={open}
                disabled={busy}
                onClick={e => { e.stopPropagation(); setOpen(v => !v); setQuery('') }}
            >+</button>

            {open && (
                <div className={s.addRoleMenu} onClick={e => e.stopPropagation()}>
                    <input
                        autoFocus
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder='Search roles…'
                        className={s.addRoleSearch}
                    />
                    <div className={s.addRoleList}>
                        {filtered.length === 0 && (
                            <p className={s.addRoleEmpty}>
                                {roles.length === 0
                                    ? 'No roles available.'
                                    : `No role matches, or none is permitted in this platoon.`}
                            </p>
                        )}
                        {filtered.map(r => (
                            <button
                                key={r._id}
                                type='button'
                                onClick={() => { setOpen(false); setQuery(''); onPick(r._id) }}
                            >
                                <span>{r.name}</span>
                                {/* The tag is what distinguishes same-named roles
                                    with overlapping scope — without it two
                                    "Medic" entries would be indistinguishable. */}
                                {r.tag && <em>{r.tag}</em>}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
