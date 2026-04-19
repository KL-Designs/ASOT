'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { BugReport, Lightbulb, ThumbUp, Comment, Add, KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material'
import { CircularProgress } from '@mui/material'

type FeedbackItem = Feedback & { _id: string }
type SortMode = 'votes' | 'newest' | 'oldest'

const STATUS_LABELS: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    priority: 'Priority',
    investigating: 'Investigating',
    fixed: 'Fixed',
    implemented: 'Implemented',
    wont_fix: "Won't Fix",
}

const STATUS_COLOURS: Record<string, string> = {
    open: 'rgba(237,237,237,0.55)',
    in_progress: 'rgba(0,195,255,0.85)',
    priority: 'rgba(255,160,0,0.85)',
    investigating: 'rgba(167,139,250,0.9)',
    fixed: 'rgba(74,222,128,0.85)',
    implemented: 'rgba(74,222,128,0.85)',
    wont_fix: 'rgba(219,0,29,0.75)',
}

const STATUS_BG: Record<string, string> = {
    open: 'rgba(255,255,255,0.03)',
    in_progress: 'rgba(0,195,255,0.06)',
    priority: 'rgba(255,160,0,0.07)',
    investigating: 'rgba(167,139,250,0.07)',
    fixed: 'rgba(74,222,128,0.06)',
    implemented: 'rgba(74,222,128,0.06)',
    wont_fix: 'rgba(219,0,29,0.06)',
}

const STATUS_BORDER: Record<string, string> = {
    open: 'rgba(255,255,255,0.07)',
    in_progress: 'rgba(0,195,255,0.25)',
    priority: 'rgba(255,160,0,0.25)',
    investigating: 'rgba(167,139,250,0.3)',
    fixed: 'rgba(74,222,128,0.2)',
    implemented: 'rgba(74,222,128,0.2)',
    wont_fix: 'rgba(219,0,29,0.2)',
}

const TYPE_FILTERS = [
    { value: 'all', label: 'All Types' },
    { value: 'bug', label: 'Bugs' },
    { value: 'feature', label: 'Feature Requests' },
]

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
    { value: 'votes', label: 'Most Voted' },
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
]

