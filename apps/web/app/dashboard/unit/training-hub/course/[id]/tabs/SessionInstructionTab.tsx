'use client'

import { useEffect, useRef, useState } from 'react'
import { Add, Delete } from '@mui/icons-material'
import TrainingGuideEditor from '@/components/training-guide/TrainingGuideEditor'
import CatchUpPlanSection from './CatchUpPlanSection'

const RED = '#db001d'

type TSessionStaff = {
    _id: string
    userId: string
    displayName: string
    role: 'lead_instructor' | 'instructor' | 'observer'
    addedByName: string
    addedAt: string
}

type TCourseStaffItem = {
    userId: string
    displayName: string
    role: 'lead_instructor' | 'instructor' | 'observer'
}

type TSearchResult = {
    userId: string
    displayName: string
    discordUsername?: string
    type: 'member'
}

const ROLE_LABELS: Record<string, string> = {
    lead_instructor: 'Lead Instructor',
    instructor:      'Instructor',
    observer:        'Observer',
}

const ROLE_ORDER: Record<string, number> = {
    lead_instructor: 0,
    instructor:      1,
    observer:        2,
}

const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
    attended:           'Attended',
    absent:             'Absent',
    excused:            'Excused',
    late:               'Late',
    withdrawn:          'Withdrawn',
    rerolled:           'Rerolled',
    catch_up_required:  'Catch-up Required',
    catch_up_completed: 'Catch-up Completed',
}

const ATTENDANCE_STATUS_COLORS: Record<string, string> = {
    attended:           'rgba(80,200,120,0.85)',
    absent:             'rgba(219,0,29,0.75)',
    excused:            'rgba(255,180,50,0.75)',
    late:               'rgba(255,180,50,0.55)',
    withdrawn:          'rgba(237,237,237,0.35)',
    rerolled:           'rgba(100,160,240,0.75)',
    catch_up_required:  'rgba(219,0,29,0.5)',
    catch_up_completed: 'rgba(80,200,120,0.55)',
}

const SESSION_STATUS_OPTIONS = [
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
]

const SESSION_STATUS_COLORS: Record<string, string> = {
    scheduled: 'rgba(255,180,50,0.75)',
    completed: 'rgba(80,200,120,0.75)',
    cancelled: 'rgba(237,237,237,0.35)',
}

interface Props {
    courseInstanceId: string
    sessionId: string
    session: {
        _id: string
        sessionNumber: number
        weekNumber: number
        title: string
        catchUp: boolean
        catchUpRequired?: boolean
        sessionStatus?: string
        scheduledDate: string
    }
    myId: string
    myName: string
    courseStaff: TCourseStaffItem[]
}

