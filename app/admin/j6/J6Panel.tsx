'use client'

import { useState } from 'react'
import { Typography, Tabs, Tab } from '@mui/material'
import DeptMembersTab from '@/app/admin/DeptMembersTab'
import DeptCalendarTab from '@/app/admin/unit/calendar/DeptCalendarTab'

export default function J6Panel({
    displayName,
    userId,
    canManageMembers,
    isJ4,
}: {
    displayName: string
    userId: string
    canManageMembers: boolean
    isJ4: boolean
}) {
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
                    J6 — Game Masters
                </Typography>
            </div>

            <div className='mx-6 mt-4' style={{ borderBottom: '1px solid rgba(219,0,29,0.15)' }}>
                <Tabs
                    value={tab}
                    onChange={(_, v) => setTab(v)}
                    TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                    sx={{ minHeight: 40 }}
                >
                    <Tab label='Members' sx={tabSx} />
                    <Tab label='Calendar' sx={tabSx} />
                </Tabs>
            </div>

            <div className='flex-1 min-h-0 mt-0'>
                {tab === 0 && <DeptMembersTab department='j6' displayName={displayName} userId={userId} canManage={canManageMembers} />}
                {tab === 1 && <DeptCalendarTab department='j6' userId={userId} isJ4={isJ4} />}
            </div>
        </div>
    )
}
