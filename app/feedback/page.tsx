'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { BugReport, Lightbulb, ThumbUp, Comment, Add } from '@mui/icons-material'
import { CircularProgress } from '@mui/material'

type FeedbackItem = Feedback & { _id: string }

const STATUS_LABELS: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    priority: 'Priority',
    fixed: 'Fixed',
    implemented: 'Implemented',
    wont_fix: "Won't Fix",
}

const STATUS_COLOURS: Record<string, string> = {
    open: 'rgba(237,237,237,0.5)',
    in_progress: 'rgba(0,195,255,0.8)',
    priority: 'rgba(255,160,0,0.8)',
    fixed: 'rgba(80,200,80,0.8)',
    implemented: 'rgba(80,200,80,0.8)',
    wont_fix: 'rgba(219,0,29,0.7)',
}

const FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'priority', label: 'Priority' },
    { value: 'fixed', label: 'Fixed' },
    { value: 'implemented', label: 'Implemented' },
    { value: 'wont_fix', label: "Won't Fix" },
]

const TYPE_FILTERS = [
    { value: 'all', label: 'All Types' },
    { value: 'bug', label: 'Bugs' },
    { value: 'feature', label: 'Feature Requests' },
]


export default function FeedbackPage() {
    const [items, setItems] = useState<FeedbackItem[]>([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState('all')
    const [typeFilter, setTypeFilter] = useState('all')

    useEffect(() => {
        const params = new URLSearchParams()
        if (statusFilter !== 'all') params.set('status', statusFilter)
        if (typeFilter !== 'all') params.set('type', typeFilter)
        setLoading(true)
        fetch(`/api/feedback?${params}`)
            .then(r => r.json())
            .then(data => { setItems(data); setLoading(false) })
            .catch(() => setLoading(false))
    }, [statusFilter, typeFilter])

    return (
        <div className='flex flex-col gap-6'>

            {/* Header */}
            <div className='flex items-start justify-between gap-4 flex-wrap'>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--foreground)', marginBottom: 4 }}>
                        FEEDBACK
                    </h1>
                    <p style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.45)', letterSpacing: '0.04em' }}>
                        Report bugs and request features. Upvote items you care about.
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

            {/* Filters */}
            <div className='flex flex-col gap-3'>
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
                <div className='flex flex-wrap gap-2'>
                    {FILTERS.map(f => (
                        <button key={f.value} onClick={() => setStatusFilter(f.value)} style={{
                            padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
                            letterSpacing: '0.05em', cursor: 'pointer', border: '1px solid',
                            background: statusFilter === f.value ? 'rgba(255,255,255,0.08)' : 'transparent',
                            borderColor: statusFilter === f.value ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                            color: statusFilter === f.value ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.4)',
                        }}>{f.label}</button>
                    ))}
                </div>
            </div>

            {/* List */}
            {loading ? (
                <div className='flex justify-center py-12'><CircularProgress size={28} style={{ color: 'rgba(219,0,29,0.7)' }} /></div>
            ) : items.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'rgba(237,237,237,0.3)', padding: '48px 0', fontSize: '0.9rem' }}>
                    No items found.
                </div>
            ) : (
                <div className='flex flex-col gap-3'>
                    {items.map(item => (
                        <FeedbackCard key={item._id.toString()} item={item} />
                    ))}
                </div>
            )}
        </div>
    )
}


function FeedbackCard({ item }: { item: FeedbackItem }) {
    return (
        <Link href={`/feedback/${item._id}`}>
            <div style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8, padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s',
            }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
            >
                <div className='flex items-start gap-3'>
                    {/* Type icon */}
                    <div style={{ paddingTop: 2, opacity: 0.6 }}>
                        {item.type === 'bug'
                            ? <BugReport style={{ fontSize: 18, color: 'rgba(219,0,29,0.8)' }} />
                            : <Lightbulb style={{ fontSize: 18, color: 'rgba(255,160,0,0.8)' }} />}
                    </div>

                    <div className='flex-1 min-w-0'>
                        <div className='flex items-center gap-2 flex-wrap mb-1'>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'rgba(237,237,237,0.9)' }}>
                                {item.title}
                            </span>
                            <span style={{
                                fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em', padding: '2px 7px',
                                borderRadius: 4, border: '1px solid',
                                color: item.type === 'bug' ? 'rgba(219,0,29,0.8)' : 'rgba(255,160,0,0.8)',
                                borderColor: item.type === 'bug' ? 'rgba(219,0,29,0.3)' : 'rgba(255,160,0,0.3)',
                                background: item.type === 'bug' ? 'rgba(219,0,29,0.06)' : 'rgba(255,160,0,0.06)',
                            }}>
                                {item.type === 'bug' ? 'BUG' : 'FEATURE REQUEST'}
                            </span>
                            <span style={{
                                fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em', padding: '2px 7px',
                                borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)',
                                color: STATUS_COLOURS[item.status] ?? 'rgba(237,237,237,0.5)',
                                background: 'rgba(255,255,255,0.03)',
                            }}>
                                {STATUS_LABELS[item.status] ?? item.status}
                            </span>
                        </div>

                        <p style={{
                            fontSize: '0.8rem', color: 'rgba(237,237,237,0.4)', overflow: 'hidden',
                            whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%',
                        }}>
                            {item.description}
                        </p>

                        <div className='flex items-center gap-4 mt-2'>
                            <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.3)' }}>
                                {item.authorName} · {new Date(item.createdAt).toLocaleDateString()}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)' }}>
                                <ThumbUp style={{ fontSize: 13 }} /> {item.upvoteCount}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)' }}>
                                <Comment style={{ fontSize: 13 }} /> {item.commentCount}
                            </span>
                            {item.attachments?.length > 0 && (
                                <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.3)' }}>
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
