'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowBack, ThumbUp, ThumbUpOutlined, ThumbDown, ThumbDownOutlined,
    Delete, Send, Edit, Check, Close, History,
} from '@mui/icons-material'
import { CircularProgress } from '@mui/material'

type Status = CommunityTicketStatus
type MyVote = 'up' | 'down' | null

interface CommentItem extends Omit<CommunityTicketComment, '_id' | 'ticketId'> {
    _id: string
    ticketId: string
}

interface DetailData extends Omit<CommunityTicket, '_id'> {
    _id: string
    comments: CommentItem[]
    isJ4: boolean
    myId: string
    myVote: MyVote
}

const STATUS_COLOURS: Record<Status, string> = {
    open: 'rgba(237,237,237,0.55)',
    in_progress: 'rgba(0,195,255,0.85)',
    resolved: 'rgba(74,222,128,0.85)',
    closed: 'rgba(237,237,237,0.3)',
}

const STATUS_BG: Record<Status, string> = {
    open: 'rgba(255,255,255,0.02)',
    in_progress: 'rgba(0,195,255,0.05)',
    resolved: 'rgba(74,222,128,0.05)',
    closed: 'rgba(255,255,255,0.01)',
}

const STATUS_BORDER: Record<Status, string> = {
    open: 'rgba(255,255,255,0.15)',
    in_progress: 'rgba(0,195,255,0.7)',
    resolved: 'rgba(74,222,128,0.6)',
    closed: 'rgba(255,255,255,0.1)',
}

const STATUS_LABELS: Record<Status, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed',
}

const ALL_STATUSES: Status[] = ['open', 'in_progress', 'resolved', 'closed']

const SUBTYPE_LABELS: Record<string, string> = {
    'mod-request': 'Mod Request',
    'feature-request': 'Feature Request',
    'bug-arma': 'Bug — Arma',
    'bug-discord': 'Bug — Discord',
    'bug-website': 'Bug — Website',
    'bug-milpack': 'Bug — Milpack',
    'bug-teamspeak': 'Bug — TeamSpeak',
    'bug-other-game': 'Bug — Other Game',
    'bug-other': 'Bug — Other',
    'mission': 'Mission Idea',
    'campaign': 'Campaign Idea',
    'unit-feedback': 'Unit Feedback',
    'complaint-individual': 'Complaint — Individual',
    'complaint-group': 'Complaint — Group',
    'complaint-department': 'Complaint — Dept',
    'award-nomination': 'Award Nomination',
    'award-creation': 'Award Idea',
}

const DEPT_LABELS: Record<string, string> = {
    j1: 'J1 — Recruitment', j2: 'J2 — Mission Making',
    j3: 'J3 — Training', j4: 'J4 — Administration',
    j5: 'J5 — Media', j6: 'J6 — Game Masters', j7: 'J7 — Development',
}

const SEV_COLOURS: Record<string, string> = {
    low: 'rgba(74,222,128,0.7)',
    medium: 'rgba(255,160,0,0.8)',
    high: 'rgba(219,0,29,0.8)',
    critical: 'rgba(255,0,0,1)',
}

const FB_TYPE_COLOURS: Record<string, string> = {
    positive: 'rgba(74,222,128,0.8)',
    neutral: 'rgba(237,237,237,0.45)',
    negative: 'rgba(219,0,29,0.75)',
}

