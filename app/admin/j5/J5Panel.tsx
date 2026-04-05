'use client'

import { useState, useEffect } from 'react'
import { Typography, Tabs, Tab } from '@mui/material'
import DeptMembersTab from '@/app/admin/DeptMembersTab'
import DeptCalendarTab from '@/app/admin/unit/calendar/DeptCalendarTab'
import GalleryManager from '@/app/admin/gallery/GalleryManager'
import ScreenshotOfMonthTab from '@/app/admin/j5/tabs/ScreenshotOfMonthTab'
import PinTabLabel from '@/app/admin/_components/PinTabLabel'
import CornerBrackets from '@/app/admin/_components/CornerBrackets'

export default function J5Panel({
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

    useEffect(() => {
        const stored = localStorage.getItem('gotoTab:/admin/j5')
        if (stored !== null) { setTab(Number(stored)); localStorage.removeItem('gotoTab:/admin/j5') }
    }, [])

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
                    position: 'relative',
                    border: '1px solid rgba(219,0,29,0.15)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.02)',
                }}
            >
                <CornerBrackets />
                <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', fontFamily: 'monospace', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: 'rgba(219,0,29,0.35)' }}>//</span> DEPARTMENTS
                </span>
                <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                    J5 — Media
                </Typography>
            </div>

            <div className='mx-6 mt-4' style={{ borderBottom: '1px solid rgba(219,0,29,0.15)' }}>
                <Tabs
                    value={tab}
                    onChange={(_, v) => setTab(v)}
                    TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                    sx={{ minHeight: 40 }}
                >
                    <Tab label={<PinTabLabel label='Members'  pinLabel='J5 — Members'  href='/admin/j5' tabIndex={0} />} sx={tabSx} />
                    <Tab label={<PinTabLabel label='Calendar' pinLabel='J5 — Calendar' href='/admin/j5' tabIndex={1} />} sx={tabSx} />
                    <Tab label={<PinTabLabel label='Gallery'  pinLabel='J5 — Gallery'  href='/admin/j5' tabIndex={2} />} sx={tabSx} />
                    <Tab label={<PinTabLabel label='Screenshot of Month' pinLabel='J5 — SOTM' href='/admin/j5' tabIndex={3} />} sx={tabSx} />
                </Tabs>
            </div>

            <div className='flex-1 min-h-0 mt-0'>
                {tab === 0 && <DeptMembersTab department='j5' displayName={displayName} userId={userId} canManage={canManageMembers} />}
                {tab === 1 && <DeptCalendarTab department='j5' userId={userId} isJ4={isJ4} />}
                {tab === 2 && <GalleryManager hideHeader />}
                {tab === 3 && <ScreenshotOfMonthTab canManage={canManageMembers} />}
            </div>
        </div>
    )
}
