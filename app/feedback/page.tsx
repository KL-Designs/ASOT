'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    Add, KeyboardArrowDown, KeyboardArrowUp,
    BugReport, Lightbulb, Map, Campaign, Feedback, ReportProblem, EmojiEvents,
    ThumbUp, ThumbDown, Comment,
} from '@mui/icons-material'
import { CircularProgress } from '@mui/material'
import {
    STATUS_META, PRIMARY_STATUS_META, PRIMARY_STATUSES, TAG_META, ALL_TAGS,
    CAT_META, SUBTYPE_LABELS, PUBLIC_CATEGORIES, PRIVATE_CATEGORIES,
    getStatus, isTicketClosed, getPrimaryStatus,
} from './_shared/constants'

type TicketItem = CommunityTicket & { _id: string }
type SortMode = 'votes' | 'newest' | 'oldest'

interface TicketGroup {
    id: string
    label: string
    color: string
    icon: React.ReactNode
    match: (t: TicketItem) => boolean
}

const TICKET_GROUPS: TicketGroup[] = [
    {
        id: 'requests',
        label: 'Requests',
        color: 'rgba(255,160,0,0.85)',
        icon: <Lightbulb style={{ fontSize: 14 }} />,
        match: t => t.category === 'request',
    },
    {
        id: 'bugs',
        label: 'Bug Reports',
        color: 'rgba(219,0,29,0.85)',
        icon: <BugReport style={{ fontSize: 14 }} />,
        match: t => t.category === 'bug',
    },
    {
        id: 'missions',
        label: 'Mission & Campaign Ideas',
        color: 'rgba(0,195,255,0.85)',
        icon: <Map style={{ fontSize: 14 }} />,
        match: t => t.category === 'mission' || t.category === 'campaign',
    },
]

const CAT_ICONS: Record<string, React.ReactNode> = {
    request:         <Lightbulb style={{ fontSize: 12 }} />,
    bug:             <BugReport style={{ fontSize: 12 }} />,
    mission:         <Map style={{ fontSize: 12 }} />,
    campaign:        <Campaign style={{ fontSize: 12 }} />,
    'unit-feedback': <Feedback style={{ fontSize: 12 }} />,
    complaint:       <ReportProblem style={{ fontSize: 12 }} />,
    award:           <EmojiEvents style={{ fontSize: 12 }} />,
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
    { value: 'votes',  label: 'Most Voted' },
    { value: 'newest', label: 'Newest'     },
    { value: 'oldest', label: 'Oldest'     },
]

