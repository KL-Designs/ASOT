'use client'

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import dynamic from 'next/dynamic'
import { Typography, CircularProgress, Dialog, DialogContent, Tabs, Tab, TextField, Select, MenuItem, FormControl, InputLabel } from '@mui/material'
import { CloudUpload, AutoAwesome, Image, Delete, Info, ExpandMore, ExpandLess } from '@mui/icons-material'
import { ALL_CAMERA_STYLES, getCameraStyleLabel } from '@/lib/ai/prompts/intel-image'

// SSR disabled — uses Math.random() for dynamic overlay values; would cause hydration mismatch
const CameraOverlay = dynamic(() => import('@/components/ai/CameraOverlay'), { ssr: false })

// ── Overlay path map (files are in public/overlays/) ──────────────────────────

const OVERLAY_PATHS: Record<AiCameraStyle, string> = {
    dslr:          '/overlays/01_dslr_overlay.png',
    helmet_cam:    '/overlays/02_helmet_cam_overlay.png',
    bodycam:       '/overlays/03_bodycam_overlay.png',
    drone_uav:     '/overlays/04_drone_uav_overlay.png',
    cctv:          '/overlays/05_cctv_overlay.png',
    long_range:    '/overlays/06_telephoto_recon_overlay.png',
    satellite_isr: '/overlays/07_satellite_isr_overlay.png',
    thermal:       '/overlays/08_thermal_overlay.png',
    night_vision:  '/overlays/09_night_vision_overlay.png',
}

// ── Client-side canvas compositor ─────────────────────────────────────────────
// Loads the clean base image + the selected overlay PNG into a <canvas> element.
// This avoids server-side native canvas bindings entirely.

// Loads the clean base image only — overlay is handled separately by callers so it
// stays fixed during zoom/pan rather than scaling with the image.

interface CompositeCanvasProps {
    imageUrl: string
    style?: React.CSSProperties
    onReady?: (canvas: HTMLCanvasElement) => void
    cssFilter?: string
}

function CompositeCanvas({ imageUrl, style, onReady, cssFilter }: CompositeCanvasProps) {
    const canvasRef  = useRef<HTMLCanvasElement>(null)
    const onReadyRef = useRef(onReady)
    onReadyRef.current = onReady
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        setLoading(true)
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const el:      HTMLCanvasElement        = canvas
        const context: CanvasRenderingContext2D = ctx

        const base = new window.Image()

        base.onload = () => {
            el.width  = base.naturalWidth
            el.height = base.naturalHeight
            context.clearRect(0, 0, el.width, el.height)
            context.drawImage(base, 0, 0)
            setLoading(false)
            onReadyRef.current?.(el)
        }
        base.onerror = () => { setLoading(false) }
        base.src = imageUrl

        return () => {
            base.onload  = null
            base.onerror = null
        }
    }, [imageUrl])

    return (
        <div style={{ position: 'relative', background: '#000', ...style }}>
            {loading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0c' }}>
                    <CircularProgress size={20} style={{ color: 'var(--red)' }} />
                </div>
            )}
            <canvas
                ref={canvasRef}
                style={{ width: '100%', display: 'block', opacity: loading ? 0 : 1, transition: 'opacity 0.2s', filter: cssFilter }}
            />
        </div>
    )
}

// ── Pan / zoom viewport ───────────────────────────────────────────────────────

interface ImageFilters {
    brightness: number   // 0.5 – 2.0  (1 = normal)
    contrast:   number   // 0.5 – 2.0
    saturation: number   // 0   – 2.0
    blur:       number   // 0   – 5 px
}

const DEFAULT_FILTERS: ImageFilters = { brightness: 1, contrast: 1, saturation: 1, blur: 0 }

function buildCssFilter(f: ImageFilters): string {
    const parts: string[] = []
    if (f.brightness !== 1) parts.push(`brightness(${f.brightness})`)
    if (f.contrast   !== 1) parts.push(`contrast(${f.contrast})`)
    if (f.saturation !== 1) parts.push(`saturate(${f.saturation})`)
    if (f.blur       >  0)  parts.push(`blur(${f.blur}px)`)
    return parts.join(' ')
}

interface ImageViewportHandle {
    getCropWithOverlay: () => Promise<Blob | null>
}

