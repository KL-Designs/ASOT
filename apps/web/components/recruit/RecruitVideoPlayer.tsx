'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import VolumeOffIcon      from '@mui/icons-material/VolumeOff'
import VolumeDownIcon     from '@mui/icons-material/VolumeDown'
import VolumeUpIcon       from '@mui/icons-material/VolumeUp'
import PlayArrowIcon      from '@mui/icons-material/PlayArrow'
import ChevronRightIcon   from '@mui/icons-material/ChevronRight'
import FullscreenIcon     from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'

interface Props {
    videoUrl:    string
    startDelay?: number  // seconds before autoplay, default 2
    onContinue:  () => void
}

function getOrCreateSessionKey(): string {
    try {
        let key = localStorage.getItem('asot_join_key')
        if (!key) {
            key = crypto.randomUUID?.() ?? (Math.random().toString(36).slice(2) + Date.now().toString(36))
            localStorage.setItem('asot_join_key', key)
        }
        return key
    } catch {
        return Math.random().toString(36).slice(2) + Date.now().toString(36)
    }
}

function extractYouTubeId(url: string): string | null {
    for (const re of [/[?&]v=([^&]+)/, /youtu\.be\/([^?&/]+)/, /youtube\.com\/embed\/([^?&/]+)/]) {
        const m = re.exec(url)
        if (m) return m[1]
    }
    return null
}

let ytApiReady = false
let ytApiCallbacks: Array<() => void> = []

function loadYouTubeAPI(): Promise<void> {
    return new Promise(resolve => {
        if (typeof window === 'undefined') { resolve(); return }
        if (ytApiReady) { resolve(); return }
        ytApiCallbacks.push(resolve)
        if (document.getElementById('yt-iframe-api')) return  // script already loading
        const script = document.createElement('script')
        script.id  = 'yt-iframe-api'
        script.src = 'https://www.youtube.com/iframe_api'
        document.head.appendChild(script)
        window.onYouTubeIframeAPIReady = () => {
            ytApiReady = true
            ytApiCallbacks.forEach(cb => cb())
            ytApiCallbacks = []
        }
    })
}

