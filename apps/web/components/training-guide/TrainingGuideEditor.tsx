'use client'

import { useState, useCallback, useRef, useEffect, useId, ChangeEvent, forwardRef, useImperativeHandle } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'

// ─── Palette ─────────────────────────────────────────────────────────────────
const DARK_BG        = 'rgba(255,255,255,0.09)'
const DARK_BG_ALT    = 'rgba(255,255,255,0.05)'
const TEXT_PRIMARY   = 'rgba(237,237,237,0.88)'
const TEXT_SECONDARY = 'rgba(237,237,237,0.48)'
const TEXT_MUTED     = 'rgba(237,237,237,0.25)'
const BORDER         = 'rgba(255,255,255,0.08)'
const FAULT_RED      = '#8a1f1f'
const DEFAULT_RED    = '#db001d'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function uid() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function blankPoint(): TrainingGuideTeachingPoint {
    return { id: uid(), title: '', dotPoints: [{ id: uid(), text: '' }], image: null, images: [], vitalPoints: [], commonFaults: [] }
}
function blankEquipment(): TrainingGuideEquipmentItem { return { id: uid(), text: '' } }

function migrateImages(tp: TrainingGuideTeachingPoint): TrainingGuideImage[] {
    if (tp.images && tp.images.length > 0) return tp.images
    if (tp.image?.url) return [{ id: uid(), url: tp.image.url, caption: tp.image.caption, width: 200, border: { enabled: false, color: '#ffffff', thickness: 2 } }]
    return []
}

// ─── SVG hatch ───────────────────────────────────────────────────────────────
function HatchPattern({ id }: { id: string }) {
    return (
        <defs>
            <pattern id={id} patternUnits='userSpaceOnUse' width='10' height='10' patternTransform='rotate(45)'>
                <line x1='0' y1='0' x2='0' y2='10' stroke='rgba(255,255,255,0.08)' strokeWidth='1.5' />
            </pattern>
        </defs>
    )
}

// ─── Auto-resizing textarea ──────────────────────────────────────────────────
function AutoTextarea({ value, onChange, placeholder, disabled, style, minRows = 1 }: {
    value: string; onChange?: (v: string) => void; placeholder?: string
    disabled?: boolean; style?: React.CSSProperties; minRows?: number
}) {
    const ref = useRef<HTMLTextAreaElement>(null)
    useEffect(() => {
        if (!ref.current) return
        ref.current.style.height = '0'
        ref.current.style.height = ref.current.scrollHeight + 'px'
    }, [value])
    return (
        <textarea ref={ref} value={value} placeholder={disabled ? '' : placeholder} disabled={disabled} rows={minRows}
            onChange={e => onChange?.(e.target.value)}
            style={{ background: 'transparent', border: 'none', resize: 'none', font: 'inherit', color: 'inherit', width: '100%', outline: 'none', padding: 0, margin: 0, overflow: 'hidden', lineHeight: 'inherit', display: 'block', ...style }} />
    )
}

function EditInput({ value, onChange, placeholder, disabled, style }: {
    value: string; onChange?: (v: string) => void; placeholder?: string
    disabled?: boolean; style?: React.CSSProperties
}) {
    return (
        <input type='text' value={value} placeholder={disabled ? '' : placeholder} disabled={disabled}
            onChange={e => onChange?.(e.target.value)}
            style={{ background: 'transparent', border: 'none', font: 'inherit', color: 'inherit', width: '100%', outline: 'none', padding: 0, margin: 0, lineHeight: 'inherit', ...style }} />
    )
}

// ─── Corner bracket ──────────────────────────────────────────────────────────
function CornerBracket({ color, style }: { color: string; style?: React.CSSProperties }) {
    return (
        <div style={{ position: 'absolute', width: 14, height: 14, borderColor: color, borderStyle: 'solid', borderWidth: 0, ...style }} />
    )
}