const ImageViewport = forwardRef<ImageViewportHandle, {
    imageUrl: string
    overlayStyle: AiCameraStyle
    imageName: string
}>(function ImageViewport({ imageUrl, overlayStyle, imageName }, ref) {
    const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const containerRef       = useRef<HTMLDivElement>(null)
    const dragStartRef       = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

    const [zoom, setZoom]             = useState(1)
    const [pan,  setPan]              = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [aspectRatio, setAspectRatio] = useState('3/2')
    const [filters, setFilters]       = useState<ImageFilters>(DEFAULT_FILTERS)
    const [showFilters, setShowFilters] = useState(false)

    const cssFilter = buildCssFilter(filters)
    const filtersActive = cssFilter !== ''

    function setFilter<K extends keyof ImageFilters>(key: K, val: ImageFilters[K]) {
        setFilters(f => ({ ...f, [key]: val }))
    }

    function onCanvasReady(canvas: HTMLCanvasElement) {
        compositeCanvasRef.current = canvas
        setAspectRatio(`${canvas.width}/${canvas.height}`)
    }

    function clampPan(p: { x: number; y: number }, z: number) {
        const el = containerRef.current
        if (!el) return p
        const cw = el.clientWidth
        const ch = el.clientHeight
        return {
            x: Math.min(0, Math.max(-(cw * z - cw), p.x)),
            y: Math.min(0, Math.max(-(ch * z - ch), p.y)),
        }
    }

    // Non-passive wheel handler — prevents page scroll when the cursor is over the image
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault()
        const el = containerRef.current
        if (!el) return
        const rect   = el.getBoundingClientRect()
        const mx     = e.clientX - rect.left
        const my     = e.clientY - rect.top
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
        // Use updater functions so closures never read stale state
        setZoom(curZoom => {
            const newZoom = Math.max(1, Math.min(4, curZoom * factor))
            setPan(curPan => {
                const cw  = el.clientWidth
                const ch  = el.clientHeight
                const raw = { x: mx - (mx - curPan.x) * newZoom / curZoom, y: my - (my - curPan.y) * newZoom / curZoom }
                return {
                    x: Math.min(0, Math.max(-(cw * newZoom - cw), raw.x)),
                    y: Math.min(0, Math.max(-(ch * newZoom - ch), raw.y)),
                }
            })
            return newZoom
        })
    }, [])

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        el.addEventListener('wheel', handleWheel, { passive: false })
        return () => el.removeEventListener('wheel', handleWheel)
    }, [handleWheel])

    function onMouseDown(e: React.MouseEvent) {
        if (zoom <= 1) return
        e.preventDefault()
        setIsDragging(true)
        dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    }

    function onMouseMove(e: React.MouseEvent) {
        if (!isDragging) return
        setPan(clampPan(
            { x: dragStartRef.current.panX + (e.clientX - dragStartRef.current.x), y: dragStartRef.current.panY + (e.clientY - dragStartRef.current.y) },
            zoom
        ))
    }

    function onMouseUp() { setIsDragging(false) }

    function adjustZoom(factor: number) {
        const newZoom = Math.max(1, Math.min(4, zoom * factor))
        if (newZoom === 1) { setZoom(1); setPan({ x: 0, y: 0 }); return }
        const el = containerRef.current
        if (!el) { setZoom(newZoom); return }
        const cx = el.clientWidth  / 2
        const cy = el.clientHeight / 2
        setPan(clampPan({ x: cx - (cx - pan.x) * newZoom / zoom, y: cy - (cy - pan.y) * newZoom / zoom }, newZoom))
        setZoom(newZoom)
    }

    // Captures the current viewport view (cropped by zoom/pan) with overlay composited on top.
    // Used by both the Download button and the Save Image action.
    const getCropWithOverlay = useCallback((): Promise<Blob | null> => {
        return new Promise(resolve => {
            const canvas = compositeCanvasRef.current
            const el     = containerRef.current
            if (!canvas || !el) { resolve(null); return }

            const cw = el.clientWidth
            const ch = el.clientHeight
            const pr = canvas.width / cw

            const srcX = Math.max(0, (-pan.x / zoom) * pr)
            const srcY = Math.max(0, (-pan.y / zoom) * pr)
            const srcW = Math.min(canvas.width  - srcX, (cw / zoom) * pr)
            const srcH = Math.min(canvas.height - srcY, (ch / zoom) * pr)

            const out = document.createElement('canvas')
            out.width  = Math.round(srcW)
            out.height = Math.round(srcH)
            const ctx = out.getContext('2d')
            if (!ctx) { resolve(null); return }
            // Apply image filters to the export (mirrors the CSS filter on the preview canvas)
            if (cssFilter) ctx.filter = cssFilter
            ctx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, out.width, out.height)
            ctx.filter = 'none'

            const ovImg = new window.Image()
            ovImg.onload  = () => { ctx.drawImage(ovImg, 0, 0, out.width, out.height); out.toBlob(b => resolve(b), 'image/png') }
            ovImg.onerror = () => out.toBlob(b => resolve(b), 'image/png')
            ovImg.src = OVERLAY_PATHS[overlayStyle]
        })
    }, [pan, zoom, overlayStyle, cssFilter])

    useImperativeHandle(ref, () => ({ getCropWithOverlay }), [getCropWithOverlay])

    function downloadCurrentView() {
        getCropWithOverlay().then(blob => {
            if (!blob) return
            const url = URL.createObjectURL(blob)
            const a   = document.createElement('a')
            a.href     = url
            a.download = imageName
            a.click()
            URL.revokeObjectURL(url)
        })
    }

    const btnBase: React.CSSProperties = {
        background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(237,237,237,0.6)', cursor: 'pointer', fontSize: '0.7rem',
        fontWeight: 700, padding: '3px 9px', letterSpacing: 1,
    }

    return (
        <div>
            {/* Viewport */}
            <div
                ref={containerRef}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                style={{
                    overflow: 'hidden',
                    position: 'relative',
                    background: '#000',
                    userSelect: 'none',
                    cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                    aspectRatio,
                }}
            >
                <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', lineHeight: 0 }}>
                    <CompositeCanvas imageUrl={imageUrl} onReady={onCanvasReady} cssFilter={cssFilter || undefined} />
                </div>
                {/* Overlay is outside the zoom transform — stays full-viewport during zoom/pan */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={OVERLAY_PATHS[overlayStyle]}
                    alt=''
                    aria-hidden='true'
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                />
                {zoom > 1 && (
                    <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.65)', padding: '2px 8px', fontSize: '0.6rem', color: 'rgba(237,237,237,0.7)', fontFamily: 'monospace', pointerEvents: 'none' }}>
                        {Math.round(zoom * 100)}%
                    </div>
                )}
            </div>

            {/* Zoom + download controls */}
            <div style={{ display: 'flex', gap: 5, marginTop: 5, alignItems: 'center' }}>
                <button style={btnBase} onClick={() => adjustZoom(1.25)}>+</button>
                <button style={btnBase} onClick={() => adjustZoom(1 / 1.25)}>−</button>
                {zoom > 1 && (
                    <button style={{ ...btnBase, color: 'rgba(237,237,237,0.45)' }} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>
                        RESET
                    </button>
                )}
                <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.2)', marginLeft: 2 }}>scroll · drag</span>
                <button
                    onClick={() => setShowFilters(v => !v)}
                    style={{ ...btnBase, marginLeft: 'auto', color: filtersActive ? 'rgba(219,0,29,0.85)' : 'rgba(237,237,237,0.45)', borderColor: filtersActive ? 'rgba(219,0,29,0.4)' : undefined }}
                >
                    FILTERS{filtersActive ? ' ●' : ''}
                </button>
                <button
                    onClick={downloadCurrentView}
                    style={{ ...btnBase, background: 'rgba(255,255,255,0.06)', color: '#ededed', padding: '3px 12px' }}
                >
                    ↓ DOWNLOAD {zoom > 1 ? 'CROP' : ''}
                </button>
            </div>

            {/* Filter controls */}
            {showFilters && (
                <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.3)' }}>IMAGE ADJUSTMENTS</span>
                        {filtersActive && (
                            <button onClick={() => setFilters(DEFAULT_FILTERS)} style={{ ...btnBase, fontSize: '0.55rem', padding: '2px 8px', color: 'rgba(219,0,29,0.7)' }}>
                                RESET ALL
                            </button>
                        )}
                    </div>
                    {([
                        ['brightness', 'Exposure',   0.5, 2.0, 0.02],
                        ['contrast',   'Contrast',   0.5, 2.0, 0.02],
                        ['saturation', 'Saturation', 0.0, 2.0, 0.02],
                        ['blur',       'Blur',       0.0, 5.0, 0.1 ],
                    ] as [keyof ImageFilters, string, number, number, number][]).map(([key, label, min, max, step]) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                            <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.45)', width: 72, flexShrink: 0 }}>{label}</span>
                            <input
                                type='range'
                                min={min}
                                max={max}
                                step={step}
                                value={filters[key]}
                                onChange={e => setFilter(key, parseFloat(e.target.value))}
                                style={{ flex: 1, accentColor: 'var(--red)', height: 2 }}
                            />
                            <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)', width: 32, textAlign: 'right', fontFamily: 'monospace' }}>
                                {key === 'blur' ? `${filters[key].toFixed(1)}px` : filters[key].toFixed(2)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
})

