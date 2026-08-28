'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

/** Roughly the menu's own size, for deciding which way it opens. */
const MENU_W = 224
const MENU_H = 260

/**
 * Add a position to a section after the snapshot has been taken.
 *
 * The list is scoped by the same rule the ORBAT enforces: a role restricted to
 * certain platoons only appears in those platoons (`rolesFor`). That filtering
 * is a convenience — the server re-checks the chosen role against the
 * destination category before writing, because a dropdown that hides an option
 * is not a permission check.
 *
 * **The menu is portalled to the body.** Its natural home is inside the section
 * card, and the section card sets `overflow: hidden` so its rows clip to the
 * rounded corners — which cropped the menu to a few rows inside the card. An
 * absolutely-positioned child cannot escape a clipping ancestor, so the menu
 * leaves the tree entirely and positions itself against the button's measured
 * rect, flipping up or left when it would otherwise leave the viewport.
 *
 * Roles are fetched once by the board and passed down, rather than fetched per
 * section: a full ORBAT has ~15 sections and they all want the same list.
 */
export default function AddRole({ category, roles, busy, onPick }: Props) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [pos, setPos] = useState<{ top: number; left: number; acc: string; accRgb: string } | null>(null)
    const btnRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    const place = useCallback(() => {
        const btn = btnRef.current
        const r = btn?.getBoundingClientRect()
        if (!btn || !r) return

        // Portalling to the body escapes the section card's clipping, but it
        // also escapes `.command` — the class that defines the palette — and the
        // per-operation accent injected above it. The base tokens come back by
        // putting `.command` on the portalled node; the accent is not in that
        // stylesheet (it is per-operation data), so it is read off the button
        // and carried across by hand.
        const cs = getComputedStyle(btn)
        const acc = cs.getPropertyValue('--acc').trim() || '#4f8ca8'
        const accRgb = cs.getPropertyValue('--acc-rgb').trim() || '79, 140, 168'
        // Hang from the button's right edge, and flip when there is no room —
        // sections near the bottom or right of a wide board are the common case.
        const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8))
        const below = window.innerHeight - r.bottom
        const top = below < MENU_H && r.top > below ? Math.max(8, r.top - MENU_H - 4) : r.bottom + 4
        setPos({ top, left, acc, accRgb })
    }, [])

    useEffect(() => {
        if (!open) return
        place()

        function onDown(e: MouseEvent) {
            const t = e.target as Node
            if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
            setOpen(false)
        }
        function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
        // Fixed positioning is measured once, so it has to be re-measured when
        // the thing it was measured against moves.
        function onMove() { place() }

        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        window.addEventListener('resize', onMove)
        window.addEventListener('scroll', onMove, true)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
            window.removeEventListener('resize', onMove)
            window.removeEventListener('scroll', onMove, true)
        }
    }, [open, place])

    const available = useMemo(() => rolesFor(roles, category), [roles, category])
    const filtered = query.trim()
        ? available.filter(r => r.name.toLowerCase().includes(query.trim().toLowerCase()))
        : available

    return (
        <>
            <button
                ref={btnRef}
                type='button'
                className={s.addRole}
                aria-label='Add a position to this section'
                aria-expanded={open}
                disabled={busy}
                onClick={e => { e.stopPropagation(); setQuery(''); setOpen(v => !v) }}
            >+</button>

            {open && pos && createPortal(
                <div
                    ref={menuRef}
                    className={`command ${s.addRoleMenu}`}
                    style={{
                        top: pos.top,
                        left: pos.left,
                        ['--acc' as string]: pos.acc,
                        ['--acc-rgb' as string]: pos.accRgb,
                    }}
                    onClick={e => e.stopPropagation()}
                >
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
                                    : 'No role matches, or none is permitted in this platoon.'}
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
                </div>,
                document.body,
            )}
        </>
    )
}
