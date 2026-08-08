'use client'

import React, { useState, useEffect } from 'react'

interface Props {
    operationId: string
    themeColor?: string
}

// ── Color helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

// Per-slide glow values — alpha reduced ~40% from original
const SLIDE_GLOW: Record<number, string> = {
    2:  'rgba(121,85,42,0.17)',    // Terrain — brown
    5:  'rgba(30,60,140,0.19)',    // BLUFOR — blue
    6:  'rgba(46,125,50,0.17)',    // Independent Forces — green
    7:  'rgba(106,27,154,0.17)',   // Civilians — purple
    8:  'rgba(153,132,15,0.17)',   // Other Parties — olive
}
function slideGlow(s: number) {
    return SLIDE_GLOW[s] ?? 'rgba(198,40,40,0.08)'
}

const TOTAL = 15

const SLIDE_NAMES = [
    'Cover',
    'Area of Operations',
    'Terrain',
    'Enemy Overview',
    'High Value / Priority Targets',
    'BLUFOR Forces',
    'Independent Forces',
    'Civilians',
    'Other Parties',
    'Commander\'s Mission Statement',
    'Likely Tasks During Deployment',
    'Supply & Assets',
    'ROE & Order for Opening Fire',
    'Command & Signals',
    'Closing',
]

const SLIDE_KICKERS = [
    null,
    '[ 01 ] AREA OF OPERATIONS',
    '[ 02 ] STRATEGIC SITUATION',
    '[ 02 ] STRATEGIC SITUATION',
    '[ 02 ] STRATEGIC SITUATION',
    '[ 02 ] STRATEGIC SITUATION',
    '[ 02 ] STRATEGIC SITUATION',
    '[ 02 ] STRATEGIC SITUATION',
    '[ 02 ] STRATEGIC SITUATION',
    '[ 03 ] MISSION',
    '[ 04 ] EXECUTION',
    '[ 05 ] ADMINISTRATION & LOGISTICS',
    '[ 05 ] ADMINISTRATION & LOGISTICS',
    '[ 06 ] COMMAND & SIGNALS',
    null,
]

const SLIDE_TITLES = [
    null,
    'LOCATION & CURRENT SITUATION',
    'TERRAIN',
    'ENEMY',
    'HIGH VALUE / PRIORITY TARGETS',
    'BLUFOR FORCES',
    'INDEPENDENT FORCES',
    'CIVILIANS',
    'OTHER PARTIES',
    'COMMANDER\'S MISSION STATEMENT',
    'LIKELY TASKS DURING DEPLOYMENT',
    'SUPPLY & ASSETS',
    'ROE & ORDER FOR OPENING FIRE',
    'COMMAND & SIGNALS',
    null,
]

const SECTION_LABELS = [
    'COVER',
    'AREA OF OPERATIONS',
    'TERRAIN',
    'ENEMY OVERVIEW',
    'HIGH VALUE TARGETS',
    'BLUFOR FORCES',
    'INDEPENDENT FORCES',
    'CIVILIANS',
    'OTHER PARTIES',
    'MISSION',
    'EXECUTION',
    'ADMIN & LOGISTICS',
    'ROE & OFOF',
    'COMMAND & SIGNALS',
    'CLOSING',
]

const STATUS_COLORS: Record<string, string> = {
    full:     '#8fd18f',
    adequate: '#e5d95f',
    low:      '#f0a355',
    critical: '#e05353',
}

// ── ROE defaults ─────────────────────────────────────────────────────────────

const ROE_DEFAULTS = {
    free: {
        color: '#c62828',
        label: 'WEAPONS FREE',
        summary: 'Targets not positively identified as friendly may be engaged, provided they meet the authorised hostile criteria and remain valid under the mission ROE.',
        rules: [
            { heading: 'FRIENDLY IDENTIFICATION', text: 'Do not engage personnel, vehicles or positions positively identified as friendly.' },
            { heading: 'AUTHORISED TARGETS', text: 'Engage only targets that fall within the declared hostile categories and authorised operational area.' },
            { heading: 'PROTECTED PERSONS', text: 'Do not deliberately engage civilians, medical personnel, surrendered personnel or other protected persons.' },
            { heading: 'FIRE CONTROL', text: 'Use aimed and controlled fire. Observe all restricted areas, protected locations and weapon limitations.' },
            { heading: 'TARGET VALIDITY', text: 'Cease engagement when the target surrenders, becomes incapacitated, is identified as friendly or is otherwise no longer valid.' },
            { heading: 'REPORTING', text: 'Report civilian casualties, friendly-fire incidents and suspected ROE breaches through the chain of command.' },
        ],
    },
    tight: {
        color: '#e5d95f',
        label: 'WEAPONS TIGHT',
        summary: 'Engage only positively identified hostile targets, unless acting in immediate self-defence or under a direct engagement order.',
        rules: [
            { heading: 'POSITIVE IDENTIFICATION', text: 'Confirm that the target is hostile before engaging.' },
            { heading: 'SUSPICION IS INSUFFICIENT', text: 'Being armed, unidentified or behaving suspiciously does not by itself authorise engagement.' },
            { heading: 'CONFIRMATION', text: 'When positive identification cannot be established, maintain observation and request direction.' },
            { heading: 'SELF-DEFENCE', text: 'Immediate force may be used to stop a hostile act or imminent threat to friendly personnel.' },
            { heading: 'FIRE CONTROL', text: 'Use aimed and controlled fire, and cease engagement when the threat or authority to engage ends.' },
            { heading: 'REPORTING', text: 'Report engagements, civilian casualties, friendly-fire incidents and uncertain target identification.' },
        ],
    },
    hold: {
        color: '#8fd18f',
        label: 'WEAPONS HOLD',
        summary: 'Do not engage unless acting in immediate self-defence or specifically ordered to fire by authorised command.',
        rules: [
            { heading: 'WITHHOLD FIRE', text: 'Maintain weapon readiness but do not engage without the required authority.' },
            { heading: 'OBSERVE AND REPORT', text: 'Track suspected hostile personnel, vehicles or positions and report their activity.' },
            { heading: 'ENGAGEMENT AUTHORITY', text: 'Engagement requires an order from the designated commander or authority identified in the mission briefing.' },
            { heading: 'SELF-DEFENCE', text: 'Without an engagement order, force is limited to stopping an immediate hostile act or imminent threat.' },
            { heading: 'MINIMUM NECESSARY FORCE', text: 'When engagement becomes authorised, use only the force required and cease when the threat ends.' },
            { heading: 'REPORTING', text: 'Immediately report hostile activity, engagement requests and any use of force.' },
        ],
    },
} as const

