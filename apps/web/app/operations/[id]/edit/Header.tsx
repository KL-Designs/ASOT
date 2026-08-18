'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useOperationStatus } from './hooks/useOperationStatus'
import { TABS, TAB_LABELS, type EditorTab } from './EditorShell'
import { useThinScrollFade } from '@/components/editor/useThinScrollFade'
import styles from './shell.module.css'

export type SaveStatus = 'saved' | 'saving' | 'unsaved'

interface HeaderProps {
    operationId: string
    fromJ2: boolean
    title: string
    /** The operation's own lifecycle status — Upcoming / Active / Completed / In Development. */
    status: string
    /** The document save state — distinct from `status` above. */
    saveStatus: SaveStatus
    isHQ: boolean
    onDelete: () => void
    activityOpen: boolean
    onToggleActivity: () => void
    publishConfirmOpen: boolean
    publishSaving: boolean
    onPublishClick: () => void
    onPublishConfirm: () => void
    onPublishCancel: () => void
    /** The section tabs (Brief/Map/Development/Attendance), rendered inline
     * in this same row (spec §3) rather than in a separate bar underneath —
     * EditorShell still owns which tab's *content* is on screen (it needs
     * that regardless of where the buttons live), so this component mirrors
     * its `visibleTabs`/fallback logic rather than importing a decision from
     * it, to keep this a plain, self-contained header. */
    tab: EditorTab
    onTabChange: (t: EditorTab) => void
}

// Token-backed; translucent fills use the same hex→rgb the tokens carry
// (styles/command.css doesn't expose *-rgb triplets for good/warn/crit, only --acc).
const STATUS_COLOR: Record<string, string> = {
    'Active': 'var(--good)',
    'Upcoming': 'var(--warn)',
    'Completed': 'var(--ink-3)',
    'In Development': 'var(--crit)',
}

const SAVE_COPY: Record<SaveStatus, { label: string; color: string }> = {
    saved: { label: 'Saved', color: 'var(--good)' },
    saving: { label: 'Saving…', color: 'var(--warn)' },
    unsaved: { label: 'Unsaved', color: 'var(--crit)' },
}

const menuItemStyle: CSSProperties = {
    display: 'block',
    padding: '7px 10px',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: 'var(--ink-2)',
    textDecoration: 'none',
    borderRadius: 2,
    background: 'none',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
}

