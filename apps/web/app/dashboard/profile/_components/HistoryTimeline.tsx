'use client'

import { useState, useEffect } from 'react'
import { TextField, Chip } from '@mui/material'
import { EmojiEvents, MilitaryTech, School, FlightTakeoff, PersonAdd, Search } from '@mui/icons-material'
import type { HistoryEvent } from '@/app/api/me/history/route'

const TYPE_CONFIG: Record<HistoryEvent['type'], { label: string; color: string; Icon: React.ElementType }> = {
    enlistment:    { label: 'Enlistment',    color: 'rgba(100,220,100,0.8)',   Icon: PersonAdd    },
    promotion:     { label: 'Promotion',     color: 'rgba(255,215,0,0.85)',    Icon: MilitaryTech },
    award:         { label: 'Award',         color: 'rgba(255,160,80,0.85)',   Icon: EmojiEvents  },
    qualification: { label: 'Qualification', color: 'rgba(80,180,255,0.85)',   Icon: School       },
    loa:           { label: 'Leave',         color: 'rgba(180,140,255,0.85)',  Icon: FlightTakeoff },
}

function formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function groupByYear(events: HistoryEvent[]) {
    const map = new Map<number, HistoryEvent[]>()
    for (const e of events) {
        const year = new Date(e.date).getFullYear()
        if (!map.has(year)) map.set(year, [])
        map.get(year)!.push(e)
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0])
}

export default function HistoryTimeline() {
    const [events, setEvents] = useState<HistoryEvent[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

    useEffect(() => {
        fetch('/api/me/history')
            .then(r => r.json())
            .then(d => setEvents(d.events ?? []))
            .finally(() => setLoading(false))
    }, [])

    const filtered = search.trim()
        ? events.filter(e =>
            e.title.toLowerCase().includes(search.toLowerCase()) ||
            e.detail?.toLowerCase().includes(search.toLowerCase()) ||
            e.type.toLowerCase().includes(search.toLowerCase())
        )
        : events

    const groups = groupByYear(filtered)

    if (loading) {
        return (
            <div style={{ padding: '24px 0', fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.1em' }}>
                Loading history…
            </div>
        )
    }

    if (events.length === 0) {
        return (
            <div style={{ padding: '24px 0', fontSize: '0.72rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.1em' }}>
                No history records yet.
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Search */}
            <div style={{ position: 'relative', maxWidth: 320 }}>
                <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: 'rgba(237,237,237,0.3)', pointerEvents: 'none' }} />
                <TextField
                    size='small'
                    placeholder='Search history…'
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    sx={{
                        width: '100%',
                        '& .MuiOutlinedInput-root': {
                            borderRadius: 0, fontSize: '0.78rem',
                            paddingLeft: '28px',
                            '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                            '&.Mui-focused fieldset': { borderColor: 'rgba(219,0,29,0.5)' },
                        },
                    }}
                    inputProps={{ style: { paddingLeft: 24 } }}
                />
            </div>

            {groups.length === 0 && (
                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.25)' }}>No results.</div>
            )}

            {groups.map(([year, yearEvents]) => {
                const isCollapsed = collapsed.has(year)
                return (
                    <div key={year}>
                        <button
                            type='button'
                            onClick={() => setCollapsed(c => { const n = new Set(c); isCollapsed ? n.delete(year) : n.add(year); return n })}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 8 }}
                        >
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)' }}>{year}</span>
                            <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)' }}>{isCollapsed ? '▸' : '▾'} {yearEvents.length} event{yearEvents.length !== 1 ? 's' : ''}</span>
                        </button>

                        {!isCollapsed && (
                            <div style={{ borderLeft: '2px solid rgba(219,0,29,0.2)', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {yearEvents.map((e, i) => {
                                    const cfg = TYPE_CONFIG[e.type]
                                    return (
                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.025)', borderLeft: `2px solid ${cfg.color}`, position: 'relative' }}>
                                            <cfg.Icon style={{ fontSize: 16, color: cfg.color, flexShrink: 0, marginTop: 1 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)' }}>{e.title}</span>
                                                    <Chip label={cfg.label} size='small' sx={{ fontSize: '0.6rem', height: 18, borderRadius: '2px', background: `${cfg.color.replace('0.8', '0.15').replace('0.85', '0.15')}`, color: cfg.color, fontWeight: 700, letterSpacing: 0.5 }} />
                                                </div>
                                                {e.detail && (
                                                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)', marginTop: 2 }}>{e.detail}</div>
                                                )}
                                                <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 3 }}>
                                                    {formatDate(e.date)}{e.issuedByName ? ` · ${e.issuedByName}` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
