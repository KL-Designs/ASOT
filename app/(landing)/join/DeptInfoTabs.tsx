'use client'

import { useState } from 'react'

const DEPTS = [
    {
        id: 'J1', label: 'J1 — Recruitment',
        summary: 'Responsible for the full recruitment pipeline — processing applications, running inductions, and onboarding new members. If you enjoy welcoming people and managing records, J1 is for you.',
    },
    {
        id: 'J2', label: 'J2 — Mission Making',
        summary: 'Designs and builds our operations. J2 members write mission briefs, create ARMA 3 mission files, and work closely with J6 Zeus operators to deliver dynamic gameplay.',
    },
    {
        id: 'J3', label: 'J3 — Training',
        summary: 'Runs training sessions for new recruits and existing members. Covers infantry tactics, certifications, vehicle operations, and role-specific qualifications.',
    },
    {
        id: 'J4', label: 'J4 — Administration',
        summary: 'Handles member management and unit-wide administrative tasks — including discharge processing, record keeping, and supporting command with day-to-day operations.',
    },
    {
        id: 'J5', label: 'J5 — Media',
        summary: 'Manages the community\'s public image. J5 runs the Shot of the Month competition, produces promotional screenshots and videos, and handles community outreach.',
    },
    {
        id: 'J6', label: 'J6 — Game Masters',
        summary: 'Zeus operators who control in-mission events, enemy forces, and dynamic scenarios. J6 members ensure every op has depth and unpredictability. Requires experience and trust.',
    },
    {
        id: 'J7', label: 'J7 — Development',
        summary: 'Maintains and develops the unit website, internal tools, and technical infrastructure. If you have web development or scripting skills, J7 wants to hear from you.',
    },
]

export default function DeptInfoTabs() {
    const [active, setActive] = useState('J1')
    const dept = DEPTS.find(d => d.id === active)!

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{
                fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em',
                textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)',
                fontFamily: 'monospace', marginBottom: 10, textAlign: 'center',
            }}>
                // DEPARTMENTS
            </div>

            {/* Tab buttons — centered, wrapping */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 4, marginBottom: 0 }}>
                {DEPTS.map(d => {
                    const isActive = d.id === active
                    return (
                        <button
                            key={d.id}
                            type='button'
                            onClick={() => setActive(d.id)}
                            style={{
                                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em',
                                padding: '4px 10px',
                                background: isActive ? 'rgba(219,0,29,0.25)' : 'rgba(255,255,255,0.03)',
                                border: isActive ? '1px solid rgba(219,0,29,0.5)' : '1px solid rgba(255,255,255,0.08)',
                                borderBottom: isActive ? '1px solid rgba(219,0,29,0.5)' : '1px solid rgba(255,255,255,0.08)',
                                color: isActive ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.4)',
                                cursor: 'pointer',
                                transition: 'all 0.12s',
                            }}
                        >
                            {d.id}
                        </button>
                    )
                })}
            </div>

            {/* Content panel */}
            <div style={{
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(219,0,29,0.2)',
                borderTop: '2px solid rgba(219,0,29,0.5)',
            }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 6 }}>
                    {dept.label}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.6 }}>
                    {dept.summary}
                </div>
            </div>
        </div>
    )
}