// ── HVT priority helpers ──────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
    high:   '#c62828',
    medium: '#e5a020',
    low:    '#8fd18f',
}

// ── Shared sub-components ────────────────────────────────────────────────────

function CornerBrackets({ color, size = 22, offset = 0 }: { color: string; size?: number; offset?: number }) {
    const bs: React.CSSProperties = { position: 'absolute', width: size, height: size }
    const border = `2px solid ${color}`
    return (
        <>
            <div style={{ ...bs, top: offset, left: offset, borderTop: border, borderLeft: border }} />
            <div style={{ ...bs, top: offset, right: offset, borderTop: border, borderRight: border }} />
            <div style={{ ...bs, bottom: offset, left: offset, borderBottom: border, borderLeft: border }} />
            <div style={{ ...bs, bottom: offset, right: offset, borderBottom: border, borderRight: border }} />
        </>
    )
}

// Hatch image placeholder
function HatchPlaceholder({ caption, minH = 180, small = false }: { caption: string; minH?: number; small?: boolean }) {
    return (
        <div style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            minHeight: minH,
            background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 2px, transparent 2px, transparent 14px)',
            border: '1px solid rgba(255,255,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        }}>
            <CornerBrackets color='#c62828' size={small ? 12 : 16} />
            <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: small ? '0.52rem' : '0.6rem',
                color: '#7d8088',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                textAlign: 'center',
                padding: '0 20px',
            }}>{caption}</span>
        </div>
    )
}

function ImageOrPlaceholder({ src, caption, minH = 180, small = false }: { src?: string; caption: string; minH?: number; small?: boolean }) {
    if (src) {
        return (
            <div style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                minHeight: minH,
                border: '1px solid rgba(198,40,40,0.35)',
                flexShrink: 0,
                overflow: 'hidden',
            }}>
                <CornerBrackets color='#c62828' size={small ? 12 : 16} offset={0} />
                <img
                    src={src}
                    alt={caption}
                    style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
                />
            </div>
        )
    }
    return <HatchPlaceholder caption={caption} minH={minH} small={small} />
}

