import Link from 'next/link'

interface Props {
    ocap: OcapData
    themeColor: string
    r: number
    g: number
    b: number
    pageTheme: 'modern' | 'oldfashioned' | 'scifi'
}

const SIDE_COLORS: Record<string, string> = {
    WEST: 'rgba(80,160,255,0.9)',
    EAST: 'rgba(220,80,80,0.9)',
    GUER: 'rgba(100,200,100,0.9)',
    CIV:  'rgba(200,160,60,0.9)',
}

function KdRatio(kills: number, deaths: number) {
    if (deaths === 0) return kills > 0 ? kills.toFixed(2) : '—'
    return (kills / deaths).toFixed(2)
}

function Medal({ rank }: { rank: number }) {
    if (rank === 1) return <span style={{ fontSize: '0.9rem' }}>🥇</span>
    if (rank === 2) return <span style={{ fontSize: '0.9rem' }}>🥈</span>
    if (rank === 3) return <span style={{ fontSize: '0.9rem' }}>🥉</span>
    return <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', fontWeight: 700, minWidth: 18, textAlign: 'center', display: 'inline-block' }}>{rank}</span>
}

export default function OcapStatsPanel({ ocap, themeColor, r, g, b, pageTheme }: Props) {
    const c = (a: number) => `rgba(${r},${g},${b},${a})`
    const isOF = pageTheme === 'oldfashioned'
    const isSF = pageTheme === 'scifi'

    const sorted = [...ocap.playerStats].sort((a, b) => b.kills - a.kills)
    const topKills = sorted[0]?.kills ?? 0

    const sides = Object.entries(ocap.sideComposition).filter(([, v]) => v.players > 0)

    return (
        <div style={isOF ? {
            position: 'relative',
            border: '1px solid rgba(160,120,50,0.25)',
            borderTop: '2px solid rgba(160,120,50,0.7)',
            background: '#1d1408',
        } : isSF ? {
            position: 'relative',
            border: `1px solid ${c(0.3)}`,
            borderTop: `2px solid ${c(0.8)}`,
            background: 'rgba(0,4,14,0.82)',
            boxShadow: `0 0 20px ${c(0.1)}, inset 0 0 30px ${c(0.03)}`,
        } : {
            position: 'relative',
            border: `1px solid ${c(0.18)}`,
            borderTop: `2px solid ${c(0.6)}`,
        }}>

            {/* Section header */}
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

                {/* ── Summary stats ─────────────────────────────────────────── */}
                <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', marginBottom: 20, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)' }}>
                    {[
                        ['Map',          ocap.worldName],
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

                {/* ── Side composition ──────────────────────────────────────── */}
                {sides.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
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
                                {[
                                    ['Players', data.players],
                                    ['Kills',   data.kills],
                                    ['KIA',     data.dead],
                                ].map(([lbl, val]) => (
                                    <div key={String(lbl)} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                        <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)' }}>{lbl}</span>
                                        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(237,237,237,0.65)' }}>{val}</span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Kill leaderboard ──────────────────────────────────────── */}
                <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)', marginBottom: 10 }}>
                    Kill Leaderboard
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Header row */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '28px 1fr 80px 60px 60px 50px',
                        padding: '4px 10px', gap: 8, alignItems: 'center',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        {['#', 'Player', 'Side', 'Kills', 'Deaths', 'K/D'].map(h => (
                            <span key={h} style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)' }}>
                                {h}
                            </span>
                        ))}
                    </div>

                    {sorted.map((player, i) => {
                        const rank = i + 1
                        const barWidth = topKills > 0 ? (player.kills / topKills) * 100 : 0

                        return (
                            <div key={`${player.name}-${i}`} style={{
                                position: 'relative', overflow: 'hidden',
                                display: 'grid', gridTemplateColumns: '28px 1fr 80px 60px 60px 50px',
                                padding: '6px 10px', gap: 8, alignItems: 'center',
                                background: rank <= 3 ? `rgba(${r},${g},${b},0.04)` : 'rgba(0,0,0,0.2)',
                                borderBottom: '1px solid rgba(255,255,255,0.03)',
                            }}>
                                {/* Kill bar background */}
                                <div style={{
                                    position: 'absolute', left: 0, top: 0, bottom: 0,
                                    width: `${barWidth}%`,
                                    background: `rgba(${r},${g},${b},0.06)`,
                                    pointerEvents: 'none',
                                }} />

                                {/* Rank */}
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Medal rank={rank} />
                                </div>

                                {/* Player name */}
                                <div style={{ position: 'relative', minWidth: 0 }}>
                                    {player.username ? (
                                        <Link
                                            href={`/milpacs/${player.username}`}
                                            style={{ textDecoration: 'none' }}
                                        >
                                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: c(0.9), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                                                {player.displayName ?? player.name}
                                            </span>
                                            {player.displayName && player.displayName !== player.name && (
                                                <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)' }}>
                                                    {player.name}
                                                </span>
                                            )}
                                        </Link>
                                    ) : (
                                        <>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(237,237,237,0.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                                                {player.name}
                                            </span>
                                        </>
                                    )}
                                </div>

                                {/* Side */}
                                <div style={{ position: 'relative' }}>
                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: SIDE_COLORS[player.side] ?? 'rgba(237,237,237,0.4)' }}>
                                        {player.side}
                                    </span>
                                </div>

                                {/* Kills */}
                                <div style={{ position: 'relative' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: player.kills > 0 ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.25)' }}>
                                        {player.kills}
                                    </span>
                                </div>

                                {/* Deaths */}
                                <div style={{ position: 'relative' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(237,237,237,0.45)' }}>
                                        {player.deaths}
                                    </span>
                                </div>

                                {/* K/D */}
                                <div style={{ position: 'relative' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(237,237,237,0.5)' }}>
                                        {KdRatio(player.kills, player.deaths)}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Footer */}
                <div style={{ marginTop: 12, fontSize: '0.52rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.1em' }}>
                    Synced from OCAP on {new Date(ocap.syncedAt).toLocaleDateString()} · {ocap.filename}
                </div>
            </div>
        </div>
    )
}
