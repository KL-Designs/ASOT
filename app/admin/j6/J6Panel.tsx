'use client'

import { Typography, Tabs, Tab } from '@mui/material'
import DeptMembersTab from '@/app/admin/DeptMembersTab'
import DeptCalendarTab from '@/app/admin/unit/calendar/DeptCalendarTab'
import ZeusNotesTab from './ZeusNotesTab'
import PinTabLabel from '@/app/admin/_components/PinTabLabel'
import CornerBrackets from '@/app/admin/_components/CornerBrackets'
import { useTabState } from '@/app/admin/_components/useTabState'
import MeetingsTab from '@/app/admin/_components/meetings/MeetingsTab'

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
        padding: '4px 10px',
        background: active ? 'rgba(219,0,29,0.3)' : 'none',
        border: '1px solid rgba(219,0,29,0.25)',
        color: active ? 'var(--foreground)' : 'rgba(237,237,237,0.4)',
        cursor: 'pointer',
    })

    return (
        <div className='h-full w-full flex flex-col max-w-[1100px]'>
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
                            <span style={{ color: 'rgba(219,0,29,0.35)' }}>//</span> DEPARTMENTS
                        </span>
                    <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        [J6] Game Masters
                    </Typography>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                        <button style={{ ...btnSx(view === 'meetings'), width: '100%', textAlign: 'center' }} onClick={() => setView(view === 'meetings' ? 'dept' : 'meetings')}>Meetings</button>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button style={btnSx(view === 'members')} onClick={() => setView(view === 'members' ? 'dept' : 'members')}>Members</button>
                            <button style={btnSx(view === 'calendar')} onClick={() => setView(view === 'calendar' ? 'dept' : 'calendar')}>Calendar</button>
                        </div>
                    </div>
            </div>

            {view === 'members' && (
                <DeptMembersTab department='j6' displayName={displayName} userId={userId} canManage={canManageMembers} />
            )}
            {view === 'calendar' && (
                <DeptCalendarTab department='j6' userId={userId} isJ4={isJ4} />
            )}
            {view === 'meetings' && (
                <MeetingsTab department='j6' userId={userId} isLead={canManageMembers} />
            )}
            {view === 'dept' && (
                <>
                    <div className='mx-6 mt-4' style={{ borderBottom: '1px solid rgba(219,0,29,0.42)' }}>
                        <Tabs
                            value={tab}
                            onChange={(_, v) => setTab(v)}
                            TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                            sx={{ minHeight: 40 }}
                        >
                            <Tab label={<PinTabLabel label='Zeus Notes' pinLabel='J6 — Zeus Notes' href='/admin/j6' tabIndex={0} />} sx={tabSx} />
                        </Tabs>
                    </div>

                    <div className='flex-1 min-h-0 mt-0'>
                        {tab === 0 && <ZeusNotesTab />}
                    </div>
                </>
            )}
        </div>
    )
}
