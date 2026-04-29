'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Typography, Tabs, Tab, Dialog, DialogContent, TextField, MenuItem, Autocomplete } from '@mui/material'
import { Add, Delete, Refresh, OpenInNew } from '@mui/icons-material'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'

// ── Types ──────────────────────────────────────────────────────────────────────

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue'
type TaskType   = 'manual' | 'attendance' | 'application_review' | 'extension_review'

interface ExtensionRequest {
    requestedDate: string
    reason: string
    requestedAt: string
    status: 'pending' | 'approved' | 'denied'
}

interface TaskItem {
    _id: string
    title: string
    description?: string
    type?: TaskType
    status: TaskStatus
    assignedTo?: string
    assignedToName?: string
    assignedRole?: string
    assignedBy: string
    assignedByName: string
    dueDate?: string | null
    originalDueDate?: string | null
    completedAt?: string | null
    notes?: string
    department?: string
    actionUrl?: string
    relatedId?: string
    createdAt: string
    extensionRequest?: ExtensionRequest
}

interface MemberOption {
    id: string
    displayName: string
    username: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function typeBadge(type?: TaskType): { label: string; color: string } {
    if (type === 'attendance')         return { label: 'ATT', color: '#f97316' }
    if (type === 'application_review') return { label: 'APP', color: '#3b82f6' }
    if (type === 'extension_review')   return { label: 'EXT', color: '#f59e0b' }
    return { label: 'TSK', color: 'rgba(237,237,237,0.3)' }
}

function statusColor(status: TaskStatus): string {
    if (status === 'completed') return 'rgba(34,197,94,0.7)'
    if (status === 'in_progress') return '#f59e0b'
    if (status === 'overdue') return 'rgba(219,0,29,0.8)'
    return 'rgba(237,237,237,0.35)'
}

function formatDate(iso?: string | null) {
    if (!iso) return null
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function isOverdue(dueDate?: string | null) {
    return !!dueDate && new Date(dueDate) < new Date()
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const inputSx = {
    '& .MuiInputBase-root': { background: 'rgba(255,255,255,0.04)', borderRadius: 0 },
    '& .MuiInputBase-input': { color: 'rgba(237,237,237,0.85)', fontSize: '0.8rem' },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(219,0,29,0.25)' },
    '& .MuiInputLabel-root': { color: 'rgba(237,237,237,0.4)', fontSize: '0.8rem' },
    '& .MuiSvgIcon-root': { color: 'rgba(237,237,237,0.4)' },
    '& .MuiMenuItem-root': { fontSize: '0.8rem' },
}

// ── Task Card ──────────────────────────────────────────────────────────────────

function TaskCard({
    task,
    onAction,
    showAssignee = false,
}: {
    task: TaskItem
    onAction: (id: string, action: string, extra?: Record<string, unknown>) => void
    showAssignee?: boolean
}) {
    const router = useRouter()
    const [expanded, setExpanded] = useState(false)
    const [completingNotes, setCompletingNotes] = useState('')
    const [confirmingComplete, setConfirmingComplete] = useState(false)
    const [extending, setExtending] = useState(false)
    const [newDueDate, setNewDueDate] = useState('')
    const [requestingExtension, setRequestingExtension] = useState(false)
    const [extReqDate, setExtReqDate] = useState('')
    const [extReqReason, setExtReqReason] = useState('')
    const badge = typeBadge(task.type)
    const overdue = isOverdue(task.dueDate) && task.status !== 'completed'

    return (
        <div style={{
            border: '1px solid rgba(255,255,255,0.07)',
            borderLeft: `3px solid ${badge.color}`,
            background: task.status === 'completed' ? 'rgba(34,197,94,0.03)' : 'rgba(255,255,255,0.025)',
            marginBottom: 6,
            position: 'relative',
        }}>
            {/* Main row */}
            <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
                onClick={() => setExpanded(e => !e)}
            >
                {/* Type badge */}
                <span style={{
                    fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.1em',
                    padding: '2px 5px', border: `1px solid ${badge.color}`, color: badge.color,
                    borderRadius: 3, fontFamily: 'monospace', flexShrink: 0,
                }}>
                    {badge.label}
                </span>

                {/* Title + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: '0.75rem', fontWeight: 600,
                        color: task.status === 'completed' ? 'rgba(237,237,237,0.4)' : 'rgba(237,237,237,0.85)',
                        textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                        {task.title}
                    </div>
                    <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {showAssignee && (task.assignedToName || task.assignedRole) && (
                            <span>→ {task.assignedToName ?? task.assignedRole}</span>
                        )}
                        {!showAssignee && task.assignedByName && (
                            <span>{task.assignedByName === 'System' ? 'Auto-assigned' : `From: ${task.assignedByName}`}</span>
                        )}
                        {task.dueDate && (
                            <span style={{ color: overdue ? 'rgba(219,0,29,0.8)' : 'rgba(237,237,237,0.3)' }}>
                                Due {formatDate(task.dueDate)}{overdue ? ' — overdue' : ''}
                            </span>
                        )}
                        {task.completedAt && (
                            <span style={{ color: 'rgba(34,197,94,0.6)' }}>Completed {formatDate(task.completedAt)}</span>
                        )}
                        {task.department && (
                            <span style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)' }}>{task.department}</span>
                        )}
                    </div>
                </div>

                {/* Status chip */}
                <span style={{
                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                    padding: '2px 6px', borderRadius: 2,
                    border: `1px solid ${statusColor(task.status)}`,
                    color: statusColor(task.status),
                    flexShrink: 0,
                }}>
                    {task.status.replace('_', ' ')}
                </span>

                {/* Expand chevron */}
                <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.25)', flexShrink: 0 }}>
                    {expanded ? '▲' : '▼'}
                </span>
            </div>

            {/* Expanded detail */}
            {expanded && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {task.description && (
                        <p style={{ margin: 0, fontSize: '0.7rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.6 }}>
                            {task.description}
                        </p>
                    )}
                    {task.notes && (
                        <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', padding: '6px 10px' }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(34,197,94,0.6)', marginBottom: 3 }}>COMPLETION NOTES</div>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.5 }}>{task.notes}</p>
                        </div>
                    )}

                    {/* Extension request banner (creator view) */}
                    {showAssignee && task.extensionRequest?.status === 'pending' && (
                        <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(245,158,11,0.8)' }}>EXTENSION REQUEST</div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.6)' }}>
                                <span style={{ color: 'rgba(237,237,237,0.4)' }}>New date: </span>
                                {formatDate(task.extensionRequest.requestedDate)}
                                <span style={{ color: 'rgba(237,237,237,0.4)', marginLeft: 12 }}>Reason: </span>
                                {task.extensionRequest.reason}
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <ActionBtn label='Approve' color='rgba(34,197,94,0.7)' onClick={() => onAction(task._id, 'approve_extension')} />
                                <ActionBtn label='Deny' color='rgba(219,0,29,0.6)' onClick={() => onAction(task._id, 'deny_extension')} />
                            </div>
                        </div>
                    )}