// Standard field card
function FieldCard({
    label,
    value,
    placeholder,
    glow,
    enemy = false,
    style: extraStyle,
}: {
    label: string
    value?: string
    placeholder: string
    glow: string
    enemy?: boolean
    style?: React.CSSProperties
}) {
    return (
        <div style={{
            background: enemy ? '#111114' : '#0d0d10',
            border: `1px solid ${enemy ? 'rgba(198,40,40,0.3)' : 'rgba(198,40,40,0.18)'}`,
            boxShadow: `0 0 20px 4px ${enemy ? 'rgba(198,40,40,0.08)' : glow}`,
            padding: '14px 20px',
            ...extraStyle,
        }}>
            <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.6rem',
                color: enemy ? '#c62828' : '#7d8088',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                marginBottom: 5,
            }}>
                {label}
            </div>
            {value
                ? <div style={{ fontSize: '0.875rem', color: '#f0efec', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{value}</div>
                : <div style={{ fontSize: '0.875rem', color: '#8f9299', lineHeight: 1.55, fontFamily: "'JetBrains Mono', monospace" }}>{placeholder}</div>
            }
        </div>
    )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function IntelPackageViewer({ operationId, themeColor = '#c62828' }: Props) {
    const [pkg, setPkg]         = useState<IntelPackage | null>(null)
    const [loading, setLoading] = useState(true)
    const [slide, setSlide]     = useState(0)

    const { r, g, b } = hexToRgb(themeColor)
    const tc = (a: number) => `rgba(${r},${g},${b},${a})`

    // Inject Google Fonts
    useEffect(() => {
        const id = 'intel-pkg-fonts'
        if (!document.getElementById(id)) {
            const link = document.createElement('link')
            link.id   = id
            link.rel  = 'stylesheet'
            link.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&family=JetBrains+Mono:wght@400;600&family=Barlow:wght@400;500&display=swap'
            document.head.appendChild(link)
        }
    }, [])

    // Fetch intel package
    useEffect(() => {
        fetch(`/api/operations/intel-package/${operationId}`)
            .then(res => res.json())
            .then(({ package: p }) => setPkg(p ?? null))
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [operationId])

    // Keyboard navigation
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'ArrowLeft')  setSlide(s => Math.max(0, s - 1))
            if (e.key === 'ArrowRight') setSlide(s => Math.min(TOTAL - 1, s + 1))
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    if (loading) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 500, background: '#07070a',
                color: 'rgba(240,239,236,0.2)', fontSize: '0.65rem',
                letterSpacing: '0.22em', textTransform: 'uppercase',
                fontFamily: "'JetBrains Mono', monospace",
            }}>
                Loading Intel Package...
            </div>
        )
    }

    const p    = pkg ?? {} as IntelPackage
    const glow = slideGlow(slide)

    // ── Slide renderers ──────────────────────────────────────────────────────

    function renderSlide(): React.ReactNode {
        switch (slide) {

            // 0 ── Cover ──────────────────────────────────────────────────────
            case 0: {
                const opName = p.cover?.operationName
                const opDate = p.cover?.operationDate
                const sub    = p.cover?.subTitle
                return (
                    <div style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: 56, padding: '40px 0',
                    }}>
                        {/* Left: logo with red ring */}
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                            <div style={{
                                width: 112, height: 112,
                                borderRadius: '50%',
                                border: '1px solid rgba(198,40,40,0.35)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <img
                                    src='/ASOT-logo.png'
                                    alt='ASOT'
                                    style={{ width: 84, height: 84, objectFit: 'contain', opacity: 0.88 }}
                                />
                            </div>
                        </div>

                        {/* Right: text panel */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
                            <div style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '0.62rem', fontWeight: 600,
                                letterSpacing: '0.3em', textTransform: 'uppercase',
                                color: tc(1.0),
                                marginBottom: 2,
                            }}>
                                [ ASOT : INTEL CELL ]
                            </div>

                            <div style={{
                                fontFamily: "'Oswald', sans-serif",
                                fontSize: '0.75rem', fontWeight: 600,
                                letterSpacing: '0.38em', textTransform: 'uppercase',
                                color: '#7d8088',
                            }}>
                                INTEL PACKAGE
                            </div>

                            <div style={{
                                fontFamily: "'Oswald', sans-serif",
                                fontSize: '2.4rem', fontWeight: 700,
                                textTransform: 'uppercase',
                                color: '#f6f5f2',
                                lineHeight: 1.05,
                                borderBottom: '2px solid rgba(198,40,40,0.4)',
                                paddingBottom: 12,
                                marginBottom: 4,
                            }}>
                                {opName || <span style={{ color: '#8f9299' }}>[ Operation Name / Codename ]</span>}
                            </div>

                            {sub && (
                                <div style={{
                                    fontSize: '0.82rem', fontWeight: 500,
                                    letterSpacing: '0.14em', textTransform: 'uppercase',
                                    color: '#8f9299', fontFamily: "'Barlow', sans-serif",
                                }}>
                                    {sub}
                                </div>
                            )}

                            {/* Status / date chips */}
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '6px 16px',
                                    border: `1px solid ${tc(0.3)}`,
                                    background: tc(0.06),
                                }}>
                                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.52rem', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7d8088' }}>DATE</span>
                                    <div style={{ width: 1, height: 12, background: 'rgba(198,40,40,0.3)' }} />
                                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', fontWeight: 400, color: '#f0efec' }}>
                                        {opDate || <span style={{ color: '#6d7078' }}>[ DATE TBD ]</span>}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            // 1 ── Area of Operations ──────────────────────────────────────────
            case 1: return (
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 20, minHeight: 300 }}>
                    {/* Left: 2 stacked cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <FieldCard
                            label='LOCATION'
                            value={undefined}
                            placeholder='[ Region / Country / Grid Reference ]'
                            glow={glow}
                            style={{ flex: 1 }}
                        />
                        <FieldCard
                            label='CURRENT SITUATION'
                            value={p.areaOfOps?.situation}
                            placeholder='[ 2–3 sentence summary of current developments and stability in the AO. ]'
                            glow={glow}
                            style={{ flex: 1 }}
                        />
                    </div>
                    {/* Right: map image */}
                    <ImageOrPlaceholder
                        src={p.areaOfOps?.mapImagePath}
                        caption='[ AO MAP — INSERT IMAGERY ]'
                        minH={300}
                    />
                </div>
            )

            // 2 ── Terrain ─────────────────────────────────────────────────────
            case 2: return (
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20, minHeight: 320 }}>
                    {/* Left: terrain image */}
                    <ImageOrPlaceholder
                        src={p.terrain?.imagePath}
                        caption='[ TERRAIN OVERVIEW — INSERT IMAGERY ]'
                        minH={320}
                    />
                    {/* Right: 3 stacked cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <FieldCard label='DOMINANT TERRAIN'      value={p.terrain?.keyTerrain}        placeholder='[ Terrain type ]'                           glow={glow} style={{ flex: 1 }} />
                        <FieldCard label='KEY FEATURES'          value={p.terrain?.observation}        placeholder='[ High ground, waterways, chokepoints ]'    glow={glow} style={{ flex: 1 }} />
                        <FieldCard label='MOBILITY CORRIDORS'    value={p.terrain?.coverConcealment}   placeholder='[ Avenues of approach / restricted routes ]' glow={glow} style={{ flex: 1 }} />
                    </div>
                </div>
            )

            // 3 ── Enemy ───────────────────────────────────────────────────────
            case 3: return (
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, minHeight: 320 }}>
                    {/* Left: 2×2 enemy field cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 14 }}>
                        <FieldCard label='▸ DESIGNATION'  value={p.enemyOverview?.composition} placeholder='[ Force / group name ]'                  glow={glow} enemy />
                        <FieldCard label='▸ EST. STRENGTH' value={p.enemyOverview?.strength}    placeholder='[ Estimated personnel / units ]'         glow={glow} enemy />
                        <FieldCard label='▸ DISPOSITION'  value={p.enemyOverview?.disposition} placeholder='[ Known locations / movement pattern ]'  glow={glow} enemy />
                        <FieldCard label='▸ INTENT'       value={p.enemyOverview?.capabilities} placeholder='[ Likely objective ]'                    glow={glow} enemy />
                    </div>
                    {/* Right: 2 stacked images */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ flex: 1 }}>
                            <ImageOrPlaceholder src={p.enemyOverview?.image1Path} caption='[ ENEMY IMAGERY 1 — OPTIONAL ]' minH={140} small />
                        </div>
                        <div style={{ flex: 1 }}>
                            <ImageOrPlaceholder src={p.enemyOverview?.image2Path} caption='[ ENEMY IMAGERY 2 — OPTIONAL ]' minH={140} small />
                        </div>
                    </div>
                </div>
            )

            // 4 ── High Value Targets ──────────────────────────────────────────
            case 4: {
                const hvts = (p.highValueTargets ?? []).slice(0, 3)
                const showPlaceholders = hvts.length === 0
                const displayHvts = showPlaceholders
                    ? [{ id: 'ph1' }, { id: 'ph2' }, { id: 'ph3' }] as IntelPackageHvt[]
                    : hvts
                return (
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                        {displayHvts.map((hvt, i) => {
                            const realHvt = showPlaceholders ? null : hvt
                            const priority = realHvt?.priority
                            const priorityColor = priority ? PRIORITY_COLORS[priority] : undefined
                            return (
                                <div key={hvt.id ?? i} style={{
                                    background: '#111114',
                                    border: '1px solid rgba(198,40,40,0.3)',
                                    boxShadow: `0 0 20px 4px ${glow}`,
                                    display: 'flex', flexDirection: 'column',
                                }}>
                                    {/* Image area */}
                                    <div style={{ flex: 1, minHeight: 180, overflow: 'hidden' }}>
                                        <ImageOrPlaceholder
                                            src={realHvt?.imagePath}
                                            caption='[ PHOTO ]'
                                            minH={180}
                                        />
                                    </div>
                                    {/* Footer strip */}
                                    <div style={{
                                        background: '#0d0d10',
                                        borderTop: '1px solid rgba(198,40,40,0.18)',
                                        padding: '12px 16px',
                                        display: 'flex', flexDirection: 'column', gap: 4,
                                    }}>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                                        }}>
                                            <div style={{
                                                fontFamily: "'JetBrains Mono', monospace",
                                                fontSize: '0.58rem', fontWeight: 600,
                                                color: '#c62828', letterSpacing: '2px', textTransform: 'uppercase',
                                            }}>
                                                {`HVT-0${i + 1}`}
                                            </div>
                                            {priority && priorityColor && (
                                                <div style={{
                                                    fontFamily: "'JetBrains Mono', monospace",
                                                    fontSize: '0.52rem', fontWeight: 600,
                                                    color: priorityColor,
                                                    letterSpacing: '1.5px',
                                                    textTransform: 'uppercase',
                                                    border: `1px solid ${priorityColor}66`,
                                                    background: `${priorityColor}14`,
                                                    padding: '2px 7px',
                                                    flexShrink: 0,
                                                }}>
                                                    {`PRIORITY: ${priority.toUpperCase()}`}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{
                                            fontFamily: "'JetBrains Mono', monospace",
                                            fontSize: '0.8rem', fontWeight: 400,
                                            color: realHvt?.name ? '#f0efec' : '#8f9299',
                                        }}>
                                            {realHvt?.name || '[ Name / Alias ]'}
                                        </div>
                                        {realHvt?.role && (
                                            <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.48rem', color: '#4d4f54', letterSpacing: '1.5px', textTransform: 'uppercase', flexShrink: 0 }}>ROLE:</span>
                                                <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: '0.68rem', color: '#7d8088' }}>{realHvt.role}</span>
                                            </div>
                                        )}
                                        {realHvt?.location && (
                                            <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.48rem', color: '#4d4f54', letterSpacing: '1.5px', textTransform: 'uppercase', flexShrink: 0 }}>LAST KNOWN LOCATION:</span>
                                                <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: '0.68rem', color: '#7d8088' }}>{realHvt.location}</span>
                                            </div>
                                        )}
                                        {!realHvt?.role && !realHvt?.location && (
                                            <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '0.68rem', color: '#4d4f54' }}>
                                                [ Role · Last known location ]
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )
            }

            // 5 ── BLUFOR Forces ───────────────────────────────────────────────
            case 5: {
                const callsigns    = p.bluforForces?.callsigns ?? []
                const mainCs       = callsigns.slice(0, 4)
                const additionalCs = callsigns.slice(4)

                return (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Top row: HQ + Disposition */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <FieldCard
                                label='HIGHER HEADQUARTERS'
                                value={p.bluforForces?.hqDisposition}
                                placeholder='[ Higher HQ / supporting command ]'
                                glow={glow}
                            />
                            <FieldCard
                                label='DISPOSITION'
                                value={p.bluforForces?.additionalCallsigns}
                                placeholder='[ Current locations relative to AO ]'
                                glow={glow}
                            />
                        </div>

                        {/* Main callsigns label */}
                        <div style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '0.6rem', fontWeight: 600,
                            color: '#7d8088', letterSpacing: '2px', textTransform: 'uppercase',
                        }}>
                            ASOT CALLSIGNS DEPLOYING
                        </div>

                        {/* Main callsign cards (4-column) */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                            {(mainCs.length > 0 ? mainCs : [null, null, null, null]).map((cs, i) => (
                                <div key={i} style={{
                                    background: '#0d0d10',
                                    border: '1px solid rgba(198,40,40,0.18)',
                                    boxShadow: `0 0 20px 4px ${glow}`,
                                    padding: '12px 16px',
                                }}>
                                    <div style={{
                                        fontFamily: "'JetBrains Mono', monospace",
                                        fontSize: '0.8rem', fontWeight: 600,
                                        color: cs ? '#f0efec' : '#8f9299',
                                        marginBottom: 4,
                                    }}>
                                        {cs?.callsign || '[ CALLSIGN ]'}
                                    </div>
                                    <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '0.72rem', color: '#7d8088' }}>
                                        {cs?.element || '[ Element / role ]'}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Additional callsigns */}
                        {additionalCs.length > 0 && (
                            <>
                                <div style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: '0.6rem', fontWeight: 600,
                                    color: '#8fd18f', letterSpacing: '2px', textTransform: 'uppercase',
                                }}>
                                    ADDITIONAL CALLSIGNS
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                                    {additionalCs.map((cs, i) => (
                                        <div key={i} style={{
                                            background: '#0d100d',
                                            border: '1px solid rgba(143,209,143,0.35)',
                                            boxShadow: '0 0 20px 4px rgba(143,209,143,0.07)',
                                            padding: '12px 16px',
                                        }}>
                                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', fontWeight: 600, color: '#8fd18f', marginBottom: 4 }}>
                                                {cs.callsign || '[ CALLSIGN ]'}
                                            </div>
                                            <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: '0.72rem', color: '#7d8088' }}>
                                                {cs.element || '[ Element / role ]'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )
            }

            // 6 ── Independent Forces ──────────────────────────────────────────
            case 6: {
                const party    = p.independentForces ?? {}
                const defaults = ['Designation', 'Est. Strength', 'Disposition', 'Alignment / Intent']
                return (
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 14 }}>
                            <FieldCard label={party.q1Label || defaults[0]} value={party.q1} placeholder={`[ ${defaults[0]} ]`} glow={glow} />
                            <FieldCard label={party.q2Label || defaults[1]} value={party.q2} placeholder={`[ ${defaults[1]} ]`} glow={glow} />
                            <FieldCard label={party.q3Label || defaults[2]} value={party.q3} placeholder={`[ ${defaults[2]} ]`} glow={glow} />
                            <FieldCard label={party.q4Label || defaults[3]} value={party.q4} placeholder={`[ ${defaults[3]} ]`} glow={glow} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ flex: 1 }}><ImageOrPlaceholder src={party.image1Path} caption='[ IMAGERY 1 — OPTIONAL ]' minH={130} small /></div>
                            <div style={{ flex: 1 }}><ImageOrPlaceholder src={party.image2Path} caption='[ IMAGERY 2 — OPTIONAL ]' minH={130} small /></div>
                        </div>
                    </div>
                )
            }

            // 7 ── Civilians ───────────────────────────────────────────────────
            case 7: {
                const party    = p.civilians ?? {}
                const defaults = ['Population Density', 'Sentiment', 'Displacement', 'Pattern of Life']
                return (
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
                        {/* Left: 2 stacked images */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ flex: 1 }}><ImageOrPlaceholder src={party.image1Path} caption='[ IMAGERY 1 — OPTIONAL ]' minH={130} small /></div>
                            <div style={{ flex: 1 }}><ImageOrPlaceholder src={party.image2Path} caption='[ IMAGERY 2 — OPTIONAL ]' minH={130} small /></div>
                        </div>
                        {/* Right: 2×2 fields */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 14 }}>
                            <FieldCard label={party.q1Label || defaults[0]} value={party.q1} placeholder={`[ ${defaults[0]} ]`} glow={glow} />
                            <FieldCard label={party.q2Label || defaults[1]} value={party.q2} placeholder={`[ ${defaults[1]} ]`} glow={glow} />
                            <FieldCard label={party.q3Label || defaults[2]} value={party.q3} placeholder={`[ ${defaults[2]} ]`} glow={glow} />
                            <FieldCard label={party.q4Label || defaults[3]} value={party.q4} placeholder={`[ ${defaults[3]} ]`} glow={glow} />
                        </div>
                    </div>
                )
            }

            // 8 ── Other Parties ───────────────────────────────────────────────
            case 8: {
                const party    = p.otherParties ?? {}
                const defaults = ['Organizations Present', 'Primary Activities', 'Locations', 'Coordination Notes']
                return (
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 14 }}>
                            <FieldCard label={party.q1Label || defaults[0]} value={party.q1} placeholder={`[ ${defaults[0]} ]`} glow={glow} />
                            <FieldCard label={party.q2Label || defaults[1]} value={party.q2} placeholder={`[ ${defaults[1]} ]`} glow={glow} />
                            <FieldCard label={party.q3Label || defaults[2]} value={party.q3} placeholder={`[ ${defaults[2]} ]`} glow={glow} />
                            <FieldCard label={party.q4Label || defaults[3]} value={party.q4} placeholder={`[ ${defaults[3]} ]`} glow={glow} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ flex: 1 }}><ImageOrPlaceholder src={party.image1Path} caption='[ IMAGERY 1 — OPTIONAL ]' minH={130} small /></div>
                            <div style={{ flex: 1 }}><ImageOrPlaceholder src={party.image2Path} caption='[ IMAGERY 2 — OPTIONAL ]' minH={130} small /></div>
                        </div>
                    </div>
                )
            }

            // 9 ── Mission ─────────────────────────────────────────────────────
            case 9: {
                const stmt = p.mission?.statement
                return (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {/* Mission statement */}
                        <div style={{
                            background: '#0d0d10',
                            border: '1px solid rgba(198,40,40,0.18)',
                            boxShadow: `0 0 20px 4px ${glow}`,
                            padding: '20px 24px',
                        }}>
                            <div style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '0.6rem', fontWeight: 600,
                                color: '#7d8088', letterSpacing: '2px', textTransform: 'uppercase',
                                marginBottom: 12,
                            }}>
                                MISSION STATEMENT
                            </div>
                            {stmt
                                ? (
                                    <div style={{ fontSize: '0.95rem', color: '#f0efec', lineHeight: 1.65, fontFamily: "'Barlow', sans-serif", fontWeight: 400 }}>
                                        {stmt}
                                    </div>
                                )
                                : (
                                    <div style={{ fontSize: '0.95rem', lineHeight: 1.65, fontFamily: "'Barlow', sans-serif", color: '#8f9299' }}>
                                        {'ASOT will '}
                                        <span style={{ color: '#c62828', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.82rem' }}>[ WHAT ]</span>
                                        {' in '}
                                        <span style={{ color: '#c62828', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.82rem' }}>[ WHERE ]</span>
                                        {' at/by '}
                                        <span style={{ color: '#c62828', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.82rem' }}>[ WHEN ]</span>
                                        {' in order to '}
                                        <span style={{ color: '#c62828', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.82rem' }}>[ WHY ]</span>
                                        {'.'}
                                    </div>
                                )
                            }
                        </div>

                        {/* 5-column who/what/when/where/why */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                            {[
                                { label: 'WHO',   value: p.mission?.who,   ph: '[ Unit ]' },
                                { label: 'WHAT',  value: p.mission?.what,  ph: '[ Task ]' },
                                { label: 'WHEN',  value: p.mission?.when,  ph: '[ DTG ]' },
                                { label: 'WHERE', value: p.mission?.where, ph: '[ Location ]' },
                                { label: 'WHY',   value: p.mission?.why,   ph: '[ Purpose ]' },
                            ].map(({ label, value, ph }) => (
                                <div key={label} style={{
                                    background: '#0d0d10',
                                    border: '1px solid rgba(198,40,40,0.18)',
                                    boxShadow: `0 0 20px 4px ${glow}`,
                                    padding: '14px 20px',
                                    textAlign: 'center',
                                }}>
                                    <div style={{
                                        fontFamily: "'JetBrains Mono', monospace",
                                        fontSize: '0.6rem', fontWeight: 600,
                                        color: '#7d8088', letterSpacing: '2px',
                                        textTransform: 'uppercase', marginBottom: 8,
                                    }}>
                                        {label}
                                    </div>
                                    <div style={{ fontSize: '0.82rem', color: value ? '#f0efec' : '#8f9299', lineHeight: 1.5, fontFamily: "'Barlow', sans-serif" }}>
                                        {value || ph}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }

            // 10 ── Execution ──────────────────────────────────────────────────
            case 10: {
                const tasks    = p.execution?.tasks ?? []
                const imgPath  = p.execution?.imagePath
                const placeholders = [
                    '[ Likely task — e.g. reconnaissance of NAI ]',
                    '[ Likely task — e.g. partner force liaison ]',
                    '[ Likely task — e.g. security of key infrastructure ]',
                    '[ Likely task — e.g. quick reaction force standby ]',
                ]
                const displayTasks = tasks.length > 0
                    ? tasks
                    : placeholders.map((t, i) => ({ label: String(i + 1).padStart(2, '0'), text: t })) as IntelPackageTask[]
                const isEmpty = tasks.length === 0

                return (
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, minHeight: 280 }}>
                        {/* Left: task list */}
                        <div style={{
                            background: '#0d0d10',
                            border: '1px solid rgba(198,40,40,0.18)',
                            boxShadow: `0 0 20px 4px ${glow}`,
                            padding: '14px 20px',
                            display: 'flex', flexDirection: 'column',
                        }}>
                            <div style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '0.6rem', fontWeight: 600,
                                color: '#7d8088', letterSpacing: '2px',
                                textTransform: 'uppercase', marginBottom: 12,
                            }}>
                                TASKS
                            </div>
                            {displayTasks.map((task, i) => (
                                <div key={i} style={{
                                    display: 'grid', gridTemplateColumns: '36px 1fr',
                                    gap: 14, alignItems: 'flex-start',
                                    padding: '10px 0',
                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                }}>
                                    <div style={{
                                        fontFamily: "'JetBrains Mono', monospace",
                                        fontSize: '0.82rem', fontWeight: 600,
                                        color: '#c62828',
                                    }}>
                                        {task.label || String(i + 1).padStart(2, '0')}
                                    </div>
                                    <div style={{
                                        fontSize: '0.875rem',
                                        color: isEmpty ? '#8f9299' : '#f0efec',
                                        lineHeight: 1.55,
                                        fontFamily: "'Barlow', sans-serif",
                                    }}>
                                        {task.text}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* Right: image */}
                        <ImageOrPlaceholder src={imgPath} caption='[ IMAGERY — OPTIONAL ]' minH={280} />
                    </div>
                )
            }

            // 11 ── Admin & Logistics ──────────────────────────────────────────
            case 11: {
                const supplies = p.adminLogistics?.supplyStatus ?? []
                return (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
                        {/* Supply status pills */}
                        {supplies.length > 0 && (
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                {supplies.map((s, i) => {
                                    const color = STATUS_COLORS[s.status] ?? '#888'
                                    return (
                                        <div key={i} style={{
                                            border: `1.5px solid ${color}`,
                                            background: `${color}14`,
                                            padding: '8px 18px',
                                            display: 'flex', flexDirection: 'column', gap: 2,
                                            minWidth: 90,
                                        }}>
                                            <div style={{
                                                fontFamily: "'JetBrains Mono', monospace",
                                                fontSize: '0.52rem', fontWeight: 600,
                                                color: '#7d8088', letterSpacing: '2px', textTransform: 'uppercase',
                                            }}>
                                                {s.category}
                                            </div>
                                            <div style={{
                                                fontFamily: "'Oswald', sans-serif",
                                                fontSize: '1rem', fontWeight: 700,
                                                color, textTransform: 'uppercase', letterSpacing: '0.06em',
                                            }}>
                                                {s.status}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {/* Supply Summary card */}
                        <FieldCard
                            label='SUPPLY SUMMARY'
                            value={p.adminLogistics?.supplySummary}
                            placeholder='[ 1–3 sentence summary of the overall supply situation... ]'
                            glow={glow}
                        />

                        {/* Assets Available card */}
                        <FieldCard
                            label='ASSETS AVAILABLE'
                            value={p.adminLogistics?.assets}
                            placeholder='[ Vehicles, aircraft, medevac, resupply schedule ]'
                            glow={glow}
                        />
                    </div>
                )
            }

            // 12 ── ROE & OFOF ─────────────────────────────────────────────────
            case 12: {
                const ws = p.roeOfof?.weaponsState ?? 'tight'
                const roeConfig = ROE_DEFAULTS[ws]
                const stateColor   = roeConfig.color
                const stateLabel   = roeConfig.label
                const stateSummary = p.roeOfof?.customSummary || roeConfig.summary
                const standardRules = p.roeOfof?.standardRulesOverrides?.[ws] ?? roeConfig.rules
                const customRules  = p.roeOfof?.customRules ?? []

                // Merge: standard rules first, then custom
                const allRules: { heading?: string; text: string; isCustom: boolean }[] = [
                    ...standardRules.map(r => ({ heading: r.heading, text: r.text, isCustom: false })),
                    ...customRules.map(r => ({ heading: r.heading, text: r.text, isCustom: true })),
                ]
                const totalRules = allRules.length
                const tightSpacing = totalRules > 8
                const showReminder = totalRules <= 10

                const stateConfigs = [
                    { key: 'free'  as const, label: 'WEAPONS FREE',  color: '#c62828' },
                    { key: 'tight' as const, label: 'WEAPONS TIGHT', color: '#e5d95f' },
                    { key: 'hold'  as const, label: 'WEAPONS HOLD',  color: '#8fd18f' },
                ]

                return (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>

                        {/* 1. Weapon state selector row (read-only) */}
                        <div style={{ display: 'flex', gap: 10 }}>
                            {stateConfigs.map(({ key, label, color }) => {
                                const active = ws === key
                                return (
                                    <div key={key} style={{
                                        flex: 1, padding: '11px 16px',
                                        background: active ? `${color}18` : 'rgba(255,255,255,0.02)',
                                        border: active ? `2px solid ${color}` : `1px solid ${color}28`,
                                        boxShadow: active ? `0 0 16px 3px ${color}22` : 'none',
                                        display: 'flex', alignItems: 'center', gap: 10,
                                    }}>
                                        <div style={{
                                            fontSize: active ? '0.95rem' : '0.65rem',
                                            color: active ? color : `${color}50`,
                                            lineHeight: 1,
                                        }}>
                                            {active ? '◉' : '○'}
                                        </div>
                                        <span style={{
                                            fontFamily: "'JetBrains Mono', monospace",
                                            fontSize: '0.72rem', fontWeight: 600,
                                            letterSpacing: '1.5px', textTransform: 'uppercase',
                                            color: active ? color : `${color}50`,
                                        }}>
                                            {label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>

                        {/* 2. "ACTIVE FIRE CONTROL STATE" row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '0.58rem', color: '#7d8088',
                                letterSpacing: '4px', textTransform: 'uppercase',
                            }}>
                                ACTIVE FIRE CONTROL STATE
                            </span>
                            <span style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '0.58rem', fontWeight: 600,
                                color: stateColor, letterSpacing: '3px',
                                textTransform: 'uppercase',
                            }}>
                                {stateLabel}
                            </span>
                        </div>

                        {/* 3. State summary */}
                        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 12 }}>
                            <div style={{
                                fontSize: '0.88rem', color: '#e8e7e4',
                                lineHeight: 1.6, fontFamily: "'Barlow', sans-serif",
                            }}>
                                {stateSummary}
                            </div>
                        </div>

                        {/* 4. Rules area — 2-column adaptive */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: totalRules <= 12 ? '1fr 1fr' : '1fr',
                            gap: tightSpacing ? '3px 24px' : '5px 24px',
                            flex: 1,
                        }}>
                            {allRules.map((rule, i) => {
                                const numColor = rule.isCustom ? stateColor : '#c62828'
                                return (
                                    <div key={i} style={{
                                        display: 'grid', gridTemplateColumns: '28px 1fr',
                                        gap: 10, alignItems: 'flex-start',
                                        padding: tightSpacing ? '4px 0' : '6px 0',
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                    }}>
                                        <span style={{
                                            fontFamily: "'JetBrains Mono', monospace",
                                            fontSize: '0.58rem', fontWeight: 600,
                                            color: numColor, flexShrink: 0, paddingTop: 2,
                                        }}>
                                            {String(i + 1).padStart(2, '0')}
                                        </span>
                                        <div>
                                            {rule.heading && (
                                                <div style={{
                                                    fontFamily: "'JetBrains Mono', monospace",
                                                    fontSize: '0.54rem', fontWeight: 600,
                                                    color: '#7d8088', letterSpacing: '1.5px',
                                                    textTransform: 'uppercase',
                                                    marginBottom: 2,
                                                }}>
                                                    {rule.heading}
                                                </div>
                                            )}
                                            <span style={{
                                                fontSize: tightSpacing ? '0.75rem' : '0.8rem',
                                                color: '#f0efec',
                                                lineHeight: 1.45,
                                                fontFamily: "'Barlow', sans-serif",
                                            }}>
                                                {rule.text}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* 5. "WHEN IN DOUBT" reminder */}
                        {showReminder && (
                            <div style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '0.56rem', letterSpacing: '2px',
                                textTransform: 'uppercase',
                                marginTop: 4,
                            }}>
                                <span style={{ color: '#c62828', fontWeight: 600 }}>WHEN IN DOUBT:</span>
                                {' '}
                                <span style={{ color: '#7d8088' }}>Confirm with your element commander before engaging.</span>
                            </div>
                        )}
                    </div>
                )
            }

            // 13 ── Command & Signals ──────────────────────────────────────────
            case 13: {
                const commsMode = p.commandSignals?.commsCardMode ?? 'image'
                const commsCard = p.commandSignals?.commsCard
                const commsGroups = commsCard?.groups ?? []
                return (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Top 3-column — compressed */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                            <FieldCard label='ORDER OF SENIORITY'       value={p.commandSignals?.orderOfSeniority}      placeholder='[ Chain of succession if command is lost ]' glow={glow} />
                            <FieldCard label='PRIMARY / ALTERNATE COMMS' value={p.commandSignals?.primaryAlternateComms} placeholder='[ Frequencies, callsigns, fallback method ]'  glow={glow} />
                            <FieldCard label='COMMAND'                   value={p.commandSignals?.command}               placeholder='[ Chain of command, CP location ]'            glow={glow} />
                        </div>
                        {/* Bottom: comms card + optional FOB image */}
                        {(() => {
                            const hasFob = !!p.commandSignals?.fobImagePath
                            return (
                                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: hasFob ? '3fr 2fr' : '1fr', gap: 10, minHeight: 220 }}>
                                    {/* Comms card */}
                                    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid rgba(198,40,40,0.18)', background: '#08080c' }}>
                                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.5rem', fontWeight: 700, color: '#c62828', letterSpacing: '3px', textTransform: 'uppercase', padding: '5px 10px', borderBottom: '1px solid rgba(198,40,40,0.12)' }}>
                                            COMMS CARD
                                        </div>
                                        {commsMode === 'custom' && commsGroups.length > 0 ? (
                                            <div style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
                                                {/* Header row */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr 1fr 1fr', gap: 4, marginBottom: 5, paddingBottom: 4, borderBottom: '1px solid rgba(198,40,40,0.2)' }}>
                                                    {['CALLSIGN','SR PRIM','SR ALT','LR PRIM','LR ALT'].map(h => (
                                                        <div key={h} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.44rem', fontWeight: 700, color: '#c62828', letterSpacing: '1px', textTransform: 'uppercase' }}>{h}</div>
                                                    ))}
                                                </div>
                                                {commsGroups.map(group => (
                                                    <div key={group.id} style={{ marginBottom: 8 }}>
                                                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.5rem', fontWeight: 700, color: group.color || '#c62828', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '3px 0', marginBottom: 3, borderBottom: `1px solid ${group.color ? group.color + '33' : 'rgba(198,40,40,0.12)'}` }}>
                                                            {group.groupName || '—'}
                                                        </div>
                                                        {group.entries.map((entry, ei) => (
                                                            <div key={ei} style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr 1fr 1fr', gap: 4, padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#e8e7e4' }}>{entry.callsign || '—'}</div>
                                                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#b0b4bc' }}>{entry.srPrim || '—'}</div>
                                                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#7d8088' }}>{entry.srAlt || '—'}</div>
                                                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#b0b4bc' }}>{entry.lrPrim || '—'}</div>
                                                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#7d8088' }}>{entry.lrAlt || '—'}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))}
                                                {(commsCard?.supportFrequencies || commsCard?.convoyFrequencies) && (
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                        {commsCard?.supportFrequencies && (
                                                            <div>
                                                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.44rem', fontWeight: 700, color: '#c62828', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 3 }}>SUPPORT FREQ</div>
                                                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.58rem', color: '#b0b4bc', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{commsCard.supportFrequencies}</div>
                                                            </div>
                                                        )}
                                                        {commsCard?.convoyFrequencies && (
                                                            <div>
                                                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.44rem', fontWeight: 700, color: '#c62828', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 3 }}>CONVOY FREQ</div>
                                                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.58rem', color: '#b0b4bc', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{commsCard.convoyFrequencies}</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ flex: 1 }}>
                                                <ImageOrPlaceholder src={p.commandSignals?.commsCardPath} caption='[ COMMS CARD — INSERT IMAGERY ]' minH={180} />
                                            </div>
                                        )}
                                    </div>
                                    {/* FOB image — only shown when an image has been uploaded */}
                                    {hasFob && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.5rem', fontWeight: 600, color: '#7d8088', letterSpacing: '2px', textTransform: 'uppercase' }}>
                                                FOB / DEPLOYMENT LOCATION
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <ImageOrPlaceholder src={p.commandSignals?.fobImagePath} caption='[ IMAGE — OPTIONAL ]' minH={180} small />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })()}
                    </div>
                )
            }

            // 14 ── Closing ────────────────────────────────────────────────────
            case 14: {
                const pocName     = p.closing?.pocName
                const pocCallsign = p.closing?.pocCallsign
                const hasPoc      = !!(pocName || pocCallsign)
                return (
                    <div style={{
                        flex: 1, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        gap: 32, padding: '32px 0', textAlign: 'center',
                    }}>
                        {/* Logo + red ring */}
                        <div style={{
                            width: 112, height: 112,
                            borderRadius: '50%',
                            border: '1px solid rgba(198,40,40,0.35)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <img src='/ASOT-logo.png' alt='ASOT' style={{ width: 84, height: 84, objectFit: 'contain', opacity: 0.88 }} />
                        </div>

                        {/* QUESTIONS */}
                        <div style={{
                            fontFamily: "'Oswald', sans-serif",
                            fontSize: '3rem', fontWeight: 700,
                            letterSpacing: '0.2em', textTransform: 'uppercase',
                            color: 'rgba(240,239,236,0.88)',
                        }}>
                            QUESTIONS
                        </div>

                        {/* POC */}
                        <div style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '0.75rem', fontWeight: 400,
                            color: hasPoc ? '#eceae7' : '#6d7078',
                            letterSpacing: '0.08em',
                            display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center',
                        }}>
                            {hasPoc ? (
                                <>
                                    {pocName && <span>{pocName}</span>}
                                    {pocCallsign && <span style={{ color: '#c62828' }}>{pocCallsign}</span>}
                                </>
                            ) : (
                                <span>[ POC Name / Callsign ]</span>
                            )}
                        </div>
                    </div>
                )
            }

            default: return null
        }
    }

    // ── Navigation helpers ───────────────────────────────────────────────────

    function navBtnStyle(disabled: boolean): React.CSSProperties {
        return {
            padding: '6px 18px',
            background: disabled ? 'transparent' : tc(0.08),
            border: `1px solid ${disabled ? 'rgba(255,255,255,0.07)' : tc(0.3)}`,
            color: disabled ? 'rgba(240,239,236,0.2)' : tc(0.9),
            fontSize: '0.58rem', fontWeight: 600,
            letterSpacing: '0.16em', textTransform: 'uppercase',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
            transition: 'all 0.15s',
        }
    }

    const isFirst = slide === 0
    const isLast  = slide === TOTAL - 1

    const isCover   = slide === 0
    const isClosing = slide === TOTAL - 1

    // ── Full slide layout ────────────────────────────────────────────────────

    return (
        <div style={{
            background: '#07070a',
            display: 'flex', flexDirection: 'column',
            minHeight: 580,
            fontFamily: "'Barlow', sans-serif",
        }}>

            {/* ── Classification bar ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 28px', height: 34,
                borderBottom: '1px solid rgba(198,40,40,0.4)',
                flexShrink: 0,
            }}>
                <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.58rem', fontWeight: 600,
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    color: tc(1.0),
                }}>
                    CLASSIFIED // ASOT INTERNAL USE ONLY
                </span>
                <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.58rem', fontWeight: 400,
                    letterSpacing: '0.12em', color: '#6d7078',
                }}>
                    REF [ {String(slide).padStart(2, '0')}-{(SECTION_LABELS[slide] ?? '').slice(0, 4).replace(/ /g, '')} ]
                </span>
            </div>

            {/* ── Slide content area ── */}
            <div style={{
                flex: 1, position: 'relative',
                padding: '28px 48px 20px',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* Corner brackets */}
                <CornerBrackets color={tc(0.55)} size={22} />

                {/* Kicker + Title header (all slides except cover/closing) */}
                {!isCover && !isClosing && SLIDE_KICKERS[slide] && (
                    <div style={{ marginBottom: 18, flexShrink: 0 }}>
                        <div style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '0.6rem', fontWeight: 600,
                            letterSpacing: '0.18em', color: '#c62828',
                            textTransform: 'uppercase', marginBottom: 6,
                        }}>
                            {SLIDE_KICKERS[slide]}
                        </div>
                        <div style={{
                            fontFamily: "'Oswald', sans-serif",
                            fontSize: '1.5rem', fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                            color: '#f6f5f2',
                            borderBottom: '2px solid rgba(198,40,40,0.4)',
                            paddingBottom: 10,
                            marginBottom: 16,
                        }}>
                            {SLIDE_TITLES[slide]}
                        </div>
                    </div>
                )}

                {/* Slide-specific content */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {renderSlide()}
                </div>
            </div>

            {/* ── Footer ── */}
            <div style={{
                height: 40, flexShrink: 0,
                background: '#111114',
                boxShadow: `0 0 22px 5px ${glow}`,
                borderTop: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                gap: 16,
            }}>

                {/* Left: PREV + section label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 180 }}>
                    <button
                        type='button'
                        onClick={() => setSlide(s => Math.max(0, s - 1))}
                        disabled={isFirst}
                        style={navBtnStyle(isFirst)}
                    >
                        ← PREV
                    </button>
                    <span style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.52rem', color: '#6d7078',
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                    }}>
                        {isCover || isClosing ? 'ASOT — INTEL CELL' : `SECTION ${String(slide).padStart(2, '0')} // ${SECTION_LABELS[slide]}`}
                    </span>
                </div>

                {/* Center: dot indicators */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {Array.from({ length: TOTAL }, (_, i) => (
                        <button
                            key={i}
                            type='button'
                            onClick={() => setSlide(i)}
                            title={SLIDE_NAMES[i]}
                            style={{
                                width: i === slide ? 18 : 5,
                                height: 5,
                                borderRadius: 3,
                                background: i === slide ? tc(0.9) : 'rgba(255,255,255,0.15)',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                                transition: 'all 0.18s',
                                flexShrink: 0,
                            }}
                        />
                    ))}
                </div>

                {/* Right: slide counter + NEXT */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 180, justifyContent: 'flex-end' }}>
                    <span style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.58rem', color: '#6d7078',
                        letterSpacing: '0.1em',
                        whiteSpace: 'nowrap',
                    }}>
                        ◉ SLIDE {String(slide + 1).padStart(2, '0')}/{TOTAL}
                    </span>
                    <button
                        type='button'
                        onClick={() => setSlide(s => Math.min(TOTAL - 1, s + 1))}
                        disabled={isLast}
                        style={navBtnStyle(isLast)}
                    >
                        NEXT →
                    </button>
                </div>

            </div>

        </div>
    )
}
