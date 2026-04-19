'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    BugReport, Lightbulb, ThumbUp, ThumbUpOutlined, ArrowBack, Delete, Send,
} from '@mui/icons-material'
import { CircularProgress } from '@mui/material'

type Status = 'open' | 'in_progress' | 'priority' | 'investigating' | 'fixed' | 'implemented' | 'wont_fix'

interface DetailData extends Omit<Feedback, '_id'> {
    _id: string
    comments: (Omit<FeedbackComment, '_id' | 'feedbackId'> & { _id: string; feedbackId: string })[]
    isJ4: boolean
    myId: string
}

const STATUS_LABELS: Record<Status, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    priority: 'Priority',
    investigating: 'Investigating',
    fixed: 'Fixed',
    implemented: 'Implemented',
    wont_fix: "Won't Fix",
}

const STATUS_COLOURS: Record<Status, string> = {
    open: 'rgba(237,237,237,0.55)',
    in_progress: 'rgba(0,195,255,0.85)',
    priority: 'rgba(255,160,0,0.85)',
    investigating: 'rgba(167,139,250,0.9)',
    fixed: 'rgba(74,222,128,0.85)',
    implemented: 'rgba(74,222,128,0.85)',
    wont_fix: 'rgba(219,0,29,0.75)',
}

const STATUS_BG: Record<Status, string> = {
    open: 'rgba(255,255,255,0.02)',
    in_progress: 'rgba(0,195,255,0.05)',
    priority: 'rgba(255,160,0,0.06)',
    investigating: 'rgba(167,139,250,0.06)',
    fixed: 'rgba(74,222,128,0.05)',
    implemented: 'rgba(74,222,128,0.05)',
    wont_fix: 'rgba(219,0,29,0.05)',
}

const ALL_STATUSES: Status[] = ['open', 'in_progress', 'priority', 'investigating', 'fixed', 'implemented', 'wont_fix']

function avatarUrl(authorId: string, authorAvatarId?: string): string {
    if (authorAvatarId) {
        return `https://cdn.discordapp.com/avatars/${authorId}/${authorAvatarId}.png?size=40`
    }
    try {
        return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(authorId) % BigInt(6))}.png`
    } catch {
        return `https://cdn.discordapp.com/embed/avatars/0.png`
    }
}

function formatDate(d: string | Date) {
    return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}
function formatDateTime(d: string | Date) {
    return new Date(d).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}


