'use client'

import { useState } from 'react'
import { Typography, Tabs, Tab } from '@mui/material'
import { ArrowBack, PersonAdd, Upload, AdminPanelSettings } from '@mui/icons-material'
import Link from 'next/link'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import J1ImportTab from './tabs/J1ImportTab'
import J3ImportTab from './tabs/J3ImportTab'
import J4ImportTab from './tabs/J4ImportTab'

const DEPT_TABS = [
    { label: 'J1 — Recruiting',    icon: <PersonAdd sx={{ fontSize: 15 }} /> },
    { label: 'J3 — Training',      icon: <Upload sx={{ fontSize: 15 }} /> },
    { label: 'J4 — Administration', icon: <AdminPanelSettings sx={{ fontSize: 15 }} /> },
]

export default function ImportHub() {
    const [dept, setDept] = useState(0)

    const tabSx = {
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '0.12em',
        minHeight: 42,
        padding: '8px 20px',
        textTransform: 'uppercase' as const,
        color: 'rgba(237,237,237,0.45)',
        '&.Mui-selected': { color: 'var(--foreground)' },
    }

    return (
        <div className='h-full w-full flex flex-col'>

            {/* Header */}
            <div
                className='flex items-center justify-between px-5 py-3 mx-6 mt-6'
                style={{
                    position: 'relative',
                    border: '1px solid var(--line-2)',
                    borderTop: '1px solid var(--line-2)',
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <CornerBrackets />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'var(--txt-4)' }}>{'//'}</span> J4 ADMINISTRATION
                    </span>
                    <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        Import Panel
                    </Typography>
                </div>
                <Link
                    href='/dashboard/j4'
                    style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(237,237,237,0.45)', textDecoration: 'none', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
                >
                    <ArrowBack sx={{ fontSize: 14 }} />
                    Back to J4
                </Link>
            </div>

            {/* Warning banner */}
            <div
                className='mx-6 mt-4 px-4 py-2'
                style={{ background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.22)', borderLeft: '3px solid var(--red)' }}
            >
                <Typography fontSize='0.68rem' style={{ color: 'rgba(237,237,237,0.5)', letterSpacing: '0.03em' }}>
                    All data imports are performed here. Duplicate detection is active — existing records will be flagged before any data is written.
                    Initial go-live: wipe existing data first, then run a full import sweep from this panel.
                </Typography>
            </div>

            {/* Department tabs */}
            <div className='mx-6 mt-4' style={{ borderBottom: '1px solid var(--line-2)' }}>
                <Tabs
                    value={dept}
                    onChange={(_, v) => setDept(v)}
                    TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                    sx={{ minHeight: 42 }}
                >
                    {DEPT_TABS.map((t, i) => (
                        <Tab
                            key={i}
                            icon={t.icon}
                            iconPosition='start'
                            label={t.label}
                            sx={tabSx}
                        />
                    ))}
                </Tabs>
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {dept === 0 && <J1ImportTab />}
                {dept === 1 && <J3ImportTab />}
                {dept === 2 && <J4ImportTab />}
            </div>
        </div>
    )
}
