'use client'

import { useState } from 'react'
import { CircularProgress } from '@mui/material'
import { Delete, Lock, LockOpen, CheckCircle, EmojiEvents } from '@mui/icons-material'
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
    const [saving, setSaving] = useState(false)
    const [locking, setLocking] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [completing, setCompleting] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [confirmComplete, setConfirmComplete] = useState(false)
    const [title, setTitle] = useState(meeting.title)
    const [date, setDate] = useState(meeting.date ? new Date(meeting.date).toISOString().slice(0, 16) : '')
    const [notes, setNotes] = useState(meeting.notes ?? '')

    const id = meeting._id!.toString()
    const locked = meeting.locked
    const completed = meeting.completed ?? false

    async function saveField(field: 'title' | 'date' | 'notes', value: string) {
        if (locked || completed) return
        setSaving(true)
        try {
            const body: Record<string, string> = {}
            body[field] = value
            const res = await fetch(`/api/admin/meetings/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (res.status === 403) {
                const data = await res.json()
                if (data.error === 'Meeting is locked') {
                    const fresh = await fetch(`/api/admin/meetings/${id}`).then(r => r.json())
                    if (fresh.meeting) onUpdate(fresh.meeting)
                }
            }
        } finally {
            setSaving(false)
        }
    }

    async function toggleLock() {
        setLocking(true)
        try {
            await fetch(`/api/admin/meetings/${id}/lock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locked: !locked }),
            })
            const fresh = await fetch(`/api/admin/meetings/${id}`).then(r => r.json())
            if (fresh.meeting) onUpdate(fresh.meeting)
        } finally {
            setLocking(false)
        }
    }

    async function doDelete() {
        setDeleting(true)
        try {
            await fetch(`/api/admin/meetings/${id}`, { method: 'DELETE' })
            onDelete()
        } finally {
            setDeleting(false)
        }
    }

    async function doComplete() {
        setCompleting(true)
        try {
            await fetch(`/api/admin/meetings/${id}/complete`, { method: 'POST' })
            const fresh = await fetch(`/api/admin/meetings/${id}`).then(r => r.json())
            if (fresh.meeting) onUpdate(fresh.meeting)
        } finally {
            setCompleting(false) }
    }

    return (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Completed banner */}
            {completed && (
                <div style={{
                    padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700,
                    background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.25)',
                    color: 'rgba(74,222,128,0.8)', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <CheckCircle sx={{ fontSize: 14 }} />
                    Meeting completed
                    {meeting.completedByName && (
                        <span style={{ fontWeight: 400, opacity: 0.7 }}>by {meeting.completedByName}</span>
                    )}
                    {meeting.completedAt && (
                        <span style={{ fontWeight: 400, opacity: 0.5, marginLeft: 'auto', fontSize: '0.6rem' }}>
                            {new Date(meeting.completedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                    )}
                </div>
            )}

            {/* Lock banner */}
            {locked && (
                <div style={{
                    padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700,
                    background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.32)',
                    color: 'rgba(219,0,29,0.8)', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <Lock sx={{ fontSize: 14 }} />
                    Locked by {meeting.lockedByName}
                    {isLead && (
                        <button
                            onClick={toggleLock}
                            disabled={locking}
                            style={{
                                all: 'unset', cursor: 'pointer', marginLeft: 'auto',
                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em',
                                color: 'rgba(219,0,29,0.7)', display: 'flex', alignItems: 'center', gap: 4,
                            }}
                        >
                            {locking ? <CircularProgress size={10} color='inherit' /> : <LockOpen sx={{ fontSize: 12 }} />}
                            Unlock
                        </button>
                    )}
                </div>
            )}

            {/* Header row: title + actions */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                        value={title}
                        disabled={locked || completed}
                        onChange={e => setTitle(e.target.value)}
                        onBlur={() => { if (title !== meeting.title) saveField('title', title) }}
                        style={{
                            all: 'unset', display: 'block', width: '100%',
                            fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.05em',
                            color: 'var(--foreground)',
                            borderBottom: (locked || completed) ? 'none' : '1px solid rgba(255,255,255,0.08)',
                            paddingBottom: 2,
                            opacity: (locked || completed) ? 0.7 : 1,
                        }}
                    />
                    <input
                        type='datetime-local'
                        value={date}
                        disabled={locked || completed}
                        onChange={e => setDate(e.target.value)}
                        onBlur={() => { if (date !== new Date(meeting.date).toISOString().slice(0, 16)) saveField('date', date) }}
                        style={{
                            all: 'unset', marginTop: 4,
                            fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)',
                            borderBottom: (locked || completed) ? 'none' : '1px solid rgba(255,255,255,0.06)',
                            paddingBottom: 1, cursor: (locked || completed) ? 'default' : 'pointer',
                        }}
                    />
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {saving && <CircularProgress size={14} style={{ color: 'rgba(237,237,237,0.3)', alignSelf: 'center' }} />}
                    {isLead && !locked && !completed && (
                        <button
                            onClick={toggleLock}
                            disabled={locking}
                            title='Lock meeting'
                            style={{
                                all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em',
                                color: 'rgba(237,237,237,0.45)', padding: '3px 8px',
                                border: '1px solid rgba(255,255,255,0.1)',
                            }}
                        >
                            {locking ? <CircularProgress size={10} color='inherit' /> : <Lock sx={{ fontSize: 11 }} />}
                            Lock
                        </button>
                    )}
                    {isLead && (
                        <button
                            onClick={() => setConfirmDelete(true)}
                            disabled={deleting}
                            title='Delete meeting'
                            style={{
                                all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                padding: '3px 6px', color: 'rgba(219,0,29,0.5)',
                                border: '1px solid rgba(219,0,29,0.22)',
                            }}
                        >
                            <Delete sx={{ fontSize: 13 }} />
                        </button>
                    )}
                </div>
            </div>

            {/* Notes */}
            <div>
                <div style={SECTION_LABEL}>{'// Notes'}</div>
                <textarea
                    value={notes}
                    disabled={locked || completed}
                    onChange={e => setNotes(e.target.value)}
                    onBlur={() => { if (notes !== (meeting.notes ?? '')) saveField('notes', notes) }}
                    placeholder={(locked || completed) ? '' : 'Meeting notes…'}
                    rows={6}
                    style={{
                        width: '100%', resize: 'vertical',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'var(--foreground)', fontSize: '0.78rem', lineHeight: 1.6,
                        padding: '8px 10px', fontFamily: 'inherit',
                        opacity: (locked || completed) ? 0.65 : 1,
                    }}
                />
            </div>

            {/* Attendance */}
            <div>
                <div style={SECTION_LABEL}>{'// Attendance'}</div>
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

            {/* Tasks */}
            <div>
                <div style={SECTION_LABEL}>{'// Tasks'}</div>
                <MeetingTaskList
                    meetingId={id}
                    tasks={meeting.tasks}
                    locked={locked || completed}
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
                    locked={locked || completed}
                    onUpdate={onUpdate}
                    meeting={meeting}
                />
            </div>

            {/* Complete Meeting — lead only, not yet completed */}
            {isLead && !completed && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={() => setConfirmComplete(true)}
                        disabled={completing}
                        style={{
                            all: 'unset', cursor: completing ? 'wait' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 18px', fontSize: '0.72rem', fontWeight: 700,
                            letterSpacing: '0.1em', textTransform: 'uppercase',
                            background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.35)',
                            color: 'rgba(74,222,128,0.85)',
                        }}
                    >
                        {completing ? <CircularProgress size={13} color='inherit' /> : <EmojiEvents sx={{ fontSize: 15 }} />}
                        Complete Meeting
                    </button>
                </div>
            )}

            {/* Confirm: delete */}
            <ConfirmDialog
                open={confirmDelete}
                title='Delete meeting?'
                message={`"${meeting.title}" and all its tasks and attachments will be permanently deleted.`}
                danger
                confirmLabel='Delete'
                onConfirm={() => { setConfirmDelete(false); doDelete() }}
                onCancel={() => setConfirmDelete(false)}
            />

            {/* Confirm: complete */}
            <ConfirmDialog
                open={confirmComplete}
                title='Complete this meeting?'
                message='This will mark the meeting as completed. Attendance confirmation reminders will be sent to the department lead if attendance is not finalised within 24 hours.'
                confirmLabel='Complete Meeting'
                onConfirm={() => { setConfirmComplete(false); doComplete() }}
                onCancel={() => setConfirmComplete(false)}
            />
        </div>
    )
}
