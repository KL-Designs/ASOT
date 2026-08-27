'use client'

import { useState } from 'react'
import type { Dayjs } from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import ConfirmDialog from '@/components/confirm-dialog'
import { devCheckItems } from '@/lib/operations/dev-check-content'
import type { DevCheckGate } from '@/lib/operations/phases'
import { btn, btnTone, chip, field, label, pickerSx } from './controls'

export type OrdersCheckTask = {
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
    isCampaignOp: boolean
    gates: DevCheckGate[]
    now: Date
    missionDev: MissionDevelopment | null
    setMissionDev: React.Dispatch<React.SetStateAction<MissionDevelopment | null>>
    ordersCheckTask: OrdersCheckTask | null
    setOrdersCheckTask: React.Dispatch<React.SetStateAction<OrdersCheckTask | null>>
}

/**
 * The pre-production phase, opened in the ribbon's inspector.
 *
 * Two things changed from the panel this replaces, beyond losing the gate rail
 * that the ribbon now draws:
 *
 * 1. **Checklists are visible.** `devCheckItems` used to be reachable only
 *    from inside the completion modal, so the only way to read what a gate
 *    required was to open the dialog that signs it off. They are listed on the
 *    row.
 * 2. **Overdue is quantified.** "5 OVERDUE" told you a count; a gate that is
 *    68 days late and one that is 2 days late are not the same problem.
 */