// ── Style constants ────────────────────────────────────────────────────────────

const inputSx = {
    '& .MuiOutlinedInput-root': {
        '& fieldset': { borderColor: 'rgba(219,0,29,0.25)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.5)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
        background: 'rgba(255,255,255,0.04)',
        color: '#ededed',
        borderRadius: 0,
    },
    '& .MuiInputLabel-root': { color: 'rgba(237,237,237,0.4)', fontSize: '0.82rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
    '& .MuiSvgIcon-root': { color: 'rgba(237,237,237,0.4)' },
}

const tabSx = {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    minHeight: 36,
    padding: '6px 14px',
    color: 'rgba(237,237,237,0.45)',
    '&.Mui-selected': { color: 'var(--foreground)' },
}

const sectionLabel: React.CSSProperties = {
    fontSize: '0.58rem',
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'rgba(237,237,237,0.3)',
    marginBottom: 8,
}

// ── Camera style selector ──────────────────────────────────────────────────────

function CameraStyleGrid({
    value,
    onChange,
}: {
    value: AiCameraStyle
    onChange: (s: AiCameraStyle) => void
}) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {ALL_CAMERA_STYLES.map(style => (
                <button
                    key={style}
                    onClick={() => onChange(style)}
                    style={{
                        position: 'relative',
                        aspectRatio: '16/9',
                        background: value === style ? 'rgba(219,0,29,0.18)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${value === style ? 'rgba(219,0,29,0.7)' : 'rgba(255,255,255,0.08)'}`,
                        cursor: 'pointer',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                    }}
                    title={getCameraStyleLabel(style)}
                >
                    {/* Mini overlay preview */}
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(30,30,35,0.8)' }} />
                    <CameraOverlay cameraStyle={style} style={{ position: 'absolute', inset: 0 }} />
                    <span style={{
                        position: 'relative',
                        zIndex: 1,
                        fontSize: '0.55rem',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        color: value === style ? '#ededed' : 'rgba(237,237,237,0.45)',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                        padding: '2px 4px',
                        background: 'rgba(0,0,0,0.5)',
                        lineHeight: 1.3,
                    }}>
                        {getCameraStyleLabel(style)}
                    </span>
                </button>
            ))}
        </div>
    )
}

// ── Screenshot upload area ─────────────────────────────────────────────────────

