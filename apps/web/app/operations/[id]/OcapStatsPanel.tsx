'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'

interface Props {
    ocap: OcapData
    themeColor: string
    r: number
    g: number
    b: number
    pageTheme: 'modern' | 'oldfashioned' | 'scifi'
    operationId?: string
}

const SIDE_COLORS: Record<string, string> = {
    WEST: 'rgba(80,160,255,0.9)',
    EAST: 'rgba(220,80,80,0.9)',
    GUER: 'rgba(100,200,100,0.9)',
    CIV:  'rgba(200,160,60,0.9)',
}

function hexToRgba(hex: string, a: number): string {
    const h = hex.replace('#', '')
    const rv = parseInt(h.slice(0, 2), 16)
    const gv = parseInt(h.slice(2, 4), 16)
    const bv = parseInt(h.slice(4, 6), 16)
    return `rgba(${rv},${gv},${bv},${a})`
}

const CATEGORY_LABELS: Record<string, string> = {
    companyHQ:  'India Company HQ',
    platoon11:  '1-1 Infantry Platoon',
    platoon12:  '1-2 Infantry Platoon',
    support:    '1-3 Support Platoon',
    gamemaster: 'Gamemaster',
}

type RecordWithUser = OperationAttendanceWithUsers['recordsWithUsers'][number]

function KdRatio(kills: number, deaths: number) {
    if (deaths === 0) return kills.toFixed(2)
    if (kills === 0) return (-deaths).toFixed(2)
    return (kills / deaths).toFixed(2)
}

function Medal({ rank }: { rank: number }) {
    if (rank === 1) return <span style={{ fontSize: '0.9rem' }}>🥇</span>
    if (rank === 2) return <span style={{ fontSize: '0.9rem' }}>🥈</span>
    if (rank === 3) return <span style={{ fontSize: '0.9rem' }}>🥉</span>
    return <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', fontWeight: 700, minWidth: 18, textAlign: 'center', display: 'inline-block' }}>{rank}</span>
}

