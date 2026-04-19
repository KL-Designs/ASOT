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
    in_progress: 'rgba(0,195,255,0.9)',
    priority: 'rgba(255,160,0,0.9)',
    investigating: 'rgba(167,139,250,0.95)',
    fixed: 'rgba(74,222,128,0.85)',
    implemented: 'rgba(74,222,128,0.85)',
    wont_fix: 'rgba(219,0,29,0.8)',
}

const STATUS_BORDER_STRIP: Record<string, string> = {
    open: 'rgba(255,255,255,0.15)',
    in_progress: 'rgba(0,195,255,0.7)',
    priority: 'rgba(255,160,0,0.7)',
    investigating: 'rgba(167,139,250,0.8)',
    fixed: 'rgba(74,222,128,0.6)',
    implemented: 'rgba(74,222,128,0.6)',
    wont_fix: 'rgba(219,0,29,0.6)',
}

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
    try {
        return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(item.authorId) % BigInt(6))}.png`
    } catch {
        return `https://cdn.discordapp.com/embed/avatars/0.png`
    }
}


export default function FeedbackPage() {
    const [items, setItems] = useState<FeedbackItem[]>([])
    const [loading, setLoading] = useState(true)
    const [typeFilter, setTypeFilter] = useState<'all' | 'bug' | 'feature'>('all')
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

    const counts = useMemo(() => ({
        investigating: items.filter(i => i.status === 'investigating').length,
        in_progress: items.filter(i => i.status === 'in_progress').length,
        priority: items.filter(i => i.status === 'priority').length,
        open: items.filter(i => i.status === 'open').length,
        fixed: items.filter(i => i.status === 'fixed').length,
        implemented: items.filter(i => i.status === 'implemented').length,
        wont_fix: items.filter(i => i.status === 'wont_fix').length,
    }), [items])

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' }}>

            {/* ── SIDEBAR ── */}
            <aside style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 1 }}>

                {/* Header block */}
                <div style={{ background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.25)', padding: '14px 16px', marginBottom: 8 }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.6)', marginBottom: 4 }}>
                        ASOT // PORTAL
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--foreground)' }}>
                        FEEDBACK
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)', marginTop: 3, letterSpacing: '0.04em', lineHeight: 1.4 }}>
                        Website bugs &amp; improvements only
                    </div>
                </div>

                {/* Submit */}
                <Link href='/feedback/new' style={{ display: 'block', marginBottom: 16 }}>
                    <button style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.4)',
                        color: 'rgba(219,0,29,0.95)', padding: '9px 0',
                        fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.14em', cursor: 'pointer',
                    }}>
                        <Add style={{ fontSize: 14 }} /> SUBMIT REPORT
                    </button>
                </Link>

                {/* Type filter */}
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.25)', marginBottom: 6, paddingLeft: 2 }}>
                        TYPE
                    </div>
                    {(['all', 'bug', 'feature'] as const).map(t => (
                        <button key={t} onClick={() => setTypeFilter(t)} style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px',
                            background: typeFilter === t ? 'rgba(255,255,255,0.05)' : 'transparent',
                            border: 'none', borderLeft: `2px solid ${typeFilter === t ? 'rgba(219,0,29,0.7)' : 'transparent'}`,
                            color: typeFilter === t ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.35)',
                            fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', cursor: 'pointer', textAlign: 'left',
                        }}>
                            {t === 'bug' && <BugReport style={{ fontSize: 12, color: 'rgba(219,0,29,0.7)' }} />}
                            {t === 'feature' && <Lightbulb style={{ fontSize: 12, color: 'rgba(255,160,0,0.7)' }} />}
                            {t === 'all' ? 'All Reports' : t === 'bug' ? 'Bugs' : 'Feature Requests'}
                        </button>
                    ))}
                </div>

                {/* Sort */}
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.25)', marginBottom: 6, paddingLeft: 2 }}>
                        SORT BY
                    </div>
                    {SORT_OPTIONS.map(s => (
                        <button key={s.value} onClick={() => setSort(s.value)} style={{
                            display: 'block', width: '100%', padding: '7px 10px', textAlign: 'left',
                            background: sort === s.value ? 'rgba(255,255,255,0.05)' : 'transparent',
                            border: 'none', borderLeft: `2px solid ${sort === s.value ? 'rgba(255,255,255,0.3)' : 'transparent'}`,
                            color: sort === s.value ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.35)',
                            fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', cursor: 'pointer',
                        }}>
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Stats */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 14 }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.25)', marginBottom: 8, paddingLeft: 2 }}>
                        STATUS BREAKDOWN
                    </div>
                    {([
                        ['investigating', 'Investigating'],
                        ['in_progress', 'In Progress'],
                        ['priority', 'Priority'],
                        ['open', 'Open'],
                        ['fixed', 'Fixed'],
                        ['implemented', 'Implemented'],
                        ['wont_fix', "Won't Fix"],
                    ] as [string, string][]).map(([key, label]) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px' }}>
                            <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', letterSpacing: '0.03em' }}>{label}</span>
                            <span style={{
                                fontSize: '0.65rem', fontWeight: 800, fontFamily: 'monospace',
                                color: STATUS_COLOURS[key], minWidth: 20, textAlign: 'right',
                            }}>
                                {String(counts[key as keyof typeof counts]).padStart(2, '0')}
                            </span>
                        </div>
                    ))}
                </div>

            </aside>

            {/* ── MAIN FEED ── */}
            <main className='flex flex-col gap-8' style={{ minWidth: 0 }}>
                {loading ? (
                    <div className='flex justify-center py-20'><CircularProgress size={28} style={{ color: 'rgba(219,0,29,0.7)' }} /></div>
                ) : (
                    <>
                        {grouped.investigating.length > 0 && (
                            <FeedSection status='investigating' label='Investigating' tag='UNDER REVIEW' items={grouped.investigating} />
                        )}
                        {grouped.inProgress.length > 0 && (
                            <FeedSection status='in_progress' label='In Progress' tag='ACTIVE WORK' items={grouped.inProgress} />
                        )}
                        {grouped.priority.length > 0 && (
                            <FeedSection status='priority' label='Priority' tag='FLAGGED' items={grouped.priority} />
                        )}

                        <FeedSection status='open' label='Open' tag='AWAITING REVIEW' items={grouped.open} empty='No open reports.' />

                        {grouped.resolved.length > 0 && (
                            <div>
                                <button onClick={() => setResolvedOpen(v => !v)} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                    background: 'transparent', border: 'none', borderTop: '1px solid rgba(255,255,255,0.07)',
                                    borderBottom: resolvedOpen ? 'none' : '1px solid rgba(255,255,255,0.07)',
                                    padding: '10px 0', cursor: 'pointer',
                                    color: 'rgba(237,237,237,0.3)', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.14em',
                                }}>
                                    {resolvedOpen ? <KeyboardArrowUp style={{ fontSize: 16 }} /> : <KeyboardArrowDown style={{ fontSize: 16 }} />}
                                    RESOLVED
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)' }}>
                                        [{String(grouped.resolved.length).padStart(2, '0')}]
                                    </span>
                                    <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: '0.65rem', letterSpacing: '0.05em', color: 'rgba(237,237,237,0.2)' }}>
                                        FIXED · IMPLEMENTED · WON&apos;T FIX
                                    </span>
                                </button>
                                {resolvedOpen && (
                                    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 8 }}>
                                        {grouped.resolved.map(item => <FeedbackCard key={item._id.toString()} item={item} />)}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>

        </div>
    )
}