export default function RecruitVideoPlayer({ videoUrl, startDelay = 2, onContinue }: Props) {
    const wrapperRef    = useRef<HTMLDivElement>(null)
    const mountRef      = useRef<HTMLDivElement>(null)
    const playerRef     = useRef<YT.Player | null>(null)
    const sessionKey    = useRef('')
    const maxReachedRef = useRef(0)
    const watchStartRef = useRef<number | null>(null)
    const accumulatedRef= useRef(0)
    const lastSaveRef   = useRef(0)
    const prevVolumeRef = useRef(80)
    const pollRef       = useRef<NodeJS.Timeout | null>(null)

    const [volume,       setVolume]      = useState(80)
    const [blocked,      setBlocked]     = useState(false)
    const [visible,      setVisible]     = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)

    const videoId = extractYouTubeId(videoUrl)

    const getTotalWatch = useCallback(() =>
        accumulatedRef.current +
        (watchStartRef.current != null ? (Date.now() - watchStartRef.current) / 1000 : 0),
    [])

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

    // Fullscreen tracking
    useEffect(() => {
        const onFSChange = () => setIsFullscreen(!!document.fullscreenElement)
        document.addEventListener('fullscreenchange', onFSChange)
        return () => document.removeEventListener('fullscreenchange', onFSChange)
    }, [])

    // Exit / visibility analytics
    useEffect(() => {
        const onVis = () => {
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
    }, [sendProgress, getTotalWatch])

    // Init YouTube player
    useEffect(() => {
        if (!videoId || !mountRef.current) return

        sessionKey.current = getOrCreateSessionKey()
        sendProgress('start', 0, 0)

        let destroyed    = false
        let startTimer:  NodeJS.Timeout | null = null
        let blockedTimer: NodeJS.Timeout | null = null

        loadYouTubeAPI().then(() => {
            if (destroyed || !mountRef.current || !window.YT) return

            const player = new window.YT.Player(mountRef.current, {
                videoId,
                playerVars: {
                    controls:       0,
                    disablekb:      1,
                    modestbranding: 1,
                    rel:            0,
                    iv_load_policy: 3,
                    playsinline:    1,
                    fs:             0,
                },
                events: {
                    onReady: (e) => {
                        if (destroyed) return
                        // Size the iframe responsively
                        const iframe = e.target.getIframe()
                        iframe.style.cssText = 'width:100%;height:auto;display:block;aspect-ratio:16/9;'
                        player.setVolume(80)
                        // Fade in, then autoplay after delay
                        setVisible(true)
                        startTimer = setTimeout(() => {
                            if (destroyed) return
                            player.playVideo()
                            // Detect if autoplay was blocked
                            blockedTimer = setTimeout(() => {
                                if (destroyed) return
                                if (player.getPlayerState() !== 1) setBlocked(true)
                            }, 1200)
                        }, Math.max(0, startDelay) * 1000)
                    },
                    onStateChange: (e) => {
                        const state = e.data
                        if (state === 1) {  // PLAYING
                            setBlocked(false)
                            if (watchStartRef.current == null) watchStartRef.current = Date.now()
                            if (!pollRef.current) {
                                pollRef.current = setInterval(() => {
                                    const dur = player.getDuration()
                                    const cur = player.getCurrentTime()
                                    if (dur > 0) {
                                        const pct = (cur / dur) * 100
                                        if (pct > maxReachedRef.current) maxReachedRef.current = pct
                                        const now = Date.now()
                                        if (now - lastSaveRef.current > 10_000) {
                                            lastSaveRef.current = now
                                            sendProgress('progress', maxReachedRef.current, getTotalWatch())
                                        }
                                    }
                                }, 500)
                            }
                        } else {
                            if (state !== 3 && watchStartRef.current != null) {  // 3 = BUFFERING
                                accumulatedRef.current += (Date.now() - watchStartRef.current) / 1000
                                watchStartRef.current = null
                            }
                            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
                        }
                        if (state === 0) {  // ENDED
                            maxReachedRef.current = 100
                            sendProgress('complete', 100, getTotalWatch())
                        }
                    },
                },
            })

            playerRef.current = player
        })

        return () => {
            destroyed = true
            if (startTimer)   clearTimeout(startTimer)
            if (blockedTimer) clearTimeout(blockedTimer)
            if (pollRef.current) clearInterval(pollRef.current)
            try { playerRef.current?.destroy() } catch {}
            playerRef.current = null
        }
    }, [videoId, sendProgress, getTotalWatch, startDelay])

    // Sync volume slider to player
    useEffect(() => {
        const p = playerRef.current
        if (!p) return
        p.setVolume(volume)
        if (volume > 0) p.unMute(); else p.mute()
    }, [volume])

    const toggleMute = () => {
        if (volume > 0) {
            prevVolumeRef.current = volume
            setVolume(0)
        } else {
            setVolume(prevVolumeRef.current || 80)
        }
    }

    const handlePlayClick = () => {
        playerRef.current?.playVideo()
        setBlocked(false)
    }

    const toggleFullscreen = () => {
        if (!wrapperRef.current) return
        if (!document.fullscreenElement) {
            wrapperRef.current.requestFullscreen().catch(() => {})
        } else {
            document.exitFullscreen()
        }
    }

    const handleContinue = () => {
        const cur = playerRef.current?.getCurrentTime() ?? 0
        const dur = playerRef.current?.getDuration() ?? 1
        const pct = dur > 0 ? (cur / dur) * 100 : 0
        sendProgress('continue_click', maxReachedRef.current, getTotalWatch(), {
            continueClickedAtPct: Math.round(pct * 10) / 10,
        })
        onContinue()
    }

    const VolumeIcon = volume === 0 ? VolumeOffIcon : volume <= 50 ? VolumeDownIcon : VolumeUpIcon

    if (!videoId) {
        return (
            <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: '#07070a', padding: 40, textAlign: 'center', color: 'rgba(237,237,237,0.3)', fontSize: '0.72rem' }}>
                No valid YouTube URL configured.
            </div>
        )
    }

    const volumeControl = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={toggleMute} title={volume === 0 ? 'Unmute' : 'Mute'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.65)', padding: 0, display: 'flex', alignItems: 'center' }}>
                <VolumeIcon sx={{ fontSize: 20 }} />
            </button>
            <input type='range' min='0' max='100' value={volume}
                onChange={e => setVolume(Number(e.target.value))}
                style={{ width: 90, cursor: 'pointer', accentColor: 'var(--red)', verticalAlign: 'middle' }}
            />
        </div>
    )

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

            {/* Video area — fades in once ready */}
            <div
                ref={wrapperRef}
                style={{
                    position:   'relative',
                    background: '#000',
                    width:      '100%',
                    opacity:    visible ? 1 : 0,
                    transition: 'opacity 0.55s ease',
                }}
            >
                {/* YouTube mount point — replaced by iframe on init */}
                <div ref={mountRef} style={{ width: '100%' }} />

                {/* Blocks YouTube pause-state UI (share/save/more-videos); click plays or pauses */}
                <div style={{ position: 'absolute', inset: 0, zIndex: 3, cursor: 'pointer' }}
                    onClick={() => {
                        const p = playerRef.current
                        if (!p) return
                        if (p.getPlayerState() === 1) p.pauseVideo()
                        else { p.playVideo(); setBlocked(false) }
                    }}
                />

                {/* Autoplay-blocked overlay */}
                {blocked && (
                    <div onClick={handlePlayClick} style={{
                        position: 'absolute', inset: 0, zIndex: 4,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.72)', cursor: 'pointer', gap: 14,
                    }}>
                        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(219,0,29,0.85)', border: '2px solid rgba(219,0,29,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <PlayArrowIcon sx={{ fontSize: 40, color: '#fff' }} />
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.85)' }}>
                            Click to Play
                        </span>
                    </div>
                )}

                {/* Fullscreen controls overlay */}
                {isFullscreen && (
                    <div style={{
                        position:   'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
                        background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                        padding:    '24px 20px 16px',
                        display:    'flex', alignItems: 'center', gap: 10,
                    }}>
                        {volumeControl}
                        <div style={{ flex: 1 }} />
                        <button onClick={toggleFullscreen} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.7)', padding: 4, display: 'flex', alignItems: 'center' }}>
                            <FullscreenExitIcon sx={{ fontSize: 22 }} />
                        </button>
                    </div>
                )}
            </div>

            {/* Footer — hidden while in fullscreen */}
            {!isFullscreen && (
                <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderTop: '1px solid rgba(219,0,29,0.1)' }}>
                    {volumeControl}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button onClick={toggleFullscreen} title='Fullscreen'
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.4)', padding: 4, display: 'flex', alignItems: 'center' }}>
                            <FullscreenIcon sx={{ fontSize: 20 }} />
                        </button>
                        <button onClick={handleContinue} style={{
                            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                            background: 'var(--red)', border: 'none', color: '#fff',
                            padding: '10px 20px', cursor: 'pointer',
                            fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.15em', textTransform: 'uppercase',
                        }}>
                            Continue to Application <ChevronRightIcon sx={{ fontSize: 16 }} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