// ─── Accent header strip ─────────────────────────────────────────────────────
function AccentHeader({ label, accent }: { label: string; accent: string }) {
    return (
        <div style={{ background: accent, color: '#fff', padding: '5px 14px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: "'Oswald', Arial, sans-serif" }}>
            {label}
        </div>
    )
}

// ─── Inline image controls (shown below a selected image) ────────────────────
function InlineImageControls({ img, accent, onUpdate, onDelete, onClose }: {
    img: TrainingGuideImage
    accent: string
    onUpdate: (patch: Partial<TrainingGuideImage>) => void
    onDelete: () => void
    onClose: () => void
}) {
    const border = img.border ?? { enabled: false, color: '#ffffff', thickness: 2 }
    const pos    = img.position ?? 'full'
    return (
        <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
            style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(10,10,10,0.92)', border: `1px solid ${BORDER}`, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: '0.7rem', color: TEXT_SECONDARY, userSelect: 'none', minWidth: 260 }}>

            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                <span style={{ fontSize: '0.58rem', color: TEXT_MUTED, marginRight: 2 }}>Wrap</span>
                {([
                    { val: 'left',  label: '← L'    },
                    { val: 'full',  label: '■ Block' },
                    { val: 'right', label: 'R →'     },
                    { val: 'free',  label: '✥ Free'  },
                ] as { val: 'left' | 'full' | 'right' | 'free'; label: string }[]).map(({ val, label }) => (
                    <button key={val} onClick={() => onUpdate({ position: val, ...(val === 'free' && img.x === undefined ? { x: 20, y: 20 } : {}) })}
                        style={{ fontSize: '0.6rem', padding: '2px 7px', background: pos === val ? `${accent}18` : 'transparent', border: `1px solid ${pos === val ? accent + '80' : BORDER}`, color: pos === val ? accent : TEXT_MUTED, cursor: 'pointer', fontWeight: pos === val ? 700 : 400 }}>
                        {label}
                    </button>
                ))}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none' }}>
                <input type='checkbox' checked={border.enabled} onChange={e => onUpdate({ border: { ...border, enabled: e.target.checked } })} style={{ cursor: 'pointer', accentColor: DEFAULT_RED }} />
                Border
            </label>
            {border.enabled && (
                <>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Colour <input type='color' value={border.color} onChange={e => onUpdate({ border: { ...border, color: e.target.value } })} style={{ width: 24, height: 20, border: 'none', padding: 0, background: 'none', cursor: 'pointer' }} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Thick <input type='number' min={1} max={20} value={border.thickness} onChange={e => onUpdate({ border: { ...border, thickness: Math.max(1, Number(e.target.value)) } })}
                            style={{ width: 36, background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, color: TEXT_PRIMARY, padding: '2px 4px', fontSize: '0.7rem', outline: 'none' }} />px
                    </label>
                </>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type='text' value={img.caption ?? ''} onChange={e => onUpdate({ caption: e.target.value })} placeholder='Caption…'
                    style={{ width: 120, background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, color: TEXT_PRIMARY, padding: '2px 6px', fontSize: '0.7rem', outline: 'none' }} />
            </label>

            <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(219,0,29,0.65)', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.7rem', padding: 0, marginLeft: 'auto' }}>
                <DeleteOutlineIcon sx={{ fontSize: 14 }} /> Remove
            </button>

            <button onClick={onClose} title='Close'
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUTED, fontSize: '0.85rem', lineHeight: 1, padding: '0 2px', marginLeft: 4 }}>
                ✕
            </button>
        </div>
    )
}

// ─── Shared button styles ────────────────────────────────────────────────────
const addBtnSx: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: TEXT_SECONDARY, padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }
const delBtnSx: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(219,0,29,0.5)', padding: '1px', flexShrink: 0, display: 'flex', alignItems: 'center' }

// ─── Imperative handle ───────────────────────────────────────────────────────
export interface TrainingGuideEditorHandle {
    addFreeImage(url: string): void
}

// ─── Props ──────────────────────────────────────────────────────────────────
interface Props {
    guide:        TrainingGuide
    guideId:      string
    isEditable:   boolean
    accentColor:  string
    outlineColor: string
    onSaved?:     (version: string) => void
    hideDocRef?:  boolean
}