function ScreenshotUpload({
    value,
    onChange,
}: {
    value: string | null
    onChange: (b64: string | null) => void
}) {
    const inputRef = useRef<HTMLInputElement>(null)

    function handleFile(file: File) {
        const reader = new FileReader()
        reader.onload = e => onChange((e.target?.result as string).split(',')[1] ?? null)
        reader.readAsDataURL(file)
    }

    function onDrop(e: React.DragEvent) {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file && file.type.startsWith('image/')) handleFile(file)
    }

    return (
        <div
            onDrop={onDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            style={{
                border: `2px dashed ${value ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.12)'}`,
                background: 'rgba(255,255,255,0.03)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 100,
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            <input
                ref={inputRef}
                type='file'
                accept='image/*'
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            {value ? (
                <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={`data:image/png;base64,${value}`}
                        alt='source screenshot'
                        style={{ maxHeight: 120, maxWidth: '100%', objectFit: 'contain' }}
                    />
                    <button
                        onClick={e => { e.stopPropagation(); onChange(null) }}
                        style={{
                            position: 'absolute', top: 4, right: 4,
                            background: 'rgba(0,0,0,0.7)', border: 'none',
                            color: 'rgba(237,237,237,0.8)', cursor: 'pointer',
                            fontSize: '0.65rem', padding: '2px 8px',
                        }}
                    >
                        REMOVE
                    </button>
                </>
            ) : (
                <div style={{ textAlign: 'center', color: 'rgba(237,237,237,0.3)' }}>
                    <CloudUpload sx={{ fontSize: 28, marginBottom: 1, display: 'block', margin: '0 auto 6px' }} />
                    <div style={{ fontSize: '0.73rem' }}>Drop screenshot or click to upload</div>
                    <div style={{ fontSize: '0.63rem', marginTop: 3 }}>Character identity is preserved from the source image</div>
                </div>
            )}
        </div>
    )
}

// ── Cost estimate bar ──────────────────────────────────────────────────────────

interface CostEstimate {
    estimatedCostUsd: number
    provider: AiProvider
    model: string
    allowed: boolean
    reason?: string
}

function CostBar({ estimate, credits }: { estimate: CostEstimate | null; credits: AiCreditSummary | null }) {
    if (!estimate) return null
    return (
        <div style={{
            padding: '8px 12px',
            background: estimate.allowed ? 'rgba(0,195,100,0.06)' : 'rgba(219,0,29,0.1)',
            border: `1px solid ${estimate.allowed ? 'rgba(0,195,100,0.2)' : 'rgba(219,0,29,0.3)'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
        }}>
            <div style={{ fontSize: '0.73rem', color: estimate.allowed ? 'rgb(0,195,100)' : 'rgba(219,0,29,0.9)' }}>
                {estimate.allowed
                    ? `Estimated cost: $${estimate.estimatedCostUsd.toFixed(4)} (${estimate.provider} / ${estimate.model})`
                    : `Budget exceeded: ${estimate.reason}`}
            </div>
            {credits && credits.monthlyLimitUsd !== null && (
                <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', whiteSpace: 'nowrap' }}>
                    ${credits.usedUsd.toFixed(3)} / ${credits.monthlyLimitUsd.toFixed(2)} used
                </div>
            )}
        </div>
    )
}

// ── Creator form ───────────────────────────────────────────────────────────────

interface CreatorFormState {
    sourceImageBase64: string | null
    cameraStyle: AiCameraStyle
    sceneDescription: string
    pose: AiPoseOption
    poseDescription: string
    environment: string
    timeOfDay: string
    weather: string
    mood: string
    extraInstructions: string
    quality: string
    aspectRatio: 'portrait' | 'landscape' | 'square'
    framingDistance: AiFramingDistance
    equipmentLock: boolean
    structureLock: boolean
}

const INITIAL_FORM: CreatorFormState = {
    sourceImageBase64: null,
    cameraStyle: 'dslr',
    sceneDescription: '',
    pose: 'ai',
    poseDescription: '',
    environment: '',
    timeOfDay: '',
    weather: '',
    mood: '',
    extraInstructions: '',
    quality: 'medium',
    aspectRatio: 'landscape',
    framingDistance: 'medium',
    equipmentLock: true,
    structureLock: false,
}

function CreatorPanel({
    onGenerated,
}: {
    onGenerated: (image: AiGeneratedImage) => void
}) {
    const [form, setForm]             = useState<CreatorFormState>(INITIAL_FORM)
    const [estimate, setEstimate]     = useState<CostEstimate | null>(null)
    const [credits, setCredits]       = useState<AiCreditSummary | null>(null)
    const [estimating, setEstimating] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [error, setError]           = useState<string | null>(null)
    const [showAdvanced, setShowAdvanced] = useState(true)

    // Debounced estimate fetch when key fields change
    const estimateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        fetch('/api/me/ai-credits').then(r => r.json()).then(d => setCredits(d.summary ?? null)).catch(() => {})
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission()
        }
    }, [])

    function playGenerationChime() {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const AC: typeof AudioContext = window.AudioContext ?? (window as any).webkitAudioContext
            const ac = new AC()
            function note(freq: number, t: number, dur: number) {
                const osc = ac.createOscillator(); const g = ac.createGain()
                osc.connect(g); g.connect(ac.destination)
                osc.frequency.value = freq; osc.type = 'sine'
                g.gain.setValueAtTime(0, t)
                g.gain.linearRampToValueAtTime(0.15, t + 0.01)
                g.gain.exponentialRampToValueAtTime(0.001, t + dur)
                osc.start(t); osc.stop(t + dur)
            }
            const now = ac.currentTime
            note(880, now, 0.4)
            note(1320, now + 0.18, 0.55)
        } catch { /* audio unavailable */ }
    }

    function showGenerationNotification() {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Intel Image Ready', {
                body: 'Your generated image is ready to review.',
                icon: '/logo-64.png',
            })
        }
    }

    function set<K extends keyof CreatorFormState>(key: K, val: CreatorFormState[K]) {
        setForm(f => ({ ...f, [key]: val }))
    }

    useEffect(() => {
        if (!form.sceneDescription.trim()) { setEstimate(null); return }
        if (estimateTimer.current) clearTimeout(estimateTimer.current)
        estimateTimer.current = setTimeout(async () => {
            setEstimating(true)
            try {
                const res = await fetch('/api/ai/estimate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'image',
                        feature: 'intel.image_generate',
                        request: {
                            quality: form.quality,
                            size: form.aspectRatio === 'landscape' ? '1536x1024' : form.aspectRatio === 'portrait' ? '1024x1536' : '1024x1024',
                        },
                    }),
                })
                const data = await res.json()
                setEstimate(data.estimate ?? null)
            } catch { /* silent */ } finally { setEstimating(false) }
        }, 600)
        return () => { if (estimateTimer.current) clearTimeout(estimateTimer.current) }
    }, [form.sceneDescription, form.quality, form.aspectRatio])

    async function generate() {
        if (!form.sceneDescription.trim()) { setError('Scene description is required.'); return }
        if (estimate && !estimate.allowed) { setError(estimate.reason ?? 'Budget exceeded.'); return }

        setGenerating(true)
        setError(null)
        try {
            const res = await fetch('/api/ai/intel/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceImageBase64:  form.sourceImageBase64 ?? undefined,
                    cameraStyle:        form.cameraStyle,
                    sceneDescription:   form.sceneDescription,
                    pose:               form.pose,
                    poseDescription:    form.pose === 'custom' ? form.poseDescription : undefined,
                    environment:        form.environment || undefined,
                    timeOfDay:          form.timeOfDay   || undefined,
                    weather:            form.weather     || undefined,
                    mood:               form.mood        || undefined,
                    extraInstructions:  form.extraInstructions || undefined,
                    quality:            form.quality,
                    aspectRatio:        form.aspectRatio,
                    framingDistance:    form.framingDistance,
                    equipmentLock:      form.equipmentLock,
                    structureLock:      form.structureLock,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error ?? 'Generation failed.')
            } else {
                onGenerated(data.image)
                playGenerationChime()
                showGenerationNotification()
                fetch('/api/me/ai-credits').then(r => r.json()).then(d => setCredits(d.summary ?? null)).catch(() => {})
            }
        } catch {
            setError('Network error. Please try again.')
        } finally {
            setGenerating(false)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Screenshot upload */}
            <div>
                <div style={sectionLabel}>Source Screenshot (optional — preserves character identity)</div>
                <ScreenshotUpload value={form.sourceImageBase64} onChange={v => set('sourceImageBase64', v)} />
            </div>

            {/* Camera style */}
            <div>
                <div style={sectionLabel}>Camera Style</div>
                <CameraStyleGrid value={form.cameraStyle} onChange={v => set('cameraStyle', v)} />
            </div>

            {/* Framing distance */}
            <div>
                <div style={sectionLabel}>Camera Distance</div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {([
                        ['close',       'Close-Up'],
                        ['medium',      'Medium'],
                        ['wide',        'Wide'],
                        ['establishing','Establishing'],
                    ] as [AiFramingDistance, string][]).map(([val, label]) => (
                        <button
                            key={val}
                            onClick={() => set('framingDistance', val)}
                            style={{
                                flex: 1,
                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.07em',
                                textTransform: 'uppercase', padding: '5px 4px',
                                background: form.framingDistance === val ? 'rgba(219,0,29,0.25)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${form.framingDistance === val ? 'rgba(219,0,29,0.6)' : 'rgba(255,255,255,0.08)'}`,
                                color: form.framingDistance === val ? '#ededed' : 'rgba(237,237,237,0.4)',
                                cursor: 'pointer',
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 6, lineHeight: 1.5 }}>
                    {form.framingDistance === 'close'        && 'Tight framing — the primary subject fills most of the frame.'}
                    {form.framingDistance === 'medium'       && 'Medium framing — the subject occupies roughly half the frame with visible environment context around them.'}
                    {form.framingDistance === 'wide'         && 'Wide framing — the subject is clearly visible but smaller, with the surrounding environment dominating the composition.'}
                    {form.framingDistance === 'establishing' && 'Establishing shot — very wide. The subject is a recognisable figure set within a full, context-rich scene.'}
                </div>
            </div>

            {/* Scene description */}
            <TextField
                label='Scene Description *'
                value={form.sceneDescription}
                onChange={e => set('sceneDescription', e.target.value)}
                multiline
                minRows={2}
                fullWidth
                sx={inputSx}
                helperText='Describe what is happening in the scene — location, activity, context.'
                FormHelperTextProps={{ style: { color: 'rgba(237,237,237,0.3)', fontSize: '0.65rem' } }}
            />

            {/* Pose */}
            <div>
                <div style={sectionLabel}>Pose Handling</div>
                <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)', marginBottom: 8, lineHeight: 1.5 }}>
                    Controls what the subject does in the scene. <strong style={{ color: 'rgba(237,237,237,0.5)' }}>Keep Current</strong> preserves the exact pose from the source screenshot (only applies when a source is uploaded). <strong style={{ color: 'rgba(237,237,237,0.5)' }}>AI Selects</strong> lets the model choose a natural pose for the scene. <strong style={{ color: 'rgba(237,237,237,0.5)' }}>Describe</strong> lets you specify a custom pose in your own words.
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: form.pose === 'custom' ? 10 : 0 }}>
                    {(['keep', 'ai', 'custom'] as AiPoseOption[]).map(p => (
                        <button
                            key={p}
                            onClick={() => set('pose', p)}
                            style={{
                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                padding: '5px 14px',
                                background: form.pose === p ? 'rgba(219,0,29,0.25)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${form.pose === p ? 'rgba(219,0,29,0.6)' : 'rgba(255,255,255,0.08)'}`,
                                color: form.pose === p ? '#ededed' : 'rgba(237,237,237,0.4)',
                                cursor: 'pointer',
                            }}
                        >
                            {p === 'keep' ? 'Keep Current' : p === 'ai' ? 'AI Selects' : 'Describe'}
                        </button>
                    ))}
                </div>
                {form.pose === 'custom' && (
                    <TextField
                        label='Pose Description *'
                        value={form.poseDescription}
                        onChange={e => set('poseDescription', e.target.value)}
                        fullWidth
                        sx={inputSx}
                        size='small'
                        placeholder='e.g. Standing at ease, rifle slung, looking left'
                    />
                )}
            </div>

            {/* Equipment lock */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: form.equipmentLock ? 'rgba(219,0,29,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${form.equipmentLock ? 'rgba(219,0,29,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                <button
                    onClick={() => set('equipmentLock', !form.equipmentLock)}
                    style={{
                        flexShrink: 0,
                        fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                        padding: '4px 10px',
                        background: form.equipmentLock ? 'rgba(219,0,29,0.3)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${form.equipmentLock ? 'rgba(219,0,29,0.6)' : 'rgba(255,255,255,0.1)'}`,
                        color: form.equipmentLock ? '#ededed' : 'rgba(237,237,237,0.4)',
                        cursor: 'pointer',
                    }}
                >
                    {form.equipmentLock ? '🔒 LOCKED' : '🔓 UNLOCKED'}
                </button>
                <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: form.equipmentLock ? 'rgba(237,237,237,0.8)' : 'rgba(237,237,237,0.35)', letterSpacing: '0.05em' }}>Equipment Lock</div>
                    <div style={{ fontSize: '0.63rem', color: 'rgba(237,237,237,0.3)', marginTop: 2, lineHeight: 1.4 }}>
                        {form.equipmentLock
                            ? 'Clothing and gear are frozen — the AI cannot add, remove, or change any equipment regardless of what is written in mood, atmosphere, or extra instructions.'
                            : 'Unlocked — equipment changes are permitted when described in the scene or extra instructions.'}
                    </div>
                </div>
            </div>

            {/* Structure / Terrain lock */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: form.structureLock ? 'rgba(219,0,29,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${form.structureLock ? 'rgba(219,0,29,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                <button
                    onClick={() => set('structureLock', !form.structureLock)}
                    style={{
                        flexShrink: 0,
                        fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                        padding: '4px 10px',
                        background: form.structureLock ? 'rgba(219,0,29,0.3)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${form.structureLock ? 'rgba(219,0,29,0.6)' : 'rgba(255,255,255,0.1)'}`,
                        color: form.structureLock ? '#ededed' : 'rgba(237,237,237,0.4)',
                        cursor: 'pointer',
                    }}
                >
                    {form.structureLock ? '🔒 LOCKED' : '🔓 UNLOCKED'}
                </button>
                <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: form.structureLock ? 'rgba(237,237,237,0.8)' : 'rgba(237,237,237,0.35)', letterSpacing: '0.05em' }}>Structure / Terrain Lock</div>
                    <div style={{ fontSize: '0.63rem', color: 'rgba(237,237,237,0.3)', marginTop: 2, lineHeight: 1.4 }}>
                        {form.structureLock
                            ? 'Building layouts, terrain features, and infrastructure are frozen — the AI must reproduce the same positions, sizes, and structure as shown in the source image.'
                            : 'Unlocked — structures and terrain may be freely generated to suit the described scene.'}
                    </div>
                </div>
            </div>

            {/* Advanced options toggle */}
            <button
                onClick={() => setShowAdvanced(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: 0 }}
            >
                {showAdvanced ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
                Scene details &amp; mood
            </button>

            {showAdvanced && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <TextField label='Environment' value={form.environment} onChange={e => set('environment', e.target.value)} sx={inputSx} size='small' style={{ flex: 1 }} placeholder='e.g. Dense jungle, urban alley, open desert' />
                        <TextField label='Time of Day' value={form.timeOfDay} onChange={e => set('timeOfDay', e.target.value)} sx={inputSx} size='small' style={{ flex: 1 }} placeholder='e.g. Dawn, midday, dusk, night' />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <TextField label='Weather' value={form.weather} onChange={e => set('weather', e.target.value)} sx={inputSx} size='small' style={{ flex: 1 }} placeholder='e.g. Clear, overcast, light rain, fog' />
                        <TextField label='Atmosphere / Mood' value={form.mood} onChange={e => set('mood', e.target.value)} sx={inputSx} size='small' style={{ flex: 1 }} placeholder='e.g. Tense, quiet, chaotic' />
                    </div>
                    <TextField label='Extra Instructions' value={form.extraInstructions} onChange={e => set('extraInstructions', e.target.value)} sx={inputSx} size='small' fullWidth placeholder='Any other guidance for the AI…' />
                </div>
            )}

            {/* Quality + aspect ratio */}
            <div style={{ display: 'flex', gap: 10 }}>
                <FormControl sx={inputSx} size='small' style={{ flex: 1 }}>
                    <InputLabel>Quality</InputLabel>
                    <Select value={form.quality} label='Quality' onChange={e => set('quality', e.target.value)} MenuProps={{ PaperProps: { style: { background: '#1a1a1a', color: '#ededed' } } }}>
                        <MenuItem value='low'>Low</MenuItem>
                        <MenuItem value='medium'>Medium (default)</MenuItem>
                        <MenuItem value='high'>High</MenuItem>
                    </Select>
                </FormControl>
                <FormControl sx={inputSx} size='small' style={{ flex: 1 }}>
                    <InputLabel>Aspect Ratio</InputLabel>
                    <Select value={form.aspectRatio} label='Aspect Ratio' onChange={e => set('aspectRatio', e.target.value as CreatorFormState['aspectRatio'])} MenuProps={{ PaperProps: { style: { background: '#1a1a1a', color: '#ededed' } } }}>
                        <MenuItem value='landscape'>Landscape (16:9)</MenuItem>
                        <MenuItem value='portrait'>Portrait (2:3)</MenuItem>
                        <MenuItem value='square'>Square (1:1)</MenuItem>
                    </Select>
                </FormControl>
            </div>

            {/* Cost estimate */}
            {estimating
                ? <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)' }}>Estimating cost…</div>
                : <CostBar estimate={estimate} credits={credits} />
            }

            {error && (
                <Typography fontSize='0.75rem' style={{ color: '#ff4444' }}>{error}</Typography>
            )}

            <button
                onClick={generate}
                disabled={generating || !form.sceneDescription.trim() || (!!estimate && !estimate.allowed)}
                style={{
                    background: generating ? 'rgba(219,0,29,0.15)' : 'rgba(219,0,29,0.3)',
                    border: '1px solid rgba(219,0,29,0.5)',
                    color: generating ? 'rgba(237,237,237,0.4)' : '#ededed',
                    padding: '10px 24px',
                    cursor: (generating || !form.sceneDescription.trim()) ? 'not-allowed' : 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    letterSpacing: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    alignSelf: 'flex-start',
                }}
            >
                <AutoAwesome sx={{ fontSize: 16 }} />
                {generating ? 'GENERATING…' : 'GENERATE IMAGE'}
            </button>
            {generating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(237,237,237,0.4)', fontSize: '0.72rem' }}>
                    <CircularProgress size={14} style={{ color: 'var(--red)' }} />
                    This may take 15–30 seconds…
                </div>
            )}
        </div>
    )
}

