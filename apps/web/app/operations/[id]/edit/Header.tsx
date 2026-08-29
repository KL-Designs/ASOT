'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useOperationStatus } from './hooks/useOperationStatus'
import OperationTabs from '../OperationTabs'
import type { OperationTab } from '../tabs'
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
    /**
     * Which tabs to offer, one capability each.
     *
     * **Each defaults to `isHQ`**, and that default is the point rather than a
     * convenience: this component renders the tab *links* while `EditorShell`
     * routes their content, so the two have to agree about which tabs exist. A
     * caller that has not been taught the capabilities yet gets what the editor
     * always did — one role, all four tabs — instead of a strip with holes in
     * it. That is the failure this shipped with: `visibleTabs` moved from a
     * `canEdit` boolean to a capability object, this file kept passing the
     * boolean, and Schedule, Attendance and AAR silently vanished from the
     * editor for everybody.
     */
    canSchedule?: boolean
    canAttendance?: boolean
    /** No `isHQ` default — the AAR tab does not exist until the operation has
     *  finished, so defaulting it on would offer a door onto an empty room. */
    canAar?: boolean
    onDelete: () => void
    activityOpen: boolean
    onToggleActivity: () => void
    publishConfirmOpen: boolean
    publishSaving: boolean
    onPublishClick: () => void
    onPublishConfirm: () => void
    onPublishCancel: () => void
    /** The operation's four views, rendered inline in this same row (spec §3)
     * rather than in a separate bar underneath. The strip itself is
     * `../OperationTabs`, shared with the public orders bar so a reader and an
     * author see the same four names; EditorShell still owns which tab's
     * *content* is on screen. `onTabChange` returns whether it handled the
     * switch in-shell — Orders does not, because it leaves the editor. */
    tab: OperationTab
    onTabChange: (t: OperationTab) => boolean
    /** True on `/edit`, which flips the ribbon under Orders to the way out. */
    editing?: boolean
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
    operationId, fromJ2, title, status, saveStatus, isHQ, canSchedule, canAttendance, canAar,
    onDelete, activityOpen, onToggleActivity,
    publishConfirmOpen, publishSaving, onPublishClick, onPublishConfirm, onPublishCancel,
    tab, onTabChange, editing = false,
}: HeaderProps) {
    // Supplementary real data (not fabricated) for the status pill's countdown —
    // the pill's colour/label still comes from `status` above, which updates
    // immediately on local edits; this hook polls every 30s so it's used only
    // for the "T-Nd" addendum, never as the source of truth for the pill itself.
    const { daysUntil } = useOperationStatus(operationId)

    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!menuOpen) return
        const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false) }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [menuOpen])

    const statusColor = STATUS_COLOR[status] ?? 'var(--ink-3)'
    const save = SAVE_COPY[saveStatus]
    const showPublish = isHQ && status === 'In Development'

    // Tab visibility and the active fallback live in ../tabs.ts now, applied by
    // OperationTabs below and by EditorShell's own `active` — one rule, read by
    // both, rather than the same filter written out twice and kept in step by
    // hand. Schedule and Attendance are absent from the DOM entirely without
    // edit access, not merely disabled (spec §1's gate).

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
                    /* Display-only caps. The name is stored and edited in
                       whatever case the author typed (see DetailsCard's title
                       field) — this only renders it uppercase to sit with the
                       mono all-caps chrome around it, so the two never
                       disagree about what the name actually is. */
                    fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.06em',
                    textTransform: 'uppercase',
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

            <OperationTabs
                operationId={operationId}
                active={tab}
                canEdit={isHQ}
                access={{
                    schedule: canSchedule ?? isHQ,
                    attendance: canAttendance ?? isHQ,
                    aar: canAar,
                }}
                editing={editing}
                onSwitch={onTabChange}
            />

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
