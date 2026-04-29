'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Add, Assignment, CheckCircle, Cancel, HourglassEmpty, RateReview } from '@mui/icons-material'
import { CircularProgress } from '@mui/material'
import AssignQuizModal from './AssignQuizModal'

const RED = '#db001d'

type FilterStatus = 'all' | 'pending_review' | 'passed' | 'failed'

const STATUS_LABELS: Record<QuizAttemptStatus, string> = {
    assigned: 'Assigned',
    in_progress: 'In Progress',
    submitted: 'Awaiting Review',
    reviewing: 'Under Review',
    passed: 'Passed',
    failed: 'Failed',
}

const STATUS_COLOR: Record<QuizAttemptStatus, string> = {
    assigned: 'rgba(147,197,253,0.7)',
    in_progress: 'rgba(245,158,11,0.7)',
    submitted: 'rgba(245,158,11,0.9)',
    reviewing: 'rgba(167,139,250,0.8)',
    passed: 'rgba(34,197,94,0.85)',
    failed: 'rgba(239,68,68,0.85)',
}

function StatusBadge({ status }: { status: QuizAttemptStatus }) {
    return (
        <span style={{
            fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: STATUS_COLOR[status],
            border: `1px solid ${STATUS_COLOR[status].replace('0.', '0.25')}`,
            padding: '1px 7px',
            whiteSpace: 'nowrap',
        }}>
            {STATUS_LABELS[status]}
        </span>
    )
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}m ${String(s).padStart(2, '0')}s`
}

interface Props {
    userId: string
    canManageMembers: boolean
}

export default function TrainingRecordsTab({ userId, canManageMembers }: Props) {
    const router = useRouter()
    const [attempts, setAttempts] = useState<QuizAttemptSerialized[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<FilterStatus>('all')
    const [showAssign, setShowAssign] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/quiz/attempts?status=${filter}`)
            const data = await res.json()
            setAttempts(data.attempts ?? [])
        } finally {
            setLoading(false)
        }
    }, [filter])

    useEffect(() => { load() }, [load])

    const filterBtnSx = (active: boolean): React.CSSProperties => ({
        all: 'unset',
        cursor: 'pointer',
        padding: '4px 12px',
        fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: active ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.4)',
        background: active ? 'rgba(219,0,29,0.22)' : 'transparent',
        border: '1px solid rgba(219,0,29,0.25)',
        borderRadius: 2,
    })

    return (
        <div className='m-6 mt-4'>
            {/* Toolbar */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
                padding: '8px 12px',
                border: '1px solid rgba(219,0,29,0.22)',
                borderBottom: 'none',
                background: 'rgba(255,255,255,0.02)',
            }}>
                {/* Filter pills */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(['all', 'pending_review', 'passed', 'failed'] as FilterStatus[]).map(f => (
                        <button key={f} style={filterBtnSx(filter === f)} onClick={() => setFilter(f)}>
                            {f === 'pending_review' ? 'Pending Review' : f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.55)', fontFamily: 'monospace' }}>
                        {'// TRAINING RECORDS'}
                    </span>
                    <button
                        onClick={() => setShowAssign(true)}
                        style={{
                            all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                            color: 'rgba(219,0,29,0.8)', padding: '4px 10px',
                            border: '1px solid rgba(219,0,29,0.32)',
                            background: 'rgba(219,0,29,0.06)',
                        }}
                    >
                        <Add sx={{ fontSize: 13 }} /> Assign Quiz
                    </button>
                </div>
            </div>

            {/* Table */}
            <div style={{ border: '1px solid rgba(219,0,29,0.22)', background: 'rgba(255,255,255,0.01)', minHeight: 200 }}>
                {/* Column headers */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr 100px 80px 120px',
                    padding: '6px 12px',
                    borderBottom: '1px solid rgba(219,0,29,0.15)',
                    background: 'rgba(0,0,0,0.3)',
                }}>
                    {['Recruit', 'Quiz', 'Trainer', 'Date', 'Time Taken', 'Status'].map(h => (
                        <span key={h} style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', fontFamily: 'monospace' }}>
                            {h}
                        </span>
                    ))}
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                        <CircularProgress size={20} style={{ color: 'rgba(219,0,29,0.5)' }} />
                    </div>
                ) : attempts.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 32, opacity: 0.35 }}>
                        <Assignment sx={{ fontSize: 28, color: 'rgba(237,237,237,0.3)' }} />
                        <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)' }}>
                            No records found
                        </span>
                    </div>
                ) : (
                    attempts.map((a, i) => {
                        const canReview = ['submitted', 'reviewing'].includes(a.status)
                        return (
                            <div
                                key={a._id}
                                onClick={() => canReview && router.push(`/dashboard/quiz/review/${a._id}`)}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr 1fr 100px 80px 120px',
                                    padding: '7px 12px',
                                    borderBottom: '1px solid rgba(219,0,29,0.07)',
                                    background: i % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.15)',
                                    cursor: canReview ? 'pointer' : 'default',
                                    alignItems: 'center',
                                    transition: 'background 0.1s',
                                }}
                                onMouseEnter={e => { if (canReview) (e.currentTarget as HTMLDivElement).style.background = 'rgba(219,0,29,0.06)' }}
                                onMouseLeave={e => { if (canReview) (e.currentTarget as HTMLDivElement).style.background = i % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.15)' }}
                            >
                                <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.82)', fontWeight: 600 }}>
                                    {a.userName}
                                </span>
                                <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.5)' }}>
                                    BCT Confirmation
                                </span>
                                <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.45)' }}>
                                    {a.assignedByName}
                                </span>
                                <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)', fontFamily: 'monospace' }}>
                                    {formatDate(a.createdAt)}
                                </span>
                                <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)', fontFamily: 'monospace' }}>
                                    {a.timeTakenSeconds !== undefined ? formatTime(a.timeTakenSeconds) : '—'}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <StatusBadge status={a.status} />
                                    {canReview && (
                                        <RateReview sx={{ fontSize: 13, color: 'rgba(219,0,29,0.5)' }} />
                                    )}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {showAssign && (
                <AssignQuizModal
                    onClose={() => setShowAssign(false)}
                    onAssigned={load}
                />
            )}
        </div>
    )
}
