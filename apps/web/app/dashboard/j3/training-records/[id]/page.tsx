'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowBack, Lock, LockOpen, OpenInNew, History } from '@mui/icons-material'
import { CircularProgress } from '@mui/material'

const RED = '#db001d'

const INSTANCE_STATUS_LABELS: Record<string, string> = {
    planning:    'Planning',
    active:      'Active',
    in_progress: 'In Progress',
    completed:   'Completed',
    cancelled:   'Cancelled',
    archived:    'Archived',
}

const INSTANCE_STATUS_COLORS: Record<string, string> = {
    planning:    'rgba(147,197,253,0.7)',
    active:      'rgba(100,200,160,0.75)',
    in_progress: 'rgba(245,158,11,0.7)',
    completed:   'rgba(34,197,94,0.85)',
    cancelled:   'rgba(239,68,68,0.85)',
    archived:    'rgba(150,150,150,0.7)',
}

const CANDIDATE_STATUS_LABELS: Record<string, string> = {
    active:    'Active',
    withdrawn: 'Withdrawn',
    removed:   'Removed',
    passed:    'Passed',
    failed:    'Failed',
}

const CANDIDATE_STATUS_COLORS: Record<string, string> = {
    active:    'rgba(100,200,160,0.75)',
    withdrawn: 'rgba(150,150,150,0.7)',
    removed:   'rgba(150,150,150,0.7)',
    passed:    'rgba(34,197,94,0.85)',
    failed:    'rgba(239,68,68,0.85)',
}

const STAFF_ROLE_LABELS: Record<string, string> = {
    lead_instructor: 'Lead Instructor',
    instructor:      'Instructor',
    observer:        'Observer',
}

const STAFF_ROLE_ORDER: Record<string, number> = {
    lead_instructor: 0,
    instructor:      1,
    observer:        2,
}

function formatDate(val: unknown): string {
    if (!val) return '—'
    return new Date(val as string).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(val: unknown): string {
    if (!val) return '—'
    return new Date(val as string).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function SectionHeader({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'rgba(219,0,29,0.55)', fontFamily: 'monospace',
            padding: '10px 0 6px',
            borderBottom: '1px solid rgba(219,0,29,0.15)',
            marginBottom: 10,
        }}>
            {children}
        </div>
    )
}

function StatusBadge({ status, colors, labels }: { status: string; colors: Record<string, string>; labels: Record<string, string> }) {
    const color = colors[status] ?? 'rgba(150,150,150,0.5)'
    return (
        <span style={{
            fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color,
            border: `1px solid ${color.replace(/[\d.]+\)$/, '0.35)')}`,
            padding: '1px 6px', whiteSpace: 'nowrap',
        }}>
            {labels[status] ?? status}
        </span>
    )
}

function GridItem({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <div style={{ fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.4)', fontFamily: 'monospace', marginBottom: 3 }}>
                {label}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.75)', fontWeight: 500 }}>
                {value ?? '—'}
            </div>
        </div>
    )
}

