'use client'

import { useState } from 'react'
import { CircularProgress } from '@mui/material'
import { Add, Delete, CheckCircle, RadioButtonUnchecked, Pending } from '@mui/icons-material'

interface Props {
    meetingId: string
    tasks: MeetingTask[]
    locked: boolean
    userId: string
    meeting: Meeting
    onUpdate: (m: Meeting) => void
}

const STATUS_ICONS = {
    pending:     <RadioButtonUnchecked sx={{ fontSize: 13 }} />,
    in_progress: <Pending sx={{ fontSize: 13, color: 'rgba(219,160,0,0.8)' }} />,
    completed:   <CheckCircle sx={{ fontSize: 13, color: 'rgba(0,200,80,0.8)' }} />,
}

const NEXT_STATUS: Record<MeetingTask['status'], MeetingTask['status']> = {
    pending: 'in_progress',
    in_progress: 'completed',
    completed: 'pending',
}

export default function MeetingTaskList({ meetingId, tasks, locked, userId, meeting, onUpdate }: Props) {
    const [title, setTitle] = useState('')
    const [assignedRole, setAssignedRole] = useState('')
    const [adding, setAdding] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [updating, setUpdating] = useState<string | null>(null)

    async function addTask() {
        if (!title.trim()) return
        setAdding(true)
        try {
            const res = await fetch(`/api/admin/meetings/${meetingId}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.trim(), assignedRole: assignedRole.trim() || undefined }),
            })
            if (res.ok) {
                const fresh = await fetch(`/api/admin/meetings/${meetingId}`).then(r => r.json())
                if (fresh.meeting) { onUpdate(fresh.meeting); setTitle(''); setAssignedRole(''); setShowForm(false) }
            }
        } finally { setAdding(false) }
    }

    async function cycleStatus(taskId: string, current: MeetingTask['status']) {
        setUpdating(taskId)
        try {
            await fetch(`/api/admin/meetings/${meetingId}/tasks/${taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: NEXT_STATUS[current] }),
            })
            const fresh = await fetch(`/api/admin/meetings/${meetingId}`).then(r => r.json())
            if (fresh.meeting) onUpdate(fresh.meeting)
        } finally { setUpdating(null) }
    }

    async function deleteTask(taskId: string) {
        setUpdating(taskId)
        try {
            await fetch(`/api/admin/meetings/${meetingId}/tasks/${taskId}`, { method: 'DELETE' })
            const fresh = await fetch(`/api/admin/meetings/${meetingId}`).then(r => r.json())
            if (fresh.meeting) onUpdate(fresh.meeting)
        } finally { setUpdating(null) }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {tasks.length === 0 && !showForm && (
                <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No tasks</span>
            )}

            {tasks.map(task => (
                <div key={task.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                }}>
                    <button
                        onClick={() => !locked && cycleStatus(task.id, task.status)}
                        disabled={locked || updating === task.id}
                        title={locked ? undefined : `Mark as ${NEXT_STATUS[task.status]}`}
                        style={{
                            all: 'unset', cursor: locked ? 'default' : 'pointer', flexShrink: 0,
                            color: task.status === 'completed' ? 'rgba(0,200,80,0.7)'
                                : task.status === 'in_progress' ? 'rgba(219,160,0,0.7)'
                                : 'rgba(237,237,237,0.3)',
                        }}
                    >
                        {updating === task.id ? <CircularProgress size={13} color='inherit' /> : STATUS_ICONS[task.status]}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                            fontSize: '0.73rem',
                            color: task.status === 'completed' ? 'rgba(237,237,237,0.35)' : 'rgba(237,237,237,0.8)',
                            textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                        }}>
                            {task.title}
                        </span>
                        {task.assignedRole && (
                            <span style={{ fontSize: '0.58rem', color: 'rgba(219,0,29,0.55)', marginLeft: 6 }}>
                                @{task.assignedRole}
                            </span>
                        )}
                        {task.assignedToName && (
                            <span style={{ fontSize: '0.58rem', color: 'rgba(219,0,29,0.55)', marginLeft: 6 }}>
                                → {task.assignedToName}
                            </span>
                        )}
                    </div>
                    {!locked && (
                        <button
                            onClick={() => deleteTask(task.id)}
                            disabled={updating === task.id}
                            style={{ all: 'unset', cursor: 'pointer', color: 'rgba(219,0,29,0.35)', flexShrink: 0 }}
                        >
                            <Delete sx={{ fontSize: 12 }} />
                        </button>
                    )}
                </div>
            ))}

            {!locked && showForm && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px', border: '1px solid rgba(219,0,29,0.22)', background: 'rgba(219,0,29,0.03)', marginTop: 4 }}>
                    <input
                        autoFocus
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setShowForm(false) }}
                        placeholder='Task title…'
                        style={{
                            all: 'unset', fontSize: '0.75rem', color: 'var(--foreground)',
                            background: 'rgba(255,255,255,0.04)', padding: '5px 8px',
                            border: '1px solid rgba(255,255,255,0.1)', width: '100%',
                        }}
                    />
                    <input
                        value={assignedRole}
                        onChange={e => setAssignedRole(e.target.value)}
                        placeholder='Assign to role (optional)…'
                        style={{
                            all: 'unset', fontSize: '0.72rem', color: 'rgba(237,237,237,0.6)',
                            background: 'rgba(255,255,255,0.03)', padding: '4px 8px',
                            border: '1px solid rgba(255,255,255,0.07)', width: '100%',
                        }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            onClick={addTask}
                            disabled={adding || !title.trim()}
                            style={{
                                all: 'unset', cursor: 'pointer', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em',
                                padding: '4px 12px', background: 'rgba(219,0,29,0.2)', border: '1px solid rgba(219,0,29,0.4)',
                                color: 'rgba(219,0,29,0.9)',
                            }}
                        >
                            {adding ? <CircularProgress size={10} color='inherit' /> : 'Add'}
                        </button>
                        <button
                            onClick={() => { setShowForm(false); setTitle(''); setAssignedRole('') }}
                            style={{
                                all: 'unset', cursor: 'pointer', fontSize: '0.62rem', fontWeight: 700,
                                padding: '4px 10px', color: 'rgba(237,237,237,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {!locked && !showForm && (
                <button
                    onClick={() => setShowForm(true)}
                    style={{
                        all: 'unset', cursor: 'pointer', marginTop: 4,
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: '0.62rem', color: 'rgba(219,0,29,0.55)',
                        letterSpacing: '0.06em',
                    }}
                >
                    <Add sx={{ fontSize: 12 }} /> Add task
                </button>
            )}
        </div>
    )
}
