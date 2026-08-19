'use client'

import { Typography, Tabs, Tab } from '@mui/material'
import { Settings, HistoryEdu } from '@mui/icons-material'
import { Construction } from '@mui/icons-material'
import TrainingRecordsTab from './tabs/TrainingRecordsTab'
import TrainingTicketsTab from './tabs/TrainingTicketsTab'
import J3MasterSheetTab from './tabs/J3MasterSheetTab'
import DeptSettingsView from '@/app/dashboard/DeptSettingsView'
import DeptCalendarTab from '@/app/dashboard/unit/calendar/DeptCalendarTab'
import PinTabLabel from '@/app/dashboard/_components/PinTabLabel'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import { useTabState } from '@/app/dashboard/_components/useTabState'
import MeetingsTab from '@/app/dashboard/_components/meetings/MeetingsTab'
import ActivityLogTab from '@/app/dashboard/_components/ActivityLogTab'
import DeptTicketsTab from '@/app/dashboard/_components/tickets/DeptTicketsTab'
import TrainingHub from '@/app/dashboard/unit/training-docs/TrainingHub'
import EventsTab from '@/app/dashboard/unit/training-docs/EventsTab'
import DeptLinksRail from '@/app/dashboard/_components/dept-links/DeptLinksRail'

interface J3PanelProps {
    displayName: string
    userId: string
    canManageMembers: boolean
    canManageLinks: boolean
    isJ4: boolean
}

function WipTab({ title, description }: { title: string; description: string }) {
    return (
        <div
            className='flex flex-col items-center justify-center gap-4 p-12 m-5'
            style={{
                border: '1px solid var(--line-2)',
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

export default function J3Panel({ displayName, userId, canManageMembers, canManageLinks, isJ4 }: J3PanelProps) {
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
                            <span style={{ color: 'var(--txt-4)' }}>{'//'}</span> DEPARTMENTS
                        </span>
                    <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        [J3] Training
                    </Typography>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button style={{ ...btnSx(view === 'settings'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'settings' ? 'dept' : 'settings')}>
                            <Settings sx={{ fontSize: '0.85rem' }} />Management
                        </button>
                        <button style={{ ...btnSx(view === 'activity'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'activity' ? 'dept' : 'activity')}>
                            <HistoryEdu sx={{ fontSize: '0.85rem' }} />Activity Logs
                        </button>
                    </div>
            </div>

            {view === 'settings' && (
                <DeptSettingsView department='j3' displayName={displayName} userId={userId} canManage={canManageMembers} canManageLinks={canManageLinks} isJ4={isJ4} />
            )}
            {view === 'activity' && (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', margin: '8px 0 0' }}>
                    <ActivityLogTab department='j3' />
                </div>
            )}
            {view === 'dept' && (
                <>
                    <DeptLinksRail department='j3' canManage={canManageLinks} onManage={() => setView('settings')} />

                    {/* Tabs */}
                    <div className='mx-6 mt-4' style={{ borderBottom: '1px solid var(--line-2)' }}>
                        <Tabs
                            value={tab}
                            onChange={(_, v) => setTab(v)}
                            TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                            sx={{ minHeight: 40 }}
                        >
                            <Tab label={<PinTabLabel label='Training Hub'       pinLabel='J3 — Training Hub'       href='/admin/j3' tabIndex={0} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Training Tickets'  pinLabel='J3 — Tickets'            href='/admin/j3' tabIndex={1} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Training Calendar' pinLabel='J3 — Calendar'           href='/admin/j3' tabIndex={2} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Training Requests' pinLabel='J3 — Training Requests'  href='/admin/j3' tabIndex={3} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Training Records'  pinLabel='J3 — Records'            href='/admin/j3' tabIndex={4} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Meetings'          pinLabel='J3 — Meetings'           href='/admin/j3' tabIndex={5} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Tickets'           pinLabel='J3 — Dept Tickets'       href='/dashboard/j3' tabIndex={6} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Master Sheet'      pinLabel='J3 — Master Sheet'       href='/dashboard/j3' tabIndex={7} />} sx={tabSx} />
                        </Tabs>
                    </div>

                    {/* Tab content */}
                    <div className='flex-1 min-h-0 mt-0'>
                        {tab === 0 && (
                            <TrainingHub
                                isJ3Lead={canManageMembers}
                                isTrainer={true}
                                isJ3Trainer={true}
                                myId={userId}
                                isJ3Context={true}
                                canApproveGuides={canManageMembers || isJ4}
                            />
                        )}
                        {tab === 1 && <TrainingTicketsTab isJ3Lead={canManageMembers} />}
                        {tab === 2 && <DeptCalendarTab department='j3' userId={userId} isJ4={isJ4} />}
                        {tab === 3 && (
                            <EventsTab
                                isJ3Lead={canManageMembers}
                                isTrainer={true}
                                isJ3Trainer={true}
                            />
                        )}
                        {tab === 4 && <TrainingRecordsTab userId={userId} canManageMembers={canManageMembers} />}
                        {tab === 5 && <MeetingsTab department='j3' userId={userId} isLead={canManageMembers || isJ4} />}
                        {tab === 6 && <DeptTicketsTab department='j3' canManage={canManageMembers || isJ4} isJ4={isJ4} />}
                        {tab === 7 && <J3MasterSheetTab />}
                    </div>
                </>
            )}
        </div>
    )
}