export default function PreProductionInspector({
    opID, isJ2Lead, title, isCampaignOp, gates, now,
    setMissionDev, ordersCheckTask, setOrdersCheckTask,
}: Props) {
    const [saving, setSaving] = useState(false)
    const [completingCheckId, setCompletingCheckId] = useState<string | null>(null)
    const [uncompleteCheckId, setUncompleteCheckId] = useState<string | null>(null)
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

    if (!gates.length) {
        return (
            <div style={{ padding: 16, fontSize: '0.72rem', color: 'var(--ink-3)', fontStyle: 'italic' }}>
                Set an operation date above to schedule development checks.
            </div>
        )
    }

    const daysLate = (dueAt: Date) => Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000)

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
        <>
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Development gates</span>
                    <span style={chip(gates.every(g => g.state === 'done') ? 'good' : undefined)}>
                        {gates.filter(g => g.state === 'done').length} of {gates.length} complete
                    </span>
                    {gates.some(g => g.state === 'overdue') && (
                        <span style={chip('warn')}>{gates.filter(g => g.state === 'overdue').length} overdue</span>
                    )}
                    {saving && <span style={{ fontSize: '0.6rem', color: 'var(--acc)', fontWeight: 700 }}>Saving…</span>}
                    {!isJ2Lead && (
                        <span style={{ marginLeft: 'auto', ...label, fontStyle: 'italic' }}>J2 leads sign off gates</span>
                    )}
                </div>

                {gates.map(g => {
                    const items = devCheckItems(isCampaignOp, g.id)
                    const late = g.state === 'overdue' ? daysLate(g.dueAt) : 0
                    const nodeColor = g.state === 'done' ? 'var(--good)' : g.state === 'overdue' ? 'var(--warn)' : 'var(--s3)'
                    const nodeBorder = g.state === 'done' ? 'var(--good)' : g.state === 'overdue' ? 'var(--warn)' : 'var(--line-2)'
                    return (
                        <div key={g.id} style={{
                            display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 14,
                            alignItems: 'start', padding: '13px 0', borderTop: '1px solid var(--line)',
                        }}>
                            <div style={{
                                width: 22, height: 22, borderRadius: '50%', marginTop: 1,
                                background: nodeColor, border: `2px solid ${nodeBorder}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 9, color: 'var(--bg)', lineHeight: 1,
                            }}>
                                {g.state === 'done' ? '✓' : g.state === 'overdue' ? '!' : ''}
                            </div>

                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                                    {g.label}
                                    {g.state === 'overdue' && <span style={chip('warn')}>{late} {late === 1 ? 'day' : 'days'} overdue</span>}
                                    {g.state === 'done' && <span style={chip('good')}>Signed off</span>}
                                </div>

                                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3 }}>
                                    Due <span style={{ color: 'var(--ink-2)' }}>
                                        {g.dueAt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                                    </span>
                                    {g.completion && <> · reviewed by <span style={{ color: 'var(--ink-2)' }}>{g.completion.reviewerName}</span></>}
                                </div>

                                {g.completion?.comments && (
                                    <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 4 }}>{g.completion.comments}</div>
                                )}
                                {g.completion?.outcome && (
                                    <div style={{ fontSize: 11.5, color: 'var(--warn)', marginTop: 2 }}>Outcome: {g.completion.outcome}</div>
                                )}

                                {!g.completion && items.length > 0 && (
                                    <div style={{ marginTop: 7, display: 'flex', flexWrap: 'wrap', gap: '5px 14px' }}>
                                        {items.map((item, i) => (
                                            <span key={i} style={{ fontSize: 11, color: 'var(--ink-2)', display: 'inline-flex', gap: 7 }}>
                                                <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 9.5 }}>◻</span>
                                                {item}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
                                <button
                                    type="button"
                                    disabled={!isJ2Lead || saving}
                                    title={isJ2Lead ? undefined : 'J2 leads only'}
                                    onClick={() => {
                                        if (!isJ2Lead) return
                                        if (g.state === 'done') {
                                            setUncompleteCheckId(g.id)
                                        } else {
                                            setCompletingCheckId(g.id)
                                            setReviewerName('')
                                            setComments('')
                                            setOutcome('')
                                        }
                                    }}
                                    style={{
                                        ...(g.state === 'done' ? btnTone('crit') : btnTone('good')),
                                        opacity: isJ2Lead ? 1 : 0.45,
                                        cursor: isJ2Lead ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    {g.state === 'done' ? 'Remove' : 'Complete'}
                                </button>
                            </div>
                        </div>
                    )
                })}

                {/* Orders check — a request, not a gate, so it sits after them. */}
                <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                    {ordersCheckTask ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ ...label, color: 'var(--acc)', marginBottom: 3 }}>
                                        Orders check {ordersCheckTask.ordersCheckStatus === 'confirmed' ? '✓ Confirmed'
                                            : ordersCheckTask.ordersCheckStatus === 'proposed' ? '— Alternative proposed'
                                            : '— Requested'}
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
                                        type="button"
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
                                        style={{ ...btnTone('crit'), flexShrink: 0 }}
                                    >
                                        {ordersCheckCancelling ? '…' : 'Cancel request'}
                                    </button>
                                )}
                            </div>

                            {ordersCheckTask.ordersCheckStatus === 'confirmed' && ordersCheckTask._id && (
                                <LocalizationProvider dateAdapter={AdapterDayjs}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
                                        <span style={{ ...label, flexShrink: 0 }}>Remind me:</span>
                                        <DateTimePicker
                                            value={ordersCheckReminderAt}
                                            onChange={v => setOrdersCheckReminderAt(v)}
                                            slotProps={{ textField: { size: 'small', sx: pickerSx }, popper: { sx: { zIndex: 19999 } } }}
                                        />
                                        <button
                                            type="button"
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
                                                    if (res.ok) setOrdersCheckReminderSet(true)
                                                    else { const d = await res.json(); alert(d.error ?? 'Failed.') }
                                                } finally {
                                                    setOrdersCheckReminderSaving(false)
                                                }
                                            }}
                                            style={{ ...(ordersCheckReminderSet ? btnTone('good') : btnTone('acc')), flexShrink: 0 }}
                                        >
                                            {ordersCheckReminderSet ? '✓ Set' : 'Set reminder'}
                                        </button>
                                    </div>
                                </LocalizationProvider>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span style={label}>Orders check</span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)' }}>
                                Not requested. Proposes a time to J2 leads; they confirm it or offer another.
                            </span>
                            <button type="button" onClick={() => setOrdersCheckModal(true)} style={{ ...btnTone('acc'), marginLeft: 'auto' }}>
                                Request orders check
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Completion modal */}
            {completingCheckId && (() => {
                const g = gates.find(x => x.id === completingCheckId)
                if (!g) return null
                const items = devCheckItems(isCampaignOp, g.id)
                return (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={e => { if (e.target === e.currentTarget) setCompletingCheckId(null) }}
                    >
                        <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderTop: '2px solid var(--good)', borderRadius: 'var(--r)', padding: '24px 28px', maxWidth: 500, width: '90%', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ ...label, color: 'var(--good)', letterSpacing: '0.22em' }}>{'// COMPLETE CHECK'}</div>
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink)' }}>
                                {g.label} development check
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--ink-2)' }}>
                                Due: {g.dueAt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })}
                                {g.state === 'overdue' && <span style={{ color: 'var(--warn)', marginLeft: 8 }}>● {daysLate(g.dueAt)} days overdue</span>}
                            </div>

                            {items.length > 0 && (
                                <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ ...label, color: 'var(--good)', letterSpacing: '0.18em', marginBottom: 4 }}>Stage checklist</div>
                                    {items.map((item, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                            <span style={{ fontSize: '0.6rem', color: 'var(--good)', marginTop: 1, flexShrink: 0 }}>◻</span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--ink-2)', lineHeight: 1.45 }}>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div>
                                    <div style={{ ...label, color: 'var(--ink-2)', marginBottom: 6 }}>Reviewer name</div>
                                    <input value={reviewerName} onChange={e => setReviewerName(e.target.value)}
                                        placeholder="Your name or assigned reviewer…" style={field} />
                                </div>
                                <div>
                                    <div style={{ ...label, color: 'var(--ink-2)', marginBottom: 6 }}>Comments</div>
                                    <textarea value={comments} onChange={e => setComments(e.target.value)}
                                        placeholder="Review notes, observations…" rows={3} style={{ ...field, resize: 'vertical' }} />
                                </div>
                                <div>
                                    <div style={{ ...label, color: 'var(--ink-2)', marginBottom: 6 }}>Outcome / notes</div>
                                    <textarea value={outcome} onChange={e => setOutcome(e.target.value)}
                                        placeholder="Outcome, decisions made, action items…" rows={2} style={{ ...field, resize: 'vertical' }} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                                <button type="button" onClick={() => setCompletingCheckId(null)} style={btn}>Cancel</button>
                                <button type="button" disabled={saving} onClick={() => saveCompletion(completingCheckId)} style={btnTone('good')}>
                                    {saving ? 'Saving…' : '✓ Mark complete'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* Orders check request modal */}
            {ordersCheckModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={e => { if (e.target === e.currentTarget) setOrdersCheckModal(false) }}
                >
                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                        <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderTop: '2px solid var(--acc)', borderRadius: 'var(--r)', padding: '24px 28px', maxWidth: 440, width: '90%', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ ...label, color: 'var(--acc)', letterSpacing: '0.22em' }}>{'// REQUEST ORDERS CHECK'}</div>
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink)' }}>{title || 'This operation'}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--ink-2)', lineHeight: 1.5 }}>
                                Select a preferred date and time for your orders check. A task will be created for J2 leads to review and confirm.
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div>
                                    <div style={{ ...label, marginBottom: 8 }}>Preferred date &amp; time</div>
                                    <DateTimePicker
                                        value={ordersCheckPreferredAt}
                                        onChange={v => setOrdersCheckPreferredAt(v)}
                                        slotProps={{ textField: { size: 'small', fullWidth: true, sx: pickerSx }, popper: { sx: { zIndex: 19999 } } }}
                                    />
                                </div>
                                <div>
                                    <div style={{ ...label, marginBottom: 8 }}>Comments (optional)</div>
                                    <textarea value={ordersCheckComments} onChange={e => setOrdersCheckComments(e.target.value)}
                                        placeholder="Any notes or context for J2 leads…" rows={3} style={{ ...field, resize: 'vertical' }} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                                <button type="button" onClick={() => setOrdersCheckModal(false)} style={btn}>Cancel</button>
                                <button
                                    type="button"
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
                                    style={{ ...btnTone('acc'), opacity: ordersCheckPreferredAt && !ordersCheckSaving ? 1 : 0.5 }}
                                >
                                    {ordersCheckSaving ? 'Submitting…' : 'Submit request'}
                                </button>
                            </div>
                        </div>
                    </LocalizationProvider>
                </div>
            )}

            <ConfirmDialog
                open={uncompleteCheckId !== null}
                title="Remove completion"
                message={`Remove the completion record for the ${uncompleteCheckId?.replace('w', '')}W development check? The reviewer, comments and outcome will be discarded.`}
                confirmLabel="Remove"
                danger
                onConfirm={() => { const id = uncompleteCheckId!; setUncompleteCheckId(null); removeCompletion(id) }}
                onCancel={() => setUncompleteCheckId(null)}
            />
        </>
    )
}
