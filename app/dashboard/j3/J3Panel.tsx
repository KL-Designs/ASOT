'use client'

import { Typography, Tabs, Tab } from '@mui/material'
import { PeopleAlt, CalendarMonth, HistoryEdu } from '@mui/icons-material'
import { Construction } from '@mui/icons-material'
import QualificationTicketsTab from './tabs/QualificationTicketsTab'
import PromotionTicketsTab from './tabs/PromotionTicketsTab'
import TrainingRecordsTab from './tabs/TrainingRecordsTab'
import DeptMembersTab from '@/app/dashboard/DeptMembersTab'
import DeptCalendarTab from '@/app/dashboard/unit/calendar/DeptCalendarTab'
import PinTabLabel from '@/app/dashboard/_components/PinTabLabel'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import { useTabState } from '@/app/dashboard/_components/useTabState'
import MeetingsTab from '@/app/dashboard/_components/meetings/MeetingsTab'
import ActivityLogTab from '@/app/dashboard/_components/ActivityLogTab'
import DeptTicketsTab from '@/app/dashboard/_components/tickets/DeptTicketsTab'

interface J3PanelProps {
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
                border: '1px solid rgba(219,0,29,0.22)',
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

const btnSx = (active: boolean): React.CSSProperties => ({
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    padding: '5px 14px',
    background: active ? 'rgba(219,0,29,0.35)' : 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(219,0,29,0.25)',
    color: active ? 'var(--foreground)' : 'rgba(237,237,237,0.55)',
    cursor: 'pointer',
    borderRadius: 999,
})

export default function J3Panel({ displayName, userId, canManageMembers, isJ4 }: J3PanelProps) {
    const { tab, setTab, view, setView } = useTabState(0, 'dept')

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
                className='flex items-center justify-between px-5 py-3 mx-6 mt-6'
                style={{
                    position: 'relative',
                    border: '1px solid rgba(219,0,29,0.42)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <CornerBrackets />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ color: 'rgba(219,0,29,0.35)' }}>{'//'}</span> DEPARTMENTS
                        </span>
                    <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        [J3] Training
                    </Typography>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button style={{ ...btnSx(view === 'members'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'members' ? 'dept' : 'members')}>
                            <PeopleAlt sx={{ fontSize: '0.85rem' }} />Members
                        </button>
                        <button style={{ ...btnSx(view === 'calendar'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'calendar' ? 'dept' : 'calendar')}>
                            <CalendarMonth sx={{ fontSize: '0.85rem' }} />Calendar
                        </button>
                        <button style={{ ...btnSx(view === 'activity'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'activity' ? 'dept' : 'activity')}>
                            <HistoryEdu sx={{ fontSize: '0.85rem' }} />Activity Logs
                        </button>
                    </div>
            </div>

            {view === 'members' && (
                <DeptMembersTab department='j3' displayName={displayName} userId={userId} canManage={canManageMembers} isJ4={isJ4} />
            )}
            {view === 'calendar' && (
                <DeptCalendarTab department='j3' userId={userId} isJ4={isJ4} />
            )}
            {view === 'activity' && (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', margin: '8px 0 0' }}>
                    <ActivityLogTab department='j3' />
                </div>
            )}
            {view === 'dept' && (
                <>
                    {/* Tabs */}
                    <div className='mx-6 mt-4' style={{ borderBottom: '1px solid rgba(219,0,29,0.42)' }}>
                        <Tabs
                            value={tab}
                            onChange={(_, v) => setTab(v)}
                            TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                            sx={{ minHeight: 40 }}
                        >
                            <Tab label={<PinTabLabel label='Qualification Tickets' pinLabel='J3 — Qual Tickets'     href='/admin/j3' tabIndex={0} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Promotion Tickets'     pinLabel='J3 — Promo Tickets'  href='/admin/j3' tabIndex={1} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Training Schedule'     pinLabel='J3 — Schedule'       href='/admin/j3' tabIndex={2} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Training Records'      pinLabel='J3 — Training Rec.'  href='/admin/j3' tabIndex={3} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Meetings'              pinLabel='J3 — Meetings'       href='/admin/j3' tabIndex={4} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Tickets' pinLabel='J3 — Tickets' href='/dashboard/j3' tabIndex={5} />} sx={tabSx} />
                        </Tabs>
                    </div>

                    {/* Tab content */}
                    <div className='flex-1 min-h-0 mt-0'>
                        {tab === 0 && (
                            <div
                                className='m-6 mt-4'
                                style={{
                                    border: '1px solid rgba(219,0,29,0.22)',
                                    background: 'rgba(255,255,255,0.01)',
                                }}
                            >
                                <QualificationTicketsTab displayName={displayName} userId={userId} />
                            </div>
                        )}
                        {tab === 1 && (
                            <div
                                className='m-6 mt-4'
                                style={{
                                    border: '1px solid rgba(219,0,29,0.22)',
                                    background: 'rgba(255,255,255,0.01)',
                                }}
                            >
                                <PromotionTicketsTab displayName={displayName} userId={userId} />
                            </div>
                        )}
                        {tab === 2 && <WipTab title='Training Schedule' description='Training schedule management and documentation tools are coming soon.' />}
                        {tab === 3 && <TrainingRecordsTab userId={userId} canManageMembers={canManageMembers} />}
                        {tab === 4 && <MeetingsTab department='j3' userId={userId} isLead={canManageMembers || isJ4} />}
                        {tab === 5 && <DeptTicketsTab department='j3' canManage={canManageMembers || isJ4} isJ4={isJ4} />}
                    </div>
                </>
            )}
        </div>
    )
}
