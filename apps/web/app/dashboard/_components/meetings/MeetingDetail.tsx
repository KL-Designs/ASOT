'use client'

import { useState } from 'react'
import { CircularProgress } from '@mui/material'
import { Delete, Lock, LockOpen, CheckCircle, EmojiEvents, SwapHoriz } from '@mui/icons-material'
import MeetingTaskList from './MeetingTaskList'
import MeetingAttachments from './MeetingAttachments'
import MeetingAttendance from './MeetingAttendance'
import ConfirmDialog from '@/components/confirm-dialog'

interface Props {
    meeting: Meeting
    department: MeetingDepartment
    userId: string
    isLead: boolean
    onUpdate: (m: Meeting) => void
    onDelete: () => void
}

const SECTION_LABEL: React.CSSProperties = {
    fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.2em',
    textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)',
    fontFamily: 'monospace', marginBottom: 8,
}

export default function MeetingDetail({ meeting, department, userId, isLead, onUpdate, onDelete }: Props) {
    const [saving, setSaving]       = useState(false)
    const [locking, setLocking]     = useState(false)
    const [deleting, setDeleting]   = useState(false)
    const [completing, setCompleting]     = useState(false)
    const [transferring, setTransferring] = useState(false)
    const [transferTarget, setTransferTarget] = useState<MeetingDepartment | ''>('')
    const [showTransfer, setShowTransfer] = useState(false)
    const [confirmDelete, setConfirmDelete]   = useState(false)
    const [confirmComplete, setConfirmComplete] = useState(false)
    const [title, setTitle] = useState(meeting.title)
    const [date, setDate]   = useState(meeting.date ? new Date(meeting.date).toISOString().slice(0, 16) : '')
    const [notes, setNotes] = useState(meeting.notes ?? '')

    const id        = meeting._id!.toString()
    const locked    = meeting.locked
    const completed = meeting.completed ?? false
    const disabled  = locked || completed

    async function saveField(field: 'title' | 'date' | 'notes', value: string) {
        if (disabled) return
        setSaving(true)
        try {
            const body: Record<string, string> = {}
            body[field] = value
            const res = await fetch(`/api/admin/meetings/${id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (res.status === 403) {
                const data = await res.json()
                if (data.error === 'Meeting is locked') {
                    const fresh = await fetch(`/api/admin/meetings/${id}`).then(r => r.json())
                    if (fresh.meeting) onUpdate(fresh.meeting)
                }
            }
        } finally { setSaving(false) }
    }

    async function toggleLock() {
        setLocking(true)
        try {
            await fetch(`/api/admin/meetings/${id}/lock`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locked: !locked }),
            })
            const fresh = await fetch(`/api/admin/meetings/${id}`).then(r => r.json())
            if (fresh.meeting) onUpdate(fresh.meeting)
        } finally { setLocking(false) }
    }

    async function doDelete() {
        setDeleting(true)
        try {
            await fetch(`/api/admin/meetings/${id}`, { method: 'DELETE' })
            onDelete()
        } finally { setDeleting(false) }
    }

    async function doComplete() {
        setCompleting(true)
        try {
            await fetch(`/api/admin/meetings/${id}/complete`, { method: 'POST' })
            const fresh = await fetch(`/api/admin/meetings/${id}`).then(r => r.json())
            if (fresh.meeting) onUpdate(fresh.meeting)
        } finally { setCompleting(false) }
    }

    async function doTransfer() {
        if (!transferTarget) return
        setTransferring(true)
        try {
            await fetch(`/api/admin/meetings/${id}/transfer`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetDepartment: transferTarget }),
            })
            setShowTransfer(false)
            setTransferTarget('')
        } finally { setTransferring(false) }
    }

    const ALL_DEPTS: MeetingDepartment[] = ['j1','j2','j3','j4','j5','j6','j7']
    const DEPT_NAMES: Record<MeetingDepartment, string> = {
        j1: 'J1 Recruitment', j2: 'J2 Mission Making', j3: 'J3 Training',
        j4: 'J4 Administration', j5: 'J5 Media', j6: 'J6 Game Masters',
        j7: 'J7 Community Development',
    }

    return (
        <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>

            {/* ── Left column: main content ─────────────────────────────── */}
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Status banners */}
                {completed && (
                    <div style={{ padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.25)', color: 'rgba(74,222,128,0.8)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircle sx={{ fontSize: 14 }} />
                        Meeting completed
                        {meeting.completedByName && <span style={{ fontWeight: 400, opacity: 0.7 }}>by {meeting.completedByName}</span>}
                        {meeting.completedAt && (
                            <span style={{ fontWeight: 400, opacity: 0.5, marginLeft: 'auto', fontSize: '0.6rem' }}>
                                {new Date(meeting.completedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                        )}
                    </div>
                )}
                {locked && !completed && (
                    <div style={{ padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.32)', color: 'rgba(219,0,29,0.8)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Lock sx={{ fontSize: 14 }} />
                        Locked by {meeting.lockedByName}
                        {isLead && (
                            <button onClick={toggleLock} disabled={locking} style={{ all: 'unset', cursor: 'pointer', marginLeft: 'auto', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(219,0,29,0.7)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                {locking ? <CircularProgress size={10} color='inherit' /> : <LockOpen sx={{ fontSize: 12 }} />}
                                Unlock
                            </button>
                        )}
                    </div>
                )}

                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <input
                            value={title} disabled={disabled}
                            onChange={e => setTitle(e.target.value)}
                            onBlur={() => { if (title !== meeting.title) saveField('title', title) }}
                            style={{ all: 'unset', display: 'block', width: '100%', fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--foreground)', borderBottom: disabled ? 'none' : '1px solid rgba(255,255,255,0.08)', paddingBottom: 2, opacity: disabled ? 0.7 : 1 }}
                        />
                        <input
                            type='datetime-local' value={date} disabled={disabled}
                            onChange={e => setDate(e.target.value)}
                            onBlur={() => { if (date !== new Date(meeting.date).toISOString().slice(0, 16)) saveField('date', date) }}
                            style={{ all: 'unset', marginTop: 4, fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', borderBottom: disabled ? 'none' : '1px solid rgba(255,255,255,0.06)', paddingBottom: 1, cursor: disabled ? 'default' : 'pointer', colorScheme: 'dark' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {saving && <CircularProgress size={14} style={{ color: 'rgba(237,237,237,0.3)', alignSelf: 'center' }} />}
                        {isLead && !locked && !completed && (
                            <button onClick={toggleLock} disabled={locking} title='Lock meeting' style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(237,237,237,0.45)', padding: '3px 8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                {locking ? <CircularProgress size={10} color='inherit' /> : <Lock sx={{ fontSize: 11 }} />}
                                Lock
                            </button>
                        )}
                        {isLead && (
                            <button onClick={() => setConfirmDelete(true)} disabled={deleting} title='Delete meeting' style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '3px 6px', color: 'rgba(219,0,29,0.5)', border: '1px solid rgba(219,0,29,0.22)' }}>
                                <Delete sx={{ fontSize: 13 }} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Notes */}
                <div>
                    <div style={SECTION_LABEL}>{'// Notes'}</div>
                    <textarea
                        value={notes} disabled={disabled}
                        onChange={e => setNotes(e.target.value)}
                        onBlur={() => { if (notes !== (meeting.notes ?? '')) saveField('notes', notes) }}
                        placeholder={disabled ? '' : 'Meeting notes…'}
                        rows={6}
                        style={{ width: '100%', resize: 'vertical', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--foreground)', fontSize: '0.78rem', lineHeight: 1.6, padding: '8px 10px', fontFamily: 'inherit', opacity: disabled ? 0.65 : 1 }}
                    />
                </div>

                {/* Tasks */}
                <div>
                    <div style={SECTION_LABEL}>{'// Tasks'}</div>
                    <MeetingTaskList
                        meetingId={id}
                        tasks={meeting.tasks}
                        locked={disabled}
                        userId={userId}
                        department={department}
                        onUpdate={onUpdate}
                        meeting={meeting}
                    />
                </div>

                {/* Attachments */}
                <div>
                    <div style={SECTION_LABEL}>{'// Attachments'}</div>
                    <MeetingAttachments
                        meetingId={id}
                        attachments={meeting.attachments}
                        locked={disabled}
                        onUpdate={onUpdate}
                        meeting={meeting}
                    />
                </div>

                {/* Transfer Notes */}
                {isLead && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
                        {!showTransfer ? (
                            <button onClick={() => setShowTransfer(true)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(0,195,255,0.65)', padding: '5px 12px', border: '1px solid rgba(0,195,255,0.25)', background: 'rgba(0,195,255,0.05)' }}>
                                <SwapHoriz sx={{ fontSize: 14 }} /> Transfer Notes to Department
                            </button>
                        ) : (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.62rem', color: 'rgba(0,195,255,0.6)', fontWeight: 700, letterSpacing: '0.08em' }}>Transfer to:</span>
                                <select value={transferTarget} onChange={e => setTransferTarget(e.target.value as MeetingDepartment)} style={{ all: 'unset', fontSize: '0.72rem', color: 'rgba(237,237,237,0.8)', background: 'rgba(0,195,255,0.06)', border: '1px solid rgba(0,195,255,0.25)', padding: '4px 10px', cursor: 'pointer', colorScheme: 'dark' } as React.CSSProperties}>
                                    <option value=''>— Select department —</option>
                                    {ALL_DEPTS.filter(d => d !== department).map(d => (
                                        <option key={d} value={d}>{DEPT_NAMES[d]}</option>
                                    ))}
                                </select>
                                <button onClick={doTransfer} disabled={transferring || !transferTarget} style={{ all: 'unset', cursor: !transferTarget || transferring ? 'not-allowed' : 'pointer', padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700, background: 'rgba(0,195,255,0.15)', border: '1px solid rgba(0,195,255,0.35)', color: 'rgba(0,195,255,0.9)', opacity: !transferTarget ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                                    {transferring ? <CircularProgress size={11} color='inherit' /> : 'Transfer'}
                                </button>
                                <button onClick={() => { setShowTransfer(false); setTransferTarget('') }} style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', border: '1px solid rgba(255,255,255,0.1)' }}>Cancel</button>
                            </div>
                        )}
                    </div>
                )}

                {/* Complete Meeting */}
                {isLead && !completed && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={() => setConfirmComplete(true)}
                            disabled={completing}
                            style={{ all: 'unset', cursor: completing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.35)', color: 'rgba(74,222,128,0.85)' }}
                        >
                            {completing ? <CircularProgress size={13} color='inherit' /> : <EmojiEvents sx={{ fontSize: 15 }} />}
                            Complete Meeting
                        </button>
                    </div>
                )}
            </div>

            {/* ── Right column: attendance panel ────────────────────────── */}
            <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid rgba(219,0,29,0.15)', overflowY: 'auto', background: 'rgba(219,0,29,0.02)' }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(219,0,29,0.12)' }}>
                    <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', fontFamily: 'monospace' }}>
                        {'// Attendance'}
                    </span>
                </div>
                <div style={{ padding: '12px 14px' }}>
                    <MeetingAttendance
                        meetingId={id}
                        attendees={meeting.attendees ?? []}
                        department={department}
                        userId={userId}
                        isLead={isLead}
                        locked={locked}
                        completed={completed}
                        onUpdate={onUpdate}
                    />
                </div>
            </div>

            {/* Dialogs */}
            <ConfirmDialog
                open={confirmDelete}
                title='Delete meeting?'
                message={`"${meeting.title}" and all its tasks and attachments will be permanently deleted.`}
                danger
                confirmLabel='Delete'
                onConfirm={() => { setConfirmDelete(false); doDelete() }}
                onCancel={() => setConfirmDelete(false)}
            />
            <ConfirmDialog
                open={confirmComplete}
                title='Complete this meeting?'
                message='This will mark the meeting as completed and lock it. The department lead will receive a reminder if attendance is not confirmed within 24 hours.'
                confirmLabel='Complete Meeting'
                onConfirm={() => { setConfirmComplete(false); doComplete() }}
                onCancel={() => setConfirmComplete(false)}
            />
        </div>
    )
}