export default function FeedbackDetailPage() {
    const params = useParams()
    const router = useRouter()
    const id = params.id as string

    const [data, setData] = useState<DetailData | null>(null)
    const [loading, setLoading] = useState(true)
    const [voting, setVoting] = useState(false)
    const [voted, setVoted] = useState(false)
    const [upvoteCount, setUpvoteCount] = useState(0)
    const [statusUpdating, setStatusUpdating] = useState(false)
    const [comment, setComment] = useState('')
    const [posting, setPosting] = useState(false)
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [avatarErr, setAvatarErr] = useState(false)

    const load = useCallback(() => {
        setLoading(true)
        fetch(`/api/feedback/${id}`)
            .then(r => r.json())
            .then((d: DetailData) => {
                setData(d)
                setVoted(d.upvotes?.includes(d.myId) ?? false)
                setUpvoteCount(d.upvoteCount ?? 0)
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [id])

    useEffect(() => { load() }, [load])

    async function handleVote() {
        if (voting) return
        setVoting(true)
        const wasVoted = voted
        setVoted(!wasVoted)
        setUpvoteCount(c => wasVoted ? c - 1 : c + 1)
        const res = await fetch(`/api/feedback/${id}/vote`, { method: 'POST' })
        const json = await res.json()
        setVoted(json.voted)
        setUpvoteCount(json.upvoteCount)
        setVoting(false)
    }

    async function handleStatus(status: string) {
        setStatusUpdating(true)
        await fetch(`/api/feedback/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        })
        setData(d => d ? { ...d, status: status as Status } : d)
        setStatusUpdating(false)
    }

    async function handleComment(e: React.FormEvent) {
        e.preventDefault()
        if (!comment.trim() || posting) return
        setPosting(true)
        const res = await fetch(`/api/feedback/${id}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: comment.trim() }),
        })
        const newComment = await res.json()
        setData(d => d ? { ...d, comments: [...d.comments, newComment], commentCount: d.commentCount + 1 } : d)
        setComment('')
        setPosting(false)
    }

    async function handleDelete() {
        if (!confirm('Delete this submission? This cannot be undone.')) return
        setDeleting(true)
        await fetch(`/api/feedback/${id}`, { method: 'DELETE' })
        router.push('/feedback')
    }

    if (loading) return (
        <div className='flex justify-center py-20'><CircularProgress size={24} style={{ color: 'rgba(219,0,29,0.6)' }} /></div>
    )

    if (!data || (data as any).error) return (
        <div style={{ color: 'rgba(237,237,237,0.4)', textAlign: 'center', padding: '48px 0', fontSize: '0.85rem' }}>
            Submission not found.{' '}
            <Link href='/feedback' style={{ color: 'rgba(219,0,29,0.7)', textDecoration: 'none' }}>Go back</Link>
        </div>
    )

    const canDelete = data.isJ4 || data.authorId === data.myId
    const status = data.status as Status
    const statusCol = STATUS_COLOURS[status]

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Back */}
            <Link href='/feedback'>
                <button style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'transparent', border: 'none',
                    color: 'rgba(237,237,237,0.35)', cursor: 'pointer',
                    fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', padding: 0,
                }}>
                    <ArrowBack style={{ fontSize: 14 }} /> BACK TO FEEDBACK
                </button>
            </Link>

            {/* Two-column layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, alignItems: 'start' }}>

                {/* ── MAIN CONTENT ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

                    {/* Submission card */}
                    <div style={{
                        borderLeft: `3px solid ${statusCol}`,
                        background: STATUS_BG[status],
                        border: `1px solid rgba(255,255,255,0.07)`,
                        borderLeft: `3px solid ${statusCol}`,
                    }}>
                        {/* Card top bar */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 14px',
                            background: 'rgba(0,0,0,0.25)',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            {/* Type badge */}
                            <span style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em',
                                color: data.type === 'bug' ? 'rgba(219,0,29,0.8)' : 'rgba(255,160,0,0.8)',
                                border: `1px solid ${data.type === 'bug' ? 'rgba(219,0,29,0.25)' : 'rgba(255,160,0,0.25)'}`,
                                background: data.type === 'bug' ? 'rgba(219,0,29,0.07)' : 'rgba(255,160,0,0.07)',
                                padding: '2px 7px',
                            }}>
                                {data.type === 'bug' ? <><BugReport style={{ fontSize: 9 }} /> BUG REPORT</> : <><Lightbulb style={{ fontSize: 9 }} /> FEATURE REQUEST</>}
                            </span>

                            {/* Status badge */}
                            <span style={{
                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em',
                                color: statusCol,
                                border: `1px solid ${statusCol}44`,
                                background: STATUS_BG[status],
                                padding: '2px 7px',
                            }}>
                                {STATUS_LABELS[status].toUpperCase()}
                            </span>

                            <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '0.6rem', color: 'rgba(237,237,237,0.2)' }}>
                                {formatDate(data.createdAt)}
                            </span>

                            {canDelete && (
                                <button onClick={handleDelete} disabled={deleting} style={{
                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                    color: 'rgba(219,0,29,0.35)', display: 'flex', padding: 0,
                                    transition: 'color 0.15s',
                                }}>
                                    {deleting ? <CircularProgress size={12} style={{ color: 'rgba(219,0,29,0.5)' }} /> : <Delete style={{ fontSize: 15 }} />}
                                </button>
                            )}
                        </div>

                        {/* Title + author */}
                        <div style={{ padding: '16px 18px 12px' }}>
                            <h1 style={{
                                fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.04em',
                                color: 'var(--foreground)', margin: 0, lineHeight: 1.3,
                            }}>
                                {data.title}
                            </h1>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                                {!avatarErr ? (
                                    <img
                                        src={avatarUrl(data.authorId, data.authorAvatarId)}
                                        alt={data.authorName}
                                        onError={() => setAvatarErr(true)}
                                        style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}
                                    />
                                ) : (
                                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'rgba(237,237,237,0.6)', fontWeight: 700, flexShrink: 0 }}>
                                        {data.authorName.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)', letterSpacing: '0.03em' }}>
                                    {data.authorName}
                                </span>
                                {data.updatedAt !== data.createdAt && (
                                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)', fontFamily: 'monospace' }}>
                                        · updated {formatDate(data.updatedAt)}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Divider */}
                        <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 18px' }} />

                        {/* Description */}
                        <div style={{ padding: '16px 18px' }}>
                            <pre style={{
                                fontFamily: 'inherit', fontSize: '0.875rem',
                                color: 'rgba(237,237,237,0.75)', whiteSpace: 'pre-wrap',
                                lineHeight: 1.75, margin: 0,
                            }}>
                                {data.description}
                            </pre>
                        </div>

                        {/* Attachments */}
                        {data.attachments?.length > 0 && (
                            <div style={{ padding: '0 18px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                <div style={{ width: '100%', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.2)', marginBottom: 4 }}>
                                    ATTACHMENTS [{data.attachments.length}]
                                </div>
                                {data.attachments.map(f => (
                                    <img
                                        key={f}
                                        src={`/api/uploads/feedback?id=${data._id}&file=${encodeURIComponent(f)}`}
                                        alt={f}
                                        onClick={() => setLightboxSrc(`/api/uploads/feedback?id=${data._id}&file=${encodeURIComponent(f)}`)}
                                        style={{ height: 90, border: '1px solid rgba(255,255,255,0.07)', objectFit: 'cover', cursor: 'zoom-in' }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── COMMENTS ── */}
                    <div style={{ marginTop: 24 }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            marginBottom: 12,
                            paddingBottom: 10,
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.3)' }}>
                                COMMENTS
                            </span>
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
                                <div key={c._id.toString()} style={{
                                    borderLeft: '2px solid rgba(255,255,255,0.08)',
                                    background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    borderLeft: '2px solid rgba(255,255,255,0.1)',
                                }}>
                                    {/* Comment header */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '7px 14px',
                                        background: 'rgba(0,0,0,0.15)',
                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(237,237,237,0.7)' }}>
                                            {c.authorName}
                                        </span>
                                        <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '0.6rem', color: 'rgba(237,237,237,0.2)' }}>
                                            {formatDateTime(c.createdAt)}
                                        </span>
                                    </div>
                                    {/* Comment body */}
                                    <div style={{ padding: '10px 14px' }}>
                                        <pre style={{
                                            fontFamily: 'inherit', fontSize: '0.85rem',
                                            color: 'rgba(237,237,237,0.7)', whiteSpace: 'pre-wrap',
                                            margin: 0, lineHeight: 1.65,
                                        }}>
                                            {c.content}
                                        </pre>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* New comment form */}
                        <form onSubmit={handleComment} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 0 }}>
                            <div style={{
                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em',
                                color: 'rgba(237,237,237,0.25)', marginBottom: 8,
                            }}>
                                ADD COMMENT
                            </div>
                            <textarea
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                placeholder='Write your comment…'
                                rows={4}
                                style={{
                                    width: '100%', padding: '10px 12px', resize: 'vertical',
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderBottom: '1px solid rgba(255,255,255,0.12)',
                                    color: 'rgba(237,237,237,0.85)', fontSize: '0.875rem',
                                    outline: 'none', boxSizing: 'border-box', borderRadius: 0,
                                    fontFamily: 'inherit', lineHeight: 1.65,
                                }}
                            />
                            <div style={{
                                display: 'flex', justifyContent: 'flex-end',
                                padding: '10px 14px',
                                background: 'rgba(0,0,0,0.2)',
                                border: '1px solid rgba(219,0,29,0.15)',
                                borderTop: '2px solid rgba(219,0,29,0.35)',
                            }}>
                                <button
                                    type='submit'
                                    disabled={posting || !comment.trim()}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 7,
                                        padding: '8px 22px',
                                        background: posting || !comment.trim() ? 'rgba(219,0,29,0.05)' : 'rgba(219,0,29,0.12)',
                                        border: '1px solid rgba(219,0,29,0.4)',
                                        color: 'rgba(219,0,29,0.9)', fontSize: '0.72rem', fontWeight: 800,
                                        letterSpacing: '0.12em', cursor: posting || !comment.trim() ? 'not-allowed' : 'pointer',
                                        opacity: posting || !comment.trim() ? 0.5 : 1,
                                        borderRadius: 0,
                                    }}
                                >
                                    {posting ? <CircularProgress size={11} style={{ color: 'rgba(219,0,29,0.7)' }} /> : <Send style={{ fontSize: 13 }} />}
                                    POST COMMENT
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* ── SIDEBAR ── */}
                <aside style={{ display: 'flex', flexDirection: 'column', gap: 1, position: 'sticky', top: 24 }}>

                    {/* Branding */}
                    <div style={{
                        background: 'rgba(219,0,29,0.07)', border: '1px solid rgba(219,0,29,0.2)',
                        padding: '12px 14px', marginBottom: 8,
                    }}>
                        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.55)', marginBottom: 3 }}>
                            ASOT // PORTAL
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--foreground)' }}>
                            SUBMISSION DETAIL
                        </div>
                    </div>

                    {/* Vote */}
                    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12, marginBottom: 4 }}>
                        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.2)', marginBottom: 8, paddingLeft: 2 }}>
                            UPVOTES
                        </div>
                        <button
                            onClick={handleVote}
                            disabled={voting}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                padding: '9px 12px',
                                background: voted ? 'rgba(0,195,255,0.07)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${voted ? 'rgba(0,195,255,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                borderLeft: `3px solid ${voted ? 'rgba(0,195,255,0.7)' : 'rgba(255,255,255,0.12)'}`,
                                color: voted ? 'rgba(0,195,255,0.9)' : 'rgba(237,237,237,0.45)',
                                cursor: voting ? 'not-allowed' : 'pointer',
                                fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em',
                                transition: 'all 0.12s',
                            }}
                        >
                            {voted ? <ThumbUp style={{ fontSize: 14 }} /> : <ThumbUpOutlined style={{ fontSize: 14 }} />}
                            {voted ? 'UPVOTED' : 'UPVOTE'}
                            <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '0.7rem', color: voted ? 'rgba(0,195,255,0.7)' : 'rgba(237,237,237,0.3)' }}>
                                [{upvoteCount}]
                            </span>
                        </button>
                    </div>

                    {/* Status control (J4 only) */}
                    {data.isJ4 && (
                        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12, marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.2)', marginBottom: 8, paddingLeft: 2 }}>
                                STATUS
                                {statusUpdating && <CircularProgress size={10} style={{ color: 'rgba(237,237,237,0.3)' }} />}
                            </div>
                            <select
                                value={status}
                                onChange={e => handleStatus(e.target.value)}
                                disabled={statusUpdating}
                                style={{
                                    width: '100%',
                                    background: STATUS_BG[status],
                                    border: `1px solid ${statusCol}44`,
                                    borderLeft: `3px solid ${statusCol}`,
                                    color: statusCol, fontSize: '0.75rem',
                                    fontWeight: 700, letterSpacing: '0.06em',
                                    padding: '8px 10px', cursor: 'pointer', outline: 'none',
                                    borderRadius: 0, fontFamily: 'inherit',
                                }}
                            >
                                {ALL_STATUSES.map(s => (
                                    <option key={s} value={s} style={{ background: '#0a0a0a', color: STATUS_COLOURS[s] }}>
                                        {STATUS_LABELS[s]}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Metadata */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {[
                            ['AUTHOR', data.authorName],
                            ['SUBMITTED', formatDate(data.createdAt)],
                            ['COMMENTS', String(data.comments.length).padStart(2, '0')],
                        ].map(([label, value]) => (
                            <div key={label} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '7px 10px',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                            }}>
                                <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.2)' }}>
                                    {label}
                                </span>
                                <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.5)', fontFamily: label === 'SUBMITTED' || label === 'COMMENTS' ? 'monospace' : 'inherit' }}>
                                    {value}
                                </span>
                            </div>
                        ))}
                    </div>

                </aside>
            </div>

            {/* Lightbox */}
            {lightboxSrc && (
                <div
                    onClick={() => setLightboxSrc(null)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'zoom-out' }}
                >
                    <img src={lightboxSrc} alt='' style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }} />
                </div>
            )}
        </div>
    )
}
