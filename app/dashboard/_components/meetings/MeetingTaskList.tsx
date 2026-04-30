'use client'

import { useState } from 'react'
import { CircularProgress } from '@mui/material'
import { Add, Delete, CheckCircle, RadioButtonUnchecked, Pending, ExpandMore, ExpandLess, CalendarToday, NotificationsActive, Person } from '@mui/icons-material'
import MemberPicker from './MemberPicker'

interface Props {
    meetingId: string
    tasks: MeetingTask[]
    locked: boolean
    userId: string
    department: MeetingDepartment
    meeting: Meeting
    onUpdate: (m: Meeting) => void
}

const STATUS_ICONS = {
    pending:     <RadioButtonUnchecked sx={{ fontSize: 14 }} />,
    in_progress: <Pending sx={{ fontSize: 14, color: 'rgba(219,160,0,0.85)' }} />,
    completed:   <CheckCircle sx={{ fontSize: 14, color: 'rgba(0,200,80,0.85)' }} />,
}

const NEXT: Record<MeetingTask['status'], MeetingTask['status']> = {
    pending: 'in_progress',
    in_progress: 'completed',
    completed: 'pending',
}

const STATUS_COLORS: Record<MeetingTask['status'], string> = {
    pending:     'rgba(237,237,237,0.3)',
    in_progress: 'rgba(219,160,0,0.8)',
    completed:   'rgba(0,200,80,0.8)',
}

const inputSx: React.CSSProperties = {
    all: 'unset', display: 'block', width: '100%',
    fontSize: '0.75rem', color: 'var(--foreground)',
    background: 'rgba(255,255,255,0.04)', padding: '5px 8px',
    border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box',
}

const label: React.CSSProperties = {
    display: 'block', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 3,
}

const dateSx: React.CSSProperties = {
    ...inputSx, cursor: 'pointer', fontSize: '0.72rem',
}

