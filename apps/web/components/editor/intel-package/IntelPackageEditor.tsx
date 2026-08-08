'use client'

import React, { useState, useEffect, useRef, useCallback, useContext, createContext } from 'react'
import { AddPhotoAlternate, Close, Remove, ZoomIn, ZoomOut } from '@mui/icons-material'
import ImageLibraryModal from '../ImageLibraryModal'

// ── Slide metadata ────────────────────────────────────────────────────────────

const SLIDE_NAMES = [
    'Cover',
    'Area of Operations',
    'Terrain',
    'Enemy Overview',
    'High Value Targets',
    'BLUFOR Forces',
    'Independent Forces',
    'Civilians',
    'Other Parties',
    'Mission',
    'Execution',
    'Admin & Logistics',
    'ROE & OFOF',
    'Command & Signals',
    'Closing',
]

const SLIDE_REFS = ['00-CVR','00-AO','01-TRN','02-ENY','02-HVT','03-BLU','03-INF','03-CIV','03-OTP','04-MSN','05-EXE','05-LOG','05-ROE','06-CS','END']

const DEFAULT_SUPPLIES: IntelPackageSupply[] = [
    { category: 'Ammunition', status: 'adequate' },
    { category: 'Medical',    status: 'adequate' },
    { category: 'Fuel',       status: 'adequate' },
    { category: 'Equipment',  status: 'adequate' },
]

const STATUS_COLORS: Record<string, string> = {
    critical: '#c62828',
    low:      '#f59e0b',
    adequate: '#10b981',
    full:     '#3b82f6',
}

// ── ROE defaults (editor mirrors viewer constants) ────────────────────────────

const ROE_DEFAULTS = {
    free: {
        color: '#c62828',
        label: 'WEAPONS FREE',
        summary: 'Targets not positively identified as friendly may be engaged, provided they meet the authorised hostile criteria and remain valid under the mission ROE.',
        rules: [
            { heading: 'FRIENDLY IDENTIFICATION', text: 'Do not engage personnel, vehicles or positions positively identified as friendly.' },
            { heading: 'AUTHORISED TARGETS', text: 'Engage only targets that fall within the declared hostile categories and authorised operational area.' },
            { heading: 'PROTECTED PERSONS', text: 'Do not deliberately engage civilians, medical personnel, surrendered personnel or other protected persons.' },
            { heading: 'FIRE CONTROL', text: 'Use aimed and controlled fire. Observe all restricted areas, protected locations and weapon limitations.' },
            { heading: 'TARGET VALIDITY', text: 'Cease engagement when the target surrenders, becomes incapacitated, is identified as friendly or is otherwise no longer valid.' },
            { heading: 'REPORTING', text: 'Report civilian casualties, friendly-fire incidents and suspected ROE breaches through the chain of command.' },
        ],
    },
    tight: {
        color: '#e5d95f',
        label: 'WEAPONS TIGHT',
        summary: 'Engage only positively identified hostile targets, unless acting in immediate self-defence or under a direct engagement order.',
        rules: [
            { heading: 'POSITIVE IDENTIFICATION', text: 'Confirm that the target is hostile before engaging.' },
            { heading: 'SUSPICION IS INSUFFICIENT', text: 'Being armed, unidentified or behaving suspiciously does not by itself authorise engagement.' },
            { heading: 'CONFIRMATION', text: 'When positive identification cannot be established, maintain observation and request direction.' },
            { heading: 'SELF-DEFENCE', text: 'Immediate force may be used to stop a hostile act or imminent threat to friendly personnel.' },
            { heading: 'FIRE CONTROL', text: 'Use aimed and controlled fire, and cease engagement when the threat or authority to engage ends.' },
            { heading: 'REPORTING', text: 'Report engagements, civilian casualties, friendly-fire incidents and uncertain target identification.' },
        ],
    },
    hold: {
        color: '#8fd18f',
        label: 'WEAPONS HOLD',
        summary: 'Do not engage unless acting in immediate self-defence or specifically ordered to fire by authorised command.',
        rules: [
            { heading: 'WITHHOLD FIRE', text: 'Maintain weapon readiness but do not engage without the required authority.' },
            { heading: 'OBSERVE AND REPORT', text: 'Track suspected hostile personnel, vehicles or positions and report their activity.' },
            { heading: 'ENGAGEMENT AUTHORITY', text: 'Engagement requires an order from the designated commander or authority identified in the mission briefing.' },
            { heading: 'SELF-DEFENCE', text: 'Without an engagement order, force is limited to stopping an immediate hostile act or imminent threat.' },
            { heading: 'MINIMUM NECESSARY FORCE', text: 'When engagement becomes authorised, use only the force required and cease when the threat ends.' },
            { heading: 'REPORTING', text: 'Immediately report hostile activity, engagement requests and any use of force.' },
        ],
    },
} as const

// ── HVT priority colors ───────────────────────────────────────────────────────

const HVT_PRIORITY_COLORS: Record<string, string> = {
    high:   '#c62828',
    medium: '#e5a020',
    low:    '#8fd18f',
}

// ── Context ───────────────────────────────────────────────────────────────────

interface EditorCtx {
    readOnly: boolean
    tc: (alpha: number) => string
    uploadImage: (fileOrBlob: File | Blob) => Promise<string | null>
}

const EditorContext = createContext<EditorCtx>({
    readOnly: false,
    tc: (a) => `rgba(219,0,29,${a})`,
    uploadImage: async () => null,
})

// ── Image crop modal ──────────────────────────────────────────────────────────

interface CropModalProps {
    src: string
    onConfirm: (blob: Blob) => void
    onCancel: () => void
}