export default function TrainingRecordDetailPage() {
    const { id } = useParams<{ id: string }>()
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [instance, setInstance] = useState<CourseInstance | null>(null)
    const [candidates, setCandidates] = useState<CourseCandidate[]>([])
    const [staff, setStaff] = useState<CourseStaffMember[]>([])
    const [activity, setActivity] = useState<CourseActivityLog[]>([])

    const [notes, setNotes] = useState('')
    const [notesSaving, setNotesSaving] = useState(false)
    const [notesSaved, setNotesSaved] = useState(false)
    const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/j3/training-records/${id}`)
            if (!res.ok) { router.push('/dashboard/j3'); return }
            const data = await res.json()
            setInstance(data.instance)
            setCandidates(data.candidates ?? [])
            setStaff((data.staff ?? []).sort((a: CourseStaffMember, b: CourseStaffMember) =>
                (STAFF_ROLE_ORDER[a.role] ?? 9) - (STAFF_ROLE_ORDER[b.role] ?? 9)
            ))
            setActivity(data.activity ?? [])
            setNotes(data.instance?.notes ?? '')
        } finally {
            setLoading(false)
        }
    }, [id, router])

    useEffect(() => { load() }, [load])

    async function saveNotes() {
        if (!instance) return
        setNotesSaving(true)
        setNotesSaved(false)
        try {
            await fetch(`/api/j3/training-records/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes }),
            })
            setNotesSaved(true)
            if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
            notesTimerRef.current = setTimeout(() => setNotesSaved(false), 2500)
        } finally {
            setNotesSaving(false)
        }
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
                <CircularProgress size={24} style={{ color: 'rgba(219,0,29,0.5)' }} />
            </div>
        )
    }

    if (!instance) return null

    const activeCount = candidates.filter(c => c.status === 'active').length
    const passedCount = candidates.filter(c => c.status === 'passed').length
    const failedCount = candidates.filter(c => c.status === 'failed').length
    const withdrawnCount = candidates.filter(c => ['withdrawn', 'removed'].includes(c.status)).length

    const cellStyle: React.CSSProperties = {
        fontSize: '0.62rem', padding: '6px 10px',
        color: 'rgba(237,237,237,0.65)',
        borderBottom: '1px solid rgba(219,0,29,0.07)',
    }

    const thStyle: React.CSSProperties = {
        fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
        color: 'rgba(219,0,29,0.4)', fontFamily: 'monospace',
        padding: '6px 10px',
        borderBottom: '1px solid rgba(219,0,29,0.15)',
        background: 'rgba(0,0,0,0.3)',
        textAlign: 'left' as const,
    }

    return (
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 20px 60px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 22 }}>
                <button
                    onClick={() => router.back()}
                    style={{
                        all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        color: 'rgba(219,0,29,0.55)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', marginTop: 3,
                    }}
                >
                    <ArrowBack sx={{ fontSize: 14 }} /> Back
                </button>
                <div style={{ flex: 1 }}>
                    <h1 style={{
                        margin: 0, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '0.04em',
                        color: 'rgba(237,237,237,0.9)',
                    }}>
                        {instance.trainingTypeName}
                        <span style={{ color: 'rgba(219,0,29,0.6)', fontFamily: 'monospace', marginLeft: 10 }}>
                            {instance.instanceRef}
                        </span>
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                        <StatusBadge status={instance.status} colors={INSTANCE_STATUS_COLORS} labels={INSTANCE_STATUS_LABELS} />
                        {instance.isLocked && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.55rem', color: 'rgba(219,0,29,0.5)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                <Lock sx={{ fontSize: 11 }} /> Locked
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Summary grid */}
            <div style={{ border: '1px solid rgba(219,0,29,0.18)', background: 'rgba(255,255,255,0.015)', padding: '14px 16px', marginBottom: 20 }}>
                <SectionHeader>Summary</SectionHeader>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px 24px' }}>
                    <GridItem label='Type' value={instance.courseType === 'selection' ? 'Selection' : 'Reinforcement Cycle'} />
                    <GridItem label='Lead Trainer' value={instance.leadInstructorName} />
                    <GridItem label='Start Date' value={formatDate(instance.startDate)} />
                    <GridItem label='End Date' value={formatDate(instance.endDate)} />
                    <GridItem label='Candidates' value={instance.candidateCount ?? candidates.length} />
                    <GridItem label='Staff' value={instance.staffCount ?? staff.length} />
                    <GridItem label='Passed' value={instance.passedCount ?? passedCount} />
                    <GridItem label='Failed' value={instance.failedCount ?? failedCount} />
                    <GridItem label='Withdrawn' value={instance.withdrawnCount ?? withdrawnCount} />
                    <GridItem label='Course Created' value={formatDate(instance.createdAt)} />
                    <GridItem label='Last Updated' value={formatDateTime(instance.updatedAt)} />
                    {instance.isLocked && instance.lockedByName && (
                        <GridItem label='Locked By' value={`${instance.lockedByName} — ${formatDateTime(instance.lockedAt)}`} />
                    )}
                </div>
            </div>

            {/* Staff */}
            {staff.length > 0 && (
                <div style={{ border: '1px solid rgba(219,0,29,0.18)', background: 'rgba(255,255,255,0.01)', marginBottom: 20 }}>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(219,0,29,0.15)' }}>
                        <SectionHeader>Staff ({staff.length})</SectionHeader>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>Role</th>
                                <th style={thStyle}>Name</th>
                            </tr>
                        </thead>
                        <tbody>
                            {staff.map(s => (
                                <tr key={String(s._id)}>
                                    <td style={{ ...cellStyle, color: 'rgba(219,0,29,0.65)', fontWeight: 600, fontSize: '0.58rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                        {STAFF_ROLE_LABELS[s.role] ?? s.role}
                                    </td>
                                    <td style={{ ...cellStyle, fontWeight: 600, color: 'rgba(237,237,237,0.8)' }}>
                                        {s.displayName}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Candidates */}
            <div style={{ border: '1px solid rgba(219,0,29,0.18)', background: 'rgba(255,255,255,0.01)', marginBottom: 20 }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(219,0,29,0.15)' }}>
                    <SectionHeader>Candidates ({candidates.length})</SectionHeader>
                </div>

                {/* Results row */}
                <div style={{ display: 'flex', gap: 20, padding: '8px 16px', borderBottom: '1px solid rgba(219,0,29,0.1)', background: 'rgba(0,0,0,0.2)' }}>
                    {[
                        { label: 'Passed', count: passedCount, color: CANDIDATE_STATUS_COLORS.passed },
                        { label: 'Failed', count: failedCount, color: CANDIDATE_STATUS_COLORS.failed },
                        { label: 'Withdrawn', count: withdrawnCount, color: CANDIDATE_STATUS_COLORS.withdrawn },
                        { label: 'Active', count: activeCount, color: CANDIDATE_STATUS_COLORS.active },
                    ].map(stat => (
                        <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: stat.color, fontFamily: 'monospace' }}>{stat.count}</span>
                            <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>{stat.label}</span>
                        </div>
                    ))}
                </div>

                {candidates.length === 0 ? (
                    <div style={{ padding: '20px 16px', textAlign: 'center', color: 'rgba(237,237,237,0.25)', fontSize: '0.65rem' }}>
                        No candidates
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ ...thStyle, width: 40 }}>#</th>
                                <th style={thStyle}>Name</th>
                                <th style={thStyle}>Status</th>
                                <th style={thStyle}>Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {candidates.map((c, i) => (
                                <tr key={String(c._id)} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.1)' }}>
                                    <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '0.58rem', color: 'rgba(237,237,237,0.35)' }}>
                                        {c.candidateNumber}
                                    </td>
                                    <td style={{ ...cellStyle, fontWeight: 600, color: 'rgba(237,237,237,0.8)' }}>
                                        {c.displayName}
                                    </td>
                                    <td style={cellStyle}>
                                        <StatusBadge status={c.status} colors={CANDIDATE_STATUS_COLORS} labels={CANDIDATE_STATUS_LABELS} />
                                    </td>
                                    <td style={{ ...cellStyle, color: 'rgba(237,237,237,0.4)', fontSize: '0.58rem' }}>
                                        {c.notes ?? '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Notes */}
            <div style={{ border: '1px solid rgba(219,0,29,0.18)', background: 'rgba(255,255,255,0.01)', marginBottom: 20, padding: '14px 16px' }}>
                <SectionHeader>Notes</SectionHeader>
                {instance.isLocked ? (
                    <div>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                            padding: '6px 10px', background: 'rgba(219,0,29,0.07)', border: '1px solid rgba(219,0,29,0.2)',
                            fontSize: '0.6rem', color: 'rgba(219,0,29,0.6)', fontWeight: 600, letterSpacing: '0.06em',
                        }}>
                            <LockOpen sx={{ fontSize: 13 }} />
                            Record is locked — notes cannot be edited
                        </div>
                        <p style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.55)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                            {instance.notes ?? '—'}
                        </p>
                    </div>
                ) : (
                    <div>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={5}
                            placeholder='No notes...'
                            style={{
                                all: 'unset', display: 'block', width: '100%', boxSizing: 'border-box',
                                padding: '8px 10px', fontSize: '0.68rem', lineHeight: 1.6,
                                color: 'rgba(237,237,237,0.75)', background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(219,0,29,0.2)', resize: 'vertical' as const,
                                minHeight: 90,
                            }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                            <button
                                onClick={saveNotes}
                                disabled={notesSaving}
                                style={{
                                    all: 'unset', cursor: notesSaving ? 'default' : 'pointer',
                                    padding: '4px 14px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                    color: 'rgba(219,0,29,0.8)', border: '1px solid rgba(219,0,29,0.35)',
                                    background: 'rgba(219,0,29,0.08)', opacity: notesSaving ? 0.5 : 1,
                                }}
                            >
                                {notesSaving ? 'Saving...' : 'Save Notes'}
                            </button>
                            {notesSaved && (
                                <span style={{ fontSize: '0.58rem', color: 'rgba(34,197,94,0.8)', fontWeight: 600, letterSpacing: '0.08em' }}>
                                    Saved
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Linked Course Workspace */}
            <div style={{ border: '1px solid rgba(219,0,29,0.18)', background: 'rgba(255,255,255,0.01)', marginBottom: 20, padding: '14px 16px' }}>
                <SectionHeader>Course Workspace</SectionHeader>
                <Link
                    href={`/dashboard/unit/training-hub/course/${String(instance._id)}`}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: 'rgba(219,0,29,0.7)', textDecoration: 'none',
                        padding: '6px 14px', border: '1px solid rgba(219,0,29,0.3)',
                        background: 'rgba(219,0,29,0.06)',
                    }}
                >
                    Open Course Workspace <OpenInNew sx={{ fontSize: 13 }} />
                </Link>
            </div>

            {/* Activity Log */}
            {activity.length > 0 && (
                <div style={{ border: '1px solid rgba(219,0,29,0.18)', background: 'rgba(255,255,255,0.01)', padding: '14px 16px' }}>
                    <SectionHeader>
                        <History sx={{ fontSize: 13, verticalAlign: 'middle', marginRight: 4 }} />
                        Recent Activity
                    </SectionHeader>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {activity.map(log => (
                            <div key={String(log._id)} style={{
                                display: 'grid', gridTemplateColumns: '1fr auto',
                                padding: '5px 0', borderBottom: '1px solid rgba(219,0,29,0.06)',
                                alignItems: 'start', gap: 12,
                            }}>
                                <div>
                                    <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.65)' }}>{log.action}</span>
                                    {log.performedByName && (
                                        <span style={{ fontSize: '0.58rem', color: 'rgba(219,0,29,0.4)', marginLeft: 6 }}>
                                            — {log.performedByName}
                                        </span>
                                    )}
                                </div>
                                <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.25)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                    {formatDateTime(log.createdAt)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
