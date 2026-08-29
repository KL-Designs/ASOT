'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
    editHref,
    readOrdersMode,
    rememberOrdersMode,
    tabHref,
    TAB_LABELS,
    visibleTabs,
    type OperationTab,
    type OrdersMode,
    type TabAccess,
} from './tabs'
import s from './tabs.module.css'

interface Props {
    operationId: string
    active: OperationTab
    /**
     * `operations.orders.view` — may open the editor, so the Orders tab gets
     * its Read/Edit menu. It no longer decides which *tabs* appear: that used
     * to be the same boolean, which is exactly why nobody could be given the
     * Schedule without also being given the editor.
     */
    canEdit: boolean
    /** Which tabs this viewer gets, one capability each. */
    access?: TabAccess
    /** True on `/edit` — the menu then marks Edit as the current mode. */
    editing?: boolean
    /**
     * Lets the editor keep a switch in-shell. Return `true` to say it handled
     * the change and the link should not navigate.
     *
     * This is why the tabs are links with an interceptor rather than buttons
     * with a handler: inside the editor, switching to Map must not be a real
     * navigation — it would tear down the Hocuspocus socket and rebuild the
     * Y.Doc every time — but from the public orders page there is no shell to
     * switch inside, and the same strip has to work as ordinary links. Links
     * also restore middle-click and open-in-new-tab, which the buttons this
     * replaced had quietly taken away.
     */
    onSwitch?: (tab: OperationTab) => boolean
}

/**
 * The operation's view strip: Orders, Map, Schedule, Attendance.
 *
 * Rendered by the editor's header and by the public orders page, so a reader
 * and an author are looking at the same four names in the same order — the
 * editor is a mode of this page, not a different place.
 */
