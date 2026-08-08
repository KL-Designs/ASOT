'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import VolumeOffIcon    from '@mui/icons-material/VolumeOff'
import VolumeDownIcon   from '@mui/icons-material/VolumeDown'
import VolumeUpIcon     from '@mui/icons-material/VolumeUp'
import PlayArrowIcon    from '@mui/icons-material/PlayArrow'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'

interface Props {
    videoUrl:   string
    startDelay?: number  // seconds before autoplay, default 2
    onContinue: () => void
}

function getOrCreateSessionKey(): string {
    try {
        let key = localStorage.getItem('asot_join_key')
        if (!key) {
            key = (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : Math.random().toString(36).slice(2) + Date.now().toString(36)
            localStorage.setItem('asot_join_key', key)
        }
        return key
    } catch {
        return Math.random().toString(36).slice(2) + Date.now().toString(36)
    }
}

export default function RecruitVideoPlayer({ videoUrl, startDelay = 2, onContinue }: Props) {
    const videoRef       = useRef<HTMLVideoElement>(null)
    const sessionKey     = useRef('')
    const maxReachedRef  = useRef(0)
    const watchStartRef  = useRef<number | null>(null)
    const accumulatedRef = useRef(0)
    const lastSaveRef    = useRef(0)
    const prevVolumeRef  = useRef(80)

    const [volume,     setVolume]     = useState(80)  // 0–100
    const [currentPct, setCurrentPct] = useState(0)
    const [blocked,    setBlocked]    = useState(false)

    const getTotalWatch = () =>
        accumulatedRef.current +
        (watchStartRef.current != null ? (Date.now() - watchStartRef.current) / 1000 : 0)

    const sendProgress = useCallback(async (
        event: string,
        pct: number,
        watchSecs: number,
        extra?: Record<string, unknown>,
    ) => {
        if (!sessionKey.current) return
        try {
            await fetch('/api/recruit/video-progress', {
                method:    'POST',
                headers:   { 'Content-Type': 'application/json' },
                body:      JSON.stringify({
                    sessionKey:        sessionKey.current,
                    videoUrl,
                    event,
                    maxReachedPct:     Math.round(pct * 10) / 10,
                    totalWatchSeconds: Math.round(watchSecs),
                    ...extra,
                }),
                keepalive: true,
            })
        } catch { /* analytics only */ }
    }, [videoUrl])

    useEffect(() => {
        sessionKey.current = getOrCreateSessionKey()
        sendProgress('start', 0, 0)

        const video = videoRef.current
        if (!video) return
        video.volume = 0.8
        video.muted  = false

        const t = setTimeout(
            () => video.play().catch(() => setBlocked(true)),
            Math.max(0, startDelay) * 1000,
        )
        return () => clearTimeout(t)
    }, [sendProgress, startDelay])

    useEffect(() => {
        const video = videoRef.current
        if (!video) return

        const onPlay  = () => { watchStartRef.current = Date.now() }
        const onPause = () => {
            if (watchStartRef.current != null) {
                accumulatedRef.current += (Date.now() - watchStartRef.current) / 1000
                watchStartRef.current = null
            }
        }
        const onTimeUpdate = () => {
            const dur = video.duration
            if (!dur) return
            const pct = (video.currentTime / dur) * 100
            setCurrentPct(pct)
            if (pct > maxReachedRef.current) maxReachedRef.current = pct
            const now = Date.now()
            if (now - lastSaveRef.current > 10_000) {
                lastSaveRef.current = now
                sendProgress('progress', maxReachedRef.current, getTotalWatch())
            }
        }
        const onEnded = () => {
            maxReachedRef.current = 100
            setCurrentPct(100)
            sendProgress('complete', 100, getTotalWatch())
        }

        video.addEventListener('play',       onPlay)
        video.addEventListener('pause',      onPause)
        video.addEventListener('timeupdate', onTimeUpdate)
        video.addEventListener('ended',      onEnded)
        return () => {
            video.removeEventListener('play',       onPlay)
            video.removeEventListener('pause',      onPause)
            video.removeEventListener('timeupdate', onTimeUpdate)
            video.removeEventListener('ended',      onEnded)
        }
    }, [sendProgress])

    useEffect(() => {
        const onVis    = () => {
            if (document.hidden)
                sendProgress('exit', maxReachedRef.current, getTotalWatch(), { exitType: 'visibilitychange' })
        }
        const onUnload = () =>
            sendProgress('exit', maxReachedRef.current, getTotalWatch(), { exitType: 'beforeunload' })

        document.addEventListener('visibilitychange', onVis)
        window.addEventListener('beforeunload', onUnload)
        return () => {
            document.removeEventListener('visibilitychange', onVis)
            window.removeEventListener('beforeunload', onUnload)
        }
    }, [sendProgress])

    const handleVolumeChange = (v: number) => {
        setVolume(v)
        if (videoRef.current) videoRef.current.volume = v / 100
        if (v > 0) prevVolumeRef.current = v
    }

    const toggleMute = () => {
        if (volume > 0) {
            prevVolumeRef.current = volume
            handleVolumeChange(0)
        } else {
            handleVolumeChange(prevVolumeRef.current || 80)
        }
    }

    const handlePlayClick = () => {
        const video = videoRef.current
        if (!video) return
        video.muted  = false
        video.volume = volume / 100
        video.play().catch(() => {})
        setBlocked(false)
    }

    const handleContinue = () => {
        sendProgress('continue_click', maxReachedRef.current, getTotalWatch(), {
            continueClickedAtPct: Math.round(currentPct * 10) / 10,
        })
        onContinue()
    }

    const VolumeIcon = volume === 0 ? VolumeOffIcon : volume <= 50 ? VolumeDownIcon : VolumeUpIcon

    return (
        <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: '#07070a' }}>

            {/* Header */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(219,0,29,0.12)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', fontFamily: 'monospace' }}>
                    J1 — Recruitment
                </span>
                <span style={{ width: 1, height: 12, background: 'rgba(219,0,29,0.2)' }} />
                <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.6)' }}>
                    Welcome to ASOT
                </span>
            </div>

            {/* Video */}
            <div style={{ position: 'relative', background: '#000' }}>
                <video
                    ref={videoRef}
                    src={videoUrl}
                    playsInline
                    style={{ width: '100%', display: 'block', maxHeight: '72vh' }}
                />

                {blocked && (
                    <div
                        onClick={handlePlayClick}
                        style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.72)', cursor: 'pointer', gap: 14,
                        }}
                    >
                        <div style={{
                            width: 72, height: 72, borderRadius: '50%',
                            background: 'rgba(219,0,29,0.85)', border: '2px solid rgba(219,0,29,0.5)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <PlayArrowIcon sx={{ fontSize: 40, color: '#fff' }} />
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.85)' }}>
                            Click to Play
                        </span>
                    </div>
                )}
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ height: '100%', background: 'var(--red)', width: `${currentPct}%`, transition: 'width 0.8s linear' }} />
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderTop: '1px solid rgba(219,0,29,0.1)' }}>

                {/* Volume control */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                        onClick={toggleMute}
                        title={volume === 0 ? 'Unmute' : 'Mute'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.65)', padding: 0, display: 'flex', alignItems: 'center' }}
                    >
                        <VolumeIcon sx={{ fontSize: 18 }} />
                    </button>
                    <input
                        type='range'
                        min='0'
                        max='100'
                        value={volume}
                        onChange={e => handleVolumeChange(Number(e.target.value))}
                        style={{ width: 90, cursor: 'pointer', accentColor: 'var(--red)', verticalAlign: 'middle' }}
                    />
                </div>

                {/* Continue */}
                <button
                    onClick={handleContinue}
                    style={{
                        flexShrink: 0,
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'var(--red)', border: 'none',
                        color: '#fff', padding: '10px 20px', cursor: 'pointer',
                        fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.15em', textTransform: 'uppercase',
                    }}
                >
                    Continue to Application <ChevronRightIcon sx={{ fontSize: 16 }} />
                </button>
            </div>
        </div>
    )
}