function ImageCropModal({ src, onConfirm, onCancel }: CropModalProps) {
    const { tc } = useContext(EditorContext)
    const canvasRef   = useRef<HTMLCanvasElement>(null)
    const imgRef      = useRef<HTMLImageElement | null>(null)
    const [zoom, setZoom]   = useState(1)
    const [panX, setPanX]   = useState(0)
    const [panY, setPanY]   = useState(0)
    const dragging = useRef(false)
    const lastPos  = useRef({ x: 0, y: 0 })

    // Restore system cursor (globals.css sets cursor:none !important for custom cursor)
    useEffect(() => {
        document.body.classList.add('cursor-disabled')
        return () => document.body.classList.remove('cursor-disabled')
    }, [])

    useEffect(() => {
        const img = new Image()
        img.src = src
        img.onload = () => { imgRef.current = img; draw(img, zoom, panX, panY) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src])

    function draw(img: HTMLImageElement, z: number, px: number, py: number) {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const W = canvas.width, H = canvas.height
        ctx.clearRect(0, 0, W, H)
        ctx.fillStyle = '#07070a'
        ctx.fillRect(0, 0, W, H)

        const baseScale = Math.min(W / img.naturalWidth, H / img.naturalHeight)
        const scale = baseScale * z
        const drawW = img.naturalWidth * scale
        const drawH = img.naturalHeight * scale
        const x = (W - drawW) / 2 + px
        const y = (H - drawH) / 2 + py
        ctx.drawImage(img, x, y, drawW, drawH)
    }

    function redraw(z = zoom, px = panX, py = panY) {
        if (imgRef.current) draw(imgRef.current, z, px, py)
    }

    function onMouseDown(e: React.MouseEvent) {
        dragging.current = true
        lastPos.current = { x: e.clientX, y: e.clientY }
    }
    function onMouseMove(e: React.MouseEvent) {
        if (!dragging.current) return
        const dx = e.clientX - lastPos.current.x
        const dy = e.clientY - lastPos.current.y
        lastPos.current = { x: e.clientX, y: e.clientY }
        setPanX(px => { const npx = px + dx; redraw(zoom, npx, panY + dy); return npx })
        setPanY(py => { const npy = py + dy; redraw(zoom, panX + dx, npy); return npy })
    }
    function onMouseUp() { dragging.current = false }

    function changeZoom(delta: number) {
        const newZ = Math.max(0.5, Math.min(4, zoom + delta))
        setZoom(newZ)
        redraw(newZ)
    }

    function handleConfirm() {
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.toBlob(blob => { if (blob) onConfirm(blob) }, 'image/png')
    }

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#0f0f14', border: '1px solid rgba(255,255,255,0.1)', width: 640, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.5)' }}>Crop Image</span>
                    <button type='button' onClick={onCancel} style={{ background: 'transparent', border: 'none', color: 'rgba(237,237,237,0.4)', cursor: 'pointer', display: 'flex' }}><Close style={{ fontSize: 18 }} /></button>
                </div>
                <canvas
                    ref={canvasRef}
                    width={600} height={400}
                    style={{ display: 'block', cursor: 'grab', width: '100%', background: '#07070a' }}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button type='button' onClick={() => changeZoom(-0.1)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.6)', cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ZoomOut style={{ fontSize: 15 }} /></button>
                        <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.4)', minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                        <button type='button' onClick={() => changeZoom(0.1)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.6)', cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ZoomIn style={{ fontSize: 15 }} /></button>
                        <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.05em' }}>Drag to pan</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type='button' onClick={onCancel} style={{ padding: '6px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.5)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
                        <button type='button' onClick={handleConfirm} style={{ padding: '6px 14px', background: tc(0.15), border: `1px solid ${tc(0.4)}`, color: tc(0.9), fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>Confirm</button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Shared sub-components (module level — no React identity change on re-render) ──

interface FieldProps {
    label: string
    value?: string
    onChange: (v: string) => void
    multiline?: boolean
    placeholder?: string
    rows?: number
}

function Field({ label, value, onChange, multiline = false, placeholder = '', rows = 4 }: FieldProps) {
    const { readOnly, tc } = useContext(EditorContext)

    if (readOnly) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>{label}</div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.75)', whiteSpace: 'pre-wrap', minHeight: 24 }}>{value || '—'}</div>
            </div>
        )
    }

    if (multiline) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>{label}</label>
                <textarea
                    value={value || ''}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    rows={rows}
                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, color: 'rgba(237,237,237,0.85)', fontSize: '0.82rem', padding: '8px 10px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                    onFocus={e => { e.currentTarget.style.borderColor = tc(0.45) }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                />
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>{label}</label>
            <input
                type='text'
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, color: 'rgba(237,237,237,0.85)', fontSize: '0.82rem', padding: '7px 10px', outline: 'none', fontFamily: 'inherit' }}
                onFocus={e => { e.currentTarget.style.borderColor = tc(0.45) }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
            />
        </div>
    )
}

interface ImageSlotProps {
    label: string
    value?: string
    onUpload: (url: string) => void
    onClear: () => void
}

