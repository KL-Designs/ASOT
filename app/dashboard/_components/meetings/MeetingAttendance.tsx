'use client'

import { useState } from 'react'
import { CircularProgress } from '@mui/material'
import { CheckCircle, Cancel, HelpOutline, PersonAdd, FlightTakeoff } from '@mui/icons-material'

interface Props {
    meetingId: string
    attendees: MeetingAttendee[]
    department: MeetingDepartment
    userId: string
    isLead: boolean
    locked: boolean
    completed: boolean
    onUpdate: (m: Meeting) => void
}

type Status = MeetingAttendee['status']

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: React.ReactNode }> = {
    pending:            { label: 'Pending',           color: 'rgba(237,237,237,0.3)',  icon: <HelpOutline sx={{ fontSize: 12 }} /> },
    attending:          { label: 'Attending',         color: 'rgba(74,222,128,0.8)',   icon: <CheckCircle sx={{ fontSize: 12 }} /> },
    not_attending:      { label: 'Not Attending',     color: 'rgba(219,0,29,0.7)',     icon: <Cancel sx={{ fontSize: 12 }} /> },
    loa:                { label: 'LOA',               color: 'rgba(0,195,255,0.7)',    icon: <FlightTakeoff sx={{ fontSize: 12 }} /> },
    confirmed_attended: { label: 'Confirmed',         color: 'rgba(74,222,128,0.95)',  icon: <CheckCircle sx={{ fontSize: 12 }} /> },
    confirmed_absent:   { label: 'Confirmed Absent',  color: 'rgba(219,0,29,0.65)',    icon: <Cancel sx={{ fontSize: 12 }} /> },
}

const MEMBER_STATUSES: Status[] = ['attending', 'not_attending', 'loa']

const LEAD_CONFIRM: Partial<Record<Status, Status>> = {
    attending:     'confirmed_attended',
    not_attending: 'confirmed_absent',
}

const GROUP_LABELS: Record<MeetingAttendee['group'], string> = {
    j4:          'J4 Administration',
    dept_lead:   'Department Leads',
    dept_member: 'Department Members',
    invited:     'Invited Members',
}

const GROUP_ORDER: MeetingAttendee['group'][] = ['j4', 'dept_lead', 'dept_member', 'invited']

