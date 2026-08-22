'use client'

import { useState, type CSSProperties } from 'react'
import type { Dayjs } from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'

type OrdersCheckTask = {
    _id?: string
    status: string
    ordersCheckAt?: string
    ordersCheckStatus?: string
    ordersCheckProposedAt?: string
    ordersCheckProposedBy?: string
}

interface Props {
    opID: string
    isJ2Lead: boolean
    title: string
    date: Dayjs | null
    isCampaignOp: boolean
    campaignStartDate: string | null
    /** Shared with the deck's CountdownStrip (page.tsx computes `checksDone`/
     * `checksTotal` off the same field) — lifted rather than owned locally so
     * the two stay in sync without a second fetch. */
    missionDev: MissionDevelopment | null
    setMissionDev: React.Dispatch<React.SetStateAction<MissionDevelopment | null>>
    /** Initialised from page.tsx's own load effect (`GET .../orders-check`),
     * so it's lifted the same way `missionDev` is rather than re-fetched here. */
    ordersCheckTask: OrdersCheckTask | null
    setOrdersCheckTask: React.Dispatch<React.SetStateAction<OrdersCheckTask | null>>
}

const CHECK_CONTENT: Record<'campaign' | 'single', Record<string, string[]>> = {
    campaign: {
        w16: ['Mission concept/idea submitted to J2', 'Initial discussion completed with team leads'],
        w12: ['Confirmed mission development has started', 'Initial planning document created', 'First mission scenario and orders started', 'J2 lead briefed on mission concept'],
        w10: ['Core framework and fundamentals established', 'First mission scenario and orders complete', 'Second and third missions started'],
        w8: ['Second and third missions complete', 'All subsequent missions started', 'All mission orders finalised'],
        w6: ['Final checks and revisions completed', 'Bug fixing pass completed', 'Server loadout and mission tested', 'Weekly Monday reminder sent (if any items incomplete)'],
        w4: ['Final development check completed', 'Arsenal and loadout updates confirmed'],
    },
    single: {
        w12: ['Mission concept/idea submitted to J2'],
        w10: ['Confirmed mission development has started', 'Mission scenario and orders started', 'J2 lead briefed on mission concept'],
        w8: ['Mission scenario and orders complete', 'Replacement mission arranged if not complete'],
        w6: ['Final checks and bug fixing completed', 'Server mission tested', 'Weekly Monday reminder sent (if any items incomplete)'],
        w4: ['Final development check completed', 'Arsenal and loadout updates confirmed'],
    },
}

const fieldStyle: CSSProperties = {
    width: '100%', background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)',
    color: 'var(--ink)', fontSize: '0.8rem', padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
}

const pickerSx = {
    '& .MuiInputBase-root': { background: 'var(--s2)', borderRadius: 'var(--r)', fontSize: '0.75rem' },
    '& .MuiOutlinedInput-notchedOutline': { border: '1px solid var(--line-2)' },
    '& .MuiInputBase-input': { color: 'var(--ink-2)', padding: '4px 8px' },
    '& .MuiSvgIcon-root': { color: 'var(--ink-3)', fontSize: 16 },
}

/**
 * Mission development gate timeline + its completion modal, and the Orders
 * Check Request block that lived inside the same collapsible panel — moved
 * out of page.tsx verbatim (Task 12): same endpoints, same fields, same
 * `isJ2Lead` gate, same collapsible-panel toggle. Only the colours changed,
 * from raw `rgba()` literals to the `--acc`/`--good`/`--warn`/token palette
 * every other file in this redesign uses.
 *
 * The six-step Mission Stage stepper that used to sit in the *other*
 * collapsible panel (Attendance Settings) is not here — it was already
 * superseded by the deck's StageCard (Task 10) and is retired outright, not
 * rehomed, per the design doc §9.
 */
