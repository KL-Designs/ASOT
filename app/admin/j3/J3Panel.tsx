'use client'

import { useState } from 'react'
import { Tabs, Tab, Typography } from '@mui/material'
import { Construction } from '@mui/icons-material'
import QualificationTicketsTab from './tabs/QualificationTicketsTab'

interface J3PanelProps {
    displayName: string
    userId: string
}

function WipTab({ title, description }: { title: string; description: string }) {
    return (
        <div
            className='flex flex-col items-center justify-center gap-4 p-12 m-5'
            style={{
                border: '1px solid rgba(219,0,29,0.1)',
                background: 'rgba(255,255,255,0.01)',
                minHeight: 220,
            }}
        >
            <Construction sx={{ fontSize: 40, color: 'var(--red)', opacity: 0.4 }} />
            <Typography fontWeight={700} fontSize='0.72rem' letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' }}>
                {title} — Under Construction
            </Typography>
            <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.25)', textAlign: 'center', maxWidth: 360 }}>
                {description}
            </Typography>
        </div>
    )
}

export default function J3Panel({ displayName, userId }: J3PanelProps) {
    const [tab, setTab] = useState(0)

    const tabSx = {
        fontSize: '0.72rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        minHeight: 40,
        padding: '8px 16px',
        color: 'rgba(237,237,237,0.5)',
        '&.Mui-selected': { color: 'var(--foreground)' },
    }

    return (
        <div className='h-full w-full flex flex-col max-w-[1100px]'>
            {/* Header */}
            <div
                className='flex flex-col px-5 py-4 mx-6 mt-6'
                style={{
                    border: '1px solid rgba(219,0,29,0.15)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.02)',
                }}
            >
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    Departments
                </Typography>
                <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                    J3 — Training
                </Typography>
            </div>

            {/* Tabs */}
            <div className='mx-6 mt-4' style={{ borderBottom: '1px solid rgba(219,0,29,0.15)' }}>
                <Tabs
                    value={tab}
                    onChange={(_, v) => setTab(v)}
                    TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                    sx={{ minHeight: 40 }}
                >
                    <Tab label='Qualification Tickets' sx={tabSx} />
                    <Tab label='Training Schedule' sx={tabSx} />
                </Tabs>
            </div>

            {/* Tab content */}
            <div className='flex-1 min-h-0 mt-0'>
                {tab === 0 && (
                    <div
                        className='m-6 mt-4'
                        style={{
                            border: '1px solid rgba(219,0,29,0.1)',
                            background: 'rgba(255,255,255,0.01)',
                        }}
                    >
                        <QualificationTicketsTab displayName={displayName} userId={userId} />
                    </div>
                )}
                {tab === 1 && <WipTab title='Training Schedule' description='Training schedule management and documentation tools are coming soon.' />}
            </div>
        </div>
    )
}
