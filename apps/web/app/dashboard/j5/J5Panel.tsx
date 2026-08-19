'use client'

import { Typography, Tabs, Tab } from '@mui/material'
import { Settings, CalendarMonth, HistoryEdu } from '@mui/icons-material'
import DeptSettingsView from '@/app/dashboard/DeptSettingsView'
import DeptCalendarTab from '@/app/dashboard/unit/calendar/DeptCalendarTab'
import GalleryOperationsTab from '@/app/dashboard/j5/tabs/GalleryOperationsTab'
import GalleryFeaturedTab from '@/app/dashboard/j5/tabs/GalleryFeaturedTab'
import ScreenshotOfMonthTab from '@/app/dashboard/j5/tabs/ScreenshotOfMonthTab'
import PinTabLabel from '@/app/dashboard/_components/PinTabLabel'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import { useTabState } from '@/app/dashboard/_components/useTabState'
import MeetingsTab from '@/app/dashboard/_components/meetings/MeetingsTab'
import ActivityLogTab from '@/app/dashboard/_components/ActivityLogTab'
import DeptTicketsTab from '@/app/dashboard/_components/tickets/DeptTicketsTab'
import DeptLinksRail from '@/app/dashboard/_components/dept-links/DeptLinksRail'

export default function J5Panel({
    displayName,
    userId,
    canManageMembers,
    canManageLinks,
    isJ4,
}: {
    displayName: string
    userId: string
    canManageMembers: boolean
    canManageLinks: boolean
    isJ4: boolean
}) {
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

    return (
        <div className='h-full w-full flex flex-col'>
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
                        [J5] Media
                    </Typography>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button style={{ ...btnSx(view === 'settings'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'settings' ? 'dept' : 'settings')}>
                            <Settings sx={{ fontSize: '0.85rem' }} />Management
                        </button>
                        <button style={{ ...btnSx(view === 'calendar'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'calendar' ? 'dept' : 'calendar')}>
                            <CalendarMonth sx={{ fontSize: '0.85rem' }} />Calendar
                        </button>
                        <button style={{ ...btnSx(view === 'activity'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'activity' ? 'dept' : 'activity')}>
                            <HistoryEdu sx={{ fontSize: '0.85rem' }} />Activity Logs
                        </button>
                    </div>
            </div>

            {view === 'settings' && (
                <DeptSettingsView department='j5' displayName={displayName} userId={userId} canManage={canManageMembers} canManageLinks={canManageLinks} isJ4={isJ4} />
            )}
            {view === 'calendar' && (
                <DeptCalendarTab department='j5' userId={userId} isJ4={isJ4} />
            )}
            {view === 'activity' && (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', margin: '8px 0 0' }}>
                    <ActivityLogTab department='j5' />
                </div>
            )}
            {view === 'dept' && (
                <>
                    <DeptLinksRail department='j5' canManage={canManageLinks} onManage={() => setView('settings')} />

                    <div className='mx-6 mt-4' style={{ borderBottom: '1px solid var(--line-2)' }}>
                        <Tabs
                            value={tab}
                            onChange={(_, v) => setTab(v)}
                            TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                            sx={{ minHeight: 40 }}
                        >
                            <Tab label={<PinTabLabel label='Operations'          pinLabel='J5 — Operations' href='/dashboard/j5' tabIndex={0} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Featured Images'     pinLabel='J5 — Featured'   href='/dashboard/j5' tabIndex={1} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Screenshot of Month' pinLabel='J5 — SOTM'       href='/dashboard/j5' tabIndex={2} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Meetings'            pinLabel='J5 — Meetings'   href='/dashboard/j5' tabIndex={3} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Tickets'             pinLabel='J5 — Tickets'    href='/dashboard/j5' tabIndex={4} />} sx={tabSx} />
                        </Tabs>
                    </div>

                    <div className='flex-1 min-h-0 mt-0'>
                        {tab === 0 && <GalleryOperationsTab />}
                        {tab === 1 && <GalleryFeaturedTab />}
                        {tab === 2 && <ScreenshotOfMonthTab canManage={canManageMembers} />}
                        {tab === 3 && <MeetingsTab department='j5' userId={userId} isLead={canManageMembers || isJ4} />}
                        {tab === 4 && <DeptTicketsTab department='j5' canManage={canManageMembers || isJ4} isJ4={isJ4} />}
                    </div>
                </>
            )}
        </div>
    )
}
