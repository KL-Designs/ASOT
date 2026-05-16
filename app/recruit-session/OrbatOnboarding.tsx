'use client'

/**
 * OrbatOnboarding — mirrors the visual layout of /community/orbat for use
 * during the recruitment onboarding ORBAT overview step.
 *
 * Shows the structural ORBAT (roles, no real member names) with the same
 * visual style as the community page. When a platoon is highlighted it
 * expands to fill the full width with its sections laid out horizontally.
 */

// ── Static structure ──────────────────────────────────────────────────────────

type RoleRow = { role: string }

type Section = {
    title: string
    rows: RoleRow[]
}

type Platoon = {
    id: string
    label: string
    subtitle: string
    color: string
    sections: Section[]
}

const PLATOONS: Platoon[] = [
    {
        id: '1P',
        label: '1-1 Infantry Platoon',
        subtitle: 'Saturday nights',
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
        label: '1-2 Infantry Platoon',
        subtitle: 'Sunday nights',
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
        label: '1-3 Support Platoon',
        subtitle: 'Support — Sat & Sun',
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
        label: 'Reservists',
        subtitle: 'Both nights as needed',
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

// ── Visual components ─────────────────────────────────────────────────────────

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
            padding: '3px 8px',
            background: index % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.18)',
            borderBottom: '1px solid rgba(219,0,29,0.06)',
            minHeight: 22,
            display: 'flex',
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

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
    highlight?: string | null
}

export default function OrbatOnboarding({ highlight }: Props) {
    const activePlatoon = highlight ? PLATOONS.find(p => p.id === highlight) ?? null : null
    const hqColor = '#db001d'

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Company HQ banner */}
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

            {activePlatoon ? (
                /* ── Expanded single-platoon view ── */
                <div style={{
                    border: `1px solid ${activePlatoon.color}66`,
                    borderTop: `2px solid ${activePlatoon.color}`,
                    overflow: 'hidden',
                    animation: 'orbat-fadein 0.25s ease',
                }}>
                    {/* Platoon header — full width */}
                    <div style={{
                        background: `linear-gradient(90deg, ${activePlatoon.color}dd 0%, ${activePlatoon.color}88 100%)`,
                        padding: '10px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        borderBottom: `1px solid ${activePlatoon.color}44`,
                    }}>
                        <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', lineHeight: 1.2 }}>
                                {activePlatoon.label}
                            </div>
                            <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.65)', marginTop: 2, letterSpacing: '0.06em' }}>
                                {activePlatoon.subtitle}
                            </div>
                        </div>
                    </div>

                    {/* Sections side by side */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${activePlatoon.sections.length}, 1fr)`,
                        gap: 1,
                        background: `${activePlatoon.color}18`,
                        padding: 8,
                    }}>
                        {activePlatoon.sections.map((sec, si) => (
                            <div key={si} style={{ display: 'flex', flexDirection: 'column' }}>
                                <UnitCard section={sec} accentColor={activePlatoon.color} />
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                /* ── Default 4-column overview ── */
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 8,
                }}>
                    {PLATOONS.map(platoon => (
                        <div key={platoon.id} style={{
                            display: 'flex',
                            flexDirection: 'column',
                            border: `1px solid ${platoon.color}33`,
                            borderTop: `2px solid ${platoon.color}66`,
                            background: `${platoon.color}0a`,
                            overflow: 'hidden',
                        }}>
                            {/* Column header */}
                            <div style={{
                                background: `linear-gradient(90deg, ${platoon.color}66 0%, ${platoon.color}44 100%)`,
                                padding: '7px 10px',
                                borderBottom: `1px solid ${platoon.color}33`,
                            }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', lineHeight: 1.2 }}>
                                    {platoon.label}
                                </div>
                                <div style={{ fontSize: '0.57rem', color: 'rgba(255,255,255,0.6)', marginTop: 1, letterSpacing: '0.04em' }}>
                                    {platoon.subtitle}
                                </div>
                            </div>

                            {/* Section cards */}
                            {platoon.sections.map((sec, si) => (
                                <UnitCard key={si} section={sec} />
                            ))}
                        </div>
                    ))}
                </div>
            )}

            <style>{`@keyframes orbat-fadein { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
    )
}
