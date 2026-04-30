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
    pending:            { label: 'Pending',           color: 'rgba(237,237,237,0.3)',   icon: <HelpOutline sx={{ fontSize: 13 }} /> },
    attending:          { label: 'Attending',         color: 'rgba(74,222,128,0.8)',    icon: <CheckCircle sx={{ fontSize: 13 }} /> },
    not_attending:      { label: 'Not Attending',     color: 'rgba(219,0,29,0.7)',      icon: <Cancel sx={{ fontSize: 13 }} /> },
    loa:                { label: 'LOA',               color: 'rgba(0,195,255,0.7)',     icon: <FlightTakeoff sx={{ fontSize: 13 }} /> },
    confirmed_attended: { label: 'Confirmed Present', color: 'rgba(74,222,128,0.9)',    icon: <CheckCircle sx={{ fontSize: 13 }} /> },
    confirmed_absent:   { label: 'Confirmed Absent',  color: 'rgba(219,0,29,0.65)',     icon: <Cancel sx={{ fontSize: 13 }} /> },
}

// Statuses members can set for themselves
const MEMBER_STATUSES: Status[] = ['attending', 'not_attending', 'loa']

// What a lead confirms to
const LEAD_CONFIRM: Partial<Record<Status, Status>> = {
    attending:     'confirmed_attended',
    not_attending: 'confirmed_absent',
    // loa stays as loa — leads cannot override LOA
}

export default function MeetingAttendance({ meetingId, attendees, department, userId, isLead, locked, completed, onUpdate }: Props) {
    const [updating, setUpdating] = useState<string | null>(null)
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
    const confirmed = attendees.filter(a => a.status === 'confirmed_attended').length
    const attended  = attendees.filter(a => a.status === 'attending').length
    const absent    = attendees.filter(a => a.status === 'confirmed_absent' || a.status === 'not_attending').length
    const loa       = attendees.filter(a => a.status === 'loa').length
    const pending   = attendees.filter(a => a.status === 'pending').length

    // Can the current user RSVP? Only if their status is not yet lead-confirmed
    const myStatusRsvpable = myRecord && ['pending', 'attending', 'not_attending', 'loa'].includes(myRecord.status)
    const canRsvp = myStatusRsvpable && !locked && !completed

    if (attendees.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>
                    No attendance list yet.
                </span>
                {isLead && (
                    <button
                        onClick={initialise}
                        disabled={initialising}
                        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', padding: '5px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)' }}
                    >
                        {initialising ? <CircularProgress size={11} color='inherit' /> : <PersonAdd sx={{ fontSize: 13 }} />}
                        Initialise from department members
                    </button>
                )}
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Summary bar */}
            <div style={{ display: 'flex', gap: 12, fontSize: '0.62rem', fontFamily: 'monospace', flexWrap: 'wrap' }}>
                {confirmed > 0 && <span style={{ color: 'rgba(74,222,128,0.9)' }}>{String(confirmed).padStart(2,'0')} confirmed</span>}
                {attended  > 0 && <span style={{ color: 'rgba(74,222,128,0.65)' }}>{String(attended).padStart(2,'0')} attending</span>}
                {absent    > 0 && <span style={{ color: 'rgba(219,0,29,0.6)' }}>{String(absent).padStart(2,'0')} absent</span>}
                {loa       > 0 && <span style={{ color: 'rgba(0,195,255,0.6)' }}>{String(loa).padStart(2,'0')} loa</span>}
                {pending   > 0 && <span style={{ color: 'rgba(237,237,237,0.3)' }}>{String(pending).padStart(2,'0')} pending</span>}
            </div>

            {/* Your RSVP */}
            {canRsvp && (
                <div style={{ padding: '8px 10px', background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)', flexShrink: 0 }}>Your attendance:</span>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {MEMBER_STATUSES.map(s => (
                            <button key={s} onClick={() => setStatus(userId, s)}
                                disabled={updating === userId}
                                style={{ all: 'unset', cursor: 'pointer', fontSize: '0.62rem', fontWeight: 700, padding: '3px 9px', border: `1px solid ${myRecord?.status === s ? STATUS_CONFIG[s].color : 'rgba(255,255,255,0.1)'}`, color: myRecord?.status === s ? STATUS_CONFIG[s].color : 'rgba(237,237,237,0.3)', background: myRecord?.status === s ? `${STATUS_CONFIG[s].color}15` : 'transparent', display: 'flex', alignItems: 'center', gap: 4 }}>
                                {updating === userId ? <CircularProgress size={10} color='inherit' /> : STATUS_CONFIG[s].icon}
                                {STATUS_CONFIG[s].label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Attendee list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {attendees.map(a => {
                    const cfg = STATUS_CONFIG[a.status]
                    const canConfirm = isLead && completed && LEAD_CONFIRM[a.status] !== undefined
                    const confirmStatus = LEAD_CONFIRM[a.status]

                    return (
                        <div key={a.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ color: cfg.color, flexShrink: 0, display: 'flex' }}>{cfg.icon}</span>
                            <span style={{ flex: 1, fontSize: '0.73rem', color: 'rgba(237,237,237,0.75)' }}>{a.displayName}</span>
                            <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', color: cfg.color }}>{cfg.label}</span>
                            {canConfirm && confirmStatus && (
                                <button
                                    onClick={() => setStatus(a.userId, confirmStatus)}
                                    disabled={updating === a.userId}
                                    style={{ all: 'unset', cursor: 'pointer', fontSize: '0.58rem', fontWeight: 700, padding: '2px 7px', border: `1px solid ${STATUS_CONFIG[confirmStatus].color}44`, color: STATUS_CONFIG[confirmStatus].color, background: `${STATUS_CONFIG[confirmStatus].color}0d` }}
                                >
                                    {updating === a.userId ? <CircularProgress size={9} color='inherit' /> : 'Confirm'}
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Re-initialise button (lead only, if list needs refresh) */}
            {isLead && !completed && !locked && (
                <button
                    onClick={initialise}
                    disabled={initialising}
                    style={{ all: 'unset', cursor: 'pointer', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.06em' }}
                >
                    {initialising ? <CircularProgress size={10} color='inherit' /> : <PersonAdd sx={{ fontSize: 11 }} />}
                    Sync from department members
                </button>
            )}
        </div>
    )
}