                    {/* Extension review task — Approve / Deny */}
                    {task.type === 'extension_review' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                            <ActionBtn label='Approve' color='rgba(34,197,94,0.7)' onClick={() => onAction(task._id, 'approve_extension_review')} />
                            <ActionBtn label='Deny' color='rgba(219,0,29,0.6)' onClick={() => onAction(task._id, 'deny_extension_review')} />
                        </div>
                    ) : (
                        <>
                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {task.actionUrl && (
                                    <ActionBtn
                                        label='Open'
                                        icon={<OpenInNew sx={{ fontSize: '0.75rem' }} />}
                                        color='rgba(219,0,29,0.7)'
                                        onClick={() => (window.location.href = task.actionUrl!)}
                                    />
                                )}

                                {task.status !== 'completed' && (
                                    <>
                                        {task.status === 'pending' && (
                                            <ActionBtn label='Start' color='#f59e0b' onClick={() => onAction(task._id, 'start')} />
                                        )}

                                        {!confirmingComplete ? (
                                            <ActionBtn label='Complete' color='rgba(34,197,94,0.7)' onClick={() => setConfirmingComplete(true)} />
                                        ) : (
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                                <TextField
                                                    label='Completion notes (optional)'
                                                    size='small'
                                                    value={completingNotes}
                                                    onChange={e => setCompletingNotes(e.target.value)}
                                                    multiline
                                                    rows={2}
                                                    sx={{ ...inputSx, minWidth: 240 }}
                                                />
                                                <ActionBtn label='Confirm' color='rgba(34,197,94,0.7)' onClick={() => {
                                                    onAction(task._id, 'complete', { notes: completingNotes })
                                                    setConfirmingComplete(false)
                                                }} />
                                                <ActionBtn label='Cancel' color='rgba(237,237,237,0.3)' onClick={() => setConfirmingComplete(false)} />
                                            </div>
                                        )}

                                        {/* Creator view: direct Extend + inline approve/deny pending requests */}
                                        {showAssignee && (
                                            !extending ? (
                                                <ActionBtn label='Extend' color='rgba(237,237,237,0.4)' onClick={() => setExtending(true)} />
                                            ) : (
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                    <input
                                                        type='date'
                                                        value={newDueDate}
                                                        onChange={e => setNewDueDate(e.target.value)}
                                                        style={{
                                                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(219,0,29,0.25)',
                                                            color: 'rgba(237,237,237,0.8)', padding: '4px 8px', fontSize: '0.72rem',
                                                            borderRadius: 2, outline: 'none',
                                                            colorScheme: 'dark',
                                                        }}
                                                    />
                                                    <ActionBtn label='Save' color='rgba(34,197,94,0.7)' onClick={() => {
                                                        if (newDueDate) { onAction(task._id, 'extend', { dueDate: newDueDate }); setExtending(false) }
                                                    }} />
                                                    <ActionBtn label='Cancel' color='rgba(237,237,237,0.3)' onClick={() => setExtending(false)} />
                                                </div>
                                            )
                                        )}

                                        {/* Assignee view: Request Extension */}
                                        {!showAssignee && (
                                            task.extensionRequest?.status === 'pending' ? (
                                                <span style={{ fontSize: '0.6rem', color: 'rgba(245,158,11,0.7)', fontWeight: 600, letterSpacing: '0.06em', padding: '4px 0', alignSelf: 'center' }}>
                                                    ⏳ Extension requested
                                                </span>
                                            ) : !requestingExtension ? (
                                                <ActionBtn label='Request Extension' color='rgba(245,158,11,0.6)' onClick={() => setRequestingExtension(true)} />
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                                        <div>
                                                            <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.35)', marginBottom: 4 }}>NEW DATE</div>
                                                            <input
                                                                type='date'
                                                                value={extReqDate}
                                                                onChange={e => setExtReqDate(e.target.value)}
                                                                style={{
                                                                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(245,158,11,0.3)',
                                                                    color: 'rgba(237,237,237,0.8)', padding: '4px 8px', fontSize: '0.72rem',
                                                                    borderRadius: 2, outline: 'none',
                                                                    colorScheme: 'dark',
                                                                }}
                                                            />
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 180 }}>
                                                            <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.35)', marginBottom: 4 }}>REASON</div>
                                                            <textarea
                                                                value={extReqReason}
                                                                onChange={e => setExtReqReason(e.target.value)}
                                                                rows={2}
                                                                placeholder='Explain why you need an extension…'
                                                                style={{
                                                                    width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(245,158,11,0.3)',
                                                                    color: 'rgba(237,237,237,0.8)', padding: '4px 8px', fontSize: '0.7rem',
                                                                    borderRadius: 2, outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <ActionBtn label='Submit Request' color='rgba(245,158,11,0.7)' onClick={() => {
                                                            if (extReqDate && extReqReason.trim()) {
                                                                onAction(task._id, 'request_extension', { requestedDate: extReqDate, reason: extReqReason.trim() })
                                                                setRequestingExtension(false)
                                                                setExtReqDate('')
                                                                setExtReqReason('')
                                                            }
                                                        }} />
                                                        <ActionBtn label='Cancel' color='rgba(237,237,237,0.3)' onClick={() => { setRequestingExtension(false); setExtReqDate(''); setExtReqReason('') }} />
                                                    </div>
                                                </div>
                                            )
                                        )}
                                    </>
                                )}

                                {task.status === 'completed' && (
                                    <ActionBtn label='Re-open' color='rgba(237,237,237,0.4)' onClick={() => onAction(task._id, 'reopen')} />
                                )}

                                <ActionBtn
                                    label='Delete'
                                    icon={<Delete sx={{ fontSize: '0.75rem' }} />}
                                    color='rgba(219,0,29,0.5)'
                                    onClick={() => onAction(task._id, 'delete')}
                                />
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

