'use client'

import { useEffect, useState, useCallback } from 'react'
import { CheckCircle, Cancel, Edit, ExpandMore, ExpandLess, AccessTime, HowToReg, Block } from '@mui/icons-material'

type TicketStatus = 'pending' | 'approved' | 'amendments_requested' | 'rejected'

type SlotType = 'trainer' | 'trainee' | 'sit-in'

type Attendee = {
    memberId: string
    memberName: string
    slotType: SlotType
    attended: boolean
    passed?: boolean
    notes?: string
    qualificationAwarded: boolean
    billetPointsAwarded: boolean
}

type Ticket = {
    _id: string
    eventId: string
    trainingTypeId: string
    trainingTypeName: string
    trainerId: string
    trainerName: string
    scheduledAt: string
    completedAt: string
    status: TicketStatus
    attendees: Attendee[]
    trainerNotes?: string
    j3Notes?: string
    amendmentNotes?: string
    reviewedByName?: string
    reviewedAt?: string
    billetPointsAwarded: boolean
    qualificationsAwarded: boolean
    isJ3Training: boolean
    createdAt: string
    updatedAt: string
}

const STATUS_CFG: Record<TicketStatus, { label: string; color: string; border: string }> = {
    pending:              { label: 'Pending Review',      color: 'rgba(255,180,50,0.9)',   border: 'rgba(255,180,50,0.35)' },
    amendments_requested: { label: 'Amendments Required', color: 'rgba(255,120,60,0.9)',   border: 'rgba(255,120,60,0.35)' },
    approved:             { label: 'Approved',            color: 'rgba(80,200,120,0.9)',   border: 'rgba(80,200,120,0.35)' },
    rejected:             { label: 'Rejected',            color: 'rgba(219,0,29,0.9)',     border: 'rgba(219,0,29,0.35)' },
}

const SLOT_COLOR: Record<SlotType, string> = {
    trainer: 'rgba(219,0,29,0.8)',
    trainee: 'rgba(80,200,120,0.8)',
    'sit-in': 'rgba(100,160,255,0.8)',
}

const RED = '#db001d'

const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderBottom: '2px solid rgba(219,0,29,0.4)',
    color: 'rgba(237,237,237,0.9)',
    fontSize: '0.82rem',
    padding: '8px 10px',
    outline: 'none',
}

type FilterStatus = 'pending' | 'amendments_requested' | 'approved' | 'rejected' | 'all'

