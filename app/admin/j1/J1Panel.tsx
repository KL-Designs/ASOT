'use client'

import { useState, useEffect } from 'react'
import { Tabs, Tab, Typography } from '@mui/material'
import { Construction } from '@mui/icons-material'
import ApplicationsTab from './tabs/ApplicationsTab'
import RecruitMemberTab from './tabs/RecruitMemberTab'
import MastersheetTab from './tabs/MastersheetTab'
import StatisticsTab from './tabs/StatisticsTab'
import DeptMembersTab from '@/app/admin/DeptMembersTab'
import DeptCalendarTab from '@/app/admin/unit/calendar/DeptCalendarTab'
import PinTabLabel from '@/app/admin/_components/PinTabLabel'
import CornerBrackets from '@/app/admin/_components/CornerBrackets'

interface J1PanelProps {
    displayName: string
    userId: string
    canManageMembers: boolean
    isJ4: boolean
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

export default function J1Panel({ displayName, userId, canManageMembers, isJ4 }: J1PanelProps) {
    const [tab, setTab] = useState(0)

    useEffect(() => {
        const stored = localStorage.getItem('gotoTab:/admin/j1')
        if (stored !== null) { setTab(Number(stored)); localStorage.removeItem('gotoTab:/admin/j1') }
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
            {/* Header */}
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
                    J1 — Recruitment
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
                    <Tab label={<PinTabLabel label='Applications'   pinLabel='J1 — Applications'   href='/admin/j1' tabIndex={0} />} sx={tabSx} />
                    <Tab label={<PinTabLabel label='Recruit Member' pinLabel='J1 — Recruit Member' href='/admin/j1' tabIndex={1} />} sx={tabSx} />
                    <Tab label={<PinTabLabel label='Mastersheet'    pinLabel='J1 — Mastersheet'    href='/admin/j1' tabIndex={2} />} sx={tabSx} />
                    <Tab label={<PinTabLabel label='Meetings'       pinLabel='J1 — Meetings'       href='/admin/j1' tabIndex={3} />} sx={tabSx} />
                    <Tab label={<PinTabLabel label='Statistics'     pinLabel='J1 — Statistics'     href='/admin/j1' tabIndex={4} />} sx={tabSx} />
                    <Tab label={<PinTabLabel label='Members'        pinLabel='J1 — Members'        href='/admin/j1' tabIndex={5} />} sx={tabSx} />
                    <Tab label={<PinTabLabel label='Calendar'       pinLabel='J1 — Calendar'       href='/admin/j1' tabIndex={6} />} sx={tabSx} />
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
                        <ApplicationsTab />
                    </div>
                )}
                {tab === 1 && <RecruitMemberTab displayName={displayName} />}
                {tab === 2 && (
                    <div
                        className='m-6 mt-4'
                        style={{ border: '1px solid rgba(0,195,100,0.1)', background: 'rgba(255,255,255,0.01)' }}
                    >
                        <MastersheetTab />
                    </div>
                )}
                {tab === 3 && <WipTab title='Meetings' description='J1 meeting scheduling and records are coming soon.' />}
                {tab === 4 && <StatisticsTab />}
                {tab === 5 && <DeptMembersTab department='j1' displayName={displayName} userId={userId} canManage={canManageMembers} />}
                {tab === 6 && <DeptCalendarTab department='j1' userId={userId} isJ4={isJ4} />}
            </div>
        </div>
    )
}
