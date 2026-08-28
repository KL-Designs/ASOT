'use client'

import Link from 'next/link'
import { editHref, tabHref, TAB_LABELS, visibleTabs, type OperationTab } from './tabs'
import s from './tabs.module.css'

interface Props {
    operationId: string
    active: OperationTab
    /** Drives Schedule/Attendance visibility *and* whether the ribbon appears. */
    canEdit: boolean
    /** True on `/edit` — the ribbon then offers the way back out. */
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
export default function OperationTabs({ operationId, active, canEdit, editing = false, onSwitch }: Props) {
    const tabs = visibleTabs(canEdit)
    const showRibbon = canEdit && active === 'orders'

    return (
        <nav className={s.tabsRow} aria-label='Operation views'>
            {tabs.map(t => (
                /*
                 * Each tab gets a slot, and the slot is what the ribbon measures
                 * against. It shrink-wraps its tab, so `left: 0; right: 0` on the
                 * ribbon is the tab's exact width — at any font size, in any
                 * language, with nothing measured and nothing to drift.
                 *
                 * The ribbon is the slot's *sibling* of the tab rather than its
                 * child because both are links, and an anchor inside an anchor is
                 * invalid markup that browsers unnest on you.
                 */
                <span key={t} className={s.tabSlot}>
                    <Link
                        href={tabHref(operationId, t)}
                        aria-current={t === active ? 'page' : undefined}
                        className={t === active ? `${s.tab} ${s.tabOn}` : s.tab}
                        onClick={e => {
                            // Never swallow a deliberate new-tab or new-window click.
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                            if (onSwitch?.(t)) e.preventDefault()
                        }}
                    >
                        {TAB_LABELS[t].toUpperCase()}
                    </Link>

                    {t === 'orders' && showRibbon && (
                        <Link
                            href={editing ? tabHref(operationId, 'orders') : editHref(operationId)}
                            className={`${s.ribbon} ${editing ? s.ribbonOut : ''}`}
                            title={editing ? 'Stop editing and read the orders' : 'Open the orders in the editor'}
                        >
                            {editing ? '✓ Done' : '✎ Edit'}
                        </Link>
                    )}
                </span>
            ))}
        </nav>
    )
}