function avatarUrl(authorId: string, authorAvatarId?: string): string {
    if (authorAvatarId) return `https://cdn.discordapp.com/avatars/${authorId}/${authorAvatarId}.png?size=40`
    try { return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(authorId) % BigInt(6))}.png` }
    catch { return 'https://cdn.discordapp.com/embed/avatars/0.png' }
}

function fmt(d: string | Date) {
    return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtFull(d: string | Date) {
    return new Date(d).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}


export default function TicketDetailPage() {
    const params = useParams()
    const router = useRouter()
    const id = params.id as string

    const [data, setData] = useState<DetailData | null>(null)
    const [loading, setLoading] = useState(true)
    const [voting, setVoting] = useState(false)
    const [myVote, setMyVote] = useState<MyVote>(null)
    const [upvotes, setUpvotes] = useState(0)
    const [downvotes, setDownvotes] = useState(0)
    const [voteScore, setVoteScore] = useState(0)
    const [statusUpdating, setStatusUpdating] = useState(false)
    const [deptUpdating, setDeptUpdating] = useState(false)
    const [comment, setComment] = useState('')
    const [posting, setPosting] = useState(false)
    const [editingComment, setEditingComment] = useState<string | null>(null)
    const [editContent, setEditContent] = useState('')
    const [savingEdit, setSavingEdit] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [avatarErr, setAvatarErr] = useState(false)
    const [logOpen, setLogOpen] = useState(false)
    const [restoring, setRestoring] = useState(false)

    const load = useCallback(() => {
        setLoading(true)
        fetch(`/api/community/tickets/${id}`)
            .then(r => r.json())
            .then((d: DetailData) => {
                setData(d)
                setMyVote(d.myVote)
                setUpvotes(d.upvotes?.length ?? 0)
                setDownvotes(d.downvotes?.length ?? 0)
                setVoteScore(d.voteScore ?? 0)
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [id])

    useEffect(() => { load() }, [load])

    async function handleVote(dir: 'up' | 'down') {
        if (voting) return
        const newDir = myVote === dir ? null : dir
        setVoting(true)
        const res = await fetch(`/api/community/tickets/${id}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction: newDir }),
        })
        const json = await res.json()
        setMyVote(json.myVote)
        setUpvotes(json.upvotes)
        setDownvotes(json.downvotes)
        setVoteScore(json.voteScore)
        setVoting(false)
    }

    async function handleStatus(status: string) {
        setStatusUpdating(true)
        await fetch(`/api/community/tickets/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        })
        setData(d => d ? { ...d, status: status as Status } : d)
        setStatusUpdating(false)
    }

    async function handleDept(department: string) {
        setDeptUpdating(true)
        await fetch(`/api/community/tickets/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ department }),
        })
        setData(d => d ? { ...d, department } : d)
        setDeptUpdating(false)
    }

    async function handleComment(e: React.FormEvent) {
        e.preventDefault()
        if (!comment.trim() || posting) return
        setPosting(true)
        const res = await fetch(`/api/community/tickets/${id}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: comment.trim() }),
        })
        const newCmt = await res.json()
        setData(d => d ? { ...d, comments: [...d.comments, newCmt], commentCount: d.commentCount + 1 } : d)
        setComment('')
        setPosting(false)
    }

    async function saveCommentEdit(commentId: string) {
        if (!editContent.trim() || savingEdit) return
        setSavingEdit(true)
        const res = await fetch(`/api/community/tickets/${id}/comments/${commentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: editContent.trim() }),
        })
        const updated = await res.json()
        setData(d => d ? { ...d, comments: d.comments.map(c => c._id === commentId ? { ...c, ...updated } : c) } : d)
        setEditingComment(null)
        setSavingEdit(false)
    }

    async function deleteComment(commentId: string) {
        await fetch(`/api/community/tickets/${id}/comments/${commentId}`, { method: 'DELETE' })
        setData(d => d ? { ...d, comments: d.comments.filter(c => c._id !== commentId), commentCount: d.commentCount - 1 } : d)
    }

    async function handleDelete() {
        if (!confirm('Delete this ticket? It will be hidden from normal users but J4 can still view it.')) return
        setDeleting(true)
        await fetch(`/api/community/tickets/${id}`, { method: 'DELETE' })
        if (data?.isJ4) {
            setData(d => d ? { ...d, isDeleted: true } : d)
            setDeleting(false)
        } else {
            router.push('/community/tickets')
        }
    }

    async function handleRestore() {
        setRestoring(true)
        await fetch(`/api/community/tickets/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restore: true }),
        })
        setData(d => d ? { ...d, isDeleted: false } : d)
        setRestoring(false)
    }

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <CircularProgress size={24} style={{ color: 'rgba(219,0,29,0.6)' }} />
        </div>
    )

    if (!data || (data as unknown as { error?: string }).error) return (
        <div style={{ color: 'rgba(237,237,237,0.4)', textAlign: 'center', padding: '48px 0', fontSize: '0.85rem' }}>
            Ticket not found.{' '}
            <Link href='/community/tickets' style={{ color: 'rgba(219,0,29,0.7)', textDecoration: 'none' }}>Go back</Link>
        </div>
    )

    const status = data.status as Status
    const statusCol = STATUS_COLOURS[status]
    const canDelete = data.isJ4 || data.authorId === data.myId
    const scoreCol = voteScore > 0 ? 'rgba(74,222,128,0.85)' : voteScore < 0 ? 'rgba(219,0,29,0.75)' : 'rgba(237,237,237,0.45)'

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <Link href='/community/tickets'>
                <button style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'transparent', border: 'none',
                    color: 'rgba(237,237,237,0.35)', cursor: 'pointer',
                    fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', padding: 0,
                }}>
                    <ArrowBack style={{ fontSize: 14 }} /> BACK TO TICKETS
                </button>
            </Link>

            {/* Deleted banner */}
            {data.isDeleted && (
                <div style={{
                    background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.25)',
                    borderLeft: '3px solid rgba(219,0,29,0.6)', padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 12,
                }}>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(219,0,29,0.8)', fontWeight: 700, letterSpacing: '0.1em' }}>
                        DELETED — visible to J4 only
                    </span>
                    {data.isJ4 && (
                        <button onClick={handleRestore} disabled={restoring} style={{
                            marginLeft: 'auto', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)',
                            color: 'rgba(74,222,128,0.85)', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em',
                            padding: '4px 12px', cursor: 'pointer',
                        }}>
                            {restoring ? 'RESTORING…' : 'RESTORE'}
                        </button>
                    )}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, alignItems: 'start' }}>

                {/* ── MAIN ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

                    {/* Ticket card */}
                    <div style={{
                        background: STATUS_BG[status],
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderLeft: `3px solid ${STATUS_BORDER[status]}`,
                    }}>
                        {/* Top bar */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                            background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            <span style={{
                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em',
                                padding: '2px 7px', color: statusCol,
                                border: `1px solid ${statusCol}44`, background: STATUS_BG[status],
                            }}>
                                {SUBTYPE_LABELS[data.subtype] ?? data.subtype}
                            </span>
                            <span style={{
                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em',
                                padding: '2px 7px', color: statusCol,
                                border: `1px solid ${statusCol}44`,
                            }}>
                                {STATUS_LABELS[status]}
                            </span>
                            {data.visibility === 'private' && (
                                <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', padding: '2px 7px', color: 'rgba(255,80,80,0.7)', border: '1px solid rgba(255,80,80,0.2)' }}>
                                    PRIVATE
                                </span>
                            )}
                            {data.severity && (
                                <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', padding: '2px 7px', color: SEV_COLOURS[data.severity], border: `1px solid ${SEV_COLOURS[data.severity]}44` }}>
                                    {data.severity.toUpperCase()}
                                </span>
                            )}
                            <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '0.6rem', color: 'rgba(237,237,237,0.2)' }}>
                                {fmt(data.createdAt)}
                            </span>
                            {canDelete && !data.isDeleted && (
                                <button onClick={handleDelete} disabled={deleting} style={{
                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                    color: 'rgba(219,0,29,0.35)', display: 'flex', padding: 0,
                                }}>
                                    {deleting ? <CircularProgress size={12} style={{ color: 'rgba(219,0,29,0.5)' }} /> : <Delete style={{ fontSize: 15 }} />}
                                </button>
                            )}
                        </div>

                        {/* Title + author */}
                        <div style={{ padding: '16px 18px 12px' }}>
                            <h1 style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--foreground)', margin: 0, lineHeight: 1.3 }}>
                                {data.title}
                            </h1>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                                {data.isAnonymous ? (
                                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'rgba(237,237,237,0.4)', fontWeight: 700 }}>?</div>
                                ) : !avatarErr ? (
                                    <img src={avatarUrl(data.authorId, data.authorAvatarId)} alt={data.authorName}
                                        onError={() => setAvatarErr(true)}
                                        style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }} />
                                ) : (
                                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'rgba(237,237,237,0.6)', fontWeight: 700 }}>
                                        {data.authorName.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)' }}>
                                    {data.isAnonymous ? 'Anonymous' : data.authorName}
                                </span>
                                {data.updatedAt !== data.createdAt && (
                                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)', fontFamily: 'monospace' }}>
                                        · edited {fmt(data.updatedAt)}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 18px' }} />

                        {/* Description */}
                        <div style={{ padding: '16px 18px' }}>
                            <pre style={{ fontFamily: 'inherit', fontSize: '0.875rem', color: 'rgba(237,237,237,0.75)', whiteSpace: 'pre-wrap', lineHeight: 1.75, margin: 0 }}>
                                {data.description}
                            </pre>
                        </div>

                        {/* Extended fields */}
                        <ExtendedFields data={data} />
                    </div>

                    {/* ── COMMENTS ── */}
                    <div style={{ marginTop: 24 }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
                            paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.3)' }}>COMMENTS</span>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)' }}>
                                [{String(data.comments.length).padStart(2, '0')}]
                            </span>
                        </div>

                        {data.comments.length === 0 && (
                            <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic', padding: '12px 0' }}>
                                No comments yet.
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {data.comments.map((c, i) => (
                                <div key={c._id} style={{
                                    background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    borderLeft: '2px solid rgba(255,255,255,0.1)',
                                }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px',
                                        background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(237,237,237,0.7)' }}>
                                            {c.authorName}
                                        </span>
                                        {c.isEdited && (
                                            <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.06em' }}>· edited</span>
                                        )}
                                        <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '0.6rem', color: 'rgba(237,237,237,0.2)' }}>
                                            {fmtFull(c.createdAt)}
                                        </span>
                                        {(c.authorId === data.myId || data.isJ4) && editingComment !== c._id && (
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {c.authorId === data.myId && (
                                                    <button onClick={() => { setEditingComment(c._id); setEditContent(c.content) }} style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: 'rgba(237,237,237,0.25)', display: 'flex', padding: 0,
                                                        transition: 'color 0.1s',
                                                    }}
                                                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.6)')}
                                                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.25)')}
                                                    >
                                                        <Edit style={{ fontSize: 13 }} />
                                                    </button>
                                                )}
                                                <button onClick={() => deleteComment(c._id)} style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    color: 'rgba(219,0,29,0.3)', display: 'flex', padding: 0,
                                                    transition: 'color 0.1s',
                                                }}
                                                    onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.7)')}
                                                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.3)')}
                                                >
                                                    <Delete style={{ fontSize: 13 }} />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ padding: '10px 14px' }}>
                                        {editingComment === c._id ? (
                                            <div>
                                                <textarea
                                                    value={editContent}
                                                    onChange={e => setEditContent(e.target.value)}
                                                    rows={3}
                                                    style={{
                                                        width: '100%', padding: '8px 10px', resize: 'vertical',
                                                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)',
                                                        color: 'rgba(237,237,237,0.85)', fontSize: '0.85rem', outline: 'none',
                                                        boxSizing: 'border-box', borderRadius: 0, fontFamily: 'inherit',
                                                    }}
                                                />
                                                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                                    <button onClick={() => saveCommentEdit(c._id)} disabled={savingEdit} style={{
                                                        display: 'flex', alignItems: 'center', gap: 5,
                                                        background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)',
                                                        color: 'rgba(74,222,128,0.85)', fontSize: '0.68rem', fontWeight: 800,
                                                        letterSpacing: '0.1em', padding: '5px 12px', cursor: 'pointer',
                                                    }}>
                                                        {savingEdit ? <CircularProgress size={10} style={{ color: 'rgba(74,222,128,0.6)' }} /> : <Check style={{ fontSize: 12 }} />}
                                                        SAVE
                                                    </button>
                                                    <button onClick={() => setEditingComment(null)} style={{
                                                        display: 'flex', alignItems: 'center', gap: 5,
                                                        background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                                                        color: 'rgba(237,237,237,0.4)', fontSize: '0.68rem', fontWeight: 800,
                                                        letterSpacing: '0.1em', padding: '5px 12px', cursor: 'pointer',
                                                    }}>
                                                        <Close style={{ fontSize: 12 }} /> CANCEL
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <pre style={{ fontFamily: 'inherit', fontSize: '0.85rem', color: 'rgba(237,237,237,0.7)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.65 }}>
                                                {c.content}
                                            </pre>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* New comment */}
                        <form onSubmit={handleComment} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 0 }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.25)', marginBottom: 8 }}>
                                ADD COMMENT
                            </div>
                            <textarea
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                placeholder='Write your comment…'
                                rows={4}
                                style={{
                                    width: '100%', padding: '10px 12px', resize: 'vertical',
                                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
                                    borderBottom: '1px solid rgba(255,255,255,0.12)',
                                    color: 'rgba(237,237,237,0.85)', fontSize: '0.875rem', outline: 'none',
                                    boxSizing: 'border-box', borderRadius: 0, fontFamily: 'inherit', lineHeight: 1.65,
                                }}
                            />
                            <div style={{
                                display: 'flex', justifyContent: 'flex-end', padding: '10px 14px',
                                background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(219,0,29,0.15)',
                                borderTop: '2px solid rgba(219,0,29,0.35)',
                            }}>
                                <button type='submit' disabled={posting || !comment.trim()} style={{
                                    display: 'flex', alignItems: 'center', gap: 7, padding: '8px 22px',
                                    background: posting || !comment.trim() ? 'rgba(219,0,29,0.05)' : 'rgba(219,0,29,0.12)',
                                    border: '1px solid rgba(219,0,29,0.4)',
                                    color: 'rgba(219,0,29,0.9)', fontSize: '0.72rem', fontWeight: 800,
                                    letterSpacing: '0.12em', cursor: posting || !comment.trim() ? 'not-allowed' : 'pointer',
                                    opacity: posting || !comment.trim() ? 0.5 : 1, borderRadius: 0,
                                }}>
                                    {posting ? <CircularProgress size={11} style={{ color: 'rgba(219,0,29,0.7)' }} /> : <Send style={{ fontSize: 13 }} />}
                                    POST COMMENT
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

                    {/* Vote */}
                    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12, marginBottom: 4 }}>
                        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.2)', marginBottom: 8, paddingLeft: 2 }}>
                            VOTES
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <VoteButton dir='up' active={myVote === 'up'} count={upvotes} voting={voting} onClick={() => handleVote('up')} />
                            <VoteButton dir='down' active={myVote === 'down'} count={downvotes} voting={voting} onClick={() => handleVote('down')} />
                        </div>
                        <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.25)' }}>SCORE </span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'monospace', color: scoreCol }}>
                                {voteScore > 0 ? '+' : ''}{voteScore}
                            </span>
                        </div>
                    </div>

                    {/* Status (J4) */}
                    {data.isJ4 && (
                        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12, marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.2)', marginBottom: 8, paddingLeft: 2 }}>
                                STATUS
                                {statusUpdating && <CircularProgress size={10} style={{ color: 'rgba(237,237,237,0.3)' }} />}
                            </div>
                            <select value={status} onChange={e => handleStatus(e.target.value)} disabled={statusUpdating} style={{
                                width: '100%', background: STATUS_BG[status],
                                border: `1px solid ${statusCol}44`, borderLeft: `3px solid ${statusCol}`,
                                color: statusCol, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em',
                                padding: '8px 10px', cursor: 'pointer', outline: 'none', borderRadius: 0, fontFamily: 'inherit',
                            }}>
                                {ALL_STATUSES.map(s => (
                                    <option key={s} value={s} style={{ background: '#0a0a0a', color: STATUS_COLOURS[s] }}>{STATUS_LABELS[s]}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Department (J4) */}
                    {data.isJ4 && (
                        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12, marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.2)', marginBottom: 8, paddingLeft: 2 }}>
                                DEPARTMENT
                                {deptUpdating && <CircularProgress size={10} style={{ color: 'rgba(237,237,237,0.3)' }} />}
                            </div>
                            <select value={data.department} onChange={e => handleDept(e.target.value)} disabled={deptUpdating} style={{
                                width: '100%', background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: 'rgba(237,237,237,0.65)', fontSize: '0.72rem', fontWeight: 600,
                                padding: '8px 10px', cursor: 'pointer', outline: 'none', borderRadius: 0, fontFamily: 'inherit',
                            }}>
                                {Object.entries(DEPT_LABELS).map(([k, v]) => (
                                    <option key={k} value={k} style={{ background: '#0a0a0a' }}>{v}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Metadata */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {[
                            ['AUTHOR', data.isAnonymous ? 'Anonymous' : data.authorName],
                            ['SUBMITTED', fmt(data.createdAt)],
                            ['DEPARTMENT', DEPT_LABELS[data.department] ?? data.department],
                            ['COMMENTS', String(data.comments.length).padStart(2, '0')],
                        ].map(([label, value]) => (
                            <div key={label} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                            }}>
                                <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.2)' }}>{label}</span>
                                <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.5)', fontFamily: ['SUBMITTED', 'COMMENTS'].includes(label) ? 'monospace' : 'inherit', maxWidth: 150, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {value}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Activity Log (J4) */}
                    {data.isJ4 && data.activityLog && data.activityLog.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                            <button onClick={() => setLogOpen(v => !v)} style={{
                                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                                background: 'transparent', border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)',
                                padding: '9px 2px', cursor: 'pointer',
                                color: 'rgba(237,237,237,0.25)', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.14em',
                            }}>
                                <History style={{ fontSize: 13 }} />
                                ACTIVITY LOG
                                <span style={{ fontFamily: 'monospace', color: 'rgba(237,237,237,0.2)' }}>
                                    [{String(data.activityLog.length).padStart(2, '0')}]
                                </span>
                            </button>
                            {logOpen && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingTop: 6 }}>
                                    {[...data.activityLog].reverse().map((entry, i) => (
                                        <div key={i} style={{ padding: '6px 4px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.5)', fontWeight: 600 }}>
                                                {entry.actorName} — <span style={{ color: 'rgba(237,237,237,0.3)', fontFamily: 'monospace' }}>{entry.action.replace(/_/g, ' ')}</span>
                                            </div>
                                            {entry.oldValue && entry.newValue && (
                                                <div style={{ fontSize: '0.58rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.25)', marginTop: 2 }}>
                                                    {entry.oldValue} → {entry.newValue}
                                                </div>
                                            )}
                                            <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.2)', fontFamily: 'monospace', marginTop: 2 }}>
                                                {fmtFull(entry.timestamp)}
                                            </div>
                                        </div>
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


function VoteButton({ dir, active, count, voting, onClick }: {
    dir: 'up' | 'down'; active: boolean; count: number; voting: boolean; onClick: () => void
}) {
    const isUp = dir === 'up'
    const activeCol = isUp ? 'rgba(74,222,128,0.9)' : 'rgba(219,0,29,0.85)'
    const activeBg = isUp ? 'rgba(74,222,128,0.08)' : 'rgba(219,0,29,0.08)'
    const activeBorder = isUp ? 'rgba(74,222,128,0.4)' : 'rgba(219,0,29,0.4)'

    return (
        <button onClick={onClick} disabled={voting} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '8px', cursor: voting ? 'not-allowed' : 'pointer',
            background: active ? activeBg : 'rgba(255,255,255,0.02)',
            border: `1px solid ${active ? activeBorder : 'rgba(255,255,255,0.08)'}`,
            color: active ? activeCol : 'rgba(237,237,237,0.4)',
            fontSize: '0.78rem', fontWeight: 700, transition: 'all 0.1s',
        }}>
            {isUp
                ? (active ? <ThumbUp style={{ fontSize: 14 }} /> : <ThumbUpOutlined style={{ fontSize: 14 }} />)
                : (active ? <ThumbDown style={{ fontSize: 14 }} /> : <ThumbDownOutlined style={{ fontSize: 14 }} />)
            }
            <span style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{count}</span>
        </button>
    )
}


function ExtendedFields({ data }: { data: DetailData }) {
    const fields: [string, React.ReactNode][] = []

    if (data.modLink) fields.push(['MOD LINK', <a href={data.modLink} target='_blank' rel='noopener noreferrer' style={{ color: 'rgba(0,195,255,0.8)', fontSize: '0.82rem', wordBreak: 'break-all' }}>{data.modLink}</a>])
    if (data.game) fields.push(['GAME', data.game + (data.gameOther ? ` — ${data.gameOther}` : '')])
    if (data.featureCategory) fields.push(['CATEGORY', data.featureCategory])
    if (data.weblink) fields.push(['URL', <a href={data.weblink} target='_blank' rel='noopener noreferrer' style={{ color: 'rgba(0,195,255,0.8)', fontSize: '0.82rem', wordBreak: 'break-all' }}>{data.weblink}</a>])
    if (data.justification) fields.push(['JUSTIFICATION', data.justification])
    if (data.stepsToReproduce) fields.push(['STEPS TO REPRODUCE', data.stepsToReproduce])
    if (data.expectedResult) fields.push(['EXPECTED RESULT', data.expectedResult])
    if (data.actualResult) fields.push(['ACTUAL RESULT', data.actualResult])
    if (data.bugPlatformDetail) fields.push(['PLATFORM DETAIL', data.bugPlatformDetail])
    if (data.missionForces) fields.push(['FORCES', data.missionForces])
    if (data.missionObjectives) fields.push(['OBJECTIVES', data.missionObjectives])
    if (data.missionStory) fields.push(['STORY', data.missionStory])
    if (data.missionPlayerExperience) fields.push(['PLAYER EXPERIENCE', data.missionPlayerExperience])
    if (data.missionMechanics) fields.push(['MECHANICS', data.missionMechanics])
    if (data.feedbackCategories?.length) fields.push(['FEEDBACK AREAS', data.feedbackCategories.join(', ')])
    if (data.feedbackType) fields.push(['TYPE', <span style={{ color: FB_TYPE_COLOURS[data.feedbackType], fontWeight: 700, textTransform: 'capitalize' }}>{data.feedbackType}</span>])
    if (data.nomineeName) fields.push(['NOMINEE', `${data.nomineeRank ? data.nomineeRank + ' ' : ''}${data.nomineeName}`])
    if (data.nominatorName) fields.push(['NOMINATED BY', data.nominatorName])
    if (data.awardType) fields.push(['AWARD TYPE', data.awardType])
    if (data.awardCategory) fields.push(['AWARD CATEGORY', data.awardCategory])
    if (data.awardRequirements) fields.push(['REQUIREMENTS', data.awardRequirements])
    if (data.awardDesignRef) fields.push(['DESIGN REF', data.awardDesignRef])
    if (data.membersInvolved?.length) fields.push(['INVOLVED', data.membersInvolved.join(', ')])
    if (data.complainantName) fields.push(['COMPLAINANT', data.complainantName])
    if (data.desiredOutcome) fields.push(['DESIRED OUTCOME', data.desiredOutcome])
    if (data.otherComments) fields.push(['OTHER COMMENTS', data.otherComments])

    if (fields.length === 0) return null

    return (
        <div style={{ padding: '0 18px 16px' }}>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 16 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {fields.map(([label, value], i) => (
                    <div key={i} style={{
                        display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12,
                        padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.25)', paddingTop: 2 }}>{label}</span>
                        {typeof value === 'string'
                            ? <pre style={{ fontFamily: 'inherit', fontSize: '0.82rem', color: 'rgba(237,237,237,0.65)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>{value}</pre>
                            : <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.65)', lineHeight: 1.6 }}>{value}</div>
                        }
                    </div>
                ))}
            </div>

            {/* Campaign phases */}
            {data.campaignPhases && data.campaignPhases.length > 0 && (
                <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.25)', marginBottom: 10 }}>MISSION PHASES</div>
                    {data.campaignPhases.map((p, i) => (
                        <div key={i} style={{ border: '1px solid rgba(167,139,250,0.15)', padding: '10px 14px', marginBottom: 6, background: 'rgba(167,139,250,0.03)' }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(167,139,250,0.6)', marginBottom: 4, fontFamily: 'monospace' }}>
                                PHASE {String(i + 1).padStart(2, '0')}{p.title ? ` — ${p.title}` : ''}
                            </div>
                            {p.description && <p style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.6)', margin: 0, lineHeight: 1.6 }}>{p.description}</p>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