function avatarUrl(item: TicketItem): string {
    if (item.isAnonymous) return ''
    if (item.authorAvatarId) return `https://cdn.discordapp.com/avatars/${item.authorId}/${item.authorAvatarId}.png?size=32`
    try { return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(item.authorId) % BigInt(6))}.png` }
    catch { return 'https://cdn.discordapp.com/embed/avatars/0.png' }
}


const DRAFT_KEY = 'community_ticket_draft_v3'

export default function CommunityTicketsPage() {
    const router = useRouter()
    const [items, setItems] = useState<TicketItem[]>([])
    const [loading, setLoading] = useState(true)
    const [isJ4, setIsJ4] = useState(false)
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [statusFilters, setStatusFilters] = useState<string[]>([])
    const [sort, setSort] = useState<SortMode>('votes')
    const [closedOpen, setClosedOpen] = useState(false)
    const [draftModal, setDraftModal] = useState(false)

    function handleSubmitClick() {
        try {
            const raw = localStorage.getItem(DRAFT_KEY)
            if (raw) { JSON.parse(raw); setDraftModal(true); return }
        } catch { /* ignore */ }
        router.push('/feedback/new')
    }

    useEffect(() => {
        fetch('/api/me').then(r => r.json()).then(d => setIsJ4(!!d.isJ4)).catch(() => {})
    }, [])

    useEffect(() => {
        const p = new URLSearchParams()
        if (categoryFilter !== 'all') p.set('category', categoryFilter)
        statusFilters.forEach(s => p.append('status', s))
        p.set('sort', sort)
        setLoading(true)
        fetch(`/api/community/tickets?${p}`)
            .then(r => r.json())
            .then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false) })
            .catch(() => setLoading(false))
    }, [categoryFilter, statusFilters, sort])

    function toggleStatus(s: string) {
        setStatusFilters(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
    }

    const sorted = useMemo(() => {
        return [...items].sort((a, b) => {
            if (sort === 'votes') return (b.voteScore - a.voteScore) || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            if (sort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        })
    }, [items, sort])

    const primaryCounts = useMemo(() => {
        const c: Record<string, number> = { open: 0, in_review: 0, closed: 0 }
        for (const item of items) {
            const p = getPrimaryStatus(item)
            c[p] = (c[p] ?? 0) + 1
        }
        return c
    }, [items])

    const tagCounts = useMemo(() => {
        const c: Record<string, number> = {}
        for (const item of items) {
            for (const tag of (item.ticketTags ?? [])) {
                c[tag] = (c[tag] ?? 0) + 1
            }
        }
        return c
    }, [items])

    // Public users only see public category filters; J4 sees all
    const visibleCatFilters = isJ4
        ? [...PUBLIC_CATEGORIES, ...PRIVATE_CATEGORIES]
        : PUBLIC_CATEGORIES

    return (
        <>
        {draftModal && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderTop: '3px solid rgba(219,0,29,0.5)', padding: '28px', maxWidth: 420, width: '90%' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.9)', marginBottom: 8 }}>EXISTING DRAFT FOUND</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)', marginBottom: 24, lineHeight: 1.5 }}>You have a saved draft ticket. Would you like to continue it or start fresh?</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button onClick={() => { setDraftModal(false); router.push('/feedback/new') }} style={{ padding: '10px 18px', background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(219,0,29,0.9)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', textAlign: 'left' }}>
                            CONTINUE EXISTING DRAFT
                        </button>
                        <button onClick={() => { try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ } setDraftModal(false); router.push('/feedback/new') }} style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.55)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textAlign: 'left' }}>
                            START NEW TICKET
                        </button>
                        <button onClick={() => setDraftModal(false)} style={{ padding: '6px 0', background: 'none', border: 'none', color: 'rgba(237,237,237,0.25)', cursor: 'pointer', fontSize: '0.65rem', letterSpacing: '0.06em' }}>
                            CANCEL
                        </button>
                    </div>
                </div>
            </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' }}>

            {/* ── SIDEBAR ── */}
            <aside style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 1 }}>

                <div style={{ background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.25)', padding: '14px 16px', marginBottom: 8 }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.6)', marginBottom: 4 }}>ASOT // PORTAL</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--foreground)' }}>FEEDBACK</div>
                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', marginTop: 3, lineHeight: 1.4 }}>Requests, bugs, missions &amp; more</div>
                </div>

                <button onClick={handleSubmitClick} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(219,0,29,0.95)', padding: '9px 0', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.14em', cursor: 'pointer', marginBottom: 16 }}>
                    <Add style={{ fontSize: 14 }} /> SUBMIT TICKET
                </button>

                {/* Category */}
                <SideLabel>CATEGORY</SideLabel>
                <SideBtn active={categoryFilter === 'all'} color='rgba(237,237,237,0.55)' onClick={() => setCategoryFilter('all')}>
                    All Tickets
                </SideBtn>
                {visibleCatFilters.map(cat => (
                    <SideBtn key={cat} active={categoryFilter === cat} color={CAT_META[cat]?.color ?? 'rgba(237,237,237,0.5)'} onClick={() => setCategoryFilter(cat)}>
                        <span style={{ color: CAT_META[cat]?.color, display: 'flex', flexShrink: 0 }}>{CAT_ICONS[cat]}</span>
                        {CAT_META[cat]?.label ?? cat}
                        {PRIVATE_CATEGORIES.includes(cat as CommunityTicketCategory) && (
                            <span style={{ fontSize: '0.5rem', fontWeight: 800, padding: '1px 4px', color: 'rgba(255,80,80,0.65)', border: '1px solid rgba(255,80,80,0.2)', lineHeight: 1, marginLeft: 'auto' }}>P</span>
                        )}
                    </SideBtn>
                ))}

                {/* Status filter */}
                <SideLabel style={{ marginTop: 12 }}>
                    STATUS
                    {statusFilters.length > 0 && (
                        <button onClick={() => setStatusFilters([])} style={{ marginLeft: 6, fontSize: '0.55rem', color: 'rgba(237,237,237,0.25)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✕ clear</button>
                    )}
                </SideLabel>
                {PRIMARY_STATUSES.map(s => {
                    const meta = PRIMARY_STATUS_META[s]
                    const active = statusFilters.includes(s)
                    return (
                        <button key={s} onClick={() => toggleStatus(s)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '5px 10px', background: active ? `${meta.color}10` : 'transparent', border: 'none', borderLeft: `2px solid ${active ? meta.border : 'transparent'}`, color: active ? meta.color : 'rgba(237,237,237,0.38)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.04em', cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0, opacity: active ? 1 : 0.3 }} />
                            {meta.label}
                            <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '0.6rem', color: 'rgba(237,237,237,0.25)' }}>{primaryCounts[s] ?? 0}</span>
                        </button>
                    )
                })}

                {/* Sort */}
                <SideLabel style={{ marginTop: 12 }}>SORT BY</SideLabel>
                {SORT_OPTIONS.map(s => (
                    <SideBtn key={s.value} active={sort === s.value} color='rgba(255,255,255,0.45)' onClick={() => setSort(s.value)}>
                        {s.label}
                    </SideBtn>
                ))}

                {/* Status breakdown */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 14, marginTop: 12 }}>
                    <SideLabel>TOTAL</SideLabel>
                    {PRIMARY_STATUSES.map(s => (
                        <div key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 10px' }}>
                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.42)' }}>{PRIMARY_STATUS_META[s].label}</span>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, fontFamily: 'monospace', color: PRIMARY_STATUS_META[s].color }}>
                                {String(primaryCounts[s] ?? 0).padStart(2, '0')}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Sub-status tag breakdown */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 14, marginTop: 8 }}>
                    <SideLabel>SUB-STATUS</SideLabel>
                    {ALL_TAGS.filter(t => t !== 'in_review').map(tag => (
                        <div key={tag} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 10px' }}>
                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.42)' }}>{TAG_META[tag].label}</span>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, fontFamily: 'monospace', color: TAG_META[tag].color }}>
                                {String(tagCounts[tag] ?? 0).padStart(2, '0')}
                            </span>
                        </div>
                    ))}
                </div>
            </aside>

            {/* ── MAIN FEED ── */}
            <main style={{ display: 'flex', flexDirection: 'column', gap: 28, minWidth: 0 }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
                        <CircularProgress size={28} style={{ color: 'rgba(219,0,29,0.7)' }} />
                    </div>
                ) : (
                    TICKET_GROUPS.map(group => {
                        const groupItems = sorted.filter(t => {
                            if (!group.match(t)) return false
                            if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
                            if (statusFilters.length > 0 && !statusFilters.includes(getPrimaryStatus(t))) return false
                            return true
                        })
                        if (groupItems.length === 0 && categoryFilter !== 'all') return null
                        const active = groupItems.filter(t => !isTicketClosed(t))
                        const closed = groupItems.filter(t => isTicketClosed(t))
                        return (
                            <TypeGroup
                                key={group.id}
                                group={group}
                                active={active}
                                closed={closed}
                            />
                        )
                    })
                )}
            </main>
        </div>
        </>
    )
}


function SideLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(237,237,237,0.25)', marginBottom: 5, paddingLeft: 2, display: 'flex', alignItems: 'center', gap: 4, ...style }}>
            {children}
        </div>
    )
}

function SideBtn({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
    return (
        <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '6px 10px', background: active ? 'rgba(255,255,255,0.05)' : 'transparent', border: 'none', borderLeft: `2px solid ${active ? color : 'transparent'}`, color: active ? 'rgba(237,237,237,0.92)' : 'rgba(237,237,237,0.4)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.05em', cursor: 'pointer', textAlign: 'left' }}>
            {children}
        </button>
    )
}

function TypeGroup({ group, active, closed }: { group: TicketGroup; active: TicketItem[]; closed: TicketItem[] }) {
    const [closedOpen, setClosedOpen] = useState(false)
    if (active.length === 0 && closed.length === 0) return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${group.color}33` }}>
                <div style={{ width: 3, height: 16, background: group.color, flexShrink: 0 }} />
                <span style={{ color: group.icon as any, display: 'flex' }}>{group.icon}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.14em', color: group.color }}>{group.label.toUpperCase()}</span>
            </div>
            <div style={{ color: 'rgba(237,237,237,0.2)', fontSize: '0.78rem', padding: '16px 0', textAlign: 'center' }}>No tickets.</div>
        </div>
    )

    return (
        <div>
            {/* Group header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${group.color}33` }}>
                <div style={{ width: 3, height: 16, background: group.color, flexShrink: 0 }} />
                <span style={{ display: 'flex', color: group.color }}>{group.icon}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.14em', color: group.color }}>{group.label.toUpperCase()}</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, color: group.color, opacity: 0.6, marginLeft: 'auto' }}>
                    {String(active.length).padStart(2, '0')} open
                </span>
            </div>

            {/* Active tickets */}
            {active.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 8, marginBottom: 8 }}>
                    {active.map(item => <TicketCard key={item._id} item={item} />)}
                </div>
            ) : (
                <div style={{ color: 'rgba(237,237,237,0.2)', fontSize: '0.75rem', padding: '8px 0 12px', fontStyle: 'italic' }}>No open tickets.</div>
            )}

            {/* Closed tickets (collapsible) */}
            {closed.length > 0 && (
                <div>
                    <button onClick={() => setClosedOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'transparent', border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '7px 0', cursor: 'pointer', color: 'rgba(237,237,237,0.28)', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.12em' }}>
                        {closedOpen ? <KeyboardArrowUp style={{ fontSize: 14 }} /> : <KeyboardArrowDown style={{ fontSize: 14 }} />}
                        CLOSED
                        <span style={{ fontFamily: 'monospace', marginLeft: 4 }}>[{String(closed.length).padStart(2, '0')}]</span>
                    </button>
                    {closedOpen && (
                        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 8 }}>
                            {closed.map(item => <TicketCard key={item._id} item={item} />)}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}


function TicketSection({ label, tag, items, empty }: { label: string; tag: string; items: TicketItem[]; empty?: string }) {
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 8 }}>
                <div style={{ width: 3, height: 16, background: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.7)' }}>{label.toUpperCase()}</span>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', padding: '2px 6px', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.38)' }}>{tag}</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.68rem', fontWeight: 700, color: 'rgba(237,237,237,0.42)', marginLeft: 'auto' }}>
                    [{String(items.length).padStart(2, '0')}]
                </span>
            </div>
            {items.length === 0 ? (
                <div style={{ color: 'rgba(237,237,237,0.2)', fontSize: '0.82rem', padding: '24px 0', textAlign: 'center', letterSpacing: '0.06em' }}>{empty}</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 8 }}>
                    {items.map(item => <TicketCard key={item._id} item={item} />)}
                </div>
            )}
        </div>
    )
}


