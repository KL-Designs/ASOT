'use client'

import { useEffect, useRef, useState } from 'react'

// LogEntry matches the global OperationActivityLog shape, with _id and timestamp serialised as strings by the API
type LogEntry = Omit<OperationActivityLog, '_id' | 'operationId' | 'timestamp'> & {
    _id: string
    timestamp: string
}

// ─── Word-level diff ──────────────────────────────────────────────────────────

type DiffChunk = { type: 'equal' | 'added' | 'removed'; text: string }

function wordDiff(before: string, after: string): DiffChunk[] {
    const bWords = before ? before.split(/(\s+)/) : []
    const aWords = after ? after.split(/(\s+)/) : []
    const m = bWords.length
    const n = aWords.length

    // Build LCS table
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = bWords[i - 1] === aWords[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])

    // Backtrack
    const chunks: DiffChunk[] = []
    let i = m, j = n
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && bWords[i - 1] === aWords[j - 1]) {
            chunks.unshift({ type: 'equal', text: bWords[i - 1] })
            i--; j--
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            chunks.unshift({ type: 'added', text: aWords[j - 1] })
            j--
        } else {
            chunks.unshift({ type: 'removed', text: bWords[i - 1] })
            i--
        }
    }

    // Merge consecutive same-type chunks
    const merged: DiffChunk[] = []
    for (const chunk of chunks) {
        if (merged.length > 0 && merged[merged.length - 1].type === chunk.type) {
            merged[merged.length - 1].text += chunk.text
        } else {
            merged.push({ ...chunk })
        }
    }
    return merged
}

// ─── Relative time ────────────────────────────────────────────────────────────

function relativeTime(ts: string): string {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
}

// ─── Single log entry ─────────────────────────────────────────────────────────

function LogItem({ entry }: { entry: LogEntry }) {
    const [open, setOpen] = useState(false)
    const diff = open ? wordDiff(entry.before, entry.after) : null

    return (
        <div style={{
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            padding: '10px 12px',
        }}>
            {/* Header row */}
            <button
                type='button'
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
                }}
            >
                {/* Avatar */}
                <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(255,255,255,0.1)', overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700, color: 'rgba(237,237,237,0.5)',
                }}>
                    {entry.userAvatar
                        ? <img src={entry.userAvatar} alt={entry.userName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : entry.userName.charAt(0).toUpperCase()
                    }
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(237,237,237,0.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}>
                            {entry.userName}
                        </span>
                        <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.06em' }}>
                            edited
                        </span>
                        <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'rgba(237,237,237,0.45)', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>
                            {entry.sectionTitle}
                        </span>
                    </div>
                    <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.25)', marginTop: 2, letterSpacing: '0.04em' }}>
                        {relativeTime(entry.timestamp)}
                    </div>
                </div>

                {/* Chevron */}
                <span style={{ fontSize: 9, color: 'rgba(237,237,237,0.2)', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>▼</span>
            </button>

            {/* Diff body */}
            {open && diff && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* Before */}
                    {entry.before && (
                        <div style={{
                            background: 'rgba(219,0,29,0.07)', border: '1px solid rgba(219,0,29,0.18)',
                            padding: '6px 8px', fontSize: '0.68rem', lineHeight: 1.6,
                            color: 'rgba(237,237,237,0.6)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(219,0,29,0.5)', marginBottom: 4, textTransform: 'uppercase' }}>Before</div>
                            {diff.filter(c => c.type !== 'added').map((chunk, i) => (
                                <span key={i} style={chunk.type === 'removed' ? { background: 'rgba(219,0,29,0.3)', borderRadius: 2, padding: '0 2px' } : undefined}>
                                    {chunk.text}
                                </span>
                            ))}
                        </div>
                    )}
                    {/* After */}
                    <div style={{
                        background: 'rgba(50,200,80,0.06)', border: '1px solid rgba(50,200,80,0.18)',
                        padding: '6px 8px', fontSize: '0.68rem', lineHeight: 1.6,
                        color: 'rgba(237,237,237,0.6)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(50,200,80,0.5)', marginBottom: 4, textTransform: 'uppercase' }}>After</div>
                        {diff.filter(c => c.type !== 'removed').map((chunk, i) => (
                            <span key={i} style={chunk.type === 'added' ? { background: 'rgba(50,200,80,0.28)', borderRadius: 2, padding: '0 2px' } : undefined}>
                                {chunk.text}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export default function ActivityLog({ operationId, onClose }: { operationId: string; onClose?: () => void }) {
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [loading, setLoading] = useState(true)
    const intervalRef = useRef<ReturnType<typeof setInterval>>()

    async function fetchLogs() {
        try {
            const res = await fetch(`/api/operations/activity?id=${operationId}`)
            const json = await res.json()
            if (Array.isArray(json.logs)) setLogs(json.logs)
        } catch {}
        setLoading(false)
    }

    useEffect(() => {
        fetchLogs()
        intervalRef.current = setInterval(fetchLogs, 30_000)
        return () => clearInterval(intervalRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchLogs omitted to avoid infinite re-render; reruns on operationId change
    }, [operationId])

    return (
        <div style={{
            background: 'rgba(6,6,6,0.85)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderTop: '2px solid rgba(255,255,255,0.12)',
            display: 'flex', flexDirection: 'column',
            height: '100%',
        }}>
            {/* Header */}
            <div style={{
                padding: '10px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexShrink: 0,
            }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                    Activity Log
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                        type='button'
                        onClick={fetchLogs}
                        title='Refresh'
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.2)', fontSize: 13, padding: 2, lineHeight: 1, transition: 'color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.6)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.2)')}
                    >
                        ↺
                    </button>
                    {onClose && (
                        <button
                            type='button'
                            onClick={onClose}
                            title='Close'
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.2)', fontSize: 13, padding: 2, lineHeight: 1, transition: 'color 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.6)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.2)')}
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Log list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading && (
                    <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.1em' }}>
                        Loading…
                    </div>
                )}
                {!loading && logs.length === 0 && (
                    <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: '0.65rem', color: 'rgba(237,237,237,0.18)', letterSpacing: '0.08em' }}>
                        No activity yet
                    </div>
                )}
                {logs.map(entry => (
                    <LogItem key={String(entry._id)} entry={entry} />
                ))}
            </div>
        </div>
    )
}
