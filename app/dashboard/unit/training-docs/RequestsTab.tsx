'use client'

import { useEffect, useState } from 'react'
import { Add, CheckCircle, Cancel, Delete, ThumbUp } from '@mui/icons-material'

const RED = '#db001d'

type TType = { _id: string; name: string; category: string }

type TRequest = {
    _id: string
    trainingTypeId: string
    trainingTypeName: string
    requestedById: string
    requestedByName: string
    preferredAt?: string
    description?: string
    status: 'pending' | 'approved' | 'rejected' | 'cancelled'
    interestedCount: number
    interestedUserIds: string[]
    approvedEventId?: string
    rejectedReason?: string
    createdAt: string
}

type ApproveModal = {
    requestId: string
    trainingTypeName: string
    preferredAt?: string
    scheduledAt: string
    title: string
    trainerId: string
    trainerName: string
}

const STATUS_COLORS: Record<string, string> = {
    pending:   'rgba(255,200,50,0.75)',
    approved:  'rgba(80,200,120,0.8)',
    rejected:  'rgba(219,0,29,0.8)',
    cancelled: 'rgba(237,237,237,0.3)',
}

function fmt(iso: string) {
    return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function localDatetimeValue(iso?: string) {
    if (!iso) {
        const now = new Date()
        now.setDate(now.getDate() + 7)
        now.setMinutes(0, 0, 0)
        now.setHours(18)
        return now.toISOString().slice(0, 16)
    }
    return new Date(iso).toISOString().slice(0, 16)
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderBottom: '2px solid rgba(219,0,29,0.4)',
    color: 'rgba(237,237,237,0.9)',
    fontSize: '0.85rem',
    padding: '8px 10px',
    outline: 'none',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>
                {label}
            </label>
            {children}
        </div>
    )
}

