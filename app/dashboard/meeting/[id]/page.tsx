'use client'

import { useState, useEffect, use } from 'react'
import { CircularProgress } from '@mui/material'
import { CheckCircle, Lock, CalendarToday, Business } from '@mui/icons-material'
import MeetingAttendance from '@/app/dashboard/_components/meetings/MeetingAttendance'

const DEPT_NAMES: Record<string, string> = {
    j1: 'J1 Recruitment', j2: 'J2 Mission Making', j3: 'J3 Training',
    j4: 'J4 Administration', j5: 'J5 Media', j6: 'J6 Game Masters',
    j7: 'J7 Community Development',
}

export default function MeetingViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const [meeting, setMeeting] = useState<Meeting | null>(null)
    const [userId, setUserId]   = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState<string | null>(null)

    useEffect(() => {
        async function load() {
            try {
                const [meetingRes, meRes] = await Promise.all([
                    fetch(`/api/admin/meetings/${id}`),
                    fetch('/api/me'),
                ])

                if (meetingRes.status === 403) { setError('You do not have access to this meeting.'); return }
                if (meetingRes.status === 404) { setError('Meeting not found.'); return }
                if (!meetingRes.ok) { setError('Failed to load meeting.'); return }

                const meetingData = await meetingRes.json()
                const meData      = await meRes.json()

                setMeeting(meetingData.meeting)
                setUserId(meData.id ?? null)
            } catch {
                setError('Failed to load meeting.')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [id])

    function onUpdate(updated: Meeting) {
        setMeeting(updated)
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <CircularProgress size={28} style={{ color: 'rgba(219,0,29,0.6)' }} />
            </div>
        )
    }

    if (error || !meeting || !userId) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: '0.85rem', color: 'rgba(219,0,29,0.7)', fontWeight: 700 }}>
                        {error ?? 'Something went wrong.'}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)' }}>
                        Return to the dashboard and try again.
                    </span>
                </div>
            </div>
        )
    }

    const completed = meeting.completed ?? false
    const locked    = meeting.locked

    return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Header */}
            <div style={{ borderBottom: '1px solid rgba(219,0,29,0.2)', paddingBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', fontFamily: 'monospace' }}>
                        {'// Meeting'}
                    </span>
                    {completed && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.6rem', fontWeight: 700, color: 'rgba(74,222,128,0.7)', padding: '1px 6px', border: '1px solid rgba(74,222,128,0.25)', background: 'rgba(74,222,128,0.06)' }}>
                            <CheckCircle sx={{ fontSize: 10 }} /> Completed
                        </span>
                    )}
                    {locked && !completed && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.6rem', fontWeight: 700, color: 'rgba(219,0,29,0.7)', padding: '1px 6px', border: '1px solid rgba(219,0,29,0.25)' }}>
                            <Lock sx={{ fontSize: 10 }} /> Locked
                        </span>
                    )}
                </div>
                <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--foreground)' }}>
                    {meeting.title}
                </h1>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: 'rgba(237,237,237,0.45)' }}>
                        <CalendarToday sx={{ fontSize: 12 }} />
                        {new Date(meeting.date).toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' })}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: 'rgba(237,237,237,0.45)' }}>
                        <Business sx={{ fontSize: 12 }} />
                        {DEPT_NAMES[meeting.department] ?? meeting.department.toUpperCase()}
                    </span>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>

                {/* Left: notes */}
                <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', fontFamily: 'monospace', marginBottom: 8 }}>
                            {'// Notes'}
                        </div>
                        {meeting.notes ? (
                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(237,237,237,0.75)', lineHeight: 1.65, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', padding: '10px 12px' }}>
                                {meeting.notes}
                            </p>
                        ) : (
                            <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No notes yet.</span>
                        )}
                    </div>
                </div>

                {/* Right: attendance RSVP */}
                <div style={{ width: 280, flexShrink: 0, border: '1px solid rgba(219,0,29,0.18)', background: 'rgba(219,0,29,0.02)' }}>
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(219,0,29,0.12)' }}>
                        <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', fontFamily: 'monospace' }}>
                            {'// Attendance'}
                        </span>
                    </div>
                    <div style={{ padding: '12px' }}>
                        <MeetingAttendance
                            meetingId={id}
                            attendees={meeting.attendees ?? []}
                            department={meeting.department}
                            userId={userId}
                            isLead={false}
                            locked={locked}
                            completed={completed}
                            onUpdate={onUpdate}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
