'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Typography, Tabs, Tab, Dialog, DialogContent, TextField, Autocomplete } from '@mui/material'
import { Add, Delete, OpenInNew, NotificationsActive, CalendarToday, Person, Warning } from '@mui/icons-material'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import { useLockout } from '@/app/dashboard/StaffDashboardShell'

// ── Types ──────────────────────────────────────────────────────────────────────

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue'
type TaskType   = 'manual' | 'attendance' | 'application_review' | 'extension_review'

interface ExtensionRequest {
    requestedDate: string
    reason: string
    requestedAt: string
    status: 'pending' | 'approved' | 'denied' | 'alternative'
    approverNote?: string
    alternativeDate?: string
    alternativeReminderDate?: string
}

interface ReassignmentRequest {
    requestedToId: string; requestedToName: string; reason: string; requestedAt: string
    status: 'pending' | 'approved' | 'denied' | 'redirected'
    approverNote?: string; finalAssigneeId?: string; finalAssigneeName?: string
}

interface DeleteRequest {
    reason?: string; requestedAt: string; requestedById: string; requestedByName: string
    status: 'pending' | 'approved' | 'denied'; approverNote?: string
}

interface TaskItem {
    _id: string; title: string; description?: string; type?: TaskType; status: TaskStatus
    assignedTo?: string; assignedToName?: string; assignedRole?: string
    assignedBy: string; assignedByName: string
    dueDate?: string | null; originalDueDate?: string | null; completedAt?: string | null
    startedAt?: string | null; notes?: string; department?: string
    actionUrl?: string; relatedId?: string; createdAt: string; reminderDateTime?: string | null
    extensionRequest?: ExtensionRequest; reassignmentRequest?: ReassignmentRequest
    deleteRequest?: DeleteRequest
}

interface MemberOption { id: string; displayName: string; username: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

function typeBadge(type?: TaskType): { label: string; color: string } {
    if (type === 'attendance')         return { label: 'ATT', color: '#f97316' }
    if (type === 'application_review') return { label: 'APP', color: '#3b82f6' }
    if (type === 'extension_review')   return { label: 'EXT', color: '#f59e0b' }
    return { label: 'TSK', color: 'rgba(237,237,237,0.3)' }
}

function statusColor(s: TaskStatus) {
    if (s === 'completed')   return 'rgba(34,197,94,0.7)'
    if (s === 'in_progress') return '#f59e0b'
    if (s === 'overdue')     return 'rgba(219,0,29,0.8)'
    return 'rgba(237,237,237,0.35)'
}

function fmtDate(iso?: string | null, withTime = true) {
    if (!iso) return null
    const d = new Date(iso)
    if (withTime) return d.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
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
}

const fldLabel: React.CSSProperties = {
    display: 'block', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 4,
}

const rawInput: React.CSSProperties = {
    display: 'block', width: '100%', fontSize: '0.8rem', color: 'rgba(237,237,237,0.85)',
    background: 'rgba(255,255,255,0.04)', padding: '7px 10px',
    border: '1px solid rgba(219,0,29,0.25)', boxSizing: 'border-box',
    outline: 'none', borderRadius: 0, colorScheme: 'dark', fontFamily: 'inherit',
}

const rawTextarea: React.CSSProperties = { ...rawInput, resize: 'vertical', lineHeight: 1.5 }

// ── Action button ─────────────────────────────────────────────────────────────

function ActionBtn({ label, icon, color, onClick, disabled }: {
    label: string; icon?: React.ReactNode; color: string; onClick: () => void; disabled?: boolean
}) {
    return (
        <button onClick={onClick} disabled={disabled} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: `1px solid ${disabled ? 'rgba(255,255,255,0.1)' : color}`,
            color: disabled ? 'rgba(255,255,255,0.2)' : color,
            padding: '4px 10px', cursor: disabled ? 'not-allowed' : 'pointer', borderRadius: 3,
            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'background 0.12s',
        }}
            onMouseEnter={e => { if (!disabled) (e.currentTarget.style.background = color.replace(/,\s*[\d.]+\)$/, ', 0.12)')) }}
            onMouseLeave={e => { if (!disabled) (e.currentTarget.style.background = 'none') }}
        >{icon}{label}</button>
    )
}

// ── Extension decision form (shared between direct and review-task paths) ──────

function ExtDecisionForm({
    mode, onConfirm, onBack,
}: {
    mode: 'approve' | 'deny' | 'alternative'
    onConfirm: (data: { note: string; altDate: string; altReminder: string; newReminder: string }) => void
    onBack: () => void
}) {
    const [note, setNote]           = useState('')
    const [altDate, setAltDate]     = useState('')
    const [altReminder, setAltReminder] = useState('')
    const [newReminder, setNewReminder] = useState('')
    const [err, setErr]             = useState('')

    function submit() {
        if (mode === 'alternative' && !altDate) { setErr('Alternative date & time is required.'); return }
        if (mode === 'alternative' && altDate && altReminder && new Date(altReminder) > new Date(altDate)) {
            setErr('Reminder must be before or on the alternative due date.'); return
        }
        setErr('')
        onConfirm({ note, altDate, altReminder, newReminder })
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mode === 'alternative' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                        <label style={fldLabel}>Alternative Due Date & Time <span style={{ color: 'rgba(219,0,29,1)' }}>*</span></label>
                        <input type='datetime-local' value={altDate} onChange={e => setAltDate(e.target.value)} style={{ ...rawInput, cursor: 'pointer' }} />
                    </div>
                    <div>
                        <label style={fldLabel}>New Reminder (optional)</label>
                        <input type='datetime-local' value={altReminder} onChange={e => setAltReminder(e.target.value)} style={{ ...rawInput, cursor: 'pointer' }} />
                    </div>
                </div>
            )}
            {mode === 'approve' && (
                <div>
                    <label style={fldLabel}>Set New Reminder (optional)</label>
                    <input type='datetime-local' value={newReminder} onChange={e => setNewReminder(e.target.value)} style={{ ...rawInput, cursor: 'pointer' }} />
                </div>
            )}
            <div>
                <label style={fldLabel}>
                    Note {mode === 'deny' ? '(optional)' : mode === 'alternative' ? '(optional)' : '(optional)'}
                </label>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder='Add a note for the assignee…' style={rawInput} />
            </div>
            {err && <div style={{ fontSize: '0.65rem', color: 'rgba(219,0,29,0.8)' }}>{err}</div>}
            <div style={{ display: 'flex', gap: 6 }}>
                <ActionBtn
                    label={mode === 'approve' ? 'Confirm Approval' : mode === 'deny' ? 'Confirm Denial' : 'Send Alternative'}
                    color={mode === 'approve' ? 'rgba(34,197,94,0.7)' : mode === 'deny' ? 'rgba(219,0,29,0.6)' : 'rgba(245,158,11,0.7)'}
                    onClick={submit}
                />
                <ActionBtn label='Back' color='rgba(237,237,237,0.3)' onClick={onBack} />
            </div>
        </div>
    )
}

