'use client'

import { useState } from 'react'

const DEPTS = [
    {
        id: 'J1', label: 'J1 — Recruitment',
        summary: 'J1 are our gatekeepers to the unit. Their role is to interview potential recruits and determine if they are going to be suitable for the community. If successful, J1 will then process them into the unit.',
    },
    {
        id: 'J2', label: 'J2 — Mission Making',
        summary: 'J2 are our dedicated team who bring mission and campaign ideas to life. They are responsible for creating our weekly ARMA missions, as well as creating other ARMA mid-week missions and events.',
    },
    {
        id: 'J3', label: 'J3 — Training',
        summary: 'J3 are our team of trainers who ensure all new members are to the standard required to join our operations. They also create and run unit trainings for general and specialist skills and roles, covering anything from medical, to advanced CQB courses.',
    },
    {
        id: 'J4', label: 'J4 — Company Headquarters',
        summary: 'J4 are the head administrators and commanding officers of the unit. They hold overall command of the unit and oversee all administration within the community.',
    },
    {
        id: 'J5', label: 'J5 — Media',
        summary: 'J5 are our media creation and management team. Although anyone can share media with the unit, J5 focuses on creating, sharing and promoting unit content to increase publicity and interest. They also manage the unit\'s MILPACs, social media accounts and more.',
    },
    {
        id: 'J6', label: 'J6 — Gamemasters (Zeus)',
        summary: 'J6 is a vital asset to the successful conduct and standard of our missions and events. The Zeus team is responsible for taking the mission maker\'s vision, and executing it for all of our members to enjoy. There is a full-time team, and a part-time team who assist when required.',
    },
    {
        id: 'J7', label: 'J7 — Community Development',
        summary: 'J7 are our fantastic team who provides a lot of our amazing features, in-game assets, modding, script creation and more. They also assist in managing the dedicated server for ARMA and all other game servers. They are also responsible for things such as the website config and other admin assistants like our MILPAC and ticket bot.',
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