function fmt(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function TicketCard({ ticket, isJ3Lead, onRefresh }: { ticket: Ticket; isJ3Lead: boolean; onRefresh: () => void }) {
    const [expanded, setExpanded] = useState(false)
    const [acting, setActing] = useState(false)
    const [j3Notes, setJ3Notes] = useState('')
    const [amendmentNotes, setAmendmentNotes] = useState('')
    const [attendeePasses, setAttendeePasses] = useState<Record<string, boolean | undefined>>({})
    const [showApproveModal, setShowApproveModal] = useState(false)
    const [showRejectModal, setShowRejectModal] = useState(false)
    const [showAmendModal, setShowAmendModal] = useState(false)
    const [trainerNotes, setTrainerNotes] = useState(ticket.trainerNotes ?? '')
    const [editingNotes, setEditingNotes] = useState(false)

    const cfg = STATUS_CFG[ticket.status]
    const canAct = isJ3Lead && (ticket.status === 'pending' || ticket.status === 'amendments_requested')
    const trainees = ticket.attendees.filter(a => a.slotType === 'trainee')

    function initPasses() {
        const map: Record<string, boolean | undefined> = {}
        for (const a of trainees) map[a.memberId] = a.passed
        setAttendeePasses(map)
    }

    async function approve() {
        setActing(true)
        const attendees = trainees.map(a => ({ memberId: a.memberId, passed: attendeePasses[a.memberId] ?? a.passed }))
        await fetch(`/api/training/tickets/${ticket._id}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ j3Notes: j3Notes || undefined, attendees }),
        })
        setActing(false)
        setShowApproveModal(false)
        onRefresh()
    }

    async function reject() {
        setActing(true)
        await fetch(`/api/training/tickets/${ticket._id}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ j3Notes: j3Notes || undefined }),
        })
        setActing(false)
        setShowRejectModal(false)
        onRefresh()
    }

    async function requestAmend() {
        if (!amendmentNotes.trim()) return
        setActing(true)
        await fetch(`/api/training/tickets/${ticket._id}/amend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amendmentNotes }),
        })
        setActing(false)
        setShowAmendModal(false)
        onRefresh()
    }

    async function saveTrainerNotes() {
        await fetch(`/api/training/tickets/${ticket._id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trainerNotes }),
        })
        setEditingNotes(false)
        onRefresh()
    }

    return (
        <>
            <div style={{
                border: `1px solid ${cfg.border}`,
                borderLeft: `3px solid ${cfg.color}`,
                background: 'rgba(255,255,255,0.02)',
                marginBottom: 8,
            }}>
                {/* Ticket header */}
                <div
                    style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                    onClick={() => setExpanded(e => !e)}
                >
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                            {ticket.trainingTypeName}
                        </div>
                        <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)', marginTop: 3, letterSpacing: '0.06em' }}>
                            {ticket.trainerName} · {fmt(ticket.scheduledAt)} · {ticket.attendees.filter(a => a.attended).length} attended
                        </div>
                    </div>
                    <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: cfg.color, border: `1px solid ${cfg.border}`, padding: '2px 8px', flexShrink: 0 }}>
                        {cfg.label}
                    </span>
                    {expanded ? <ExpandLess sx={{ fontSize: '1rem', color: 'rgba(237,237,237,0.3)' }} /> : <ExpandMore sx={{ fontSize: '1rem', color: 'rgba(237,237,237,0.3)' }} />}
                </div>

                {/* Expanded detail */}
                {expanded && (
                    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        {/* Attendee list */}
                        <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 8 }}>
                                Attendees
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {ticket.attendees.map(a => (
                                    <div key={a.memberId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <span style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: SLOT_COLOR[a.slotType], border: `1px solid ${SLOT_COLOR[a.slotType]}`, padding: '1px 5px', flexShrink: 0 }}>
                                            {a.slotType}
                                        </span>
                                        <span style={{ flex: 1, fontSize: '0.73rem', color: 'rgba(237,237,237,0.8)' }}>{a.memberName}</span>
                                        {a.slotType === 'trainee' && canAct && (
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: '0.62rem', color: 'rgba(237,237,237,0.5)', flexShrink: 0 }}>
                                                <input
                                                    type='checkbox'
                                                    checked={attendeePasses[a.memberId] ?? false}
                                                    onChange={e => setAttendeePasses(p => ({ ...p, [a.memberId]: e.target.checked }))}
                                                    style={{ accentColor: RED }}
                                                />
                                                Passed
                                            </label>
                                        )}
                                        {a.slotType === 'trainee' && !canAct && (
                                            <span style={{ fontSize: '0.58rem', color: a.passed ? 'rgba(80,200,120,0.8)' : a.passed === false ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.25)', flexShrink: 0 }}>
                                                {a.passed === true ? 'Passed' : a.passed === false ? 'Failed' : '—'}
                                            </span>
                                        )}
                                        {a.qualificationAwarded && (
                                            <span style={{ fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(80,200,120,0.8)', border: '1px solid rgba(80,200,120,0.3)', padding: '1px 5px', flexShrink: 0 }}>
                                                QUAL AWARDED
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Trainer notes */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)' }}>Trainer Notes</span>
                                {(ticket.status === 'pending' || ticket.status === 'amendments_requested') && !editingNotes && (
                                    <button onClick={() => setEditingNotes(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                        <Edit sx={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.3)' }} />
                                    </button>
                                )}
                            </div>
                            {editingNotes ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <textarea
                                        value={trainerNotes}
                                        onChange={e => setTrainerNotes(e.target.value)}
                                        rows={3}
                                        placeholder='Session notes…'
                                        style={{ ...inputStyle, resize: 'vertical' }}
                                    />
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={saveTrainerNotes} style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(219,0,29,0.3)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.9)', padding: '4px 10px', cursor: 'pointer' }}>Save</button>
                                        <button onClick={() => { setEditingNotes(false); setTrainerNotes(ticket.trainerNotes ?? '') }} style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.45)', padding: '4px 10px', cursor: 'pointer' }}>Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)', lineHeight: 1.55 }}>
                                    {ticket.trainerNotes || <span style={{ opacity: 0.4 }}>No notes provided.</span>}
                                </div>
                            )}
                        </div>

                        {/* J3 review notes */}
                        {ticket.amendmentNotes && (
                            <div style={{ padding: '8px 12px', background: 'rgba(255,120,60,0.06)', border: '1px solid rgba(255,120,60,0.2)' }}>
                                <div style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,120,60,0.7)', marginBottom: 4 }}>Amendments Required</div>
                                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.6)' }}>{ticket.amendmentNotes}</div>
                            </div>
                        )}
                        {ticket.j3Notes && (
                            <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 4 }}>J3 Notes</div>
                                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)' }}>{ticket.j3Notes}</div>
                            </div>
                        )}
                        {ticket.reviewedByName && (
                            <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.25)', textAlign: 'right' }}>
                                Reviewed by {ticket.reviewedByName} · {ticket.reviewedAt ? fmt(ticket.reviewedAt) : ''}
                            </div>
                        )}

                        {/* J3 actions */}
                        {canAct && (
                            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                                <button
                                    onClick={() => { initPasses(); setJ3Notes(''); setShowApproveModal(true) }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(80,200,120,0.15)', border: '1px solid rgba(80,200,120,0.35)', color: 'rgba(80,200,120,0.9)', padding: '5px 12px', cursor: 'pointer' }}
                                >
                                    <CheckCircle sx={{ fontSize: '0.8rem' }} /> Approve
                                </button>
                                <button
                                    onClick={() => { setAmendmentNotes(''); setShowAmendModal(true) }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(255,120,60,0.12)', border: '1px solid rgba(255,120,60,0.3)', color: 'rgba(255,120,60,0.85)', padding: '5px 12px', cursor: 'pointer' }}
                                >
                                    <Edit sx={{ fontSize: '0.8rem' }} /> Request Amendments
                                </button>
                                <button
                                    onClick={() => { setJ3Notes(''); setShowRejectModal(true) }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.3)', color: 'rgba(219,0,29,0.85)', padding: '5px 12px', cursor: 'pointer' }}
                                >
                                    <Cancel sx={{ fontSize: '0.8rem' }} /> Reject
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Approve modal */}
            {showApproveModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setShowApproveModal(false) }}>
                    <div style={{ background: '#0e0e0e', border: '1px solid rgba(80,200,120,0.25)', borderTop: '3px solid rgba(80,200,120,0.8)', padding: 28, width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(80,200,120,0.7)' }}>Approve Training Ticket</div>
                        <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.5)' }}>
                            Approving will award <strong style={{ color: 'rgba(237,237,237,0.8)' }}>billet points</strong> to the trainer and mark qualifications for passed trainees.
                        </div>

                        {trainees.length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 8 }}>Confirm Trainee Results</div>
                                {trainees.map(a => (
                                    <label key={a.memberId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>
                                        <input
                                            type='checkbox'
                                            checked={attendeePasses[a.memberId] ?? false}
                                            onChange={e => setAttendeePasses(p => ({ ...p, [a.memberId]: e.target.checked }))}
                                            style={{ accentColor: RED }}
                                        />
                                        {a.memberName}
                                    </label>
                                ))}
                            </div>
                        )}

                        <div>
                            <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>J3 Notes (optional)</label>
                            <textarea value={j3Notes} onChange={e => setJ3Notes(e.target.value)} rows={2} placeholder='Optional notes for the trainer…' style={{ ...inputStyle, resize: 'vertical' }} />
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button disabled={acting} onClick={approve} style={{ flex: 1, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(80,200,120,0.2)', border: '1px solid rgba(80,200,120,0.4)', color: 'rgba(80,200,120,0.9)', padding: '8px 0', cursor: 'pointer' }}>
                                {acting ? 'Approving…' : 'Approve & Award Points'}
                            </button>
                            <button onClick={() => setShowApproveModal(false)} style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', padding: '8px 16px', cursor: 'pointer' }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject modal */}
            {showRejectModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setShowRejectModal(false) }}>
                    <div style={{ background: '#0e0e0e', border: '1px solid rgba(219,0,29,0.25)', borderTop: `3px solid ${RED}`, padding: 28, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)' }}>Reject Training Ticket</div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>Reason (optional)</label>
                            <textarea value={j3Notes} onChange={e => setJ3Notes(e.target.value)} rows={3} placeholder='Reason for rejection…' style={{ ...inputStyle, resize: 'vertical' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button disabled={acting} onClick={reject} style={{ flex: 1, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(219,0,29,0.2)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(219,0,29,0.9)', padding: '8px 0', cursor: 'pointer' }}>
                                {acting ? 'Rejecting…' : 'Reject Ticket'}
                            </button>
                            <button onClick={() => setShowRejectModal(false)} style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', padding: '8px 16px', cursor: 'pointer' }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Amend modal */}
            {showAmendModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setShowAmendModal(false) }}>
                    <div style={{ background: '#0e0e0e', border: '1px solid rgba(255,120,60,0.25)', borderTop: '3px solid rgba(255,120,60,0.7)', padding: 28, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,120,60,0.75)' }}>Request Amendments</div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>What needs to be amended?</label>
                            <textarea value={amendmentNotes} onChange={e => setAmendmentNotes(e.target.value)} rows={3} placeholder='Describe what the trainer needs to fix or clarify…' style={{ ...inputStyle, resize: 'vertical' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button disabled={acting || !amendmentNotes.trim()} onClick={requestAmend} style={{ flex: 1, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(255,120,60,0.15)', border: '1px solid rgba(255,120,60,0.35)', color: 'rgba(255,120,60,0.85)', padding: '8px 0', cursor: 'pointer', opacity: !amendmentNotes.trim() ? 0.5 : 1 }}>
                                {acting ? 'Sending…' : 'Send Request'}
                            </button>
                            <button onClick={() => setShowAmendModal(false)} style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', padding: '8px 16px', cursor: 'pointer' }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

export default function TrainingTicketsTab({ isJ3Lead }: { isJ3Lead: boolean }) {
    const [tickets, setTickets] = useState<Ticket[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<FilterStatus>('pending')

    const load = useCallback(async () => {
        setLoading(true)
        const res = await fetch('/api/training/tickets')
        if (res.ok) {
            const data = await res.json()
            setTickets(data.tickets)
        }
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    const FILTERS: { key: FilterStatus; label: string }[] = [
        { key: 'pending', label: 'Pending' },
        { key: 'amendments_requested', label: 'Amendments' },
        { key: 'approved', label: 'Approved' },
        { key: 'rejected', label: 'Rejected' },
        { key: 'all', label: 'All' },
    ]

    const visible = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)

    return (
        <div style={{ padding: 'clamp(1rem, 2vw, 2rem)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Filter strip */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {FILTERS.map(f => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        style={{
                            fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                            padding: '4px 12px',
                            background: filter === f.key ? 'rgba(219,0,29,0.25)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${filter === f.key ? 'rgba(219,0,29,0.45)' : 'rgba(255,255,255,0.08)'}`,
                            color: filter === f.key ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.4)',
                            cursor: 'pointer',
                        }}
                    >
                        {f.label}
                        {f.key !== 'all' && (
                            <span style={{ marginLeft: 5, opacity: 0.5 }}>
                                ({tickets.filter(t => t.status === f.key).length})
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Ticket list */}
            {loading ? (
                <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.1em' }}>Loading…</div>
            ) : visible.length === 0 ? (
                <div style={{ padding: '48px 0', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>
                    No {filter === 'all' ? '' : filter.replace('_', ' ')} tickets
                </div>
            ) : (
                <div>
                    {visible.map(t => (
                        <TicketCard key={t._id} ticket={t} isJ3Lead={isJ3Lead} onRefresh={load} />
                    ))}
                </div>
            )}
        </div>
    )
}
