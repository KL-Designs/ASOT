'use client'

import { useState, useEffect, useCallback } from 'react'
import CornerBrackets from '@/app/admin/_components/CornerBrackets'

type TaskItem = {
    _id: string
    title: string
    description?: string
    assignedTo?: string
    assignedToName?: string
    assignedRole?: string
    assignedBy: string
    assignedByName: string
    dueDate: string | null
    originalDueDate: string | null
    extendedAt: string | null
    createdAt: string
    completedAt: string | null
    status: string
    department?: string
    notes?: string
}

const STATUS_COLORS: Record<string, string> = {
    pending:     '#f59e0b',
    in_progress: '#3b82f6',
    completed:   '#10b981',
    overdue:     'rgba(219,0,29,0.85)',
}

const DEPT_LABELS: Record<string, string> = {
    j1: 'J1', j2: 'J2', j3: 'J3', j4: 'J4',
    j5: 'J5', j6: 'J6', j7: 'J7',
}

function SectionLabel({ label }: { label: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 12 }}>
            <span style={{ fontFamily: 'monospace', fontSize: '0.55rem', color: 'rgba(219,0,29,0.4)', lineHeight: 1 }}>//</span>
            <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)' }}>
                {label}
            </span>
        </div>
    )
}

function TaskCard({
    task,
    onAction,
}: {
    task: TaskItem
    onAction: (id: string, action: string, payload?: Record<string, unknown>) => void
}) {
    const [extendDate, setExtendDate] = useState('')
    const [showExtend, setShowExtend] = useState(false)
    const [notes, setNotes] = useState('')
    const [showComplete, setShowComplete] = useState(false)
    const color = STATUS_COLORS[task.status] ?? 'rgba(237,237,237,0.4)'
    const isOverdue = !task.completedAt && task.dueDate && new Date(task.dueDate) < new Date()

    return (
        <div style={{
            position: 'relative',
            border: '1px solid rgba(255,255,255,0.1)',
            borderTop: `2px solid ${isOverdue ? 'rgba(219,0,29,0.85)' : color}`,
            background: 'rgba(255,255,255,0.04)',
            padding: '14px 16px',
            marginBottom: 10,
        }}>
            <CornerBrackets color='rgba(255,255,255,0.06)' size={5} />

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Tags row */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color, fontFamily: 'monospace' }}>
                            {task.status.replace('_', ' ')}
                        </span>
                        {task.department && (
                            <span style={{ fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', fontFamily: 'monospace' }}>
                                {DEPT_LABELS[task.department] ?? task.department}
                            </span>
                        )}
                        {isOverdue && (
                            <span style={{ fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.85)', fontFamily: 'monospace' }}>
                                OVERDUE
                            </span>
                        )}
                        {task.extendedAt && (
                            <span style={{ fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f59e0b', fontFamily: 'monospace' }}>
                                EXTENDED
                            </span>
                        )}
                    </div>

                    {/* Title */}
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(237,237,237,0.85)', marginBottom: 4, lineHeight: 1.3 }}>
                        {task.title}
                    </div>

                    {/* Description */}
                    {task.description && (
                        <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.45)', marginBottom: 6, lineHeight: 1.5 }}>
                            {task.description}
                        </div>
                    )}

                    {/* Meta */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                        <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.3)', fontFamily: 'monospace' }}>
                            From: {task.assignedByName}
                        </span>
                        {task.assignedToName && (
                            <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.3)', fontFamily: 'monospace' }}>
                                To: {task.assignedToName}
                            </span>
                        )}
                        {task.assignedRole && (
                            <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.3)', fontFamily: 'monospace' }}>
                                Role: {task.assignedRole}
                            </span>
                        )}
                        {task.dueDate && (
                            <span style={{ fontSize: '0.55rem', color: isOverdue ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.3)', fontFamily: 'monospace' }}>
                                Due: {new Date(task.dueDate).toLocaleDateString()}
                            </span>
                        )}
                    </div>

                    {/* Extend form */}
                    {showExtend && (
                        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                                type='date'
                                value={extendDate}
                                onChange={e => setExtendDate(e.target.value)}
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.8)', padding: '4px 8px', fontSize: '0.62rem', borderRadius: 2, fontFamily: 'monospace' }}
                            />
                            <button
                                onClick={() => { onAction(task._id, 'extend', { dueDate: extendDate }); setShowExtend(false) }}
                                disabled={!extendDate}
                                style={{ fontSize: '0.55rem', padding: '4px 10px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b', cursor: 'pointer', borderRadius: 2, transition: 'background 0.12s' }}
                            >
                                Confirm
                            </button>
                            <button
                                onClick={() => setShowExtend(false)}
                                style={{ fontSize: '0.55rem', padding: '4px 8px', background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', borderRadius: 2 }}
                            >
                                Cancel
                            </button>
                        </div>
                    )}

                    {/* Complete form */}
                    {showComplete && (
                        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: 'column' }}>
                            <textarea
                                placeholder='Optional notes...'
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={2}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.8)', padding: '6px 8px', fontSize: '0.62rem', borderRadius: 2, fontFamily: 'monospace', resize: 'vertical' }}
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    onClick={() => { onAction(task._id, 'complete', { notes }); setShowComplete(false) }}
                                    style={{ fontSize: '0.55rem', padding: '4px 10px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', cursor: 'pointer', borderRadius: 2 }}
                                >
                                    Mark Complete
                                </button>
                                <button
                                    onClick={() => setShowComplete(false)}
                                    style={{ fontSize: '0.55rem', padding: '4px 8px', background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', borderRadius: 2 }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Actions */}
                {task.status !== 'completed' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                        {task.status === 'pending' && (
                            <ActionBtn color='#3b82f6' onClick={() => onAction(task._id, 'start')}>Start</ActionBtn>
                        )}
                        <ActionBtn color='#10b981' onClick={() => { setShowComplete(v => !v); setShowExtend(false) }}>
                            Complete
                        </ActionBtn>
                        <ActionBtn color='#f59e0b' onClick={() => { setShowExtend(v => !v); setShowComplete(false) }}>
                            Extend
                        </ActionBtn>
                        <ActionBtn color='rgba(219,0,29,0.7)' onClick={() => onAction(task._id, 'delete')}>
                            Delete
                        </ActionBtn>
                    </div>
                )}
            </div>
        </div>
    )
}

function ActionBtn({ children, color, onClick }: { children: React.ReactNode; color: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                fontSize: '0.52rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '4px 8px',
                background: 'transparent',
                border: `1px solid ${color}`,
                color,
                cursor: 'pointer',
                borderRadius: 2,
                transition: 'background 0.12s',
                fontFamily: 'monospace',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${color}22` }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
            {children}
        </button>
    )
}

// ── Create Task Form ───────────────────────────────────────────────────────────

function CreateTaskForm({ onCreated }: { onCreated: () => void }) {
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [assignedTo, setAssignedTo] = useState('')
    const [assignedToName, setAssignedToName] = useState('')
    const [assignedRole, setAssignedRole] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [department, setDepartment] = useState('')
    const [useRole, setUseRole] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        if (!title.trim()) { setError('Title is required'); return }
        if (!useRole && !assignedTo.trim()) { setError('Enter an assignee Discord ID or switch to role assignment'); return }
        if (useRole && !assignedRole.trim()) { setError('Enter a role name'); return }

        setSubmitting(true)
        try {
            const res = await fetch('/api/admin/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim() || undefined,
                    assignedTo: useRole ? undefined : assignedTo.trim(),
                    assignedToName: useRole ? undefined : (assignedToName.trim() || assignedTo.trim()),
                    assignedRole: useRole ? assignedRole.trim() : undefined,
                    dueDate: dueDate || undefined,
                    department: department || undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error ?? 'Failed to create task'); return }
            setTitle(''); setDescription(''); setAssignedTo(''); setAssignedToName(''); setAssignedRole(''); setDueDate(''); setDepartment('')
            onCreated()
        } catch {
            setError('Network error')
        } finally {
            setSubmitting(false)
        }
    }

    const inputStyle: React.CSSProperties = {
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 2,
        color: 'rgba(237,237,237,0.8)',
        padding: '6px 10px',
        fontSize: '0.68rem',
        fontFamily: 'monospace',
        width: '100%',
        outline: 'none',
    }

    return (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
                placeholder='Task title *'
                value={title}
                onChange={e => setTitle(e.target.value)}
                style={inputStyle}
                required
            />
            <textarea
                placeholder='Description (optional)'
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
            />

            {/* Assign type toggle */}
            <div style={{ display: 'flex', gap: 8 }}>
                <button type='button' onClick={() => setUseRole(false)}
                    style={{ fontSize: '0.55rem', padding: '4px 10px', border: '1px solid rgba(255,255,255,0.15)', background: !useRole ? 'rgba(255,255,255,0.1)' : 'transparent', color: !useRole ? 'rgba(237,237,237,0.8)' : 'rgba(237,237,237,0.35)', cursor: 'pointer', borderRadius: 2, fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Member
                </button>
                <button type='button' onClick={() => setUseRole(true)}
                    style={{ fontSize: '0.55rem', padding: '4px 10px', border: '1px solid rgba(255,255,255,0.15)', background: useRole ? 'rgba(255,255,255,0.1)' : 'transparent', color: useRole ? 'rgba(237,237,237,0.8)' : 'rgba(237,237,237,0.35)', cursor: 'pointer', borderRadius: 2, fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Role
                </button>
            </div>

            {useRole ? (
                <input placeholder='Role name (e.g. J1-Recruiting)' value={assignedRole} onChange={e => setAssignedRole(e.target.value)} style={inputStyle} />
            ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                    <input placeholder='Discord ID *' value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                    <input placeholder='Display name' value={assignedToName} onChange={e => setAssignedToName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.52rem', color: 'rgba(237,237,237,0.3)', marginBottom: 4, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'monospace' }}>Due date</div>
                    <input type='date' value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.52rem', color: 'rgba(237,237,237,0.3)', marginBottom: 4, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'monospace' }}>Department</div>
                    <select value={department} onChange={e => setDepartment(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value=''>None</option>
                        {['j1','j2','j3','j4','j5','j6','j7'].map(d => (
                            <option key={d} value={d}>{d.toUpperCase()}</option>
                        ))}
                    </select>
                </div>
            </div>

            {error && (
                <div style={{ fontSize: '0.6rem', color: 'rgba(219,0,29,0.8)', fontFamily: 'monospace' }}>{error}</div>
            )}

            <button
                type='submit'
                disabled={submitting}
                style={{
                    padding: '8px 16px',
                    background: 'rgba(219,0,29,0.12)',
                    border: '1px solid rgba(219,0,29,0.4)',
                    color: 'rgba(237,237,237,0.85)',
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    fontFamily: 'monospace',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.5 : 1,
                    transition: 'background 0.12s',
                    borderRadius: 2,
                }}
                onMouseEnter={e => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(219,0,29,0.22)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(219,0,29,0.12)' }}
            >
                {submitting ? 'Creating...' : 'Create Task'}
            </button>
        </form>
    )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TasksPage() {
    const [tasks, setTasks] = useState<TaskItem[]>([])
    const [loading, setLoading] = useState(true)
    const [view, setView] = useState<'mine' | 'created' | 'all'>('mine')
    const [showCreate, setShowCreate] = useState(false)

    const fetchTasks = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/tasks?view=${view}`)
            if (res.ok) {
                const data = await res.json()
                setTasks(data.tasks ?? [])
            }
        } finally {
            setLoading(false)
        }
    }, [view])

    useEffect(() => { fetchTasks() }, [fetchTasks])

    async function handleAction(id: string, action: string, payload?: Record<string, unknown>) {
        if (action === 'delete') {
            if (!confirm('Delete this task?')) return
            await fetch(`/api/admin/tasks/${id}`, { method: 'DELETE' })
            setTasks(prev => prev.filter(t => t._id !== id))
            return
        }
        await fetch(`/api/admin/tasks/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...payload }),
        })
        fetchTasks()
    }

    const viewBtn = (v: typeof view, label: string) => (
        <button
            onClick={() => setView(v)}
            style={{
                fontSize: '0.55rem',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                padding: '5px 12px',
                background: view === v ? 'rgba(219,0,29,0.15)' : 'transparent',
                border: `1px solid ${view === v ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: view === v ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.35)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                borderRadius: 2,
                transition: 'background 0.12s, border-color 0.12s, color 0.12s',
            }}
        >
            {label}
        </button>
    )

    return (
        <div className='h-full w-full p-6 md:p-8 flex flex-col gap-6 max-w-[900px]'>

            {/* Header */}
            <div
                className='flex items-start justify-between px-5 py-4'
                style={{
                    position: 'relative',
                    border: '1px solid rgba(219,0,29,0.3)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <CornerBrackets />
                <div>
                    <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', fontFamily: 'monospace', marginBottom: 6 }}>
                        <span style={{ color: 'rgba(219,0,29,0.4)' }}>ASOT</span>
                        <span style={{ color: 'rgba(219,0,29,0.25)' }}> // </span>
                        <span>TASKS</span>
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', lineHeight: 1.1 }}>
                        Task Manager
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', marginTop: 4 }}>
                        Assign and track tasks across departments
                    </div>
                </div>
                <button
                    onClick={() => setShowCreate(v => !v)}
                    style={{
                        fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
                        padding: '7px 14px',
                        background: showCreate ? 'rgba(219,0,29,0.2)' : 'rgba(219,0,29,0.1)',
                        border: '1px solid rgba(219,0,29,0.4)',
                        color: 'rgba(237,237,237,0.85)',
                        cursor: 'pointer', borderRadius: 2, fontFamily: 'monospace', transition: 'background 0.12s',
                        alignSelf: 'center',
                    }}
                >
                    {showCreate ? '− Cancel' : '+ New Task'}
                </button>
            </div>

            {/* Create form */}
            {showCreate && (
                <div style={{ position: 'relative', border: '1px solid rgba(219,0,29,0.25)', background: 'rgba(255,255,255,0.03)', padding: '16px 18px' }}>
                    <CornerBrackets />
                    <SectionLabel label='New Task' />
                    <CreateTaskForm onCreated={() => { setShowCreate(false); fetchTasks() }} />
                </div>
            )}

            {/* View toggle */}
            <div style={{ display: 'flex', gap: 8 }}>
                {viewBtn('mine',    'Assigned to me')}
                {viewBtn('created', 'Created by me')}
                {viewBtn('all',     'All tasks')}
            </div>

            {/* Task list */}
            <div>
                <SectionLabel label={view === 'mine' ? 'My Tasks' : view === 'created' ? 'Tasks I Created' : 'All Tasks'} />
                {loading ? (
                    <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)', fontFamily: 'monospace', padding: '20px 0' }}>Loading...</div>
                ) : tasks.length === 0 ? (
                    <div style={{
                        border: '1px dashed rgba(219,0,29,0.2)',
                        background: 'rgba(219,0,29,0.02)',
                        padding: '32px 24px',
                        textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>
                            No tasks found
                        </div>
                    </div>
                ) : (
                    tasks.map(t => (
                        <TaskCard key={t._id} task={t} onAction={handleAction} />
                    ))
                )}
            </div>

        </div>
    )
}
