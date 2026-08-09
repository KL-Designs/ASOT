'use client'

import { useEffect, useState } from 'react'
import { Add, CheckCircle, Cancel, Edit, Delete } from '@mui/icons-material'

const RED = '#db001d'

type TType = { _id: string; name: string; category: string; billetField: string; billetPoints: number; durationMinutes?: number; server?: string }

type TEvent = {
    _id: string
    trainingTypeId: string
    trainingTypeName: string
    title: string
    description?: string
    scheduledAt: string
    durationMinutes?: number
    server?: string
    requiredMods?: string[]
    maxAttendees?: number
    trainerSlots: number
    maxTraineeSlots?: number
    maxSitInSlots?: number
    location?: string
    trainerId: string
    trainerName: string
    status: 'Scheduled' | 'Completed' | 'Cancelled'
    approvalStatus: 'pending' | 'approved' | 'rejected'
    approvedByName?: string
    rejectionReason?: string
    completionNotes?: string
    isJ3Training: boolean
}

type SlotCounts = { trainer: number; trainee: number; sitIn: number; traineeWaitlist: number; sitInWaitlist: number }
type MyRsvp = { slotType: string; rsvpStatus: string }

type AttendanceRecord = {
    _id: string
    eventId: string
    memberId: string
    memberName: string
    slotType?: string
    rsvpStatus: 'attending' | 'not_attending' | 'waitlist'
    attended?: boolean
    qualificationAwarded?: boolean
}

type SubmitForm = {
    trainingTypeId: string
    title: string
    description: string
    scheduledAt: string
    durationMinutes: number
    server: string
    requiredModsRaw: string
    location: string
    trainerSlots: number
    maxTraineeSlots: string
    maxSitInSlots: string
    isJ3Training: boolean
}

type EditForm = SubmitForm & { id: string }

const APPROVAL_COLORS: Record<string, string> = {
    pending: 'rgba(255,200,50,0.75)',
    approved: 'rgba(80,200,120,0.8)',
    rejected: 'rgba(219,0,29,0.8)',
}

const APPROVAL_LABELS: Record<string, string> = {
    pending: 'Pending Approval',
    approved: 'Approved',
    rejected: 'Rejected',
}

const SLOT_COLORS: Record<string, string> = {
    trainer: 'rgba(219,0,29,0.7)',
    trainee: 'rgba(80,200,120,0.7)',
    'sit-in': 'rgba(120,160,220,0.7)',
}

const SLOT_LABELS: Record<string, string> = {
    trainer: 'Trainer',
    trainee: 'Trainee',
    'sit-in': 'Sit-In',
}

