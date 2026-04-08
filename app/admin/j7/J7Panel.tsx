'use client'

import { Typography } from '@mui/material'
import DeptMembersTab from '@/app/admin/DeptMembersTab'
import DeptCalendarTab from '@/app/admin/unit/calendar/DeptCalendarTab'
import CornerBrackets from '@/app/admin/_components/CornerBrackets'
import { useTabState } from '@/app/admin/_components/useTabState'

export default function J7Panel({
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
    const { view, setView } = useTabState(0, 'members')

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
                className='flex flex-col px-5 py-4 mx-6 mt-6'
                style={{
                    position: 'relative',
                    border: '1px solid rgba(219,0,29,0.42)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <CornerBrackets />
                <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', fontFamily: 'monospace', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: 'rgba(219,0,29,0.35)' }}>//</span> DEPARTMENTS
                </span>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                    <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        [J7] Development
                    </Typography>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button style={btnSx(view === 'members')} onClick={() => setView('members')}>Members</button>
                        <button style={btnSx(view === 'calendar')} onClick={() => setView('calendar')}>Calendar</button>
                    </div>
                </div>
            </div>

            <div className='flex-1 min-h-0'>
                {view === 'members' && (
                    <DeptMembersTab department='j7' displayName={displayName} userId={userId} canManage={canManageMembers} />
                )}
                {view === 'calendar' && (
                    <DeptCalendarTab department='j7' userId={userId} isJ4={isJ4} />
                )}
            </div>
        </div>
    )
}