export default function Header({
    operationId, fromJ2, title, status, saveStatus, isHQ,
    onDelete, activityOpen, onToggleActivity,
    publishConfirmOpen, publishSaving, onPublishClick, onPublishConfirm, onPublishCancel,
    tab, onTabChange,
}: HeaderProps) {
    // Supplementary real data (not fabricated) for the status pill's countdown —
    // the pill's colour/label still comes from `status` above, which updates
    // immediately on local edits; this hook polls every 30s so it's used only
    // for the "T-Nd" addendum, never as the source of truth for the pill itself.
    const { daysUntil } = useOperationStatus(operationId)

    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const tabsRowFadeRef = useThinScrollFade<HTMLElement>()

    useEffect(() => {
        if (!menuOpen) return
        const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false) }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [menuOpen])

    const statusColor = STATUS_COLOR[status] ?? 'var(--ink-3)'
    const save = SAVE_COPY[saveStatus]
    const showPublish = isHQ && status === 'In Development'

    // Same visibility/fallback rule as EditorShell's own `visibleTabs`/
    // `active` (EditorShell.tsx) — kept in sync by construction since both
    // read the same `TABS` constant and the same `tab`/`isHQ` props page.tsx
    // passes to each. Attendance absent from the DOM entirely for non-HQ
    // users, not merely disabled (spec §1's gate).
    const visibleTabs = TABS.filter(t => t !== 'attendance' || isHQ)
    const activeTab = visibleTabs.includes(tab) ? tab : 'brief'

    return (
        <div style={{
            display: 'flex', alignItems: 'center',
            gap: 16, padding: '0 16px', height: 52, flexShrink: 0,
            borderBottom: '1px solid var(--line)',
            background: 'var(--s1)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flexShrink: 1 }}>
                <Link
                    href={fromJ2 ? '/dashboard/j2' : '/operations'}
                    style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)', textDecoration: 'none', flexShrink: 0 }}
                >
                    {fromJ2 ? '← J2 Operations' : '← Back'}
                </Link>
                <div style={{ width: 1, height: 14, background: 'var(--line)', flexShrink: 0 }} />
                <span style={{
                    fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.02em',
                    color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {title || 'Untitled Operation'}
                </span>
                <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: statusColor, border: `1px solid ${statusColor}`, borderRadius: 'var(--r)',
                    padding: '2px 8px',
                }}>
                    {status || 'Unknown'}
                    {status === 'Upcoming' && daysUntil !== null && <span style={{ opacity: 0.7 }}> · T-{daysUntil}d</span>}
                </span>
            </div>

            {/* Same divider style as the one between the back crumb and the
                title above — separates the title/pill group from the tabs. */}
            <div style={{ width: 1, height: 14, background: 'var(--line)', flexShrink: 0 }} />

            <nav ref={tabsRowFadeRef} className={`${styles.tabsRow} thin-scroll`} aria-label='Operation editor sections'>
                {visibleTabs.map(t => (
                    <button
                        key={t}
                        type='button'
                        onClick={() => onTabChange(t)}
                        aria-current={t === activeTab ? 'page' : undefined}
                        className={t === activeTab ? `${styles.tab} ${styles.tabOn}` : styles.tab}
                    >
                        {TAB_LABELS[t].toUpperCase()}
                    </button>
                ))}
            </nav>

            {/* Flexible spacer — pushes the save state / Publish / overflow
                cluster to the row's end regardless of how much room the
                title and tabs are currently taking. */}
            <div style={{ flex: 1, minWidth: 0 }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: save.color }}>
                    ● {save.label}
                </span>

                {showPublish && (
                    publishConfirmOpen ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: 'color-mix(in srgb, var(--good) 10%, transparent)', border: '1px solid var(--good)', borderRadius: 'var(--r)' }}>
                            <span style={{ fontSize: '0.6rem', color: 'var(--good)', fontWeight: 700, letterSpacing: '0.1em' }}>Publish "{title || 'this op'}"?</span>
                            <button type='button' disabled={publishSaving} onClick={onPublishConfirm}
                                style={{ padding: '4px 10px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', background: 'color-mix(in srgb, var(--good) 22%, transparent)', border: '1px solid var(--good)', color: 'var(--good)', cursor: 'pointer', borderRadius: 'var(--r)' }}
                            >{publishSaving ? 'Publishing…' : '✓ Confirm'}</button>
                            <button type='button' onClick={onPublishCancel}
                                style={{ padding: '4px 8px', fontSize: '0.6rem', fontWeight: 700, background: 'none', border: '1px solid var(--line-2)', color: 'var(--ink-3)', cursor: 'pointer', borderRadius: 'var(--r)' }}
                            >Cancel</button>
                        </div>
                    ) : (
                        <button type='button' onClick={onPublishClick}
                            style={{
                                padding: '6px 14px', background: 'color-mix(in srgb, var(--good) 8%, transparent)',
                                border: '1px solid var(--good)', color: 'var(--good)',
                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                                cursor: 'pointer', borderRadius: 'var(--r)',
                            }}
                        >↑ Publish</button>
                    )
                )}

                <div ref={menuRef} style={{ position: 'relative' }}>
                    <button
                        type='button'
                        onClick={() => setMenuOpen(v => !v)}
                        aria-haspopup='menu'
                        aria-expanded={menuOpen}
                        title='More actions'
                        style={{
                            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: menuOpen ? 'var(--s2)' : 'transparent',
                            border: `1px solid ${menuOpen ? 'var(--line-2)' : 'var(--line)'}`,
                            color: 'var(--ink-2)', cursor: 'pointer', borderRadius: 'var(--r)', fontSize: '1rem', lineHeight: 1,
                        }}
                    >⋮</button>

                    {menuOpen && (
                        <div role='menu' style={{
                            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100,
                            background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)',
                            minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                            display: 'flex', flexDirection: 'column', padding: 4,
                        }}>
                            <Link href={`/operations/${operationId}`} onClick={() => setMenuOpen(false)} style={menuItemStyle}>
                                View Operation →
                            </Link>
                            <Link href={`/operations/${operationId}/map`} onClick={() => setMenuOpen(false)} style={menuItemStyle}>
                                Map ↗
                            </Link>
                            <button type='button' onClick={() => { onToggleActivity(); setMenuOpen(false) }}
                                style={{ ...menuItemStyle, background: activityOpen ? 'var(--s3)' : 'none' }}
                            >
                                {activityOpen ? '✓ Activity' : 'Activity'}
                            </button>
                            <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
                            <button type='button' onClick={() => { onDelete(); setMenuOpen(false) }}
                                style={{ ...menuItemStyle, color: 'var(--crit)' }}
                            >
                                Delete Mission
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