function ImageSlot({ label, value, onUpload, onClear }: ImageSlotProps) {
    const { readOnly, uploadImage } = useContext(EditorContext)
    const inputRef   = useRef<HTMLInputElement>(null)
    const [uploading, setUploading]   = useState(false)
    const [dragOver,  setDragOver]    = useState(false)
    const [cropSrc,   setCropSrc]     = useState<string | null>(null)
    const [showLibrary, setShowLibrary] = useState(false)
    const cropIsBlobRef = useRef(false)

    async function processFile(file: File) {
        if (!file.type.startsWith('image/')) return
        const localSrc = URL.createObjectURL(file)
        cropIsBlobRef.current = true
        setCropSrc(localSrc)
    }

    function openEditCrop() {
        if (!value) return
        cropIsBlobRef.current = false
        setCropSrc(value)
    }

    async function handleCropConfirm(blob: Blob) {
        if (cropSrc && cropIsBlobRef.current) URL.revokeObjectURL(cropSrc)
        setCropSrc(null)
        setUploading(true)
        const url = await uploadImage(blob)
        setUploading(false)
        if (url) onUpload(url)
    }

    function handleCropCancel() {
        if (cropSrc && cropIsBlobRef.current) URL.revokeObjectURL(cropSrc)
        setCropSrc(null)
    }

    function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (file) processFile(file)
        e.target.value = ''
    }

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault()
        e.stopPropagation()
        if (!readOnly) setDragOver(true)
    }

    function handleDragLeave(e: React.DragEvent) {
        e.preventDefault()
        setDragOver(false)
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
        if (readOnly) return
        const file = e.dataTransfer.files?.[0]
        if (file) processFile(file)
    }

    return (
        <>
            {cropSrc && (
                <ImageCropModal src={cropSrc} onConfirm={handleCropConfirm} onCancel={handleCropCancel} />
            )}
            {showLibrary && (
                <ImageLibraryModal onSelect={url => { onUpload(url); setShowLibrary(false) }} onClose={() => setShowLibrary(false)} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>{label}</div>
                {value ? (
                    <div style={{ position: 'relative', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <img src={value} alt={label} style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover' }} />
                        {!readOnly && (
                            <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                                <button type='button' onClick={() => setShowLibrary(true)}
                                    style={{ background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(237,237,237,0.8)', height: 24, padding: '0 6px', display: 'flex', alignItems: 'center', cursor: 'pointer', borderRadius: 2, fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
                                    title='Select from image library'
                                >Library</button>
                                <button type='button' onClick={openEditCrop}
                                    style={{ background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(237,237,237,0.8)', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 2, fontSize: '0.6rem', fontWeight: 700 }}
                                    title='Edit / re-crop image'
                                >✎</button>
                                <button type='button' onClick={onClear}
                                    style={{ background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 2 }}
                                    title='Remove image'
                                ><Close style={{ fontSize: 14 }} /></button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        <div
                            style={{ border: `1px dashed ${dragOver ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)'}`, background: dragOver ? 'rgba(255,255,255,0.05)' : 'repeating-linear-gradient(135deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 2px, transparent 2px, transparent 12px)', minHeight: 100, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: readOnly ? 'default' : 'pointer', color: 'rgba(237,237,237,0.2)', transition: 'all 0.15s', boxSizing: 'border-box' }}
                            onClick={() => !readOnly && inputRef.current?.click()}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                        >
                            {uploading ? (
                                <span style={{ fontSize: '0.72rem', textAlign: 'center' }}>Uploading…</span>
                            ) : (
                                <>
                                    <AddPhotoAlternate style={{ fontSize: 22, opacity: 0.4 }} />
                                    {!readOnly && <span style={{ fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center' }}>{dragOver ? 'Drop to upload' : 'Click or drop image'}</span>}
                                </>
                            )}
                        </div>
                        {!readOnly && (
                            <button type='button' onClick={() => setShowLibrary(true)}
                                style={{ width: '100%', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderTop: 'none', color: 'rgba(237,237,237,0.3)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s', boxSizing: 'border-box' }}
                                onMouseEnter={e => { e.currentTarget.style.color = 'rgba(237,237,237,0.7)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(237,237,237,0.3)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                            >
                                Select from Library
                            </button>
                        )}
                    </div>
                )}
                {!readOnly && <input ref={inputRef} type='file' accept='image/*' style={{ display: 'none' }} onChange={handleFileInput} />}
            </div>
        </>
    )
}

interface SlideHeaderProps { slideIndex: number }

function SlideHeader({ slideIndex }: SlideHeaderProps) {
    const { tc } = useContext(EditorContext)
    return (
        <div style={{ marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: tc(0.45), fontFamily: 'monospace', marginBottom: 4 }}>
                {'// REF [ ' + SLIDE_REFS[slideIndex] + ' ] — SLIDE ' + (slideIndex + 1) + '/15'}
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(237,237,237,0.9)' }}>
                {SLIDE_NAMES[slideIndex]}
            </div>
        </div>
    )
}

// ── Helper factories ──────────────────────────────────────────────────────────

function newHvt(): IntelPackageHvt {
    return { id: Math.random().toString(36).slice(2, 10) }
}

function newCallsign(): IntelPackageCallsign {
    return { callsign: '', element: '', commander: '', pax: '' }
}

function newCommsGroup(): IntelPackageCommsGroup {
    return { id: Math.random().toString(36).slice(2, 10), groupName: '', entries: [{ callsign: '', srPrim: '', srAlt: '', lrPrim: '', lrAlt: '' }] }
}

function newCommsEntry(): IntelPackageCommsEntry {
    return { callsign: '', srPrim: '', srAlt: '', lrPrim: '', lrAlt: '' }
}

function newCustomRule(): { id: string; heading?: string; text: string } {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString()
    return { id, heading: '', text: '' }
}

function emptyData(): Omit<IntelPackage, '_id' | 'operationId' | 'updatedAt' | 'updatedById' | 'updatedByName'> {
    return {
        cover:             {},
        areaOfOps:         {},
        terrain:           {},
        enemyOverview:     {},
        highValueTargets:  [newHvt(), newHvt(), newHvt()],
        bluforForces:      { callsigns: [newCallsign(), newCallsign(), newCallsign(), newCallsign()], additionalCallsigns: '' },
        independentForces: {},
        civilians:         {},
        otherParties:      {},
        mission:           {},
        execution:         { tasks: [{ label: '01', text: '' }, { label: '02', text: '' }, { label: '03', text: '' }, { label: '04', text: '' }] },
        adminLogistics:    { supplyStatus: DEFAULT_SUPPLIES.map(s => ({ ...s })) },
        roeOfof:           { weaponsState: 'tight', customRules: [] },
        commandSignals:    {
            commsCardMode: 'custom',
            commsCard: {
                groups: [
                    {
                        id: 'grp-chq', groupName: '1-0 CHQ', color: '#dc2626',
                        entries: [
                            { callsign: '1-0', srPrim: '60.1', srAlt: '', lrPrim: '60.0', lrAlt: '68.5/69.5/69.6' },
                        ],
                    },
                    {
                        id: 'grp-11', groupName: '1-1 Platoon', color: '#16a34a',
                        entries: [
                            { callsign: '1-1-0',       srPrim: '51.0', srAlt: '51.1', lrPrim: '60.0', lrAlt: '68.5/69.5/69.6' },
                            { callsign: '1-1-1 Alpha', srPrim: '52.0', srAlt: '',     lrPrim: '51.0', lrAlt: '68.5/69.5/69.6' },
                            { callsign: '1-1-2 Bravo', srPrim: '53.0', srAlt: '',     lrPrim: '51.0', lrAlt: '68.5/69.5/69.6' },
                            { callsign: '1-1-3 Charlie', srPrim: '54.0', srAlt: '',   lrPrim: '51.0', lrAlt: '68.5/69.5/69.6' },
                        ],
                    },
                    {
                        id: 'grp-12', groupName: '1-2 Platoon', color: '#ca8a04',
                        entries: [
                            { callsign: '1-2-0',       srPrim: '61.0', srAlt: '61.1', lrPrim: '60.0', lrAlt: '68.5/69.5/69.6' },
                            { callsign: '1-2-1 Alpha', srPrim: '62.0', srAlt: '',     lrPrim: '61.0', lrAlt: '68.5/69.5/69.6' },
                            { callsign: '1-2-2 Bravo', srPrim: '63.0', srAlt: '',     lrPrim: '61.0', lrAlt: '68.5/69.5/69.6' },
                            { callsign: '1-2-3 Charlie', srPrim: '64.0', srAlt: '',   lrPrim: '61.0', lrAlt: '68.5/69.5/69.6' },
                        ],
                    },
                    {
                        id: 'grp-13', groupName: '1-3 Platoon', color: '#1d4ed8',
                        entries: [
                            { callsign: '1-3 Echo',   srPrim: '66.0', srAlt: '', lrPrim: '60.0', lrAlt: '68.5/69.5/69.6' },
                            { callsign: '1-3 Golf',   srPrim: '68.0', srAlt: '', lrPrim: '60.0', lrAlt: '68.5/69.5/69.6' },
                            { callsign: '1-3 Hotel',  srPrim: '69.0', srAlt: '', lrPrim: '60.0', lrAlt: '68.5/69.5/69.6' },
                            { callsign: '1-3 Mike',   srPrim: '70.0', srAlt: '', lrPrim: '60.0', lrAlt: '68.5/69.5/69.6' },
                            { callsign: '1-3 Victor', srPrim: '80.0', srAlt: '', lrPrim: '60.0', lrAlt: '68.5/69.5/69.6' },
                        ],
                    },
                ],
                supportFrequencies: 'IDF Net: 68.5\nCAS Net: 69.5\nLogistics Net: 69.6',
                convoyFrequencies: 'First Convoy: 71.0\nSecond Convoy: 72.0\nThird Convoy: 73.0\nFourth Convoy: 74.0',
            },
        },
        closing:           {},
    }
}

// ── Main editor ───────────────────────────────────────────────────────────────

interface Props {
    operationId: string
    readOnly?: boolean
    themeColor?: string
}

export default function IntelPackageEditor({ operationId, readOnly = false, themeColor = '#db001d' }: Props) {
    const [data, setData]                 = useState<ReturnType<typeof emptyData>>(emptyData())
    const [activeSlide, setActiveSlide]   = useState(0)
    const [saveStatus, setSaveStatus]     = useState<'saved' | 'saving' | 'error'>('saved')
    const [loading, setLoading]           = useState(true)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const dataRef      = useRef(data)
    dataRef.current    = data

    // ── Theme colour helper ────────────────────────────────────────────────
    const hex = themeColor.replace('#', '')
    const tr  = parseInt(hex.slice(0, 2), 16)
    const tg  = parseInt(hex.slice(2, 4), 16)
    const tb  = parseInt(hex.slice(4, 6), 16)
    const tc  = useCallback((a: number) => `rgba(${tr},${tg},${tb},${a})`, [tr, tg, tb])

    // ── Image upload ───────────────────────────────────────────────────────
    const uploadImage = useCallback(async (fileOrBlob: File | Blob): Promise<string | null> => {
        const fd = new FormData()
        fd.append('file', fileOrBlob, fileOrBlob instanceof File ? fileOrBlob.name : 'crop.png')
        const r = await fetch('/api/upload', { method: 'POST', body: fd })
        if (!r.ok) return null
        const { url } = await r.json()
        return url as string
    }, [])

    // ── Load ───────────────────────────────────────────────────────────────
    useEffect(() => {
        setLoading(true)
        fetch(`/api/operations/intel-package/${operationId}`)
            .then(r => r.json())
            .then(({ package: pkg }) => {
                if (pkg) {
                    const { _id: _a, operationId: _b, updatedAt: _c, updatedById: _d, updatedByName: _e, ...rest } = pkg
                    setData(() => ({ ...emptyData(), ...rest }))
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [operationId])

    // ── Auto-save ──────────────────────────────────────────────────────────
    const scheduleSave = useCallback(() => {
        if (readOnly) return
        setSaveStatus('saving')
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
            fetch(`/api/operations/intel-package/${operationId}`, {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(dataRef.current),
            })
                .then(r => { if (r.ok) setSaveStatus('saved'); else setSaveStatus('error') })
                .catch(() => setSaveStatus('error'))
        }, 800)
    }, [operationId, readOnly])

    function update<T>(updater: (prev: T) => T, key: keyof ReturnType<typeof emptyData>) {
        setData(d => ({ ...d, [key]: updater(d[key] as T) }))
        scheduleSave()
    }

    // ── Slide renderer ─────────────────────────────────────────────────────
    function renderSlide(idx: number): React.ReactNode {
        switch (idx) {

            // ── 0: Cover ──────────────────────────────────────────────────
            case 0: return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <SlideHeader slideIndex={0} />
                    <Field label='Operation Name' value={data.cover?.operationName} onChange={v => update<typeof data.cover>(c => ({ ...c, operationName: v }), 'cover')} placeholder='OPERATION THUNDER RIDGE' />
                    <Field label='Operation Date' value={data.cover?.operationDate} onChange={v => update<typeof data.cover>(c => ({ ...c, operationDate: v }), 'cover')} placeholder='19 JUL 2026' />
                    <Field label='Sub-title / Series' value={data.cover?.subTitle} onChange={v => update<typeof data.cover>(c => ({ ...c, subTitle: v }), 'cover')} placeholder='CAMPAIGN SERIES — ACT II' />
                </div>
            )

            // ── 1: Area of Operations ─────────────────────────────────────
            case 1: return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <SlideHeader slideIndex={1} />
                    <Field label='Situation Summary' value={data.areaOfOps?.situation} onChange={v => update<typeof data.areaOfOps>(c => ({ ...c, situation: v }), 'areaOfOps')} multiline placeholder='Describe the area of operations, current situation, and relevant context...' />
                    <ImageSlot label='Map / AO Image' value={data.areaOfOps?.mapImagePath} onUpload={url => update<typeof data.areaOfOps>(c => ({ ...c, mapImagePath: url }), 'areaOfOps')} onClear={() => update<typeof data.areaOfOps>(c => ({ ...c, mapImagePath: undefined }), 'areaOfOps')} />
                </div>
            )

            // ── 2: Terrain ────────────────────────────────────────────────
            case 2: return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <SlideHeader slideIndex={2} />
                    <ImageSlot label='Terrain Image' value={data.terrain?.imagePath} onUpload={url => update<typeof data.terrain>(c => ({ ...c, imagePath: url }), 'terrain')} onClear={() => update<typeof data.terrain>(c => ({ ...c, imagePath: undefined }), 'terrain')} />
                    <Field label='Key Terrain' value={data.terrain?.keyTerrain} onChange={v => update<typeof data.terrain>(c => ({ ...c, keyTerrain: v }), 'terrain')} multiline placeholder='Describe key terrain features that affect operations...' />
                    <Field label='Observation & Fields of Fire' value={data.terrain?.observation} onChange={v => update<typeof data.terrain>(c => ({ ...c, observation: v }), 'terrain')} multiline placeholder='Observation points, dead ground, lines of sight...' />
                    <Field label='Cover & Concealment' value={data.terrain?.coverConcealment} onChange={v => update<typeof data.terrain>(c => ({ ...c, coverConcealment: v }), 'terrain')} multiline placeholder='Available cover, concealment routes, hide areas...' />
                </div>
            )

            // ── 3: Enemy Overview ─────────────────────────────────────────
            case 3: return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <SlideHeader slideIndex={3} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <Field label='Composition'  value={data.enemyOverview?.composition}  onChange={v => update<typeof data.enemyOverview>(c => ({ ...c, composition: v }),  'enemyOverview')} multiline />
                        <Field label='Disposition'  value={data.enemyOverview?.disposition}  onChange={v => update<typeof data.enemyOverview>(c => ({ ...c, disposition: v }),  'enemyOverview')} multiline />
                        <Field label='Strength'     value={data.enemyOverview?.strength}     onChange={v => update<typeof data.enemyOverview>(c => ({ ...c, strength: v }),     'enemyOverview')} multiline />
                        <Field label='Capabilities' value={data.enemyOverview?.capabilities} onChange={v => update<typeof data.enemyOverview>(c => ({ ...c, capabilities: v }), 'enemyOverview')} multiline />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <ImageSlot label='Image 1' value={data.enemyOverview?.image1Path} onUpload={url => update<typeof data.enemyOverview>(c => ({ ...c, image1Path: url }), 'enemyOverview')} onClear={() => update<typeof data.enemyOverview>(c => ({ ...c, image1Path: undefined }), 'enemyOverview')} />
                        <ImageSlot label='Image 2' value={data.enemyOverview?.image2Path} onUpload={url => update<typeof data.enemyOverview>(c => ({ ...c, image2Path: url }), 'enemyOverview')} onClear={() => update<typeof data.enemyOverview>(c => ({ ...c, image2Path: undefined }), 'enemyOverview')} />
                    </div>
                </div>
            )

            // ── 4: High Value Targets ─────────────────────────────────────
            case 4: {
                const hvts = data.highValueTargets ?? []
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <SlideHeader slideIndex={4} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            {hvts.map((hvt, i) => (
                                <div key={hvt.id} style={{ border: '1px solid rgba(255,255,255,0.07)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: tc(0.5), marginBottom: 2 }}>HVT — TARGET {i + 1}</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14 }}>
                                        <ImageSlot label='Photo' value={hvt.imagePath}
                                            onUpload={url => update<IntelPackageHvt[]>(arr => arr.map((h, j) => j === i ? { ...h, imagePath: url } : h), 'highValueTargets')}
                                            onClear={() => update<IntelPackageHvt[]>(arr => arr.map((h, j) => j === i ? { ...h, imagePath: undefined } : h), 'highValueTargets')}
                                        />
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            <Field label='Name / Alias'        value={hvt.name}     onChange={v => update<IntelPackageHvt[]>(arr => arr.map((h, j) => j === i ? { ...h, name: v }     : h), 'highValueTargets')} />
                                            <Field label='Role / Designation'  value={hvt.role}     onChange={v => update<IntelPackageHvt[]>(arr => arr.map((h, j) => j === i ? { ...h, role: v }     : h), 'highValueTargets')} />
                                            <Field label='Last Known Location' value={hvt.location} onChange={v => update<IntelPackageHvt[]>(arr => arr.map((h, j) => j === i ? { ...h, location: v } : h), 'highValueTargets')} />
                                        </div>
                                    </div>

                                    {/* Priority selector */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>Priority</div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {(['low', 'medium', 'high'] as const).map(p => {
                                                const color  = HVT_PRIORITY_COLORS[p]
                                                const active = hvt.priority === p
                                                return (
                                                    <button key={p} type='button' disabled={readOnly}
                                                        onClick={() => update<IntelPackageHvt[]>(arr => arr.map((h, j) => j === i ? { ...h, priority: active ? undefined : p } : h), 'highValueTargets')}
                                                        style={{
                                                            padding: '5px 14px',
                                                            background: active ? `${color}22` : 'transparent',
                                                            border: `2px solid ${active ? color : color + '44'}`,
                                                            color: active ? color : `${color}88`,
                                                            fontSize: '0.68rem', fontWeight: 700,
                                                            letterSpacing: '0.12em', textTransform: 'uppercase',
                                                            cursor: readOnly ? 'default' : 'pointer',
                                                            transition: 'all 0.15s',
                                                        }}
                                                    >
                                                        {p.toUpperCase()}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {!readOnly && hvts.length > 1 && (
                                        <button type='button' onClick={() => update<IntelPackageHvt[]>(arr => arr.filter((_, j) => j !== i), 'highValueTargets')}
                                            style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(200,40,40,0.12)', border: '1px solid rgba(200,40,40,0.3)', color: 'rgba(200,40,40,0.7)', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 2 }}
                                        ><Remove style={{ fontSize: 12 }} /></button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {!readOnly && hvts.length < 6 && (
                            <button type='button' onClick={() => update<IntelPackageHvt[]>(arr => [...arr, newHvt()], 'highValueTargets')}
                                style={{ alignSelf: 'flex-start', padding: '6px 14px', background: 'transparent', border: `1px dashed ${tc(0.3)}`, color: tc(0.55), fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}
                            >+ Add HVT</button>
                        )}
                    </div>
                )
            }

            // ── 5: BLUFOR Forces ──────────────────────────────────────────
            case 5: {
                const callsigns = data.bluforForces?.callsigns ?? []
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <SlideHeader slideIndex={5} />
                        <Field label='HQ / Disposition Summary' value={data.bluforForces?.hqDisposition} onChange={v => update<typeof data.bluforForces>(c => ({ ...c, hqDisposition: v }), 'bluforForces')} multiline placeholder='Overall BLUFOR disposition, HQ location, task organisation...' />
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginTop: 6 }}>Callsign Grid</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {callsigns.map((cs, i) => (
                                <div key={i} style={{ border: '1px solid rgba(255,255,255,0.07)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: tc(0.4) }}>Callsign {i + 1}</div>
                                    <Field label='Callsign'  value={cs.callsign}  onChange={v => update<IntelPackageCallsign[]>(arr => arr.map((c, j) => j === i ? { ...c, callsign: v }  : c), 'bluforForces')} />
                                    <Field label='Element'   value={cs.element}   onChange={v => update<IntelPackageCallsign[]>(arr => arr.map((c, j) => j === i ? { ...c, element: v }   : c), 'bluforForces')} />
                                    <Field label='Commander' value={cs.commander} onChange={v => update<IntelPackageCallsign[]>(arr => arr.map((c, j) => j === i ? { ...c, commander: v } : c), 'bluforForces')} />
                                    <Field label='PAX'       value={cs.pax}       onChange={v => update<IntelPackageCallsign[]>(arr => arr.map((c, j) => j === i ? { ...c, pax: v }       : c), 'bluforForces')} />
                                </div>
                            ))}
                        </div>
                        {!readOnly && (
                            <div style={{ display: 'flex', gap: 8 }}>
                                {callsigns.length < 8 && (
                                    <button type='button' onClick={() => update<typeof data.bluforForces>(c => ({ ...c, callsigns: [...(c?.callsigns ?? []), newCallsign()] }), 'bluforForces')}
                                        style={{ padding: '5px 12px', background: 'transparent', border: `1px dashed ${tc(0.3)}`, color: tc(0.55), fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                                    >+ Add Callsign</button>
                                )}
                                {callsigns.length > 1 && (
                                    <button type='button' onClick={() => update<typeof data.bluforForces>(c => ({ ...c, callsigns: (c?.callsigns ?? []).slice(0, -1) }), 'bluforForces')}
                                        style={{ padding: '5px 12px', background: 'transparent', border: '1px dashed rgba(200,40,40,0.3)', color: 'rgba(200,40,40,0.55)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                                    >- Remove Last</button>
                                )}
                            </div>
                        )}
                        <Field label='Additional Callsigns / Attachments' value={data.bluforForces?.additionalCallsigns} onChange={v => update<typeof data.bluforForces>(c => ({ ...c, additionalCallsigns: v }), 'bluforForces')} multiline placeholder='Any supporting or attached elements not in the grid above...' />
                    </div>
                )
            }

            // ── 6 / 7 / 8: Independent Forces / Civilians / Other Parties ─
            case 6:
            case 7:
            case 8: {
                const slideKey = idx === 6 ? 'independentForces' : idx === 7 ? 'civilians' : 'otherParties'
                const party = (data[slideKey] ?? {}) as IntelPackageParty
                const defaultLabels = idx === 6
                    ? ['Composition', 'Disposition', 'Threat Level', 'Intent']
                    : idx === 7
                    ? ['Presence', 'Attitude', 'Threat to Ops', 'Notes']
                    : ['Type', 'Disposition', 'Threat Level', 'Notes']

                function updateParty(fn: (p: IntelPackageParty) => IntelPackageParty) {
                    update<IntelPackageParty>(fn, slideKey as keyof ReturnType<typeof emptyData>)
                }

                const quadrants: Array<{ label: keyof IntelPackageParty; value: keyof IntelPackageParty; default: string }> = [
                    { label: 'q1Label', value: 'q1', default: defaultLabels[0] },
                    { label: 'q2Label', value: 'q2', default: defaultLabels[1] },
                    { label: 'q3Label', value: 'q3', default: defaultLabels[2] },
                    { label: 'q4Label', value: 'q4', default: defaultLabels[3] },
                ]

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <SlideHeader slideIndex={idx} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            {quadrants.map(q => (
                                <div key={String(q.value)} style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid rgba(255,255,255,0.07)', padding: 12 }}>
                                    <Field label='Quadrant Label' value={party[q.label] as string | undefined}
                                        onChange={v => updateParty(p => ({ ...p, [q.label]: v }))}
                                        placeholder={q.default} />
                                    <Field label='Content' value={party[q.value] as string | undefined}
                                        onChange={v => updateParty(p => ({ ...p, [q.value]: v }))}
                                        multiline />
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <ImageSlot label='Image 1' value={party.image1Path}
                                onUpload={url => updateParty(p => ({ ...p, image1Path: url }))}
                                onClear={() => updateParty(p => ({ ...p, image1Path: undefined }))} />
                            <ImageSlot label='Image 2' value={party.image2Path}
                                onUpload={url => updateParty(p => ({ ...p, image2Path: url }))}
                                onClear={() => updateParty(p => ({ ...p, image2Path: undefined }))} />
                        </div>
                    </div>
                )
            }

            // ── 9: Mission ────────────────────────────────────────────────
            case 9: return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <SlideHeader slideIndex={9} />
                    <Field label='Mission Statement' value={data.mission?.statement} onChange={v => update<typeof data.mission>(c => ({ ...c, statement: v }), 'mission')} multiline placeholder='ASOT will [WHAT] in [WHERE] at [WHEN] in order to [WHY]' />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <Field label='Who'   value={data.mission?.who}   onChange={v => update<typeof data.mission>(c => ({ ...c, who: v }),   'mission')} placeholder='Which elements are tasked' />
                        <Field label='What'  value={data.mission?.what}  onChange={v => update<typeof data.mission>(c => ({ ...c, what: v }),  'mission')} placeholder='The assigned task' />
                        <Field label='When'  value={data.mission?.when}  onChange={v => update<typeof data.mission>(c => ({ ...c, when: v }),  'mission')} placeholder='H-Hour, key timing' />
                        <Field label='Where' value={data.mission?.where} onChange={v => update<typeof data.mission>(c => ({ ...c, where: v }), 'mission')} placeholder='Grid reference / named area' />
                    </div>
                    <Field label='Why / Intent' value={data.mission?.why} onChange={v => update<typeof data.mission>(c => ({ ...c, why: v }), 'mission')} multiline placeholder="Commander's intent and desired end-state..." />
                </div>
            )

            // ── 10: Execution ─────────────────────────────────────────────
            case 10: {
                const tasks = data.execution?.tasks ?? []
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <SlideHeader slideIndex={10} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {tasks.map((task, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '48px 1fr', gap: 10, alignItems: 'flex-start' }}>
                                    <input
                                        type='text'
                                        value={task.label}
                                        onChange={e => update<IntelPackageTask[]>(arr => arr.map((t, j) => j === i ? { ...t, label: e.target.value } : t), 'execution')}
                                        disabled={readOnly}
                                        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, color: tc(0.85), fontSize: '0.82rem', padding: '7px 8px', outline: 'none', fontFamily: 'monospace', fontWeight: 700, textAlign: 'center' }}
                                    />
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <input
                                            type='text'
                                            value={task.text}
                                            onChange={e => update<IntelPackageTask[]>(arr => arr.map((t, j) => j === i ? { ...t, text: e.target.value } : t), 'execution')}
                                            disabled={readOnly}
                                            placeholder={`Task ${i + 1} description...`}
                                            style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, color: 'rgba(237,237,237,0.85)', fontSize: '0.82rem', padding: '7px 10px', outline: 'none', fontFamily: 'inherit' }}
                                        />
                                        {!readOnly && tasks.length > 1 && (
                                            <button type='button' onClick={() => update<IntelPackageTask[]>(arr => arr.filter((_, j) => j !== i), 'execution')}
                                                style={{ background: 'rgba(200,40,40,0.1)', border: '1px solid rgba(200,40,40,0.25)', color: 'rgba(200,40,40,0.6)', width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 2 }}
                                            ><Remove style={{ fontSize: 13 }} /></button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {!readOnly && tasks.length < 8 && (
                            <button type='button' onClick={() => update<typeof data.execution>(e => ({ ...e, tasks: [...(e?.tasks ?? []), { label: String(tasks.length + 1).padStart(2, '0'), text: '' }] }), 'execution')}
                                style={{ alignSelf: 'flex-start', padding: '5px 12px', background: 'transparent', border: `1px dashed ${tc(0.3)}`, color: tc(0.55), fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                            >+ Add Task</button>
                        )}
                        <ImageSlot label='Supporting Image (Optional)' value={data.execution?.imagePath}
                            onUpload={url => update<typeof data.execution>(e => ({ ...e, imagePath: url }), 'execution')}
                            onClear={() => update<typeof data.execution>(e => ({ ...e, imagePath: undefined }), 'execution')} />
                    </div>
                )
            }

            // ── 11: Admin & Logistics ─────────────────────────────────────
            case 11: {
                const supplies = data.adminLogistics?.supplyStatus ?? DEFAULT_SUPPLIES.map(s => ({ ...s }))
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <SlideHeader slideIndex={11} />
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>Supply Status</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {supplies.map((s, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 10, alignItems: 'center' }}>
                                    <Field label='Category' value={s.category} onChange={v => update<typeof data.adminLogistics>(l => ({ ...l, supplyStatus: (l?.supplyStatus ?? []).map((x, j) => j === i ? { ...x, category: v } : x) }), 'adminLogistics')} />
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>Status</div>
                                        <select
                                            value={s.status}
                                            disabled={readOnly}
                                            onChange={e => update<typeof data.adminLogistics>(l => ({ ...l, supplyStatus: (l?.supplyStatus ?? []).map((x, j) => j === i ? { ...x, status: e.target.value as IntelPackageSupply['status'] } : x) }), 'adminLogistics')}
                                            style={{ background: STATUS_COLORS[s.status] + '22', border: `1px solid ${STATUS_COLORS[s.status]}66`, color: STATUS_COLORS[s.status], fontSize: '0.78rem', fontWeight: 700, padding: '6px 10px', outline: 'none', cursor: readOnly ? 'default' : 'pointer' }}
                                        >
                                            <option value='critical'>Critical</option>
                                            <option value='low'>Low</option>
                                            <option value='adequate'>Adequate</option>
                                            <option value='full'>Full</option>
                                        </select>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {!readOnly && (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type='button' onClick={() => update<typeof data.adminLogistics>(l => ({ ...l, supplyStatus: [...(l?.supplyStatus ?? []), { category: '', status: 'adequate' }] }), 'adminLogistics')}
                                    style={{ padding: '5px 12px', background: 'transparent', border: `1px dashed ${tc(0.3)}`, color: tc(0.55), fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                                >+ Add Category</button>
                                {supplies.length > 1 && (
                                    <button type='button' onClick={() => update<typeof data.adminLogistics>(l => ({ ...l, supplyStatus: (l?.supplyStatus ?? []).slice(0, -1) }), 'adminLogistics')}
                                        style={{ padding: '5px 12px', background: 'transparent', border: '1px dashed rgba(200,40,40,0.3)', color: 'rgba(200,40,40,0.55)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                                    >- Remove Last</button>
                                )}
                            </div>
                        )}
                        <Field label='Supply Summary' value={data.adminLogistics?.supplySummary} onChange={v => update<typeof data.adminLogistics>(l => ({ ...l, supplySummary: v }), 'adminLogistics')} multiline placeholder='Summary of logistical situation, resupply plans, CASEVAC routes...' />
                        <Field label='Assets' value={data.adminLogistics?.assets} onChange={v => update<typeof data.adminLogistics>(l => ({ ...l, assets: v }), 'adminLogistics')} multiline placeholder='Supporting assets, vehicles, aircraft, enablers...' />
                    </div>
                )
            }

            // ── 12: ROE & OFOF ────────────────────────────────────────────
            case 12: {
                const ws = data.roeOfof?.weaponsState ?? 'tight'
                const roeConfig    = ROE_DEFAULTS[ws]
                const stateColor   = roeConfig.color
                const customRules  = data.roeOfof?.customRules ?? []

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <SlideHeader slideIndex={12} />

                        {/* 1. Weapon state selector */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>Weapons State</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {(['free', 'tight', 'hold'] as const).map(state => {
                                    const color  = ROE_DEFAULTS[state].color
                                    const active = ws === state
                                    return (
                                        <button key={state} type='button' disabled={readOnly}
                                            onClick={() => update<typeof data.roeOfof>(r => ({ ...r, weaponsState: state }), 'roeOfof')}
                                            style={{ flex: 1, padding: '10px', background: active ? color + '22' : 'transparent', border: `2px solid ${active ? color : color + '44'}`, color: active ? color : color + '88', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: readOnly ? 'default' : 'pointer', transition: 'all 0.15s' }}
                                        >
                                            {state === 'free' ? 'Weapons Free' : state === 'tight' ? 'Weapons Tight' : 'Weapons Hold'}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* 2. Default summary preview */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>
                                Standard Summary <span style={{ color: stateColor, marginLeft: 6 }}>{roeConfig.label}</span>
                            </div>
                            <div style={{
                                fontSize: '0.78rem', color: 'rgba(237,237,237,0.45)',
                                lineHeight: 1.5, fontStyle: 'italic',
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                padding: '8px 12px',
                            }}>
                                {roeConfig.summary}
                            </div>
                        </div>

                        {/* 3. Custom summary */}
                        <Field
                            label='Custom Summary (optional — overrides standard summary in viewer)'
                            value={data.roeOfof?.customSummary}
                            onChange={v => update<typeof data.roeOfof>(r => ({ ...r, customSummary: v || undefined }), 'roeOfof')}
                            multiline
                            placeholder='Leave empty to use the standard summary'
                            rows={3}
                        />

                        {/* 4. Standard rules (editable) */}
                        {(() => {
                            const overrides = data.roeOfof?.standardRulesOverrides?.[ws]
                            const hasOverrides = !!overrides
                            const currentRules = overrides ?? roeConfig.rules.map(r => ({ heading: r.heading, text: r.text }))

                            function updateStandardRule(ruleIndex: number, field: 'heading' | 'text', value: string) {
                                const base = data.roeOfof?.standardRulesOverrides?.[ws] ?? roeConfig.rules.map(r => ({ heading: r.heading, text: r.text }))
                                const updated = base.map((r, j) => j === ruleIndex ? { ...r, [field]: value } : r)
                                update<typeof data.roeOfof>(r => ({
                                    ...r,
                                    standardRulesOverrides: { ...(r?.standardRulesOverrides ?? {}), [ws]: updated },
                                }), 'roeOfof')
                            }

                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>
                                            Standard Rules
                                            {hasOverrides && <span style={{ color: stateColor, fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>— edited</span>}
                                        </div>
                                        {!readOnly && hasOverrides && (
                                            <button type='button'
                                                onClick={() => update<typeof data.roeOfof>(r => ({
                                                    ...r,
                                                    standardRulesOverrides: { ...(r?.standardRulesOverrides ?? {}), [ws]: undefined },
                                                }), 'roeOfof')}
                                                style={{ fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', background: 'none', border: '1px solid rgba(255,255,255,0.1)', padding: '3px 8px', cursor: 'pointer' }}
                                            >Reset to Defaults</button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {roeConfig.rules.map((_, i) => {
                                            const rule = currentRules[i] ?? roeConfig.rules[i]
                                            return (
                                                <div key={i} style={{ border: '1px solid rgba(255,255,255,0.06)', padding: '8px 12px', display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10, background: 'rgba(0,0,0,0.15)' }}>
                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#c62828', fontWeight: 700, paddingTop: 6 }}>
                                                        {String(i + 1).padStart(2, '0')}
                                                    </span>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        <input
                                                            type='text'
                                                            value={rule.heading}
                                                            disabled={readOnly}
                                                            onChange={e => updateStandardRule(i, 'heading', e.target.value)}
                                                            style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#9d9fa4', fontSize: '0.55rem', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '1px', outline: 'none', padding: '1px 0', width: '100%' }}
                                                        />
                                                        <textarea
                                                            value={rule.text}
                                                            disabled={readOnly}
                                                            rows={2}
                                                            onChange={e => updateStandardRule(i, 'text', e.target.value)}
                                                            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(237,237,237,0.6)', fontSize: '0.72rem', lineHeight: 1.4, padding: '4px 8px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
                                                        />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })()}

                        {/* 5. Custom rules */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>
                                Custom Rules <span style={{ color: stateColor, fontWeight: 400 }}>(numbered after standard rules in viewer)</span>
                            </div>
                            {customRules.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {customRules.map((rule, i) => (
                                        <div key={rule.id} style={{ border: '1px solid rgba(255,255,255,0.07)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
                                            <div style={{ fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: stateColor + '99' }}>
                                                Custom Rule {i + 1}
                                            </div>
                                            <Field
                                                label='Heading (optional)'
                                                value={rule.heading}
                                                onChange={v => update<typeof data.roeOfof>(r => ({
                                                    ...r,
                                                    customRules: (r?.customRules ?? []).map((x, j) => j === i ? { ...x, heading: v || undefined } : x)
                                                }), 'roeOfof')}
                                                placeholder='e.g. ESCALATION OF FORCE'
                                            />
                                            <Field
                                                label='Rule Text'
                                                value={rule.text}
                                                onChange={v => update<typeof data.roeOfof>(r => ({
                                                    ...r,
                                                    customRules: (r?.customRules ?? []).map((x, j) => j === i ? { ...x, text: v } : x)
                                                }), 'roeOfof')}
                                                multiline
                                                placeholder='Rule description...'
                                                rows={2}
                                            />
                                            {!readOnly && (
                                                <button type='button'
                                                    onClick={() => update<typeof data.roeOfof>(r => ({
                                                        ...r,
                                                        customRules: (r?.customRules ?? []).filter((_, j) => j !== i)
                                                    }), 'roeOfof')}
                                                    style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(200,40,40,0.1)', border: '1px solid rgba(200,40,40,0.25)', color: 'rgba(200,40,40,0.6)', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 2 }}
                                                    title='Remove custom rule'
                                                >
                                                    <Close style={{ fontSize: 12 }} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {!readOnly && (
                                <button type='button'
                                    onClick={() => update<typeof data.roeOfof>(r => ({
                                        ...r,
                                        customRules: [...(r?.customRules ?? []), newCustomRule()]
                                    }), 'roeOfof')}
                                    style={{ alignSelf: 'flex-start', padding: '5px 14px', background: 'transparent', border: `1px dashed ${stateColor}55`, color: stateColor + '88', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                                >+ Add Custom Rule</button>
                            )}
                        </div>
                    </div>
                )
            }

            // ── 13: Command & Signals ─────────────────────────────────────
            case 13: {
                const commsMode = data.commandSignals?.commsCardMode ?? 'image'
                const commsGroups = data.commandSignals?.commsCard?.groups ?? []
                const upd = (fn: (c: typeof data.commandSignals) => typeof data.commandSignals) =>
                    update<typeof data.commandSignals>(fn, 'commandSignals')

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <SlideHeader slideIndex={13} />
                        <Field label='Order of Seniority'        value={data.commandSignals?.orderOfSeniority}      onChange={v => upd(c => ({ ...c, orderOfSeniority: v }))}      multiline placeholder='Chain of succession if command is lost...' />
                        <Field label='Primary / Alternate Comms' value={data.commandSignals?.primaryAlternateComms} onChange={v => upd(c => ({ ...c, primaryAlternateComms: v }))} multiline placeholder='Frequencies, callsigns, fallback method...' />
                        <Field label='Command'                   value={data.commandSignals?.command}               onChange={v => upd(c => ({ ...c, command: v }))}               multiline placeholder='Chain of command, CP location...' />

                        {/* Comms card section */}
                        <div style={{ border: '1px solid rgba(255,255,255,0.07)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>Comms Card</div>
                                {!readOnly && (
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {(['image', 'custom'] as const).map(mode => (
                                            <button key={mode} type='button'
                                                onClick={() => upd(c => ({ ...c, commsCardMode: mode }))}
                                                style={{ padding: '4px 12px', background: commsMode === mode ? tc(0.15) : 'transparent', border: `1px solid ${commsMode === mode ? tc(0.4) : 'rgba(255,255,255,0.12)'}`, color: commsMode === mode ? tc(0.9) : 'rgba(237,237,237,0.4)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                                            >{mode === 'image' ? 'Image Upload' : 'Custom Card'}</button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {commsMode === 'image' ? (
                                <ImageSlot label='Comms Card Image' value={data.commandSignals?.commsCardPath}
                                    onUpload={url => upd(c => ({ ...c, commsCardPath: url }))}
                                    onClear={() => upd(c => ({ ...c, commsCardPath: undefined }))} />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {commsGroups.map((group, gi) => (
                                        <div key={group.id} style={{ border: `1px solid ${group.color ? group.color + '40' : 'rgba(255,255,255,0.06)'}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {/* Group name row with color picker */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, paddingBottom: 6, borderBottom: `1px solid ${group.color ? group.color + '30' : 'rgba(255,255,255,0.06)'}` }}>
                                                {!readOnly && (
                                                    <input type='color'
                                                        value={group.color || '#c62828'}
                                                        onChange={e => upd(c => ({ ...c, commsCard: { ...(c?.commsCard ?? {}), groups: (c?.commsCard?.groups ?? []).map((g, i) => i === gi ? { ...g, color: e.target.value } : g) } }))}
                                                        style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
                                                        title='Group colour'
                                                    />
                                                )}
                                                <input type='text' value={group.groupName} disabled={readOnly}
                                                    placeholder='Group name (e.g. 1-1 Platoon)'
                                                    onChange={e => upd(c => ({ ...c, commsCard: { ...(c?.commsCard ?? {}), groups: (c?.commsCard?.groups ?? []).map((g, i) => i === gi ? { ...g, groupName: e.target.value } : g) } }))}
                                                    style={{ flex: 1, background: 'rgba(0,0,0,0.35)', border: 'none', borderBottom: `1px solid ${group.color ? group.color + '60' : tc(0.3)}`, color: group.color || tc(0.9), fontSize: '0.72rem', fontWeight: 700, outline: 'none', padding: '3px 0', fontFamily: 'monospace', letterSpacing: '0.06em' }}
                                                />
                                                {!readOnly && commsGroups.length > 1 && (
                                                    <button type='button'
                                                        onClick={() => upd(c => ({ ...c, commsCard: { ...(c?.commsCard ?? {}), groups: (c?.commsCard?.groups ?? []).filter((_, i) => i !== gi) } }))}
                                                        style={{ padding: '2px 8px', background: 'rgba(200,40,40,0.1)', border: '1px solid rgba(200,40,40,0.25)', color: 'rgba(200,40,40,0.6)', fontSize: '0.56rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                                                    >Remove</button>
                                                )}
                                            </div>
                                            {/* Column headers — inside the group so they align with inputs */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,0.83fr) minmax(0,0.83fr) minmax(0,0.83fr) minmax(0,0.83fr) 28px', gap: 6, marginBottom: 2 }}>
                                                {['Callsign', 'SR Prim', 'SR Alt', 'LR Prim', 'LR Alt', ''].map((h, i) => (
                                                    <div key={i} style={{ fontSize: '0.46rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)', fontFamily: 'monospace' }}>{h}</div>
                                                ))}
                                            </div>
                                            {group.entries.map((entry, ei) => (
                                                <div key={ei} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,0.83fr) minmax(0,0.83fr) minmax(0,0.83fr) minmax(0,0.83fr) 28px', gap: 6 }}>
                                                    {(['callsign', 'srPrim', 'srAlt', 'lrPrim', 'lrAlt'] as const).map(field => (
                                                        <input key={field} type='text'
                                                            value={(entry[field] ?? '') as string}
                                                            disabled={readOnly}
                                                            placeholder={field === 'callsign' ? '1-1-0' : '00.0'}
                                                            onChange={e => upd(c => ({ ...c, commsCard: { ...(c?.commsCard ?? {}), groups: (c?.commsCard?.groups ?? []).map((g, i) => i === gi ? { ...g, entries: g.entries.map((ent, j) => j === ei ? { ...ent, [field]: e.target.value } : ent) } : g) } }))}
                                                            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(237,237,237,0.8)', fontSize: '0.72rem', padding: '4px 6px', outline: 'none', fontFamily: 'monospace', minWidth: 0, width: '100%', boxSizing: 'border-box' }}
                                                        />
                                                    ))}
                                                    {!readOnly ? (
                                                        <button type='button' disabled={group.entries.length <= 1}
                                                            onClick={() => upd(c => ({ ...c, commsCard: { ...(c?.commsCard ?? {}), groups: (c?.commsCard?.groups ?? []).map((g, i) => i === gi ? { ...g, entries: g.entries.filter((_, j) => j !== ei) } : g) } }))}
                                                            style={{ background: 'rgba(200,40,40,0.08)', border: '1px solid rgba(200,40,40,0.2)', color: group.entries.length <= 1 ? 'rgba(200,40,40,0.2)' : 'rgba(200,40,40,0.6)', cursor: group.entries.length <= 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                                        ><Remove style={{ fontSize: 13 }} /></button>
                                                    ) : <div />}
                                                </div>
                                            ))}
                                            {!readOnly && (
                                                <button type='button'
                                                    onClick={() => upd(c => ({ ...c, commsCard: { ...(c?.commsCard ?? {}), groups: (c?.commsCard?.groups ?? []).map((g, i) => i === gi ? { ...g, entries: [...g.entries, newCommsEntry()] } : g) } }))}
                                                    style={{ alignSelf: 'flex-start', marginTop: 4, padding: '3px 10px', background: 'transparent', border: `1px dashed ${tc(0.25)}`, color: tc(0.5), fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                                                >+ Add Callsign</button>
                                            )}
                                        </div>
                                    ))}

                                    {!readOnly && (
                                        <button type='button'
                                            onClick={() => upd(c => ({ ...c, commsCard: { ...(c?.commsCard ?? {}), groups: [...(c?.commsCard?.groups ?? []), newCommsGroup()] } }))}
                                            style={{ alignSelf: 'flex-start', padding: '5px 14px', background: 'transparent', border: `1px dashed ${tc(0.3)}`, color: tc(0.55), fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                                        >+ Add Group</button>
                                    )}

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12 }}>
                                        <Field label='Support Frequencies'
                                            value={data.commandSignals?.commsCard?.supportFrequencies}
                                            onChange={v => upd(c => ({ ...c, commsCard: { ...(c?.commsCard ?? {}), supportFrequencies: v || undefined } }))}
                                            multiline rows={3} placeholder={'IDF (Golf): 68.5\nCAS (Hotel): 69.5'} />
                                        <Field label='Convoy Frequencies'
                                            value={data.commandSignals?.commsCard?.convoyFrequencies}
                                            onChange={v => upd(c => ({ ...c, commsCard: { ...(c?.commsCard ?? {}), convoyFrequencies: v || undefined } }))}
                                            multiline rows={3} placeholder={'First Convoy: 71.0\nSecond Convoy: 72.0'} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <ImageSlot label='FOB / Deployment Location Image' value={data.commandSignals?.fobImagePath}
                            onUpload={url => upd(c => ({ ...c, fobImagePath: url }))}
                            onClear={() => upd(c => ({ ...c, fobImagePath: undefined }))} />
                    </div>
                )
            }

            // ── 14: Closing ───────────────────────────────────────────────
            case 14: return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <SlideHeader slideIndex={14} />
                    <Field label='POC Name'     value={data.closing?.pocName}     onChange={v => update<typeof data.closing>(c => ({ ...c, pocName: v }),     'closing')} placeholder='e.g. LT SMITH' />
                    <Field label='POC Callsign' value={data.closing?.pocCallsign} onChange={v => update<typeof data.closing>(c => ({ ...c, pocCallsign: v }), 'closing')} placeholder='e.g. GHOST-6' />
                </div>
            )

            default: return null
        }
    }

    // ── Loading state ──────────────────────────────────────────────────────
    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: 'rgba(237,237,237,0.35)', fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Loading Intel Package...
            </div>
        )
    }

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <EditorContext.Provider value={{ readOnly, tc, uploadImage }}>
            <div style={{ display: 'flex', gap: 0, minHeight: 400, border: '1px solid rgba(255,255,255,0.07)' }}>

                {/* Slide Navigator */}
                <div style={{ width: 180, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)' }}>
                    <div style={{ padding: '12px 14px 8px', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)', fontFamily: 'monospace', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        SLIDES
                    </div>
                    {SLIDE_NAMES.map((name, i) => {
                        const isActive = i === activeSlide
                        return (
                            <button
                                key={i}
                                type='button'
                                onClick={() => setActiveSlide(i)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', textAlign: 'left',
                                    background:  isActive ? tc(0.1)              : 'transparent',
                                    borderLeft:  isActive ? `2px solid ${tc(0.8)}` : '2px solid transparent',
                                    borderTop: 'none', borderRight: 'none', borderBottom: '1px solid rgba(255,255,255,0.03)',
                                    cursor: 'pointer', transition: 'all 0.1s',
                                }}
                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                            >
                                <span style={{ fontSize: '0.55rem', fontFamily: 'monospace', color: isActive ? tc(0.7) : 'rgba(237,237,237,0.2)', flexShrink: 0, width: 16 }}>
                                    {String(i + 1).padStart(2, '0')}
                                </span>
                                <span style={{ fontSize: '0.68rem', fontWeight: isActive ? 700 : 400, color: isActive ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.4)', lineHeight: 1.3, letterSpacing: '0.02em' }}>
                                    {name}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Slide Form */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    {/* Header bar */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)', fontFamily: 'monospace' }}>
                            CLASSIFIED // ASOT INTERNAL USE ONLY
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {saveStatus === 'saving' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />}
                            {saveStatus === 'saved'  && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />}
                            {saveStatus === 'error'  && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#c62828' }} />}
                            <span style={{ fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: saveStatus === 'saving' ? '#f59e0b' : saveStatus === 'error' ? '#c62828' : 'rgba(237,237,237,0.3)' }}>
                                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Save Failed' : 'Saved'}
                            </span>
                        </div>
                    </div>

                    {/* Form content */}
                    <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>
                        {renderSlide(activeSlide)}
                    </div>

                    {/* Navigation footer */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)', flexShrink: 0 }}>
                        <button type='button' onClick={() => setActiveSlide(s => Math.max(0, s - 1))} disabled={activeSlide === 0}
                            style={{ padding: '5px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: activeSlide === 0 ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.55)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: activeSlide === 0 ? 'not-allowed' : 'pointer' }}
                        >Prev</button>
                        <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.1em' }}>
                            SLIDE {activeSlide + 1} / 15
                        </span>
                        <button type='button' onClick={() => setActiveSlide(s => Math.min(14, s + 1))} disabled={activeSlide === 14}
                            style={{ padding: '5px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: activeSlide === 14 ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.55)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: activeSlide === 14 ? 'not-allowed' : 'pointer' }}
                        >Next</button>
                    </div>
                </div>
            </div>
        </EditorContext.Provider>
    )
}