// ── Task Card ──────────────────────────────────────────────────────────────────

function TaskCard({
    task, onAction, showAssignee = false, highlighted = false, scrollIntoView = false, userId,
}: {
    task: TaskItem; onAction: (id: string, action: string, extra?: Record<string, unknown>) => Promise<void>
    showAssignee?: boolean; highlighted?: boolean; scrollIntoView?: boolean; userId: string
}) {
    const cardRef = useRef<HTMLDivElement>(null)
    const [expanded, setExpanded]       = useState(highlighted)
    const [completingNotes, setCompletingNotes] = useState('')
    const [confirmingComplete, setConfirmingComplete] = useState(false)
    const [extending, setExtending]     = useState(false)
    const [newDueDate, setNewDueDate]   = useState('')

    // Extension request (assignee)
    const [requestingExtension, setRequestingExtension] = useState(false)
    const [extReqDate, setExtReqDate]   = useState('')
    const [extReqReason, setExtReqReason] = useState('')

    // Extension decision (creator view — for both direct tasks and extension_review tasks)
    // context: 'direct' uses approve_extension etc; 'review' uses approve_extension_review etc
    const [extDecisionMode, setExtDecisionMode]       = useState<'approve' | 'deny' | 'alternative' | null>(null)
    const [extDecisionContext, setExtDecisionContext]  = useState<'direct' | 'review'>('direct')

    // Reassignment request (assignee)
    const [requestingReassign, setRequestingReassign] = useState(false)
    const [reassignSearch, setReassignSearch]         = useState('')
    const [reassignOptions, setReassignOptions]       = useState<MemberOption[]>([])
    const [reassignTarget, setReassignTarget]         = useState<MemberOption | null>(null)
    const [reassignReason, setReassignReason]         = useState('')

    // Reassignment decision (creator)
    const [reassignDecision, setReassignDecision]     = useState<'approve' | 'deny' | 'redirect' | null>(null)
    const [reassignDecisionNote, setReassignDecisionNote] = useState('')
    const [reassignNewTarget, setReassignNewTarget]   = useState<MemberOption | null>(null)
    const [reassignNewSearch, setReassignNewSearch]   = useState('')
    const [reassignNewOptions, setReassignNewOptions] = useState<MemberOption[]>([])
    const [reassignNewDue, setReassignNewDue]         = useState('')
    const [reassignNewReminder, setReassignNewReminder] = useState('')

    // Delete modal ('direct' = creator deletes; 'request' = assignee requests)
    const [deleteModal, setDeleteModal]               = useState<'direct' | 'request' | null>(null)
    const [deleteReason, setDeleteReason]             = useState('')
    const [deleteReasonError, setDeleteReasonError]   = useState('')
    // Delete decision (creator)
    const [deleteDecision, setDeleteDecision]         = useState<'approve' | 'deny' | null>(null)
    const [deleteDecisionNote, setDeleteDecisionNote] = useState('')

    const badge   = typeBadge(task.type)
    const overdue = isOverdue(task.dueDate) && task.status !== 'completed'

    const isCreator  = task.assignedBy === userId
    const isAssignee = task.assignedTo === userId

    // A modal form is "active" if an inline request/decision form is open
    const anyFormActive = requestingExtension || requestingReassign || deleteModal !== null
        || confirmingComplete || extending || extDecisionMode !== null
        || reassignDecision !== null || deleteDecision !== null

    // Scroll into view only for deep-link highlights, not lockout highlights
    useEffect(() => {
        if (scrollIntoView && cardRef.current) {
            cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
    }, [scrollIntoView])

    // Member search for reassignment request
    const reassignTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => {
        if (reassignTimer.current) clearTimeout(reassignTimer.current)
        if (reassignSearch.length < 2) { setReassignOptions([]); return }
        reassignTimer.current = setTimeout(async () => {
            const d = await fetch(`/api/admin/members?search=${encodeURIComponent(reassignSearch)}&limit=10`).then(r => r.json())
            setReassignOptions((d.members ?? []).map((m: MemberOption) => ({ id: m.id, displayName: m.displayName, username: m.username })))
        }, 300)
    }, [reassignSearch])

    const reassignNewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => {
        if (reassignNewTimer.current) clearTimeout(reassignNewTimer.current)
        if (reassignNewSearch.length < 2) { setReassignNewOptions([]); return }
        reassignNewTimer.current = setTimeout(async () => {
            const d = await fetch(`/api/admin/members?search=${encodeURIComponent(reassignNewSearch)}&limit=10`).then(r => r.json())
            setReassignNewOptions((d.members ?? []).map((m: MemberOption) => ({ id: m.id, displayName: m.displayName, username: m.username })))
        }, 300)
    }, [reassignNewSearch])

    // ── Helper: open extension decision form ────────────────────────────────
    function openExtDecision(mode: typeof extDecisionMode, context: 'direct' | 'review') {
        setExtDecisionMode(mode)
        setExtDecisionContext(context)
    }

    // ── Helper: submit extension decision ──────────────────────────────────
    async function submitExtDecision(data: { note: string; altDate: string; altReminder: string; newReminder: string }) {
        const actionMap = {
            direct: { approve: 'approve_extension', deny: 'deny_extension', alternative: 'suggest_alternative' },
            review: { approve: 'approve_extension_review', deny: 'deny_extension_review', alternative: 'suggest_alternative_review' },
        }
        const action = actionMap[extDecisionContext][extDecisionMode!]
        const extra: Record<string, unknown> = { approverNote: data.note }
        if (extDecisionMode === 'alternative') { extra.alternativeDate = data.altDate; extra.alternativeReminderDate = data.altReminder }
        if (extDecisionMode === 'approve' && data.newReminder) extra.newReminderDate = data.newReminder
        await onAction(task._id, action, extra)
        setExtDecisionMode(null)
    }

    return (
        <div ref={cardRef} style={{
            border: '1px solid rgba(255,255,255,0.07)',
            borderLeft: `3px solid ${highlighted ? 'rgba(219,0,29,0.9)' : badge.color}`,
            background: highlighted ? 'rgba(219,0,29,0.05)' : task.status === 'completed' ? 'rgba(34,197,94,0.03)' : 'rgba(255,255,255,0.025)',
            marginBottom: 6, position: 'relative',
            boxShadow: highlighted ? '0 0 0 1px rgba(219,0,29,0.35)' : undefined,
            transition: 'box-shadow 0.3s',
        }}>

            {/* ── Collapsed row ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
                <span style={{ fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.1em', padding: '2px 5px', border: `1px solid ${badge.color}`, color: badge.color, borderRadius: 3, fontFamily: 'monospace', flexShrink: 0 }}>{badge.label}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: task.status === 'completed' ? 'rgba(237,237,237,0.4)' : 'rgba(237,237,237,0.85)', textDecoration: task.status === 'completed' ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {task.title}
                    </div>
                    <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {showAssignee && (task.assignedToName || task.assignedRole) && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Person sx={{ fontSize: 9 }} />{task.assignedToName ?? `@${task.assignedRole}`}</span>}
                        {!showAssignee && task.assignedByName && <span>{task.assignedByName === 'System' ? 'Auto-assigned' : `From: ${task.assignedByName}`}</span>}
                        {task.dueDate && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: overdue ? 'rgba(219,0,29,0.8)' : 'rgba(237,237,237,0.3)' }}><CalendarToday sx={{ fontSize: 9 }} />Due {fmtDate(task.dueDate)}{overdue ? ' — overdue' : ''}</span>}
                        {task.reminderDateTime && task.status !== 'completed' && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'rgba(255,160,0,0.5)' }}><NotificationsActive sx={{ fontSize: 9 }} />Reminder {fmtDate(task.reminderDateTime)}</span>}
                        {task.completedAt && <span style={{ color: 'rgba(34,197,94,0.6)' }}>Completed {fmtDate(task.completedAt, false)}</span>}
                        {task.department && <span style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)' }}>{task.department}</span>}
                    </div>
                </div>
                <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 2, border: `1px solid ${statusColor(task.status)}`, color: statusColor(task.status), flexShrink: 0 }}>{task.status.replace('_', ' ')}</span>
                <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.25)', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
            </div>

            {/* ── Expanded detail ── */}
            {expanded && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                    {/* Meta */}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {task.dueDate && <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)' }}><span style={{ color: 'rgba(237,237,237,0.25)', marginRight: 4 }}>DUE</span>{fmtDate(task.dueDate)}</div>}
                        {task.reminderDateTime && <div style={{ fontSize: '0.62rem', color: 'rgba(255,160,0,0.55)' }}><span style={{ color: 'rgba(255,160,0,0.3)', marginRight: 4 }}>REMINDER</span>{fmtDate(task.reminderDateTime)}</div>}
                        {showAssignee && task.assignedToName && <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)' }}><span style={{ color: 'rgba(237,237,237,0.25)', marginRight: 4 }}>MEMBER</span>{task.assignedToName}</div>}
                        {showAssignee && task.assignedRole && <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)' }}><span style={{ color: 'rgba(237,237,237,0.25)', marginRight: 4 }}>ROLE</span>{task.assignedRole}</div>}
                        {task.department && <div style={{ fontSize: '0.62rem', color: 'rgba(219,0,29,0.5)', textTransform: 'uppercase' }}><span style={{ color: 'rgba(219,0,29,0.3)', marginRight: 4 }}>DEPT</span>{task.department}</div>}
                        <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)' }}>Created {fmtDate(task.createdAt, false)}{!showAssignee && task.assignedByName ? ` by ${task.assignedByName}` : ''}</div>
                    </div>

                    {task.description && <p style={{ margin: 0, fontSize: '0.7rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.6 }}>{task.description}</p>}
                    {task.notes && (
                        <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', padding: '6px 10px' }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(34,197,94,0.6)', marginBottom: 3 }}>COMPLETION NOTES</div>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.5 }}>{task.notes}</p>
                        </div>
                    )}

                    {/* ── Extension request — creator view (on direct task) ── */}
                    {showAssignee && task.extensionRequest?.status === 'pending' && (
                        <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(245,158,11,0.8)' }}>EXTENSION REQUEST</div>
                            <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.6 }}>
                                <div>{task.assignedToName ?? 'Assignee'} has requested a due date extension.</div>
                                <div><span style={{ color: 'rgba(237,237,237,0.35)' }}>Requested date/time:</span> {fmtDate(task.extensionRequest.requestedDate)}</div>
                                <div><span style={{ color: 'rgba(237,237,237,0.35)' }}>Reason:</span> {task.extensionRequest.reason}</div>
                            </div>
                            {extDecisionMode === null || extDecisionContext !== 'direct' ? (
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <ActionBtn label='Approve' color='rgba(34,197,94,0.7)' onClick={() => openExtDecision('approve', 'direct')} />
                                    <ActionBtn label='Deny' color='rgba(219,0,29,0.6)' onClick={() => openExtDecision('deny', 'direct')} />
                                    <ActionBtn label='Suggest Alternative' color='rgba(245,158,11,0.6)' onClick={() => openExtDecision('alternative', 'direct')} />
                                </div>
                            ) : (
                                <ExtDecisionForm mode={extDecisionMode} onConfirm={submitExtDecision} onBack={() => setExtDecisionMode(null)} />
                            )}
                        </div>
                    )}

                    {/* Extension alternative banner — assignee view */}
                    {!showAssignee && task.extensionRequest?.status === 'alternative' && (
                        <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(245,158,11,0.8)' }}>ALTERNATIVE DATE SUGGESTED</div>
                            <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.6 }}>
                                <div>Your extension request was not approved as requested. An alternative has been suggested.</div>
                                <div><span style={{ color: 'rgba(237,237,237,0.35)' }}>Suggested date/time:</span> {fmtDate(task.extensionRequest.alternativeDate)}</div>
                                {task.extensionRequest.approverNote && <div><span style={{ color: 'rgba(237,237,237,0.35)' }}>Note:</span> {task.extensionRequest.approverNote}</div>}
                            </div>
                        </div>
                    )}

                    {/* ── Reassignment request — creator view ── */}
                    {showAssignee && task.reassignmentRequest?.status === 'pending' && (
                        <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(59,130,246,0.8)' }}>REASSIGNMENT REQUEST</div>
                            <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.6 }}>
                                <div>{task.assignedToName ?? 'Assignee'} has requested reassignment.</div>
                                <div><span style={{ color: 'rgba(237,237,237,0.35)' }}>Requested assignee:</span> {task.reassignmentRequest.requestedToName}</div>
                                <div><span style={{ color: 'rgba(237,237,237,0.35)' }}>Reason:</span> {task.reassignmentRequest.reason}</div>
                            </div>
                            {!reassignDecision ? (
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <ActionBtn label='Approve' color='rgba(34,197,94,0.7)' onClick={() => setReassignDecision('approve')} />
                                    <ActionBtn label='Deny' color='rgba(219,0,29,0.6)' onClick={() => setReassignDecision('deny')} />
                                    <ActionBtn label='Assign to Someone Else' color='rgba(59,130,246,0.7)' onClick={() => setReassignDecision('redirect')} />
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {reassignDecision === 'redirect' && (
                                        <>
                                            <div>
                                                <label style={fldLabel}>Assign to <span style={{ color: 'rgba(219,0,29,1)' }}>*</span></label>
                                                <Autocomplete options={reassignNewOptions} getOptionLabel={o => `${o.displayName} (@${o.username})`} value={reassignNewTarget} onChange={(_, v) => setReassignNewTarget(v)} inputValue={reassignNewSearch} onInputChange={(_, v) => setReassignNewSearch(v)} noOptionsText={reassignNewSearch.length < 2 ? 'Type to search…' : 'No members found'} size='small' renderInput={params => <TextField {...params} placeholder='Search member…' size='small' sx={inputSx} />} sx={{ '& .MuiAutocomplete-listbox': { background: '#1a1a1a', fontSize: '0.8rem' } }} />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                <div><label style={fldLabel}>New Due Date & Time (optional)</label><input type='datetime-local' value={reassignNewDue} onChange={e => setReassignNewDue(e.target.value)} style={{ ...rawInput, cursor: 'pointer' }} /></div>
                                                <div><label style={fldLabel}>New Reminder (optional)</label><input type='datetime-local' value={reassignNewReminder} onChange={e => setReassignNewReminder(e.target.value)} style={{ ...rawInput, cursor: 'pointer' }} /></div>
                                            </div>
                                        </>
                                    )}
                                    <div><label style={fldLabel}>Note (optional)</label><input value={reassignDecisionNote} onChange={e => setReassignDecisionNote(e.target.value)} placeholder='Add a note…' style={rawInput} /></div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <ActionBtn
                                            label={reassignDecision === 'approve' ? 'Confirm Approval' : reassignDecision === 'deny' ? 'Confirm Denial' : 'Confirm Assignment'}
                                            color={reassignDecision === 'approve' ? 'rgba(34,197,94,0.7)' : reassignDecision === 'deny' ? 'rgba(219,0,29,0.6)' : 'rgba(59,130,246,0.7)'}
                                            onClick={async () => {
                                                const actionMap = { approve: 'approve_reassignment', deny: 'deny_reassignment', redirect: 'redirect_reassignment' }
                                                const extra: Record<string, unknown> = { approverNote: reassignDecisionNote }
                                                if (reassignDecision === 'redirect') {
                                                    extra.newAssigneeId = reassignNewTarget?.id; extra.newAssigneeName = reassignNewTarget?.displayName
                                                    if (reassignNewDue) extra.newDueDate = reassignNewDue
                                                    if (reassignNewReminder) extra.newReminderDate = reassignNewReminder
                                                }
                                                await onAction(task._id, actionMap[reassignDecision!], extra)
                                                setReassignDecision(null); setReassignDecisionNote(''); setReassignNewTarget(null); setReassignNewDue(''); setReassignNewReminder('')
                                            }}
                                        />
                                        <ActionBtn label='Back' color='rgba(237,237,237,0.3)' onClick={() => { setReassignDecision(null); setReassignDecisionNote('') }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Delete request — creator view ── */}
                    {showAssignee && task.deleteRequest?.status === 'pending' && (
                        <div style={{ background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.25)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(219,0,29,0.7)' }}>DELETE REQUEST</div>
                            <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.6 }}>
                                <div>{task.deleteRequest.requestedByName} has requested deletion of this task.</div>
                                {task.deleteRequest.reason && <div><span style={{ color: 'rgba(237,237,237,0.35)' }}>Reason:</span> {task.deleteRequest.reason}</div>}
                            </div>
                            {deleteDecision === null ? (
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <ActionBtn label='Approve (delete)' color='rgba(219,0,29,0.7)' onClick={() => setDeleteDecision('approve')} />
                                    <ActionBtn label='Deny' color='rgba(237,237,237,0.4)' onClick={() => setDeleteDecision('deny')} />
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div><label style={fldLabel}>Note (optional)</label><input value={deleteDecisionNote} onChange={e => setDeleteDecisionNote(e.target.value)} placeholder='Add a note for the requester…' style={rawInput} /></div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <ActionBtn
                                            label={deleteDecision === 'approve' ? 'Confirm Delete' : 'Confirm Denial'}
                                            color={deleteDecision === 'approve' ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.4)'}
                                            onClick={async () => {
                                                await onAction(task._id, deleteDecision === 'approve' ? 'approve_delete' : 'deny_delete', { approverNote: deleteDecisionNote })
                                                setDeleteDecision(null); setDeleteDecisionNote('')
                                            }}
                                        />
                                        <ActionBtn label='Back' color='rgba(237,237,237,0.3)' onClick={() => { setDeleteDecision(null); setDeleteDecisionNote('') }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Extension review task (My Tasks version) ── */}
                    {task.type === 'extension_review' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {extDecisionMode === null ? (
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <ActionBtn label='Approve' color='rgba(34,197,94,0.7)' onClick={() => openExtDecision('approve', 'review')} />
                                    <ActionBtn label='Deny' color='rgba(219,0,29,0.6)' onClick={() => openExtDecision('deny', 'review')} />
                                    <ActionBtn label='Suggest Alternative' color='rgba(245,158,11,0.6)' onClick={() => openExtDecision('alternative', 'review')} />
                                    <ActionBtn label='Delete' icon={<Delete sx={{ fontSize: '0.75rem' }} />} color='rgba(219,0,29,0.5)' onClick={() => setDeleteModal('direct')} />
                                </div>
                            ) : (
                                <ExtDecisionForm mode={extDecisionMode} onConfirm={submitExtDecision} onBack={() => setExtDecisionMode(null)} />
                            )}
                        </div>
                    ) : (
                        <>
                            {/* ── Extension request form (assignee, full-width, replaces action bar) ── */}
                            {requestingExtension && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid rgba(245,158,11,0.2)', padding: '10px 12px', background: 'rgba(245,158,11,0.03)' }}>
                                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(245,158,11,0.7)' }}>REQUEST EXTENSION</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        <div>
                                            <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.35)', marginBottom: 4 }}>NEW DATE & TIME <span style={{ color: 'rgba(219,0,29,1)' }}>*</span></div>
                                            <input type='datetime-local' value={extReqDate} onChange={e => setExtReqDate(e.target.value)} style={{ ...rawInput, cursor: 'pointer' }} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.35)', marginBottom: 4 }}>REASON <span style={{ color: 'rgba(219,0,29,1)' }}>*</span></div>
                                            <textarea value={extReqReason} onChange={e => setExtReqReason(e.target.value)} rows={2} placeholder='Explain why you need an extension…' style={rawTextarea} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <ActionBtn label='Submit Request' color='rgba(245,158,11,0.7)' onClick={async () => {
                                            if (extReqDate && extReqReason.trim()) {
                                                await onAction(task._id, 'request_extension', { requestedDate: extReqDate, reason: extReqReason.trim() })
                                                setRequestingExtension(false); setExtReqDate(''); setExtReqReason('')
                                            }
                                        }} />
                                        <ActionBtn label='Cancel' color='rgba(237,237,237,0.3)' onClick={() => { setRequestingExtension(false); setExtReqDate(''); setExtReqReason('') }} />
                                    </div>
                                </div>
                            )}

                            {/* ── Reassignment request form (assignee) ── */}
                            {requestingReassign && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid rgba(59,130,246,0.2)', padding: '10px 12px', background: 'rgba(59,130,246,0.03)' }}>
                                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(59,130,246,0.7)' }}>REQUEST REASSIGNMENT</div>
                                    <div>
                                        <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.35)', marginBottom: 4 }}>REQUESTED ASSIGNEE <span style={{ color: 'rgba(219,0,29,1)' }}>*</span></div>
                                        <Autocomplete options={reassignOptions} getOptionLabel={o => `${o.displayName} (@${o.username})`} value={reassignTarget} onChange={(_, v) => setReassignTarget(v)} inputValue={reassignSearch} onInputChange={(_, v) => setReassignSearch(v)} noOptionsText={reassignSearch.length < 2 ? 'Type to search…' : 'No members found'} size='small' renderInput={params => <TextField {...params} placeholder='Search member…' size='small' sx={inputSx} />} sx={{ '& .MuiAutocomplete-listbox': { background: '#1a1a1a', fontSize: '0.8rem' } }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.35)', marginBottom: 4 }}>REASON <span style={{ color: 'rgba(219,0,29,1)' }}>*</span></div>
                                        <textarea value={reassignReason} onChange={e => setReassignReason(e.target.value)} rows={2} placeholder='Why should this be reassigned?' style={rawTextarea} />
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <ActionBtn label='Submit Request' color='rgba(59,130,246,0.7)' onClick={async () => {
                                            if (reassignTarget && reassignReason.trim()) {
                                                await onAction(task._id, 'request_reassignment', { requestedToId: reassignTarget.id, requestedToName: reassignTarget.displayName, reason: reassignReason.trim() })
                                                setRequestingReassign(false); setReassignTarget(null); setReassignSearch(''); setReassignReason('')
                                            }
                                        }} />
                                        <ActionBtn label='Cancel' color='rgba(237,237,237,0.3)' onClick={() => { setRequestingReassign(false); setReassignTarget(null); setReassignSearch(''); setReassignReason('') }} />
                                    </div>
                                </div>
                            )}

                            {/* Delete modal (Dialog) */}
                            <Dialog
                                open={deleteModal !== null}
                                onClose={() => { setDeleteModal(null); setDeleteReason(''); setDeleteReasonError('') }}
                                maxWidth='xs'
                                fullWidth
                                PaperProps={{ style: { background: '#0f0f0f', border: '1px solid rgba(219,0,29,0.32)', borderRadius: 0 } }}
                            >
                                <DialogContent style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)' }}>
                                            {deleteModal === 'direct' ? 'Delete Task' : 'Request Task Deletion'}
                                        </span>
                                        <button onClick={() => { setDeleteModal(null); setDeleteReason(''); setDeleteReasonError('') }} style={{ background: 'none', border: 'none', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', fontSize: '1rem' }}>×</button>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.6 }}>
                                        {deleteModal === 'direct'
                                            ? 'Confirm that you want to delete this task.'
                                            : 'This task was assigned to you by another member. Deletion must be approved by the task creator/assigner.'}
                                    </p>
                                    {deleteModal === 'request' && (
                                        <div>
                                            <label style={fldLabel}>Reason <span style={{ color: 'rgba(219,0,29,1)' }}>*</span></label>
                                            <textarea
                                                value={deleteReason}
                                                onChange={e => { setDeleteReason(e.target.value); setDeleteReasonError('') }}
                                                rows={3}
                                                placeholder='Why do you want this task deleted?'
                                                style={rawTextarea}
                                            />
                                            {deleteReasonError && <div style={{ fontSize: '0.65rem', color: 'rgba(219,0,29,0.8)', marginTop: 4 }}>{deleteReasonError}</div>}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                                        <button
                                            onClick={() => { setDeleteModal(null); setDeleteReason(''); setDeleteReasonError('') }}
                                            style={{ background: 'none', border: '1px solid rgba(237,237,237,0.15)', color: 'rgba(237,237,237,0.4)', padding: '6px 16px', cursor: 'pointer', fontSize: '0.7rem' }}
                                        >
                                            CANCEL
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (deleteModal === 'request' && !deleteReason.trim()) {
                                                    setDeleteReasonError('A reason is required.')
                                                    return
                                                }
                                                if (deleteModal === 'direct') {
                                                    await onAction(task._id, 'delete')
                                                } else {
                                                    await onAction(task._id, 'request_delete', { reason: deleteReason.trim() })
                                                }
                                                setDeleteModal(null); setDeleteReason(''); setDeleteReasonError('')
                                            }}
                                            style={{ background: 'rgba(219,0,29,0.22)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.9)', padding: '6px 20px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}
                                        >
                                            {deleteModal === 'direct' ? 'DELETE TASK' : 'SUBMIT DELETE REQUEST'}
                                        </button>
                                    </div>
                                </DialogContent>
                            </Dialog>

                            {/* ── Completing notes panel ── */}
                            {confirmingComplete && (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                    <TextField label='Completion notes (optional)' size='small' value={completingNotes} onChange={e => setCompletingNotes(e.target.value)} multiline rows={2} sx={{ ...inputSx, minWidth: 240 }} />
                                    <ActionBtn label='Confirm' color='rgba(34,197,94,0.7)' onClick={async () => { await onAction(task._id, 'complete', { notes: completingNotes }); setConfirmingComplete(false) }} />
                                    <ActionBtn label='Cancel' color='rgba(237,237,237,0.3)' onClick={() => setConfirmingComplete(false)} />
                                </div>
                            )}

                            {/* ── Extend (creator) — direct date change ── */}
                            {extending && (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input type='datetime-local' value={newDueDate} onChange={e => setNewDueDate(e.target.value)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(219,0,29,0.25)', color: 'rgba(237,237,237,0.8)', padding: '4px 8px', fontSize: '0.72rem', borderRadius: 2, outline: 'none', colorScheme: 'dark' }} />
                                    <ActionBtn label='Save' color='rgba(34,197,94,0.7)' onClick={() => { if (newDueDate) { onAction(task._id, 'extend', { dueDate: newDueDate }); setExtending(false) } }} />
                                    <ActionBtn label='Cancel' color='rgba(237,237,237,0.3)' onClick={() => setExtending(false)} />
                                </div>
                            )}

                            {/* ── Primary action buttons — hidden while any form is active ── */}
                            {!anyFormActive && (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {task.actionUrl && <ActionBtn label='Open' icon={<OpenInNew sx={{ fontSize: '0.75rem' }} />} color='rgba(219,0,29,0.7)' onClick={() => (window.location.href = task.actionUrl!)} />}

                                    {task.status !== 'completed' && (
                                        <>
                                            {task.status === 'pending' && <ActionBtn label='Start' color='#f59e0b' onClick={() => onAction(task._id, 'start')} />}
                                            <ActionBtn label='Complete' color='rgba(34,197,94,0.7)' onClick={() => setConfirmingComplete(true)} />

                                            {/* Creator: direct extend */}
                                            {(isCreator || showAssignee) && <ActionBtn label='Extend' color='rgba(237,237,237,0.4)' onClick={() => setExtending(true)} />}

                                            {/* Assignee-only actions */}
                                            {!showAssignee && isAssignee && (
                                                <>
                                                    {task.extensionRequest?.status === 'pending'
                                                        ? <span style={{ fontSize: '0.6rem', color: 'rgba(245,158,11,0.7)', fontWeight: 600, letterSpacing: '0.06em', padding: '4px 0', alignSelf: 'center' }}>⏳ Extension requested</span>
                                                        : <ActionBtn label='Request Extension' color='rgba(245,158,11,0.6)' onClick={() => setRequestingExtension(true)} />
                                                    }
                                                    {task.reassignmentRequest?.status === 'pending'
                                                        ? <span style={{ fontSize: '0.6rem', color: 'rgba(59,130,246,0.7)', fontWeight: 600, letterSpacing: '0.06em', padding: '4px 0', alignSelf: 'center' }}>🔁 Reassignment requested</span>
                                                        : <ActionBtn label='Request Reassignment' color='rgba(59,130,246,0.6)' onClick={() => setRequestingReassign(true)} />
                                                    }
                                                </>
                                            )}
                                        </>
                                    )}

                                    {task.status === 'completed' && <ActionBtn label='Re-open' color='rgba(237,237,237,0.4)' onClick={() => onAction(task._id, 'reopen')} />}

                                    {/* Delete: creator deletes directly (via modal); assignee sends delete request (via modal) */}
                                    {isCreator
                                        ? <ActionBtn label='Delete' icon={<Delete sx={{ fontSize: '0.75rem' }} />} color='rgba(219,0,29,0.5)' onClick={() => setDeleteModal('direct')} />
                                        : task.deleteRequest?.status === 'pending'
                                            ? <span style={{ fontSize: '0.6rem', color: 'rgba(219,0,29,0.6)', fontWeight: 600, letterSpacing: '0.06em', padding: '4px 0', alignSelf: 'center' }}>🗑️ Delete requested</span>
                                            : isAssignee
                                                ? <ActionBtn label='Request Delete' icon={<Delete sx={{ fontSize: '0.75rem' }} />} color='rgba(219,0,29,0.4)' onClick={() => setDeleteModal('request')} />
                                                : null
                                    }
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Create Task Dialog ─────────────────────────────────────────────────────────

function CreateTaskDialog({ open, onClose, onCreated, availableRoles }: {
    open: boolean; onClose: () => void; onCreated: () => void; availableRoles: string[]
}) {
    const [title, setTitle]               = useState('')
    const [description, setDescription]   = useState('')
    const [department, setDepartment]     = useState('')
    const [dueDateTime, setDueDateTime]   = useState('')
    const [reminderDateTime, setReminder] = useState('')
    const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
    const [memberSearch, setMemberSearch] = useState('')
    const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
    const [assignedRole, setAssignedRole] = useState('')
    const [saving, setSaving]             = useState(false)
    const [error, setError]               = useState('')
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!open) return
        setTitle(''); setDescription(''); setDepartment(''); setDueDateTime(''); setReminder('')
        setSelectedMember(null); setMemberSearch(''); setMemberOptions([]); setAssignedRole(''); setError('')
    }, [open])

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current)
        if (memberSearch.length < 2) { setMemberOptions([]); return }
        timer.current = setTimeout(async () => {
            const d = await fetch(`/api/admin/members?search=${encodeURIComponent(memberSearch)}&limit=15`).then(r => r.json())
            setMemberOptions((d.members ?? []).map((m: MemberOption) => ({ id: m.id, displayName: m.displayName, username: m.username })))
        }, 300)
    }, [memberSearch])

    async function handleSubmit() {
        if (!title.trim()) { setError('Title is required.'); return }
        if (!description.trim()) { setError('Description is required.'); return }
        if (!dueDateTime) { setError('Due Date & Time is required.'); return }
        if (!selectedMember && !assignedRole) { setError('Assign to at least one member or role.'); return }
        if (reminderDateTime && new Date(reminderDateTime) > new Date(dueDateTime)) {
            setError('Reminder must not be later than the due date.'); return
        }
        setSaving(true); setError('')
        const body: Record<string, unknown> = {
            title: title.trim(), description: description.trim(), dueDate: dueDateTime,
            ...(department ? { department } : {}),
            ...(selectedMember ? { assignedTo: selectedMember.id, assignedToName: selectedMember.displayName } : {}),
            ...(assignedRole ? { assignedRole } : {}),
            ...(reminderDateTime ? { reminderDateTime } : {}),
        }
        const res = await fetch('/api/admin/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        setSaving(false)
        if (res.ok) { onCreated(); onClose() }
        else { const d = await res.json(); setError(d.error ?? 'Failed to create task') }
    }

    const sel: React.CSSProperties = { ...rawInput, cursor: 'pointer' }

    return (
        <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth PaperProps={{ style: { background: '#0f0f0f', border: '1px solid rgba(219,0,29,0.32)', borderRadius: 0 } }}>
            <DialogContent style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)' }}>NEW TASK</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', fontSize: '1rem' }}>×</button>
                </div>
                <div><label style={fldLabel}>Task Title <span style={{ color: 'rgba(219,0,29,1)' }}>*</span></label><input value={title} onChange={e => setTitle(e.target.value)} placeholder='What needs to be done?' style={rawInput} /></div>
                <div><label style={fldLabel}>Description <span style={{ color: 'rgba(219,0,29,1)' }}>*</span></label><textarea value={description} onChange={e => setDescription(e.target.value)} placeholder='Provide additional detail…' rows={3} style={rawTextarea} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                        <label style={fldLabel}>Assign to Member</label>
                        <Autocomplete options={memberOptions} getOptionLabel={o => `${o.displayName} (@${o.username})`} value={selectedMember} onChange={(_, v) => setSelectedMember(v)} inputValue={memberSearch} onInputChange={(_, v) => setMemberSearch(v)} noOptionsText={memberSearch.length < 2 ? 'Type to search…' : 'No members found'} size='small' renderInput={params => <TextField {...params} placeholder='Search member…' size='small' sx={inputSx} />} sx={{ '& .MuiAutocomplete-listbox': { background: '#1a1a1a', fontSize: '0.8rem' } }} />
                    </div>
                    <div>
                        <label style={fldLabel}>Assign to Role</label>
                        <select value={assignedRole} onChange={e => setAssignedRole(e.target.value)} style={sel}>
                            <option value=''>— No role —</option>
                            {availableRoles.map(r => <option key={r} value={r} style={{ background: '#1a1a1a' }}>{r}</option>)}
                        </select>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                        <label style={fldLabel}>Department</label>
                        <select value={department} onChange={e => setDepartment(e.target.value)} style={sel}>
                            <option value=''>— None —</option>
                            {['j1','j2','j3','j4','j5','j6','j7'].map(d => <option key={d} value={d} style={{ background: '#1a1a1a' }}>{d.toUpperCase()}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={fldLabel}>Due Date & Time <span style={{ color: 'rgba(219,0,29,1)' }}>*</span></label>
                        <input type='datetime-local' value={dueDateTime} onChange={e => setDueDateTime(e.target.value)} style={{ ...rawInput, cursor: 'pointer' }} />
                    </div>
                </div>
                <div>
                    <label style={fldLabel}>Reminder / Chase-Up <span style={{ color: 'rgba(237,237,237,0.2)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — must be before due date)</span></label>
                    <input type='datetime-local' value={reminderDateTime} onChange={e => setReminder(e.target.value)} style={{ ...rawInput, cursor: 'pointer' }} />
                </div>
                <div style={{ fontSize: '0.57rem', color: 'rgba(237,237,237,0.18)', marginTop: -6, lineHeight: 1.5 }}>At least one of Member or Role is required. If both are set, both will be notified without duplicates.</div>
                {error && <div style={{ fontSize: '0.7rem', color: 'rgba(219,0,29,0.8)', marginTop: -4 }}>{error}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                    <button onClick={onClose} style={{ background: 'none', border: '1px solid rgba(237,237,237,0.15)', color: 'rgba(237,237,237,0.4)', padding: '6px 16px', cursor: 'pointer', fontSize: '0.7rem' }}>CANCEL</button>
                    <button onClick={handleSubmit} disabled={saving} style={{ background: saving ? 'rgba(219,0,29,0.15)' : 'rgba(219,0,29,0.25)', border: '1px solid rgba(219,0,29,0.4)', color: saving ? 'rgba(237,237,237,0.4)' : 'rgba(237,237,237,0.9)', padding: '6px 20px', cursor: saving ? 'default' : 'pointer', fontSize: '0.7rem', fontWeight: 700 }}>{saving ? 'SAVING…' : 'CREATE TASK'}</button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ── Task list ──────────────────────────────────────────────────────────────────

function TaskList({ tasks, onAction, loading, showAssignee, emptyLabel = 'No tasks', highlightId, lockoutHighlightIds, userId }: {
    tasks: TaskItem[]; onAction: (id: string, action: string, extra?: Record<string, unknown>) => Promise<void>
    loading: boolean; showAssignee?: boolean; emptyLabel?: string; highlightId?: string | null
    lockoutHighlightIds?: Set<string>; userId: string
}) {
    if (loading) return <div style={{ padding: '32px 0', textAlign: 'center', fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', fontFamily: 'monospace' }}>Loading…</div>
    if (tasks.length === 0) return <div style={{ padding: '32px 0', textAlign: 'center', fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)' }}>{emptyLabel}</div>
    return (
        <div>
            {tasks.map(t => (
                <TaskCard
                    key={t._id}
                    task={t}
                    onAction={onAction}
                    showAssignee={showAssignee}
                    highlighted={t._id === highlightId || (lockoutHighlightIds?.has(t._id) ?? false)}
                    scrollIntoView={t._id === highlightId}
                    userId={userId}
                />
            ))}
        </div>
    )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TasksPage({ userId, displayName: _d, isElevated, isAllBatStaff: _a, userDepts: _ud, availableRoles }: {
    userId: string; displayName: string; isElevated: boolean; isAllBatStaff: boolean; userDepts: string[]; availableRoles: string[]
}) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const { lockoutActive, refreshLockout } = useLockout()

    const deepTaskId = searchParams.get('taskId')

    const [tab, setTab]                 = useState(0)
    const [myTasks, setMyTasks]         = useState<TaskItem[]>([])
    const [createdTasks, setCreatedTasks] = useState<TaskItem[]>([])
    const [allTasks, setAllTasks]       = useState<TaskItem[]>([])
    const [myLoading, setMyLoading]     = useState(true)
    const [createdLoading, setCreatedLoading] = useState(false)
    const [allLoading, setAllLoading]   = useState(false)
    const [showCompleted, setShowCompleted] = useState(false)
    const [createOpen, setCreateOpen]   = useState(false)
    const [allFilter, setAllFilter]     = useState('')

    const loadMine = useCallback(async (withCompleted = showCompleted) => {
        setMyLoading(true)
        const d = await fetch(`/api/admin/tasks?view=mine${withCompleted ? '&includeCompleted=true' : ''}`).then(r => r.json())
        setMyTasks(d.tasks ?? []); setMyLoading(false)
    }, [showCompleted])

    const loadCreated = useCallback(async (withCompleted = showCompleted) => {
        setCreatedLoading(true)
        const d = await fetch(`/api/admin/tasks?view=created${withCompleted ? '&includeCompleted=true' : ''}`).then(r => r.json())
        setCreatedTasks(d.tasks ?? []); setCreatedLoading(false)
    }, [showCompleted])

    const loadAll = useCallback(async (withCompleted = showCompleted) => {
        setAllLoading(true)
        const d = await fetch(`/api/admin/tasks?view=all${withCompleted ? '&includeCompleted=true' : ''}`).then(r => r.json())
        setAllTasks(d.tasks ?? []); setAllLoading(false)
    }, [showCompleted])

    useEffect(() => { loadMine() }, []) // eslint-disable-line
    useEffect(() => {
        if (tab === 1 && createdTasks.length === 0 && !createdLoading) loadCreated()
        if (tab === 2 && allTasks.length === 0 && !allLoading) loadAll()
    }, [tab]) // eslint-disable-line

    useEffect(() => { if (deepTaskId) setTab(0) }, [deepTaskId])
    // When lockout becomes active, force My Tasks tab
    useEffect(() => { if (lockoutActive) setTab(0) }, [lockoutActive])

    function toggleCompleted() {
        const next = !showCompleted; setShowCompleted(next)
        if (tab === 0) loadMine(next)
        if (tab === 1) loadCreated(next)
        if (tab === 2) loadAll(next)
    }

    async function handleAction(id: string, action: string, extra: Record<string, unknown> = {}) {
        if (action === 'delete') {
            await fetch(`/api/admin/tasks/${id}`, { method: 'DELETE' })
        } else {
            await fetch(`/api/admin/tasks/${id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...extra }),
            })
        }
        if (tab === 0) loadMine()
        if (tab === 1) loadCreated()
        if (tab === 2) loadAll()
        // Re-check lockout after every action so the guard clears once all overdue tasks are actioned
        if (lockoutActive) refreshLockout()
    }

    const tabSx = { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', minHeight: 40, padding: '8px 16px', color: 'rgba(237,237,237,0.5)', '&.Mui-selected': { color: 'var(--foreground)' } }

    const filteredAll = allFilter ? allTasks.filter(t =>
        t.title.toLowerCase().includes(allFilter.toLowerCase()) ||
        t.assignedToName?.toLowerCase().includes(allFilter.toLowerCase()) ||
        t.assignedRole?.toLowerCase().includes(allFilter.toLowerCase()) ||
        t.department?.toLowerCase().includes(allFilter.toLowerCase())
    ) : allTasks

    const overdueUnactioned = myTasks.filter(t =>
        isOverdue(t.dueDate) && t.status !== 'completed' && t.status !== 'in_progress' &&
        t.extensionRequest?.status !== 'pending' && t.reassignmentRequest?.status !== 'pending'
    )

    // When locked, highlight overdue tasks; deep-link takes priority
    const lockoutHighlightIds = lockoutActive
        ? new Set(overdueUnactioned.map(t => t._id))
        : undefined

    // First overdue task is scrolled into view when locked (unless a deep-link is active)
    const effectiveHighlightId = deepTaskId ?? (lockoutActive ? (overdueUnactioned[0]?._id ?? null) : null)

    return (
        <div className='h-full w-full flex flex-col max-w-[1100px]'>

            {/* Overdue lock banner */}
            {lockoutActive && (
                <div style={{ margin: '16px 24px 0', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.45)', borderLeft: '4px solid var(--red)', padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <Warning sx={{ fontSize: 20, color: 'rgba(219,0,29,0.8)', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(219,0,29,0.9)', marginBottom: 4 }}>
                            OVERDUE TASKS REQUIRE ACTION
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.5 }}>
                            {overdueUnactioned.length > 0
                                ? 'You must action your overdue tasks before using the rest of the member portal.'
                                : 'All overdue tasks have been actioned. You may return to the dashboard.'
                            }
                        </div>
                        {lockoutActive && overdueUnactioned.length === 0 && (
                            <button onClick={() => router.push('/dashboard')} style={{ marginTop: 8, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: 'rgba(34,197,94,0.9)', padding: '5px 14px', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700 }}>
                                All caught up — return to dashboard →
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Header */}
            <div className='flex items-center justify-between px-5 py-3 mx-6 mt-6' style={{ position: 'relative', border: '1px solid rgba(219,0,29,0.42)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.04)' }}>
                <CornerBrackets />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ color: 'rgba(219,0,29,0.35)' }}>{'//'}</span> UNIT</span>
                    <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>Tasks</Typography>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={toggleCompleted} style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 12px', cursor: 'pointer', borderRadius: 999, background: showCompleted ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${showCompleted ? 'rgba(34,197,94,0.4)' : 'rgba(219,0,29,0.25)'}`, color: showCompleted ? 'rgba(34,197,94,0.8)' : 'rgba(237,237,237,0.55)' }}>
                        {showCompleted ? '● Showing completed' : '○ Show completed'}
                    </button>
                    {(tab === 0 || tab === 1 || (tab === 2 && isElevated)) && (
                        <button onClick={() => setCreateOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 12px', cursor: 'pointer', borderRadius: 999, background: 'rgba(219,0,29,0.25)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.9)' }}>
                            <Add sx={{ fontSize: '0.85rem' }} /> New Task
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs — other tabs are disabled while lockout is active */}
            <div className='mx-6 mt-4' style={{ borderBottom: '1px solid rgba(219,0,29,0.42)' }}>
                <Tabs value={tab} onChange={(_, v) => { if (!lockoutActive) setTab(v) }} TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }} sx={{ minHeight: 40 }}>
                    <Tab label='My Tasks' sx={tabSx} />
                    <Tab label='Created by Me' sx={{ ...tabSx, opacity: lockoutActive ? 0.3 : 1, pointerEvents: lockoutActive ? 'none' : undefined }} />
                    {isElevated && <Tab label='All Tasks' sx={{ ...tabSx, opacity: lockoutActive ? 0.3 : 1, pointerEvents: lockoutActive ? 'none' : undefined }} />}
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
                                {overdueUnactioned.length > 0 && <span style={{ color: 'rgba(219,0,29,0.7)', marginLeft: 8 }}>· {overdueUnactioned.length} overdue unactioned</span>}
                            </div>
                        )}
                        {deepTaskId && !myLoading && !myTasks.find(t => t._id === deepTaskId) && (
                            <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', padding: '10px 14px', marginBottom: 10 }}>
                                The selected task could not be found in your tasks. It may have been completed, deleted, or reassigned.
                            </div>
                        )}
                        <TaskList tasks={myTasks} onAction={handleAction} loading={myLoading} emptyLabel='No tasks assigned to you' highlightId={effectiveHighlightId} lockoutHighlightIds={lockoutHighlightIds} userId={userId} />
                    </>
                )}

                {tab === 1 && !lockoutActive && (
                    <>
                        {!createdLoading && createdTasks.length > 0 && <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.25)', marginBottom: 10, fontFamily: 'monospace' }}>{createdTasks.filter(t => t.status !== 'completed').length} pending{showCompleted ? ` · ${createdTasks.filter(t => t.status === 'completed').length} completed` : ''}</div>}
                        <TaskList tasks={createdTasks} onAction={handleAction} loading={createdLoading} showAssignee emptyLabel="You haven't created any tasks" userId={userId} />
                    </>
                )}

                {tab === 2 && isElevated && !lockoutActive && (
                    <>
                        <div style={{ marginBottom: 12 }}>
                            <input placeholder='Filter by title, assignee, department…' value={allFilter} onChange={e => setAllFilter(e.target.value)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(237,237,237,0.8)', padding: '7px 12px', fontSize: '0.75rem', width: '100%', maxWidth: 380, outline: 'none', boxSizing: 'border-box', borderRadius: 0 }} />
                            {!allLoading && <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.25)', marginTop: 8, fontFamily: 'monospace' }}>{filteredAll.filter(t => t.status !== 'completed').length} pending{showCompleted ? ` · ${filteredAll.filter(t => t.status === 'completed').length} completed` : ''}{allFilter ? ` (filtered from ${allTasks.length})` : ''}</div>}
                        </div>
                        <TaskList tasks={filteredAll} onAction={handleAction} loading={allLoading} showAssignee emptyLabel='No tasks found' userId={userId} />
                    </>
                )}
            </div>

            <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} availableRoles={availableRoles} onCreated={() => { if (tab === 0) loadMine(); else if (tab === 1) loadCreated(); else if (tab === 2) loadAll() }} />
        </div>
    )
}