export default function MeetingAttendance({ meetingId, attendees, department, userId, isLead, locked, completed, onUpdate }: Props) {
    const [updating, setUpdating]     = useState<string | null>(null)
    const [initialising, setInitialising] = useState(false)

    async function refresh() {
        const fresh = await fetch(`/api/admin/meetings/${meetingId}`).then(r => r.json())
        if (fresh.meeting) onUpdate(fresh.meeting)
    }

    async function setStatus(targetUserId: string, status: Status) {
        setUpdating(targetUserId)
        try {
            await fetch(`/api/admin/meetings/${meetingId}/attendance`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: targetUserId, status }),
            })
            await refresh()
        } finally { setUpdating(null) }
    }

    async function initialise() {
        setInitialising(true)
        try {
            await fetch(`/api/admin/meetings/${meetingId}/attendance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ department }),
            })
            await refresh()
        } finally { setInitialising(false) }
    }

    const myRecord = attendees.find(a => a.userId === userId)
    const canRsvp  = myRecord
        && ['pending', 'attending', 'not_attending', 'loa'].includes(myRecord.status)
        && !locked && !completed

    // Tally
    const confirmed = attendees.filter(a => a.status === 'confirmed_attended').length
    const attending = attendees.filter(a => a.status === 'attending').length
    const absent    = attendees.filter(a => a.status === 'confirmed_absent' || a.status === 'not_attending').length
    const loa       = attendees.filter(a => a.status === 'loa').length
    const pending   = attendees.filter(a => a.status === 'pending').length

    if (attendees.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: '0.67rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>
                    {initialising ? 'Loading attendance…' : 'No members found.'}
                </span>
                {isLead && !initialising && (
                    <button onClick={initialise} disabled={initialising} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.58rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.06em' }}>
                        <PersonAdd sx={{ fontSize: 11 }} /> Sync members
                    </button>
                )}
                {initialising && <CircularProgress size={14} style={{ color: 'rgba(219,0,29,0.4)' }} />}
            </div>
        )
    }

    // Group attendees — fall back to 'dept_member' for legacy records without a group field
    const grouped: Record<MeetingAttendee['group'], MeetingAttendee[]> = {
        j4: [], dept_lead: [], dept_member: [], invited: [],
    }
    for (const a of attendees) {
        const g = a.group ?? 'dept_member'
        grouped[g].push(a)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Summary */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '0.6rem', fontFamily: 'monospace' }}>
                {confirmed > 0 && <span style={{ color: 'rgba(74,222,128,0.9)' }}>{confirmed} confirmed</span>}
                {attending  > 0 && <span style={{ color: 'rgba(74,222,128,0.6)' }}>{attending} attending</span>}
                {absent     > 0 && <span style={{ color: 'rgba(219,0,29,0.6)' }}>{absent} absent</span>}
                {loa        > 0 && <span style={{ color: 'rgba(0,195,255,0.6)' }}>{loa} loa</span>}
                {pending    > 0 && <span style={{ color: 'rgba(237,237,237,0.3)' }}>{pending} pending</span>}
            </div>

            {/* Your RSVP */}
            {canRsvp && (
                <div style={{ padding: '7px 9px', background: 'rgba(219,0,29,0.05)', border: '1px solid rgba(219,0,29,0.18)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.35)' }}>Your attendance:</span>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {MEMBER_STATUSES.map(s => (
                            <button key={s} onClick={() => setStatus(userId, s)} disabled={updating === userId}
                                style={{ all: 'unset', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, padding: '3px 8px', border: `1px solid ${myRecord?.status === s ? STATUS_CONFIG[s].color : 'rgba(255,255,255,0.1)'}`, color: myRecord?.status === s ? STATUS_CONFIG[s].color : 'rgba(237,237,237,0.3)', background: myRecord?.status === s ? `${STATUS_CONFIG[s].color}18` : 'transparent', display: 'flex', alignItems: 'center', gap: 3 }}>
                                {updating === userId ? <CircularProgress size={9} color='inherit' /> : STATUS_CONFIG[s].icon}
                                {STATUS_CONFIG[s].label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Grouped attendee list */}
            {GROUP_ORDER.map(grp => {
                const list = grouped[grp]
                if (list.length === 0) return null
                return (
                    <div key={grp}>
                        <div style={{ fontSize: '0.54rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: grp === 'j4' ? 'rgba(219,0,29,0.5)' : grp === 'dept_lead' ? 'rgba(255,200,0,0.5)' : grp === 'invited' ? 'rgba(0,195,255,0.5)' : 'rgba(237,237,237,0.25)', marginBottom: 3, paddingBottom: 3, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            {GROUP_LABELS[grp]}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {list.map(a => {
                                const cfg = STATUS_CONFIG[a.status]
                                const canConfirm   = isLead && completed && LEAD_CONFIRM[a.status] !== undefined
                                const confirmStatus = LEAD_CONFIRM[a.status]
                                return (
                                    <div key={a.userId} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}>
                                        <span style={{ color: cfg.color, flexShrink: 0, display: 'flex' }}>{cfg.icon}</span>
                                        <span style={{ flex: 1, fontSize: '0.7rem', color: 'rgba(237,237,237,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.displayName}</span>
                                        {canConfirm && confirmStatus ? (
                                            <button onClick={() => setStatus(a.userId, confirmStatus)} disabled={updating === a.userId}
                                                style={{ all: 'unset', cursor: 'pointer', fontSize: '0.54rem', fontWeight: 700, padding: '1px 5px', border: `1px solid ${STATUS_CONFIG[confirmStatus].color}44`, color: STATUS_CONFIG[confirmStatus].color, background: `${STATUS_CONFIG[confirmStatus].color}0d`, flexShrink: 0 }}>
                                                {updating === a.userId ? <CircularProgress size={8} color='inherit' /> : 'Confirm'}
                                            </button>
                                        ) : (
                                            <span style={{ fontSize: '0.54rem', fontWeight: 700, letterSpacing: '0.06em', color: cfg.color, flexShrink: 0 }}>{cfg.label}</span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })}

            {/* Sync button */}
            {isLead && !completed && !locked && (
                <button onClick={initialise} disabled={initialising} style={{ all: 'unset', cursor: 'pointer', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.58rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.06em' }}>
                    {initialising ? <CircularProgress size={10} color='inherit' /> : <PersonAdd sx={{ fontSize: 11 }} />}
                    Sync members
                </button>
            )}
        </div>
    )
}