function FeedSection({ status, label, tag, items, empty }: {
    status: string
    label: string
    tag: string
    items: FeedbackItem[]
    empty?: string
}) {
    return (
        <div>
            {/* Section header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                borderBottom: `1px solid ${STATUS_BORDER_STRIP[status]}33`,
                paddingBottom: 8,
            }}>
                <div style={{ width: 3, height: 16, background: STATUS_BORDER_STRIP[status], flexShrink: 0 }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.16em', color: STATUS_COLOURS[status] }}>
                    {label.toUpperCase()}
                </span>
                <span style={{
                    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', padding: '2px 6px',
                    border: `1px solid ${STATUS_BORDER_STRIP[status]}55`,
                    color: STATUS_COLOURS[status], opacity: 0.7,
                }}>
                    {tag}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.68rem', fontWeight: 700, color: STATUS_COLOURS[status], marginLeft: 'auto' }}>
                    [{String(items.length).padStart(2, '0')}]
                </span>
            </div>

            {items.length === 0 ? (
                <div style={{ color: 'rgba(237,237,237,0.25)', fontSize: '0.82rem', padding: '24px 0', textAlign: 'center', letterSpacing: '0.06em' }}>
                    {empty}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 8 }}>
                    {items.map(item => <FeedbackCard key={item._id.toString()} item={item} />)}
                </div>
            )}
        </div>
    )
}


function FeedbackCard({ item }: { item: FeedbackItem }) {
    const [imgErr, setImgErr] = useState(false)

    return (
        <Link href={`/feedback/${item._id}`}>
            <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderLeft: `3px solid ${STATUS_BORDER_STRIP[item.status]}`,
                cursor: 'pointer', transition: 'background 0.12s, border-color 0.12s',
                display: 'flex', flexDirection: 'column',
            }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
            >
                {/* Top bar: type + status badges */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: 'rgba(0,0,0,0.15)',
                }}>
                    <span style={{
                        fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', padding: '2px 5px',
                        color: item.type === 'bug' ? 'rgba(219,0,29,0.85)' : 'rgba(255,160,0,0.85)',
                        border: `1px solid ${item.type === 'bug' ? 'rgba(219,0,29,0.25)' : 'rgba(255,160,0,0.25)'}`,
                        display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                        {item.type === 'bug' ? <BugReport style={{ fontSize: 9 }} /> : <Lightbulb style={{ fontSize: 9 }} />}
                        {item.type === 'bug' ? 'BUG' : 'FEATURE'}
                    </span>
                    <span style={{
                        fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', padding: '2px 5px',
                        color: STATUS_COLOURS[item.status],
                        border: `1px solid ${STATUS_BORDER_STRIP[item.status]}44`,
                    }}>
                        {STATUS_LABELS[item.status]}
                    </span>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.65rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.4)', fontWeight: 700 }}>
                            <ThumbUp style={{ fontSize: 10 }} /> {item.upvoteCount}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.65rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.3)', fontWeight: 700 }}>
                            <Comment style={{ fontSize: 10 }} /> {item.commentCount}
                        </span>
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '10px 12px', flex: 1 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.92)', marginBottom: 5, lineHeight: 1.3 }}>
                        {item.title}
                    </div>
                    <p style={{
                        fontSize: '0.72rem', color: 'rgba(237,237,237,0.38)', overflow: 'hidden',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        lineHeight: 1.5, margin: 0,
                    }}>
                        {item.description}
                    </p>
                </div>

                {/* Footer: author */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                }}>
                    {!imgErr ? (
                        <img src={avatarUrl(item)} alt={item.authorName} onError={() => setImgErr(true)}
                            style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', opacity: 0.8 }} />
                    ) : (
                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'rgba(237,237,237,0.5)', fontWeight: 700 }}>
                            {item.authorName.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.03em' }}>
                        {item.authorName}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.2)' }}>
                        {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                </div>
            </div>
        </Link>
    )
}
