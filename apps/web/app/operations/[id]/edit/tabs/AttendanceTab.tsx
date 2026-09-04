'use client'

import { useCallback, useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import TabPanel from './TabPanel'
import AttendanceBoard from '@/components/operations/board/AttendanceBoard'
import ConfirmDialog from '@/components/confirm-dialog'
import type { TurnoutKey } from '@/lib/attendance/simulate'
import { DEV_TOOLS_ENABLED } from '@/lib/dev-tools'

interface AckEntry { userId: string; userName: string; acknowledgedAt: string }

interface Props {
    opID: string
    status: string

    platoons: { id: string; label: string }[]
    selected: string[]
    onToggle: (id: string) => void

    customUnits: { id: string; name: string; color?: string }[]
    onAddCustomUnit: (name: string, color?: string) => void
    onRemoveCustomUnit: (id: string) => void
    customUnitsSaving: boolean

    discordPingEnabled: boolean
    onTogglePing: () => void
    discordPingRoles: string[]
    onChangeDiscordPingRoles: (roles: string[]) => void

    ackCount: number
    ackList: AckEntry[]

    operationName: string
    operationWhen: string
    myUserId: string | null
    canManageAttendance: boolean
}

/**
 * The three nights the generator can produce. A single fixed rate only ever
 * showed one board, and the two ends are the interesting ones: a quiet night is
 * mostly gaps, a busy one fills nearly every position and overflows the pool.
 */
const TURNOUTS: { key: TurnoutKey; label: string; hint: string; color: string }[] = [
    { key: 'quiet', label: 'Quiet Night', hint: 'Thin turnout, most positions unfilled', color: 'var(--crit)' },
    { key: 'medium', label: 'Ordinary Night', hint: 'A normal Saturday', color: 'var(--warn)' },
    { key: 'busy', label: 'Busy Night', hint: 'Full sections and a deep pool', color: 'var(--good)' },
]

const PING_ROLE_OPTS = [
    { id: '@everyone', label: '@everyone' },
    { id: '@here', label: '@here' },
    { id: '@friend of unit', label: '@friend of unit' },
    { id: '@veteran member', label: '@veteran member' },
]

const labelStyle: CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
    color: 'var(--ink-3)', marginBottom: 8,
}

function chipStyle(selected: boolean): CSSProperties {
    return {
        display: 'inline-flex', alignItems: 'center', gap: 7,
        border: `1px solid ${selected ? 'rgba(var(--acc-rgb), 0.42)' : 'var(--line-2)'}`,
        background: 'var(--s2)', borderRadius: 'var(--r)', padding: '6px 10px',
        fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: selected ? 'var(--ink)' : 'var(--ink-2)', cursor: 'pointer',
    }
}

function dotStyle(background: string): CSSProperties {
    return { width: 5, height: 5, borderRadius: 1, display: 'block', flexShrink: 0, background }
}

/**
 * Everything attendance-related for an operation, in one place: who is
 * assigned, who gets pinged, and who has acknowledged.
 *
 * Unit assignment and the Discord ping master toggle used to live in a deck
 * card (`deck/AttendanceCard.tsx`) while the per-role ping targets that toggle
 * gates lived here — a staging split left over from the editor rebuild rather
 * than a deliberate one. It forced this tab to tell the reader to go flip a
 * switch over in the sidebar before the roles below it would do anything. Both
 * halves are panels of this tab now and the deck has no attendance card at all.
 *
 * `isHQ` gating is the caller's job (page.tsx / EditorShell) — this component
 * assumes it's safe to render.
 */
