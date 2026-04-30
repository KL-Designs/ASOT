'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowBack, ThumbUp, ThumbUpOutlined, ThumbDown, ThumbDownOutlined,
    Delete, Send, Edit, Check, Close, History, Restore,
} from '@mui/icons-material'
import { CircularProgress } from '@mui/material'
import {
    STATUS_META, ALL_STATUSES, CAT_META, SUBTYPE_LABELS, DEPT_META,
    SEV_META, FB_TYPE_META, getStatus,
} from '../_shared/constants'

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

    const [data, setData] = useState<DetailData | null>(null)
    const [loading, setLoading] = useState(true)

    // Ticket votes
    const [voting, setVoting] = useState(false)
    const [myVote, setMyVote] = useState<MyVote>(null)
    const [upvotes, setUpvotes] = useState(0)
    const [downvotes, setDownvotes] = useState(0)
    const [voteScore, setVoteScore] = useState(0)

    // J4 controls
    const [statusUpdating, setStatusUpdating] = useState(false)
    const [selectedDepts, setSelectedDepts] = useState<string[]>([])
    const [deptUpdating, setDeptUpdating] = useState(false)

    // Comments
    const [comment, setComment] = useState('')
    const [posting, setPosting] = useState(false)
    const [editingComment, setEditingComment] = useState<string | null>(null)
    const [editContent, setEditContent] = useState('')
    const [savingEdit, setSavingEdit] = useState(false)
    // J4: which deleted comments are currently visible in thread
    const [revealedDeletedIds, setRevealedDeletedIds] = useState<Set<string>>(new Set())
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
        fetch(`/api/community/tickets/${id}`)
            .then(r => r.json())
            .then((d: DetailData) => {
                setData(d)
                setMyVote(d.myVote)
                setUpvotes(d.upvotes?.length ?? 0)
                setDownvotes(d.downvotes?.length ?? 0)
                setVoteScore(d.voteScore ?? 0)
                setSelectedDepts(d.departments?.length ? d.departments : d.department ? [d.department] : ['j4'])
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
        const res = await fetch(`/api/community/tickets/${id}/vote`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction: myVote === dir ? null : dir }),
        })
        const j = await res.json()
        setMyVote(j.myVote); setUpvotes(j.upvotes); setDownvotes(j.downvotes); setVoteScore(j.voteScore)
        setVoting(false)
    }

    async function handleCommentVote(commentId: string, dir: 'up' | 'down') {
        const prev = commentVotes[commentId]
        const res = await fetch(`/api/community/tickets/${id}/comments/${commentId}/vote`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction: prev?.myVote === dir ? null : dir }),
        })
        const j = await res.json()
        setCommentVotes(cv => ({ ...cv, [commentId]: { myVote: j.myVote, up: j.upvotes, down: j.downvotes, score: j.voteScore } }))
    }

    async function handleStatus(status: string) {
        setStatusUpdating(true)
        await fetch(`/api/community/tickets/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        })
        setData(d => d ? { ...d, status: status as CommunityTicketStatus } : d)
        setStatusUpdating(false)
    }

    async function handleDeptsUpdate() {
        setDeptUpdating(true)
        await fetch(`/api/community/tickets/${id}`, {
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
        const res = await fetch(`/api/community/tickets/${id}/comments`, {
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
        const res = await fetch(`/api/community/tickets/${id}/comments/${commentId}`, {
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
        await fetch(`/api/community/tickets/${id}/comments/${commentId}`, { method: 'DELETE' })
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
        await fetch(`/api/community/tickets/${id}`, { method: 'DELETE' })
        if (data?.isJ4) { setData(d => d ? { ...d, isDeleted: true } : d); setDeleting(false) }
        else router.push('/community/tickets')
    }

    async function handleRestore() {
        setRestoring(true)
        await fetch(`/api/community/tickets/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restore: true }),
        })
        setData(d => d ? { ...d, isDeleted: false } : d)
        setRestoring(false)
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

    /** Scroll to a visible comment (for edited comment activity entries) */
    function scrollToComment(commentId: string) {
        const el = commentRefs.current[commentId]
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            setHighlightedComment(commentId)
            setTimeout(() => setHighlightedComment(null), 3500)
        }
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

            <Link href='/community/tickets'>
                <button style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', padding: 0 }}>
                    <ArrowBack style={{ fontSize: 14 }} /> BACK TO TICKETS
                </button>
            </Link>

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
                                        <a key={f} href={`/api/community/tickets/${data._id}/uploads?file=${encodeURIComponent(f)}`} target='_blank' rel='noopener noreferrer'>
                                            <img src={`/api/community/tickets/${data._id}/uploads?file=${encodeURIComponent(f)}`} alt={f} style={{ height: 80, border: '1px solid rgba(255,255,255,0.07)', objectFit: 'cover' }} />
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

                                return (
                                    <div
                                        key={c._id}
                                        ref={el => { commentRefs.current[c._id] = el }}
                                        style={{
                                            background: isHighlighted ? 'rgba(255,200,0,0.06)' : isDeleted ? 'rgba(219,0,29,0.04)' : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                            border: `1px solid ${isHighlighted ? 'rgba(255,200,0,0.3)' : isDeleted ? 'rgba(219,0,29,0.2)' : 'rgba(255,255,255,0.05)'}`,
                                            borderLeft: isHighlighted ? '2px solid rgba(255,200,0,0.7)' : isDeleted ? '2px solid rgba(219,0,29,0.35)' : '2px solid rgba(255,255,255,0.1)',
                                            opacity: isDeleted ? 0.7 : 1,
                                            transition: 'background 0.4s, border-color 0.4s',
                                        }}
                                    >
                                        {/* Header */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', color: isDeleted ? 'rgba(219,0,29,0.5)' : 'rgba(237,237,237,0.7)' }}>
                                                {isDeleted ? '[DELETED]' : c.authorName}
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
                                                <span style={{ fontSize: '0.78rem', color: 'rgba(219,0,29,0.4)', fontStyle: 'italic' }}>
                                                    [Comment deleted — content visible to J4 via activity log]
                                                </span>
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
                                                <pre style={{ fontFamily: 'inherit', fontSize: '0.85rem', color: 'rgba(237,237,237,0.72)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.65 }}>{c.content}</pre>
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

                    {/* Status (J4) */}
                    {data.isJ4 && (
                        <SideSection label='STATUS' loading={statusUpdating}>
                            <select value={data.status} onChange={e => handleStatus(e.target.value)} disabled={statusUpdating} style={{ width: '100%', background: status.bg, border: `1px solid ${status.border}55`, borderLeft: `3px solid ${status.color}`, color: status.color, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', padding: '8px 10px', cursor: 'pointer', outline: 'none', borderRadius: 0, fontFamily: 'inherit', appearance: 'none' }}>
                                {ALL_STATUSES.map(s => <option key={s} value={s} style={{ background: '#0a0a0a', color: STATUS_META[s].color }}>{STATUS_META[s].label}</option>)}
                            </select>
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
                                            onScrollToEdited={entry.commentId && entry.action === 'comment_edited'
                                                ? () => scrollToComment(entry.commentId!)
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

function ActivityEntry({ entry, onRevealDeleted, onScrollToEdited }: {
    entry: CommunityTicketActivity
    onRevealDeleted?: () => void
    onScrollToEdited?: () => void
}) {
    const [diffOpen, setDiffOpen] = useState(false)

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
                    {/* Deleted comment: reveal button */}
                    {entry.action === 'comment_deleted' && onRevealDeleted && (
                        <button onClick={onRevealDeleted} style={{ fontSize: '0.58rem', color: 'rgba(219,0,29,0.6)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 3, textDecoration: 'underline' }}>
                            reveal in thread
                        </button>
                    )}
                    {/* Deleted content expandable */}
                    {entry.action === 'comment_deleted' && entry.prevContent && (
                        <details style={{ marginTop: 3 }}>
                            <summary style={{ fontSize: '0.56rem', color: 'rgba(219,0,29,0.45)', cursor: 'pointer' }}>view deleted content</summary>
                            <pre style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.45)', background: 'rgba(219,0,29,0.06)', padding: '4px 6px', margin: '4px 0 0', whiteSpace: 'pre-wrap', fontFamily: 'inherit', border: '1px solid rgba(219,0,29,0.15)' }}>
                                {entry.prevContent}
                            </pre>
                        </details>
                    )}
                    {/* Edited comment: diff */}
                    {entry.action === 'comment_edited' && entry.prevContent && (
                        <button onClick={() => setDiffOpen(v => !v)} style={{ fontSize: '0.58rem', color: 'rgba(255,160,0,0.65)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 3, textDecoration: 'underline' }}>
                            {diffOpen ? 'hide diff' : 'show diff'}
                        </button>
                    )}
                </div>
                {/* Jump buttons */}
                {onScrollToEdited && (
                    <button onClick={onScrollToEdited} title='Jump to comment' style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.25)', fontSize: '0.56rem', padding: '2px 5px', cursor: 'pointer', flexShrink: 0 }}>↓</button>
                )}
            </div>

            {/* Edit diff */}
            {diffOpen && entry.prevContent && entry.newValue && (
                <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(219,0,29,0.5)', marginBottom: 2 }}>BEFORE</div>
                    <pre style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.5)', background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.15)', padding: '4px 6px', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '0 0 6px' }}>{entry.prevContent}</pre>
                    <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(74,222,128,0.5)', marginBottom: 2 }}>AFTER</div>
                    <pre style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.5)', background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)', padding: '4px 6px', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{entry.newValue}</pre>
                </div>
            )}

            <div style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.18)', fontFamily: 'monospace', marginTop: 4 }}>{new Date(entry.timestamp).toLocaleString('en-AU')}</div>
        </div>
    )
}


function ExtendedFields({ data }: { data: DetailData }) {
    const fields: [string, React.ReactNode][] = []

    if (data.modLink) fields.push(['MOD LINK', <a key='modLink' href={data.modLink} target='_blank' rel='noopener noreferrer' style={{ color: 'rgba(0,195,255,0.8)', fontSize: '0.82rem', wordBreak: 'break-all' }}>{data.modLink}</a>])
    if (data.game) fields.push(['GAME', `${data.game}${data.gameOther ? ` — ${data.gameOther}` : ''}`])
    if (data.featureCategory) fields.push(['CATEGORY', `${data.featureCategory}${data.featureCategoryOther ? ` — ${data.featureCategoryOther}` : ''}`])
    if (data.weblink || data.bugUrl) { const url = data.weblink ?? data.bugUrl!; fields.push(['URL', <a key='url' href={url} target='_blank' rel='noopener noreferrer' style={{ color: 'rgba(0,195,255,0.8)', wordBreak: 'break-all' }}>{url}</a>]) }
    if (data.justification) fields.push(['JUSTIFICATION', data.justification])
    if (data.discordIssueTypes?.length) fields.push(['DISCORD ISSUES', data.discordIssueTypes.join(', ')])
    if (data.discordIssueDetail) fields.push(['DISCORD DETAIL', data.discordIssueDetail])
    if (data.tsBugType) fields.push(['TS ISSUE TYPE', data.tsBugType])
    if (data.bugPlatformDetail) fields.push(['PLATFORM DETAIL', data.bugPlatformDetail])
    if (data.stepsToReproduce) fields.push(['STEPS TO REPRODUCE', data.stepsToReproduce])
    if (data.expectedResult) fields.push(['EXPECTED', data.expectedResult])
    if (data.actualResult) fields.push(['ACTUAL', data.actualResult])
    if (data.missionType) fields.push(['MISSION TYPE', data.missionType === 'midweek' ? 'Midweek Operation' : 'Weekend Operation'])
    if (data.missionEnemyForces) fields.push(['ENEMY FORCES', data.missionEnemyForces])
    if (data.missionFriendlyForces) fields.push(['FRIENDLY FORCES', data.missionFriendlyForces])
    if (data.missionIndependentForces) fields.push(['INDEPENDENT FORCES', data.missionIndependentForces])
    if (data.missionCivilianPopulace) fields.push(['CIVILIAN POPULACE', data.missionCivilianPopulace])
    if (data.missionObjectives) fields.push(['OBJECTIVES', data.missionObjectives])
    if (data.missionStory) fields.push(['STORY & THEME', data.missionStory])
    if (data.missionPlayerExperience) fields.push(['PLAYER EXPERIENCE', data.missionPlayerExperience])
    if (data.missionMechanics) fields.push(['MECHANICS', data.missionMechanics])
    if (data.missionAdditionalNotes) fields.push(['ADDITIONAL NOTES', data.missionAdditionalNotes])
    if (data.feedbackCategories?.length) fields.push(['FEEDBACK AREAS', data.feedbackCategories.join(', ')])
    if (data.feedbackType) { const fm = FB_TYPE_META[data.feedbackType]; fields.push(['FEEDBACK TYPE', <span key='feedbackType' style={{ color: fm?.color, fontWeight: 700, textTransform: 'capitalize' }}>{data.feedbackType}</span>]) }
    if (data.nomineeName) fields.push(['NOMINEE', `${data.nomineeRank ? data.nomineeRank + ' ' : ''}${data.nomineeName}`])
    if (data.nominatorName) fields.push(['NOMINATED BY', data.nominatorName])
    if (data.supportingMembers?.length) fields.push(['SUPPORTING MEMBERS', data.supportingMembers.join(', ')])
    if (data.awardType) fields.push(['AWARD TYPE', data.awardType])
    if (data.awardCategory) fields.push(['AWARD CATEGORY', `${data.awardCategory}${data.awardCategoryOther ? ` — ${data.awardCategoryOther}` : ''}`])
    if (data.awardRequirements) fields.push(['REQUIREMENTS', data.awardRequirements])
    if (data.awardDesignRef) fields.push(['DESIGN REF', data.awardDesignRef])
    if (data.awardDesignNotes) fields.push(['DESIGN NOTES', data.awardDesignNotes])
    if (data.membersInvolved?.length) fields.push(['MEMBERS INVOLVED', data.membersInvolved.join(', ')])
    if (data.membersInvolvedNotListed) fields.push(['ADDITIONAL DETAILS', data.membersInvolvedNotListed])
    if (data.complainantName && !data.complainantAnonymous) fields.push(['COMPLAINANT', data.complainantName])
    if (data.desiredOutcome) fields.push(['DESIRED OUTCOME', data.desiredOutcome])
    if (data.otherComments) fields.push(['OTHER COMMENTS', data.otherComments])

    if (fields.length === 0 && !data.campaignPhases?.length) return null

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
            {data.campaignPhases && data.campaignPhases.length > 0 && (
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
