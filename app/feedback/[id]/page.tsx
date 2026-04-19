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
    open: 'rgba(255,255,255,0.03)',
    in_progress: 'rgba(0,195,255,0.06)',
    priority: 'rgba(255,160,0,0.07)',
    investigating: 'rgba(167,139,250,0.07)',
    fixed: 'rgba(74,222,128,0.06)',
    implemented: 'rgba(74,222,128,0.06)',
    wont_fix: 'rgba(219,0,29,0.06)',
}

const ALL_STATUSES: Status[] = ['open', 'in_progress', 'priority', 'investigating', 'fixed', 'implemented', 'wont_fix']

function avatarUrl(authorId: string, authorAvatarId?: string): string {
    if (authorAvatarId) {
        return `https://cdn.discordapp.com/avatars/${authorId}/${authorAvatarId}.png?size=40`
    }
    try {
        return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(authorId) % 6n)}.png`
    } catch {
        return `https://cdn.discordapp.com/embed/avatars/0.png`
    }
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
        <div className='flex justify-center py-20'><CircularProgress size={28} style={{ color: 'rgba(219,0,29,0.7)' }} /></div>
    )

    if (!data || (data as any).error) return (
        <div style={{ color: 'rgba(237,237,237,0.4)', textAlign: 'center', padding: '48px 0' }}>
            Submission not found. <Link href='/feedback' style={{ color: 'rgba(219,0,29,0.7)' }}>Go back</Link>
        </div>
    )

    const canDelete = data.isJ4 || data.authorId === data.myId
    const status = data.status as Status

    return (
        <div className='flex flex-col gap-6 max-w-3xl'>

            {/* Back */}
            <Link href='/feedback'>
                <button style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>
                    <ArrowBack style={{ fontSize: 16 }} /> Back to Feedback
                </button>
            </Link>

            {/* Main card */}
            <div style={{
                background: STATUS_BG[status],
                border: `1px solid ${STATUS_COLOURS[status]}33`,
                borderRadius: 10, padding: '20px 22px',
            }}>

                {/* Header row */}
                <div className='flex items-start gap-3 flex-wrap'>

                    {/* Author avatar */}
                    <div style={{ flexShrink: 0, paddingTop: 2 }}>
                        {!avatarErr ? (
                            <img
                                src={avatarUrl(data.authorId, data.authorAvatarId)}
                                alt={data.authorName}
                                onError={() => setAvatarErr(true)}
                                style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                        ) : (
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'rgba(237,237,237,0.6)', fontWeight: 700 }}>
                                {data.authorName.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>

                    <div className='flex-1 min-w-0'>
                        <div className='flex items-center gap-2 flex-wrap'>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em', padding: '2px 7px', borderRadius: 4, border: '1px solid', color: data.type === 'bug' ? 'rgba(219,0,29,0.8)' : 'rgba(255,160,0,0.8)', borderColor: data.type === 'bug' ? 'rgba(219,0,29,0.3)' : 'rgba(255,160,0,0.3)', background: data.type === 'bug' ? 'rgba(219,0,29,0.07)' : 'rgba(255,160,0,0.07)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                {data.type === 'bug' ? <><BugReport style={{ fontSize: 10 }} /> BUG</> : <><Lightbulb style={{ fontSize: 10 }} /> FEATURE REQUEST</>}
                            </span>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em', padding: '2px 7px', borderRadius: 4, border: `1px solid ${STATUS_COLOURS[status]}44`, color: STATUS_COLOURS[status], background: STATUS_BG[status] }}>
                                {STATUS_LABELS[status]}
                            </span>
                        </div>
                        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--foreground)', marginTop: 6, marginBottom: 2 }}>
                            {data.title}
                        </h1>
                        <p style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.35)' }}>
                            Submitted by {data.authorName} · {new Date(data.createdAt).toLocaleDateString()}
                            {data.updatedAt !== data.createdAt && ` · Updated ${new Date(data.updatedAt).toLocaleDateString()}`}
                        </p>
                    </div>

                    {canDelete && (
                        <button onClick={handleDelete} disabled={deleting} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(219,0,29,0.4)', display: 'flex', padding: 4 }}>
                            {deleting ? <CircularProgress size={14} /> : <Delete style={{ fontSize: 18 }} />}
                        </button>
                    )}
                </div>

                {/* Description */}
                <pre style={{ marginTop: 16, fontFamily: 'inherit', fontSize: '0.88rem', color: 'rgba(237,237,237,0.75)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                    {data.description}
                </pre>

                {/* Attachments */}
                {data.attachments?.length > 0 && (
                    <div className='flex flex-wrap gap-3 mt-4'>
                        {data.attachments.map(f => (
                            <img
                                key={f}
                                src={`/api/uploads/feedback?id=${data._id}&file=${encodeURIComponent(f)}`}
                                alt={f}
                                onClick={() => setLightboxSrc(`/api/uploads/feedback?id=${data._id}&file=${encodeURIComponent(f)}`)}
                                style={{ height: 100, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', objectFit: 'cover', cursor: 'zoom-in' }}
                            />
                        ))}
                    </div>
                )}

                {/* Actions row */}
                <div className='flex items-center gap-4 mt-5 flex-wrap'>
                    <button onClick={handleVote} disabled={voting} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6,
                        border: `1px solid ${voted ? 'rgba(0,195,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        background: voted ? 'rgba(0,195,255,0.08)' : 'rgba(255,255,255,0.02)',
                        color: voted ? 'rgba(0,195,255,0.9)' : 'rgba(237,237,237,0.5)',
                        cursor: voting ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 600,
                    }}>
                        {voted ? <ThumbUp style={{ fontSize: 16 }} /> : <ThumbUpOutlined style={{ fontSize: 16 }} />}
                        {upvoteCount} {upvoteCount === 1 ? 'vote' : 'votes'}
                    </button>

                    {/* J4 status control */}
                    {data.isJ4 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(237,237,237,0.35)' }}>STATUS</span>
                            <select
                                value={status}
                                onChange={e => handleStatus(e.target.value)}
                                disabled={statusUpdating}
                                style={{
                                    background: STATUS_BG[status], border: `1px solid ${STATUS_COLOURS[status]}55`,
                                    borderRadius: 5, color: STATUS_COLOURS[status], fontSize: '0.78rem',
                                    fontWeight: 600, padding: '5px 10px', cursor: 'pointer', outline: 'none',
                                }}
                            >
                                {ALL_STATUSES.map(s => (
                                    <option key={s} value={s} style={{ background: '#0a0a0a', color: STATUS_COLOURS[s] }}>
                                        {STATUS_LABELS[s]}
                                    </option>
                                ))}
                            </select>
                            {statusUpdating && <CircularProgress size={14} style={{ color: 'rgba(237,237,237,0.4)' }} />}
                        </div>
                    )}
                </div>
            </div>

            {/* Comments */}
            <div className='flex flex-col gap-4'>
                <h2 style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.4)' }}>
                    COMMENTS ({data.comments.length})
                </h2>

                {data.comments.map(c => (
                    <div key={c._id.toString()} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '12px 14px' }}>
                        <div className='flex items-center gap-2 mb-2'>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(237,237,237,0.75)' }}>{c.authorName}</span>
                            <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)' }}>
                                {new Date(c.createdAt).toLocaleDateString()} {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        <pre style={{ fontFamily: 'inherit', fontSize: '0.85rem', color: 'rgba(237,237,237,0.7)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>
                            {c.content}
                        </pre>
                    </div>
                ))}

                {/* New comment */}
                <form onSubmit={handleComment} className='flex flex-col gap-2'>
                    <textarea
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder='Add a comment…'
                        rows={3}
                        style={{
                            width: '100%', padding: '9px 12px', resize: 'vertical',
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 6, color: 'rgba(237,237,237,0.85)', fontSize: '0.88rem',
                            outline: 'none', boxSizing: 'border-box',
                        }}
                    />
                    <div className='flex justify-end'>
                        <button type='submit' disabled={posting || !comment.trim()} style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px',
                            background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.35)',
                            color: 'rgba(219,0,29,0.9)', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700,
                            letterSpacing: '0.07em', cursor: posting || !comment.trim() ? 'not-allowed' : 'pointer',
                            opacity: posting || !comment.trim() ? 0.5 : 1,
                        }}>
                            {posting ? <CircularProgress size={12} style={{ color: 'rgba(219,0,29,0.7)' }} /> : <Send style={{ fontSize: 14 }} />}
                            POST
                        </button>
                    </div>
                </form>
            </div>

            {/* Lightbox */}
            {lightboxSrc && (
                <div
                    onClick={() => setLightboxSrc(null)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'zoom-out' }}
                >
                    <img src={lightboxSrc} alt='' style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} />
                </div>
            )}
        </div>
    )
}