// ─── Main component ──────────────────────────────────────────────────────────
const TrainingGuideEditor = forwardRef<TrainingGuideEditorHandle, Props>(function TrainingGuideEditor({ guide: initialGuide, guideId, isEditable, accentColor, outlineColor, onSaved, hideDocRef }, ref) {
    const [title,                   setTitle]                   = useState(initialGuide.title)
    const [duration,                setDuration]                = useState(initialGuide.duration)
    const [overview,                setOverview]                = useState(initialGuide.overview)
    const [equipment,               setEquipment]               = useState<TrainingGuideEquipmentItem[]>(initialGuide.equipment)
    const [trainingAreaDescription, setTrainingAreaDescription] = useState(initialGuide.trainingAreaDescription)
    const [teachingPoints,          setTeachingPoints]          = useState<TrainingGuideTeachingPoint[]>(
        initialGuide.teachingPoints.map(tp => ({ ...tp, images: migrateImages(tp) }))
    )
    const [notes,       setNotes]       = useState(initialGuide.notes)
    const [version,     setVersion]     = useState(initialGuide.version)
    const [lastRevised, setLastRevised] = useState(initialGuide.lastRevisedAt)
    const [saving,  setSaving]  = useState(false)
    const [saveMsg, setSaveMsg] = useState('')

    const timerRef   = useRef<NodeJS.Timeout | null>(null)
    const prevAccRef = useRef(accentColor)
    const prevOutRef = useRef(outlineColor)
    const stateRef   = useRef({ title, accentColor, outlineColor, duration, overview, equipment, trainingAreaDescription, teachingPoints, notes, version })
    const hatchId    = useId().replace(/:/g, '')

    useEffect(() => {
        stateRef.current = { title, accentColor, outlineColor, duration, overview, equipment, trainingAreaDescription, teachingPoints, notes, version }
    })

    const doSaveRef = useRef<() => void>(() => {})

    const scheduleSave = useCallback(() => {
        if (!isEditable) return
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => doSaveRef.current(), 2500)
    }, [isEditable])

    const doSave = useCallback(async () => {
        const s = stateRef.current
        setSaving(true)
        try {
            const res = await fetch(`/api/training-guides/${guideId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: s.title, accentColor: s.accentColor, outlineColor: s.outlineColor,
                    duration: s.duration, overview: s.overview, equipment: s.equipment,
                    trainingAreaDescription: s.trainingAreaDescription, teachingPoints: s.teachingPoints, notes: s.notes,
                }),
            })
            if (res.ok) {
                const { version: v } = await res.json()
                setVersion(v); setLastRevised(new Date())
                setSaveMsg(`Saved · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
                onSaved?.(v)
            }
        } finally { setSaving(false) }
    }, [guideId, onSaved])

    useEffect(() => { doSaveRef.current = doSave }, [doSave])

    // Save when controlled color props change
    useEffect(() => {
        const accChanged = prevAccRef.current !== accentColor
        const outChanged = prevOutRef.current !== outlineColor
        prevAccRef.current = accentColor
        prevOutRef.current = outlineColor
        if (accChanged || outChanged) scheduleSave()
    }, [accentColor, outlineColor, scheduleSave])

    // Expose addFreeImage for the sidebar upload button
    useImperativeHandle(ref, () => ({
        addFreeImage(url: string) {
            const newImg: TrainingGuideImage = {
                id: uid(), url, caption: '', width: 200,
                position: 'free', x: 250, y: 60,
                border: { enabled: false, color: '#ffffff', thickness: 2 },
            }
            setTeachingPoints(prev => {
                if (prev.length === 0) { const tp = blankPoint(); tp.images = [newImg]; return [tp] }
                return prev.map((tp, i) => i === 0 ? { ...tp, images: [...(tp.images ?? []), newImg] } : tp)
            })
            scheduleSave()
        },
    }), [scheduleSave])

    const updateTP = useCallback((idx: number, patch: Partial<TrainingGuideTeachingPoint>) => {
        setTeachingPoints(prev => prev.map((tp, i) => i === idx ? { ...tp, ...patch } : tp))
        scheduleSave()
    }, [scheduleSave])

    const revDate = new Date(lastRevised).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })

    return (
        <div style={{ fontFamily: "'Oswald', Arial, sans-serif", color: TEXT_PRIMARY, position: 'relative' }}>
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap');`}</style>

            {/* Save status */}
            {isEditable && (saving || saveMsg) && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 0 10px', fontFamily: 'Arial, sans-serif' }}>
                    {saving && <span style={{ fontSize: '0.62rem', color: TEXT_MUTED }}>Saving…</span>}
                    {!saving && saveMsg && <span style={{ fontSize: '0.62rem', color: TEXT_MUTED }}>{saveMsg}</span>}
                </div>
            )}

            {/* ── HEADER ─────────────────────────────────────────────────── */}
            <div style={{ background: accentColor, padding: '22px 28px 20px', marginBottom: 20, color: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ flex: 1, fontFamily: "'Oswald', Arial, sans-serif", fontSize: 26, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.15 }}>
                        <EditInput value={title} onChange={v => { setTitle(v); scheduleSave() }} placeholder='Session / Skill Name' disabled={!isEditable}
                            style={{ fontSize: 26, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#fff', fontFamily: "'Oswald', Arial, sans-serif" }} />
                    </div>
                    {!hideDocRef && (
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '0.6rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', fontFamily: "'Oswald', Arial, sans-serif" }}>DOC. REF</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.9)', fontFamily: 'monospace' }}>{initialGuide.docRef}</div>
                        </div>
                    )}
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', margin: '14px 0 12px' }} />
                <div style={{ display: 'flex', gap: 40 }}>
                    <div>
                        <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', fontFamily: "'Oswald', Arial, sans-serif", marginBottom: 2 }}>Last Revision</div>
                        <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', fontFamily: 'Arial, sans-serif' }}>{revDate}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', fontFamily: "'Oswald', Arial, sans-serif", marginBottom: 2 }}>Duration</div>
                        <EditInput value={duration} onChange={v => { setDuration(v); scheduleSave() }} placeholder='e.g. 45 min' disabled={!isEditable}
                            style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', fontFamily: 'Arial, sans-serif' }} />
                    </div>
                    <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
                        <span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>v{version}</span>
                    </div>
                </div>
            </div>

            {/* ── OVERVIEW ────────────────────────────────────────────────── */}
            <div style={{ border: `1px solid ${outlineColor}50`, marginBottom: 20 }}>
                <AccentHeader label='Overview &amp; Objective' accent={accentColor} />
                <div style={{ padding: '14px 16px', background: DARK_BG, fontFamily: 'Arial, sans-serif', fontSize: '0.88rem', lineHeight: 1.6, color: TEXT_PRIMARY }}>
                    <AutoTextarea value={overview} onChange={v => { setOverview(v); scheduleSave() }} placeholder='Provide a brief overview of this training session and its learning objectives.' disabled={!isEditable} minRows={3} style={{ fontSize: '0.88rem', lineHeight: 1.6, fontFamily: 'Arial, sans-serif', color: TEXT_PRIMARY }} />
                </div>
            </div>

            {/* ── EQUIPMENT + TRAINING AREA ───────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
                <div style={{ border: `1px solid ${outlineColor}50` }}>
                    <div style={{ padding: '6px 14px', borderBottom: `1px solid ${outlineColor}30` }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: outlineColor, fontFamily: "'Oswald', Arial, sans-serif" }}>Required Equipment</span>
                    </div>
                    <div style={{ padding: '12px 16px', background: DARK_BG, fontFamily: 'Arial, sans-serif' }}>
                        {equipment.map((item, i) => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                                <div style={{ width: 14, height: 14, border: `1.5px solid ${outlineColor}80`, borderRadius: 2, flexShrink: 0 }} />
                                <div style={{ flex: 1, fontSize: '0.84rem', color: TEXT_PRIMARY }}>
                                    <EditInput value={item.text} onChange={v => { setEquipment(prev => prev.map((e, idx) => idx === i ? { ...e, text: v } : e)); scheduleSave() }} placeholder='Equipment item' disabled={!isEditable} style={{ fontSize: '0.84rem' }} />
                                </div>
                                {isEditable && <button onClick={() => { setEquipment(prev => prev.filter((_, idx) => idx !== i)); scheduleSave() }} style={delBtnSx}><DeleteOutlineIcon sx={{ fontSize: 14 }} /></button>}
                            </div>
                        ))}
                        {isEditable && <button onClick={() => { setEquipment(prev => [...prev, blankEquipment()]); scheduleSave() }} style={addBtnSx}><AddIcon sx={{ fontSize: 12 }} /> Add item</button>}
                        {!isEditable && equipment.length === 0 && <span style={{ fontSize: '0.8rem', color: TEXT_MUTED }}>No equipment listed.</span>}
                    </div>
                </div>

                <div style={{ border: `1px solid ${outlineColor}50` }}>
                    <div style={{ padding: '6px 14px', borderBottom: `1px solid ${outlineColor}30` }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: outlineColor, fontFamily: "'Oswald', Arial, sans-serif" }}>Training Area / Setup</span>
                    </div>
                    <div style={{ padding: '12px 16px', background: DARK_BG, fontFamily: 'Arial, sans-serif', fontSize: '0.84rem', lineHeight: 1.55 }}>
                        <AutoTextarea value={trainingAreaDescription} onChange={v => { setTrainingAreaDescription(v); scheduleSave() }} placeholder='Describe the training area layout and setup requirements.' disabled={!isEditable} minRows={2} style={{ fontSize: '0.84rem', lineHeight: 1.55, fontFamily: 'Arial, sans-serif', color: TEXT_PRIMARY, marginBottom: 10 }} />
                        <svg width='100%' height='110' xmlns='http://www.w3.org/2000/svg'>
                            <HatchPattern id={`${hatchId}-area`} />
                            <rect width='100%' height='110' fill={`url(#${hatchId}-area)`} stroke={BORDER} strokeWidth='1' />
                            <text x='50%' y='58' textAnchor='middle' fill={TEXT_MUTED} fontSize='11' fontFamily='Arial'>Training Area Diagram</text>
                        </svg>
                    </div>
                </div>
            </div>

            {/* ── SESSION CONTENT ─────────────────────────────────────────── */}
            <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontFamily: "'Oswald', Arial, sans-serif", fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: outlineColor, margin: 0, paddingBottom: 8, borderBottom: `2px solid ${outlineColor}` }}>
                    Session Content
                </h2>
            </div>

            {/* ── TEACHING POINTS ─────────────────────────────────────────── */}
            {teachingPoints.map((tp, tpIdx) => (
                <TeachingPointBlock key={tp.id} tp={tp} index={tpIdx} accent={accentColor} outline={outlineColor} isEditable={isEditable}
                    onUpdate={patch => updateTP(tpIdx, patch)}
                    onRemove={() => { setTeachingPoints(prev => prev.filter((_, i) => i !== tpIdx)); scheduleSave() }}
                    scheduleSave={scheduleSave}
                />
            ))}
            {isEditable && (
                <button onClick={() => { setTeachingPoints(prev => [...prev, blankPoint()]); scheduleSave() }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: `1.5px dashed ${accentColor}60`, cursor: 'pointer', padding: '10px 20px', color: accentColor, fontFamily: "'Oswald', Arial, sans-serif", fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', width: '100%', justifyContent: 'center', marginBottom: 24 }}>
                    <AddIcon sx={{ fontSize: 16 }} /> Add Teaching Point
                </button>
            )}


            {/* ── NOTES ───────────────────────────────────────────────────── */}
            <div style={{ border: `1px solid ${outlineColor}50`, marginBottom: 32 }}>
                <AccentHeader label='Notes / Observations' accent={accentColor} />
                <div style={{ padding: '14px 16px', background: DARK_BG, fontFamily: 'Arial, sans-serif', fontSize: '0.88rem', lineHeight: 1.6 }}>
                    <AutoTextarea value={notes} onChange={v => { setNotes(v); scheduleSave() }} placeholder='Add session notes or observations here.' disabled={!isEditable} minRows={4} style={{ fontSize: '0.88rem', lineHeight: 1.6, fontFamily: 'Arial, sans-serif', color: TEXT_PRIMARY }} />
                    {!isEditable && [...Array(4)].map((_, i) => <div key={i} style={{ borderBottom: `1px solid ${BORDER}`, marginBottom: 18, height: 20 }} />)}
                </div>
            </div>
        </div>
    )
})