function fmt(iso: string) {
    const d = new Date(iso)
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function localDatetimeValue(iso?: string) {
    if (!iso) {
        const now = new Date()
        now.setMinutes(0, 0, 0)
        now.setHours(now.getHours() + 1)
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

function SlotPill({ slotType, rsvpStatus }: { slotType: string; rsvpStatus: string }) {
    const color = SLOT_COLORS[slotType] ?? 'rgba(237,237,237,0.4)'
    return (
        <span style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color, border: `1px solid ${color.replace('0.7', '0.3')}`, padding: '2px 6px', flexShrink: 0 }}>
            {SLOT_LABELS[slotType] ?? slotType}{rsvpStatus === 'waitlist' ? ' (Waitlist)' : ''}
        </span>
    )
}

function EventCard({ event, isJ3Lead, isTrainer, isJ3Trainer, myId, myRsvp, slotCounts, onRsvp, onCancelRsvp, rsvping, isTrainerOfThis, onViewAttendance, attendanceExpanded, onApprove, onRejectOpen, onCancel, onEdit, onComplete }: {
    event: TEvent
    isJ3Lead: boolean
    isTrainer: boolean
    isJ3Trainer: boolean
    myId: string
    myRsvp?: MyRsvp
    slotCounts?: SlotCounts
    onRsvp?: (slotType: string) => void
    onCancelRsvp?: () => void
    rsvping?: boolean
    isTrainerOfThis?: boolean
    onViewAttendance?: () => void
    attendanceExpanded?: boolean
    onApprove: () => void
    onRejectOpen: () => void
    onCancel: () => void
    onEdit: () => void
    onComplete: () => void
}) {
    const isOwn = event.trainerId === myId
    const isPending = event.approvalStatus === 'pending'
    const isCancelled = event.status === 'Cancelled'
    const isScheduled = event.approvalStatus === 'approved' && event.status === 'Scheduled'
    const hasRsvp = myRsvp && myRsvp.rsvpStatus !== 'not_attending'
    const sc = slotCounts ?? { trainer: 0, trainee: 0, sitIn: 0, traineeWaitlist: 0, sitInWaitlist: 0 }

    return (
        <div style={{
            border: '1px solid rgba(255,255,255,0.07)',
            borderLeft: `3px solid ${isPending ? 'rgba(255,200,50,0.5)' : isCancelled ? 'rgba(255,255,255,0.12)' : 'rgba(219,0,29,0.4)'}`,
            background: 'rgba(255,255,255,0.02)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            opacity: isCancelled ? 0.5 : 1,
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', border: '1px solid rgba(219,0,29,0.25)', padding: '2px 7px', flexShrink: 0 }}>
                            {event.trainingTypeName}
                        </span>
                        <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: APPROVAL_COLORS[event.approvalStatus], flexShrink: 0 }}>
                            {isCancelled ? 'Cancelled' : APPROVAL_LABELS[event.approvalStatus]}
                        </span>
                        {!event.isJ3Training && (
                            <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(120,160,220,0.7)', border: '1px solid rgba(120,160,220,0.25)', padding: '2px 5px', flexShrink: 0 }}>
                                All Staff
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)', lineHeight: 1.3 }}>
                        {event.title}
                    </div>
                </div>
                {/* J3 lead approve/reject controls */}
                {isJ3Lead && isPending && !isCancelled && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button type='button' onClick={onApprove}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', background: 'rgba(80,200,120,0.12)', border: '1px solid rgba(80,200,120,0.3)', color: 'rgba(80,200,120,0.9)', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            <CheckCircle style={{ fontSize: 12 }} /> Approve
                        </button>
                        <button type='button' onClick={onRejectOpen}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.3)', color: 'rgba(219,0,29,0.8)', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            <Cancel style={{ fontSize: 12 }} /> Reject
                        </button>
                    </div>
                )}
                {/* Trainer: edit/cancel pending own events */}
                {isTrainer && isOwn && !isCancelled && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {isPending && (
                            <button type='button' onClick={onEdit}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                <Edit style={{ fontSize: 11 }} /> Edit
                            </button>
                        )}
                        <button type='button' onClick={onCancel}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'transparent', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.5)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            <Delete style={{ fontSize: 11 }} /> Cancel
                        </button>
                    </div>
                )}
                {/* J3 lead controls on approved events */}
                {isJ3Lead && !isPending && !isCancelled && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {event.status === 'Scheduled' && (
                            <button type='button' onClick={onComplete}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(80,200,120,0.08)', border: '1px solid rgba(80,200,120,0.25)', color: 'rgba(80,200,120,0.7)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                <CheckCircle style={{ fontSize: 11 }} /> Complete
                            </button>
                        )}
                        <button type='button' onClick={onCancel}
                            style={{ padding: '5px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.25)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            Cancel
                        </button>
                    </div>
                )}
                {/* Trainer can mark their own approved+Scheduled event complete */}
                {!isJ3Lead && isTrainer && isOwn && !isPending && !isCancelled && event.status === 'Scheduled' && (
                    <button type='button' onClick={onComplete}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(80,200,120,0.08)', border: '1px solid rgba(80,200,120,0.25)', color: 'rgba(80,200,120,0.7)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0 }}>
                        <CheckCircle style={{ fontSize: 11 }} /> Complete
                    </button>
                )}
            </div>

            {event.description && (
                <div style={{ fontSize: '0.73rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.5 }}>{event.description}</div>
            )}

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)' }}>
                <span><span style={{ color: 'rgba(237,237,237,0.22)', marginRight: 4 }}>Date</span>{fmt(event.scheduledAt)}</span>
                {event.durationMinutes && <span><span style={{ color: 'rgba(237,237,237,0.22)', marginRight: 4 }}>Duration</span>{event.durationMinutes}m</span>}
                {event.server && <span><span style={{ color: 'rgba(237,237,237,0.22)', marginRight: 4 }}>Server</span>{event.server}</span>}
                {event.location && <span><span style={{ color: 'rgba(237,237,237,0.22)', marginRight: 4 }}>Location</span>{event.location}</span>}
                <span><span style={{ color: 'rgba(237,237,237,0.22)', marginRight: 4 }}>Trainer</span>{event.trainerName}</span>
            </div>

            {event.requiredMods && event.requiredMods.length > 0 && (
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,180,50,0.6)', letterSpacing: '0.04em' }}>
                    <span style={{ color: 'rgba(237,237,237,0.22)', marginRight: 4 }}>Required Mods:</span>
                    {event.requiredMods.join(', ')}
                </div>
            )}

            {event.approvalStatus === 'rejected' && event.rejectionReason && (
                <div style={{ fontSize: '0.68rem', color: 'rgba(219,0,29,0.7)', borderLeft: '2px solid rgba(219,0,29,0.3)', paddingLeft: 8, marginTop: 2 }}>
                    Rejected: {event.rejectionReason}
                </div>
            )}
            {event.approvalStatus === 'approved' && event.approvedByName && (
                <div style={{ fontSize: '0.62rem', color: 'rgba(80,200,120,0.5)', marginTop: 2 }}>
                    Approved by {event.approvedByName}
                </div>
            )}

            {/* Slot-based RSVP — approved+Scheduled events */}
            {isScheduled && onRsvp && (
                <div style={{ marginTop: 4, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Slot counts */}
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.6rem', color: 'rgba(219,0,29,0.55)', letterSpacing: '0.06em' }}>
                            Trainers: {sc.trainer}/{event.trainerSlots ?? 1}
                        </span>
                        <span style={{ fontSize: '0.6rem', color: 'rgba(80,200,120,0.55)', letterSpacing: '0.06em' }}>
                            Trainees: {sc.trainee}{event.maxTraineeSlots ? `/${event.maxTraineeSlots}` : ''}{sc.traineeWaitlist > 0 ? ` (+${sc.traineeWaitlist} waitlist)` : ''}
                        </span>
                        <span style={{ fontSize: '0.6rem', color: 'rgba(120,160,220,0.55)', letterSpacing: '0.06em' }}>
                            Sit-Ins: {sc.sitIn}{event.maxSitInSlots ? `/${event.maxSitInSlots}` : ''}{sc.sitInWaitlist > 0 ? ` (+${sc.sitInWaitlist} waitlist)` : ''}
                        </span>
                    </div>

                    {/* My current RSVP */}
                    {hasRsvp ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <SlotPill slotType={myRsvp!.slotType} rsvpStatus={myRsvp!.rsvpStatus} />
                            <button type='button' onClick={onCancelRsvp} disabled={!!rsvping}
                                style={{ padding: '3px 9px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.3)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: rsvping ? 'default' : 'pointer', opacity: rsvping ? 0.5 : 1 }}>
                                Cancel RSVP
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {/* Trainer slot — J3 trainers only, and only if slots available */}
                            {isJ3Trainer && sc.trainer < (event.trainerSlots ?? 1) && (
                                <button type='button' onClick={() => onRsvp('trainer')} disabled={!!rsvping}
                                    style={{ padding: '4px 12px', background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.3)', color: 'rgba(219,0,29,0.7)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: rsvping ? 'default' : 'pointer', opacity: rsvping ? 0.5 : 1 }}>
                                    Join as Trainer
                                </button>
                            )}
                            <button type='button' onClick={() => onRsvp('trainee')} disabled={!!rsvping}
                                style={{ padding: '4px 12px', background: 'rgba(80,200,120,0.1)', border: '1px solid rgba(80,200,120,0.25)', color: 'rgba(80,200,120,0.75)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: rsvping ? 'default' : 'pointer', opacity: rsvping ? 0.5 : 1 }}>
                                Attend{event.maxTraineeSlots && sc.trainee >= event.maxTraineeSlots ? ' (Waitlist)' : ''}
                            </button>
                            <button type='button' onClick={() => onRsvp('sit-in')} disabled={!!rsvping}
                                style={{ padding: '4px 12px', background: 'rgba(120,160,220,0.08)', border: '1px solid rgba(120,160,220,0.2)', color: 'rgba(120,160,220,0.7)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: rsvping ? 'default' : 'pointer', opacity: rsvping ? 0.5 : 1 }}>
                                Sit In{event.maxSitInSlots && sc.sitIn >= event.maxSitInSlots ? ' (Waitlist)' : ''}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Attendance button for trainer/J3 lead */}
            {isTrainerOfThis && event.approvalStatus === 'approved' && onViewAttendance && (
                <button type='button' onClick={onViewAttendance}
                    style={{ marginTop: 4, padding: '5px 12px', background: attendanceExpanded ? 'rgba(255,255,255,0.06)' : 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.45)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', alignSelf: 'flex-start' }}>
                    {attendanceExpanded ? '▲ Hide Attendance' : '▼ Attendance List'}
                </button>
            )}
        </div>
    )
}

export default function EventsTab({ isJ3Lead, isTrainer, isJ3Trainer }: { isJ3Lead: boolean; isTrainer: boolean; isJ3Trainer: boolean }) {
    const [events, setEvents] = useState<TEvent[]>([])
    const [types, setTypes] = useState<TType[]>([])
    const [loading, setLoading] = useState(true)
    const [myId, setMyId] = useState('')

    // Slot / RSVP state
    const [slotCounts, setSlotCounts] = useState<Record<string, SlotCounts>>({})
    const [myRsvps, setMyRsvps] = useState<Record<string, MyRsvp>>({})
    const [rsvpingId, setRsvpingId] = useState<string | null>(null)

    // Attendance state
    const [attendanceView, setAttendanceView] = useState<string | null>(null)
    const [attendanceData, setAttendanceData] = useState<Record<string, AttendanceRecord[]>>({})
    const [loadingAttendance, setLoadingAttendance] = useState(false)
    const [attendanceDirty, setAttendanceDirty] = useState<Record<string, boolean>>({})
    const [savingAttendance, setSavingAttendance] = useState(false)

    // Submit / edit form
    const [showSubmit, setShowSubmit] = useState(false)
    const [submitForm, setSubmitForm] = useState<SubmitForm>({ trainingTypeId: '', title: '', description: '', scheduledAt: localDatetimeValue(), durationMinutes: 60, server: '', requiredModsRaw: '', location: '', trainerSlots: 1, maxTraineeSlots: '', maxSitInSlots: '', isJ3Training: isJ3Trainer })
    const [editForm, setEditForm] = useState<EditForm | null>(null)
    const [submitting, setSubmitting] = useState(false)

    // Modals
    const [rejectTargetId, setRejectTargetId] = useState<string | null>(null)
    const [rejectReason, setRejectReason] = useState('')
    const [rejecting, setRejecting] = useState(false)
    const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null)
    const [cancelling, setCancelling] = useState(false)
    const [approvingId, setApprovingId] = useState<string | null>(null)
    const [completeModal, setCompleteModal] = useState<{ eventId: string; notes: string } | null>(null)
    const [completing, setCompleting] = useState(false)
    const [awardingQualId, setAwardingQualId] = useState<string | null>(null)
    const [qualResults, setQualResults] = useState<Record<string, { awarded: number; certLabel: string | null }>>({})

    useEffect(() => {
        Promise.all([
            fetch('/api/training/events').then(r => r.json()),
            fetch('/api/training/types').then(r => r.json()),
        ]).then(([evData, typeData]) => {
            setEvents(evData.events ?? [])
            setMyId(evData.myId ?? '')
            setSlotCounts(evData.slotCounts ?? {})
            setMyRsvps(evData.myRsvps ?? {})
            setTypes((typeData.types ?? []).filter((t: TType & { isActive: boolean; status: string }) => t.isActive || t.status === 'active'))
            setLoading(false)
        }).catch(() => setLoading(false))
    }, [])

    function openSubmit() {
        const defaultType = types[0]
        setSubmitForm({
            trainingTypeId: defaultType?._id ?? '',
            title: defaultType?.name ?? '',
            description: '',
            scheduledAt: localDatetimeValue(),
            durationMinutes: defaultType?.durationMinutes ?? 60,
            server: defaultType?.server ?? '',
            requiredModsRaw: '',
            location: '',
            trainerSlots: 1,
            maxTraineeSlots: '',
            maxSitInSlots: '',
            isJ3Training: isJ3Trainer,
        })
        setShowSubmit(true)
    }

    async function handleSubmit() {
        if (submitting || !submitForm.title.trim() || !submitForm.trainingTypeId || !submitForm.scheduledAt) return
        setSubmitting(true)
        try {
            const res = await fetch('/api/training/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    trainingTypeId: submitForm.trainingTypeId,
                    title: submitForm.title.trim(),
                    description: submitForm.description.trim() || undefined,
                    scheduledAt: new Date(submitForm.scheduledAt).toISOString(),
                    durationMinutes: submitForm.durationMinutes,
                    server: submitForm.server.trim() || undefined,
                    requiredMods: submitForm.requiredModsRaw.split(',').map(s => s.trim()).filter(Boolean),
                    location: submitForm.location.trim() || undefined,
                    trainerSlots: submitForm.trainerSlots,
                    maxTraineeSlots: submitForm.maxTraineeSlots ? parseInt(submitForm.maxTraineeSlots) || undefined : undefined,
                    maxSitInSlots: submitForm.maxSitInSlots ? parseInt(submitForm.maxSitInSlots) || undefined : undefined,
                    isJ3Training: submitForm.isJ3Training,
                }),
            })
            if (!res.ok) return
            const created = await res.json()
            setEvents(prev => [created, ...prev])
            setShowSubmit(false)
        } finally {
            setSubmitting(false)
        }
    }

    async function handleEdit() {
        if (!editForm || submitting) return
        setSubmitting(true)
        try {
            const res = await fetch(`/api/training/events/${editForm.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: editForm.title.trim(),
                    description: editForm.description.trim() || undefined,
                    scheduledAt: new Date(editForm.scheduledAt).toISOString(),
                    durationMinutes: editForm.durationMinutes,
                    server: editForm.server.trim() || undefined,
                    requiredMods: editForm.requiredModsRaw.split(',').map(s => s.trim()).filter(Boolean),
                    location: editForm.location.trim() || undefined,
                    trainerSlots: editForm.trainerSlots,
                    maxTraineeSlots: editForm.maxTraineeSlots ? parseInt(editForm.maxTraineeSlots) || undefined : undefined,
                    maxSitInSlots: editForm.maxSitInSlots ? parseInt(editForm.maxSitInSlots) || undefined : undefined,
                    trainingTypeId: editForm.trainingTypeId,
                }),
            })
            if (!res.ok) return
            const updated = await res.json()
            setEvents(prev => prev.map(e => e._id === updated._id ? updated : e))
            setEditForm(null)
        } finally {
            setSubmitting(false)
        }
    }

    async function handleApprove(eventId: string) {
        if (approvingId) return
        setApprovingId(eventId)
        try {
            const res = await fetch(`/api/training/events/${eventId}/approve`, { method: 'POST' })
            if (!res.ok) return
            const updated = await res.json()
            setEvents(prev => prev.map(e => e._id === updated._id ? updated : e))
        } finally {
            setApprovingId(null)
        }
    }

    async function handleReject() {
        if (!rejectTargetId || rejecting) return
        setRejecting(true)
        try {
            const res = await fetch(`/api/training/events/${rejectTargetId}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: rejectReason.trim() || undefined }),
            })
            if (!res.ok) return
            const updated = await res.json()
            setEvents(prev => prev.map(e => e._id === updated._id ? updated : e))
            setRejectTargetId(null)
            setRejectReason('')
        } finally {
            setRejecting(false)
        }
    }

    async function handleCancel(eventId: string) {
        if (cancelling) return
        setCancelling(true)
        try {
            const res = await fetch(`/api/training/events/${eventId}/cancel`, { method: 'POST' })
            if (!res.ok) return
            const updated = await res.json()
            setEvents(prev => prev.map(e => e._id === updated._id ? updated : e))
            setCancelConfirmId(null)
        } finally {
            setCancelling(false)
        }
    }

    async function handleComplete() {
        if (!completeModal || completing) return
        setCompleting(true)
        try {
            const res = await fetch(`/api/training/events/${completeModal.eventId}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completionNotes: completeModal.notes.trim() || undefined }),
            })
            if (!res.ok) return
            const updated = await res.json()
            setEvents(prev => prev.map(e => e._id === updated._id ? updated : e))
            setCompleteModal(null)
        } finally {
            setCompleting(false)
        }
    }

    function openEditModal(ev: TEvent) {
        setEditForm({
            id: ev._id,
            trainingTypeId: ev.trainingTypeId,
            title: ev.title,
            description: ev.description ?? '',
            scheduledAt: localDatetimeValue(ev.scheduledAt),
            durationMinutes: ev.durationMinutes ?? 60,
            server: ev.server ?? '',
            requiredModsRaw: (ev.requiredMods ?? []).join(', '),
            location: ev.location ?? '',
            trainerSlots: ev.trainerSlots ?? 1,
            maxTraineeSlots: ev.maxTraineeSlots?.toString() ?? '',
            maxSitInSlots: ev.maxSitInSlots?.toString() ?? '',
            isJ3Training: ev.isJ3Training,
        })
    }

    async function handleRsvp(eventId: string, slotType: string) {
        if (rsvpingId) return
        setRsvpingId(eventId)
        try {
            const res = await fetch(`/api/training/events/${eventId}/attendance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slotType }),
            })
            if (!res.ok) return
            const record = await res.json()
            setMyRsvps(prev => ({ ...prev, [eventId]: { slotType: record.slotType ?? slotType, rsvpStatus: record.rsvpStatus } }))
            const refresh = await fetch('/api/training/events').then(r => r.json())
            setSlotCounts(refresh.slotCounts ?? {})
        } finally {
            setRsvpingId(null)
        }
    }

    async function handleCancelRsvp(eventId: string) {
        if (rsvpingId) return
        setRsvpingId(eventId)
        try {
            const res = await fetch(`/api/training/events/${eventId}/attendance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cancel: true }),
            })
            if (!res.ok) return
            setMyRsvps(prev => ({ ...prev, [eventId]: { slotType: prev[eventId]?.slotType ?? 'trainee', rsvpStatus: 'not_attending' } }))
            const refresh = await fetch('/api/training/events').then(r => r.json())
            setSlotCounts(refresh.slotCounts ?? {})
        } finally {
            setRsvpingId(null)
        }
    }

    async function handleLoadAttendance(eventId: string) {
        if (attendanceView === eventId) { setAttendanceView(null); return }
        setAttendanceView(eventId)
        if (attendanceData[eventId]) return
        setLoadingAttendance(true)
        try {
            const res = await fetch(`/api/training/events/${eventId}/attendance`)
            if (!res.ok) return
            const data = await res.json()
            setAttendanceData(prev => ({ ...prev, [eventId]: data.records ?? [] }))
            const dirty: Record<string, boolean> = {}
            for (const r of (data.records ?? []) as AttendanceRecord[]) {
                if (r.rsvpStatus === 'attending') dirty[r.memberId] = r.attended ?? false
            }
            setAttendanceDirty(dirty)
        } finally {
            setLoadingAttendance(false)
        }
    }

    async function handleSaveAttendance(eventId: string) {
        if (savingAttendance) return
        setSavingAttendance(true)
        try {
            const updates = Object.entries(attendanceDirty).map(([memberId, attended]) => ({ memberId, attended }))
            await fetch(`/api/training/events/${eventId}/attendance`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates }),
            })
            const res = await fetch(`/api/training/events/${eventId}/attendance`)
            if (res.ok) {
                const data = await res.json()
                setAttendanceData(prev => ({ ...prev, [eventId]: data.records ?? [] }))
            }
        } finally {
            setSavingAttendance(false)
        }
    }

    async function handleAwardQualifications(eventId: string) {
        if (awardingQualId) return
        setAwardingQualId(eventId)
        try {
            const res = await fetch(`/api/training/events/${eventId}/award-qualifications`, { method: 'POST' })
            if (!res.ok) return
            const data = await res.json()
            setQualResults(prev => ({ ...prev, [eventId]: data }))
            const aRes = await fetch(`/api/training/events/${eventId}/attendance`)
            if (aRes.ok) {
                const aData = await aRes.json()
                setAttendanceData(prev => ({ ...prev, [eventId]: aData.records ?? [] }))
            }
        } finally {
            setAwardingQualId(null)
        }
    }

    const pending = events.filter(e => e.approvalStatus === 'pending' && e.status !== 'Cancelled')
    const upcoming = events.filter(e => e.approvalStatus === 'approved' && e.status === 'Scheduled')
    const past = events.filter(e => e.status === 'Completed' || (e.status === 'Cancelled' && e.approvalStatus === 'approved'))
    const myEvents = events.filter(e => e.trainerId === myId && e.approvalStatus !== 'approved')

    const canSubmit = isJ3Lead || isTrainer

    function renderSection(label: string, items: TEvent[], emptyMsg: string) {
        return (
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', flexShrink: 0 }}>{label}</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                    <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.1em', flexShrink: 0 }}>{items.length}</span>
                </div>
                {items.length === 0 ? (
                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.06em', paddingBottom: 4 }}>{emptyMsg}</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {items.map(ev => (
                            <div key={ev._id}>
                                <EventCard
                                    event={ev}
                                    isJ3Lead={isJ3Lead}
                                    isTrainer={isTrainer}
                                    isJ3Trainer={isJ3Trainer}
                                    myId={myId}
                                    myRsvp={myRsvps[ev._id]}
                                    slotCounts={slotCounts[ev._id]}
                                    onRsvp={ev.approvalStatus === 'approved' && ev.status === 'Scheduled' ? (slotType) => handleRsvp(ev._id, slotType) : undefined}
                                    onCancelRsvp={() => handleCancelRsvp(ev._id)}
                                    rsvping={rsvpingId === ev._id}
                                    isTrainerOfThis={isJ3Lead || ev.trainerId === myId}
                                    onViewAttendance={() => handleLoadAttendance(ev._id)}
                                    attendanceExpanded={attendanceView === ev._id}
                                    onApprove={() => handleApprove(ev._id)}
                                    onRejectOpen={() => { setRejectTargetId(ev._id); setRejectReason('') }}
                                    onCancel={() => setCancelConfirmId(ev._id)}
                                    onEdit={() => openEditModal(ev)}
                                    onComplete={() => setCompleteModal({ eventId: ev._id, notes: '' })}
                                />
                                {/* Attendance panel */}
                                {attendanceView === ev._id && (isJ3Lead || ev.trainerId === myId) && (
                                    <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderTop: 'none', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {loadingAttendance && !attendanceData[ev._id] ? (
                                            <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)' }}>Loading…</div>
                                        ) : (attendanceData[ev._id] ?? []).filter(r => r.rsvpStatus !== 'not_attending').length === 0 ? (
                                            <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)' }}>No RSVPs yet</div>
                                        ) : (
                                            <>
                                                {(attendanceData[ev._id] ?? []).filter(r => r.rsvpStatus !== 'not_attending').map(r => (
                                                    <div key={r.memberId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <input type='checkbox'
                                                            checked={attendanceDirty[r.memberId] ?? r.attended ?? false}
                                                            onChange={e => setAttendanceDirty(prev => ({ ...prev, [r.memberId]: e.target.checked }))}
                                                            disabled={r.rsvpStatus === 'waitlist'}
                                                            style={{ accentColor: '#db001d', width: 14, height: 14 }}
                                                        />
                                                        <span style={{ fontSize: '0.72rem', color: r.rsvpStatus === 'waitlist' ? 'rgba(237,237,237,0.35)' : 'rgba(237,237,237,0.7)', flex: 1 }}>{r.memberName}</span>
                                                        {r.slotType && <SlotPill slotType={r.slotType} rsvpStatus={r.rsvpStatus} />}
                                                        {!r.slotType && <span style={{ fontSize: '0.55rem', color: 'rgba(80,200,120,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{r.rsvpStatus}</span>}
                                                    </div>
                                                ))}
                                                <button type='button' onClick={() => handleSaveAttendance(ev._id)} disabled={savingAttendance}
                                                    style={{ alignSelf: 'flex-end', padding: '5px 14px', background: savingAttendance ? 'rgba(219,0,29,0.3)' : '#db001d', border: 'none', color: '#fff', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: savingAttendance ? 'default' : 'pointer', marginTop: 4 }}>
                                                    {savingAttendance ? 'Saving…' : 'Save Attendance'}
                                                </button>
                                            </>
                                        )}
                                        {isJ3Lead && ev.status === 'Completed' && (
                                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                                                <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', letterSpacing: '0.06em' }}>
                                                    {qualResults[ev._id] != null
                                                        ? qualResults[ev._id].awarded === 0 ? 'All qualifications already awarded' : `Awarded ${qualResults[ev._id].certLabel ?? 'qualification'} to ${qualResults[ev._id].awarded} member${qualResults[ev._id].awarded !== 1 ? 's' : ''}`
                                                        : (attendanceData[ev._id] ?? []).some(r => r.attended && !r.qualificationAwarded) ? 'Qualifications not yet awarded' : 'All qualifications awarded'
                                                    }
                                                </div>
                                                {(qualResults[ev._id] == null || qualResults[ev._id].awarded > 0) && (attendanceData[ev._id] ?? []).some(r => r.attended && !r.qualificationAwarded) && (
                                                    <button type='button' onClick={() => handleAwardQualifications(ev._id)} disabled={awardingQualId === ev._id}
                                                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', background: 'rgba(80,200,120,0.12)', border: '1px solid rgba(80,200,120,0.3)', color: 'rgba(80,200,120,0.85)', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: awardingQualId === ev._id ? 'default' : 'pointer' }}>
                                                        <CheckCircle style={{ fontSize: 11 }} /> {awardingQualId === ev._id ? 'Awarding…' : 'Award Qualifications'}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    function renderEventForm(
        form: SubmitForm | EditForm,
        setForm: (fn: (prev: SubmitForm) => SubmitForm) => void,
        isEdit: boolean,
        onClose: () => void,
        onSave: () => void,
    ) {
        return (
            <div
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                onClick={e => { if (e.target === e.currentTarget) onClose() }}
            >
                <div style={{ background: '#0e0e0e', border: `1px solid rgba(219,0,29,0.25)`, borderTop: `3px solid ${RED}`, padding: 28, width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 6 }}>
                            {'//'} {isEdit ? 'EDIT' : 'SUBMIT'} TRAINING REQUEST
                        </div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                            {isEdit ? 'Edit Training Request' : 'Request Training Session'}
                        </h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {!isEdit && (
                            <Field label='Training Course *'>
                                <select value={form.trainingTypeId}
                                    onChange={e => {
                                        const t = types.find(t => t._id === e.target.value)
                                        setForm(prev => ({ ...prev, trainingTypeId: e.target.value, title: t?.name ?? prev.title, durationMinutes: t?.durationMinutes ?? prev.durationMinutes, server: t?.server ?? prev.server }))
                                    }}
                                    style={{ ...inputStyle, cursor: 'pointer' }}>
                                    <option value=''>Select a course…</option>
                                    {types.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                                </select>
                            </Field>
                        )}
                        <Field label='Session Title *'>
                            <input value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                                placeholder='e.g. BCT 1 — Alpha Platoon' autoFocus={isEdit} style={inputStyle} />
                        </Field>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
                            <Field label='Date & Time *'>
                                <input type='datetime-local' value={form.scheduledAt}
                                    onChange={e => setForm(prev => ({ ...prev, scheduledAt: e.target.value }))}
                                    style={inputStyle} />
                            </Field>
                            <Field label='Duration (min)'>
                                <input type='number' min={15} step={15} value={form.durationMinutes}
                                    onChange={e => setForm(prev => ({ ...prev, durationMinutes: Math.max(15, parseInt(e.target.value) || 60) }))}
                                    style={{ ...inputStyle, width: 80 }} />
                            </Field>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Field label='Server'>
                                <input value={form.server} onChange={e => setForm(prev => ({ ...prev, server: e.target.value }))}
                                    placeholder='e.g. Training Server' style={inputStyle} />
                            </Field>
                            <Field label='Location'>
                                <input value={form.location} onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
                                    placeholder='e.g. TS — J3 Channel' style={inputStyle} />
                            </Field>
                        </div>
                        <Field label='Required Mods (comma-separated)'>
                            <input value={form.requiredModsRaw} onChange={e => setForm(prev => ({ ...prev, requiredModsRaw: e.target.value }))}
                                placeholder='e.g. ACE, TFAR' style={inputStyle} />
                        </Field>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <Field label='Trainer Slots'>
                                <input type='number' min={1} step={1} value={form.trainerSlots}
                                    onChange={e => setForm(prev => ({ ...prev, trainerSlots: Math.max(1, parseInt(e.target.value) || 1) }))}
                                    style={inputStyle} />
                            </Field>
                            <Field label='Max Trainees'>
                                <input type='number' min={1} step={1} value={form.maxTraineeSlots}
                                    onChange={e => setForm(prev => ({ ...prev, maxTraineeSlots: e.target.value }))}
                                    placeholder='Unlimited' style={inputStyle} />
                            </Field>
                            <Field label='Max Sit-Ins'>
                                <input type='number' min={1} step={1} value={form.maxSitInSlots}
                                    onChange={e => setForm(prev => ({ ...prev, maxSitInSlots: e.target.value }))}
                                    placeholder='Unlimited' style={inputStyle} />
                            </Field>
                        </div>
                        <Field label='Description'>
                            <input value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                                placeholder='Any additional info for attendees (optional)' style={inputStyle} />
                        </Field>
                        {isJ3Trainer && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <input type='checkbox' id='isJ3Training' checked={form.isJ3Training}
                                    onChange={e => setForm(prev => ({ ...prev, isJ3Training: e.target.checked }))}
                                    style={{ accentColor: RED, width: 14, height: 14 }} />
                                <label htmlFor='isJ3Training' style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.5)', cursor: 'pointer' }}>
                                    J3 Training (awards J3 billet points; uncheck for All Staff events)
                                </label>
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                        <button type='button' onClick={onClose}
                            style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.45)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            Cancel
                        </button>
                        <button type='button' onClick={onSave}
                            disabled={!form.title.trim() || (!isEdit && !form.trainingTypeId) || !form.scheduledAt || submitting}
                            style={{ padding: '8px 20px', background: form.title.trim() && (isEdit || form.trainingTypeId) && form.scheduledAt && !submitting ? RED : 'rgba(219,0,29,0.3)', border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Submit Request'}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, padding: 'clamp(1.5rem, 3vw, 2.5rem)', paddingTop: 24 }}>
            {canSubmit && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type='button' onClick={openSubmit}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>
                        <Add style={{ fontSize: 15 }} /> Submit Training Request
                    </button>
                </div>
            )}

            {loading ? (
                <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.1em' }}>Loading…</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
                    {isJ3Lead && renderSection('Pending Approval', pending, 'No events pending approval')}
                    {(isJ3Lead || isTrainer) && myEvents.length > 0 && renderSection('My Submitted Events', myEvents, '')}
                    {renderSection('Upcoming', upcoming, 'No upcoming training sessions')}
                    {(isJ3Lead || isTrainer) && renderSection('Past', past, 'No past events')}
                </div>
            )}

            {showSubmit && renderEventForm(submitForm, fn => setSubmitForm(prev => fn(prev)), false, () => setShowSubmit(false), handleSubmit)}
            {editForm && renderEventForm(editForm, fn => setEditForm(prev => prev ? { ...fn(prev as SubmitForm), id: prev.id } : null), true, () => setEditForm(null), handleEdit)}

            {/* Reject modal */}
            {rejectTargetId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) { setRejectTargetId(null); setRejectReason('') } }}>
                    <div style={{ background: '#0e0e0e', border: '1px solid rgba(219,0,29,0.25)', borderTop: `3px solid ${RED}`, padding: 28, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 6 }}>{'//'} REJECT REQUEST</div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Reject Training Request</h3>
                        </div>
                        <Field label='Reason (optional)'>
                            <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} autoFocus
                                placeholder='e.g. Scheduling conflict — please resubmit for next week' style={inputStyle} />
                        </Field>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button type='button' onClick={() => { setRejectTargetId(null); setRejectReason('') }}
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

            {/* Complete modal */}
            {completeModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setCompleteModal(null) }}>
                    <div style={{ background: '#0e0e0e', border: '1px solid rgba(80,200,120,0.2)', borderTop: '3px solid rgba(80,200,120,0.6)', padding: 28, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(80,200,120,0.6)', marginBottom: 6 }}>{'//'} MARK COMPLETE</div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Mark Session Complete</h3>
                            <p style={{ margin: '10px 0 0', fontSize: '0.73rem', color: 'rgba(237,237,237,0.4)' }}>A Training Ticket will be generated for J3 review. Billet points and qualifications are awarded after J3 approves the ticket.</p>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>
                                Completion Notes (optional)
                            </label>
                            <input value={completeModal.notes}
                                onChange={e => setCompleteModal(m => m && ({ ...m, notes: e.target.value }))}
                                placeholder='Any notes on how the session went'
                                autoFocus style={inputStyle} />
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button type='button' onClick={() => setCompleteModal(null)}
                                style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.45)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type='button' onClick={handleComplete} disabled={completing}
                                style={{ padding: '8px 20px', background: completing ? 'rgba(80,200,120,0.2)' : 'rgba(80,200,120,0.75)', border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: completing ? 'default' : 'pointer' }}>
                                {completing ? 'Completing…' : 'Mark Complete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel confirm */}
            {cancelConfirmId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setCancelConfirmId(null) }}>
                    <div style={{ background: '#0e0e0e', border: '1px solid rgba(219,0,29,0.25)', borderTop: `3px solid ${RED}`, padding: 28, width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 6 }}>{'//'} CANCEL EVENT</div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Cancel Training Session?</h3>
                            <p style={{ margin: '10px 0 0', fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)' }}>This will remove the event from the unit calendar if it has been added.</p>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button type='button' onClick={() => setCancelConfirmId(null)}
                                style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.45)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                No, Keep It
                            </button>
                            <button type='button' onClick={() => handleCancel(cancelConfirmId)} disabled={cancelling}
                                style={{ padding: '8px 20px', background: cancelling ? 'rgba(219,0,29,0.3)' : RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: cancelling ? 'default' : 'pointer' }}>
                                {cancelling ? 'Cancelling…' : 'Cancel Session'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
