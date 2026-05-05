'use client'

import { useEffect, useState, useRef } from 'react'
import type { OcapRecording } from '@/app/api/operations/ocap/recordings/route'

interface Props {
    operationId: string
    initialOcap?: OcapData | null
}

type SyncStage = 'idle' | 'downloading' | 'parsing' | 'matching' | 'saving' | 'complete' | 'error'

const STAGE_LABELS: Record<SyncStage, string> = {
    idle:        '',
    downloading: 'Downloading recording',
    parsing:     'Parsing kill events',
    matching:    'Matching members',
    saving:      'Saving to database',
    complete:    'Sync complete',
    error:       'Sync failed',
}

const STAGE_ORDER: SyncStage[] = ['downloading', 'parsing', 'matching', 'saving', 'complete']

export default function OcapLinkPanel({ operationId, initialOcap }: Props) {
    const [expanded, setExpanded]         = useState(!initialOcap)
    const [recordings, setRecordings]     = useState<OcapRecording[]>([])
    const [loadingList, setLoadingList]   = useState(false)
    const [listError, setListError]       = useState('')
    const [selectedId, setSelectedId]     = useState<number | null>(null)
    const [search, setSearch]             = useState('')
    const [syncing, setSyncing]           = useState(false)
    const [stage, setStage]               = useState<SyncStage>('idle')
    const [stageMsg, setStageMsg]         = useState('')
    const [syncError, setSyncError]       = useState('')
    const [ocap, setOcap]                 = useState<OcapData | null>(initialOcap ?? null)
    const [elapsed, setElapsed]           = useState(0)
    const startRef                        = useRef<number>(0)
    const timerRef                        = useRef<ReturnType<typeof setInterval> | null>(null)

    // Auto-fetch recordings when panel expands
    useEffect(() => {
        if (!expanded || recordings.length > 0) return
        fetchRecordings()
    }, [expanded])

    // Elapsed timer while syncing
    useEffect(() => {
        if (syncing) {
            startRef.current = Date.now()
            timerRef.current = setInterval(() => {
                setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
            }, 1000)
        } else {
            if (timerRef.current) clearInterval(timerRef.current)
            setElapsed(0)
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current) }
    }, [syncing])

    async function fetchRecordings() {
        setLoadingList(true)
        setListError('')
        try {
            const res = await fetch('/api/operations/ocap/recordings')
            if (!res.ok) throw new Error(await res.text())
            const data: OcapRecording[] = await res.json()
            setRecordings(data)
            if (data.length > 0 && !selectedId) setSelectedId(data[0].id)
        } catch (err: any) {
            setListError(err.message ?? 'Failed to load recordings')
        } finally {
            setLoadingList(false)
        }
    }

    async function handleSync() {
        const recording = recordings.find(r => r.id === selectedId)
        if (!recording) return

        setSyncing(true)
        setStage('downloading')
        setStageMsg('')
        setSyncError('')

        try {
            const res = await fetch('/api/operations/ocap/sync', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    operationId,
                    ocapId:              recording.id,
                    ocapFilename:        recording.filename,
                    ocapMissionName:     recording.missionName,
                    ocapWorldName:       recording.worldName,
                    ocapDate:            recording.date,
                    ocapMissionDuration: recording.missionDuration,
                    ocapPlayerCount:     recording.playerCount,
                    ocapKillCount:       recording.killCount,
                    ocapPlayerKillCount: recording.playerKillCount,
                    ocapSideComposition: recording.sideComposition,
                }),
            })

            if (!res.body) throw new Error('No stream returned')

            const reader  = res.body.getReader()
            const decoder = new TextDecoder()
            let   buffer  = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? ''

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue
                    try {
                        const data = JSON.parse(line.slice(6))
                        if (data.stage) setStage(data.stage as SyncStage)
                        if (data.message) setStageMsg(data.message)
                        if (data.stage === 'error') {
                            setSyncError(data.message ?? 'Unknown error')
                            setSyncing(false)
                        }
                        if (data.stage === 'complete') {
                            setSyncing(false)
                            // Refresh page to pick up the new ocap data from DB
                            window.location.reload()
                        }
                    } catch { /* malformed SSE line */ }
                }
            }
        } catch (err: any) {
            setSyncError(err.message ?? 'Connection failed')
            setStage('error')
            setSyncing(false)
        }
    }

    const selectedRecording = recordings.find(r => r.id === selectedId) ?? null

    const accentA = 'rgba(0,195,120,1)'
    const accentB = 'rgba(0,195,120,0.7)'
    const accentC = 'rgba(0,195,120,0.35)'
    const accentD = 'rgba(0,195,120,0.15)'
    const accentE = 'rgba(0,195,120,0.08)'

    const stageIdx    = STAGE_ORDER.indexOf(stage)
    const doneIdx     = stage === 'complete' ? STAGE_ORDER.length : stageIdx

    return (
        <div style={{ width: '100%', border: `1px solid ${accentC}`, borderTop: `2px solid ${accentB}`, background: accentE }}>

            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 16px',
                borderBottom: expanded ? `1px solid rgba(0,195,120,0.12)` : 'none',
                background: accentD,
                cursor: 'pointer',
            }} onClick={() => setExpanded(v => !v)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 6, height: 6, background: accentA, flexShrink: 0, boxShadow: `0 0 6px ${accentA}` }} />
                    <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: accentB }}>
                        OCAP Recording
                    </span>
                    {ocap && !expanded && (
                        <span style={{ fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(0,195,120,0.45)', marginLeft: 4 }}>
                            // {ocap.missionName}
                        </span>
                    )}
                </div>
                <span style={{ fontSize: '0.6rem', color: 'rgba(0,195,120,0.4)', userSelect: 'none' }}>
                    {expanded ? '▲' : '▼'}
                </span>
            </div>

            {expanded && (
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                    {/* Currently linked */}
                    {ocap && (
                        <div style={{
                            padding: '8px 12px',
                            background: 'rgba(0,195,120,0.06)',
                            border: `1px solid rgba(0,195,120,0.2)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
                        }}>
                            <div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: accentB, letterSpacing: '0.1em' }}>
                                    Currently linked
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.7)', marginTop: 2 }}>
                                    {ocap.missionName} — {ocap.date}
                                </div>
                                <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.35)', marginTop: 2 }}>
                                    {ocap.playerCount} players · {ocap.playerKillCount} player kills · synced {new Date(ocap.syncedAt).toLocaleDateString()}
                                </div>
                            </div>
                            <a
                                href={ocap.viewerUrl}
                                target='_blank'
                                rel='noopener noreferrer'
                                onClick={e => e.stopPropagation()}
                                style={{
                                    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                    padding: '4px 12px', textDecoration: 'none',
                                    border: `1px solid ${accentC}`, color: accentB,
                                    flexShrink: 0,
                                }}
                            >
                                View ↗
                            </a>
                        </div>
                    )}

                    {/* Dropdown label */}
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(0,195,120,0.5)' }}>
                        {ocap ? 'Re-link recording' : 'Select recording'}
                    </div>

                    {/* Recordings search + list */}
                    {loadingList ? (
                        <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>
                            Loading recordings…
                        </div>
                    ) : listError ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: 'rgba(220,50,50,0.8)' }}>{listError}</span>
                            <button
                                onClick={fetchRecordings}
                                style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', padding: '3px 10px', cursor: 'pointer', background: 'none', border: '1px solid rgba(220,50,50,0.4)', color: 'rgba(220,50,50,0.7)', textTransform: 'uppercase' }}
                            >
                                Retry
                            </button>
                        </div>
                    ) : (() => {
                        const q = search.trim().toLowerCase()
                        const filtered = q
                            ? recordings.filter(r =>
                                r.missionName.toLowerCase().includes(q) ||
                                r.date.toLowerCase().includes(q) ||
                                r.worldName.toLowerCase().includes(q)
                              )
                            : recordings
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                <input
                                    type='text'
                                    placeholder='Search by mission name, map, or date…'
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    disabled={syncing}
                                    style={{
                                        width: '100%', boxSizing: 'border-box',
                                        background: 'rgba(0,10,5,0.6)',
                                        border: `1px solid ${accentC}`,
                                        borderBottom: filtered.length > 0 ? `1px solid rgba(0,195,120,0.1)` : `1px solid ${accentC}`,
                                        color: 'rgba(237,237,237,0.85)',
                                        fontSize: '0.78rem',
                                        padding: '7px 10px',
                                        outline: 'none',
                                        cursor: syncing ? 'not-allowed' : 'text',
                                    }}
                                />
                                {filtered.length > 0 ? (
                                    <div style={{ maxHeight: 220, overflowY: 'auto', border: `1px solid ${accentC}`, borderTop: 'none' }}>
                                        {filtered.map(r => {
                                            const isSelected = r.id === selectedId
                                            return (
                                                <div
                                                    key={r.id}
                                                    onClick={() => !syncing && setSelectedId(r.id)}
                                                    style={{
                                                        padding: '7px 10px',
                                                        cursor: syncing ? 'not-allowed' : 'pointer',
                                                        background: isSelected ? 'rgba(0,195,120,0.1)' : 'rgba(0,8,4,0.7)',
                                                        borderLeft: isSelected ? `3px solid ${accentA}` : '3px solid transparent',
                                                        borderBottom: '1px solid rgba(0,195,120,0.07)',
                                                    }}
                                                >
                                                    <div style={{ fontSize: '0.75rem', fontWeight: isSelected ? 600 : 400, color: isSelected ? accentB : 'rgba(237,237,237,0.75)' }}>
                                                        {r.date} — {r.missionName}
                                                    </div>
                                                    <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.35)', marginTop: 2 }}>
                                                        {r.worldName} · {r.playerCount} players · {r.durationLabel}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : q ? (
                                    <div style={{ padding: '8px 10px', fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', border: `1px solid ${accentC}`, borderTop: 'none' }}>
                                        No recordings match &ldquo;{search}&rdquo;
                                    </div>
                                ) : null}
                            </div>
                        )
                    })()}

                    {/* Selected recording preview */}
                    {selectedRecording && !syncing && stage === 'idle' && (
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            {[
                                ['Map',      selectedRecording.worldName],
                                ['Players',  String(selectedRecording.playerCount)],
                                ['Duration', selectedRecording.durationLabel],
                                ['Kills',    String(selectedRecording.playerKillCount)],
                            ].map(([label, value]) => (
                                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(0,195,120,0.4)' }}>{label}</span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(237,237,237,0.7)' }}>{value}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Status bar — visible while syncing or after */}
                    {stage !== 'idle' && (
                        <div style={{
                            padding: '10px 12px',
                            background: stage === 'error' ? 'rgba(180,30,30,0.08)' : 'rgba(0,195,120,0.05)',
                            border: `1px solid ${stage === 'error' ? 'rgba(180,30,30,0.3)' : accentC}`,
                            display: 'flex', flexDirection: 'column', gap: 8,
                        }}>
                            {/* Stage pipeline */}
                            {stage !== 'error' && (
                                <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
                                    {STAGE_ORDER.filter(s => s !== 'complete').map((s, i) => {
                                        const done    = i < doneIdx
                                        const active  = i === stageIdx
                                        const isLast  = i === STAGE_ORDER.filter(x => x !== 'complete').length - 1
                                        return (
                                            <div key={s} style={{ display: 'flex', alignItems: 'center', flex: isLast ? 0 : 1 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                                    <div style={{
                                                        width: 8, height: 8, borderRadius: '50%',
                                                        background: done || active ? accentA : 'rgba(255,255,255,0.1)',
                                                        boxShadow: active ? `0 0 8px ${accentA}` : 'none',
                                                        flexShrink: 0,
                                                    }} />
                                                    <span style={{ fontSize: '0.42rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: done || active ? accentB : 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap' }}>
                                                        {STAGE_LABELS[s]}
                                                    </span>
                                                </div>
                                                {!isLast && (
                                                    <div style={{ flex: 1, height: 1, background: done ? accentC : 'rgba(255,255,255,0.08)', margin: '0 4px', marginBottom: 14 }} />
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Message + timer */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <span style={{
                                    fontSize: '0.72rem',
                                    color: stage === 'error' ? 'rgba(220,80,80,0.9)' : stage === 'complete' ? accentB : 'rgba(237,237,237,0.6)',
                                }}>
                                    {stage === 'error' ? syncError : stageMsg}
                                </span>
                                {syncing && (
                                    <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', flexShrink: 0 }}>
                                        {elapsed}s
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Sync button */}
                    {stage !== 'complete' && (
                        <button
                            onClick={handleSync}
                            disabled={syncing || !selectedId || loadingList || recordings.length === 0}
                            style={{
                                alignSelf: 'flex-start',
                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                                padding: '7px 20px', cursor: syncing ? 'not-allowed' : 'pointer',
                                background: syncing ? accentD : 'rgba(0,195,120,0.12)',
                                border: `1px solid ${syncing ? 'rgba(0,195,120,0.2)' : accentC}`,
                                color: syncing ? 'rgba(0,195,120,0.4)' : accentB,
                                transition: 'background 0.15s, border-color 0.15s',
                            }}
                        >
                            {syncing ? 'Syncing…' : ocap ? 'Re-sync Recording' : 'Sync Recording'}
                        </button>
                    )}

                </div>
            )}
        </div>
    )
}
