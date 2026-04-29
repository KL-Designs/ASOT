'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
    Add, KeyboardArrowDown, KeyboardArrowUp,
    BugReport, Lightbulb, Map, Campaign, Feedback, ReportProblem, EmojiEvents,
    ThumbUp, ThumbDown, Comment,
} from '@mui/icons-material'
import { CircularProgress } from '@mui/material'

type TicketItem = CommunityTicket & { _id: string }
type SortMode = 'votes' | 'newest' | 'oldest'

const CATEGORIES: { value: string; label: string; icon: React.ReactNode; color: string }[] = [
    { value: 'all', label: 'All Tickets', icon: null, color: 'rgba(237,237,237,0.5)' },
    { value: 'request', label: 'Requests', icon: <Lightbulb style={{ fontSize: 11 }} />, color: 'rgba(255,160,0,0.85)' },
    { value: 'bug', label: 'Bug Reports', icon: <BugReport style={{ fontSize: 11 }} />, color: 'rgba(219,0,29,0.85)' },
    { value: 'mission', label: 'Missions', icon: <Map style={{ fontSize: 11 }} />, color: 'rgba(0,195,255,0.85)' },
    { value: 'campaign', label: 'Campaigns', icon: <Campaign style={{ fontSize: 11 }} />, color: 'rgba(167,139,250,0.9)' },
    { value: 'unit-feedback', label: 'Unit Feedback', icon: <Feedback style={{ fontSize: 11 }} />, color: 'rgba(74,222,128,0.85)' },
    { value: 'complaint', label: 'Complaints', icon: <ReportProblem style={{ fontSize: 11 }} />, color: 'rgba(255,80,80,0.85)' },
    { value: 'award', label: 'Awards', icon: <EmojiEvents style={{ fontSize: 11 }} />, color: 'rgba(255,200,0,0.9)' },
]

const STATUSES = [
    { value: 'all', label: 'All Statuses' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'closed', label: 'Closed' },
]

const STATUS_COLOURS: Record<string, string> = {
    open: 'rgba(237,237,237,0.55)',
    in_progress: 'rgba(0,195,255,0.9)',
    resolved: 'rgba(74,222,128,0.85)',
    closed: 'rgba(237,237,237,0.3)',
}

const STATUS_BORDER: Record<string, string> = {
    open: 'rgba(255,255,255,0.15)',
    in_progress: 'rgba(0,195,255,0.7)',
    resolved: 'rgba(74,222,128,0.6)',
    closed: 'rgba(255,255,255,0.1)',
}

const STATUS_LABELS: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed',
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
    { value: 'votes', label: 'Most Voted' },
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
]

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

function getCategoryColor(cat: string): string {
    return CATEGORIES.find(c => c.value === cat)?.color ?? 'rgba(237,237,237,0.5)'
}

function avatarUrl(item: TicketItem): string {
    if (item.isAnonymous) return ''
    if (item.authorAvatarId) return `https://cdn.discordapp.com/avatars/${item.authorId}/${item.authorAvatarId}.png?size=32`
    try { return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(item.authorId) % BigInt(6))}.png` }
    catch { return `https://cdn.discordapp.com/embed/avatars/0.png` }
}


