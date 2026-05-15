'use client'

/**
 * OrbatOnboarding — mirrors the visual layout of /community/orbat for use
 * during the recruitment onboarding ORBAT overview step.
 *
 * Shows the structural ORBAT (roles, no real member names) with the same
 * visual style as the community page. Supports platoon highlighting/zoom.
 */

// ── Static structure ──────────────────────────────────────────────────────────

type RoleRow = { role: string }

type Section = {
    title: string
    color?: string
    rows: RoleRow[]
}

type Platoon = {
    id: string
    category: string
    label: string
    color: string
    sections: Section[]
}

const PLATOONS: Platoon[] = [
    {
        id: '1P',
        category: '1-1 Infantry Platoon',
        label: '1-1 Infantry Platoon',
        color: '#3b82f6',
        sections: [
            {
                title: 'Platoon HQ',
                rows: [
                    { role: 'Platoon Commander' },
                    { role: '2IC / Platoon Sergeant' },
                    { role: 'Signaller / RTO' },
                ],
            },
            {
                title: 'Alpha Section',
                rows: [
                    { role: 'Section Commander' },
                    { role: '2IC' },
                    { role: 'Rifleman' },
                    { role: 'Rifleman' },
                    { role: 'Rifleman' },
                    { role: 'Rifleman' },
                ],
            },
            {
                title: 'Bravo Section',
                rows: [
                    { role: 'Section Commander' },
                    { role: '2IC' },
                    { role: 'Rifleman' },
                    { role: 'Rifleman' },
                    { role: 'Rifleman' },
                    { role: 'Rifleman' },
                ],
            },
        ],
    },
    {
        id: '2P',
        category: '1-2 Infantry Platoon',
        label: '1-2 Infantry Platoon',
        color: '#8b5cf6',
        sections: [
            {
                title: 'Platoon HQ',
                rows: [
                    { role: 'Platoon Commander' },
                    { role: '2IC / Platoon Sergeant' },
                    { role: 'Signaller / RTO' },
                ],
            },
            {
                title: 'Alpha Section',
                rows: [
                    { role: 'Section Commander' },
                    { role: '2IC' },
                    { role: 'Rifleman' },
                    { role: 'Rifleman' },
                    { role: 'Rifleman' },
                    { role: 'Rifleman' },
                ],
            },
            {
                title: 'Bravo Section',
                rows: [
                    { role: 'Section Commander' },
                    { role: '2IC' },
                    { role: 'Rifleman' },
                    { role: 'Rifleman' },
                    { role: 'Rifleman' },
                    { role: 'Rifleman' },
                ],
            },
        ],
    },
    {
        id: '3P',
        category: '1-3 Support Platoon',
        label: '1-3 Support Platoon',
        color: '#10b981',
        sections: [
            {
                title: 'Platoon HQ',
                rows: [
                    { role: 'Platoon Commander' },
                    { role: '2IC / Sergeant' },
                ],
            },
            {
                title: 'Echo — Engineers',
                rows: [
                    { role: 'Section Commander' },
                    { role: 'Engineer' },
                    { role: 'Engineer' },
                ],
            },
            {
                title: 'Golf — Weapons',
                rows: [
                    { role: 'Section Commander' },
                    { role: 'Machine Gunner' },
                    { role: 'Anti-Tank Operator' },
                    { role: 'Sniper' },
                ],
            },
            {
                title: 'Hotel — Rotary',
                rows: [
                    { role: 'Pilot' },
                    { role: 'Co-Pilot / Crew' },
                ],
            },
            {
                title: 'Mike — Medical',
                rows: [
                    { role: 'Advanced Medic' },
                    { role: 'Combat First Aider' },
                ],
            },
        ],
    },
    {
        id: 'RES',
        category: 'Reservists',
        label: 'Reservists',
        color: '#f59e0b',
        sections: [
            {
                title: 'Company Reservists',
                rows: [
                    { role: 'Active Reservist' },
                    { role: 'Active Reservist' },
                    { role: 'Active Reservist' },
                    { role: 'Active Reservist' },
                    { role: 'Active Reservist' },
                    { role: 'Active Reservist' },
                ],
            },
            {
                title: '1-0 Zulu — Gamemasters',
                rows: [
                    { role: 'Game Master' },
                    { role: 'Assistant GM' },
                    { role: 'Mission Support' },
                ],
            },
        ],
    },
]

// ── Visual components (matching /community/orbat style) ───────────────────────

function SectionHeader({ children, color }: { children: React.ReactNode; color?: string }) {
    const bg = color
        ? `linear-gradient(90deg, ${color}ee 0%, ${color}99 100%)`
        : 'linear-gradient(90deg, rgba(219,0,29,0.9) 0%, rgba(160,0,20,0.85) 100%)'
    return (
        <div style={{
            background: bg,
            padding: '5px 10px',
            fontSize: '0.63rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#fff',
        }}>
            {children}
        </div>
    )
}

function RoleRow({ role, index }: { role: string; index: number }) {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            padding: '3px 8px',
            background: index % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.18)',
            borderBottom: '1px solid rgba(219,0,29,0.06)',
            minHeight: 22,
            alignItems: 'center',
        }}>
            <span style={{ fontSize: '0.66rem', color: 'rgba(237,237,237,0.6)', letterSpacing: '0.02em' }}>
                {role}
            </span>
        </div>
    )
}

