'use client'

import { useEffect, useState } from 'react'

type TLog = {
    _id: string
    courseInstanceId: string
    courseSessionId?: string
    courseCandidateId?: string
    candidateNumber?: number
    eventKey?: string
    action: string
    fieldName?: string
    previousValue?: string
    newValue?: string
    performedById: string
    performedByName: string
    createdAt: string
}

type FilterType = 'all' | 'feedback' | 'attendance' | 'status'

const ACTION_LABELS: Record<string, string> = {
    'feedback.update':   'Feedback Updated',
    'feedback.restore':  'Feedback Restored',
    'attendance.change': 'Attendance Changed',
    'status.change':     'Status Changed',
}

const ACTION_COLORS: Record<string, string> = {
    'feedback.update':   'rgba(100,160,240,0.8)',
    'feedback.restore':  'rgba(255,180,50,0.8)',
    'attendance.change': 'rgba(80,200,120,0.8)',
    'status.change':     'rgba(255,180,50,0.8)',
}

function getActionGroup(action: string): FilterType {
    if (action.startsWith('feedback')) return 'feedback'
    if (action.startsWith('attendance')) return 'attendance'
    if (action.startsWith('status')) return 'status'
    return 'all'
}

function fmtDateTime(d: string) {
    return new Date(d).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtField(field: string | undefined): string {
    if (!field) return ''
    const map: Record<string, string> = {
        positiveObservations: 'Positive Observations',
        negativeObservations: 'Negative Observations',
        status: 'Status',
    }
    return map[field] ?? field
}

function canRestoreLog(log: TLog): boolean {
    return (
        (log.action === 'feedback.update' || log.action === 'feedback.restore') &&
        !!log.courseCandidateId &&
        !!log.courseSessionId &&
        !!log.eventKey &&
        (log.fieldName === 'positiveObservations' || log.fieldName === 'negativeObservations') &&
        log.previousValue !== undefined
    )
}

interface Props {
    courseInstanceId: string
    canManage?: boolean
}

const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'all',        label: 'All' },
    { key: 'feedback',   label: 'Feedback' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'status',     label: 'Status' },
]

export default function ActivityTab({ courseInstanceId, canManage = false }: Props) {
    const [logs, setLogs] = useState<TLog[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<FilterType>('all')
    const [restoringId, setRestoringId] = useState<string | null>(null)
    const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null)

    useEffect(() => {
        fetch(`/api/j3/course-instances/${courseInstanceId}/activity`)
            .then(r => r.json())
            .then(d => setLogs(d.logs ?? []))
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [courseInstanceId])

    async function handleRestore(logId: string) {
        if (restoringId) return
        setRestoreConfirm(null)
        setRestoringId(logId)
        try {
            const res = await fetch(`/api/j3/course-instances/${courseInstanceId}/activity/restore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logId }),
            })
            if (!res.ok) return
            // Refresh logs
            const r = await fetch(`/api/j3/course-instances/${courseInstanceId}/activity`)
            const d = await r.json()
            setLogs(d.logs ?? [])
        } catch { /* ignore */ } finally {
            setRestoringId(null)
        }
    }

    const filtered = filter === 'all' ? logs : logs.filter(l => getActionGroup(l.action) === filter)

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Filter pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {FILTERS.map(f => {
                    const active = filter === f.key
                    return (
                        <button
                            key={f.key}
                            type='button'
                            onClick={() => setFilter(f.key)}
                            style={{
                                padding: '3px 11px',
                                background: active ? 'rgba(219,0,29,0.1)' : 'transparent',
                                border: `1px solid ${active ? 'rgba(219,0,29,0.35)' : 'rgba(255,255,255,0.1)'}`,
                                color: active ? 'rgba(219,0,29,0.85)' : 'rgba(237,237,237,0.4)',
                                fontSize: '0.55rem',
                                fontWeight: 800,
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase',
                                cursor: 'pointer',
                            }}
                        >
                            {f.label}
                        </button>
                    )
                })}
            </div>

            {/* Log list */}
            {loading ? (
                <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)' }}>Loading…</div>
            ) : filtered.length === 0 ? (
                <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No activity logged yet.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {filtered.map(log => {
                        const actionColor = ACTION_COLORS[log.action] ?? 'rgba(237,237,237,0.4)'
                        const actionLabel = ACTION_LABELS[log.action] ?? log.action
                        const showRestore = canManage && canRestoreLog(log)
                        const isConfirming = restoreConfirm === log._id
                        const isRestoring = restoringId === log._id

                        return (
                            <div key={log._id} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                {/* Action dot */}
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: actionColor, flexShrink: 0, marginTop: 5 }} />

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', marginBottom: 3 }}>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: actionColor }}>{actionLabel}</span>
                                        {log.candidateNumber !== undefined && (
                                            <span style={{ fontSize: '0.55rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.3)' }}>Candidate #{log.candidateNumber}</span>
                                        )}
                                        {log.eventKey && (
                                            <span style={{ fontSize: '0.5rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.2)', border: '1px solid rgba(255,255,255,0.06)', padding: '0 4px' }}>{log.eventKey}</span>
                                        )}
                                        {log.fieldName && (
                                            <span style={{ fontSize: '0.52rem', color: 'rgba(237,237,237,0.3)' }}>{fmtField(log.fieldName)}</span>
                                        )}
                                    </div>

                                    {(log.previousValue !== undefined || log.newValue !== undefined) && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                                            {log.previousValue !== undefined && log.previousValue !== '' && (
                                                <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    &ldquo;{log.previousValue}&rdquo;
                                                </span>
                                            )}
                                            {log.previousValue !== undefined && log.newValue !== undefined && (
                                                <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.2)' }}>→</span>
                                            )}
                                            {log.newValue !== undefined && (
                                                <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.55)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    &ldquo;{log.newValue}&rdquo;
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.55rem', fontWeight: 600, color: 'rgba(237,237,237,0.4)' }}>{log.performedByName}</span>
                                        <span style={{ fontSize: '0.52rem', color: 'rgba(237,237,237,0.2)' }}>{fmtDateTime(log.createdAt)}</span>

                                        {showRestore && !isConfirming && (
                                            <button
                                                type='button'
                                                onClick={() => setRestoreConfirm(log._id)}
                                                disabled={!!restoringId}
                                                style={{ padding: '1px 7px', background: 'transparent', border: '1px solid rgba(255,180,50,0.25)', color: 'rgba(255,180,50,0.6)', fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: restoringId ? 'default' : 'pointer', opacity: restoringId ? 0.4 : 1 }}
                                            >
                                                Restore Previous
                                            </button>
                                        )}

                                        {showRestore && isConfirming && (
                                            <>
                                                <span style={{ fontSize: '0.5rem', color: 'rgba(237,237,237,0.4)' }}>Restore to &ldquo;{log.previousValue || '(empty)'}&rdquo;?</span>
                                                <button
                                                    type='button'
                                                    onClick={() => handleRestore(log._id)}
                                                    disabled={isRestoring}
                                                    style={{ padding: '1px 7px', background: 'rgba(255,180,50,0.08)', border: '1px solid rgba(255,180,50,0.35)', color: 'rgba(255,180,50,0.9)', fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: isRestoring ? 'default' : 'pointer', opacity: isRestoring ? 0.5 : 1 }}
                                                >
                                                    {isRestoring ? 'Restoring…' : 'Confirm'}
                                                </button>
                                                <button
                                                    type='button'
                                                    onClick={() => setRestoreConfirm(null)}
                                                    style={{ padding: '1px 7px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.3)', fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                                                >
                                                    Cancel
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
