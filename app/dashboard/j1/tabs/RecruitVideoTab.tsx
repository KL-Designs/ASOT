'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/material'
import VideocamIcon      from '@mui/icons-material/Videocam'
import CheckCircleIcon   from '@mui/icons-material/CheckCircle'
import ArrowForwardIcon  from '@mui/icons-material/ArrowForward'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import UploadFileIcon    from '@mui/icons-material/UploadFile'
import BarChartIcon      from '@mui/icons-material/BarChart'

const ACCEPT = '.mp4,.mov,.mp3,.webm,.avi,.mkv,.ogg,.m4v,.m4a,.flv,.wmv,.ts,.3gp'

interface Config {
    videoUrl:      string
    enabled:       boolean
    startDelay:    number
    updatedAt:     string | null
    updatedByName: string
}
interface Stats {
    totalSessions:  number
    completed:      number
    continued:      number
    avgMaxPct:      number
    avgContinuePct: number
}

const ZERO_STATS: Stats = { totalSessions: 0, completed: 0, continued: 0, avgMaxPct: 0, avgContinuePct: 0 }

export default function RecruitVideoTab() {
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [config,        setConfig]        = useState<Config | null>(null)
    const [stats,         setStats]         = useState<Stats | null>(null)
    const [canReset,      setCanReset]      = useState(false)
    const [loading,       setLoading]       = useState(true)
    const [saving,        setSaving]        = useState(false)
    const [saveMsg,       setSaveMsg]       = useState('')
    const [videoUrl,      setVideoUrl]      = useState('')
    const [enabled,       setEnabled]       = useState(true)
    const [startDelay,    setStartDelay]    = useState(2)
    const [uploading,     setUploading]     = useState(false)
    const [uploadPct,     setUploadPct]     = useState(0)
    const [uploadMsg,     setUploadMsg]     = useState('')
    const [dragOver,      setDragOver]      = useState(false)
    const [confirmReset,  setConfirmReset]  = useState(false)
    const [resetting,     setResetting]     = useState(false)
    const [resetMsg,      setResetMsg]      = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/admin/j1/recruit-video')
            if (res.ok) {
                const data = await res.json()
                setConfig(data.config)
                setStats(data.stats)
                setCanReset(data.canReset ?? false)
                setVideoUrl(data.config?.videoUrl ?? '')
                setEnabled(data.config?.enabled ?? true)
                setStartDelay(data.config?.startDelay ?? 2)
            }
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const resetAnalytics = async () => {
        setResetting(true)
        setResetMsg('')
        setConfirmReset(false)
        try {
            const res = await fetch('/api/admin/j1/recruit-video', { method: 'DELETE' })
            if (res.ok) {
                const data = await res.json()
                setResetMsg(`Cleared ${data.deleted} session${data.deleted !== 1 ? 's' : ''}.`)
                await load()
            } else {
                setResetMsg('Reset failed.')
            }
        } finally {
            setResetting(false)
            setTimeout(() => setResetMsg(''), 4000)
        }
    }

    const save = async (urlOverride?: string) => {
        setSaving(true)
        setSaveMsg('')
        try {
            const res = await fetch('/api/admin/j1/recruit-video', {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ videoUrl: urlOverride ?? videoUrl, enabled, startDelay }),
            })
            if (res.ok) {
                setSaveMsg('Saved.')
                await load()
            } else {
                setSaveMsg('Error saving.')
            }
        } finally {
            setSaving(false)
            setTimeout(() => setSaveMsg(''), 3000)
        }
    }

    const uploadFile = async (file: File) => {
        setUploading(true)
        setUploadPct(0)
        setUploadMsg('')

        const form = new FormData()
        form.append('video', file)

        await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open('POST', '/api/admin/j1/recruit-video/upload')
            xhr.upload.onprogress = e => {
                if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100))
            }
            xhr.onload = async () => {
                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText)
                    setVideoUrl(data.url)
                    setUploadMsg(`Uploaded: ${file.name}`)
                    await save(data.url)
                    resolve()
                } else {
                    let errMsg = 'Upload failed'
                    try { errMsg = JSON.parse(xhr.responseText).error ?? errMsg } catch {}
                    setUploadMsg(errMsg)
                    reject(new Error(errMsg))
                }
            }
            xhr.onerror = () => { setUploadMsg('Upload failed (network error)'); reject() }
            xhr.send(form)
        }).catch(() => {})

        setUploading(false)
        setUploadPct(0)
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) uploadFile(file)
        e.target.value = ''
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) uploadFile(file)
    }

    const s = stats ?? ZERO_STATS
    const completionPct  = s.totalSessions ? Math.round((s.completed  / s.totalSessions) * 100) : 0
    const continuedPct   = s.totalSessions ? Math.round((s.continued  / s.totalSessions) * 100) : 0

    const card = (label: string, value: string | number, sub?: string) => (
        <div style={{ border: '1px solid rgba(219,0,29,0.18)', background: 'rgba(255,255,255,0.02)', padding: '14px 18px' }}>
            <div style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', fontFamily: 'monospace', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--foreground)' }}>{value}</div>
            {sub && <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', marginTop: 4 }}>{sub}</div>}
        </div>
    )

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
            <CircularProgress size={28} sx={{ color: 'var(--red)' }} />
        </div>
    )

    return (
        <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 24, alignItems: 'start' }}>

            {/* Config — left column */}
            <div style={{ border: '1px solid rgba(219,0,29,0.22)', background: 'rgba(255,255,255,0.01)', padding: '20px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid rgba(219,0,29,0.1)' }}>
                    <VideocamIcon sx={{ fontSize: 18, color: 'var(--red)', opacity: 0.7 }} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.7)' }}>
                        Video Configuration
                    </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Upload drop zone */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.45)', marginBottom: 8 }}>
                            Upload Video File
                        </label>
                        <div
                            onClick={() => !uploading && fileInputRef.current?.click()}
                            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            style={{
                                border: `2px dashed ${dragOver ? 'var(--red)' : 'rgba(219,0,29,0.25)'}`,
                                background: dragOver ? 'rgba(219,0,29,0.06)' : 'rgba(0,0,0,0.2)',
                                padding: '28px 20px',
                                textAlign: 'center',
                                cursor: uploading ? 'default' : 'pointer',
                                transition: 'border-color 0.15s, background 0.15s',
                            }}
                        >
                            {uploading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                                    <CircularProgress size={22} sx={{ color: 'var(--red)' }} />
                                    <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.5)' }}>
                                        Uploading… {uploadPct}%
                                    </span>
                                    <div style={{ width: '100%', maxWidth: 260, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                                        <div style={{ height: '100%', background: 'var(--red)', width: `${uploadPct}%`, borderRadius: 2, transition: 'width 0.2s' }} />
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                    <UploadFileIcon sx={{ fontSize: 32, color: 'rgba(219,0,29,0.5)' }} />
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(237,237,237,0.6)' }}>
                                        Drop video here or click to browse
                                    </span>
                                    <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.28)' }}>
                                        MP4 · MOV · MP3 · WebM · AVI · MKV · OGG · M4V · FLV · WMV
                                    </span>
                                </div>
                            )}
                        </div>
                        <input ref={fileInputRef} type='file' accept={ACCEPT} onChange={handleFileChange} style={{ display: 'none' }} />
                        {uploadMsg && (
                            <div style={{ marginTop: 8, fontSize: '0.65rem', color: uploadMsg.startsWith('Uploaded') ? 'rgba(100,200,100,0.8)' : 'rgba(219,0,29,0.8)' }}>
                                {uploadMsg}
                            </div>
                        )}
                    </div>

                    {/* Manual URL fallback */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 6 }}>
                            Or paste a direct video URL
                        </label>
                        <input
                            type='url'
                            value={videoUrl}
                            onChange={e => setVideoUrl(e.target.value)}
                            placeholder='https://example.com/recruitment.mp4'
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
                                color: 'var(--foreground)', fontSize: '0.8rem', padding: '9px 12px', outline: 'none',
                            }}
                        />
                    </div>

                    {/* Play delay */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 6 }}>
                            Autoplay Delay
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                                type='number'
                                min='0'
                                max='10'
                                step='0.5'
                                value={startDelay}
                                onChange={e => setStartDelay(Math.max(0, Math.min(10, Number(e.target.value))))}
                                style={{
                                    width: 72, boxSizing: 'border-box',
                                    background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: 'var(--foreground)', fontSize: '0.8rem', padding: '7px 10px', outline: 'none',
                                }}
                            />
                            <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)' }}>seconds before video plays</span>
                        </div>
                    </div>

                    {/* Enable toggle */}
                    <div>
                        <button
                            onClick={() => setEnabled(v => !v)}
                            style={{
                                padding: '7px 16px', cursor: 'pointer',
                                background: enabled ? 'rgba(219,0,29,0.2)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${enabled ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                color: enabled ? 'var(--foreground)' : 'rgba(237,237,237,0.45)',
                                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}
                        >
                            {enabled ? <CheckCircleIcon sx={{ fontSize: 14 }} /> : <VisibilityOffIcon sx={{ fontSize: 14 }} />}
                            {enabled ? 'Enabled — Video shows on /join' : 'Disabled — Video hidden'}
                        </button>
                    </div>

                    {/* Save */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                            onClick={() => save()}
                            disabled={saving || uploading}
                            style={{
                                padding: '9px 22px', cursor: (saving || uploading) ? 'default' : 'pointer',
                                background: (saving || uploading) ? 'rgba(219,0,29,0.15)' : 'var(--red)',
                                border: 'none', color: '#fff',
                                fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
                                opacity: (saving || uploading) ? 0.6 : 1,
                            }}
                        >
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                        {saveMsg && <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.5)' }}>{saveMsg}</span>}
                    </div>

                    {config?.updatedByName && (
                        <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            Last updated by {config.updatedByName}
                            {config.updatedAt ? ` · ${new Date(config.updatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                        </div>
                    )}
                </div>
            </div>

            {/* Analytics — right column */}
            <div style={{ border: '1px solid rgba(219,0,29,0.22)', background: 'rgba(255,255,255,0.01)', padding: '20px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid rgba(219,0,29,0.1)' }}>
                    <BarChartIcon sx={{ fontSize: 18, color: 'var(--red)', opacity: 0.7 }} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.7)' }}>
                        Viewer Analytics
                    </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    {card('Total Visits',     s.totalSessions,  'unique sessions')}
                    {card('Watched to End',   s.completed,      `${completionPct}% completion`)}
                    {card('Clicked Continue', s.continued,      `${continuedPct}% of visits`)}
                    {card('Avg Watch',        `${s.avgMaxPct.toFixed(1)}%`, 'furthest point reached')}
                    {card('Avg Continue At',  s.continued ? `${s.avgContinuePct.toFixed(1)}%` : '—', 'video % when Continue clicked')}
                </div>

                {s.totalSessions === 0 && (
                    <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>
                        No sessions recorded yet. Analytics will populate once the video goes live.
                    </div>
                )}

                <div style={{ marginTop: 4, fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <ArrowForwardIcon sx={{ fontSize: 11 }} />
                    Sessions are tracked anonymously via a browser key — no login required.
                </div>

                {canReset && (
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        {!confirmReset ? (
                            <button
                                onClick={() => setConfirmReset(true)}
                                disabled={resetting}
                                style={{
                                    padding: '6px 14px', cursor: 'pointer',
                                    background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.25)',
                                    color: 'rgba(219,0,29,0.7)',
                                    fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                                }}
                            >
                                Reset Analytics
                            </button>
                        ) : (
                            <>
                                <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.5)' }}>
                                    Clear all sessions?
                                </span>
                                <button
                                    onClick={resetAnalytics}
                                    style={{
                                        padding: '6px 14px', cursor: 'pointer',
                                        background: 'var(--red)', border: 'none',
                                        color: '#fff',
                                        fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
                                    }}
                                >
                                    Yes, Reset
                                </button>
                                <button
                                    onClick={() => setConfirmReset(false)}
                                    style={{
                                        padding: '6px 12px', cursor: 'pointer',
                                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'rgba(237,237,237,0.5)',
                                        fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                    }}
                                >
                                    Cancel
                                </button>
                            </>
                        )}
                        {resetMsg && <span style={{ fontSize: '0.65rem', color: 'rgba(100,200,100,0.8)' }}>{resetMsg}</span>}
                        {resetting && <CircularProgress size={13} sx={{ color: 'var(--red)' }} />}
                    </div>
                )}
            </div>

        </div>
    )
}