export default function AttendanceTab({
    opID, status,
    platoons, selected, onToggle,
    customUnits, onAddCustomUnit, onRemoveCustomUnit, customUnitsSaving,
    discordPingEnabled, onTogglePing, discordPingRoles, onChangeDiscordPingRoles,
    ackCount, ackList,
    operationName, operationWhen, myUserId, canManageAttendance,
}: Props) {
    // The setup panels wait for the board. They are the small print under a
    // wide, slow surface, and rendering them first meant the page arrived as a
    // form that then got shoved a screen down when the board landed on top of
    // it. The board reports ready however its first load settles — including on
    // an error or an empty roster, since the Rebuild button down here is the
    // fix for both of those.
    const [boardReady, setBoardReady] = useState(false)
    // Stable identity: AttendanceBoard is memoised, and an inline arrow here
    // would defeat that on every render of this tab.
    const onBoardReady = useCallback(() => setBoardReady(true), [])
    const reduced = useReducedMotion()

    const [ackExpanded, setAckExpanded] = useState(false)
    const [remindSaving, setRemindSaving] = useState(false)
    const [remindSent, setRemindSent] = useState<number | null>(null)

    const [addOpen, setAddOpen] = useState(false)
    const [name, setName] = useState('')
    const [color, setColor] = useState('#6366f1')

    // Re-snapshot: the escape hatch for a roster that no longer matches the
    // units below it. Destructive, so it is confirmed rather than instant, and
    // the board is told to reload because a write made from here does not bump
    // the revision its live channel watches.
    const [resetOpen, setResetOpen] = useState(false)
    const [resetting, setResetting] = useState(false)
    const [resetError, setResetError] = useState<string | null>(null)
    const [boardReloadKey, setBoardReloadKey] = useState(0)

    // Dev tooling. The route reads the same flag and refuses regardless; this
    // only decides whether the button is worth rendering. See lib/dev-tools.ts
    // for why `NODE_ENV` alone cannot answer this for a built site.
    const isDev = DEV_TOOLS_ENABLED
    const [simulating, setSimulating] = useState<TurnoutKey | null>(null)
    const [simResult, setSimResult] = useState<string | null>(null)

    async function generateData(turnout: TurnoutKey) {
        setSimulating(turnout)
        setSimResult(null)
        try {
            const res = await fetch(`/api/operations/${opID}/attendance/simulate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ turnout }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) setSimResult(json.error ?? 'Could not generate data.')
            else {
                setSimResult(`${TURNOUTS.find(t => t.key === turnout)!.label} · ${json.answered} answered · ${json.placed} placed · ${json.reservists} reservists in play`)
                setBoardReloadKey(k => k + 1)
            }
        } catch {
            setSimResult('Could not reach the server.')
        } finally {
            setSimulating(null)
        }
    }

    async function resetBoard() {
        setResetting(true)
        setResetError(null)
        try {
            const res = await fetch(`/api/operations/${opID}/attendance/roster`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'resnapshot' }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) setResetError(json.error ?? 'Could not rebuild the board.')
            else setBoardReloadKey(k => k + 1)
        } catch {
            setResetError('Could not reach the server.')
        } finally {
            setResetting(false)
            setResetOpen(false)
        }
    }

    function submitAdd() {
        if (!name.trim()) return
        onAddCustomUnit(name.trim(), color || undefined)
        setName('')
        setAddOpen(false)
    }

    function toggleRole(id: string) {
        const updated = discordPingRoles.includes(id)
            ? discordPingRoles.filter(r => r !== id)
            : [...discordPingRoles, id]
        onChangeDiscordPingRoles(updated)
    }

    return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
            {/*
                The board is not *in* this tab so much as it *is* it: no panel
                frame, no title bar, no page padding. It carries its own header,
                stat strip and toolbar, so wrapping it in a titled container put
                chrome around chrome and cost it width a 70-position roster with
                a docked pool rail cannot spare.

                The setup panels below stay in a container at a reading measure,
                because they are forms and forms want to be narrow.
            */}
            <AttendanceBoard
                operationId={opID}
                operationName={operationName}
                operationWhen={operationWhen}
                myUserId={myUserId}
                canManage={canManageAttendance}
                reloadKey={boardReloadKey}
                onReady={onBoardReady}
            />

            {boardReady && (
            <motion.div
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.2, 0.9, 0.3, 1] }}
                style={{ width: '100%', maxWidth: 1220, padding: 'clamp(1.5rem, 2.5vw, 2.5rem)', display: 'flex', flexDirection: 'column', gap: 20 }}
            >
            <TabPanel title='Assigned Units'>
                <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {platoons.map(p => {
                            const isSel = selected.includes(p.id)
                            return (
                                <button key={p.id} type='button' onClick={() => onToggle(p.id)} style={chipStyle(isSel)}>
                                    <i style={dotStyle(isSel ? 'var(--acc)' : 'var(--ink-3)')} />
                                    {p.label}
                                </button>
                            )
                        })}
                        {customUnits.map(u => (
                            <span key={u.id} style={chipStyle(true)}>
                                <i style={dotStyle(u.color ?? 'var(--acc)')} />
                                {u.name}
                                <button
                                    type='button'
                                    disabled={customUnitsSaving}
                                    onClick={() => onRemoveCustomUnit(u.id)}
                                    aria-label={`Remove ${u.name}`}
                                    style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 0, fontSize: 10, lineHeight: 1 }}
                                >✕</button>
                            </span>
                        ))}
                        <button type='button' onClick={() => setAddOpen(v => !v)} style={{ ...chipStyle(false), borderStyle: 'dashed' }}>
                            + Custom Unit
                        </button>
                    </div>

                    {canManageAttendance && (
                        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <button
                                type='button'
                                disabled={resetting}
                                onClick={() => { setResetError(null); setResetOpen(true) }}
                                style={{
                                    ...chipStyle(false),
                                    borderColor: 'rgba(192,90,72,0.45)',
                                    color: 'var(--crit)',
                                    opacity: resetting ? 0.5 : 1,
                                }}
                            >
                                {resetting ? 'Rebuilding…' : 'Rebuild Attendance Board'}
                            </button>
                            <span style={{ fontSize: '0.68rem', color: 'var(--ink-3)', lineHeight: 1.5, maxWidth: 460 }}>
                                Takes a fresh snapshot of the ORBAT for the units above. Use it when the
                                assigned units change after sign-ups have opened — it discards every placement.
                            </span>
                            {resetError && (
                                <span style={{ fontSize: '0.68rem', color: 'var(--crit)' }}>{resetError}</span>
                            )}
                        </div>
                    )}

                    <ConfirmDialog
                        open={resetOpen}
                        danger
                        title='Rebuild the attendance board?'
                        message={`Every position on the board will be cut fresh from the ORBAT as it stands now.

All current placements are lost: members who claimed a position, anyone staff placed by hand, and every added position. Members who said they are attending return to the reservist pool.

Sign-up answers themselves are kept.`}
                        confirmLabel='Rebuild'
                        onConfirm={resetBoard}
                        onCancel={() => setResetOpen(false)}
                    />

                    {addOpen && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, maxWidth: 420 }}>
                            <input
                                autoFocus
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder='Unit name…'
                                maxLength={40}
                                onKeyDown={e => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') setAddOpen(false) }}
                                style={{ flex: 1, background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)', color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 11, padding: '5px 8px', outline: 'none' }}
                            />
                            <input
                                type='color'
                                value={color}
                                onChange={e => setColor(e.target.value)}
                                title='Unit colour'
                                style={{ width: 26, height: 26, padding: 2, background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)', cursor: 'pointer' }}
                            />
                            <button
                                type='button'
                                disabled={!name.trim() || customUnitsSaving}
                                onClick={submitAdd}
                                style={{ border: '1px solid var(--line-2)', background: 'var(--s2)', borderRadius: 'var(--r)', color: 'var(--ink-2)', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 9px', cursor: 'pointer', opacity: (!name.trim() || customUnitsSaving) ? 0.5 : 1 }}
                            >Add</button>
                        </div>
                    )}
                </div>
            </TabPanel>

            <TabPanel title='Notifications'>
                <div style={{ padding: 16 }}>
                    {/* The master toggle sits directly above the roles it gates —
                        the point of moving it here. Its off-state message below
                        can now name a control on this same screen. */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, maxWidth: 420 }}>
                        <span style={{ ...labelStyle, marginBottom: 0 }}>Discord Ping</span>
                        <button
                            type='button'
                            onClick={onTogglePing}
                            aria-pressed={discordPingEnabled}
                            aria-label='Discord ping'
                            style={{
                                width: 32, height: 18, borderRadius: 9, cursor: 'pointer',
                                border: 'none', position: 'relative', padding: 0, flexShrink: 0,
                                background: discordPingEnabled ? 'var(--good)' : 'var(--s3)',
                                transition: 'background 0.15s',
                            }}
                        >
                            <span style={{
                                position: 'absolute', top: 3, left: discordPingEnabled ? 17 : 3,
                                width: 12, height: 12, borderRadius: '50%', background: 'var(--bg)',
                                transition: 'left 0.15s',
                            }} />
                        </button>
                    </div>

                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                        <div style={labelStyle}>Discord Ping Roles</div>
                        {discordPingEnabled ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {PING_ROLE_OPTS.map(role => {
                                    const checked = discordPingRoles.includes(role.id)
                                    return (
                                        <button key={role.id} type='button' onClick={() => toggleRole(role.id)} style={chipStyle(checked)}>
                                            {checked && (
                                                <svg width='11' height='11' viewBox='0 0 12 12' fill='none'>
                                                    <path d='M2 6l3 3 5-5' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
                                                </svg>
                                            )}
                                            {role.label}
                                        </button>
                                    )
                                })}
                            </div>
                        ) : (
                            <div style={{ fontSize: '0.72rem', color: 'var(--ink-3)', fontStyle: 'italic' }}>
                                Enable Discord ping to choose roles.
                            </div>
                        )}
                    </div>
                </div>
            </TabPanel>

            {status === 'Upcoming' && (
                <TabPanel title='Acknowledgements'>
                    <div style={{ padding: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: ackExpanded ? 10 : 0 }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>Orders Acknowledged</span>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: ackCount > 0 ? 'var(--good)' : 'var(--ink-3)' }}>{ackCount} staff</span>
                            <button type='button' onClick={() => setAckExpanded(v => !v)} style={{ fontSize: '0.58rem', background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: '0 4px' }}>{ackExpanded ? '▲ Hide' : '▼ Show'}</button>
                            <button type='button' disabled={remindSaving} onClick={async () => {
                                setRemindSaving(true)
                                try {
                                    const res = await fetch(`/api/operations/${opID}/remind`, { method: 'POST' })
                                    if (res.ok) { const d = await res.json(); setRemindSent(d.sent ?? 0) }
                                } finally { setRemindSaving(false) }
                            }}
                                style={{ marginLeft: 'auto', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', padding: '3px 10px', borderRadius: 'var(--r)', background: remindSaving ? 'var(--s1)' : 'var(--s2)', border: '1px solid var(--acc)', color: remindSaving ? 'var(--ink-3)' : 'var(--acc)', cursor: remindSaving ? 'not-allowed' : 'pointer' }}
                            >
                                {remindSaving ? 'Sending…' : remindSent !== null ? `Sent (${remindSent})` : 'Remind Unacknowledged'}
                            </button>
                        </div>
                        {ackExpanded && ackList.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {ackList.map(a => (
                                    <div key={a.userId} style={{ fontSize: '0.58rem', padding: '3px 8px', borderRadius: 'var(--r)', background: 'var(--s2)', border: '1px solid var(--good)', color: 'var(--good)' }}>
                                        {a.userName} <span style={{ opacity: 0.6 }}>{new Date(a.acknowledgedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {ackExpanded && ackList.length === 0 && (
                            <div style={{ fontSize: '0.6rem', color: 'var(--ink-3)', fontStyle: 'italic' }}>No staff have acknowledged yet.</div>
                        )}
                    </div>
                </TabPanel>
            )}

            {/*
                Development only, and last on the page — it is a workbench, not
                part of the operation. The route refuses outside development too;
                this only decides whether the button is worth rendering.
            */}
            {isDev && canManageAttendance && (
                <TabPanel title='Developer'>
                    <div style={{ padding: 16 }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--ink-3)', lineHeight: 1.5, display: 'block', maxWidth: 640 }}>
                            Fills the board with plausible attendance using real members — some attending,
                            some not, some never replying, reservists filling in from other sections, and
                            others waiting in the pool with and without a preference. Pick how well the
                            night turns out: the two ends are what the layout has to survive.
                            <b style={{ color: 'var(--warn)' }}> Overwrites every sign-up on this operation.</b>
                        </span>

                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                            {TURNOUTS.map(t => (
                                <button
                                    key={t.key}
                                    type='button'
                                    disabled={!!simulating}
                                    onClick={() => generateData(t.key)}
                                    title={t.hint}
                                    style={{
                                        ...chipStyle(false),
                                        borderStyle: 'dashed',
                                        flexDirection: 'column',
                                        alignItems: 'flex-start',
                                        gap: 3,
                                        padding: '7px 11px',
                                        opacity: simulating && simulating !== t.key ? 0.4 : 1,
                                    }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                        <i style={dotStyle(t.color)} />
                                        {simulating === t.key ? 'Generating…' : t.label}
                                    </span>
                                    <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 9.5, color: 'var(--ink-3)' }}>
                                        {t.hint}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {simResult && (
                            <div style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--ink-2)', marginTop: 12 }}>
                                {simResult}
                            </div>
                        )}
                    </div>
                </TabPanel>
            )}
            </motion.div>
            )}
        </div>
    )
}