export default function OperationTabs({ operationId, active, canEdit, access, editing = false, onSwitch }: Props) {
    const tabs = visibleTabs(access)
    /*
     * Orders is the only tab with a menu, and only once you are already on it.
     * Reading and writing the orders are two modes of one view, which is what
     * the menu says out loud — the other three tabs have no second mode, so a
     * caret on them would be an affordance for nothing.
     */
    const showMenu = canEdit && active === 'orders'

    /*
     * Orders remembers which of its two modes you were in.
     *
     * Switch to Map while editing and come back, and you land back in the
     * editor — the socket is still up and the tab strip is the same strip, so
     * dumping you into the read-only page would be undoing a choice you never
     * made. Where you *are* is the answer whenever Orders is the active tab;
     * everywhere else it comes out of session storage.
     *
     * It starts at `read`, which is what the server renders, so the remembered
     * value only ever arrives after mount and only ever changes an href.
     */
    const [ordersMode, setOrdersMode] = useState<OrdersMode>('read')

    useEffect(() => {
        if (!canEdit) return setOrdersMode('read')
        if (active === 'orders') {
            const mode: OrdersMode = editing ? 'edit' : 'read'
            rememberOrdersMode(operationId, mode)
            return setOrdersMode(mode)
        }
        setOrdersMode(readOrdersMode(operationId))
    }, [canEdit, active, editing, operationId])

    const ordersHref = canEdit && ordersMode === 'edit'
        ? editHref(operationId)
        : tabHref(operationId, 'orders')

    const [open, setOpen] = useState(false)
    const slotRef = useRef<HTMLSpanElement>(null)
    const caretRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    // The menu closes when the tab that owns it goes away, so an in-shell
    // switch to Map cannot leave it hanging open over the wrong tab.
    useEffect(() => {
        if (!showMenu) setOpen(false)
    }, [showMenu])

    useEffect(() => {
        if (!open) return

        const onPointerDown = (e: PointerEvent) => {
            if (!slotRef.current?.contains(e.target as Node)) setOpen(false)
        }
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            setOpen(false)
            caretRef.current?.focus()
        }

        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('pointerdown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [open])

    /** Arrow keys walk the items; two of them do not need more than a wrap-around. */
    const moveFocus = (delta: number) => {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
        if (!items.length) return
        const at = items.findIndex(el => el === document.activeElement)
        items[(at + delta + items.length) % items.length]?.focus()
    }

    return (
        <nav className={s.tabsRow} aria-label='Operation views'>
            {tabs.map(t => {
                const hasMenu = t === 'orders' && showMenu

                return (
                    /*
                     * Each tab gets a slot. It shrink-wraps its tab, which is what
                     * anchors the menu: `left: 0` on the menu is the tab's own left
                     * edge, with nothing measured and nothing to drift when the
                     * font loads.
                     *
                     * The caret is the tab's *sibling* inside that slot rather than
                     * its child, because a button inside an anchor is invalid markup
                     * that browsers unnest on you — and because clicking the label
                     * itself should still just open the orders.
                     */
                    <span
                        key={t}
                        className={`${s.tabSlot} ${t === active ? s.tabSlotOn : ''}`}
                        ref={hasMenu ? slotRef : undefined}
                    >
                        <Link
                            href={t === 'orders' ? ordersHref : tabHref(operationId, t)}
                            aria-current={t === active ? 'page' : undefined}
                            className={`${s.tab} ${t === active ? s.tabOn : ''} ${hasMenu ? s.tabSplit : ''}`}
                            onClick={e => {
                                // Never swallow a deliberate new-tab or new-window click.
                                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                                /*
                                 * Orders is the one tab that can leave the shell. In
                                 * edit mode it is the editor's own view and stays in,
                                 * socket and all; in read mode it really is a
                                 * different page, so the link is left to navigate.
                                 */
                                if (t === 'orders' && ordersMode !== 'edit') return
                                if (onSwitch?.(t)) e.preventDefault()
                            }}
                        >
                            {TAB_LABELS[t].toUpperCase()}
                        </Link>

                        {hasMenu && (
                            <>
                                <button
                                    ref={caretRef}
                                    type='button'
                                    className={`${s.caret} ${open ? s.caretOn : ''}`}
                                    aria-haspopup='menu'
                                    aria-expanded={open}
                                    aria-label='Orders options'
                                    title='Read or edit the orders'
                                    onClick={() => setOpen(v => !v)}
                                    onKeyDown={e => {
                                        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                                        e.preventDefault()
                                        setOpen(true)
                                        // The menu has to be mounted before it can take focus.
                                        requestAnimationFrame(() => moveFocus(e.key === 'ArrowDown' ? 0 : -1))
                                    }}
                                >
                                    <span aria-hidden>▾</span>
                                </button>

                                {open && (
                                    <div
                                        ref={menuRef}
                                        className={s.menu}
                                        role='menu'
                                        aria-label='Orders'
                                        onKeyDown={e => {
                                            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                                            e.preventDefault()
                                            moveFocus(e.key === 'ArrowDown' ? 1 : -1)
                                        }}
                                    >
                                        <Link
                                            href={tabHref(operationId, 'orders')}
                                            role='menuitem'
                                            className={`${s.item} ${editing ? '' : s.itemOn}`}
                                            aria-current={editing ? undefined : 'true'}
                                            onClick={() => setOpen(false)}
                                        >
                                            <span className={s.tick} aria-hidden>{editing ? '' : '✓'}</span>
                                            Read
                                        </Link>
                                        <Link
                                            href={editHref(operationId)}
                                            role='menuitem'
                                            className={`${s.item} ${editing ? s.itemOn : ''}`}
                                            aria-current={editing ? 'true' : undefined}
                                            onClick={() => setOpen(false)}
                                        >
                                            <span className={s.tick} aria-hidden>{editing ? '✓' : ''}</span>
                                            Edit
                                        </Link>
                                    </div>
                                )}
                            </>
                        )}
                    </span>
                )
            })}
        </nav>
    )
}