function TicketCard({ item }: { item: TicketItem }) {
    const router = useRouter()
    const [imgErr, setImgErr] = useState(false)
    const cat = CAT_META[item.category]
    const primaryStatus = getPrimaryStatus(item)
    const status = PRIMARY_STATUS_META[primaryStatus] ?? getStatus(item.status)
    const tags = item.ticketTags ?? []

    return (
        <div
            onClick={() => router.push(`/feedback/${item._id}`)}
            style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${cat?.borderColor ?? 'rgba(255,255,255,0.06)'}`, borderLeft: `3px solid ${cat?.color ?? 'rgba(255,255,255,0.2)'}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', transition: 'background 0.12s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.045)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
        >
            {/* Top bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.18)' }}>
                <span style={{ fontSize: '0.56rem', fontWeight: 800, letterSpacing: '0.09em', padding: '1px 5px', color: cat?.color ?? 'rgba(237,237,237,0.5)', border: `1px solid ${cat?.borderColor ?? 'transparent'}`, display: 'flex', alignItems: 'center', gap: 3 }}>
                    {CAT_ICONS[item.category]}
                    {SUBTYPE_LABELS[item.subtype] ?? item.subtype}
                </span>
                <span style={{ fontSize: '0.56rem', fontWeight: 800, letterSpacing: '0.09em', padding: '1px 5px', color: status.color, border: `1px solid ${status.border}55` }}>
                    {status.label}
                </span>
                {tags.map(tag => {
                    const tm = TAG_META[tag]
                    if (!tm) return null
                    return (
                        <span key={tag} style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.07em', padding: '1px 4px', color: tm.color, border: `1px solid ${tm.color}55`, opacity: 0.85 }}>
                            {tm.label}
                        </span>
                    )
                })}
                {item.visibility === 'private' && (
                    <span style={{ fontSize: '0.52rem', fontWeight: 800, padding: '1px 4px', color: 'rgba(255,80,80,0.65)', border: '1px solid rgba(255,80,80,0.2)' }}>P</span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.63rem', fontFamily: 'monospace', color: item.voteScore > 0 ? 'rgba(74,222,128,0.7)' : item.voteScore < 0 ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.35)', fontWeight: 700 }}>
                        {item.voteScore >= 0 ? <ThumbUp style={{ fontSize: 9 }} /> : <ThumbDown style={{ fontSize: 9 }} />}
                        {item.voteScore > 0 ? '+' : ''}{item.voteScore}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.63rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.3)', fontWeight: 700 }}>
                        <Comment style={{ fontSize: 9 }} />{item.commentCount}
                    </span>
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: '10px 12px', flex: 1 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.92)', marginBottom: 5, lineHeight: 1.3 }}>{item.title}</div>
                <p style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.5, margin: 0 }}>
                    {item.description}
                </p>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                {item.isAnonymous ? (
                    <div style={{ width: 17, height: 17, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'rgba(237,237,237,0.4)', fontWeight: 700 }}>?</div>
                ) : !imgErr ? (
                    <img src={avatarUrl(item)} alt={item.authorName} onError={() => setImgErr(true)} style={{ width: 17, height: 17, borderRadius: '50%', objectFit: 'cover', opacity: 0.8 }} />
                ) : (
                    <div style={{ width: 17, height: 17, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'rgba(237,237,237,0.5)', fontWeight: 700 }}>
                        {item.authorName.charAt(0).toUpperCase()}
                    </div>
                )}
                <span style={{ fontSize: '0.63rem', color: 'rgba(237,237,237,0.32)' }}>{item.isAnonymous ? 'Anonymous' : item.authorName}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.6rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.18)' }}>{new Date(item.createdAt).toLocaleDateString()}</span>
            </div>
        </div>
    )
}
