'use client'

import { Lock, CheckCircle } from '@mui/icons-material'

interface Props {
    meeting: Meeting
    selected: boolean
    onClick: () => void
}

export default function MeetingListItem({ meeting, selected, onClick }: Props) {
    const date = new Date(meeting.date)
    const dateStr = date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })

    return (
        <button
            onClick={onClick}
            style={{
                all: 'unset', display: 'block', width: '100%', cursor: 'pointer',
                padding: '10px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: selected ? 'rgba(219,0,29,0.1)' : 'transparent',
                borderLeft: selected ? '2px solid var(--red)' : '2px solid transparent',
                transition: 'background 0.1s',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                <span style={{
                    fontSize: '0.72rem', fontWeight: 700,
                    color: selected ? 'var(--foreground)' : 'rgba(237,237,237,0.75)',
                    lineHeight: 1.3, flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {meeting.title}
                </span>
                {meeting.completed && <CheckCircle sx={{ fontSize: 11, color: 'rgba(74,222,128,0.6)', flexShrink: 0, mt: '2px' }} />}
                {!meeting.completed && meeting.locked && <Lock sx={{ fontSize: 11, color: 'rgba(219,0,29,0.6)', flexShrink: 0, mt: '2px' }} />}
            </div>
            <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', marginTop: 3, display: 'block' }}>
                {dateStr}
            </span>
            {(meeting.tasks.length > 0 || meeting.attachments.length > 0) && (
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
