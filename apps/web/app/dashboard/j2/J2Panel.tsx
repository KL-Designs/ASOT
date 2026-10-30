'use client'

import { Typography, Tabs, Tab } from '@mui/material'
import { Settings, CalendarMonth, HistoryEdu } from '@mui/icons-material'
import DeptSettingsView, { type DeptAdminSection } from '@/app/dashboard/DeptSettingsView'
import DeptCalendarTab from '@/app/dashboard/unit/calendar/DeptCalendarTab'
import J2OperationsTab from '@/app/dashboard/j2/tabs/J2OperationsTab'
import PinTabLabel from '@/app/dashboard/_components/PinTabLabel'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import { useTabState } from '@/app/dashboard/_components/useTabState'
import MeetingsTab from '@/app/dashboard/_components/meetings/MeetingsTab'
import ActivityLogTab from '@/app/dashboard/_components/ActivityLogTab'
import DeptTicketsTab from '@/app/dashboard/_components/tickets/DeptTicketsTab'
import MembersWorkspaceTab from '@/app/dashboard/j2/tabs/MembersWorkspaceTab'
import MissionChecksTab from '@/app/dashboard/j2/tabs/MissionChecksTab'
import IntelImagesTab from '@/app/dashboard/j2/tabs/IntelImagesTab'
import EraOptionsTab from '@/app/dashboard/j2/tabs/EraOptionsTab'
import MissionBibleTab from './tabs/MissionBibleTab'
import DoctrineTab from './tabs/DoctrineTab'
import TemplatesTab from './tabs/TemplatesTab'
import ObjectiveSuggestions from '@/components/j2/ObjectiveSuggestions'
import DeptLinksRail from '@/app/dashboard/_components/dept-links/DeptLinksRail'

/** Old main-tab numbers of the tools that now live under Admin (row 84). */
const MOVED_TABS: Record<number, string> = { 1: 'meetings', 2: 'tickets', 5: 'intel-images', 6: 'era-options' }

export default function J2Panel({
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
    const { tab, setTab, view, setView, adminTab, setAdminTab } = useTabState(0, 'dept', MOVED_TABS)
    const isLead = canManageMembers || isJ4

    const adminSections: DeptAdminSection[] = [
        { key: 'meetings',     label: 'Meetings',     render: () => <MeetingsTab department='j2' userId={userId} isLead={isLead} /> },
        { key: 'tickets',      label: 'Tickets',      render: () => <DeptTicketsTab department='j2' canManage={isLead} isJ4={isJ4} /> },
        { key: 'intel-images', label: 'Intel Images', render: () => <IntelImagesTab /> },
        { key: 'era-options',  label: 'ERA Options',  visible: canManageMembers, render: () => <EraOptionsTab /> },
        { key: 'templates',    label: 'Templates',    render: () => <TemplatesTab /> },
    ]

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
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <CornerBrackets />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'var(--txt-4)' }}>{'//'}</span> DEPARTMENTS
                    </span>
                    <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        [J2] Mission Making
                    </Typography>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button style={{ ...btnSx(view === 'settings'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'settings' ? 'dept' : 'settings')}>
                        <Settings sx={{ fontSize: '0.85rem' }} />Admin
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
                <DeptSettingsView department='j2' displayName={displayName} userId={userId} canManage={canManageMembers} canManageLinks={canManageLinks} isJ4={isJ4}
                    sections={adminSections} active={adminTab} onSelect={setAdminTab} />
            )}
            {view === 'calendar' && (
                <DeptCalendarTab department='j2' userId={userId} isJ4={isJ4} isJ2Lead={canManageMembers} />
            )}
            {view === 'activity' && (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', margin: '8px 0 0' }}>
                    <ActivityLogTab department='j2' />
                </div>
            )}
            {view === 'dept' && (
                <>
                    <DeptLinksRail department='j2' canManage={canManageLinks} onManage={() => setView('settings')} />

                    <div className='mx-6 mt-4' style={{ borderBottom: '1px solid var(--line-2)' }}>
                        <Tabs
                            value={tab}
                            onChange={(_, v) => setTab(v)}
                            TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                            sx={{ minHeight: 40 }}
                        >
                            {/* Explicit values: these are the tabs' old numbers, which pins
                                and bookmarks still carry. The gaps are tools that moved
                                under Admin (MOVED_TABS). */}
                            <Tab value={0} label={<PinTabLabel label='Operations'        pinLabel='J2 — Operations'  href='/dashboard/j2' tabIndex={0} />} sx={tabSx} />
                            <Tab value={3} label={<PinTabLabel label='Members Workspace' pinLabel='J2 — Workspace'   href='/dashboard/j2' tabIndex={3} />} sx={tabSx} />
                            <Tab value={4} label={<PinTabLabel label='Mission Checks'    pinLabel='J2 — Checks'    href='/dashboard/j2' tabIndex={4} />} sx={tabSx} />
                            <Tab value={7} label={<PinTabLabel label='Mission Bible' pinLabel='J2 — Mission Bible' href='/dashboard/j2' tabIndex={7} />} sx={tabSx} />
                            <Tab value={8} label={<PinTabLabel label='Objective Suggestions' pinLabel='J2 — Objectives' href='/dashboard/j2' tabIndex={8} />} sx={tabSx} />
                            <Tab value={9} label={<PinTabLabel label='Enemy Doctrine' pinLabel='J2 — Enemy Doctrine' href='/dashboard/j2' tabIndex={9} />} sx={tabSx} />
                        </Tabs>
                    </div>

                    <div className='flex-1 min-h-0 mt-0'>
                        {tab === 0 && <J2OperationsTab isJ4={isJ4} />}
                        {tab === 3 && <MembersWorkspaceTab userId={userId} isJ4={isJ4} canManage={canManageMembers} />}
                        {tab === 4 && <MissionChecksTab userId={userId} isJ2Lead={canManageMembers || isJ4} />}
                        {tab === 7 && <MissionBibleTab />}
                        {tab === 8 && <ObjectiveSuggestions />}
                        {tab === 9 && <div className='h-full overflow-y-auto'><DoctrineTab /></div>}
                    </div>
                </>
            )}
        </div>
    )
}