export default function RequestsTab({ isJ3Lead, myId }: { isJ3Lead: boolean; myId: string }) {
    const [requests, setRequests] = useState<TRequest[]>([])
    const [types, setTypes] = useState<TType[]>([])
    const [loading, setLoading] = useState(true)
    const [showClosed, setShowClosed] = useState(false)

    // Submit form
    const [showForm, setShowForm] = useState(false)
    const [form, setForm] = useState({ trainingTypeId: '', preferredAt: '', description: '' })
    const [submitting, setSubmitting] = useState(false)

    // Interest
    const [togglingInterestId, setTogglingInterestId] = useState<string | null>(null)

    // Cancel
    const [cancellingId, setCancellingId] = useState<string | null>(null)

    // J3: Reject
    const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(null)
    const [rejecting, setRejecting] = useState(false)

    // J3: Approve
    const [approveModal, setApproveModal] = useState<ApproveModal | null>(null)
    const [approving, setApproving] = useState(false)

    useEffect(() => {
        Promise.all([
            fetch('/api/training/requests').then(r => r.json()),
            fetch('/api/training/types').then(r => r.json()),
        ]).then(([rData, tData]) => {
            setRequests(rData.requests ?? [])
            setTypes((tData.types ?? []).filter((t: TType & { isActive: boolean; status: string }) => t.isActive || t.status === 'active'))
            setLoading(false)
        }).catch(() => setLoading(false))
    }, [])

    async function handleSubmit() {
        if (submitting || !form.trainingTypeId) return
        setSubmitting(true)
        try {
            const res = await fetch('/api/training/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    trainingTypeId: form.trainingTypeId,
                    preferredAt: form.preferredAt ? new Date(form.preferredAt).toISOString() : undefined,
                    description: form.description.trim() || undefined,
                }),
            })
            if (!res.ok) return
            const created = await res.json()
            setRequests(prev => [created, ...prev])
            setShowForm(false)
            setForm({ trainingTypeId: '', preferredAt: '', description: '' })
        } finally {
            setSubmitting(false)
        }
    }

    async function handleToggleInterest(requestId: string) {
        if (togglingInterestId) return
        setTogglingInterestId(requestId)
        try {
            const res = await fetch(`/api/training/requests/${requestId}/interest`, { method: 'POST' })
            if (!res.ok) return
            const data = await res.json()
            setRequests(prev => prev.map(r => r._id === requestId ? data.request : r))
        } finally {
            setTogglingInterestId(null)
        }
    }

    async function handleCancel(requestId: string) {
        if (cancellingId) return
        setCancellingId(requestId)
        try {
            const res = await fetch(`/api/training/requests/${requestId}`, { method: 'PATCH' })
            if (!res.ok) return
            const updated = await res.json()
            setRequests(prev => prev.map(r => r._id === requestId ? updated : r))
        } finally {
            setCancellingId(null)
        }
    }

    async function handleReject() {
        if (!rejectModal || rejecting) return
        setRejecting(true)
        try {
            const res = await fetch(`/api/training/requests/${rejectModal.id}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: rejectModal.reason.trim() || undefined }),
            })
            if (!res.ok) return
            const updated = await res.json()
            setRequests(prev => prev.map(r => r._id === rejectModal.id ? updated : r))
            setRejectModal(null)
        } finally {
            setRejecting(false)
        }
    }

    async function handleApprove() {
        if (!approveModal || approving) return
        setApproving(true)
        try {
            const res = await fetch(`/api/training/requests/${approveModal.requestId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scheduledAt: new Date(approveModal.scheduledAt).toISOString(),
                    title: approveModal.title.trim() || undefined,
                }),
            })
            if (!res.ok) return
            const data = await res.json()
            setRequests(prev => prev.map(r => r._id === approveModal.requestId ? data.request : r))
            setApproveModal(null)
        } finally {
            setApproving(false)
        }
    }

    const visible = requests.filter(r => {
        if (showClosed) return true
        return r.status === 'pending' || r.status === 'approved'
    })

    return (
        <div style={{ padding: 'clamp(1.5rem, 3vw, 2.5rem)', paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <button type='button' onClick={() => setShowClosed(v => !v)}
                    style={{ padding: '6px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: showClosed ? 'rgba(237,237,237,0.6)' : 'rgba(237,237,237,0.3)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                    {showClosed ? 'Hide Closed' : 'Show Closed'}
                </button>
                <button type='button' onClick={() => { setForm({ trainingTypeId: types[0]?._id ?? '', preferredAt: '', description: '' }); setShowForm(true) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>
                    <Add style={{ fontSize: 15 }} /> Request Training
                </button>
            </div>

            {loading ? (
                <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)' }}>Loading…</div>
            ) : visible.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>
                    No training requests
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {visible.map(r => {
                        const isPending = r.status === 'pending'
                        const isOwn = r.requestedById === myId
                        const hasInterest = r.interestedUserIds.includes(myId)

                        return (
                            <div key={r._id} style={{
                                border: '1px solid rgba(255,255,255,0.07)',
                                borderLeft: `3px solid ${isPending ? 'rgba(255,200,50,0.4)' : r.status === 'approved' ? 'rgba(80,200,120,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                background: 'rgba(255,255,255,0.02)',
                                padding: '14px 16px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                                opacity: r.status === 'rejected' || r.status === 'cancelled' ? 0.55 : 1,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                                            <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', border: '1px solid rgba(219,0,29,0.25)', padding: '2px 7px', flexShrink: 0 }}>
                                                {r.trainingTypeName}
                                            </span>
                                            <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: STATUS_COLORS[r.status], flexShrink: 0 }}>
                                                {r.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(237,237,237,0.7)' }}>
                                            Requested by {r.requestedByName}
                                        </div>
                                    </div>

                                    {/* J3 approve/reject controls */}
                                    {isJ3Lead && isPending && (
                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                            <button type='button'
                                                onClick={() => setApproveModal({
                                                    requestId: r._id,
                                                    trainingTypeName: r.trainingTypeName,
                                                    preferredAt: r.preferredAt,
                                                    scheduledAt: localDatetimeValue(r.preferredAt),
                                                    title: `${r.trainingTypeName} — ${r.requestedByName}`,
                                                    trainerId: r.requestedById,
                                                    trainerName: r.requestedByName,
                                                })}
                                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(80,200,120,0.1)', border: '1px solid rgba(80,200,120,0.3)', color: 'rgba(80,200,120,0.9)', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                <CheckCircle style={{ fontSize: 11 }} /> Approve
                                            </button>
                                            <button type='button' onClick={() => setRejectModal({ id: r._id, reason: '' })}
                                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.25)', color: 'rgba(219,0,29,0.7)', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                <Cancel style={{ fontSize: 11 }} /> Reject
                                            </button>
                                        </div>
                                    )}

                                    {/* Own cancel */}
                                    {isOwn && isPending && (
                                        <button type='button' onClick={() => handleCancel(r._id)} disabled={cancellingId === r._id}
                                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.5)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: cancellingId === r._id ? 'default' : 'pointer', opacity: cancellingId === r._id ? 0.5 : 1, flexShrink: 0 }}>
                                            <Delete style={{ fontSize: 11 }} /> Cancel
                                        </button>
                                    )}
                                </div>

                                {r.description && (
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.5 }}>{r.description}</div>
                                )}

                                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)' }}>
                                    <span><span style={{ color: 'rgba(237,237,237,0.2)', marginRight: 4 }}>Requested</span>{fmtDate(r.createdAt)}</span>
                                    {r.preferredAt && <span><span style={{ color: 'rgba(237,237,237,0.2)', marginRight: 4 }}>Preferred Date</span>{fmt(r.preferredAt)}</span>}
                                    {r.rejectedReason && <span style={{ color: 'rgba(219,0,29,0.6)' }}>Reason: {r.rejectedReason}</span>}
                                    {r.approvedEventId && <span style={{ color: 'rgba(80,200,120,0.6)' }}>Event scheduled ✓</span>}
                                </div>

                                {/* Interest toggle — pending requests only, not your own */}
                                {isPending && !isOwn && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                        <button type='button'
                                            onClick={() => handleToggleInterest(r._id)}
                                            disabled={!!togglingInterestId}
                                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: hasInterest ? 'rgba(80,200,120,0.1)' : 'transparent', border: `1px solid ${hasInterest ? 'rgba(80,200,120,0.35)' : 'rgba(255,255,255,0.1)'}`, color: hasInterest ? 'rgba(80,200,120,0.8)' : 'rgba(237,237,237,0.35)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: togglingInterestId ? 'default' : 'pointer', opacity: togglingInterestId ? 0.5 : 1 }}>
                                            <ThumbUp style={{ fontSize: 11 }} />
                                            {hasInterest ? 'Interested' : "I'm Interested"}
                                        </button>
                                        {r.interestedCount > 0 && (
                                            <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.06em' }}>
                                                {r.interestedCount} interested
                                            </span>
                                        )}
                                    </div>
                                )}
                                {isPending && isOwn && r.interestedCount > 0 && (
                                    <div style={{ fontSize: '0.6rem', color: 'rgba(80,200,120,0.5)', marginTop: 2 }}>
                                        {r.interestedCount} member{r.interestedCount !== 1 ? 's' : ''} interested
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Submit request modal */}
            {showForm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
                    <div style={{ background: '#0e0e0e', border: `1px solid rgba(219,0,29,0.25)`, borderTop: `3px solid ${RED}`, padding: 28, width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 6 }}>{'//'} REQUEST TRAINING</div>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Request a Training Session</h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <Field label='Training Course *'>
                                <select value={form.trainingTypeId} onChange={e => setForm(p => ({ ...p, trainingTypeId: e.target.value }))}
                                    style={{ ...inputStyle, cursor: 'pointer' }}>
                                    <option value=''>Select a course…</option>
                                    {types.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                                </select>
                            </Field>
                            <Field label='Preferred Date & Time (optional)'>
                                <input type='datetime-local' value={form.preferredAt} onChange={e => setForm(p => ({ ...p, preferredAt: e.target.value }))}
                                    style={inputStyle} />
                            </Field>
                            <Field label='Notes (optional)'>
                                <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                                    placeholder='Any specific requirements or context' style={inputStyle} />
                            </Field>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                            <button type='button' onClick={() => setShowForm(false)}
                                style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.45)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type='button' onClick={handleSubmit} disabled={!form.trainingTypeId || submitting}
                                style={{ padding: '8px 20px', background: form.trainingTypeId && !submitting ? RED : 'rgba(219,0,29,0.3)', border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: form.trainingTypeId && !submitting ? 'pointer' : 'default' }}>
                                {submitting ? 'Submitting…' : 'Submit Request'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* J3 Approve modal */}
            {approveModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setApproveModal(null) }}>
                    <div style={{ background: '#0e0e0e', border: '1px solid rgba(80,200,120,0.2)', borderTop: '3px solid rgba(80,200,120,0.6)', padding: 28, width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(80,200,120,0.6)', marginBottom: 6 }}>{'//'} APPROVE REQUEST</div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Approve & Schedule</h3>
                            <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>
                                Course: <strong style={{ color: 'rgba(237,237,237,0.7)' }}>{approveModal.trainingTypeName}</strong>
                            </p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <Field label='Event Title'>
                                <input value={approveModal.title} onChange={e => setApproveModal(m => m && ({ ...m, title: e.target.value }))}
                                    style={inputStyle} />
                            </Field>
                            <Field label='Scheduled Date & Time *'>
                                <input type='datetime-local' value={approveModal.scheduledAt}
                                    onChange={e => setApproveModal(m => m && ({ ...m, scheduledAt: e.target.value }))}
                                    style={inputStyle} />
                            </Field>
                            {approveModal.preferredAt && (
                                <div style={{ fontSize: '0.62rem', color: 'rgba(255,200,50,0.6)' }}>
                                    Preferred: {fmt(approveModal.preferredAt)}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button type='button' onClick={() => setApproveModal(null)}
                                style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.45)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type='button' onClick={handleApprove} disabled={!approveModal.scheduledAt || approving}
                                style={{ padding: '8px 20px', background: approveModal.scheduledAt && !approving ? 'rgba(80,200,120,0.75)' : 'rgba(80,200,120,0.2)', border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: approveModal.scheduledAt && !approving ? 'pointer' : 'default' }}>
                                {approving ? 'Approving…' : 'Approve & Schedule'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* J3 Reject modal */}
            {rejectModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setRejectModal(null) }}>
                    <div style={{ background: '#0e0e0e', border: '1px solid rgba(219,0,29,0.25)', borderTop: `3px solid ${RED}`, padding: 28, width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 6 }}>{'//'} REJECT REQUEST</div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Reject Training Request</h3>
                        </div>
                        <Field label='Reason (optional)'>
                            <input value={rejectModal.reason} onChange={e => setRejectModal(m => m && ({ ...m, reason: e.target.value }))}
                                placeholder='e.g. Insufficient demand at this time' autoFocus style={inputStyle} />
                        </Field>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button type='button' onClick={() => setRejectModal(null)}
                                style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.45)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type='button' onClick={handleReject} disabled={rejecting}
                                style={{ padding: '8px 20px', background: rejecting ? 'rgba(219,0,29,0.3)' : RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: rejecting ? 'default' : 'pointer' }}>
                                {rejecting ? 'Rejecting…' : 'Reject Request'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
