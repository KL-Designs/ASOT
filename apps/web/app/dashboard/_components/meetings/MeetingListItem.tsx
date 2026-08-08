'use client'

import { Lock, CheckCircle, SwapHoriz } from '@mui/icons-material'

const DEPT_SHORT: Record<string, string> = {
    j1: 'J1', j2: 'J2', j3: 'J3', j4: 'J4', j5: 'J5', j6: 'J6', j7: 'J7',
}

interface Props {
    meeting: Meeting
    selected: boolean
    onClick: () => void
}

export default function MeetingListItem({ meeting, selected, onClick }: Props) {
    const date = new Date(meeting.date)
    const dateStr = date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
    const isTransferred = meeting.isTransferred ?? false

    const borderLeft = selected
        ? '2px solid var(--red)'
        : isTransferred
        ? '2px solid rgba(0,195,255,0.5)'
        : '2px solid transparent'

    const background = selected
        ? 'rgba(219,0,29,0.1)'
        : isTransferred
        ? 'rgba(0,195,255,0.03)'
        : 'transparent'

    return (
        <button
            onClick={onClick}
            style={{
                all: 'unset', display: 'block', width: '100%', cursor: 'pointer',
                padding: '10px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background,
                borderLeft,
                transition: 'background 0.1s',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                <span style={{
                    fontSize: '0.72rem', fontWeight: 700,
                    color: selected ? 'var(--foreground)' : isTransferred ? 'rgba(180,230,255,0.75)' : 'rgba(237,237,237,0.75)',
                    lineHeight: 1.3, flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {meeting.title}
                </span>
                <div style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center', marginTop: 2 }}>
                    {meeting.completed && <CheckCircle sx={{ fontSize: 11, color: 'rgba(74,222,128,0.6)' }} />}
                    {!meeting.completed && meeting.locked && <Lock sx={{ fontSize: 11, color: 'rgba(219,0,29,0.6)' }} />}
                    {isTransferred && <SwapHoriz sx={{ fontSize: 11, color: 'rgba(0,195,255,0.6)' }} />}
                </div>
            </div>
            <span style={{ fontSize: '0.6rem', color: isTransferred ? 'rgba(0,195,255,0.4)' : 'rgba(237,237,237,0.3)', marginTop: 3, display: 'block' }}>
                {dateStr}
            </span>
            {isTransferred && meeting.transferredFrom && (
                <span style={{ fontSize: '0.56rem', color: 'rgba(0,195,255,0.45)', display: 'block', marginTop: 2, letterSpacing: '0.04em' }}>
                    ↳ from {DEPT_SHORT[meeting.transferredFrom.department] ?? meeting.transferredFrom.department} · {meeting.transferredFrom.transferredByName}
                </span>
            )}
            {!isTransferred && (meeting.tasks.length > 0 || meeting.attachments.length > 0) && (
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {meeting.tasks.length > 0 && (
                        <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.05em' }}>
                            {meeting.tasks.length} task{meeting.tasks.length !== 1 ? 's' : ''}
                        </span>
                    )}
                    {meeting.attachments.length > 0 && (
                        <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.05em' }}>
                            {meeting.attachments.length} file{meeting.attachments.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
            )}
        </button>
    )
}
