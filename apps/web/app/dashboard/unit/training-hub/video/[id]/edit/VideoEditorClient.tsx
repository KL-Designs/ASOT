'use client'

import { useRef, useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link                from 'next/link'
import ArrowBackIcon       from '@mui/icons-material/ArrowBack'
import PlayArrowIcon       from '@mui/icons-material/PlayArrow'
import PauseIcon           from '@mui/icons-material/Pause'
import Replay10Icon        from '@mui/icons-material/Replay10'
import Forward10Icon       from '@mui/icons-material/Forward10'
import AddIcon             from '@mui/icons-material/Add'
import DeleteOutlineIcon   from '@mui/icons-material/DeleteOutline'
import DragIndicatorIcon   from '@mui/icons-material/DragIndicator'
import AccessTimeIcon      from '@mui/icons-material/AccessTime'
import VolumeUpIcon        from '@mui/icons-material/VolumeUp'
import VolumeOffIcon       from '@mui/icons-material/VolumeOff'
import VisibilityIcon      from '@mui/icons-material/Visibility'

const RED     = '#db001d'
const BG      = '#090909'
const SURFACE = 'rgba(255,255,255,0.025)'
const BORDER  = 'rgba(255,255,255,0.08)'
const TEXT    = 'rgba(237,237,237,0.9)'
const MUTED   = 'rgba(237,237,237,0.4)'

const SECTION_COLORS = [
    '#db001d', '#3b82f6', '#22c55e', '#f59e0b',
    '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
]

function fmtTime(s: number): string {
    if (!isFinite(s) || s < 0) return '0:00'
    const m   = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
}

const inputSx: React.CSSProperties = {
    background:  'rgba(255,255,255,0.05)',
    border:      `1px solid ${BORDER}`,
    color:       TEXT,
    padding:     '7px 10px',
    fontSize:    '0.82rem',
    outline:     'none',
    width:       '100%',
    boxSizing:   'border-box',
    fontFamily:  'inherit',
}

const labelSx: React.CSSProperties = {
    display:       'block',
    fontSize:      '0.52rem',
    fontWeight:    700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color:         MUTED,
    marginBottom:  6,
}

const setCurrentBtn: React.CSSProperties = {
    display:       'flex',
    alignItems:    'center',
    gap:           4,
    padding:       '4px 9px',
    background:    'transparent',
    border:        `1px solid rgba(219,0,29,0.25)`,
    color:         'rgba(219,0,29,0.7)',
    fontSize:      '0.55rem',
    fontWeight:    700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor:        'pointer',
    flexShrink:    0,
}

type SelectedItem = { type: 'section'; id: string } | { type: 'checkpoint'; id: string } | null

type DragState = {
    kind:          'section-start' | 'section-end' | 'checkpoint'
    id:            string
    timelineLeft:  number
    timelineWidth: number
} | null

// ── Helper ──────────────────────────────────────────────────────────────────

function getSectionEnd(sec: TrainingVideoSection, sorted: TrainingVideoSection[], dur: number): number {
    if (sec.endSeconds !== undefined) return sec.endSeconds
    const i = sorted.findIndex(s => s.id === sec.id)
    return sorted[i + 1] ? sorted[i + 1].startSeconds : dur
}

// ── Checkpoint edit form ─────────────────────────────────────────────────────

function CheckpointEditForm({ cp, currentTime, onUpdate, onDelete }: {
    cp: TrainingVideoCheckpoint
    currentTime: number
    onUpdate: (patch: Partial<TrainingVideoCheckpoint>) => void
    onDelete: () => void
}) {
    const [draggingOptIdx, setDraggingOptIdx] = useState<number | null>(null)
    const [dragOverOptIdx, setDragOverOptIdx] = useState<number | null>(null)
    const options = cp.options ?? ['', '', '']

    function updateOption(idx: number, val: string) {
        const opts = [...options]; opts[idx] = val; onUpdate({ options: opts })
    }
    function addOption() { onUpdate({ options: [...options, ''] }) }
    function removeOption(idx: number) {
        const opts = options.filter((_, i) => i !== idx)
        const oldC = cp.correctOptionIndex ?? -1
        const newC = oldC < 0 ? -1 : oldC === idx ? -1 : oldC > idx ? oldC - 1 : oldC
        onUpdate({ options: opts, correctOptionIndex: newC })
    }
    function dropOption(fromIdx: number, toIdx: number) {
        if (fromIdx === toIdx) return
        const newOpts = [...options]
        const [removed] = newOpts.splice(fromIdx, 1)
        const at = Math.min(toIdx, newOpts.length)
        newOpts.splice(at, 0, removed)
        const oldC = cp.correctOptionIndex ?? -1
        let newC = oldC
        if (oldC >= 0) {
            if (oldC === fromIdx) newC = at
            else if (fromIdx < at && oldC > fromIdx && oldC <= at) newC = oldC - 1
            else if (fromIdx > at && oldC >= at && oldC < fromIdx) newC = oldC + 1
        }
        onUpdate({ options: newOpts, correctOptionIndex: newC })
    }

    const noCorrectSelected = (cp.correctOptionIndex ?? -1) < 0

    return (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            <div>
                <label style={labelSx}>Question</label>
                <textarea value={cp.question} onChange={e => onUpdate({ question: e.target.value })} rows={3} autoFocus
                    placeholder='Enter the question…' style={{ ...inputSx, resize: 'vertical' }} />
            </div>

            <div>
                <label style={labelSx}>Answer Type</label>
                <div style={{ display: 'flex', gap: 10 }}>
                    {(['mcq', 'written'] as const).map(t => (
                        <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: '0.72rem', color: cp.type === t ? TEXT : MUTED }}>
                            <input type='radio' name={`cp-type-${cp.id}`} checked={cp.type === t} onChange={() => onUpdate({ type: t })} style={{ accentColor: RED }} />
                            {t === 'mcq' ? 'Multiple Choice' : 'Written Answer'}
                        </label>
                    ))}
                </div>
            </div>

            {cp.type === 'mcq' && (
                <div>
                    <label style={labelSx}>Options — drag to reorder · click radio to mark correct</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {options.map((opt, oi) => {
                            const isCorrect   = !noCorrectSelected && (cp.correctOptionIndex ?? -1) === oi
                            const isDropTarget = dragOverOptIdx === oi && draggingOptIdx !== null && draggingOptIdx !== oi
                            return (
                                <div key={oi}
                                    draggable
                                    onDragStart={() => setDraggingOptIdx(oi)}
                                    onDragOver={e => { e.preventDefault(); setDragOverOptIdx(oi) }}
                                    onDrop={() => { dropOption(draggingOptIdx ?? oi, oi); setDraggingOptIdx(null); setDragOverOptIdx(null) }}
                                    onDragEnd={() => { setDraggingOptIdx(null); setDragOverOptIdx(null) }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', border: `1px solid ${isCorrect ? 'rgba(80,200,120,0.45)' : BORDER}`, background: isCorrect ? 'rgba(80,200,120,0.07)' : 'rgba(255,255,255,0.02)', borderRadius: 2, opacity: draggingOptIdx === oi ? 0.35 : 1, transition: 'opacity 0.12s', boxShadow: isDropTarget ? `inset 0 2px 0 0 ${RED}` : 'none' }}>
                                    <DragIndicatorIcon style={{ fontSize: 14, color: 'rgba(255,255,255,0.18)', flexShrink: 0, cursor: 'grab' }} />
                                    <input type='radio' name={`cp-correct-${cp.id}`}
                                        checked={isCorrect}
                                        onChange={() => onUpdate({ correctOptionIndex: oi })}
                                        style={{ accentColor: 'rgb(80,200,120)', flexShrink: 0, cursor: 'pointer' }} />
                                    <input value={opt} onChange={e => updateOption(oi, e.target.value)} placeholder={`Option ${oi + 1}`}
                                        style={{ ...inputSx, flex: 1, width: 'auto', border: 'none', background: 'transparent', padding: '2px 4px' }} />
                                    {options.length > 2 && (
                                        <button type='button' onClick={() => removeOption(oi)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(219,0,29,0.4)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                            <DeleteOutlineIcon style={{ fontSize: 14 }} />
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                        {/* End-of-list drop zone — shows line when dragging past the last option */}
                        <div
                            style={{ height: 10, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                            onDragOver={e => { e.preventDefault(); setDragOverOptIdx(options.length) }}
                            onDrop={() => { if (draggingOptIdx !== null) dropOption(draggingOptIdx, options.length); setDraggingOptIdx(null); setDragOverOptIdx(null) }}
                        >
                            <div style={{ height: 2, width: '100%', borderRadius: 1, background: dragOverOptIdx === options.length && draggingOptIdx !== null ? RED : 'transparent' }} />
                        </div>
                        <button type='button' onClick={addOption} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'none', border: `1px dashed rgba(255,255,255,0.1)`, color: MUTED, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', alignSelf: 'flex-start' }}>
                            <AddIcon style={{ fontSize: 12 }} /> Add Option
                        </button>
                    </div>
                    {noCorrectSelected && (
                        <div style={{ fontSize: '0.52rem', color: 'rgba(219,0,29,0.65)', marginTop: 7, letterSpacing: '0.06em' }}>
                            No correct answer selected — click a radio button above
                        </div>
                    )}
                </div>
            )}

            {cp.type === 'written' && (
                <div>
                    <label style={labelSx}>Claude Evaluation Rubric</label>
                    <textarea value={cp.rubric ?? ''} onChange={e => onUpdate({ rubric: e.target.value })} rows={4}
                        placeholder='Describe what a correct answer should include…' style={{ ...inputSx, resize: 'vertical' }} />
                </div>
            )}

            <div>
                <label style={labelSx}>Pause Video At</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type='number' min={0} step={1} value={cp.timestampSeconds} onChange={e => onUpdate({ timestampSeconds: Math.max(0, Number(e.target.value) || 0) })} style={{ ...inputSx, width: 80 }} />
                    <span style={{ fontSize: '0.65rem', color: MUTED, flexShrink: 0 }}>{fmtTime(cp.timestampSeconds)}</span>
                    <button type='button' onClick={() => onUpdate({ timestampSeconds: Math.floor(currentTime) })} style={setCurrentBtn}>
                        <AccessTimeIcon style={{ fontSize: 11 }} /> Set Current
                    </button>
                </div>
            </div>

            <div>
                <label style={labelSx}>Rewind To On Fail</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type='number' min={0} step={1} value={cp.rewindToSeconds} onChange={e => onUpdate({ rewindToSeconds: Math.max(0, Number(e.target.value) || 0) })} style={{ ...inputSx, width: 80 }} />
                    <span style={{ fontSize: '0.65rem', color: MUTED, flexShrink: 0 }}>{fmtTime(cp.rewindToSeconds)}</span>
                    <button type='button' onClick={() => onUpdate({ rewindToSeconds: Math.floor(currentTime) })} style={setCurrentBtn}>
                        <AccessTimeIcon style={{ fontSize: 11 }} /> Set Current
                    </button>
                </div>
                <div style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.15)', marginTop: 4 }}>
                    Pause at the rewatch start point, then click Set Current
                </div>
            </div>

            <button type='button' onClick={onDelete} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'rgba(219,0,29,0.07)', border: `1px solid rgba(219,0,29,0.2)`, color: 'rgba(219,0,29,0.7)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', alignSelf: 'flex-start', marginTop: 4 }}>
                <DeleteOutlineIcon style={{ fontSize: 13 }} /> Delete Checkpoint
            </button>
        </div>
    )
}

// ── Main editor ──────────────────────────────────────────────────────────────

export default function VideoEditorClient({ video, from }: { video: TrainingTypeVideo & { _id: string }; from: string }) {
    const router       = useRouter()
    const videoRef     = useRef<HTMLVideoElement>(null)
    const timelineRef  = useRef<HTMLDivElement>(null)
    const progressRef  = useRef<HTMLDivElement>(null)

    const [title, setTitle]             = useState(video.title)
    const [description, setDescription] = useState(video.description ?? '')
    const [sections, setSections]       = useState<TrainingVideoSection[]>(video.sections ?? [])
    const [checkpoints, setCheckpoints] = useState<TrainingVideoCheckpoint[]>(video.checkpoints ?? [])

    const [dirty, setDirty]   = useState(false)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved]   = useState(false)

    const [playing, setPlaying]         = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration]       = useState(video.duration ?? 0)
    const [speed, setSpeed]             = useState(1)
    const [muted, setMuted]             = useState(false)

    const [selected, setSelected] = useState<SelectedItem>(null)

    // Drag state
    const [dragState, setDragState] = useState<DragState>(null)

    // Refs to avoid stale closures in drag handler
    const durationRef  = useRef(duration)
    const sectionsRef  = useRef(sections)
    useEffect(() => { durationRef.current = duration },  [duration])
    useEffect(() => { sectionsRef.current = sections },  [sections])

    // Read duration from the video element on mount in case metadata already loaded (e.g. browser cache)
    useEffect(() => {
        const v = videoRef.current
        if (v && !isNaN(v.duration) && v.duration > 0 && duration === 0) setDuration(v.duration)
    }, [duration])

    // ── Derived ────────────────────────────────────────────────────────────

    const sortedSections = useMemo(
        () => [...sections].sort((a, b) => a.startSeconds - b.startSeconds),
        [sections]
    )

    const sectionColorMap = useMemo(() => {
        const map: Record<string, string> = {}
        sortedSections.forEach((s, i) => { map[s.id] = SECTION_COLORS[i % SECTION_COLORS.length] })
        return map
    }, [sortedSections])

    const allEvents = useMemo(() => [
        ...sortedSections.map(s  => ({ kind: 'section'    as const, id: s.id,  time: s.startSeconds     })),
        ...checkpoints.map(cp    => ({ kind: 'checkpoint' as const, id: cp.id, time: cp.timestampSeconds })),
    ].sort((a, b) => a.time - b.time), [sortedSections, checkpoints])

    type SectionedItem =
        | { kind: 'section'; sec: TrainingVideoSection; cps: TrainingVideoCheckpoint[] }
        | { kind: 'orphan';  cp:  TrainingVideoCheckpoint }

    const sectionedItems = useMemo((): SectionedItem[] => {
        const cpsBySec: Record<string, TrainingVideoCheckpoint[]> = {}
        const orphans: TrainingVideoCheckpoint[] = []
        const sortedCps = [...checkpoints].sort((a, b) => a.timestampSeconds - b.timestampSeconds)
        for (const cp of sortedCps) {
            // First section (by startSeconds) whose [start, end] contains cp.timestampSeconds wins.
            // This means a checkpoint at t = S1.end = S2.start is placed under S1.
            const sec = sortedSections.find(s => {
                const end = getSectionEnd(s, sortedSections, duration)
                return cp.timestampSeconds >= s.startSeconds && cp.timestampSeconds <= end
            })
            if (sec) {
                if (!cpsBySec[sec.id]) cpsBySec[sec.id] = []
                cpsBySec[sec.id].push(cp)
            } else {
                orphans.push(cp)
            }
        }
        const items: SectionedItem[] = [
            ...sortedSections.map(s => ({ kind: 'section' as const, sec: s, cps: cpsBySec[s.id] ?? [] })),
            ...orphans.map(cp => ({ kind: 'orphan' as const, cp })),
        ].sort((a, b) => {
            const ta = a.kind === 'section' ? a.sec.startSeconds : a.cp.timestampSeconds
            const tb = b.kind === 'section' ? b.sec.startSeconds : b.cp.timestampSeconds
            return ta - tb
        })
        return items
    }, [checkpoints, sortedSections, duration])

    const selectedSection    = selected?.type === 'section'    ? sections.find(s  => s.id  === selected.id) ?? null : null
    const selectedCheckpoint = selected?.type === 'checkpoint' ? checkpoints.find(c => c.id === selected.id) ?? null : null

    const pct = duration > 0 ? (currentTime / duration) * 100 : 0

    // ── Global drag handler ────────────────────────────────────────────────

    useEffect(() => {
        if (!dragState) return

        function onMove(e: MouseEvent) {
            const { kind, id, timelineLeft, timelineWidth } = dragState!
            const dur   = durationRef.current
            if (!dur || !timelineWidth) return

            const rawPx  = e.clientX - timelineLeft
            const rawSec = (rawPx / timelineWidth) * dur
            const sec    = Math.max(0, Math.min(dur, rawSec))

            if (kind === 'section-start') {
                setSections(prev => prev.map(s => {
                    if (s.id !== id) return s
                    const maxSec = (s.endSeconds ?? dur) - 1
                    return { ...s, startSeconds: Math.round(Math.min(sec, maxSec)) }
                }))
            } else if (kind === 'section-end') {
                setSections(prev => prev.map(s => {
                    if (s.id !== id) return s
                    return { ...s, endSeconds: Math.round(Math.max(sec, s.startSeconds + 1)) }
                }))
            } else {
                // Checkpoint drag with snap to section boundaries
                const SNAP_PX = 12
                let snapped   = Math.round(sec)

                for (const s of sectionsRef.current) {
                    const sPx = (s.startSeconds / dur) * timelineWidth
                    if (Math.abs(rawPx - sPx) <= SNAP_PX) { snapped = s.startSeconds; break }
                    const eSec = s.endSeconds !== undefined ? s.endSeconds :
                        (() => { const sorted = [...sectionsRef.current].sort((a, b) => a.startSeconds - b.startSeconds); const i = sorted.findIndex(x => x.id === s.id); return sorted[i + 1] ? sorted[i + 1].startSeconds : dur })()
                    const ePx = (eSec / dur) * timelineWidth
                    if (Math.abs(rawPx - ePx) <= SNAP_PX) { snapped = Math.round(eSec); break }
                }

                setCheckpoints(prev => prev.map(c => c.id === id ? { ...c, timestampSeconds: snapped } : c))
            }

            setDirty(true)
            setSaved(false)
        }

        function onUp() { setDragState(null) }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        return () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }
    }, [dragState])

    // ── Video controls ─────────────────────────────────────────────────────

    function togglePlay() {
        const v = videoRef.current
        if (!v) return
        if (v.paused) v.play(); else v.pause()
    }

    function seek(s: number) {
        if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(duration || Infinity, s))
    }

    function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
        if (!progressRef.current || !duration) return
        const rect = progressRef.current.getBoundingClientRect()
        seek(((e.clientX - rect.left) / rect.width) * duration)
    }

    function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
        if (dragState) return
        if (!timelineRef.current || !duration) return
        const rect = timelineRef.current.getBoundingClientRect()
        seek(((e.clientX - rect.left) / rect.width) * duration)
    }

    useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = speed }, [speed])
    useEffect(() => { if (videoRef.current) videoRef.current.muted = muted },        [muted])

    // ── CRUD ───────────────────────────────────────────────────────────────

    function mark() { setDirty(true); setSaved(false) }

    function addSection() {
        const id    = crypto.randomUUID()
        const start = Math.floor(currentTime)
        const end   = duration > 0
            ? Math.min(start + 60, Math.floor(duration))
            : start + 60
        setSections(prev => [...prev, { id, title: 'New Section', startSeconds: start, endSeconds: Math.max(end, start + 1) }])
        setSelected({ type: 'section', id })
        mark()
    }

    function addCheckpoint() {
        const id = crypto.randomUUID()
        const t   = Math.floor(currentTime)
        const dur = duration || 0
        const containing = sortedSections.find(s => {
            const end = getSectionEnd(s, sortedSections, dur)
            return t >= s.startSeconds && t <= end
        })
        const pauseAt   = containing ? getSectionEnd(containing, sortedSections, dur) : t
        const rewindTo  = containing ? containing.startSeconds : Math.max(0, t - 30)
        setCheckpoints(prev => [...prev, { id, timestampSeconds: pauseAt, rewindToSeconds: rewindTo, question: '', type: 'mcq', options: ['', '', '', ''], correctOptionIndex: -1 }])
        setSelected({ type: 'checkpoint', id })
        mark()
    }

    function deleteSection(id: string) {
        setSections(prev => prev.filter(s => s.id !== id))
        if (selected?.type === 'section' && selected.id === id) setSelected(null)
        mark()
    }

    function deleteCheckpoint(id: string) {
        setCheckpoints(prev => prev.filter(c => c.id !== id))
        if (selected?.type === 'checkpoint' && selected.id === id) setSelected(null)
        mark()
    }

    function updateSection(id: string, patch: Partial<TrainingVideoSection>) {
        setSections(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
        mark()
    }

    function updateCheckpoint(id: string, patch: Partial<TrainingVideoCheckpoint>) {
        setCheckpoints(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
        mark()
    }

    // ── Save ───────────────────────────────────────────────────────────────

    async function handleSave() {
        if (saving) return

        // Validate: MCQ checkpoints with a question must have a correct answer selected
        const unset = checkpoints.filter(c => c.type === 'mcq' && c.question.trim() && (c.correctOptionIndex ?? -1) < 0)
        if (unset.length > 0) {
            alert(`${unset.length} multiple-choice checkpoint${unset.length > 1 ? 's have' : ' has'} no correct answer selected. Please select the correct answer before saving.`)
            setSelected({ type: 'checkpoint', id: unset[0].id })
            return
        }

        // Bias check: if 3+ MCQ checkpoints have a valid answer, warn if >60% share the same position
        const answered = checkpoints.filter(c => c.type === 'mcq' && (c.correctOptionIndex ?? -1) >= 0)
        if (answered.length >= 3) {
            const tally: Record<number, number> = {}
            for (const c of answered) { const i = c.correctOptionIndex!; tally[i] = (tally[i] ?? 0) + 1 }
            const maxCount = Math.max(...Object.values(tally))
            if (maxCount / answered.length > 0.6) {
                const pos = Number(Object.keys(tally).find(k => tally[Number(k)] === maxCount)!) + 1
                const ok = confirm(`Answer option #${pos} is marked as correct in ${maxCount} of ${answered.length} checkpoints (${Math.round((maxCount / answered.length) * 100)}%). Consider shuffling the correct answer positions to avoid patterns. Save anyway?`)
                if (!ok) return
            }
        }

        setSaving(true)
        try {
            const res = await fetch(`/api/training-videos/${video._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.trim() || video.title, description: description.trim() || undefined, sections, checkpoints, duration: videoRef.current?.duration ?? video.duration }),
            })
            if (res.ok) { setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 3000) }
        } finally { setSaving(false) }
    }

    function handleBack() {
        if (dirty && !confirm('You have unsaved changes. Leave without saving?')) return
        router.back()
    }

    // ── Timeline ticks ─────────────────────────────────────────────────────

    const tickMarks = useMemo(() => {
        if (!duration) return []
        const interval = duration > 600 ? 120 : duration > 300 ? 60 : duration > 120 ? 30 : 15
        const ticks: number[] = []
        for (let t = interval; t < duration; t += interval) ticks.push(t)
        return ticks
    }, [duration])

    // ── Drag cursor ────────────────────────────────────────────────────────
    const timelineCursor = dragState
        ? (dragState.kind === 'checkpoint' ? 'grabbing' : 'ew-resize')
        : 'crosshair'

    const backLabel = from === 'videos' ? 'Training Videos' : 'Courses'

    return (
        <div style={{ display: 'flex', flexDirection: 'column', background: BG, minHeight: '100%' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, background: '#0d0d0d', flexShrink: 0 }}>
                <button type='button' onClick={handleBack} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'transparent', border: `1px solid ${BORDER}`, color: MUTED, cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>
                    <ArrowBackIcon style={{ fontSize: 13 }} /> {backLabel}
                </button>
                <input value={title} onChange={e => { setTitle(e.target.value); mark() }} style={{ flex: 1, background: 'transparent', border: 'none', color: TEXT, fontSize: '1rem', fontWeight: 800, letterSpacing: '0.04em', outline: 'none', fontFamily: 'inherit' }} placeholder='Video title' />
                {saved && <span style={{ fontSize: '0.58rem', color: 'rgba(80,200,120,0.9)', letterSpacing: '0.1em', fontWeight: 700, flexShrink: 0 }}>SAVED ✓</span>}
                <Link href={`/dashboard/unit/training-hub/video/${video._id}/watch?from=edit`} target='_blank'
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'transparent', border: `1px solid rgba(255,255,255,0.12)`, color: MUTED, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none', flexShrink: 0 }}>
                    <VisibilityIcon style={{ fontSize: 13 }} /> Preview
                </Link>
                <button type='button' onClick={handleSave} disabled={saving || !dirty}
                    style={{ padding: '7px 18px', background: dirty ? RED : 'rgba(219,0,29,0.2)', border: 'none', color: '#fff', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: (saving || !dirty) ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, flexShrink: 0 }}>
                    {saving ? 'Saving…' : 'Save All'}
                </button>
            </div>

            {/* Main */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

                {/* Left: video area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>

                    {/* Video */}
                    <div style={{ background: '#000', cursor: 'pointer' }} onClick={togglePlay}>
                        <video ref={videoRef} src={video.url} style={{ width: '100%', maxHeight: '62vh', display: 'block', outline: 'none' }}
                            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
                            onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
                            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
                    </div>

                    {/* Controls */}
                    <div style={{ background: '#111', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button type='button' onClick={togglePlay} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: TEXT, display: 'flex', alignItems: 'center', padding: 4 }}>
                            {playing ? <PauseIcon style={{ fontSize: 24 }} /> : <PlayArrowIcon style={{ fontSize: 24 }} />}
                        </button>
                        <button type='button' onClick={() => seek(currentTime - 10)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex', alignItems: 'center', padding: 2 }}>
                            <Replay10Icon style={{ fontSize: 20 }} />
                        </button>
                        <button type='button' onClick={() => seek(currentTime + 10)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex', alignItems: 'center', padding: 2 }}>
                            <Forward10Icon style={{ fontSize: 20 }} />
                        </button>
                        <span style={{ fontSize: '0.72rem', color: MUTED, letterSpacing: '0.05em', flexShrink: 0, minWidth: 88 }}>
                            {fmtTime(currentTime)} / {fmtTime(duration)}
                        </span>
                        <div ref={progressRef} onClick={handleProgressClick} style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, cursor: 'pointer', position: 'relative' }}>
                            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: RED, borderRadius: 3 }} />
                            <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%, -50%)', width: 12, height: 12, borderRadius: '50%', background: RED }} />
                        </div>
                        <select value={speed} onChange={e => setSpeed(Number(e.target.value))} style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${BORDER}`, color: TEXT, fontSize: '0.65rem', padding: '3px 6px', outline: 'none', cursor: 'pointer' }}>
                            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(s => (
                                <option key={s} value={s}>{s === 1 ? '1× Normal' : `${s}×`}</option>
                            ))}
                        </select>
                        <button type='button' onClick={() => setMuted(m => !m)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex', alignItems: 'center' }}>
                            {muted ? <VolumeOffIcon style={{ fontSize: 20 }} /> : <VolumeUpIcon style={{ fontSize: 20 }} />}
                        </button>
                    </div>

                    {/* Visual timeline */}
                    <div ref={timelineRef} onClick={handleTimelineClick}
                        style={{ height: 72, background: '#0d0d0d', borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, position: 'relative', cursor: timelineCursor, userSelect: 'none', overflow: 'hidden' }}>

                        {(sortedSections.length > 0 || checkpoints.length > 0) && duration === 0 && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.56rem', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.08em', pointerEvents: 'none' }}>
                                Timeline will appear once the video loads
                            </div>
                        )}
                        {sortedSections.length === 0 && checkpoints.length === 0 && duration > 0 && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.56rem', color: 'rgba(255,255,255,0.12)', letterSpacing: '0.08em', pointerEvents: 'none' }}>
                                Click to seek · Add sections and checkpoints below
                            </div>
                        )}

                        {/* Tick marks */}
                        {duration > 0 && tickMarks.map(t => (
                            <div key={t} style={{ position: 'absolute', left: `${(t / duration) * 100}%`, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }}>
                                <span style={{ position: 'absolute', bottom: 2, left: 2, fontSize: '0.42rem', color: 'rgba(255,255,255,0.18)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{fmtTime(t)}</span>
                            </div>
                        ))}

                        {/* Section bars with edge drag handles */}
                        {duration > 0 && sortedSections.map((sec, i) => {
                            const endSec   = getSectionEnd(sec, sortedSections, duration)
                            const left     = (sec.startSeconds / duration) * 100
                            const width    = Math.max(0.5, (endSec - sec.startSeconds) / duration * 100)
                            const color    = sectionColorMap[sec.id] ?? RED
                            const isSel    = selected?.type === 'section' && selected.id === sec.id
                            const isDrag   = dragState?.id === sec.id

                            return (
                                <div key={sec.id} style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: 5, height: 34, background: (isSel || isDrag) ? color : `${color}88`, border: `1px solid ${(isSel || isDrag) ? color : color + '44'}`, borderRadius: 3, boxSizing: 'border-box' }}>
                                    {/* Left drag edge */}
                                    <div
                                        onMouseDown={e => {
                                            e.stopPropagation()
                                            const rect = timelineRef.current!.getBoundingClientRect()
                                            setDragState({ kind: 'section-start', id: sec.id, timelineLeft: rect.left, timelineWidth: rect.width })
                                        }}
                                        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, cursor: 'w-resize', zIndex: 20, background: 'rgba(255,255,255,0.18)', borderRadius: '3px 0 0 3px' }}
                                    />
                                    {/* Label / click body */}
                                    <div
                                        onClick={e => { e.stopPropagation(); if (!dragState) { seek(sec.startSeconds); setSelected({ type: 'section', id: sec.id }) } }}
                                        style={{ position: 'absolute', left: 8, right: 8, top: 0, bottom: 0, display: 'flex', alignItems: 'center', paddingLeft: 4, cursor: dragState ? 'default' : 'pointer', overflow: 'hidden' }}
                                    >
                                        <span style={{ fontSize: '0.5rem', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.06em', textShadow: '0 1px 3px rgba(0,0,0,0.9)', pointerEvents: 'none' }}>
                                            {sec.title}
                                        </span>
                                    </div>
                                    {/* Right drag edge */}
                                    <div
                                        onMouseDown={e => {
                                            e.stopPropagation()
                                            const rect = timelineRef.current!.getBoundingClientRect()
                                            setDragState({ kind: 'section-end', id: sec.id, timelineLeft: rect.left, timelineWidth: rect.width })
                                        }}
                                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'e-resize', zIndex: 20, background: 'rgba(255,255,255,0.18)', borderRadius: '0 3px 3px 0' }}
                                    />
                                </div>
                            )
                        })}

                        {/* Checkpoint markers (draggable) */}
                        {duration > 0 && checkpoints.map(cp => {
                            const left   = (cp.timestampSeconds / duration) * 100
                            const isSel  = selected?.type === 'checkpoint' && selected.id === cp.id
                            const isDrag = dragState?.kind === 'checkpoint' && dragState.id === cp.id
                            const isSnapping = isDrag  // visual indicator when dragging

                            return (
                                <div
                                    key={cp.id}
                                    onMouseDown={e => {
                                        e.stopPropagation()
                                        const rect = timelineRef.current!.getBoundingClientRect()
                                        setDragState({ kind: 'checkpoint', id: cp.id, timelineLeft: rect.left, timelineWidth: rect.width })
                                    }}
                                    onClick={e => { e.stopPropagation(); if (!dragState) { seek(cp.timestampSeconds); setSelected({ type: 'checkpoint', id: cp.id }) } }}
                                    title={cp.question || `Checkpoint @ ${fmtTime(cp.timestampSeconds)}`}
                                    style={{
                                        position:  'absolute',
                                        left:      `calc(${left}% - 7px)`,
                                        bottom:    6,
                                        width:     14,
                                        height:    14,
                                        transform: 'rotate(45deg)',
                                        background: (isSel || isDrag) ? '#facc15' : 'rgba(250,204,21,0.75)',
                                        border:    `2px solid ${(isSel || isDrag) ? '#facc15' : 'rgba(250,204,21,0.4)'}`,
                                        cursor:    isDrag ? 'grabbing' : 'grab',
                                        zIndex:    5,
                                        boxShadow: (isSel || isSnapping) ? '0 0 8px #facc15' : 'none',
                                    }}
                                />
                            )
                        })}

                        {/* Snap indicators at section boundaries (visible when dragging checkpoint) */}
                        {dragState?.kind === 'checkpoint' && duration > 0 && sortedSections.map(sec => {
                            const endSec = getSectionEnd(sec, sortedSections, duration)
                            return [sec.startSeconds, endSec].map((t, i) => (
                                <div key={`${sec.id}-snap-${i}`} style={{ position: 'absolute', left: `${(t / duration) * 100}%`, top: 0, bottom: 0, width: 1, background: 'rgba(250,204,21,0.4)', pointerEvents: 'none', zIndex: 3 }} />
                            ))
                        })}

                        {/* Playhead */}
                        {duration > 0 && (
                            <div style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, width: 2, background: RED, pointerEvents: 'none', zIndex: 10, boxShadow: `0 0 5px ${RED}88` }} />
                        )}
                    </div>

                    {/* Legend */}
                    <div style={{ padding: '6px 16px', background: '#0d0d0d', display: 'flex', gap: 16, alignItems: 'center', borderBottom: `1px solid ${BORDER}` }}>
                        <span style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em' }}>Drag section edges to resize · Drag checkpoints to move · Snap to section boundaries</span>
                    </div>

                    {/* Add buttons */}
                    <div style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderBottom: `1px solid ${BORDER}` }}>
                        <span style={{ fontSize: '0.52rem', color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>At {fmtTime(currentTime)}:</span>
                        <button type='button' onClick={addSection} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'transparent', border: `1px solid rgba(255,255,255,0.12)`, color: MUTED, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            <AddIcon style={{ fontSize: 12 }} /> Add Section
                        </button>
                        <button type='button' onClick={addCheckpoint} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'transparent', border: `1px solid rgba(250,204,21,0.3)`, color: 'rgba(250,204,21,0.7)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            <AddIcon style={{ fontSize: 12 }} /> Add Checkpoint
                        </button>
                        <span style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.14)', fontStyle: 'italic' }}>Pause at the desired moment first</span>
                    </div>

                    {/* Description */}
                    <div style={{ padding: '14px 16px' }}>
                        <label style={labelSx}>Description</label>
                        <textarea value={description} onChange={e => { setDescription(e.target.value); mark() }} rows={2} placeholder='Optional description…' style={{ ...inputSx, resize: 'vertical' }} />
                    </div>
                </div>

                {/* Right sidebar */}
                <div style={{ width: 380, borderLeft: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto', background: '#0a0a0a' }}>

                    {selected ? (
                        <>
                            <div style={{ padding: '11px 14px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10, background: '#0d0d0d', flexShrink: 0 }}>
                                <button type='button' onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                    <ArrowBackIcon style={{ fontSize: 13 }} /> All Items
                                </button>
                                <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: selected.type === 'section' ? 'rgba(255,255,255,0.4)' : 'rgba(250,204,21,0.75)' }}>
                                    {selected.type === 'section' ? '■ Section' : '◆ Checkpoint'}
                                </span>
                            </div>

                            {/* Section edit */}
                            {selectedSection && (() => {
                                const effectiveEnd = getSectionEnd(selectedSection, sortedSections, duration)
                                return (
                                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                                        <div>
                                            <label style={labelSx}>Section Name</label>
                                            <input value={selectedSection.title} onChange={e => updateSection(selectedSection.id, { title: e.target.value })} autoFocus style={inputSx} />
                                        </div>
                                        <div>
                                            <label style={labelSx}>Start Time</label>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <input type='number' min={0} step={1} value={selectedSection.startSeconds} onChange={e => updateSection(selectedSection.id, { startSeconds: Math.max(0, Number(e.target.value) || 0) })} style={{ ...inputSx, width: 80 }} />
                                                <span style={{ fontSize: '0.65rem', color: MUTED }}>{fmtTime(selectedSection.startSeconds)}</span>
                                                <button type='button' onClick={() => updateSection(selectedSection.id, { startSeconds: Math.floor(currentTime) })} style={setCurrentBtn}>
                                                    <AccessTimeIcon style={{ fontSize: 11 }} /> Set Current
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <label style={labelSx}>End Time</label>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <input type='number' min={0} step={1}
                                                    value={selectedSection.endSeconds ?? Math.floor(effectiveEnd)}
                                                    onChange={e => updateSection(selectedSection.id, { endSeconds: Math.max(selectedSection.startSeconds + 1, Number(e.target.value) || 0) })}
                                                    style={{ ...inputSx, width: 80 }} />
                                                <span style={{ fontSize: '0.65rem', color: MUTED }}>{fmtTime(selectedSection.endSeconds ?? effectiveEnd)}</span>
                                                <button type='button' onClick={() => updateSection(selectedSection.id, { endSeconds: Math.max(selectedSection.startSeconds + 1, Math.floor(currentTime)) })} style={setCurrentBtn}>
                                                    <AccessTimeIcon style={{ fontSize: 11 }} /> Set Current
                                                </button>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ width: 14, height: 14, background: sectionColorMap[selectedSection.id] ?? RED, borderRadius: 2, flexShrink: 0 }} />
                                            <span style={{ fontSize: '0.58rem', color: MUTED }}>Color auto-assigned by position</span>
                                        </div>
                                        <button type='button' onClick={() => deleteSection(selectedSection.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'rgba(219,0,29,0.07)', border: `1px solid rgba(219,0,29,0.2)`, color: 'rgba(219,0,29,0.7)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', alignSelf: 'flex-start', marginTop: 4 }}>
                                            <DeleteOutlineIcon style={{ fontSize: 13 }} /> Delete Section
                                        </button>
                                    </div>
                                )
                            })()}

                            {selectedCheckpoint && (
                                <CheckpointEditForm cp={selectedCheckpoint} currentTime={currentTime}
                                    onUpdate={patch => updateCheckpoint(selectedCheckpoint.id, patch)}
                                    onDelete={() => deleteCheckpoint(selectedCheckpoint.id)} />
                            )}
                        </>
                    ) : (
                        <>
                            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${BORDER}`, background: '#0d0d0d', flexShrink: 0 }}>
                                <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED }}>Sections & Checkpoints</div>
                                <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.2)', marginTop: 3 }}>
                                    {sortedSections.length} section{sortedSections.length !== 1 ? 's' : ''} · {checkpoints.length} checkpoint{checkpoints.length !== 1 ? 's' : ''}
                                </div>
                            </div>

                            {sectionedItems.length === 0 ? (
                                <div style={{ padding: 24, textAlign: 'center', fontSize: '0.65rem', color: 'rgba(255,255,255,0.15)', letterSpacing: '0.04em', lineHeight: 1.7 }}>
                                    No sections or checkpoints yet.<br />Use the buttons below the timeline to add them.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {sectionedItems.map(item => {
                                        if (item.kind === 'section') {
                                            const { sec, cps } = item
                                            const color  = sectionColorMap[sec.id] ?? RED
                                            const endSec = getSectionEnd(sec, sortedSections, duration)
                                            const isSel  = false // selected is always null in the list panel
                                            return (
                                                <div key={`sec-${sec.id}`}>
                                                    <div
                                                        onClick={() => { seek(sec.startSeconds); setSelected({ type: 'section', id: sec.id }) }}
                                                        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: `1px solid rgba(255,255,255,0.04)`, borderLeft: `3px solid ${color}`, cursor: 'pointer', background: isSel ? 'rgba(255,255,255,0.06)' : SURFACE, transition: 'background 0.1s' }}
                                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = isSel ? 'rgba(255,255,255,0.06)' : SURFACE)}>
                                                        <div style={{ paddingTop: 3, flexShrink: 0 }}>
                                                            <div style={{ width: 12, height: 12, background: color, borderRadius: 2 }} />
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                                                <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>Section</span>
                                                                <span style={{ fontSize: '0.58rem', color: MUTED }}>{fmtTime(sec.startSeconds)} – {fmtTime(endSec)}</span>
                                                            </div>
                                                            <div style={{ fontSize: '0.73rem', fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sec.title}</div>
                                                        </div>
                                                        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', paddingTop: 3 }}>›</span>
                                                    </div>

                                                    {cps.map(cp => {
                                                        const cpSel = false // selected is always null in the list panel
                                                        return (
                                                            <div key={`cp-${cp.id}`}
                                                                onClick={() => { seek(cp.timestampSeconds); setSelected({ type: 'checkpoint', id: cp.id }) }}
                                                                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 14px 8px 28px', borderBottom: `1px solid rgba(255,255,255,0.03)`, borderLeft: `3px solid ${color}33`, cursor: 'pointer', background: cpSel ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.01)', transition: 'background 0.1s' }}
                                                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                                                                onMouseLeave={e => (e.currentTarget.style.background = cpSel ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.01)')}>
                                                                <div style={{ paddingTop: 3, flexShrink: 0 }}>
                                                                    <div style={{ width: 8, height: 8, background: 'rgba(250,204,21,0.8)', transform: 'rotate(45deg)' }} />
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                                                        <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(250,204,21,0.6)', flexShrink: 0 }}>Q</span>
                                                                        <span style={{ fontSize: '0.58rem', color: MUTED }}>{fmtTime(cp.timestampSeconds)}</span>
                                                                    </div>
                                                                    <div style={{ fontSize: '0.7rem', fontWeight: 500, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {cp.question || <em style={{ color: MUTED, fontSize: '0.68rem' }}>No question set</em>}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.52rem', color: MUTED, marginTop: 2 }}>
                                                                        {cp.type === 'mcq' ? `MCQ · ${(cp.options ?? []).filter(Boolean).length} options` : 'Written Answer'}
                                                                    </div>
                                                                </div>
                                                                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', paddingTop: 3 }}>›</span>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )
                                        } else {
                                            const { cp } = item
                                            const cpSel = false // selected is always null in the list panel
                                            return (
                                                <div key={`orphan-${cp.id}`}
                                                    onClick={() => { seek(cp.timestampSeconds); setSelected({ type: 'checkpoint', id: cp.id }) }}
                                                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: `1px solid rgba(255,255,255,0.04)`, cursor: 'pointer', background: cpSel ? 'rgba(255,255,255,0.05)' : SURFACE, transition: 'background 0.1s' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = cpSel ? 'rgba(255,255,255,0.05)' : SURFACE)}>
                                                    <div style={{ paddingTop: 3, flexShrink: 0 }}>
                                                        <div style={{ width: 10, height: 10, background: 'rgba(250,204,21,0.8)', transform: 'rotate(45deg)' }} />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                                            <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(250,204,21,0.6)', flexShrink: 0 }}>Q</span>
                                                            <span style={{ fontSize: '0.58rem', color: MUTED }}>{fmtTime(cp.timestampSeconds)}</span>
                                                        </div>
                                                        <div style={{ fontSize: '0.73rem', fontWeight: 500, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {cp.question || <em style={{ color: MUTED, fontSize: '0.68rem' }}>No question set</em>}
                                                        </div>
                                                        <div style={{ fontSize: '0.52rem', color: MUTED, marginTop: 2 }}>
                                                            {cp.type === 'mcq' ? `MCQ · ${(cp.options ?? []).filter(Boolean).length} options` : 'Written Answer'}
                                                        </div>
                                                    </div>
                                                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', paddingTop: 3 }}>›</span>
                                                </div>
                                            )
                                        }
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
