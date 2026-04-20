'use client'

import { useState } from 'react'
import { CircularProgress } from '@mui/material'
import { Delete, Lock, LockOpen } from '@mui/icons-material'
import MeetingTaskList from './MeetingTaskList'
import MeetingAttachments from './MeetingAttachments'
import ConfirmDialog from '@/components/confirm-dialog'

interface Props {
    meeting: Meeting
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

export default function MeetingDetail({ meeting, userId, isLead, onUpdate, onDelete }: Props) {
    const [saving, setSaving] = useState(false)
    const [locking, setLocking] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [title, setTitle] = useState(meeting.title)
    const [date, setDate] = useState(meeting.date ? new Date(meeting.date).toISOString().slice(0, 16) : '')
    const [notes, setNotes] = useState(meeting.notes ?? '')

    const id = meeting._id!.toString()
    const locked = meeting.locked

    async function saveField(field: 'title' | 'date' | 'notes', value: string) {
        if (locked) return
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
                    // Reload meeting state
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

    return (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

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
                        disabled={locked}
                        onChange={e => setTitle(e.target.value)}
                        onBlur={() => { if (title !== meeting.title) saveField('title', title) }}
                        style={{
                            all: 'unset', display: 'block', width: '100%',
                            fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.05em',
                            color: 'var(--foreground)',
                            borderBottom: locked ? 'none' : '1px solid rgba(255,255,255,0.08)',
                            paddingBottom: 2,
                            opacity: locked ? 0.7 : 1,
                        }}
                    />
                    <input
                        type='datetime-local'
                        value={date}
                        disabled={locked}
                        onChange={e => setDate(e.target.value)}
                        onBlur={() => { if (date !== new Date(meeting.date).toISOString().slice(0, 16)) saveField('date', date) }}
                        style={{
                            all: 'unset', marginTop: 4,
                            fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)',
                            borderBottom: locked ? 'none' : '1px solid rgba(255,255,255,0.06)',
                            paddingBottom: 1, cursor: locked ? 'default' : 'pointer',
                        }}
                    />
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {saving && <CircularProgress size={14} style={{ color: 'rgba(237,237,237,0.3)', alignSelf: 'center' }} />}
                    {isLead && !locked && (
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
                    disabled={locked}
                    onChange={e => setNotes(e.target.value)}
                    onBlur={() => { if (notes !== (meeting.notes ?? '')) saveField('notes', notes) }}
                    placeholder={locked ? '' : 'Meeting notes…'}
                    rows={6}
                    style={{
                        width: '100%', resize: 'vertical',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'var(--foreground)', fontSize: '0.78rem', lineHeight: 1.6,
                        padding: '8px 10px', fontFamily: 'inherit',
                        opacity: locked ? 0.65 : 1,
                    }}
                />
            </div>

            {/* Tasks */}
            <div>
                <div style={SECTION_LABEL}>{'// Tasks'}</div>
                <MeetingTaskList
                    meetingId={id}
                    tasks={meeting.tasks}
                    locked={locked}
                    userId={userId}
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
                    locked={locked}
                    onUpdate={onUpdate}
                    meeting={meeting}
                />
            </div>

            <ConfirmDialog
                open={confirmDelete}
                title='Delete meeting?'
                message={`"${meeting.title}" and all its tasks and attachments will be permanently deleted.`}
                danger
                confirmLabel='Delete'
                onConfirm={() => { setConfirmDelete(false); doDelete() }}
                onCancel={() => setConfirmDelete(false)}
            />
        </div>
    )
}
