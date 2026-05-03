'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import MemberPicker from '@/app/dashboard/_components/meetings/MemberPicker'
import {
    ArrowBack, ThumbUp, ThumbUpOutlined, ThumbDown, ThumbDownOutlined,
    Delete, Send, Edit, Check, Close, History, Restore,
} from '@mui/icons-material'
import { CircularProgress } from '@mui/material'
import {
    STATUS_META, ALL_STATUSES, PRIMARY_STATUS_META, PRIMARY_STATUSES, TAG_META, ALL_TAGS,
    CAT_META, SUBTYPE_LABELS, DEPT_META, SEV_META, FB_TYPE_META, getStatus, getPrimaryStatus,
} from '../_shared/constants'

type MyVote = 'up' | 'down' | null

const TICKET_TASK_ROLE_GROUPS = [
    {
        label: 'Departments',
        roles: [
            'J1-Recruiting', 'J1-Staff',
            'J2-Mission Making', 'J2-Team Lead',
            'J3-Training', 'J3-Team Lead',
            'J4-Administration',
            'J5-Media',
            'J6-Game Master', 'J6-Department Lead',
            'J7 Community Development', 'J7 Staff',
        ],
    },
    {
        label: 'Unit & Staff Roles',
        roles: [
            '0A',
            '1-0',
            '1-1', '1-1 Alpha', '1-1 Bravo', '1-1 Charlie', '1-1-0',
            '1-2', '1-2 Alpha', '1-2 Bravo', '1-2 Charlie', '1-2-0',
            '1-3', '1-3 Echo', '1-3 Golf', '1-3 Hotel', '1-3 Mike', '1-3 Victor', '1-3 Staff', '1-3-0',
            'All Staff', 'HQ Staff',
            'Dedi Admin', 'NCO Assessor', 'Reservist', 'Inactive Reservist',
            'ASOT Member',
        ],
    },
] as const

const taskLbl: React.CSSProperties = {
    display: 'block', fontSize: '0.57rem', fontWeight: 700, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 3,
}

interface CommentItem extends Omit<CommunityTicketComment, '_id' | 'ticketId'> {
    _id: string
    ticketId: string
}

interface DetailData extends Omit<CommunityTicket, '_id'> {
    _id: string
    comments: CommentItem[]
    isJ4: boolean
    isLeadForTicket?: boolean
    myId: string
    myVote: MyVote
}