function sortItems(items: FeedbackItem[], mode: SortMode): FeedbackItem[] {
    return [...items].sort((a, b) => {
        if (mode === 'votes') return (b.upvoteCount - a.upvoteCount) || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        if (mode === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
}

function avatarUrl(item: FeedbackItem): string {
    if (item.authorAvatarId) {
        return `https://cdn.discordapp.com/avatars/${item.authorId}/${item.authorAvatarId}.png?size=32`
    }
    return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(item.authorId) % 6n)}.png`
}


export default function FeedbackPage() {
    const [items, setItems] = useState<FeedbackItem[]>([])
    const [loading, setLoading] = useState(true)
    const [typeFilter, setTypeFilter] = useState('all')
    const [sort, setSort] = useState<SortMode>('votes')
    const [resolvedOpen, setResolvedOpen] = useState(false)

    useEffect(() => {
        const params = new URLSearchParams()
        if (typeFilter !== 'all') params.set('type', typeFilter)
        setLoading(true)
        fetch(`/api/feedback?${params}`)
            .then(r => r.json())
            .then(data => { setItems(data); setLoading(false) })
            .catch(() => setLoading(false))
    }, [typeFilter])

    const grouped = useMemo(() => {
        const investigating = sortItems(items.filter(i => i.status === 'investigating'), sort)
        const inProgress = sortItems(items.filter(i => i.status === 'in_progress'), sort)
        const priority = sortItems(items.filter(i => i.status === 'priority'), sort)
        const open = sortItems(items.filter(i => i.status === 'open'), sort)
        const resolved = sortItems(items.filter(i => ['fixed', 'implemented', 'wont_fix'].includes(i.status)), sort)
        return { investigating, inProgress, priority, open, resolved }
    }, [items, sort])

    return (
        <div className='flex flex-col gap-6'>

            {/* Header */}
            <div className='flex items-start justify-between gap-4 flex-wrap'>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--foreground)', marginBottom: 4 }}>
                        FEEDBACK
                    </h1>
                    <p style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.45)', letterSpacing: '0.04em' }}>
                        Report website bugs and suggest improvements. This board is for the website only.
                    </p>
                </div>
                <Link href='/feedback/new'>
                    <button style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.4)',
                        color: 'rgba(219,0,29,0.9)', borderRadius: 6, padding: '8px 16px',
                        fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.08em', cursor: 'pointer',
                    }}>
                        <Add style={{ fontSize: 16 }} /> SUBMIT
                    </button>
                </Link>
            </div>

            {/* Controls */}
            <div className='flex flex-wrap items-center gap-3 justify-between'>
                <div className='flex flex-wrap gap-2'>
                    {TYPE_FILTERS.map(f => (
                        <button key={f.value} onClick={() => setTypeFilter(f.value)} style={{
                            padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
                            letterSpacing: '0.05em', cursor: 'pointer', border: '1px solid',
                            background: typeFilter === f.value ? 'rgba(219,0,29,0.15)' : 'transparent',
                            borderColor: typeFilter === f.value ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.1)',
                            color: typeFilter === f.value ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.5)',
                        }}>{f.label}</button>
                    ))}
                </div>
                <div className='flex items-center gap-2'>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(237,237,237,0.3)' }}>SORT</span>
                    {SORT_OPTIONS.map(s => (
                        <button key={s.value} onClick={() => setSort(s.value)} style={{
                            padding: '4px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600,
                            letterSpacing: '0.04em', cursor: 'pointer', border: '1px solid',
                            background: sort === s.value ? 'rgba(255,255,255,0.08)' : 'transparent',
                            borderColor: sort === s.value ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)',
                            color: sort === s.value ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.35)',
                        }}>{s.label}</button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className='flex justify-center py-12'><CircularProgress size={28} style={{ color: 'rgba(219,0,29,0.7)' }} /></div>
            ) : (
                <div className='flex flex-col gap-6'>

                    {/* Investigating */}
                    {grouped.investigating.length > 0 && (
                        <StatusSection
                            status='investigating'
                            label='Investigating'
                            items={grouped.investigating}
                            description='Being looked into by the team'
                        />
                    )}

                    {/* In Progress */}
                    {grouped.inProgress.length > 0 && (
                        <StatusSection
                            status='in_progress'
                            label='In Progress'
                            items={grouped.inProgress}
                            description='Actively being worked on'
                        />
                    )}

                    {/* Priority */}
                    {grouped.priority.length > 0 && (
                        <StatusSection
                            status='priority'
                            label='Priority'
                            items={grouped.priority}
                            description='Flagged for urgent attention'
                        />
                    )}

                    {/* Open */}
                    <StatusSection
                        status='open'
                        label='Open'
                        items={grouped.open}
                        description='Pending review — upvote what matters to you'
                    />

                    {/* Resolved toggle */}
                    {grouped.resolved.length > 0 && (
                        <div>
                            <button
                                onClick={() => setResolvedOpen(v => !v)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                                    borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
                                    color: 'rgba(237,237,237,0.4)', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em',
                                }}
                            >
                                {resolvedOpen ? <KeyboardArrowUp style={{ fontSize: 18 }} /> : <KeyboardArrowDown style={{ fontSize: 18 }} />}
                                RESOLVED ({grouped.resolved.length})
                                <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                                    Fixed · Implemented · Won&apos;t Fix
                                </span>
                            </button>
                            {resolvedOpen && (
                                <div style={{ marginTop: 12 }} className='flex flex-col gap-3'>
                                    {grouped.resolved.map(item => (
                                        <FeedbackCard key={item._id.toString()} item={item} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                </div>
            )}
        </div>
    )
}


function StatusSection({
    status, label, items, description,
}: {
    status: string
    label: string
    items: FeedbackItem[]
    description: string
}) {
    if (items.length === 0 && status === 'open') {
        return (
            <div>
                <SectionHeader status={status} label={label} count={0} description={description} />
                <div style={{ textAlign: 'center', color: 'rgba(237,237,237,0.3)', padding: '32px 0', fontSize: '0.88rem' }}>
                    No open submissions yet.
                </div>
            </div>
        )
    }

    return (
        <div>
            <SectionHeader status={status} label={label} count={items.length} description={description} />
            <div className='flex flex-col gap-3' style={{ marginTop: 10 }}>
                {items.map(item => <FeedbackCard key={item._id.toString()} item={item} />)}
            </div>
        </div>
    )
}

function SectionHeader({ status, label, count, description }: { status: string; label: string; count: number; description: string }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2,
            borderLeft: `3px solid ${STATUS_COLOURS[status]}`,
            paddingLeft: 10,
        }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.1em', color: STATUS_COLOURS[status] }}>
                {label.toUpperCase()}
            </span>
            <span style={{
                fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                background: STATUS_BG[status], border: `1px solid ${STATUS_BORDER[status]}`,
                color: STATUS_COLOURS[status],
            }}>
                {count}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.03em' }}>
                {description}
            </span>
        </div>
    )
}

function FeedbackCard({ item }: { item: FeedbackItem }) {
    const [imgErr, setImgErr] = useState(false)

    return (
        <Link href={`/feedback/${item._id}`}>
            <div style={{
                background: STATUS_BG[item.status] ?? 'rgba(255,255,255,0.02)',
                border: `1px solid ${STATUS_BORDER[item.status] ?? 'rgba(255,255,255,0.07)'}`,
                borderRadius: 8, padding: '12px 14px', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
            }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = STATUS_COLOURS[item.status] ?? 'rgba(255,255,255,0.15)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = STATUS_BORDER[item.status] ?? 'rgba(255,255,255,0.07)' }}
            >
                <div className='flex items-start gap-3'>
                    {/* Author avatar */}
                    <div style={{ flexShrink: 0, paddingTop: 2 }}>
                        {!imgErr ? (
                            <img
                                src={avatarUrl(item)}
                                alt={item.authorName}
                                onError={() => setImgErr(true)}
                                style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.08)' }}
                            />
                        ) : (
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(237,237,237,0.5)', fontWeight: 700 }}>
                                {item.authorName.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>

                    <div className='flex-1 min-w-0'>
                        {/* Title + badges */}
                        <div className='flex items-center gap-2 flex-wrap mb-1'>
                            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'rgba(237,237,237,0.92)' }}>
                                {item.title}
                            </span>
                            <span style={{
                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em', padding: '2px 6px',
                                borderRadius: 4, border: '1px solid',
                                color: item.type === 'bug' ? 'rgba(219,0,29,0.8)' : 'rgba(255,160,0,0.8)',
                                borderColor: item.type === 'bug' ? 'rgba(219,0,29,0.3)' : 'rgba(255,160,0,0.3)',
                                background: item.type === 'bug' ? 'rgba(219,0,29,0.07)' : 'rgba(255,160,0,0.07)',
                                display: 'flex', alignItems: 'center', gap: 3,
                            }}>
                                {item.type === 'bug'
                                    ? <><BugReport style={{ fontSize: 10 }} /> BUG</>
                                    : <><Lightbulb style={{ fontSize: 10 }} /> FEATURE</>}
                            </span>
                            <span style={{
                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', padding: '2px 6px',
                                borderRadius: 4, border: `1px solid ${STATUS_BORDER[item.status]}`,
                                color: STATUS_COLOURS[item.status],
                                background: STATUS_BG[item.status],
                            }}>
                                {STATUS_LABELS[item.status] ?? item.status}
                            </span>
                        </div>

                        {/* Description */}
                        <p style={{
                            fontSize: '0.78rem', color: 'rgba(237,237,237,0.4)', overflow: 'hidden',
                            whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%', marginBottom: 6,
                        }}>
                            {item.description}
                        </p>

                        {/* Meta row */}
                        <div className='flex items-center gap-4 flex-wrap'>
                            <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)' }}>
                                {item.authorName} · {new Date(item.createdAt).toLocaleDateString()}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)' }}>
                                <ThumbUp style={{ fontSize: 12 }} /> {item.upvoteCount}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)' }}>
                                <Comment style={{ fontSize: 12 }} /> {item.commentCount}
                            </span>
                            {item.attachments?.length > 0 && (
                                <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)' }}>
                                    📎 {item.attachments.length}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    )
}
