'use client'

import { useState } from 'react'
import { Typography, Tabs, Tab } from '@mui/material'
import MoveRequestsTab from './tabs/MoveRequestsTab'
import DisciplineTab from './tabs/DisciplineTab'
import PerformanceReportTab from './tabs/PerformanceReportTab'

export default function AllStaffPanel({ userId, displayName }: { userId: string; displayName: string }) {
    const [tab, setTab] = useState(0)

    return (
        <div className='h-full w-full flex flex-col max-w-[1100px]'>
            {/* Header */}
            <div
                className='flex flex-col px-5 py-4 mx-6 mt-6'
                style={{
                    border: '1px solid rgba(219,0,29,0.3)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    Personnel
                </Typography>
                <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                    All Staff
                </Typography>
                <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.35)', marginTop: 4 }}>
                    Move Requests · Discipline · Performance Reports
                </Typography>
            </div>

            <div className='mx-6 mt-4'>
                <Tabs
                    value={tab}
                    onChange={(_, v) => setTab(v)}
                    sx={{
                        minHeight: 36,
                        borderBottom: '1px solid rgba(219,0,29,0.3)',
                        '& .MuiTab-root': {
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            letterSpacing: 2,
                            textTransform: 'uppercase',
                            minHeight: 36,
                            padding: '0 16px',
                            color: 'rgba(237,237,237,0.4)',
                        },
                        '& .Mui-selected': { color: 'var(--red) !important' },
                        '& .MuiTabs-indicator': { backgroundColor: 'var(--red)' },
                    }}
                >
                    <Tab label='Move Requests' />
                    <Tab label='Discipline' />
                    <Tab label='Performance Reports' />
                </Tabs>
            </div>

            <div className='flex-1 min-h-0 overflow-y-auto'>
                {tab === 0 && <MoveRequestsTab userId={userId} displayName={displayName} />}
                {tab === 1 && <DisciplineTab userId={userId} />}
                {tab === 2 && <PerformanceReportTab userId={userId} />}
            </div>
        </div>
    )
}