export default TrainingGuideEditor

// ─── Teaching Point block ────────────────────────────────────────────────────
function TeachingPointBlock({ tp, index, accent, outline, isEditable, onUpdate, onRemove, scheduleSave }: {
    tp: TrainingGuideTeachingPoint; index: number; accent: string; outline: string; isEditable: boolean
    onUpdate: (patch: Partial<TrainingGuideTeachingPoint>) => void; onRemove: () => void; scheduleSave: () => void
}) {
    const [selectedImgId, setSelectedImgId] = useState<string | null>(null)
    const [uploading,     setUploading]     = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const images    = tp.images ?? []
    const freeImgs  = images.filter(img => img.position === 'free')
    const floatImgs = images.filter(img => img.position === 'left' || img.position === 'right')
    const blockImgs = images.filter(img => !img.position || img.position === 'full')

    const updateImage = (id: string, patch: Partial<TrainingGuideImage>) => {
        onUpdate({ images: images.map(img => img.id === id ? { ...img, ...patch } : img) })
        scheduleSave()
    }

    const deleteImage = (id: string) => {
        onUpdate({ images: images.filter(img => img.id !== id) })
        if (selectedImgId === id) setSelectedImgId(null)
        scheduleSave()
    }

    const uploadFile = async (file: File) => {
        if (!file.type.startsWith('image/')) return
        setUploading(true)
        const fd = new FormData()
        fd.append('file', file)
        try {
            const res = await fetch('/api/training-guides/image', { method: 'POST', body: fd })
            if (res.ok) {
                const { url } = await res.json()
                const newId  = uid()
                const newImg: TrainingGuideImage = { id: newId, url, caption: '', width: 200, position: 'free', x: 250, y: 60, border: { enabled: false, color: '#ffffff', thickness: 2 } }
                onUpdate({ images: [...images, newImg] })
                scheduleSave()
                setSelectedImgId(newId)
            }
        } finally { setUploading(false) }
    }

    const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) await uploadFile(file)
        if (inputRef.current) inputRef.current.value = ''
    }

    // Free image drag: DOM manipulation for zero-lag movement, click-vs-drag on mouseup
    function startFreeDrag(e: React.MouseEvent, img: TrainingGuideImage) {
        e.preventDefault(); e.stopPropagation()
        const el = e.currentTarget as HTMLElement
        const ox = img.x ?? 20, oy = img.y ?? 20
        const sx = e.clientX, sy = e.clientY
        let moved = false
        function onMove(ev: MouseEvent) {
            const dx = ev.clientX - sx, dy = ev.clientY - sy
            if (!moved && Math.sqrt(dx * dx + dy * dy) < 4) return
            moved = true
            el.style.left = Math.max(0, ox + dx) + 'px'
            el.style.top  = Math.max(0, oy + dy) + 'px'
        }
        function onUp(ev: MouseEvent) {
            if (moved) {
                onUpdate({ images: images.map(i => i.id === img.id ? { ...i, x: Math.max(0, ox + (ev.clientX - sx)), y: Math.max(0, oy + (ev.clientY - sy)) } : i) })
                scheduleSave()
            } else {
                setSelectedImgId(prev => prev === img.id ? null : img.id)
            }
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup',   onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup',   onUp)
    }

    function startFreeResize(e: React.MouseEvent, img: TrainingGuideImage) {
        e.preventDefault(); e.stopPropagation()
        const sx = e.clientX, sw = img.width ?? 200
        function onMove(ev: MouseEvent) { onUpdate({ images: images.map(i => i.id === img.id ? { ...i, width: Math.max(60, Math.min(700, sw + (ev.clientX - sx))) } : i) }) }
        function onUp() { scheduleSave(); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }

    function startBlockResize(e: React.MouseEvent, img: TrainingGuideImage) {
        e.preventDefault(); e.stopPropagation()
        const sx = e.clientX, sw = img.width ?? 200
        function onMove(ev: MouseEvent) { onUpdate({ images: images.map(i => i.id === img.id ? { ...i, width: Math.max(60, Math.min(700, sw + (ev.clientX - sx))) } : i) }) }
        function onUp() { scheduleSave(); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }

    return (
        <div style={{ border: `1px solid ${outline}30`, marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${outline}20`, background: `${accent}10` }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: accent, color: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Oswald', Arial, sans-serif", fontWeight: 700, fontSize: '0.88rem' }}>{index + 1}</div>
                <div style={{ flex: 1, fontFamily: "'Oswald', Arial, sans-serif", fontSize: '1rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT_PRIMARY }}>
                    <EditInput value={tp.title} onChange={v => onUpdate({ title: v })} placeholder='Teaching Point Title' disabled={!isEditable}
                        style={{ fontFamily: "'Oswald', Arial, sans-serif", fontSize: '1rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT_PRIMARY }} />
                </div>
                {isEditable && <button onClick={onRemove} style={{ ...delBtnSx, color: 'rgba(219,0,29,0.6)' }}><DeleteOutlineIcon sx={{ fontSize: 16 }} /></button>}
            </div>

            <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.07)', position: 'relative', minHeight: 60 }}>

                {/* ── Free images — absolutely positioned, drag to move */}
                {freeImgs.map(img => {
                    const border     = img.border ?? { enabled: false, color: '#ffffff', thickness: 2 }
                    const isSelected = selectedImgId === img.id
                    return (
                        <div key={img.id} data-img-block=''
                            onMouseDown={isEditable ? e => startFreeDrag(e, img) : undefined}
                            onClick={e => e.stopPropagation()}
                            style={{ position: 'absolute', left: img.x ?? 20, top: img.y ?? 20, width: img.width ?? 200, zIndex: 10, userSelect: 'none', cursor: isEditable ? 'move' : 'default' }}
                        >
                            <div style={{ position: 'relative', outline: isSelected ? '2px solid rgba(219,0,29,0.7)' : '2px solid transparent', outlineOffset: 2 }}>
                                <img src={img.url} alt={img.caption ?? ''} draggable={false}
                                    style={{ display: 'block', width: '100%', height: 'auto', border: border.enabled ? `${border.thickness}px solid ${border.color}` : 'none', boxShadow: isEditable ? '0 2px 14px rgba(0,0,0,0.55)' : 'none' }} />
                                {isEditable && (
                                    <div onMouseDown={e => startFreeResize(e, img)} title='Drag to resize'
                                        style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, background: 'rgba(219,0,29,0.8)', cursor: 'se-resize', zIndex: 1 }} />
                                )}
                            </div>
                            {img.caption && (
                                <div style={{ marginTop: 4, fontSize: '0.66rem', color: TEXT_SECONDARY, fontStyle: 'italic', textAlign: 'center', fontFamily: 'Arial, sans-serif', lineHeight: 1.4 }}>{img.caption}</div>
                            )}
                            {isEditable && isSelected && (
                                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30 }}>
                                    <InlineImageControls img={img} accent={accent}
                                        onUpdate={patch => updateImage(img.id, patch)}
                                        onDelete={() => deleteImage(img.id)}
                                        onClose={() => setSelectedImgId(null)} />
                                </div>
                            )}
                        </div>
                    )
                })}

                {/* ── Float images — left/right, text wraps around them */}
                {floatImgs.map(img => {
                    const border     = img.border ?? { enabled: false, color: '#ffffff', thickness: 2 }
                    const isLeft     = img.position === 'left'
                    const isSelected = selectedImgId === img.id
                    return (
                        <div key={img.id} data-img-block='' style={{ float: img.position as 'left' | 'right', width: img.width ?? 200, maxWidth: '45%', margin: isLeft ? '2px 18px 10px 0' : '2px 0 10px 18px' }}>
                            <div onClick={isEditable ? e => { e.stopPropagation(); setSelectedImgId(prev => prev === img.id ? null : img.id) } : undefined}
                                style={{ position: 'relative', outline: isSelected ? '2px solid rgba(219,0,29,0.7)' : '2px solid transparent', outlineOffset: 2, cursor: isEditable ? 'pointer' : 'default' }}>
                                <img src={img.url} alt={img.caption ?? ''} draggable={false}
                                    style={{ display: 'block', width: '100%', height: 'auto', border: border.enabled ? `${border.thickness}px solid ${border.color}` : 'none' }} />
                                {isEditable && (
                                    <div onMouseDown={e => startBlockResize(e, img)} title='Drag to resize'
                                        style={{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, background: 'rgba(219,0,29,0.75)', cursor: 'se-resize', zIndex: 1 }} />
                                )}
                            </div>
                            {img.caption && (
                                <div style={{ marginTop: 4, fontSize: '0.66rem', color: TEXT_SECONDARY, fontStyle: 'italic', textAlign: 'center', fontFamily: 'Arial, sans-serif', lineHeight: 1.4 }}>{img.caption}</div>
                            )}
                            {isEditable && isSelected && (
                                <InlineImageControls img={img} accent={accent}
                                    onUpdate={patch => updateImage(img.id, patch)}
                                    onDelete={() => deleteImage(img.id)}
                                    onClose={() => setSelectedImgId(null)} />
                            )}
                        </div>
                    )
                })}

                {/* ── Dot points — flows around any floated images above */}
                <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '0.86rem', lineHeight: 1.6, marginBottom: 12 }}>
                    {tp.dotPoints.map((dp, dpIdx) => (
                        <div key={dp.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                            <span style={{ color: accent, flexShrink: 0, marginTop: 2, fontSize: '0.7rem' }}>●</span>
                            <div style={{ flex: 1 }}>
                                <AutoTextarea value={dp.text} onChange={v => onUpdate({ dotPoints: tp.dotPoints.map((p, i) => i === dpIdx ? { ...p, text: v } : p) })}
                                    placeholder='Dot point' disabled={!isEditable} style={{ fontSize: '0.86rem', fontFamily: 'Arial, sans-serif', color: TEXT_PRIMARY }} />
                            </div>
                            {isEditable && <button onClick={() => onUpdate({ dotPoints: tp.dotPoints.filter((_, i) => i !== dpIdx) })} style={delBtnSx}><DeleteOutlineIcon sx={{ fontSize: 13 }} /></button>}
                        </div>
                    ))}
                    {isEditable && <button onClick={() => onUpdate({ dotPoints: [...tp.dotPoints, { id: uid(), text: '' }] })} style={addBtnSx}><AddIcon sx={{ fontSize: 11 }} /> Add point</button>}
                </div>

                {/* ── Vital Points */}
                {(tp.vitalPoints.length > 0 || isEditable) && (
                    <div style={{ position: 'relative', margin: '16px 0 14px', padding: '12px 16px', background: `${outline}08` }}>
                        <CornerBracket color={outline} style={{ top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 }} />
                        <CornerBracket color={outline} style={{ top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 }} />
                        <CornerBracket color={outline} style={{ bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 }} />
                        <CornerBracket color={outline} style={{ bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <span style={{ color: outline, fontSize: '0.75rem' }}>⚑</span>
                            <span style={{ fontFamily: "'Oswald', Arial, sans-serif", fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: outline }}>Vital Points</span>
                        </div>
                        {tp.vitalPoints.map((vp, vpIdx) => (
                            <div key={vp.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 5, fontFamily: 'Arial, sans-serif', fontSize: '0.84rem' }}>
                                <span style={{ color: outline, flexShrink: 0, marginTop: 2, fontSize: '0.68rem' }}>●</span>
                                <div style={{ flex: 1 }}>
                                    <AutoTextarea value={vp.text} onChange={v => onUpdate({ vitalPoints: tp.vitalPoints.map((p, i) => i === vpIdx ? { ...p, text: v } : p) })}
                                        placeholder='Vital point' disabled={!isEditable} style={{ fontSize: '0.84rem', fontFamily: 'Arial, sans-serif', color: TEXT_PRIMARY }} />
                                </div>
                                {isEditable && <button onClick={() => onUpdate({ vitalPoints: tp.vitalPoints.filter((_, i) => i !== vpIdx) })} style={delBtnSx}><DeleteOutlineIcon sx={{ fontSize: 13 }} /></button>}
                            </div>
                        ))}
                        {isEditable && <button onClick={() => onUpdate({ vitalPoints: [...tp.vitalPoints, { id: uid(), text: '' }] })} style={addBtnSx}><AddIcon sx={{ fontSize: 11 }} /> Add vital point</button>}
                    </div>
                )}

                {/* ── Common Faults */}
                {(tp.commonFaults.length > 0 || isEditable) && (
                    <div style={{ marginTop: 14 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '0.83rem' }}>
                            <thead>
                                <tr style={{ background: FAULT_RED }}>
                                    <th style={{ color: '#fff', fontFamily: "'Oswald', Arial, sans-serif", fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.16em', textTransform: 'uppercase', padding: '6px 12px', textAlign: 'left', width: '40%' }}>Fault</th>
                                    <th style={{ color: '#fff', fontFamily: "'Oswald', Arial, sans-serif", fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.16em', textTransform: 'uppercase', padding: '6px 12px', textAlign: 'left' }}>Correction</th>
                                    {isEditable && <th style={{ width: 28 }} />}
                                </tr>
                            </thead>
                            <tbody>
                                {tp.commonFaults.map((cf, cfIdx) => (
                                    <tr key={cf.id} style={{ background: cfIdx % 2 === 0 ? DARK_BG : DARK_BG_ALT, borderBottom: `1px solid ${BORDER}` }}>
                                        <td style={{ padding: '6px 12px', verticalAlign: 'top', color: TEXT_PRIMARY }}>
                                            <AutoTextarea value={cf.fault} onChange={v => onUpdate({ commonFaults: tp.commonFaults.map((f, i) => i === cfIdx ? { ...f, fault: v } : f) })}
                                                placeholder='Fault description' disabled={!isEditable} style={{ fontSize: '0.83rem', fontFamily: 'Arial, sans-serif', color: TEXT_PRIMARY }} />
                                        </td>
                                        <td style={{ padding: '6px 12px', verticalAlign: 'top', color: TEXT_PRIMARY }}>
                                            <AutoTextarea value={cf.correction} onChange={v => onUpdate({ commonFaults: tp.commonFaults.map((f, i) => i === cfIdx ? { ...f, correction: v } : f) })}
                                                placeholder='Correction' disabled={!isEditable} style={{ fontSize: '0.83rem', fontFamily: 'Arial, sans-serif', color: TEXT_PRIMARY }} />
                                        </td>
                                        {isEditable && <td style={{ padding: '4px 4px 4px 0', verticalAlign: 'middle' }}><button onClick={() => onUpdate({ commonFaults: tp.commonFaults.filter((_, i) => i !== cfIdx) })} style={delBtnSx}><DeleteOutlineIcon sx={{ fontSize: 13 }} /></button></td>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {isEditable && <button onClick={() => onUpdate({ commonFaults: [...tp.commonFaults, { id: uid(), fault: '', correction: '' }] })} style={{ ...addBtnSx, marginTop: 6 }}><AddIcon sx={{ fontSize: 11 }} /> Add fault row</button>}
                    </div>
                )}

                {/* ── Block images + upload button */}
                {(isEditable || blockImgs.length > 0) && (
                    <div style={{ clear: 'both', marginTop: 14 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
                            {blockImgs.map(img => {
                                const border     = img.border ?? { enabled: false, color: '#ffffff', thickness: 2 }
                                const isSelected = selectedImgId === img.id
                                return (
                                    <div key={img.id} data-img-block='' style={{ flexShrink: 0 }}>
                                        <div onClick={isEditable ? e => { e.stopPropagation(); setSelectedImgId(prev => prev === img.id ? null : img.id) } : undefined}
                                            style={{ position: 'relative', width: img.width ?? 200, outline: isSelected ? '2px solid rgba(219,0,29,0.7)' : '2px solid transparent', outlineOffset: 2, cursor: isEditable ? 'pointer' : 'default' }}>
                                            <img src={img.url} alt={img.caption ?? ''} draggable={false}
                                                style={{ display: 'block', width: '100%', height: 'auto', border: border.enabled ? `${border.thickness}px solid ${border.color}` : 'none' }} />
                                            {isEditable && (
                                                <div onMouseDown={e => startBlockResize(e, img)} title='Drag to resize'
                                                    style={{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, background: 'rgba(219,0,29,0.75)', cursor: 'se-resize', zIndex: 1 }} />
                                            )}
                                        </div>
                                        {img.caption && (
                                            <div style={{ width: img.width ?? 200, marginTop: 4, fontSize: '0.66rem', color: TEXT_SECONDARY, fontStyle: 'italic', textAlign: 'center', fontFamily: 'Arial, sans-serif', lineHeight: 1.4 }}>{img.caption}</div>
                                        )}
                                        {isEditable && isSelected && (
                                            <InlineImageControls img={img} accent={accent}
                                                onUpdate={patch => updateImage(img.id, patch)}
                                                onDelete={() => deleteImage(img.id)}
                                                onClose={() => setSelectedImgId(null)} />
                                        )}
                                    </div>
                                )
                            })}

                            {isEditable && (
                                <div
                                    onClick={e => { e.stopPropagation(); if (!uploading) inputRef.current?.click() }}
                                    onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
                                    onDrop={e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f) }}
                                    style={{ width: 110, height: 80, border: `1.5px dashed ${BORDER}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: uploading ? 'default' : 'pointer', color: TEXT_MUTED, opacity: uploading ? 0.5 : 1, flexShrink: 0 }}>
                                    {uploading ? <CloudUploadIcon sx={{ fontSize: 18 }} /> : <AddIcon sx={{ fontSize: 18 }} />}
                                    <span style={{ fontSize: '0.58rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{uploading ? 'Uploading…' : 'Add Image'}</span>
                                </div>
                            )}
                        </div>
                        {isEditable && <input ref={inputRef} type='file' accept='image/*' onChange={handleFile} style={{ display: 'none' }} />}
                    </div>
                )}

                <div style={{ clear: 'both' }} />
            </div>
        </div>
    )
}