// ── Result viewer ──────────────────────────────────────────────────────────────

function ImageResult({
    image,
    onUse,
    onDiscard,
}: {
    image: AiGeneratedImage
    onUse: () => void
    onDiscard: () => void
}) {
    const [showDetails, setShowDetails] = useState(false)
    const [saved, setSaved] = useState(false)
    const viewportRef = useRef<ImageViewportHandle | null>(null)
    const imageId  = image._id?.toString() ?? ''
    const imageUrl = `/api/ai/images/${imageId}/file`

    async function handleUse() {
        if (saved) return
        setSaved(true)  // optimistic — images consistently save successfully
        try {
            const blob = await viewportRef.current?.getCropWithOverlay() ?? null
            if (blob) {
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onload  = () => resolve((reader.result as string).split(',')[1])
                    reader.onerror = reject
                    reader.readAsDataURL(blob)
                })
                await fetch('/api/ai/images/save-crop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ parentId: imageId, imageBase64: base64 }),
                })
            }
            onUse()
        } catch {
            setSaved(false)  // revert only on hard failure
        }
    }

    return (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            {/* Left: zoomable viewport */}
            <div style={{ flex: '0 0 45%', maxWidth: 520, flexShrink: 0 }}>
                <ImageViewport
                    ref={viewportRef}
                    imageUrl={imageUrl}
                    overlayStyle={image.cameraStyle}
                    imageName={`intel-image-${imageId}.png`}
                />
            </div>

            {/* Right: action controls */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                        onClick={handleUse}
                        disabled={saved}
                        style={{
                            background: saved ? 'rgba(0,195,100,0.08)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${saved ? 'rgba(0,195,100,0.3)' : 'rgba(255,255,255,0.15)'}`,
                            color: saved ? 'rgba(0,195,100,0.8)' : 'rgba(237,237,237,0.75)',
                            padding: '8px 20px',
                            cursor: saved ? 'default' : 'pointer',
                            fontSize: '0.75rem', fontWeight: 700, letterSpacing: 1, textAlign: 'left',
                        }}
                    >
                        {saved ? '✓ SAVED' : 'USE IMAGE'}
                    </button>
                    <button
                        onClick={() => setShowDetails(v => !v)}
                        style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.5)', padding: '8px 14px', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4, textAlign: 'left' }}
                    >
                        <Info sx={{ fontSize: 14 }} /> {showDetails ? 'Hide Details' : 'Details'}
                    </button>
                    <button
                        onClick={onDiscard}
                        style={{ background: 'none', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.6)', padding: '8px 14px', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                        <Delete sx={{ fontSize: 14 }} /> Discard
                    </button>
                </div>

                {showDetails && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', padding: '10px 12px', fontSize: '0.68rem', color: 'rgba(237,237,237,0.5)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div><span style={{ color: 'rgba(237,237,237,0.3)' }}>Provider:</span> {image.provider} / {image.model}</div>
                        <div><span style={{ color: 'rgba(237,237,237,0.3)' }}>Cost:</span> ${image.generationCostUsd.toFixed(4)}</div>
                        <div><span style={{ color: 'rgba(237,237,237,0.3)' }}>Camera:</span> {getCameraStyleLabel(image.cameraStyle)}</div>
                        <div><span style={{ color: 'rgba(237,237,237,0.3)' }}>Quality:</span> {image.quality} · {image.aspectRatio}</div>
                        <div><span style={{ color: 'rgba(237,237,237,0.3)' }}>Source image:</span> {image.hadSourceImage ? 'Yes (character preserved)' : 'No (scene only)'}</div>
                        {image.framingDistance && <div><span style={{ color: 'rgba(237,237,237,0.3)' }}>Framing:</span> {image.framingDistance}</div>}
                        <div style={{ marginTop: 4 }}><span style={{ color: 'rgba(237,237,237,0.3)' }}>Scene:</span> {image.sceneDescription}</div>
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Image library ─────────────────────────────────────────────────────────────

function ImageCard({
    image,
    onDelete,
    onSelect,
}: {
    image: AiGeneratedImage
    onDelete: (id: string) => void
    onSelect: (image: AiGeneratedImage) => void
}) {
    const [deleting, setDeleting] = useState(false)

    async function del(e: React.MouseEvent) {
        e.stopPropagation()
        setDeleting(true)
        await fetch(`/api/ai/images?id=${image._id?.toString()}`, { method: 'DELETE' }).catch(() => {})
        onDelete(image._id!.toString())
    }

    return (
        <div
            onClick={() => onSelect(image)}
            style={{
                position: 'relative',
                background: '#0a0a0c',
                border: '1px solid rgba(255,255,255,0.07)',
                cursor: 'pointer',
                overflow: 'hidden',
                aspectRatio: image.aspectRatio === 'portrait' ? '2/3' : image.aspectRatio === 'landscape' ? '3/2' : '1/1',
            }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={`/api/ai/images/${image._id?.toString()}/file`}
                alt='Generated intel image'
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                loading='lazy'
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={OVERLAY_PATHS[image.cameraStyle]}
                alt=''
                aria-hidden='true'
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
            />
            {/* Footer */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'rgba(0,0,0,0.65)',
                padding: '5px 8px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
                <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.5)', fontFamily: 'monospace' }}>
                    {getCameraStyleLabel(image.cameraStyle)}
                </span>
                <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.35)', fontFamily: 'monospace' }}>
                    ${image.generationCostUsd.toFixed(3)}
                </span>
            </div>
            {/* Delete button */}
            <button
                onClick={del}
                disabled={deleting}
                style={{
                    position: 'absolute', top: 4, right: 4,
                    background: 'rgba(0,0,0,0.7)', border: 'none',
                    color: deleting ? 'rgba(237,237,237,0.3)' : 'rgba(219,0,29,0.8)',
                    cursor: 'pointer', padding: '2px 6px', fontSize: '0.6rem',
                }}
                title='Delete image'
            >
                ✕
            </button>
            {/* Used badge */}
            {image.status === 'used' && (
                <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,195,100,0.2)', border: '1px solid rgba(0,195,100,0.4)', color: 'rgb(0,195,100)', fontSize: '0.55rem', fontWeight: 700, padding: '1px 6px', letterSpacing: 1 }}>
                    USED
                </div>
            )}
        </div>
    )
}

function ImageLibraryPanel({ onSelect }: { onSelect?: (image: AiGeneratedImage) => void }) {
    const [scope, setScope]     = useState<'mine' | 'all'>('mine')
    const [images, setImages]   = useState<AiGeneratedImage[]>([])
    const [canViewAll, setCanViewAll] = useState(false)
    const [loading, setLoading] = useState(true)
    const [page, setPage]       = useState(1)
    const [total, setTotal]     = useState(0)
    const limit = 24

    const [selectedImage, setSelectedImage] = useState<AiGeneratedImage | null>(null)

    const load = useCallback(async (pg: number, sc: typeof scope) => {
        setLoading(true)
        try {
            const res = await fetch(`/api/ai/images?scope=${sc}&page=${pg}&limit=${limit}`)
            const data = await res.json()
            setImages(data.images ?? [])
            setTotal(data.total ?? 0)
            setCanViewAll(data.canViewAll ?? false)
        } catch { /* silent */ } finally { setLoading(false) }
    }, [])

    useEffect(() => { load(page, scope) }, [load, page, scope])

    function onDelete(id: string) {
        setImages(prev => prev.filter(img => img._id?.toString() !== id))
        setTotal(t => t - 1)
    }

    function handleSelect(image: AiGeneratedImage) {
        setSelectedImage(image)
        if (onSelect) onSelect(image)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Scope toggle */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => { setScope('mine'); setPage(1) }} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '4px 12px', background: scope === 'mine' ? 'rgba(219,0,29,0.25)' : 'rgba(255,255,255,0.05)', border: `1px solid ${scope === 'mine' ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.08)'}`, color: scope === 'mine' ? '#ededed' : 'rgba(237,237,237,0.4)', cursor: 'pointer' }}>
                    My Images
                </button>
                {canViewAll && (
                    <button onClick={() => { setScope('all'); setPage(1) }} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '4px 12px', background: scope === 'all' ? 'rgba(219,0,29,0.25)' : 'rgba(255,255,255,0.05)', border: `1px solid ${scope === 'all' ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.08)'}`, color: scope === 'all' ? '#ededed' : 'rgba(237,237,237,0.4)', cursor: 'pointer' }}>
                        All Images
                    </button>
                )}
                <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', marginLeft: 4 }}>{total} images</span>
            </div>

            {loading && <CircularProgress size={20} style={{ color: 'var(--red)' }} />}

            {!loading && images.length === 0 && (
                <div style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.78rem', padding: '24px 0', textAlign: 'center' }}>
                    <Image sx={{ fontSize: 36, display: 'block', margin: '0 auto 8px', opacity: 0.2 }} />
                    No images yet. Use the Creator tab to generate your first intel image.
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {images.map(img => (
                    <ImageCard key={img._id?.toString()} image={img} onDelete={onDelete} onSelect={handleSelect} />
                ))}
            </div>

            {total > limit && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', padding: '5px 14px', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: '0.7rem' }}>← Prev</button>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)', alignSelf: 'center' }}>Page {page} of {Math.ceil(total / limit)}</span>
                    <button onClick={() => setPage(p => p + 1)} disabled={page * limit >= total} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', padding: '5px 14px', cursor: page * limit >= total ? 'not-allowed' : 'pointer', fontSize: '0.7rem' }}>Next →</button>
                </div>
            )}

            {/* Quick-view dialog */}
            {selectedImage && (
                <Dialog
                    open={!!selectedImage}
                    onClose={() => setSelectedImage(null)}
                    maxWidth='md'
                    PaperProps={{ style: { background: '#0d0d10', border: '1px solid rgba(219,0,29,0.3)', borderRadius: 0, color: '#ededed' } }}
                >
                    <DialogContent style={{ padding: 0, position: 'relative' }}>
                        <div style={{ position: 'relative', lineHeight: 0 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={`/api/ai/images/${selectedImage._id?.toString()}/file`}
                                alt='Generated intel image'
                                style={{ display: 'block', maxWidth: '80vw', maxHeight: '80vh', objectFit: 'contain' }}
                            />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={OVERLAY_PATHS[selectedImage.cameraStyle]}
                                alt=''
                                aria-hidden='true'
                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                            />
                        </div>
                        <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.5)' }}>
                                {getCameraStyleLabel(selectedImage.cameraStyle)} · {selectedImage.userName} · ${selectedImage.generationCostUsd.toFixed(4)}
                            </span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {onSelect && (
                                    <button onClick={() => { onSelect(selectedImage); setSelectedImage(null) }} style={{ background: 'rgba(0,195,100,0.15)', border: '1px solid rgba(0,195,100,0.4)', color: 'rgb(0,195,100)', padding: '5px 14px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}>
                                        USE THIS IMAGE
                                    </button>
                                )}
                                <button onClick={() => setSelectedImage(null)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', padding: '5px 14px', cursor: 'pointer', fontSize: '0.7rem' }}>CLOSE</button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    )
}

// ── Main tab ───────────────────────────────────────────────────────────────────

export default function IntelImagesTab() {
    const [tab, setTab] = useState(0)
    const [latestImage, setLatestImage] = useState<AiGeneratedImage | null>(null)
    const [libraryRefresh, setLibraryRefresh] = useState(0)

    function onGenerated(image: AiGeneratedImage) {
        setLatestImage(image)
        setTab(1) // switch to result view
    }

    async function onUse() {
        if (!latestImage) return
        await fetch('/api/ai/images', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: latestImage._id?.toString(), status: 'used' }),
        })
        setLatestImage(img => img ? { ...img, status: 'used' } : img)
        setLibraryRefresh(n => n + 1)
    }

    async function onDiscard() {
        if (!latestImage) return
        await fetch(`/api/ai/images?id=${latestImage._id?.toString()}`, { method: 'DELETE' })
        setLatestImage(null)
        setTab(0)
    }

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Sub-tabs */}
            <div style={{ borderBottom: '1px solid rgba(219,0,29,0.22)', padding: '0 20px', flexShrink: 0 }}>
                <Tabs
                    value={tab}
                    onChange={(_, v) => setTab(v)}
                    TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                    sx={{ minHeight: 36 }}
                >
                    <Tab icon={<AutoAwesome sx={{ fontSize: 14 }} />} iconPosition='start' label='Creator' sx={tabSx} />
                    <Tab
                        icon={<Image sx={{ fontSize: 14 }} />}
                        iconPosition='start'
                        label={latestImage ? 'Result ●' : 'Result'}
                        sx={{ ...tabSx, color: latestImage ? 'rgba(0,195,100,0.8)' : undefined }}
                    />
                    <Tab icon={<Image sx={{ fontSize: 14 }} />} iconPosition='start' label='Library' sx={tabSx} />
                </Tabs>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px' }}>
                {tab === 0 && <CreatorPanel onGenerated={onGenerated} />}
                {tab === 1 && (
                    latestImage ? (
                        <ImageResult
                            key={latestImage._id?.toString()}
                            image={latestImage}
                            onUse={onUse}
                            onDiscard={onDiscard}
                        />
                    ) : (
                        <div style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.78rem', textAlign: 'center', paddingTop: 40 }}>
                            No image generated yet. Use the Creator tab.
                        </div>
                    )
                )}
                {tab === 2 && <ImageLibraryPanel key={libraryRefresh} />}
            </div>
        </div>
    )
}