function ActionBtn({
    label, icon, color, onClick,
}: {
    label: string
    icon?: React.ReactNode
    color: string
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: `1px solid ${color}`,
                color, padding: '4px 10px', cursor: 'pointer', borderRadius: 3,
                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', transition: 'background 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = color.replace(')', ', 0.12)').replace('rgba', 'rgba').replace(/,\s*[\d.]+\)$/, ', 0.12)'))}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
            {icon}{label}
        </button>
    )
}

// ── Create Task Dialog ─────────────────────────────────────────────────────────

function CreateTaskDialog({
    open,
    onClose,
    onCreated,
}: {
    open: boolean
    onClose: () => void
    onCreated: () => void
}) {
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [department, setDepartment] = useState('')
    const [assignMode, setAssignMode] = useState<'member' | 'role'>('member')
    const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
    const [memberSearch, setMemberSearch] = useState('')
    const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
    const [roleName, setRoleName] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!open) return
        setTitle(''); setDescription(''); setDueDate(''); setDepartment('')
        setSelectedMember(null); setMemberSearch(''); setRoleName(''); setError('')
        setAssignMode('member')
    }, [open])

    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current)
        if (memberSearch.length < 2) { setMemberOptions([]); return }
        searchTimer.current = setTimeout(async () => {
            const res = await fetch(`/api/admin/members?search=${encodeURIComponent(memberSearch)}&limit=15`)
            const data = await res.json()
            setMemberOptions((data.members ?? []).map((m: { id: string; displayName: string; username: string }) => ({
                id: m.id,
                displayName: m.displayName,
                username: m.username,
            })))
        }, 300)
    }, [memberSearch])

    async function handleSubmit() {
        if (!title.trim()) { setError('Title is required'); return }
        if (assignMode === 'member' && !selectedMember) { setError('Select a member to assign to'); return }
        if (assignMode === 'role' && !roleName.trim()) { setError('Enter a role name'); return }

        setSaving(true); setError('')
        const body: Record<string, unknown> = {
            title: title.trim(),
            ...(description.trim() ? { description: description.trim() } : {}),
            ...(dueDate ? { dueDate } : {}),
            ...(department ? { department } : {}),
        }
        if (assignMode === 'member' && selectedMember) {
            body.assignedTo = selectedMember.id
            body.assignedToName = selectedMember.displayName
        } else {
            body.assignedRole = roleName.trim()
        }

        const res = await fetch('/api/admin/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        setSaving(false)
        if (res.ok) { onCreated(); onClose() }
        else { const d = await res.json(); setError(d.error ?? 'Failed to create task') }
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth='sm'
            fullWidth
            PaperProps={{ style: { background: '#0f0f0f', border: '1px solid rgba(219,0,29,0.32)', borderRadius: 0 } }}
        >
            <DialogContent style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)' }}>
                        NEW TASK
                    </span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', fontSize: '1rem' }}>×</button>
                </div>

                <TextField label='Title *' value={title} onChange={e => setTitle(e.target.value)} size='small' sx={inputSx} fullWidth />
                <TextField label='Description' value={description} onChange={e => setDescription(e.target.value)} multiline rows={3} size='small' sx={inputSx} fullWidth />

                {/* Assign mode toggle */}
                <div>
                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 8 }}>ASSIGN TO</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                        {(['member', 'role'] as const).map(m => (
                            <button key={m} onClick={() => setAssignMode(m)} style={{
                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                padding: '4px 12px', cursor: 'pointer', borderRadius: 999,
                                background: assignMode === m ? 'rgba(219,0,29,0.25)' : 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(219,0,29,0.25)',
                                color: assignMode === m ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.4)',
                            }}>
                                {m === 'member' ? 'Specific Member' : 'Role / Group'}
                            </button>
                        ))}
                    </div>
                    {assignMode === 'member' ? (
                        <Autocomplete
                            options={memberOptions}
                            getOptionLabel={o => `${o.displayName} (@${o.username})`}
                            value={selectedMember}
                            onChange={(_, v) => setSelectedMember(v)}
                            inputValue={memberSearch}
                            onInputChange={(_, v) => setMemberSearch(v)}
                            noOptionsText={memberSearch.length < 2 ? 'Type to search…' : 'No members found'}
                            renderInput={params => (
                                <TextField {...params} label='Member' size='small' sx={inputSx} fullWidth />
                            )}
                            sx={{ '& .MuiAutocomplete-listbox': { background: '#1a1a1a', fontSize: '0.8rem' } }}
                        />
                    ) : (
                        <TextField
                            label='Role name (e.g. J1-Staff)'
                            value={roleName}
                            onChange={e => setRoleName(e.target.value)}
                            size='small'
                            sx={inputSx}
                            fullWidth
                        />
                    )}
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 6 }}>DUE DATE (optional)</div>
                        <input
                            type='date'
                            value={dueDate}
                            onChange={e => setDueDate(e.target.value)}
                            style={{
                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(219,0,29,0.25)',
                                color: 'rgba(237,237,237,0.8)', padding: '7px 10px', fontSize: '0.8rem',
                                width: '100%', boxSizing: 'border-box', outline: 'none', borderRadius: 0,
                                colorScheme: 'dark',
                            }}
                        />
                    </div>
                    <TextField
                        label='Department (optional)'
                        value={department}
                        onChange={e => setDepartment(e.target.value)}
                        select
                        size='small'
                        sx={{ ...inputSx, flex: 1 }}
                    >
                        <MenuItem value=''><em>None</em></MenuItem>
                        {['j1','j2','j3','j4','j5','j6','j7'].map(d => (
                            <MenuItem key={d} value={d} sx={{ fontSize: '0.8rem' }}>{d.toUpperCase()}</MenuItem>
                        ))}
                    </TextField>
                </div>

                {error && <div style={{ fontSize: '0.7rem', color: 'rgba(219,0,29,0.8)' }}>{error}</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                    <button onClick={onClose} style={{
                        background: 'none', border: '1px solid rgba(237,237,237,0.15)',
                        color: 'rgba(237,237,237,0.4)', padding: '6px 16px', cursor: 'pointer', fontSize: '0.7rem',
                    }}>CANCEL</button>
                    <button onClick={handleSubmit} disabled={saving} style={{
                        background: saving ? 'rgba(219,0,29,0.15)' : 'rgba(219,0,29,0.25)',
                        border: '1px solid rgba(219,0,29,0.4)',
                        color: saving ? 'rgba(237,237,237,0.4)' : 'rgba(237,237,237,0.9)',
                        padding: '6px 20px', cursor: saving ? 'default' : 'pointer', fontSize: '0.7rem', fontWeight: 700,
                    }}>{saving ? 'SAVING…' : 'CREATE TASK'}</button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ── Tab panel ──────────────────────────────────────────────────────────────────

function TaskList({
    tasks,
    onAction,
    loading,
    showAssignee,
    emptyLabel = 'No tasks',
}: {
    tasks: TaskItem[]
    onAction: (id: string, action: string, extra?: Record<string, unknown>) => void
    loading: boolean
    showAssignee?: boolean
    emptyLabel?: string
}) {
    if (loading) return (
        <div style={{ padding: '32px 0', textAlign: 'center', fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', fontFamily: 'monospace' }}>
            Loading…
        </div>
    )
    if (tasks.length === 0) return (
        <div style={{ padding: '32px 0', textAlign: 'center', fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)' }}>
            {emptyLabel}
        </div>
    )
    return (
        <div>
            {tasks.map(t => <TaskCard key={t._id} task={t} onAction={onAction} showAssignee={showAssignee} />)}
        </div>
    )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TasksPage({
    userId,
    displayName,
    isElevated,
}: {
    userId: string
    displayName: string
    isElevated: boolean
}) {
    const [tab, setTab] = useState(0)
    const [myTasks, setMyTasks] = useState<TaskItem[]>([])
    const [createdTasks, setCreatedTasks] = useState<TaskItem[]>([])
    const [allTasks, setAllTasks] = useState<TaskItem[]>([])
    const [myLoading, setMyLoading] = useState(true)
    const [createdLoading, setCreatedLoading] = useState(false)
    const [allLoading, setAllLoading] = useState(false)
    const [showCompleted, setShowCompleted] = useState(false)
    const [createOpen, setCreateOpen] = useState(false)
    const [allFilter, setAllFilter] = useState('')

    const loadMine = useCallback(async (withCompleted = showCompleted) => {
        setMyLoading(true)
        const res = await fetch(`/api/admin/tasks?view=mine${withCompleted ? '&includeCompleted=true' : ''}`)
        const d = await res.json()
        setMyTasks(d.tasks ?? [])
        setMyLoading(false)
    }, [showCompleted])

    const loadCreated = useCallback(async (withCompleted = showCompleted) => {
        setCreatedLoading(true)
        const res = await fetch(`/api/admin/tasks?view=created${withCompleted ? '&includeCompleted=true' : ''}`)
        const d = await res.json()
        setCreatedTasks(d.tasks ?? [])
        setCreatedLoading(false)
    }, [showCompleted])

    const loadAll = useCallback(async (withCompleted = showCompleted) => {
        setAllLoading(true)
        const res = await fetch(`/api/admin/tasks?view=all${withCompleted ? '&includeCompleted=true' : ''}`)
        const d = await res.json()
        setAllTasks(d.tasks ?? [])
        setAllLoading(false)
    }, [showCompleted])

    useEffect(() => { loadMine() }, []) // eslint-disable-line

    useEffect(() => {
        if (tab === 1 && createdTasks.length === 0 && !createdLoading) loadCreated()
        if (tab === 2 && allTasks.length === 0 && !allLoading) loadAll()
    }, [tab]) // eslint-disable-line

    function toggleCompleted() {
        const next = !showCompleted
        setShowCompleted(next)
        if (tab === 0) loadMine(next)
        if (tab === 1) loadCreated(next)
        if (tab === 2) loadAll(next)
    }

    async function handleAction(id: string, action: string, extra: Record<string, unknown> = {}) {
        if (action === 'delete') {
            if (!confirm('Delete this task?')) return
            await fetch(`/api/admin/tasks/${id}`, { method: 'DELETE' })
        } else {
            await fetch(`/api/admin/tasks/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...extra }),
            })
        }
        // Refresh the active view
        if (tab === 0) loadMine()
        if (tab === 1) loadCreated()
        if (tab === 2) loadAll()
    }

    const tabSx = {
        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em',
        minHeight: 40, padding: '8px 16px',
        color: 'rgba(237,237,237,0.5)',
        '&.Mui-selected': { color: 'var(--foreground)' },
    }

    const filteredAll = allFilter
        ? allTasks.filter(t =>
            t.title.toLowerCase().includes(allFilter.toLowerCase()) ||
            t.assignedToName?.toLowerCase().includes(allFilter.toLowerCase()) ||
            t.assignedRole?.toLowerCase().includes(allFilter.toLowerCase()) ||
            t.department?.toLowerCase().includes(allFilter.toLowerCase())
        )
        : allTasks

    return (
        <div className='h-full w-full flex flex-col max-w-[1100px]'>
            {/* Header */}
            <div
                className='flex items-center justify-between px-5 py-3 mx-6 mt-6'
                style={{
                    position: 'relative',
                    border: '1px solid rgba(219,0,29,0.42)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <CornerBrackets />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'rgba(219,0,29,0.35)' }}>{'//'}</span> UNIT
                    </span>
                    <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        Tasks
                    </Typography>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                        onClick={toggleCompleted}
                        style={{
                            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                            padding: '5px 12px', cursor: 'pointer', borderRadius: 999,
                            background: showCompleted ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${showCompleted ? 'rgba(34,197,94,0.4)' : 'rgba(219,0,29,0.25)'}`,
                            color: showCompleted ? 'rgba(34,197,94,0.8)' : 'rgba(237,237,237,0.55)',
                        }}
                    >
                        {showCompleted ? '● Showing completed' : '○ Show completed'}
                    </button>
                    {(tab === 1 || (tab === 2 && isElevated)) && (
                        <button
                            onClick={() => setCreateOpen(true)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                padding: '5px 12px', cursor: 'pointer', borderRadius: 999,
                                background: 'rgba(219,0,29,0.25)', border: '1px solid rgba(219,0,29,0.4)',
                                color: 'rgba(237,237,237,0.9)',
                            }}
                        >
                            <Add sx={{ fontSize: '0.85rem' }} /> New Task
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className='mx-6 mt-4' style={{ borderBottom: '1px solid rgba(219,0,29,0.42)' }}>
                <Tabs
                    value={tab}
                    onChange={(_, v) => setTab(v)}
                    TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                    sx={{ minHeight: 40 }}
                >
                    <Tab label='My Tasks' sx={tabSx} />
                    <Tab label='Created by Me' sx={tabSx} />
                    {isElevated && <Tab label='All Tasks' sx={tabSx} />}
                </Tabs>
            </div>

            {/* Content */}
            <div className='flex-1 min-h-0 overflow-y-auto px-6 py-4'>
                {tab === 0 && (
                    <>
                        {!myLoading && myTasks.length > 0 && (
                            <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.25)', marginBottom: 10, fontFamily: 'monospace' }}>
                                {myTasks.filter(t => t.status !== 'completed').length} pending
                                {showCompleted ? ` · ${myTasks.filter(t => t.status === 'completed').length} completed` : ''}
                            </div>
                        )}
                        <TaskList tasks={myTasks} onAction={handleAction} loading={myLoading} emptyLabel='No tasks assigned to you' />
                    </>
                )}

                {tab === 1 && (
                    <>
                        <div style={{ marginBottom: 12 }}>
                            {!createdLoading && createdTasks.length > 0 && (
                                <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.25)', marginBottom: 10, fontFamily: 'monospace' }}>
                                    {createdTasks.filter(t => t.status !== 'completed').length} pending
                                    {showCompleted ? ` · ${createdTasks.filter(t => t.status === 'completed').length} completed` : ''}
                                </div>
                            )}
                        </div>
                        <TaskList tasks={createdTasks} onAction={handleAction} loading={createdLoading} showAssignee emptyLabel="You haven't created any tasks" />
                    </>
                )}

                {tab === 2 && isElevated && (
                    <>
                        <div style={{ marginBottom: 12 }}>
                            <input
                                placeholder='Filter by title, assignee, department…'
                                value={allFilter}
                                onChange={e => setAllFilter(e.target.value)}
                                style={{
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(219,0,29,0.2)',
                                    color: 'rgba(237,237,237,0.8)', padding: '7px 12px', fontSize: '0.75rem',
                                    width: '100%', maxWidth: 380, outline: 'none', boxSizing: 'border-box',
                                    borderRadius: 0,
                                }}
                            />
                            {!allLoading && (
                                <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.25)', marginTop: 8, fontFamily: 'monospace' }}>
                                    {filteredAll.filter(t => t.status !== 'completed').length} pending
                                    {showCompleted ? ` · ${filteredAll.filter(t => t.status === 'completed').length} completed` : ''}
                                    {allFilter ? ` (filtered from ${allTasks.length})` : ''}
                                </div>
                            )}
                        </div>
                        <TaskList tasks={filteredAll} onAction={handleAction} loading={allLoading} showAssignee emptyLabel='No tasks found' />
                    </>
                )}
            </div>

            <CreateTaskDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={() => {
                    if (tab === 1) loadCreated()
                    else if (tab === 2) loadAll()
                }}
            />
        </div>
    )
}