function fmtDate(d?: Date | string) {
    if (!d) return ''
    const dt = new Date(d)
    return dt.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function MeetingTaskList({ meetingId, tasks, locked, userId, department, meeting, onUpdate }: Props) {
    // Form state
    const [showForm, setShowForm] = useState(false)
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [assignee, setAssignee] = useState<{ id: string; name: string } | null>(null)
    const [assignedRole, setAssignedRole] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [chaseUpDate, setChaseUpDate] = useState('')
    const [adding, setAdding] = useState(false)

    // Task interaction
    const [updating, setUpdating] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    function toggleExpand(id: string) {
        setExpanded(prev => {
            const n = new Set(prev)
            n.has(id) ? n.delete(id) : n.add(id)
            return n
        })
    }

    function resetForm() {
        setTitle(''); setDescription(''); setAssignee(null)
        setAssignedRole(''); setDueDate(''); setChaseUpDate('')
        setShowForm(false)
    }

    async function addTask() {
        if (!title.trim()) return
        setAdding(true)
        try {
            const body: Record<string, unknown> = {
                title: title.trim(),
                ...(description.trim() && { description: description.trim() }),
                ...(assignee && { assignedTo: assignee.id, assignedToName: assignee.name }),
                ...(assignedRole.trim() && { assignedRole: assignedRole.trim() }),
                ...(dueDate && { dueDate }),
                ...(chaseUpDate && { chaseUpDate }),
            }
            const res = await fetch(`/api/admin/meetings/${meetingId}/tasks`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (res.ok) {
                const fresh = await fetch(`/api/admin/meetings/${meetingId}`).then(r => r.json())
                if (fresh.meeting) { onUpdate(fresh.meeting); resetForm() }
            }
        } finally { setAdding(false) }
    }

    async function cycleStatus(taskId: string, current: MeetingTask['status']) {
        setUpdating(taskId)
        try {
            await fetch(`/api/admin/meetings/${meetingId}/tasks/${taskId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: NEXT[current] }),
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

    const pending   = tasks.filter(t => t.status !== 'completed')
    const completed = tasks.filter(t => t.status === 'completed')

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {tasks.length === 0 && !showForm && (
                <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No tasks</span>
            )}

            {/* Pending tasks */}
            {pending.map(task => (
                <TaskRow
                    key={task.id}
                    task={task}
                    locked={locked}
                    isExpanded={expanded.has(task.id)}
                    isUpdating={updating === task.id}
                    onToggleExpand={() => toggleExpand(task.id)}
                    onCycleStatus={() => !locked && cycleStatus(task.id, task.status)}
                    onDelete={() => deleteTask(task.id)}
                />
            ))}

            {/* Completed tasks (collapsed by default) */}
            {completed.length > 0 && (
                <details style={{ marginTop: 4 }}>
                    <summary style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.25)', cursor: 'pointer', userSelect: 'none', padding: '3px 0' }}>
                        COMPLETED ({completed.length})
                    </summary>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, opacity: 0.7 }}>
                        {completed.map(task => (
                            <TaskRow
                                key={task.id}
                                task={task}
                                locked={locked}
                                isExpanded={expanded.has(task.id)}
                                isUpdating={updating === task.id}
                                onToggleExpand={() => toggleExpand(task.id)}
                                onCycleStatus={() => !locked && cycleStatus(task.id, task.status)}
                                onDelete={() => deleteTask(task.id)}
                            />
                        ))}
                    </div>
                </details>
            )}

            {/* Add form */}
            {!locked && showForm && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', border: '1px solid rgba(219,0,29,0.25)', background: 'rgba(219,0,29,0.03)', marginTop: 6 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={label}>Task Title *</label>
                            <input
                                autoFocus
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Escape') resetForm() }}
                                placeholder='What needs to be done?'
                                style={inputSx}
                            />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={label}>Description</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder='Additional detail or context…'
                                rows={2}
                                style={{ ...inputSx, resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }}
                            />
                        </div>
                        <div>
                            <label style={label}>Assign to Member</label>
                            <MemberPicker
                                value={assignee}
                                onChange={setAssignee}
                                department={department}
                                placeholder='Search member…'
                            />
                        </div>
                        <div>
                            <label style={label}>Assign to Role</label>
                            <input
                                value={assignedRole}
                                onChange={e => setAssignedRole(e.target.value)}
                                placeholder='e.g. J1 Team Lead'
                                style={inputSx}
                            />
                        </div>
                        <div>
                            <label style={label}>Due Date</label>
                            <input type='datetime-local' value={dueDate} onChange={e => setDueDate(e.target.value)} style={dateSx} />
                        </div>
                        <div>
                            <label style={label}>Chase-up Date</label>
                            <input type='datetime-local' value={chaseUpDate} onChange={e => setChaseUpDate(e.target.value)} style={dateSx} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={resetForm} style={{ all: 'unset', cursor: 'pointer', padding: '5px 12px', fontSize: '0.65rem', fontWeight: 700, color: 'rgba(237,237,237,0.35)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            Cancel
                        </button>
                        <button onClick={addTask} disabled={adding || !title.trim()} style={{ all: 'unset', cursor: adding || !title.trim() ? 'not-allowed' : 'pointer', padding: '5px 14px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', background: 'rgba(219,0,29,0.18)', border: '1px solid rgba(219,0,29,0.45)', color: 'rgba(219,0,29,0.9)', opacity: !title.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                            {adding ? <CircularProgress size={10} color='inherit' /> : 'Add Task'}
                        </button>
                    </div>
                </div>
            )}

            {!locked && !showForm && (
                <button onClick={() => setShowForm(true)} style={{ all: 'unset', cursor: 'pointer', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', color: 'rgba(219,0,29,0.55)', letterSpacing: '0.06em' }}>
                    <Add sx={{ fontSize: 13 }} /> Add task
                </button>
            )}
        </div>
    )
}


function TaskRow({ task, locked, isExpanded, isUpdating, onToggleExpand, onCycleStatus, onDelete }: {
    task: MeetingTask
    locked: boolean
    isExpanded: boolean
    isUpdating: boolean
    onToggleExpand: () => void
    onCycleStatus: () => void
    onDelete: () => void
}) {
    const isCarried = !!task.carriedOverFrom
    return (
        <div style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
            {/* Main row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
                <button
                    onClick={onCycleStatus}
                    disabled={locked || isUpdating}
                    title={locked ? undefined : `Mark as ${({ pending: 'in progress', in_progress: 'completed', completed: 'pending' }[task.status])}`}
                    style={{ all: 'unset', cursor: locked ? 'default' : 'pointer', flexShrink: 0, color: STATUS_COLORS[task.status] }}
                >
                    {isUpdating ? <CircularProgress size={14} color='inherit' /> : STATUS_ICONS[task.status]}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.73rem', color: task.status === 'completed' ? 'rgba(237,237,237,0.35)' : 'rgba(237,237,237,0.85)', textDecoration: task.status === 'completed' ? 'line-through' : 'none' }}>
                            {task.title}
                        </span>
                        {isCarried && (
                            <span style={{ fontSize: '0.54rem', padding: '1px 4px', background: 'rgba(0,195,255,0.08)', border: '1px solid rgba(0,195,255,0.2)', color: 'rgba(0,195,255,0.6)', fontWeight: 700, letterSpacing: '0.06em' }}>
                                CARRIED OVER
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                        {task.assignedToName && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.58rem', color: 'rgba(219,0,29,0.6)' }}>
                                <Person sx={{ fontSize: 9 }} />{task.assignedToName}
                            </span>
                        )}
                        {task.assignedRole && !task.assignedToName && (
                            <span style={{ fontSize: '0.58rem', color: 'rgba(219,0,29,0.5)' }}>@{task.assignedRole}</span>
                        )}
                        {task.dueDate && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)' }}>
                                <CalendarToday sx={{ fontSize: 9 }} />Due {fmtDate(task.dueDate)}
                            </span>
                        )}
                        {task.chaseUpDate && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.58rem', color: 'rgba(255,160,0,0.5)' }}>
                                <NotificationsActive sx={{ fontSize: 9 }} />Chase {fmtDate(task.chaseUpDate)}
                            </span>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                    {(task.description || task.dueDate || task.chaseUpDate) && (
                        <button onClick={onToggleExpand} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.2)', display: 'flex' }}>
                            {isExpanded ? <ExpandLess sx={{ fontSize: 14 }} /> : <ExpandMore sx={{ fontSize: 14 }} />}
                        </button>
                    )}
                    {!locked && (
                        <button onClick={onDelete} disabled={isUpdating} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(219,0,29,0.3)', display: 'flex' }}>
                            <Delete sx={{ fontSize: 13 }} />
                        </button>
                    )}
                </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
                <div style={{ padding: '0 8px 8px 30px', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    {task.description && (
                        <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.55, paddingTop: 6 }}>{task.description}</p>
                    )}
                    <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                        {task.dueDate && (
                            <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)' }}>
                                <span style={{ color: 'rgba(237,237,237,0.25)', marginRight: 4 }}>DUE</span>
                                {new Date(task.dueDate).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                            </div>
                        )}
                        {task.chaseUpDate && (
                            <div style={{ fontSize: '0.62rem', color: 'rgba(255,160,0,0.55)' }}>
                                <span style={{ color: 'rgba(255,160,0,0.3)', marginRight: 4 }}>CHASE-UP</span>
                                {new Date(task.chaseUpDate).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                            </div>
                        )}
                        {task.completedByName && (
                            <div style={{ fontSize: '0.62rem', color: 'rgba(0,200,80,0.5)' }}>
                                Completed by {task.completedByName}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