function UnitCard({ section, accentColor }: { section: Section; accentColor?: string }) {
    const borderColor = accentColor ? `${accentColor}33` : 'rgba(219,0,29,0.15)'
    return (
        <div style={{ border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: 5 }}>
            <SectionHeader color={accentColor}>{section.title}</SectionHeader>
            {section.rows.map((r, i) => (
                <RoleRow key={i} role={r.role} index={i} />
            ))}
        </div>
    )
}

// ── Zoom config: transform-origin per platoon column ─────────────────────────

const ZOOM_ORIGINS: Record<string, string> = {
    '1P':  '12% 50%',
    '2P':  '37% 50%',
    '3P':  '63% 50%',
    'RES': '88% 50%',
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
    highlight?: string | null
    compact?: boolean
}

export default function OrbatOnboarding({ highlight, compact = false }: Props) {
    const zoomed = !!highlight
    const transformOrigin = highlight ? (ZOOM_ORIGINS[highlight] ?? '50% 50%') : '50% 50%'

    const hqColor = '#db001d'

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10 }}>
            {/* Company HQ banner */}
            {!compact && (
                <div style={{ border: `1px solid ${hqColor}4d`, borderTop: `3px solid ${hqColor}`, overflow: 'hidden' }}>
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(219,0,29,0.95) 0%, rgba(130,0,18,0.92) 60%, rgba(60,0,8,0.9) 100%)',
                        padding: '9px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}>
                        <div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>
                                0-A India Company
                            </div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fff', lineHeight: 1.1 }}>
                                Company Headquarters
                            </div>
                        </div>
                    </div>
                    <div style={{
                        padding: '7px 20px',
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        letterSpacing: '0.15em',
                        textTransform: 'uppercase',
                        color: 'rgba(219,0,29,0.65)',
                        background: 'rgba(219,0,29,0.04)',
                        borderBottom: '1px solid rgba(219,0,29,0.12)',
                    }}>
                        HQ Section
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
                        {['Officer Commanding', '2IC / XO', 'Sergeant Major (RSM)', 'Signals Officer'].map((role, i) => (
                            <div key={i} style={{
                                padding: '10px 16px',
                                borderRight: i < 3 ? '1px solid rgba(219,0,29,0.1)' : 'none',
                                borderBottom: '1px solid rgba(219,0,29,0.06)',
                                background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.15)',
                            }}>
                                <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.38)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>{role}</div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(237,237,237,0.5)', fontStyle: 'italic' }}>—</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 4-column platoon grid — zooms toward highlighted column */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: compact ? 4 : 8,
                transform: zoomed ? 'scale(1.08)' : 'scale(1)',
                transformOrigin,
                transition: 'transform 0.45s cubic-bezier(0.22,1,0.36,1), transform-origin 0.4s ease',
            }}>
                {PLATOONS.map(platoon => {
                    const active = highlight === platoon.id
                    const borderColor = active ? `${platoon.color}aa` : `${platoon.color}33`
                    const catColorFaint = active ? `${platoon.color}18` : `${platoon.color}0a`

                    return (
                        <div key={platoon.id} style={{
                            display: 'flex',
                            flexDirection: 'column',
                            border: `1px solid ${borderColor}`,
                            borderTop: `2px solid ${active ? platoon.color : `${platoon.color}66`}`,
                            boxShadow: active ? `0 0 18px ${platoon.color}22, 0 0 0 1px ${platoon.color}33` : 'none',
                            transition: 'all 0.35s ease',
                            background: catColorFaint,
                            overflow: 'hidden',
                        }}>
                            {/* Column header */}
                            <div style={{
                                background: active
                                    ? `linear-gradient(90deg, ${platoon.color}dd 0%, ${platoon.color}99 100%)`
                                    : `linear-gradient(90deg, ${platoon.color}66 0%, ${platoon.color}44 100%)`,
                                padding: compact ? '6px 8px' : '7px 10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                borderBottom: `1px solid ${platoon.color}33`,
                                transition: 'background 0.35s',
                            }}>
                                <div>
                                    <div style={{ fontSize: compact ? '0.62rem' : '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', lineHeight: 1.2 }}>
                                        {platoon.label}
                                    </div>
                                    <div style={{ fontSize: compact ? '0.5rem' : '0.57rem', color: 'rgba(255,255,255,0.6)', marginTop: 1, letterSpacing: '0.04em' }}>
                                        {platoon.id === '1P' ? 'Saturday nights'
                                            : platoon.id === '2P' ? 'Sunday nights'
                                            : platoon.id === '3P' ? 'Support — Sat & Sun'
                                            : 'Both nights as needed'}
                                    </div>
                                </div>
                            </div>

                            {/* Section cards */}
                            {compact ? (
                                // Compact: just show section names as slim rows
                                <div style={{ padding: compact ? '4px 0' : '0' }}>
                                    {platoon.sections.map((sec, si) => (
                                        <div key={si} style={{
                                            padding: '3px 8px', fontSize: '0.58rem',
                                            color: active ? `${platoon.color}cc` : 'rgba(237,237,237,0.35)',
                                            background: si % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                            borderBottom: `1px solid ${platoon.color}12`,
                                            transition: 'color 0.3s',
                                        }}>
                                            {sec.title}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                // Full: UnitCard style sections with role rows
                                platoon.sections.map((sec, si) => (
                                    <UnitCard key={si} section={sec} accentColor={active ? platoon.color : undefined} />
                                ))
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