function fmt(d: string | undefined) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Fetches (or creates) the session's training guide and renders the editor
function SessionGuideSection({ courseInstanceId, sessionId }: { courseInstanceId: string; sessionId: string }) {
    const [guide, setGuide] = useState<TrainingGuide | null>(null)
    const [guideId, setGuideId] = useState<string>('')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch(`/api/j3/course-instances/${courseInstanceId}/sessions/${sessionId}/guide`)
            .then(r => r.json())
            .then(d => {
                if (d.guide) {
                    setGuide(d.guide)
                    setGuideId(d.guide._id?.toString() ?? '')
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [courseInstanceId, sessionId])

    if (loading) return <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)', padding: '12px 0' }}>Loading guide…</div>
    if (!guide || !guideId) return <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>Could not load guide.</div>

    return (
        <TrainingGuideEditor
            guide={guide}
            guideId={guideId}
            isEditable={true}
            accentColor={guide.accentColor ?? RED}
            outlineColor={guide.outlineColor ?? RED}
            hideDocRef={true}
        />
    )
}

export default function SessionInstructionTab({ courseInstanceId, sessionId, session, myId: _myId, myName: _myName, courseStaff }: Props) {
    const [sessionStaff, setSessionStaff] = useState<TSessionStaff[]>([])
    const [staffLoading, setStaffLoading] = useState(true)
    const [attendanceSummary, setAttendanceSummary] = useState<Record<string, number>>({})

    const [showStaffSearch, setShowStaffSearch] = useState(false)
    const [staffQuery, setStaffQuery] = useState('')
    const [staffResults, setStaffResults] = useState<TSearchResult[]>([])
    const [newStaffRole, setNewStaffRole] = useState<'lead_instructor' | 'instructor' | 'observer'>('instructor')
    const [addingStaff, setAddingStaff] = useState(false)
    const [removingStaffId, setRemovingStaffId] = useState<string | null>(null)
    const [searchingStaff, setSearchingStaff] = useState(false)

    const [catchUpRequired, setCatchUpRequired] = useState<boolean | null>(session.catchUpRequired ?? null)
    const [savingCatchUp, setSavingCatchUp] = useState(false)

    const [sessionStatus, setSessionStatus] = useState(session.sessionStatus ?? 'scheduled')
    const [savingStatus, setSavingStatus] = useState(false)

    const staffSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
    const staffSearchPanelRef = useRef<HTMLDivElement>(null)

    // Sorted course-level staff for quick-select (lead → instructor → observer)
    const sortedCourseStaff = [...courseStaff].sort(
        (a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)
    )

    // Load session staff and attendance summary
    useEffect(() => {
        fetch(`/api/j3/course-instances/${courseInstanceId}/sessions/${sessionId}/staff`)
            .then(r => r.json())
            .then(d => setSessionStaff(d.staff ?? []))
            .catch(() => {})
            .finally(() => setStaffLoading(false))

        fetch(`/api/j3/course-instances/${courseInstanceId}/sessions/${sessionId}/attendance`)
            .then(r => r.json())
            .then(d => {
                const records: Array<{ status: string }> = d.attendance ?? []
                const summary: Record<string, number> = {}
                for (const r of records) {
                    summary[r.status] = (summary[r.status] ?? 0) + 1
                }
                setAttendanceSummary(summary)
            })
            .catch(() => {})
    }, [courseInstanceId, sessionId])

    // Staff member search debounce
    useEffect(() => {
        if (staffSearchDebounce.current) clearTimeout(staffSearchDebounce.current)
        if (!staffQuery.trim() || staffQuery.trim().length < 2) { setStaffResults([]); return }
        staffSearchDebounce.current = setTimeout(async () => {
            setSearchingStaff(true)
            try {
                const r = await fetch(`/api/j3/candidate-search?q=${encodeURIComponent(staffQuery.trim())}`)
                const d = await r.json()
                setStaffResults(d.results ?? [])
            } catch { /* ignore */ } finally {
                setSearchingStaff(false)
            }
        }, 300)
        return () => { if (staffSearchDebounce.current) clearTimeout(staffSearchDebounce.current) }
    }, [staffQuery])

    // Click-off for staff search panel
    useEffect(() => {
        if (!showStaffSearch) return
        function onOutside(e: MouseEvent) {
            if (staffSearchPanelRef.current && !staffSearchPanelRef.current.contains(e.target as Node)) {
                setShowStaffSearch(false)
                setStaffQuery('')
                setStaffResults([])
            }
        }
        document.addEventListener('mousedown', onOutside)
        return () => document.removeEventListener('mousedown', onOutside)
    }, [showStaffSearch])

    async function handleAddStaff(result: Pick<TSearchResult, 'userId' | 'displayName'>) {
        if (addingStaff) return
        setAddingStaff(true)
        try {
            const res = await fetch(`/api/j3/course-instances/${courseInstanceId}/sessions/${sessionId}/staff`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: result.userId, displayName: result.displayName, role: newStaffRole }),
            })
            if (!res.ok) return
            const d = await res.json()
            setSessionStaff(prev => [...prev, d])
            setStaffQuery('')
            setStaffResults([])
            setShowStaffSearch(false)
        } finally {
            setAddingStaff(false)
        }
    }

    async function handleRemoveStaff(staffId: string) {
        if (removingStaffId) return
        setRemovingStaffId(staffId)
        try {
            const res = await fetch(`/api/j3/course-instances/${courseInstanceId}/sessions/${sessionId}/staff`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ staffId }),
            })
            if (!res.ok) return
            setSessionStaff(prev => prev.filter(s => s._id !== staffId))
        } finally {
            setRemovingStaffId(null)
        }
    }

    async function handleToggleCatchUp() {
        if (savingCatchUp) return
        const next = !catchUpRequired
        setSavingCatchUp(true)
        const prev = catchUpRequired
        setCatchUpRequired(next)
        try {
            const res = await fetch(`/api/j3/course-instances/${courseInstanceId}/sessions`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, catchUpRequired: next }),
            })
            if (!res.ok) setCatchUpRequired(prev)
        } catch {
            setCatchUpRequired(prev)
        } finally {
            setSavingCatchUp(false)
        }
    }

    async function handleSessionStatus(newStatus: string) {
        if (savingStatus || newStatus === sessionStatus) return
        const prev = sessionStatus
        setSessionStatus(newStatus)
        setSavingStatus(true)
        try {
            const res = await fetch(`/api/j3/course-instances/${courseInstanceId}/sessions`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, sessionStatus: newStatus }),
            })
            if (!res.ok) setSessionStatus(prev)
        } catch {
            setSessionStatus(prev)
        } finally {
            setSavingStatus(false)
        }
    }

    const statusColor = SESSION_STATUS_COLORS[sessionStatus] ?? 'rgba(237,237,237,0.4)'
    const totalAttended = Object.values(attendanceSummary).reduce((a, b) => a + b, 0)

    // Items to show in search panel: course staff suggestions or live search results
    const showCourseStaffSuggestions = staffQuery.trim().length === 0 && sortedCourseStaff.length > 0
    const showSearchResults = staffResults.length > 0

    return (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

            {/* Main column */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>

                {/* Session header */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 4 }}>
                            Session {session.sessionNumber} — Week {session.weekNumber}
                        </div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(237,237,237,0.85)', marginBottom: 8 }}>
                            {fmt(session.scheduledDate)}
                        </div>
                        {session.catchUp && (
                            <span style={{ fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,180,50,0.7)', border: '1px solid rgba(255,180,50,0.2)', padding: '1px 5px' }}>
                                Catch-up Session
                            </span>
                        )}
                    </div>

                    {/* Status + catch-up toggle */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>Status</span>
                            <select
                                value={sessionStatus}
                                onChange={e => handleSessionStatus(e.target.value)}
                                disabled={savingStatus}
                                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', color: statusColor, fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 7px', cursor: 'pointer', outline: 'none', opacity: savingStatus ? 0.5 : 1 }}
                            >
                                {SESSION_STATUS_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>

                        {session.catchUp && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>Catch-up Required</span>
                                <button
                                    type='button'
                                    onClick={handleToggleCatchUp}
                                    disabled={savingCatchUp}
                                    style={{
                                        padding: '3px 10px',
                                        background: 'transparent',
                                        border: `1px solid ${catchUpRequired ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.12)'}`,
                                        color: catchUpRequired ? 'rgba(219,0,29,0.85)' : 'rgba(237,237,237,0.3)',
                                        fontSize: '0.55rem',
                                        fontWeight: 800,
                                        letterSpacing: '0.1em',
                                        textTransform: 'uppercase',
                                        cursor: savingCatchUp ? 'default' : 'pointer',
                                        opacity: savingCatchUp ? 0.5 : 1,
                                    }}
                                >
                                    {catchUpRequired === null ? 'Not Set' : catchUpRequired ? 'Yes' : 'No'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Session Staff */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)' }}>
                            Session Staff ({sessionStaff.length})
                        </div>
                        <button
                            type='button'
                            onClick={() => setShowStaffSearch(s => !s)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', background: 'transparent', border: '1px solid rgba(219,0,29,0.25)', color: 'rgba(219,0,29,0.6)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                        >
                            <Add style={{ fontSize: 11 }} /> Add Staff
                        </button>
                    </div>

                    {showStaffSearch && (
                        <div ref={staffSearchPanelRef} style={{ position: 'relative', zIndex: 15, marginBottom: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    type='text'
                                    placeholder='Type to search all members…'
                                    value={staffQuery}
                                    onChange={e => setStaffQuery(e.target.value)}
                                    autoFocus
                                    style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderBottom: '2px solid rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.9)', fontSize: '0.82rem', padding: '7px 10px', outline: 'none' }}
                                />
                                <select
                                    value={newStaffRole}
                                    onChange={e => setNewStaffRole(e.target.value as typeof newStaffRole)}
                                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.6)', fontSize: '0.65rem', padding: '7px 8px', cursor: 'pointer', outline: 'none' }}
                                >
                                    <option value='lead_instructor'>Lead Instructor</option>
                                    <option value='instructor'>Instructor</option>
                                    <option value='observer'>Observer</option>
                                </select>
                            </div>

                            {/* Course staff quick-select (shown when query is empty) */}
                            {showCourseStaffSuggestions && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 2 }}>
                                        Course Staff
                                    </div>
                                    {sortedCourseStaff.map(s => (
                                        <button
                                            key={s.userId}
                                            type='button'
                                            onClick={() => handleAddStaff(s)}
                                            disabled={addingStaff}
                                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(237,237,237,0.75)', cursor: addingStaff ? 'default' : 'pointer', textAlign: 'left' }}
                                        >
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, flex: 1 }}>{s.displayName}</span>
                                            <span style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: s.role === 'lead_instructor' ? 'rgba(219,0,29,0.7)' : 'rgba(237,237,237,0.35)', border: `1px solid ${s.role === 'lead_instructor' ? 'rgba(219,0,29,0.2)' : 'rgba(255,255,255,0.08)'}`, padding: '1px 5px', flexShrink: 0 }}>
                                                {ROLE_LABELS[s.role]}
                                            </span>
                                            <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(80,200,120,0.7)', border: '1px solid rgba(80,200,120,0.2)', padding: '1px 5px', flexShrink: 0 }}>Add</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Live search results */}
                            {searchingStaff && <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)' }}>Searching…</div>}
                            {showSearchResults && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {staffQuery.trim().length > 0 && (
                                        <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 2 }}>
                                            Search Results
                                        </div>
                                    )}
                                    {staffResults.map(r => (
                                        <button key={r.userId} type='button' onClick={() => handleAddStaff(r)} disabled={addingStaff}
                                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(237,237,237,0.75)', cursor: addingStaff ? 'default' : 'pointer', textAlign: 'left' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, flex: 1 }}>{r.displayName}</span>
                                            {r.discordUsername && <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)' }}>{r.discordUsername}</span>}
                                            <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(80,200,120,0.7)', border: '1px solid rgba(80,200,120,0.2)', padding: '1px 5px', flexShrink: 0 }}>Add</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {staffQuery.trim().length >= 2 && !searchingStaff && staffResults.length === 0 && (
                                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)' }}>No results</div>
                            )}
                        </div>
                    )}

                    {staffLoading ? (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)' }}>Loading…</div>
                    ) : sessionStaff.length === 0 ? (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No staff assigned to this session.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {sessionStaff.map(s => (
                                <div key={s._id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 10, padding: '7px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(237,237,237,0.8)' }}>{s.displayName}</div>
                                    <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: s.role === 'lead_instructor' ? 'rgba(219,0,29,0.75)' : 'rgba(237,237,237,0.4)', border: `1px solid ${s.role === 'lead_instructor' ? 'rgba(219,0,29,0.25)' : 'rgba(255,255,255,0.1)'}`, padding: '2px 6px' }}>
                                        {ROLE_LABELS[s.role] ?? s.role}
                                    </span>
                                    <button type='button' onClick={() => handleRemoveStaff(s._id)} disabled={removingStaffId === s._id}
                                        style={{ padding: '3px 6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(237,237,237,0.2)', cursor: removingStaffId === s._id ? 'default' : 'pointer', display: 'flex', alignItems: 'center', opacity: removingStaffId === s._id ? 0.4 : 1 }}>
                                        <Delete style={{ fontSize: 11 }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Session Instructions — catch-up sessions use the builder, regular sessions use the guide editor */}
                <div>
                    <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 16 }}>
                        Session Instructions
                    </div>
                    {session.catchUp
                        ? <CatchUpPlanSection courseInstanceId={courseInstanceId} sessionId={sessionId} />
                        : <SessionGuideSection courseInstanceId={courseInstanceId} sessionId={sessionId} />
                    }
                </div>

            </div>

            {/* Right panel — Attendance Summary */}
            <div style={{ width: 190, flexShrink: 0, position: 'sticky', top: 24 }}>
                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 12 }}>
                        Attendance
                        {totalAttended > 0 && <span style={{ marginLeft: 6, color: 'rgba(237,237,237,0.25)' }}>{totalAttended}</span>}
                    </div>
                    {totalAttended === 0 ? (
                        <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.18)', fontStyle: 'italic' }}>No attendance recorded.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {Object.entries(attendanceSummary).map(([status, count]) => {
                                const color = ATTENDANCE_STATUS_COLORS[status] ?? 'rgba(237,237,237,0.4)'
                                return (
                                    <div key={status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                            <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.45)' }}>{ATTENDANCE_STATUS_LABELS[status] ?? status}</span>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color, fontFamily: 'monospace' }}>{count}</span>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

        </div>
    )
}