export default function CommunityTicketsPage() {
    const [items, setItems] = useState<TicketItem[]>([])
    const [loading, setLoading] = useState(true)
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [statusFilter, setStatusFilter] = useState('all')
    const [sort, setSort] = useState<SortMode>('votes')
    const [resolvedOpen, setResolvedOpen] = useState(false)

    useEffect(() => {
        const p = new URLSearchParams()
        if (categoryFilter !== 'all') p.set('category', categoryFilter)
        if (statusFilter !== 'all') p.set('status', statusFilter)
        p.set('sort', sort)
        setLoading(true)
        fetch(`/api/community/tickets?${p}`)
            .then(r => r.json())
            .then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false) })
            .catch(() => setLoading(false))
    }, [categoryFilter, statusFilter, sort])

    const sorted = useMemo(() => {
        return [...items].sort((a, b) => {
            if (sort === 'votes') return (b.voteScore - a.voteScore) || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            if (sort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        })
    }, [items, sort])

    const active = sorted.filter(i => ['open', 'in_progress'].includes(i.status))
    const resolved = sorted.filter(i => ['resolved', 'closed'].includes(i.status))

    const counts = useMemo(() => {
        const c: Record<string, number> = {}
        for (const s of ['open', 'in_progress', 'resolved', 'closed']) {
            c[s] = items.filter(i => i.status === s).length
        }
        return c
    }, [items])

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' }}>

            {/* ── SIDEBAR ── */}
            <aside style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 1 }}>

                <div style={{ background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.25)', padding: '14px 16px', marginBottom: 8 }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.6)', marginBottom: 4 }}>
                        ASOT // PORTAL
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--foreground)' }}>
                        TICKETS
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)', marginTop: 3, letterSpacing: '0.04em', lineHeight: 1.4 }}>
                        Requests, bugs, missions &amp; more
                    </div>
                </div>

                <Link href='/community/tickets/new' style={{ display: 'block', marginBottom: 16 }}>
                    <button style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.4)',
                        color: 'rgba(219,0,29,0.95)', padding: '9px 0',
                        fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.14em', cursor: 'pointer',
                    }}>
                        <Add style={{ fontSize: 14 }} /> SUBMIT TICKET
                    </button>
                </Link>

                {/* Category filter */}
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.25)', marginBottom: 6, paddingLeft: 2 }}>
                        CATEGORY
                    </div>
                    {CATEGORIES.map(c => (
                        <button key={c.value} onClick={() => setCategoryFilter(c.value)} style={{
                            display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '7px 10px',
                            background: categoryFilter === c.value ? 'rgba(255,255,255,0.05)' : 'transparent',
                            border: 'none', borderLeft: `2px solid ${categoryFilter === c.value ? c.color : 'transparent'}`,
                            color: categoryFilter === c.value ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.35)',
                            fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', cursor: 'pointer', textAlign: 'left',
                        }}>
                            {c.icon && <span style={{ color: c.color, display: 'flex' }}>{c.icon}</span>}
                            {c.label}
                        </button>
                    ))}
                </div>

                {/* Status filter */}
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.25)', marginBottom: 6, paddingLeft: 2 }}>
                        STATUS
                    </div>
                    {STATUSES.map(s => (
                        <button key={s.value} onClick={() => setStatusFilter(s.value)} style={{
                            display: 'block', width: '100%', padding: '7px 10px', textAlign: 'left',
                            background: statusFilter === s.value ? 'rgba(255,255,255,0.05)' : 'transparent',
                            border: 'none', borderLeft: `2px solid ${statusFilter === s.value ? (STATUS_COLOURS[s.value] ?? 'rgba(255,255,255,0.3)') : 'transparent'}`,
                            color: statusFilter === s.value ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.35)',
                            fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', cursor: 'pointer',
                        }}>
                            {s.label}
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
                    {(['open', 'in_progress', 'resolved', 'closed'] as const).map(s => (
                        <div key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px' }}>
                            <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', letterSpacing: '0.03em' }}>{STATUS_LABELS[s]}</span>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, fontFamily: 'monospace', color: STATUS_COLOURS[s], minWidth: 20, textAlign: 'right' }}>
                                {String(counts[s] ?? 0).padStart(2, '0')}
                            </span>
                        </div>
                    ))}
                </div>

            </aside>

            {/* ── MAIN FEED ── */}
            <main style={{ display: 'flex', flexDirection: 'column', gap: 32, minWidth: 0 }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
                        <CircularProgress size={28} style={{ color: 'rgba(219,0,29,0.7)' }} />
                    </div>
                ) : (
                    <>
                        <TicketSection
                            label='Active'
                            tag='OPEN & IN PROGRESS'
                            items={active}
                            empty='No active tickets.'
                            borderColor='rgba(255,255,255,0.15)'
                            labelColor='rgba(237,237,237,0.6)'
                        />

                        {resolved.length > 0 && (
                            <div>
                                <button onClick={() => setResolvedOpen(v => !v)} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                    background: 'transparent', border: 'none',
                                    borderTop: '1px solid rgba(255,255,255,0.07)',
                                    borderBottom: resolvedOpen ? 'none' : '1px solid rgba(255,255,255,0.07)',
                                    padding: '10px 0', cursor: 'pointer',
                                    color: 'rgba(237,237,237,0.3)', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.14em',
                                }}>
                                    {resolvedOpen ? <KeyboardArrowUp style={{ fontSize: 16 }} /> : <KeyboardArrowDown style={{ fontSize: 16 }} />}
                                    RESOLVED / CLOSED
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)' }}>
                                        [{String(resolved.length).padStart(2, '0')}]
                                    </span>
                                </button>
                                {resolvedOpen && (
                                    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 8 }}>
                                        {resolved.map(item => <TicketCard key={item._id} item={item} />)}
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


function TicketSection({ label, tag, items, empty, borderColor, labelColor }: {
    label: string; tag: string; items: TicketItem[]; empty?: string
    borderColor: string; labelColor: string
}) {
    return (
        <div>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                borderBottom: `1px solid ${borderColor}33`, paddingBottom: 8,
            }}>
                <div style={{ width: 3, height: 16, background: borderColor, flexShrink: 0 }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.16em', color: labelColor }}>
                    {label.toUpperCase()}
                </span>
                <span style={{
                    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', padding: '2px 6px',
                    border: `1px solid ${borderColor}55`, color: labelColor, opacity: 0.7,
                }}>
                    {tag}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.68rem', fontWeight: 700, color: labelColor, marginLeft: 'auto' }}>
                    [{String(items.length).padStart(2, '0')}]
                </span>
            </div>
            {items.length === 0 ? (
                <div style={{ color: 'rgba(237,237,237,0.25)', fontSize: '0.82rem', padding: '24px 0', textAlign: 'center', letterSpacing: '0.06em' }}>
                    {empty}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 8 }}>
                    {items.map(item => <TicketCard key={item._id} item={item} />)}
                </div>
            )}
        </div>
    )
}