export default function DevelopmentTab({
    opID, isJ2Lead, title, date, isCampaignOp, campaignStartDate,
    missionDev, setMissionDev, ordersCheckTask, setOrdersCheckTask,
}: Props) {
    const [open, setOpen] = useState(true)
    const [saving, setSaving] = useState(false)

    const [completingCheckId, setCompletingCheckId] = useState<string | null>(null)
    const [reviewerName, setReviewerName] = useState('')
    const [comments, setComments] = useState('')
    const [outcome, setOutcome] = useState('')

    const [ordersCheckModal, setOrdersCheckModal] = useState(false)
    const [ordersCheckPreferredAt, setOrdersCheckPreferredAt] = useState<Dayjs | null>(null)
    const [ordersCheckComments, setOrdersCheckComments] = useState('')
    const [ordersCheckSaving, setOrdersCheckSaving] = useState(false)
    const [ordersCheckCancelling, setOrdersCheckCancelling] = useState(false)
    const [ordersCheckReminderAt, setOrdersCheckReminderAt] = useState<Dayjs | null>(null)
    const [ordersCheckReminderSaving, setOrdersCheckReminderSaving] = useState(false)
    const [ordersCheckReminderSet, setOrdersCheckReminderSet] = useState(false)

    const baseDate = isCampaignOp && campaignStartDate
        ? new Date(campaignStartDate)
        : date?.toDate() ?? null
    if (!opID || !baseDate) return null

    const weeksList = isCampaignOp ? [16, 12, 10, 8, 6, 4] : [12, 10, 8, 6, 4]
    const now = new Date()
    const checks = weeksList.map(weeks => {
        const dueDate = new Date(baseDate.getTime() - weeks * 7 * 24 * 3600000)
        const completion = missionDev?.completions?.[`w${weeks}`]
        return {
            id: `w${weeks}`,
            label: `${weeks}W`,
            weeks,
            dueDate,
            isOverdue: now > dueDate && !completion,
            isCompleted: !!completion,
            completion,
        }
    })
    const allDone = checks.every(ch => ch.isCompleted)
    const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })

    async function saveCompletion(checkId: string) {
        setSaving(true)
        try {
            const res = await fetch(`/api/operations/${opID}/mission-development`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    checkId,
                    reviewerName: reviewerName.trim() || undefined,
                    comments: comments.trim() || undefined,
                    outcome: outcome.trim() || undefined,
                }),
            })
            const data = await res.json()
            if (data.ok) {
                setMissionDev(prev => ({
                    completions: { ...(prev?.completions ?? {}), [checkId]: data.completion },
                    lastUpdatedAt: new Date().toISOString(),
                }))
                setCompletingCheckId(null)
                setReviewerName('')
                setComments('')
                setOutcome('')
            }
        } finally {
            setSaving(false)
        }
    }

    async function removeCompletion(checkId: string) {
        setSaving(true)
        try {
            await fetch(`/api/operations/${opID}/mission-development?checkId=${checkId}`, { method: 'DELETE' })
            setMissionDev(prev => {
                if (!prev) return prev
                const next = { ...prev, completions: { ...prev.completions } }
                delete next.completions[checkId]
                return next
            })
        } finally {
            setSaving(false)
        }
    }

    return (
        <div style={{ width: '100%', maxWidth: 1220, margin: '0 auto', padding: 'clamp(1.5rem, 2.5vw, 2.5rem)' }}>
            <div style={{
                border: '1px solid var(--line)', borderTop: `2px solid ${allDone ? 'var(--good)' : 'rgba(var(--acc-rgb), 0.5)'}`,
                borderRadius: 'var(--r)', background: 'var(--s1)',
            }}>
                <button type='button' onClick={() => setOpen(v => !v)}
                    className='flex items-center justify-between px-4 py-3'
                    style={{
                        borderBottom: open ? '1px solid var(--line)' : 'none',
                        width: '100%', background: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: allDone ? 'var(--good)' : 'var(--ink-3)' }}>
                            Mission Development
                        </span>
                        {allDone && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--good)', letterSpacing: '0.1em' }}>✓ All Checks Complete</span>}
                        {!allDone && checks.some(ch => ch.isOverdue) && (
                            <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--warn)', border: '1px solid var(--warn)', borderRadius: 'var(--r)', padding: '2px 8px' }}>
                                {checks.filter(ch => ch.isOverdue).length} Overdue
                            </span>
                        )}
                        {saving && <span style={{ fontSize: '0.6rem', color: 'var(--acc)', fontWeight: 700 }}>Saving…</span>}
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>{open ? '[−]' : '[+]'}</span>
                </button>

                {open && (
                    <div style={{ padding: '20px 16px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 16 }}>
                            {checks.map((ch, i) => {
                                const nodeColor = ch.isCompleted ? 'var(--good)' : ch.isOverdue ? 'var(--warn)' : 'var(--s3)'
                                const borderClr = ch.isCompleted ? 'var(--good)' : ch.isOverdue ? 'var(--warn)' : 'var(--line-2)'
                                const labelClr = ch.isCompleted ? 'var(--good)' : ch.isOverdue ? 'var(--warn)' : 'var(--ink-3)'
                                const connectorColor = ch.isCompleted && checks[i + 1]?.isCompleted ? 'var(--good)' : 'var(--line)'
                                return (
                                    <div key={ch.id} style={{ display: 'flex', alignItems: 'flex-start', flex: i < checks.length - 1 ? 1 : undefined }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 52 }}>
                                            <button
                                                type='button'
                                                disabled={!isJ2Lead || saving}
                                                onClick={() => {
                                                    if (!isJ2Lead) return
                                                    if (ch.isCompleted) {
                                                        if (confirm(`Remove completion for ${ch.label} check?`)) removeCompletion(ch.id)
                                                    } else {
                                                        setCompletingCheckId(ch.id)
                                                        setReviewerName('')
                                                        setComments('')
                                                        setOutcome('')
                                                    }
                                                }}
                                                title={isJ2Lead ? (ch.isCompleted ? 'Click to remove completion' : 'Click to complete this check') : 'J2 leads only'}
                                                style={{
                                                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                                    background: nodeColor, border: `2px solid ${borderClr}`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: isJ2Lead ? 'pointer' : 'default',
                                                    padding: 0, transition: 'all 0.2s',
                                                }}
                                            >
                                                {ch.isCompleted && <span style={{ fontSize: 9, color: 'var(--bg)', lineHeight: 1 }}>✓</span>}
                                                {ch.isOverdue && !ch.isCompleted && <span style={{ fontSize: 9, color: 'var(--bg)', lineHeight: 1 }}>!</span>}
                                            </button>
                                            <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
                                                <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: labelClr }}>{ch.label}</div>
                                                <div style={{ fontSize: '0.48rem', color: 'var(--ink-3)', letterSpacing: '0.04em' }}>{fmtDate(ch.dueDate)}</div>
                                            </div>
                                            {ch.completion && (
                                                <div style={{ fontSize: '0.44rem', color: 'var(--good)', textAlign: 'center', lineHeight: 1.3, maxWidth: 50 }}>
                                                    {ch.completion.reviewerName}
                                                </div>
                                            )}
                                        </div>
                                        {i < checks.length - 1 && (
                                            <div style={{ flex: 1, height: 2, marginTop: 10, background: connectorColor }} />
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Legend */}
                        <div style={{ display: 'flex', gap: 16, fontSize: '0.55rem', color: 'var(--ink-3)' }}>
                            <span><span style={{ color: 'var(--good)' }}>●</span> Completed</span>
                            <span><span style={{ color: 'var(--warn)' }}>●</span> Overdue</span>
                            <span><span style={{ color: 'var(--line-2)' }}>●</span> Pending</span>
                            {!isJ2Lead && <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>J2 leads can complete checks</span>}
                            <span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>
                                {isCampaignOp ? 'Campaign — 6 checks from campaign start' : 'Single mission — 5 checks from op date'}
                            </span>
                        </div>

                        {/* Per-check detail rows for completed checks */}
                        {checks.filter(ch => ch.completion).length > 0 && (
                            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {checks.filter(ch => ch.completion).map(ch => (
                                    <div key={ch.id} style={{ padding: '8px 12px', background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--good)', letterSpacing: '0.08em' }}>{ch.label}</span>
                                            <span style={{ fontSize: '0.58rem', color: 'var(--ink-2)' }}>Reviewed by {ch.completion!.reviewerName}</span>
                                            <span style={{ fontSize: '0.55rem', color: 'var(--ink-3)', marginLeft: 'auto' }}>
                                                {new Date(ch.completion!.completedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        {ch.completion!.comments && (
                                            <div style={{ fontSize: '0.58rem', color: 'var(--ink-2)', paddingLeft: 2 }}>{ch.completion!.comments}</div>
                                        )}
                                        {ch.completion!.outcome && (
                                            <div style={{ fontSize: '0.58rem', color: 'var(--warn)', paddingLeft: 2 }}>Outcome: {ch.completion!.outcome}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Orders Check Request */}
                        <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                            {ordersCheckTask ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--acc)', marginBottom: 3 }}>
                                                Orders Check {ordersCheckTask.ordersCheckStatus === 'confirmed' ? '✓ Confirmed' : ordersCheckTask.ordersCheckStatus === 'proposed' ? '— Alternative Proposed' : '— Requested'}
                                            </div>
                                            {ordersCheckTask.ordersCheckAt && (
                                                <div style={{ fontSize: '0.68rem', color: 'var(--ink-2)' }}>
                                                    Requested: {new Date(ordersCheckTask.ordersCheckAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                                                </div>
                                            )}
                                            {ordersCheckTask.ordersCheckStatus === 'proposed' && ordersCheckTask.ordersCheckProposedAt && (
                                                <div style={{ fontSize: '0.65rem', color: 'var(--warn)', marginTop: 2 }}>
                                                    Alternative by {ordersCheckTask.ordersCheckProposedBy}: {new Date(ordersCheckTask.ordersCheckProposedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                                                </div>
                                            )}
                                        </div>
                                        {ordersCheckTask.ordersCheckStatus !== 'confirmed' && ordersCheckTask._id && (
                                            <button
                                                type='button'
                                                disabled={ordersCheckCancelling}
                                                onClick={async () => {
                                                    if (!confirm('Cancel this orders check request?')) return
                                                    setOrdersCheckCancelling(true)
                                                    try {
                                                        const res = await fetch(`/api/operations/${opID}/orders-check?taskId=${ordersCheckTask._id}`, { method: 'DELETE' })
                                                        if (res.ok) {
                                                            setOrdersCheckTask(null)
                                                            setOrdersCheckReminderSet(false)
                                                        } else {
                                                            const d = await res.json()
                                                            alert(d.error ?? 'Failed to cancel.')
                                                        }
                                                    } finally {
                                                        setOrdersCheckCancelling(false)
                                                    }
                                                }}
                                                style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 'var(--r)', background: 'none', border: '1px solid var(--crit)', color: 'var(--crit)', cursor: 'pointer', flexShrink: 0 }}
                                            >
                                                {ordersCheckCancelling ? '…' : 'Cancel Request'}
                                            </button>
                                        )}
                                    </div>

                                    {/* Reminder — shown after confirmation */}
                                    {ordersCheckTask.ordersCheckStatus === 'confirmed' && ordersCheckTask._id && (
                                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
                                                <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)', flexShrink: 0 }}>Remind me:</span>
                                                <DateTimePicker
                                                    value={ordersCheckReminderAt}
                                                    onChange={v => setOrdersCheckReminderAt(v)}
                                                    slotProps={{
                                                        textField: { size: 'small', sx: pickerSx },
                                                        popper: { sx: { zIndex: 19999 } },
                                                    }}
                                                />
                                                <button
                                                    type='button'
                                                    disabled={!ordersCheckReminderAt || ordersCheckReminderSaving}
                                                    onClick={async () => {
                                                        if (!ordersCheckReminderAt) return
                                                        setOrdersCheckReminderSaving(true)
                                                        try {
                                                            const res = await fetch(`/api/operations/${opID}/orders-check`, {
                                                                method: 'PATCH',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ taskId: ordersCheckTask._id, action: 'set_reminder', proposedAt: ordersCheckReminderAt.toISOString() }),
                                                            })
                                                            if (res.ok) { setOrdersCheckReminderSet(true) }
                                                            else { const d = await res.json(); alert(d.error ?? 'Failed.') }
                                                        } finally {
                                                            setOrdersCheckReminderSaving(false)
                                                        }
                                                    }}
                                                    style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 'var(--r)', background: ordersCheckReminderSet ? 'var(--s3)' : 'var(--s2)', border: `1px solid ${ordersCheckReminderSet ? 'var(--good)' : 'var(--acc)'}`, color: ordersCheckReminderSet ? 'var(--good)' : 'var(--acc)', cursor: 'pointer', flexShrink: 0 }}
                                                >
                                                    {ordersCheckReminderSet ? '✓ Set' : 'Set Reminder'}
                                                </button>
                                            </div>
                                        </LocalizationProvider>
                                    )}
                                </div>
                            ) : (
                                <button type='button' onClick={() => setOrdersCheckModal(true)}
                                    style={{
                                        fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                                        padding: '7px 16px', borderRadius: 'var(--r)', background: 'var(--s2)', border: '1px solid var(--acc)',
                                        color: 'var(--acc)', cursor: 'pointer',
                                    }}
                                >
                                    + Request Orders Check
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Completion modal */}
            {completingCheckId && (() => {
                const ch = checks.find(c => c.id === completingCheckId)
                if (!ch) return null
                return (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={e => { if (e.target === e.currentTarget) setCompletingCheckId(null) }}
                    >
                        <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderTop: '2px solid var(--good)', borderRadius: 'var(--r)', padding: '24px 28px', maxWidth: 500, width: '90%', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--good)', fontFamily: 'var(--mono)' }}>
                                {'// COMPLETE CHECK'}
                            </div>
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink)' }}>
                                {ch.label} Development Check
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--ink-2)' }}>
                                Due: {ch.dueDate.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })}
                                {ch.isOverdue && <span style={{ color: 'var(--warn)', marginLeft: 8 }}>● Overdue</span>}
                            </div>

                            {(() => {
                                const items = CHECK_CONTENT[isCampaignOp ? 'campaign' : 'single'][ch.id] ?? []
                                if (!items.length) return null
                                return (
                                    <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--good)', marginBottom: 4, fontFamily: 'var(--mono)' }}>
                                            Stage Checklist
                                        </div>
                                        {items.map((item, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                                <span style={{ fontSize: '0.6rem', color: 'var(--good)', marginTop: 1, flexShrink: 0 }}>◻</span>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--ink-2)', lineHeight: 1.45 }}>{item}</span>
                                            </div>
                                        ))}
                                    </div>
                                )
                            })()}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-2)', marginBottom: 6 }}>Reviewer Name</div>
                                    <input
                                        value={reviewerName}
                                        onChange={e => setReviewerName(e.target.value)}
                                        placeholder='Your name or assigned reviewer…'
                                        style={fieldStyle}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-2)', marginBottom: 6 }}>Comments</div>
                                    <textarea
                                        value={comments}
                                        onChange={e => setComments(e.target.value)}
                                        placeholder='Review notes, observations…'
                                        rows={3}
                                        style={{ ...fieldStyle, resize: 'vertical' }}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-2)', marginBottom: 6 }}>Outcome / Notes</div>
                                    <textarea
                                        value={outcome}
                                        onChange={e => setOutcome(e.target.value)}
                                        placeholder='Outcome, decisions made, action items…'
                                        rows={2}
                                        style={{ ...fieldStyle, resize: 'vertical' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                                <button type='button' onClick={() => setCompletingCheckId(null)}
                                    style={{ padding: '7px 18px', fontSize: '0.7rem', fontWeight: 700, borderRadius: 'var(--r)', background: 'none', border: '1px solid var(--line-2)', color: 'var(--ink-3)', cursor: 'pointer' }}
                                >CANCEL</button>
                                <button type='button' disabled={saving} onClick={() => saveCompletion(completingCheckId)}
                                    style={{ padding: '7px 18px', fontSize: '0.7rem', fontWeight: 700, borderRadius: 'var(--r)', background: 'var(--s2)', border: '1px solid var(--good)', color: 'var(--good)', cursor: 'pointer' }}
                                >{saving ? 'Saving…' : '✓ Mark Complete'}</button>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* Orders Check modal */}
            {ordersCheckModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={e => { if (e.target === e.currentTarget) setOrdersCheckModal(false) }}
                >
                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                        <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderTop: '2px solid var(--acc)', borderRadius: 'var(--r)', padding: '24px 28px', maxWidth: 440, width: '90%', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--acc)', fontFamily: 'var(--mono)' }}>
                                {'// REQUEST ORDERS CHECK'}
                            </div>
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink)' }}>
                                {title || 'This Operation'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--ink-2)', lineHeight: 1.5 }}>
                                Select a preferred date and time for your orders check. A task will be created for J2 leads to review and confirm.
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
                                        Preferred Date &amp; Time
                                    </div>
                                    <DateTimePicker
                                        value={ordersCheckPreferredAt}
                                        onChange={v => setOrdersCheckPreferredAt(v)}
                                        slotProps={{
                                            textField: { size: 'small', fullWidth: true, sx: pickerSx },
                                            popper: { sx: { zIndex: 19999 } },
                                        }}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
                                        Comments (optional)
                                    </div>
                                    <textarea
                                        value={ordersCheckComments}
                                        onChange={e => setOrdersCheckComments(e.target.value)}
                                        placeholder='Any notes or context for J2 leads…'
                                        rows={3}
                                        style={{ ...fieldStyle, resize: 'vertical' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                                <button type='button' onClick={() => setOrdersCheckModal(false)}
                                    style={{ padding: '7px 18px', fontSize: '0.7rem', fontWeight: 700, borderRadius: 'var(--r)', background: 'none', border: '1px solid var(--line-2)', color: 'var(--ink-3)', cursor: 'pointer' }}
                                >CANCEL</button>
                                <button type='button'
                                    disabled={!ordersCheckPreferredAt || ordersCheckSaving}
                                    onClick={async () => {
                                        if (!ordersCheckPreferredAt) return
                                        setOrdersCheckSaving(true)
                                        try {
                                            const res = await fetch(`/api/operations/${opID}/orders-check`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    preferredAt: ordersCheckPreferredAt.toISOString(),
                                                    comments: ordersCheckComments.trim() || undefined,
                                                }),
                                            })
                                            if (res.ok) {
                                                setOrdersCheckTask({ status: 'pending', ordersCheckAt: ordersCheckPreferredAt.toISOString(), ordersCheckStatus: 'pending' })
                                                setOrdersCheckModal(false)
                                                setOrdersCheckComments('')
                                                setOrdersCheckPreferredAt(null)
                                            } else {
                                                const d = await res.json()
                                                alert(d.error ?? 'Failed to submit orders check request.')
                                            }
                                        } finally {
                                            setOrdersCheckSaving(false)
                                        }
                                    }}
                                    style={{ padding: '7px 18px', fontSize: '0.7rem', fontWeight: 700, borderRadius: 'var(--r)', background: ordersCheckPreferredAt && !ordersCheckSaving ? 'var(--s2)' : 'var(--s1)', border: '1px solid var(--acc)', color: ordersCheckPreferredAt && !ordersCheckSaving ? 'var(--acc)' : 'var(--ink-3)', cursor: ordersCheckPreferredAt ? 'pointer' : 'not-allowed' }}
                                >{ordersCheckSaving ? 'Submitting…' : 'Submit Request'}</button>
                            </div>
                        </div>
                    </LocalizationProvider>
                </div>
            )}
        </div>
    )
}