function avatarUrl(id: string, avatarId?: string) {
    if (avatarId) return `https://cdn.discordapp.com/avatars/${id}/${avatarId}.png?size=40`
    try { return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) % BigInt(6))}.png` }
    catch { return 'https://cdn.discordapp.com/embed/avatars/0.png' }
}
const fmt = (d: string | Date) => new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtFull = (d: string | Date) => new Date(d).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })


export default function TicketDetailPage() {
    const { id } = useParams() as { id: string }
    const router = useRouter()
    const searchParams = useSearchParams()
    const returnTo = searchParams.get('returnTo') ?? '/tickets'

    const [data, setData] = useState<DetailData | null>(null)
    const [loading, setLoading] = useState(true)

    // Ticket votes
    const [voting, setVoting] = useState(false)
    const [myVote, setMyVote] = useState<MyVote>(null)
    const [upvotes, setUpvotes] = useState(0)
    const [downvotes, setDownvotes] = useState(0)
    const [voteScore, setVoteScore] = useState(0)

    // Closed-ticket reopen modal
    const [reopenModal, setReopenModal]           = useState<{ open: boolean; onProceed: () => void }>({ open: false, onProceed: () => {} })

    // Tasks (dept leads / J4)
    const [tasks, setTasks]                       = useState<CommunityTicketTask[]>([])
    const [taskTitle, setTaskTitle]               = useState('')
    const [taskDesc, setTaskDesc]                 = useState('')
    const [taskDue, setTaskDue]                   = useState('')
    const [taskChaseUp, setTaskChaseUp]           = useState('')
    const [taskAssignee, setTaskAssignee]         = useState<{ id: string; name: string } | null>(null)
    const [taskRole, setTaskRole]                 = useState('')
    const [taskFormError, setTaskFormError]       = useState('')
    const [addingTask, setAddingTask]             = useState(false)
    const [showAddTask, setShowAddTask]           = useState(false)
    const [taskUpdating, setTaskUpdating]         = useState<string | null>(null)
    const [tasksCollapsed, setTasksCollapsed]     = useState(false)

    // J4 controls
    const [statusUpdating, setStatusUpdating] = useState(false)
    const [selectedDepts, setSelectedDepts] = useState<string[]>([])
    const [deptUpdating, setDeptUpdating] = useState(false)
    const [selectedTags, setSelectedTags] = useState<string[]>([])

    // Comments
    const [comment, setComment] = useState('')
    const [posting, setPosting] = useState(false)
    const [editingComment, setEditingComment] = useState<string | null>(null)
    const [editContent, setEditContent] = useState('')
    const [savingEdit, setSavingEdit] = useState(false)
    // J4: which deleted comments are currently visible in thread
    const [revealedDeletedIds, setRevealedDeletedIds] = useState<Set<string>>(new Set())
    // J4: inline edit-diffs revealed in thread { commentId: { prevContent, newContent } }
    const [revealedDiffs, setRevealedDiffs] = useState<Record<string, { prevContent: string; newContent: string }>>({})
    // Comment votes: { [commentId]: { myVote, up, down, score } }
    const [commentVotes, setCommentVotes] = useState<Record<string, { myVote: MyVote; up: number; down: number; score: number }>>({})

    const [deleting, setDeleting] = useState(false)
    const [restoring, setRestoring] = useState(false)
    const [avatarErr, setAvatarErr] = useState(false)
    const [logOpen, setLogOpen] = useState(false)
    const [highlightedComment, setHighlightedComment] = useState<string | null>(null)

    const commentRefs = useRef<Record<string, HTMLDivElement | null>>({})

    const load = useCallback(() => {
        setLoading(true)
        fetch(`/api/tickets/${id}`)
            .then(r => r.json())
            .then((d: DetailData) => {
                setData(d)
                const loadedTasks = d.tasks ?? []
                setTasks(loadedTasks)
                if (loadedTasks.length > 3) setTasksCollapsed(true)
                setMyVote(d.myVote)
                setUpvotes(d.upvotes?.length ?? 0)
                setDownvotes(d.downvotes?.length ?? 0)
                setVoteScore(d.voteScore ?? 0)
                setSelectedDepts(d.departments?.length ? d.departments : d.department ? [d.department] : ['j4'])
                setSelectedTags(d.ticketTags ?? [])
                // Init comment votes
                const cv: typeof commentVotes = {}
                for (const c of d.comments) {
                    const up = c.upvotes ?? []
                    const down = c.downvotes ?? []
                    cv[c._id] = {
                        myVote: up.includes(d.myId) ? 'up' : down.includes(d.myId) ? 'down' : null,
                        up: up.length, down: down.length, score: c.voteScore ?? 0,
                    }
                }
                setCommentVotes(cv)
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [id])

    useEffect(() => { load() }, [load])

    async function handleTicketVote(dir: 'up' | 'down') {
        if (voting) return
        setVoting(true)
        const res = await fetch(`/api/tickets/${id}/vote`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction: myVote === dir ? null : dir }),
        })
        const j = await res.json()
        setMyVote(j.myVote); setUpvotes(j.upvotes); setDownvotes(j.downvotes); setVoteScore(j.voteScore)
        setVoting(false)
    }

    async function handleCommentVote(commentId: string, dir: 'up' | 'down') {
        const prev = commentVotes[commentId]
        const res = await fetch(`/api/tickets/${id}/comments/${commentId}/vote`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction: prev?.myVote === dir ? null : dir }),
        })
        const j = await res.json()
        setCommentVotes(cv => ({ ...cv, [commentId]: { myVote: j.myVote, up: j.upvotes, down: j.downvotes, score: j.voteScore } }))
    }

    async function handleStatus(status: string) {
        setStatusUpdating(true)
        await fetch(`/api/tickets/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        })
        setData(d => d ? { ...d, status: status as CommunityTicketStatus } : d)
        setStatusUpdating(false)
    }

    async function handleTags(tags: string[]) {
        setStatusUpdating(true)
        await fetch(`/api/tickets/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketTags: tags }),
        })
        setData(d => d ? { ...d, ticketTags: tags } : d)
        setStatusUpdating(false)
    }

    async function handleDeptsUpdate() {
        setDeptUpdating(true)
        await fetch(`/api/tickets/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ departments: selectedDepts, department: selectedDepts[0] ?? 'j4' }),
        })
        setData(d => d ? { ...d, departments: selectedDepts } : d)
        setDeptUpdating(false)
    }

    async function handleComment(e: React.FormEvent) {
        e.preventDefault()
        if (!comment.trim() || posting) return
        setPosting(true)
        const res = await fetch(`/api/tickets/${id}/comments`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: comment.trim() }),
        })
        const newCmt = await res.json()
        setData(d => d ? { ...d, comments: [...d.comments, newCmt], commentCount: d.commentCount + 1 } : d)
        setCommentVotes(cv => ({ ...cv, [newCmt._id]: { myVote: null, up: 0, down: 0, score: 0 } }))
        setComment('')
        setPosting(false)
    }

    async function saveCommentEdit(commentId: string) {
        if (!editContent.trim() || savingEdit) return
        setSavingEdit(true)
        const res = await fetch(`/api/tickets/${id}/comments/${commentId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: editContent.trim() }),
        })
        const updated = await res.json()
        setData(d => d ? { ...d, comments: d.comments.map(c => c._id === commentId ? { ...c, ...updated } : c) } : d)
        setEditingComment(null)
        setSavingEdit(false)
    }

    async function deleteComment(commentId: string) {
        if (!confirm('Delete this comment?')) return
        await fetch(`/api/tickets/${id}/comments/${commentId}`, { method: 'DELETE' })
        setData(d => d ? {
            ...d,
            comments: d.comments.map(c => c._id === commentId ? { ...c, isDeleted: true } : c),
            commentCount: d.commentCount - 1,
        } : d)
        // Remove from revealed set if present
        setRevealedDeletedIds(s => { const n = new Set(s); n.delete(commentId); return n })
    }

    async function handleDelete() {
        if (!confirm('Delete this ticket? It will be hidden from members but J4 can still view it.')) return
        setDeleting(true)
        await fetch(`/api/tickets/${id}`, { method: 'DELETE' })
        if (data?.isJ4) { setData(d => d ? { ...d, isDeleted: true } : d); setDeleting(false) }
        else router.push('/tickets')
    }

    async function handleRestore() {
        setRestoring(true)
        await fetch(`/api/tickets/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restore: true }),
        })
        setData(d => d ? { ...d, isDeleted: false } : d)
        setRestoring(false)
    }

    function isClosed(d: DetailData) {
        return (d.statuses ?? [d.status]).includes('closed')
    }

    function withReopenCheck(action: () => void) {
        if (!data || !isClosed(data)) { action(); return }
        setReopenModal({ open: true, onProceed: action })
    }

    async function doReopen() {
        await fetch(`/api/tickets/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reopen: true }),
        })
        setData(d => {
            if (!d) return d
            const current = d.statuses ?? [d.status]
            const reopened = current.filter(s => s !== 'closed')
            return { ...d, statuses: reopened.length > 0 ? reopened : ['open'], status: (reopened[0] ?? 'open') as CommunityTicketStatus }
        })
    }

    function resetTaskForm() {
        setTaskTitle(''); setTaskDesc(''); setTaskDue(''); setTaskChaseUp('')
        setTaskAssignee(null); setTaskRole(''); setTaskFormError(''); setShowAddTask(false)
    }

    async function addTask() {
        setTaskFormError('')
        if (!taskTitle.trim()) return setTaskFormError('Title is required.')
        if (!taskDesc.trim()) return setTaskFormError('Description is required.')
        if (!taskDue) return setTaskFormError('Due Date / Time is required.')
        if (!taskAssignee && !taskRole) return setTaskFormError('Assign to at least one member or role.')
        if (addingTask) return
        setAddingTask(true)
        try {
            const res = await fetch(`/api/tickets/${id}/tasks`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: taskTitle.trim(),
                    description: taskDesc.trim(),
                    dueAt: taskDue,
                    ...(taskChaseUp && { chaseUpAt: taskChaseUp }),
                    ...(taskAssignee && { assignedToUserId: taskAssignee.id, assignedToUserName: taskAssignee.name }),
                    ...(taskRole && { assignedToRole: taskRole }),
                }),
            })
            const t = await res.json()
            setTasks(prev => [...prev, t])
            resetTaskForm()
        } finally { setAddingTask(false) }
    }

    async function toggleTask(taskId: string, currentStatus: string) {
        setTaskUpdating(taskId)
        const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
        await fetch(`/api/tickets/${id}/tasks/${taskId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
        })
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as 'pending' | 'completed' } : t))
        setTaskUpdating(null)
    }

    async function deleteTask(taskId: string) {
        if (!confirm('Delete this task?')) return
        await fetch(`/api/tickets/${id}/tasks/${taskId}`, { method: 'DELETE' })
        setTasks(prev => prev.filter(t => t.id !== taskId))
    }

    /** J4: reveal a deleted comment in thread and scroll to it */
    function revealAndScrollToComment(commentId: string) {
        setRevealedDeletedIds(s => new Set([...s, commentId]))
        // Small delay so the element is rendered
        setTimeout(() => {
            const el = commentRefs.current[commentId]
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                setHighlightedComment(commentId)
                setTimeout(() => setHighlightedComment(null), 3500)
            }
        }, 80)
    }

    /** J4: reveal edit diff inline in thread and scroll to comment */
    function revealAndShowDiff(commentId: string, prevContent: string, newContent: string) {
        setRevealedDiffs(d => ({ ...d, [commentId]: { prevContent, newContent } }))
        setTimeout(() => {
            const el = commentRefs.current[commentId]
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                setHighlightedComment(commentId)
                setTimeout(() => setHighlightedComment(null), 3500)
            }
        }, 80)
    }

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <CircularProgress size={24} style={{ color: 'rgba(219,0,29,0.6)' }} />
        </div>
    )

    if (!data || (data as unknown as { error?: string }).error) return (
        <div style={{ color: 'rgba(237,237,237,0.4)', textAlign: 'center', padding: '48px 0', fontSize: '0.85rem' }}>
            Ticket not found.{' '}
            <Link href='/tickets' style={{ color: 'rgba(219,0,29,0.7)', textDecoration: 'none' }}>Go back</Link>
        </div>
    )

    const status = getStatus(data.status)
    const cat = CAT_META[data.category]
    const canDelete = data.isJ4 || data.authorId === data.myId
    const scoreCol = voteScore > 0 ? 'rgba(74,222,128,0.85)' : voteScore < 0 ? 'rgba(219,0,29,0.75)' : 'rgba(237,237,237,0.45)'

    // Comments to render: non-deleted + revealed deleted ones for J4
    const visibleComments = data.comments.filter(c =>
        !c.isDeleted || (data.isJ4 && revealedDeletedIds.has(c._id))
    )

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Reopen confirmation modal */}
            {reopenModal.open && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#111', border: '1px solid rgba(219,0,29,0.35)', borderTop: '2px solid rgba(219,0,29,0.7)', padding: '24px 28px', maxWidth: 440, width: '90%' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)', marginBottom: 10 }}>This ticket is closed</div>
                        <div style={{ fontSize: '0.73rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.5, marginBottom: 20 }}>
                            Performing this action will reopen the ticket. Department leads and J4 will be notified. Do you want to continue?
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setReopenModal(m => ({ ...m, open: false }))} style={{ padding: '7px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.5)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em' }}>CANCEL</button>
                            <button onClick={() => { setReopenModal(m => ({ ...m, open: false })); doReopen().then(() => reopenModal.onProceed()) }} style={{ padding: '7px 18px', background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.45)', color: 'rgba(219,0,29,0.9)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em' }}>REOPEN &amp; CONTINUE</button>
                        </div>
                    </div>
                </div>
            )}

            <button onClick={() => router.push(returnTo as any)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', padding: 0 }}>
                <ArrowBack style={{ fontSize: 14 }} /> BACK TO TICKETS
            </button>

            {data.isDeleted && (
                <div style={{ background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.25)', borderLeft: '3px solid rgba(219,0,29,0.6)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(219,0,29,0.8)', fontWeight: 700, letterSpacing: '0.1em' }}>DELETED — visible to J4 only</span>
                    {data.isJ4 && (
                        <button onClick={handleRestore} disabled={restoring} style={{ marginLeft: 'auto', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', color: 'rgba(74,222,128,0.85)', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', padding: '4px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Restore style={{ fontSize: 13 }} /> {restoring ? 'RESTORING…' : 'RESTORE'}
                        </button>
                    )}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, alignItems: 'start' }}>

                {/* ── MAIN ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

                    <div style={{ background: status.bg, border: `1px solid ${cat?.borderColor ?? 'rgba(255,255,255,0.08)'}`, borderLeft: `3px solid ${cat?.color ?? status.border}` }}>

                        {/* Top bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', padding: '2px 7px', color: cat?.color ?? status.color, border: `1px solid ${cat?.borderColor ?? status.border}55`, background: `${cat?.color ?? status.color}0d` }}>
                                {SUBTYPE_LABELS[data.subtype] ?? data.subtype}
                            </span>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', padding: '2px 7px', color: status.color, border: `1px solid ${status.border}55`, background: status.bg }}>
                                {status.label.toUpperCase()}
                            </span>
                            {data.visibility === 'private' && (
                                <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', padding: '2px 7px', color: 'rgba(255,80,80,0.7)', border: '1px solid rgba(255,80,80,0.2)' }}>PRIVATE</span>
                            )}
                            {data.severity && (
                                <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', padding: '2px 7px', color: SEV_META[data.severity]?.color, border: `1px solid ${SEV_META[data.severity]?.color}44` }}>
                                    {data.severity.toUpperCase()}
                                </span>
                            )}
                            <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '0.6rem', color: 'rgba(237,237,237,0.2)' }}>{fmt(data.createdAt)}</span>
                            {canDelete && !data.isDeleted && (
                                <button onClick={handleDelete} disabled={deleting} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(219,0,29,0.35)', display: 'flex', padding: 0 }}>
                                    {deleting ? <CircularProgress size={12} style={{ color: 'rgba(219,0,29,0.5)' }} /> : <Delete style={{ fontSize: 15 }} />}
                                </button>
                            )}
                        </div>

                        {/* Title + author */}
                        <div style={{ padding: '16px 18px 12px' }}>
                            <h1 style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--foreground)', margin: 0, lineHeight: 1.3 }}>{data.title}</h1>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                                {data.isAnonymous ? (
                                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'rgba(237,237,237,0.4)', fontWeight: 700 }}>?</div>
                                ) : !avatarErr ? (
                                    <img src={avatarUrl(data.authorId, data.authorAvatarId)} alt={data.authorName} onError={() => setAvatarErr(true)} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }} />
                                ) : (
                                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'rgba(237,237,237,0.6)', fontWeight: 700 }}>{data.authorName.charAt(0).toUpperCase()}</div>
                                )}
                                <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)' }}>{data.isAnonymous ? 'Anonymous' : data.authorName}</span>
                                {String(data.updatedAt) !== String(data.createdAt) && (
                                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)', fontFamily: 'monospace' }}>· edited {fmt(data.updatedAt)}</span>
                                )}
                            </div>
                        </div>

                        <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 18px' }} />

                        <div style={{ padding: '16px 18px' }}>
                            <pre style={{ fontFamily: 'inherit', fontSize: '0.875rem', color: 'rgba(237,237,237,0.8)', whiteSpace: 'pre-wrap', lineHeight: 1.75, margin: 0 }}>{data.description}</pre>
                        </div>

                        <ExtendedFields data={data} />

                        {/* Attachments */}
                        {data.attachments?.length > 0 && (
                            <div style={{ padding: '0 18px 16px' }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.25)', marginBottom: 8 }}>ATTACHMENTS [{data.attachments.length}]</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {data.attachments.map(f => (
                                        <a key={f} href={`/api/tickets/${data._id}/uploads?file=${encodeURIComponent(f)}`} target='_blank' rel='noopener noreferrer'>
                                            <img src={`/api/tickets/${data._id}/uploads?file=${encodeURIComponent(f)}`} alt={f} style={{ height: 80, border: '1px solid rgba(255,255,255,0.07)', objectFit: 'cover' }} />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {data.mediaLinks && data.mediaLinks.length > 0 && (
                            <div style={{ padding: '0 18px 16px' }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.25)', marginBottom: 6 }}>MEDIA LINKS</div>
                                {data.mediaLinks.map((l, i) => (
                                    <a key={i} href={l} target='_blank' rel='noopener noreferrer' style={{ display: 'block', fontSize: '0.72rem', color: 'rgba(0,195,255,0.8)', marginBottom: 3, wordBreak: 'break-all' }}>{l}</a>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── TASKS (dept leads / J4) ── */}
                    {(data.isJ4 || data.isLeadForTicket || tasks.length > 0) && (() => {
                        const canManageTasks = !!(data.isJ4 || data.isLeadForTicket)
                        const ticketDept = data.department as string
                        const pending   = tasks.filter(t => t.status !== 'completed')
                        const completed = tasks.filter(t => t.status === 'completed')
                        return (
                            <div style={{ marginTop: 20, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
                                {/* Header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: tasksCollapsed ? 'none' : '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }} onClick={() => setTasksCollapsed(v => !v)}>
                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.35)', userSelect: 'none' }}>TASKS</span>
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.62rem', color: 'rgba(237,237,237,0.2)' }}>[{String(tasks.length).padStart(2, '0')}]</span>
                                    {pending.length > 0 && <span style={{ fontSize: '0.58rem', color: 'rgba(255,160,0,0.65)', fontFamily: 'monospace' }}>{pending.length} pending</span>}
                                    <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)', userSelect: 'none' }}>{tasksCollapsed ? '▼' : '▲'}</span>
                                </div>

                                {!tasksCollapsed && (
                                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>

                                        {/* Task list */}
                                        {tasks.length === 0 && !showAddTask && (
                                            <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No tasks</span>
                                        )}
                                        {pending.map(t => (
                                            <TaskItem key={t.id} t={t} canManage={canManageTasks} updating={taskUpdating === t.id}
                                                onToggle={() => toggleTask(t.id, t.status)}
                                                onDelete={() => deleteTask(t.id)} />
                                        ))}
                                        {completed.length > 0 && (
                                            <details style={{ marginTop: 4 }}>
                                                <summary style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.25)', cursor: 'pointer', userSelect: 'none', padding: '4px 0' }}>
                                                    COMPLETED ({completed.length})
                                                </summary>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, opacity: 0.65 }}>
                                                    {completed.map(t => (
                                                        <TaskItem key={t.id} t={t} canManage={canManageTasks} updating={taskUpdating === t.id}
                                                            onToggle={() => toggleTask(t.id, t.status)}
                                                            onDelete={() => deleteTask(t.id)} />
                                                    ))}
                                                </div>
                                            </details>
                                        )}

                                        {/* Add task form */}
                                        {canManageTasks && showAddTask && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', border: '1px solid rgba(219,0,29,0.25)', background: 'rgba(219,0,29,0.03)', marginTop: 8 }}>
                                                <div>
                                                    <label style={taskLbl}>Task Title <span style={{ color: 'rgba(219,0,29,1)' }}>*</span></label>
                                                    <input autoFocus value={taskTitle} onChange={e => setTaskTitle(e.target.value)} onKeyDown={e => e.key === 'Escape' && resetTaskForm()} placeholder='What needs to be done?' style={{ all: 'unset', display: 'block', width: '100%', fontSize: '0.75rem', color: 'var(--foreground)', background: 'rgba(255,255,255,0.04)', padding: '5px 8px', border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box' }} />
                                                </div>
                                                <div>
                                                    <label style={taskLbl}>Description <span style={{ color: 'rgba(219,0,29,1)' }}>*</span></label>
                                                    <textarea value={taskDesc} onChange={e => setTaskDesc(e.target.value)} placeholder='Additional detail…' rows={2} style={{ all: 'unset', display: 'block', width: '100%', fontSize: '0.75rem', color: 'rgba(237,237,237,0.8)', background: 'rgba(255,255,255,0.04)', padding: '5px 8px', border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box', resize: 'vertical' as const, lineHeight: 1.5, fontFamily: 'inherit' }} />
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                    <div>
                                                        <label style={taskLbl}>Assign to Member <span style={{ color: 'rgba(219,0,29,1)' }}>*</span></label>
                                                        <MemberPicker
                                                            value={taskAssignee}
                                                            onChange={setTaskAssignee}
                                                            allMembers={true}
                                                            placeholder='Search all members…'
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={taskLbl}>Assign to Role <span style={{ color: 'rgba(219,0,29,1)' }}>*</span></label>
                                                        <select value={taskRole} onChange={e => setTaskRole(e.target.value)} style={{ display: 'block', width: '100%', fontSize: '0.75rem', color: 'rgba(237,237,237,0.88)', background: '#111', padding: '5px 8px', border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box', cursor: 'pointer', outline: 'none', borderRadius: 0, fontFamily: 'inherit', colorScheme: 'dark' } as React.CSSProperties}>
                                                            <option value='' style={{ background: '#111', color: 'rgba(237,237,237,0.55)' }}>— No Role —</option>
                                                            {TICKET_TASK_ROLE_GROUPS.map(g => (
                                                                <optgroup key={g.label} label={g.label} style={{ background: '#0d0d0d', color: 'rgba(237,237,237,0.4)' } as React.CSSProperties}>
                                                                    {g.roles.map(r => <option key={r} value={r} style={{ background: '#111', color: 'rgba(237,237,237,0.88)' }}>{r}</option>)}
                                                                </optgroup>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div style={{ gridColumn: '1 / -1', marginTop: -4 }}>
                                                        <span style={{ fontSize: '0.56rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>* At least one assignee (member or role) is required</span>
                                                    </div>
                                                    <div>
                                                        <label style={taskLbl}>Due Date / Time <span style={{ color: 'rgba(219,0,29,1)' }}>*</span></label>
                                                        <input type='datetime-local' value={taskDue} onChange={e => setTaskDue(e.target.value)} style={{ all: 'unset', display: 'block', width: '100%', fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)', background: 'rgba(255,255,255,0.04)', padding: '5px 8px', border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box', cursor: 'pointer', colorScheme: 'dark' } as React.CSSProperties} />
                                                    </div>
                                                    <div>
                                                        <label style={taskLbl}>Reminder / Chase-up Date / Time</label>
                                                        <input type='datetime-local' value={taskChaseUp} onChange={e => setTaskChaseUp(e.target.value)} style={{ all: 'unset', display: 'block', width: '100%', fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)', background: 'rgba(255,255,255,0.04)', padding: '5px 8px', border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box', cursor: 'pointer', colorScheme: 'dark' } as React.CSSProperties} />
                                                    </div>
                                                </div>
                                                {taskFormError && (
                                                    <div style={{ fontSize: '0.68rem', color: 'rgba(219,0,29,0.85)', padding: '2px 0' }}>{taskFormError}</div>
                                                )}
                                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
                                                    <button onClick={resetTaskForm} style={{ all: 'unset', cursor: 'pointer', padding: '5px 12px', fontSize: '0.65rem', fontWeight: 700, color: 'rgba(237,237,237,0.35)', border: '1px solid rgba(255,255,255,0.1)' }}>Cancel</button>
                                                    <button onClick={addTask} disabled={addingTask} style={{ all: 'unset', cursor: addingTask ? 'not-allowed' : 'pointer', padding: '5px 14px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', background: 'rgba(219,0,29,0.18)', border: '1px solid rgba(219,0,29,0.45)', color: 'rgba(219,0,29,0.9)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                                        {addingTask ? <CircularProgress size={10} color='inherit' /> : 'Add Task'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {canManageTasks && !showAddTask && (
                                            <button onClick={() => withReopenCheck(() => setShowAddTask(true))} style={{ all: 'unset', cursor: 'pointer', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', color: 'rgba(219,0,29,0.55)', letterSpacing: '0.06em' }}>
                                                + Add task
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })()}

                    {/* ── COMMENTS ── */}
                    <div style={{ marginTop: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.35)' }}>COMMENTS</span>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)' }}>
                                [{String(data.comments.filter(c => !c.isDeleted).length).padStart(2, '0')}]
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {visibleComments.map((c, i) => {
                                const cv = commentVotes[c._id] ?? { myVote: null, up: 0, down: 0, score: 0 }
                                const isHighlighted = highlightedComment === c._id
                                const isDeleted = c.isDeleted
                                // J4 only: is this deleted comment currently revealed in the thread?
                                const isRevealed = isDeleted && data.isJ4 && revealedDeletedIds.has(c._id)
                                // J4 only: is there a diff to show inline for this comment?
                                const inlineDiff = data.isJ4 ? revealedDiffs[c._id] : undefined

                                return (
                                    <div
                                        key={c._id}
                                        ref={el => { commentRefs.current[c._id] = el }}
                                        style={{
                                            background: isHighlighted ? 'rgba(255,200,0,0.06)' : isDeleted ? 'rgba(219,0,29,0.04)' : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                            border: `1px solid ${isHighlighted ? 'rgba(255,200,0,0.3)' : isDeleted ? 'rgba(219,0,29,0.25)' : 'rgba(255,255,255,0.05)'}`,
                                            borderLeft: isHighlighted ? '2px solid rgba(255,200,0,0.7)' : isDeleted ? '2px solid rgba(219,0,29,0.5)' : '2px solid rgba(255,255,255,0.1)',
                                            opacity: isDeleted && !isRevealed ? 0.6 : 1,
                                            transition: 'background 0.4s, border-color 0.4s',
                                        }}
                                    >
                                        {/* Header */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: isDeleted ? 'rgba(219,0,29,0.06)' : 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            {isDeleted && (
                                                <span style={{ fontSize: '0.54rem', fontWeight: 800, letterSpacing: '0.1em', padding: '1px 5px', color: 'rgba(219,0,29,0.7)', border: '1px solid rgba(219,0,29,0.3)', flexShrink: 0 }}>DELETED</span>
                                            )}
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', color: isDeleted ? (isRevealed ? 'rgba(237,237,237,0.55)' : 'rgba(219,0,29,0.45)') : 'rgba(237,237,237,0.7)' }}>
                                                {isRevealed ? c.authorName : isDeleted ? '[redacted]' : c.authorName}
                                            </span>
                                            {c.isEdited && !isDeleted && <span style={{ fontSize: '0.56rem', color: 'rgba(237,237,237,0.2)' }}>· edited</span>}
                                            <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '0.6rem', color: 'rgba(237,237,237,0.2)' }}>{fmtFull(c.createdAt)}</span>

                                            {/* Comment votes (non-deleted) */}
                                            {!isDeleted && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    <CvBtn dir='up' active={cv.myVote === 'up'} onClick={() => handleCommentVote(c._id, 'up')} />
                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.62rem', fontWeight: 700, minWidth: 18, textAlign: 'center', color: cv.score > 0 ? 'rgba(74,222,128,0.7)' : cv.score < 0 ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.3)' }}>
                                                        {cv.score > 0 ? '+' : ''}{cv.score}
                                                    </span>
                                                    <CvBtn dir='down' active={cv.myVote === 'down'} onClick={() => handleCommentVote(c._id, 'down')} />
                                                </div>
                                            )}

                                            {/* Edit/Delete (own comment) */}
                                            {!isDeleted && (c.authorId === data.myId || data.isJ4) && editingComment !== c._id && (
                                                <div style={{ display: 'flex', gap: 3 }}>
                                                    {c.authorId === data.myId && (
                                                        <IBtn onClick={() => { setEditingComment(c._id); setEditContent(c.content) }} color='rgba(237,237,237,0.25)' hover='rgba(237,237,237,0.7)'><Edit style={{ fontSize: 12 }} /></IBtn>
                                                    )}
                                                    <IBtn onClick={() => deleteComment(c._id)} color='rgba(219,0,29,0.3)' hover='rgba(219,0,29,0.75)'><Delete style={{ fontSize: 12 }} /></IBtn>
                                                </div>
                                            )}
                                        </div>

                                        {/* Body */}
                                        <div style={{ padding: '10px 14px' }}>
                                            {isDeleted ? (
                                                isRevealed ? (
                                                    // J4: full deleted content with ghost styling
                                                    <div>
                                                        <div style={{ fontSize: '0.54rem', fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(219,0,29,0.5)', marginBottom: 6 }}>DELETED CONTENT — VISIBLE TO J4 ONLY</div>
                                                        <pre style={{ fontFamily: 'inherit', fontSize: '0.82rem', color: 'rgba(219,0,29,0.55)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.65, borderLeft: '2px solid rgba(219,0,29,0.25)', paddingLeft: 10 }}>{c.content}</pre>
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '0.78rem', color: 'rgba(219,0,29,0.35)', fontStyle: 'italic' }}>
                                                        [Comment deleted]
                                                    </span>
                                                )
                                            ) : editingComment === c._id ? (
                                                <div>
                                                    <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3} style={{ width: '100%', padding: '8px 10px', resize: 'vertical', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.85)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', borderRadius: 0, fontFamily: 'inherit' }} />
                                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                                        <button onClick={() => saveCommentEdit(c._id)} disabled={savingEdit} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', color: 'rgba(74,222,128,0.85)', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', padding: '5px 12px', cursor: 'pointer' }}>
                                                            {savingEdit ? <CircularProgress size={10} style={{ color: 'rgba(74,222,128,0.6)' }} /> : <Check style={{ fontSize: 12 }} />} SAVE
                                                        </button>
                                                        <button onClick={() => setEditingComment(null)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', padding: '5px 12px', cursor: 'pointer' }}>
                                                            <Close style={{ fontSize: 12 }} /> CANCEL
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <pre style={{ fontFamily: 'inherit', fontSize: '0.85rem', color: 'rgba(237,237,237,0.72)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.65 }}>{c.content}</pre>
                                                    {/* J4: inline edit diff when revealed from activity log */}
                                                    {inlineDiff && (
                                                        <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,160,0,0.15)', paddingTop: 10 }}>
                                                            <div style={{ fontSize: '0.54rem', fontWeight: 800, letterSpacing: '0.12em', color: 'rgba(255,160,0,0.55)', marginBottom: 8 }}>EDIT HISTORY — J4 ONLY</div>
                                                            <div style={{ fontSize: '0.54rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(219,0,29,0.55)', marginBottom: 3 }}>PREVIOUS VERSION</div>
                                                            <pre style={{ fontFamily: 'inherit', fontSize: '0.78rem', color: 'rgba(237,237,237,0.45)', background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.18)', padding: '6px 10px', whiteSpace: 'pre-wrap', margin: '0 0 8px', lineHeight: 1.6 }}>{inlineDiff.prevContent}</pre>
                                                            <div style={{ fontSize: '0.54rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(74,222,128,0.55)', marginBottom: 3 }}>CURRENT VERSION</div>
                                                            <pre style={{ fontFamily: 'inherit', fontSize: '0.78rem', color: 'rgba(237,237,237,0.72)', background: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.18)', padding: '6px 10px', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>{inlineDiff.newContent}</pre>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {data.comments.filter(c => !c.isDeleted).length === 0 && visibleComments.length === 0 && (
                            <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic', padding: '12px 0' }}>No comments yet.</div>
                        )}

                        {/* New comment */}
                        <form onSubmit={handleComment} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 0 }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.3)', marginBottom: 8 }}>ADD COMMENT</div>
                            <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder='Write your comment…' rows={4} style={{ width: '100%', padding: '10px 12px', resize: 'vertical', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.88)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', borderRadius: 0, fontFamily: 'inherit', lineHeight: 1.65 }} />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 14px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid rgba(219,0,29,0.35)' }}>
                                <button type='submit' disabled={posting || !comment.trim()} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 22px', background: posting || !comment.trim() ? 'rgba(219,0,29,0.05)' : 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(219,0,29,0.9)', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', cursor: posting || !comment.trim() ? 'not-allowed' : 'pointer', opacity: posting || !comment.trim() ? 0.5 : 1, borderRadius: 0 }}>
                                    {posting ? <CircularProgress size={11} style={{ color: 'rgba(219,0,29,0.7)' }} /> : <Send style={{ fontSize: 13 }} />} POST COMMENT
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* ── SIDEBAR ── */}
                <aside style={{ display: 'flex', flexDirection: 'column', gap: 1, position: 'sticky', top: 24 }}>

                    <div style={{ background: 'rgba(219,0,29,0.07)', border: '1px solid rgba(219,0,29,0.2)', padding: '12px 14px', marginBottom: 8 }}>
                        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.55)', marginBottom: 3 }}>ASOT // PORTAL</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.1em' }}>TICKET DETAIL</div>
                    </div>

                    {/* Ticket votes */}
                    <SideSection label='VOTES'>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <VoteBtn dir='up' active={myVote === 'up'} count={upvotes} voting={voting} onClick={() => handleTicketVote('up')} />
                            <VoteBtn dir='down' active={myVote === 'down'} count={downvotes} voting={voting} onClick={() => handleTicketVote('down')} />
                        </div>
                        <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.25)' }}>SCORE </span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'monospace', color: scoreCol }}>{voteScore > 0 ? '+' : ''}{voteScore}</span>
                        </div>
                    </SideSection>

                    {/* Main Status (J4 or dept lead) */}
                    {(data.isJ4 || data.isLeadForTicket) && (
                        <SideSection label='STATUS' loading={statusUpdating}>
                            <select value={getPrimaryStatus(data)} onChange={e => handleStatus(e.target.value)} disabled={statusUpdating} style={{ width: '100%', background: status.bg, border: `1px solid ${status.border}55`, borderLeft: `3px solid ${status.color}`, color: status.color, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', padding: '8px 10px', cursor: 'pointer', outline: 'none', borderRadius: 0, fontFamily: 'inherit', appearance: 'none' }}>
                                {PRIMARY_STATUSES.map(s => <option key={s} value={s} style={{ background: '#0a0a0a', color: PRIMARY_STATUS_META[s].color }}>{PRIMARY_STATUS_META[s].label}</option>)}
                            </select>
                        </SideSection>
                    )}

                    {/* Tags / Sub-status (J4 or dept lead) */}
                    {(data.isJ4 || data.isLeadForTicket) && (
                        <SideSection label='TAGS' loading={statusUpdating}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {ALL_TAGS.filter(t => t !== 'in_review').map(tag => {
                                    const tagMeta = TAG_META[tag]
                                    const active = selectedTags.includes(tag)
                                    return (
                                        <button key={tag} type='button'
                                            onClick={() => {
                                                const newTags = active ? selectedTags.filter(t => t !== tag) : [...selectedTags, tag]
                                                setSelectedTags(newTags)
                                                handleTags(newTags)
                                            }}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: active ? `${tagMeta.color}14` : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? tagMeta.color + '55' : 'rgba(255,255,255,0.06)'}`, color: active ? tagMeta.color : 'rgba(237,237,237,0.4)', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.04em', textAlign: 'left', width: '100%' }}>
                                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: tagMeta.color, flexShrink: 0, opacity: active ? 1 : 0.3 }} />
                                            {tagMeta.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </SideSection>
                    )}

                    {/* Departments (J4 multi-select) */}
                    {data.isJ4 && (
                        <SideSection label='DEPARTMENTS' loading={deptUpdating}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                                {Object.entries(DEPT_META).map(([k, v]) => {
                                    const active = selectedDepts.includes(k)
                                    return (
                                        <button key={k} type='button' onClick={() => setSelectedDepts(p => active ? p.filter(d => d !== k) : [...p, k])} style={{ padding: '3px 8px', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', background: active ? 'rgba(219,0,29,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.08)'}`, color: active ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.35)', cursor: 'pointer' }}>
                                            {v.short}
                                        </button>
                                    )
                                })}
                            </div>
                            <button onClick={handleDeptsUpdate} disabled={deptUpdating} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', padding: '5px', cursor: 'pointer' }}>
                                {deptUpdating ? 'SAVING…' : 'SAVE DEPARTMENTS'}
                            </button>
                        </SideSection>
                    )}

                    {/* Metadata */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {[
                            ['AUTHOR',    data.isAnonymous ? 'Anonymous' : data.authorName],
                            ['SUBMITTED', fmt(data.createdAt)],
                            ['DEPT',      (data.departments?.length ? data.departments : [data.department]).map(d => DEPT_META[d]?.short ?? d).join(', ')],
                            ['COMMENTS',  String(data.comments.filter(c => !c.isDeleted).length).padStart(2, '0')],
                        ].map(([label, value]) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.25)' }}>{label}</span>
                                <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.58)', fontFamily: ['SUBMITTED','COMMENTS'].includes(label) ? 'monospace' : 'inherit', maxWidth: 160, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                            </div>
                        ))}
                    </div>

                    {/* Activity Log (J4) */}
                    {data.isJ4 && data.activityLog && data.activityLog.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                            <button onClick={() => setLogOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'transparent', border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '9px 2px', cursor: 'pointer', color: 'rgba(237,237,237,0.3)', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.14em' }}>
                                <History style={{ fontSize: 13 }} /> ACTIVITY LOG
                                <span style={{ fontFamily: 'monospace', color: 'rgba(237,237,237,0.2)' }}>[{String(data.activityLog.length).padStart(2, '0')}]</span>
                            </button>
                            {logOpen && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingTop: 6, maxHeight: 340, overflowY: 'auto' }}>
                                    {[...data.activityLog].reverse().map((entry, i) => (
                                        <ActivityEntry
                                            key={i}
                                            entry={entry}
                                            onRevealDeleted={entry.commentId && entry.action === 'comment_deleted'
                                                ? () => revealAndScrollToComment(entry.commentId!)
                                                : undefined}
                                            onRevealEditDiff={entry.commentId && entry.action === 'comment_edited' && entry.prevContent
                                                ? () => revealAndShowDiff(entry.commentId!, entry.prevContent!, entry.newValue ?? '')
                                                : undefined}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </aside>
            </div>
        </div>
    )
}


function SideSection({ label, children, loading }: { label: string; children: React.ReactNode; loading?: boolean }) {
    return (
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12, marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.25)', marginBottom: 8, paddingLeft: 2 }}>
                {label}
                {loading && <CircularProgress size={10} style={{ color: 'rgba(237,237,237,0.3)' }} />}
            </div>
            {children}
        </div>
    )
}

function VoteBtn({ dir, active, count, voting, onClick }: { dir: 'up' | 'down'; active: boolean; count: number; voting: boolean; onClick: () => void }) {
    const isUp = dir === 'up'
    const col = isUp ? 'rgba(74,222,128,0.9)' : 'rgba(219,0,29,0.85)'
    const bg = isUp ? 'rgba(74,222,128,0.08)' : 'rgba(219,0,29,0.08)'
    const border = isUp ? 'rgba(74,222,128,0.4)' : 'rgba(219,0,29,0.4)'
    return (
        <button onClick={onClick} disabled={voting} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', cursor: voting ? 'not-allowed' : 'pointer', background: active ? bg : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? border : 'rgba(255,255,255,0.08)'}`, color: active ? col : 'rgba(237,237,237,0.4)', fontSize: '0.78rem', fontWeight: 700, transition: 'all 0.1s' }}>
            {isUp ? (active ? <ThumbUp style={{ fontSize: 14 }} /> : <ThumbUpOutlined style={{ fontSize: 14 }} />) : (active ? <ThumbDown style={{ fontSize: 14 }} /> : <ThumbDownOutlined style={{ fontSize: 14 }} />)}
            <span style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{count}</span>
        </button>
    )
}

function CvBtn({ dir, active, onClick }: { dir: 'up' | 'down'; active: boolean; onClick: () => void }) {
    const col = dir === 'up' ? 'rgba(74,222,128,0.8)' : 'rgba(219,0,29,0.7)'
    return (
        <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', color: active ? col : 'rgba(237,237,237,0.2)', display: 'flex', padding: '1px 2px', transition: 'color 0.1s' }}
            onMouseEnter={e => (e.currentTarget.style.color = col)}
            onMouseLeave={e => (e.currentTarget.style.color = active ? col : 'rgba(237,237,237,0.2)')}
        >
            {dir === 'up' ? (active ? <ThumbUp style={{ fontSize: 12 }} /> : <ThumbUpOutlined style={{ fontSize: 12 }} />) : (active ? <ThumbDown style={{ fontSize: 12 }} /> : <ThumbDownOutlined style={{ fontSize: 12 }} />)}
        </button>
    )
}

function IBtn({ onClick, color, hover, children }: { onClick: () => void; color: string; hover: string; children: React.ReactNode }) {
    return (
        <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', color, display: 'flex', padding: 0, transition: 'color 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.color = hover }}
            onMouseLeave={e => { e.currentTarget.style.color = color }}>
            {children}
        </button>
    )
}

function ActivityEntry({ entry, onRevealDeleted, onRevealEditDiff }: {
    entry: CommunityTicketActivity
    onRevealDeleted?: () => void
    onRevealEditDiff?: () => void
}) {
    const [panelDiffOpen, setPanelDiffOpen] = useState(false)

    return (
        <div style={{ padding: '7px 4px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.55)', fontWeight: 600 }}>{entry.actorName}</div>
                    <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.32)', fontFamily: 'monospace', marginTop: 1 }}>
                        {entry.action.replace(/_/g, ' ')}
                    </div>
                    {entry.action === 'status_changed' && entry.oldValue && entry.newValue && (
                        <div style={{ fontSize: '0.56rem', fontFamily: 'monospace', marginTop: 2 }}>
                            <span style={{ color: 'rgba(219,0,29,0.6)' }}>{entry.oldValue.replace(/_/g,' ')}</span>
                            {' → '}
                            <span style={{ color: 'rgba(74,222,128,0.65)' }}>{entry.newValue.replace(/_/g,' ')}</span>
                        </div>
                    )}

                    {/* Deleted comment actions */}
                    {entry.action === 'comment_deleted' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                            {onRevealDeleted && (
                                <button onClick={onRevealDeleted} style={{ fontSize: '0.58rem', color: 'rgba(219,0,29,0.65)', background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.2)', cursor: 'pointer', padding: '1px 6px' }}>
                                    reveal in thread ↓
                                </button>
                            )}
                            {entry.prevContent && (
                                <button onClick={() => setPanelDiffOpen(v => !v)} style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                                    {panelDiffOpen ? 'hide content' : 'view content'}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Edited comment actions */}
                    {entry.action === 'comment_edited' && entry.prevContent && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                            {onRevealEditDiff && (
                                <button onClick={onRevealEditDiff} style={{ fontSize: '0.58rem', color: 'rgba(255,160,0,0.7)', background: 'rgba(255,160,0,0.06)', border: '1px solid rgba(255,160,0,0.2)', cursor: 'pointer', padding: '1px 6px' }}>
                                    show diff in thread ↓
                                </button>
                            )}
                            <button onClick={() => setPanelDiffOpen(v => !v)} style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                                {panelDiffOpen ? 'hide diff' : 'panel diff'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Panel: deleted content or edit diff */}
            {panelDiffOpen && entry.action === 'comment_deleted' && entry.prevContent && (
                <pre style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.45)', background: 'rgba(219,0,29,0.06)', padding: '5px 7px', margin: '5px 0 0', whiteSpace: 'pre-wrap', fontFamily: 'inherit', border: '1px solid rgba(219,0,29,0.15)' }}>
                    {entry.prevContent}
                </pre>
            )}
            {panelDiffOpen && entry.action === 'comment_edited' && entry.prevContent && entry.newValue && (
                <div style={{ marginTop: 5 }}>
                    <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(219,0,29,0.5)', marginBottom: 2 }}>BEFORE</div>
                    <pre style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.5)', background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.15)', padding: '4px 6px', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '0 0 5px' }}>{entry.prevContent}</pre>
                    <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(74,222,128,0.5)', marginBottom: 2 }}>AFTER</div>
                    <pre style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.5)', background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)', padding: '4px 6px', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{entry.newValue}</pre>
                </div>
            )}

            <div style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.18)', fontFamily: 'monospace', marginTop: 4 }}>{new Date(entry.timestamp).toLocaleString('en-AU')}</div>
        </div>
    )
}


function TaskItem({ t, canManage, updating, onToggle, onDelete }: {
    t: CommunityTicketTask; canManage: boolean; updating: boolean
    onToggle: () => void; onDelete: () => void
}) {
    const done = t.status === 'completed'
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <button onClick={onToggle} disabled={updating || !canManage} style={{ all: 'unset', cursor: canManage && !updating ? 'pointer' : 'default', width: 15, height: 15, border: `1px solid ${done ? 'rgba(74,222,128,0.6)' : 'rgba(255,255,255,0.2)'}`, background: done ? 'rgba(74,222,128,0.18)' : 'transparent', borderRadius: 2, flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'rgba(74,222,128,0.9)' }}>
                {updating ? <CircularProgress size={9} color='inherit' /> : done ? '✓' : ''}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: done ? 'rgba(237,237,237,0.35)' : 'rgba(237,237,237,0.85)', textDecoration: done ? 'line-through' : 'none' }}>{t.title}</div>
                {t.description && <div style={{ fontSize: '0.67rem', color: 'rgba(237,237,237,0.4)', marginTop: 1 }}>{t.description}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                    {t.assignedToUserName && <span style={{ fontSize: '0.57rem', color: 'rgba(219,0,29,0.6)', fontFamily: 'monospace' }}>→ {t.assignedToUserName}</span>}
                    {t.assignedToRole && <span style={{ fontSize: '0.57rem', color: 'rgba(167,139,250,0.6)', fontFamily: 'monospace' }}>role: {t.assignedToRole}</span>}
                    {t.dueAt && <span style={{ fontSize: '0.57rem', color: 'rgba(255,160,0,0.55)', fontFamily: 'monospace' }}>due: {new Date(t.dueAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                    {t.chaseUpAt && <span style={{ fontSize: '0.57rem', color: 'rgba(0,195,255,0.45)', fontFamily: 'monospace' }}>chase-up: {new Date(t.chaseUpAt).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                    {done && t.completedByName && <span style={{ fontSize: '0.57rem', color: 'rgba(74,222,128,0.5)' }}>✓ {t.completedByName}</span>}
                </div>
            </div>
            {canManage && (
                <button onClick={onDelete} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: 'rgba(219,0,29,0.35)', padding: '2px 4px', flexShrink: 0 }}>✕</button>
            )}
        </div>
    )
}


function ExtendedFields({ data }: { data: DetailData }) {
    const fields: [string, React.ReactNode][] = []
    const s = data.subtype
    const isMod     = s === 'mod-request'
    const isFeature = s === 'feature-request'
    const isRequest = isMod || isFeature
    const isBug     = s.startsWith('bug-')
    const isMission = s === 'mission' || s === 'campaign'
    const isFeedback  = s === 'unit-feedback'
    const isComplaint = s.startsWith('complaint-')
    const isAward     = s.startsWith('award-')

    // Mod request fields
    if (isMod && data.modLink) fields.push(['MOD LINK', <a key='modLink' href={data.modLink} target='_blank' rel='noopener noreferrer' style={{ color: 'rgba(0,195,255,0.8)', fontSize: '0.82rem', wordBreak: 'break-all' }}>{data.modLink}</a>])
    if (isMod && data.game) fields.push(['GAME', `${data.game}${data.gameOther ? ` — ${data.gameOther}` : ''}`])

    // Feature request fields
    if (isFeature && data.featureCategory) fields.push(['PLATFORM / CATEGORY', `${data.featureCategory}${data.featureCategoryOther ? ` — ${data.featureCategoryOther}` : ''}`])
    if (isFeature && data.responsibleDept) fields.push(['ROUTED TO', data.responsibleDept.toUpperCase()])
    if (isRequest && data.weblink) fields.push(['REFERENCE URL', <a key='url' href={data.weblink} target='_blank' rel='noopener noreferrer' style={{ color: 'rgba(0,195,255,0.8)', wordBreak: 'break-all' }}>{data.weblink}</a>])
    if (isRequest && data.justification) fields.push(['JUSTIFICATION', data.justification])

    // Bug fields
    if (isBug && data.bugUrl) fields.push(['AFFECTED URL', <a key='bugUrl' href={data.bugUrl} target='_blank' rel='noopener noreferrer' style={{ color: 'rgba(0,195,255,0.8)', wordBreak: 'break-all' }}>{data.bugUrl}</a>])
    if (isBug && data.discordIssueTypes?.length) fields.push(['DISCORD ISSUES', data.discordIssueTypes.join(', ')])
    if (isBug && data.discordIssueDetail) fields.push(['DISCORD DETAIL', data.discordIssueDetail])
    if (isBug && data.tsBugType) fields.push(['TS ISSUE TYPE', data.tsBugType])
    if (isBug && data.bugPlatformDetail) fields.push(['PLATFORM DETAIL', data.bugPlatformDetail])
    if (isBug && data.stepsToReproduce) fields.push(['STEPS TO REPRODUCE', data.stepsToReproduce])
    if (isBug && data.expectedResult) fields.push(['EXPECTED', data.expectedResult])
    if (isBug && data.actualResult) fields.push(['ACTUAL', data.actualResult])

    // Mission / Campaign fields
    if (isMission && data.missionType) fields.push(['MISSION TYPE', data.missionType === 'midweek' ? 'Midweek Operation' : 'Weekend Operation'])
    if (isMission && data.missionEnemyForces) fields.push(['ENEMY FORCES', data.missionEnemyForces])
    if (isMission && data.missionFriendlyForces) fields.push(['FRIENDLY FORCES', data.missionFriendlyForces])
    if (isMission && data.missionIndependentForces) fields.push(['INDEPENDENT FORCES', data.missionIndependentForces])
    if (isMission && data.missionCivilianPopulace) fields.push(['CIVILIAN POPULACE', data.missionCivilianPopulace])
    if (isMission && data.missionObjectives) fields.push(['OBJECTIVES', data.missionObjectives])
    if (isMission && data.missionStory) fields.push(['STORY & THEME', data.missionStory])
    if (isMission && data.missionPlayerExperience) fields.push(['PLAYER EXPERIENCE', data.missionPlayerExperience])
    if (isMission && data.missionMechanics) fields.push(['MECHANICS', data.missionMechanics])
    if (isMission && data.missionAdditionalNotes) fields.push(['ADDITIONAL NOTES', data.missionAdditionalNotes])

    // Unit feedback fields
    if (isFeedback && data.feedbackCategories?.length) fields.push(['FEEDBACK AREAS', data.feedbackCategories.join(', ')])
    if (isFeedback && data.feedbackType) { const fm = FB_TYPE_META[data.feedbackType]; fields.push(['FEEDBACK TYPE', <span key='feedbackType' style={{ color: fm?.color, fontWeight: 700, textTransform: 'capitalize' }}>{data.feedbackType}</span>]) }

    // Award fields
    if (isAward && data.nomineeName) fields.push(['NOMINEE', `${data.nomineeRank ? data.nomineeRank + ' ' : ''}${data.nomineeName}`])
    if (isAward && data.nominatorName) fields.push(['NOMINATED BY', data.nominatorName])
    if (isAward && data.supportingMembers?.length) fields.push(['SUPPORTING MEMBERS', data.supportingMembers.join(', ')])
    if (isAward && data.awardType) fields.push(['AWARD TYPE', data.awardType])
    if (isAward && data.awardCategory) fields.push(['AWARD CATEGORY', `${data.awardCategory}${data.awardCategoryOther ? ` — ${data.awardCategoryOther}` : ''}`])
    if (isAward && data.awardRequirements) fields.push(['REQUIREMENTS', data.awardRequirements])
    if (isAward && data.awardDesignRef) fields.push(['DESIGN REF', data.awardDesignRef])
    if (isAward && data.awardDesignNotes) fields.push(['DESIGN NOTES', data.awardDesignNotes])

    // Complaint fields
    if (isComplaint && data.membersInvolved?.length) fields.push(['MEMBERS INVOLVED', data.membersInvolved.join(', ')])
    if (isComplaint && data.membersInvolvedNotListed) fields.push(['ADDITIONAL DETAILS', data.membersInvolvedNotListed])
    if (isComplaint && data.complainantName && !data.complainantAnonymous) fields.push(['COMPLAINANT', data.complainantName])
    if (isComplaint && data.desiredOutcome) fields.push(['DESIRED OUTCOME', data.desiredOutcome])

    // Universal
    if (data.otherComments) fields.push(['OTHER COMMENTS', data.otherComments])

    const showPhases = s === 'campaign' && (data.campaignPhases?.length ?? 0) > 0
    if (fields.length === 0 && !showPhases) return null

    return (
        <div style={{ padding: '0 18px 16px' }}>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 16 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {fields.map(([label, value], i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(237,237,237,0.3)', paddingTop: 2 }}>{label}</span>
                        {typeof value === 'string'
                            ? <pre style={{ fontFamily: 'inherit', fontSize: '0.82rem', color: 'rgba(237,237,237,0.72)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>{value}</pre>
                            : <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.72)', lineHeight: 1.6 }}>{value}</div>
                        }
                    </div>
                ))}
            </div>
            {showPhases && data.campaignPhases && (
                <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.28)', marginBottom: 10 }}>MISSION PHASES</div>
                    {data.campaignPhases.map((p, i) => (
                        <div key={i} style={{ border: '1px solid rgba(167,139,250,0.15)', padding: '10px 14px', marginBottom: 6, background: 'rgba(167,139,250,0.03)' }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(167,139,250,0.65)', marginBottom: 4, fontFamily: 'monospace' }}>
                                PHASE {String(i + 1).padStart(2, '0')}{p.title ? ` — ${p.title}` : ''}
                            </div>
                            {p.description && <p style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.62)', margin: 0, lineHeight: 1.6 }}>{p.description}</p>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