function TicketCard({ item }: { item: TicketItem }) {
    const [imgErr, setImgErr] = useState(false)
    const catColor = getCategoryColor(item.category)
    const statusCol = STATUS_BORDER[item.status] ?? 'rgba(255,255,255,0.15)'

    return (
        <Link href={`/community/tickets/${item._id}`}>
            <div
                style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderLeft: `3px solid ${statusCol}`,
                    cursor: 'pointer', display: 'flex', flexDirection: 'column',
                    transition: 'background 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
            >
                {/* Top bar */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: 'rgba(0,0,0,0.15)',
                }}>
                    <span style={{
                        fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', padding: '2px 5px',
                        color: catColor, border: `1px solid ${catColor}33`,
                        display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                        {CATEGORIES.find(c => c.value === item.category)?.icon}
                        {SUBTYPE_LABELS[item.subtype] ?? item.subtype.toUpperCase()}
                    </span>
                    <span style={{
                        fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', padding: '2px 5px',
                        color: STATUS_COLOURS[item.status], border: `1px solid ${STATUS_BORDER[item.status]}44`,
                    }}>
                        {STATUS_LABELS[item.status]}
                    </span>
                    {item.visibility === 'private' && (
                        <span style={{ fontSize: '0.56rem', fontWeight: 800, letterSpacing: '0.1em', padding: '2px 5px', color: 'rgba(255,80,80,0.7)', border: '1px solid rgba(255,80,80,0.2)' }}>
                            PRIVATE
                        </span>
                    )}
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.65rem', fontFamily: 'monospace', color: item.voteScore > 0 ? 'rgba(74,222,128,0.7)' : item.voteScore < 0 ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.4)', fontWeight: 700 }}>
                            {item.voteScore >= 0 ? <ThumbUp style={{ fontSize: 9 }} /> : <ThumbDown style={{ fontSize: 9 }} />}
                            {item.voteScore > 0 ? '+' : ''}{item.voteScore}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.65rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.3)', fontWeight: 700 }}>
                            <Comment style={{ fontSize: 9 }} /> {item.commentCount}
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

                {/* Footer */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                }}>
                    {item.isAnonymous ? (
                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'rgba(237,237,237,0.4)', fontWeight: 700 }}>
                            ?
                        </div>
                    ) : !imgErr ? (
                        <img src={avatarUrl(item)} alt={item.authorName} onError={() => setImgErr(true)}
                            style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', opacity: 0.8 }} />
                    ) : (
                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'rgba(237,237,237,0.5)', fontWeight: 700 }}>
                            {item.authorName.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.03em' }}>
                        {item.isAnonymous ? 'Anonymous' : item.authorName}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.2)' }}>
                        {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                </div>
            </div>
        </Link>
    )
}