export default function OcapStatsPanel({ ocap, themeColor, r, g, b, pageTheme, operationId }: Props) {
    const c = (a: number) => `rgba(${r},${g},${b},${a})`
    const isOF = pageTheme === 'oldfashioned'
    const isSF = pageTheme === 'scifi'

    const [view, setView]             = useState<'orbat' | 'leaderboard'>('orbat')
    const [attendance, setAttendance] = useState<OperationAttendanceWithUsers | null>(null)
    const [loading, setLoading]       = useState(false)

    useEffect(() => {
        if (!attendance && !loading && operationId) {
            setLoading(true)
            fetch(`/api/operations/${operationId}/attendance`)
                .then(r => r.json())
                .then(data => { setAttendance(data); setLoading(false) })
                .catch(() => setLoading(false))
        }
    }, [attendance, loading, operationId])

    const statsById = new Map(
        ocap.playerStats.filter(s => s.userId).map(s => [s.userId!, s])
    )

    // Build color maps from ORBAT section meta
    const categoryColors = new Map<string, string>()
    const sectionColors  = new Map<string, string>()
    if (attendance?.sectionMeta) {
        for (const m of attendance.sectionMeta) {
            if (!m.color) continue
            if (!m.sectionTitle) categoryColors.set(m.category, m.color)
            else sectionColors.set(m.sectionTitle, m.color)
        }
    }
    // Map userId → section hex color (section preferred, fall back to category)
    const userSectionColor = new Map<string, string>()
    const userSection      = new Map<string, string>()
    if (attendance) {
        for (const rec of attendance.recordsWithUsers) {
            if (!rec.user?.id) continue
            const color = (rec.orbatSection && sectionColors.get(rec.orbatSection))
                ?? (rec.category && categoryColors.get(rec.category))
            if (color) userSectionColor.set(rec.user.id, color)
            if (rec.orbatSection) userSection.set(rec.user.id, rec.orbatSection)
        }
    }

    const sorted   = [...ocap.playerStats].sort((a, b) =>
        b.kills !== a.kills ? b.kills - a.kills : a.deaths - b.deaths
    )
    const topKills = sorted[0]?.kills ?? 0
    const sides    = Object.entries(ocap.sideComposition).filter(([, v]) => v.players > 0)

    const wrapperStyle = isOF ? {
        position: 'relative' as const,
        border: '1px solid rgba(160,120,50,0.25)',
        borderTop: '2px solid rgba(160,120,50,0.7)',
        background: '#1d1408',
    } : isSF ? {
        position: 'relative' as const,
        border: `1px solid ${c(0.3)}`,
        borderTop: `2px solid ${c(0.8)}`,
        background: 'rgba(0,4,14,0.82)',
        boxShadow: `0 0 20px ${c(0.1)}, inset 0 0 30px ${c(0.03)}`,
    } : {
        position: 'relative' as const,
        border: `1px solid ${c(0.18)}`,
        borderTop: `2px solid ${c(0.6)}`,
    }

    return (
        <div style={wrapperStyle}>

            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
                padding: '8px 20px',
                borderBottom: isOF ? '1px solid rgba(160,120,50,0.15)' : isSF ? `1px solid ${c(0.08)}` : '1px solid rgba(255,255,255,0.06)',
                background: isOF ? 'rgba(0,0,0,0.55)' : isSF ? c(0.06) : 'rgba(0,0,0,0.4)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={isOF ? {
                        width: 8, height: 8, background: c(1), flexShrink: 0, borderRadius: 0,
                    } : isSF ? {
                        width: 6, height: 6, background: c(0.8), flexShrink: 0, boxShadow: `0 0 6px ${c(0.8)}`,
                    } : {
                        width: 6, height: 6, background: c(0.7), flexShrink: 0,
                    }} />
                    <span style={isOF ? {
                        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8a850', fontFamily: '"Courier New", monospace',
                    } : isSF ? {
                        fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: c(0.9), textShadow: `0 0 6px ${c(0.5)}`, fontFamily: '"Courier New", monospace',
                    } : {
                        fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: c(0.8),
                    }}>
                        Operation Statistics
                    </span>
                </div>
                <a
                    href={ocap.viewerUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    style={{
                        fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                        padding: '3px 10px', textDecoration: 'none',
                        border: `1px solid ${c(0.35)}`, color: c(0.7),
                        background: c(0.06),
                    }}
                >
                    OCAP Viewer ↗
                </a>
            </div>

            <div style={{ padding: '20px 20px' }}>

                {/* Summary stats */}
                <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', marginBottom: 16, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)' }}>
                    {[
                        ['Map',          ocap.worldName.toUpperCase()],
                        ['Players',      String(ocap.playerCount)],
                        ['Player Kills', String(ocap.playerKillCount)],
                        ['Total Kills',  String(ocap.killCount)],
                    ].map(([label, value], i, arr) => (
                        <div key={label} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 24px',
                            borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : undefined,
                            flex: 1, minWidth: 80,
                        }}>
                            <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)' }}>{label}</span>
                            <span style={{ fontSize: '1rem', fontWeight: 800, color: 'rgba(237,237,237,0.85)' }}>{value}</span>
                        </div>
                    ))}
                </div>

                {/* Side composition */}
                {sides.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                        {sides.map(([side, data]) => (
                            <div key={side} style={{
                                flex: 1, minWidth: 100,
                                padding: '8px 12px',
                                border: '1px solid rgba(255,255,255,0.07)',
                                background: 'rgba(0,0,0,0.25)',
                                borderTop: `2px solid ${SIDE_COLORS[side] ?? 'rgba(200,200,200,0.5)'}`,
                            }}>
                                <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: SIDE_COLORS[side] ?? 'rgba(237,237,237,0.5)', marginBottom: 6 }}>
                                    {side}
                                </div>
                                {[['Players', data.players], ['Kills', data.kills], ['KIA', data.dead]].map(([lbl, val]) => (
                                    <div key={String(lbl)} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                        <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)' }}>{lbl}</span>
                                        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(237,237,237,0.65)' }}>{val}</span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}

                {/* View tabs */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {([['orbat', 'ORBAT'] as const, ['leaderboard', 'Leaderboard'] as const]).map(([v, label]) => (
                        <button
                            key={v}
                            onClick={() => setView(v)}
                            style={{
                                padding: '6px 16px',
                                fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
                                cursor: 'pointer',
                                background: 'none', border: 'none',
                                borderBottom: view === v ? `2px solid ${c(0.9)}` : '2px solid transparent',
                                color: view === v ? c(0.9) : 'rgba(237,237,237,0.3)',
                                marginBottom: -1,
                                transition: 'color 0.12s',
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* ORBAT view */}
                {view === 'orbat' && (
                    <OrbatView
                        attendance={attendance}
                        loading={loading}
                        statsById={statsById}
                        categoryColors={categoryColors}
                        sectionColors={sectionColors}
                        c={c} r={r} g={g} b={b}
                    />
                )}

                {/* Leaderboard view */}
                {view === 'leaderboard' && (
                    <LeaderboardView sorted={sorted} topKills={topKills} userSectionColor={userSectionColor} userSection={userSection} c={c} r={r} g={g} b={b} />
                )}

                {/* Footer */}
                <div style={{ marginTop: 12, fontSize: '0.52rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.1em' }}>
                    Synced from OCAP on {new Date(ocap.syncedAt).toLocaleDateString()} · {ocap.filename}
                </div>
            </div>
        </div>
    )
}

// ── ORBAT View ────────────────────────────────────────────────────────────────

const CATEGORY_ORDER = ['companyHQ', 'platoon11', 'platoon12', 'support', 'gamemaster', 'other']

function OrbatView({ attendance, loading, statsById, categoryColors, sectionColors, c, r, g, b }: {
    attendance: OperationAttendanceWithUsers | null
    loading: boolean
    statsById: Map<string, OcapPlayerStat>
    categoryColors: Map<string, string>
    sectionColors: Map<string, string>
    c: (a: number) => string
    r: number; g: number; b: number
}) {
    if (loading || !attendance) {
        return (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(237,237,237,0.3)', fontSize: '0.78rem', fontStyle: 'italic' }}>
                {loading ? 'Loading attendance data…' : 'No attendance data available.'}
            </div>
        )
    }

    const records = attendance.recordsWithUsers as RecordWithUser[]

    // Group: category → section → records
    const byCategory = new Map<string, Map<string, RecordWithUser[]>>()
    for (const rec of records) {
        const cat  = rec.category ?? 'other'
        const sect = rec.orbatSection ?? 'Other'
        if (!byCategory.has(cat)) byCategory.set(cat, new Map())
        const bySect = byCategory.get(cat)!
        if (!bySect.has(sect)) bySect.set(sect, [])
        bySect.get(sect)!.push(rec)
    }

    const orderedCats = CATEGORY_ORDER.filter(cat => byCategory.has(cat))

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
            {orderedCats.map(cat => {
                const catHex = categoryColors.get(cat)
                return (
                    <React.Fragment key={cat}>
                        {/* Full-width category divider */}
                        <div style={{
                            gridColumn: '1 / -1',
                            fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
                            color: catHex ? hexToRgba(catHex, 0.8) : c(0.4),
                            paddingBottom: 4, marginTop: 4,
                            borderBottom: `1px solid ${catHex ? hexToRgba(catHex, 0.2) : c(0.12)}`,
                        }}>
                            {CATEGORY_LABELS[cat] ?? cat}
                        </div>
                        {/* Section cards flow horizontally across the grid */}
                        {Array.from(byCategory.get(cat)!.entries()).map(([sectionTitle, sectionRecords]) => (
                            <OrbatSectionCard
                                key={sectionTitle}
                                title={sectionTitle}
                                records={sectionRecords}
                                statsById={statsById}
                                sectionColor={sectionColors.get(sectionTitle) ?? catHex}
                                c={c} r={r} g={g} b={b}
                            />
                        ))}
                    </React.Fragment>
                )
            })}
        </div>
    )
}

function OrbatSectionCard({ title, records, statsById, sectionColor, c, r, g, b }: {
    title: string
    records: RecordWithUser[]
    statsById: Map<string, OcapPlayerStat>
    sectionColor?: string
    c: (a: number) => string
    r: number; g: number; b: number
}) {
    const accent     = sectionColor ? hexToRgba(sectionColor, 0.75) : c(0.7)
    const accentBg   = sectionColor ? hexToRgba(sectionColor, 0.12) : `rgba(${r},${g},${b},0.12)`
    const accentBdr  = sectionColor ? hexToRgba(sectionColor, 0.2)  : `rgba(${r},${g},${b},0.18)`
    const accentText = sectionColor ? hexToRgba(sectionColor, 0.9)  : c(0.8)
    const accentRow  = sectionColor ? hexToRgba(sectionColor, 0.04) : `rgba(${r},${g},${b},0.03)`

    return (
        <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Section header */}
            <div style={{
                padding: '5px 10px',
                background: accentBg,
                borderBottom: `1px solid ${accentBdr}`,
                borderLeft: `3px solid ${accent}`,
            }}>
                <span style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: accentText }}>
                    {title}
                </span>
            </div>

            {/* Column headers */}
            <div style={{
                display: 'grid', gridTemplateColumns: '1fr 28px 28px 40px 42px',
                gap: 4, padding: '3px 10px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                background: 'rgba(0,0,0,0.2)',
            }}>
                <span style={{ fontSize: '0.42rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>Player</span>
                {['K', 'D', 'K/D', 'Acc'].map(h => (
                    <span key={h} style={{ fontSize: '0.42rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)', textAlign: 'right' }}>{h}</span>
                ))}
            </div>

            {/* Rows */}
            {records.map((rec, i) => {
                const stats    = rec.user?.id ? statsById.get(rec.user.id) : undefined
                const hasStats = !!stats
                const isVacant = !rec.user
                const accuracy = hasStats && stats!.shots > 0
                    ? ((stats!.hits / stats!.shots) * 100).toFixed(1) + '%'
                    : '—'

                return (
                    <div key={rec.userId + i} style={{
                        display: 'grid', gridTemplateColumns: '1fr 28px 28px 40px 42px',
                        gap: 4, padding: '5px 10px', alignItems: 'center',
                        borderBottom: i < records.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined,
                        background: hasStats && stats!.kills > 0 ? accentRow : undefined,
                        opacity: isVacant ? 0.35 : 1,
                    }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.45rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.28)', lineHeight: 1, marginBottom: 2 }}>
                                {rec.orbatRole}
                            </div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: isVacant ? 'rgba(237,237,237,0.25)' : accentText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {rec.user?.displayName ?? '— Vacant —'}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: hasStats && stats!.kills > 0 ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.2)' }}>
                                {hasStats ? stats!.kills : '—'}
                            </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(237,237,237,0.35)' }}>
                                {hasStats ? stats!.deaths : '—'}
                            </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.62rem', fontWeight: 600, color: 'rgba(237,237,237,0.3)' }}>
                                {hasStats ? KdRatio(stats!.kills, stats!.deaths) : '—'}
                            </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.62rem', fontWeight: 600, color: hasStats && stats!.shots > 0 ? 'rgba(237,237,237,0.6)' : 'rgba(237,237,237,0.2)' }}>
                                {accuracy}
                            </span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ── Leaderboard View ──────────────────────────────────────────────────────────

function LeaderboardView({ sorted, topKills, userSectionColor, userSection, c, r, g, b }: {
    sorted: OcapPlayerStat[]
    topKills: number
    userSectionColor: Map<string, string>
    userSection: Map<string, string>
    c: (a: number) => string
    r: number; g: number; b: number
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{
                display: 'grid', gridTemplateColumns: '28px 1fr 160px 50px 50px 44px 50px 50px 50px',
                padding: '4px 10px', gap: 8, alignItems: 'center',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                {['#', 'Player', 'Section', 'Kills', 'Deaths', 'K/D', 'Shots', 'Hits', 'Acc'].map(h => (
                    <span key={h} style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)', textAlign: h === '#' || h === 'Player' || h === 'Section' ? 'left' : 'right' }}>
                        {h}
                    </span>
                ))}
            </div>

            {sorted.map((player, i) => {
                const rank      = i + 1
                const barWidth  = topKills > 0 ? (player.kills / topKills) * 100 : 0
                const sectHex   = player.userId ? userSectionColor.get(player.userId) : undefined
                const sectName  = player.userId ? userSection.get(player.userId) : undefined
                const barColor  = sectHex ? hexToRgba(sectHex, 0.1) : `rgba(${r},${g},${b},0.06)`
                const rowAccent = sectHex ? hexToRgba(sectHex, 0.04) : `rgba(${r},${g},${b},0.04)`
                const accuracy  = player.shots > 0 ? ((player.hits / player.shots) * 100).toFixed(1) + '%' : '—'

                return (
                    <div key={`${player.name}-${i}`} style={{
                        position: 'relative', overflow: 'hidden',
                        display: 'grid', gridTemplateColumns: '28px 1fr 160px 50px 50px 44px 50px 50px 50px',
                        padding: '6px 10px', gap: 8, alignItems: 'center',
                        borderLeft: sectHex ? `3px solid ${hexToRgba(sectHex, 0.55)}` : '3px solid transparent',
                        background: rank <= 3 ? rowAccent : 'rgba(0,0,0,0.2)',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                    }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barWidth}%`, background: barColor, pointerEvents: 'none' }} />

                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Medal rank={rank} />
                        </div>

                        <div style={{ position: 'relative', minWidth: 0 }}>
                            {player.username ? (
                                <Link href={`/milpacs/${player.username}`} style={{ textDecoration: 'none' }}>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: sectHex ? hexToRgba(sectHex, 0.9) : c(0.9), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                                        {player.displayName ?? player.name}
                                    </span>
                                    {player.displayName && player.displayName !== player.name && (
                                        <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)' }}>{player.name}</span>
                                    )}
                                </Link>
                            ) : (
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(237,237,237,0.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                                    {player.name}
                                </span>
                            )}
                        </div>

                        <div style={{ position: 'relative', minWidth: 0 }}>
                            <span style={{
                                fontSize: '0.58rem', fontWeight: 700,
                                color: sectHex ? hexToRgba(sectHex, 0.85) : 'rgba(237,237,237,0.3)',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block',
                            }}>
                                {sectName ?? '—'}
                            </span>
                        </div>
                        <div style={{ position: 'relative', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: player.kills > 0 ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.25)' }}>{player.kills}</span>
                        </div>
                        <div style={{ position: 'relative', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(237,237,237,0.45)' }}>{player.deaths}</span>
                        </div>
                        <div style={{ position: 'relative', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(237,237,237,0.5)' }}>{KdRatio(player.kills, player.deaths)}</span>
                        </div>
                        <div style={{ position: 'relative', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(237,237,237,0.35)' }}>{player.shots > 0 ? player.shots : '—'}</span>
                        </div>
                        <div style={{ position: 'relative', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(237,237,237,0.35)' }}>{player.hits > 0 ? player.hits : '—'}</span>
                        </div>
                        <div style={{ position: 'relative', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: player.shots > 0 ? 'rgba(237,237,237,0.65)' : 'rgba(237,237,237,0.2)' }}>{accuracy}</span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
