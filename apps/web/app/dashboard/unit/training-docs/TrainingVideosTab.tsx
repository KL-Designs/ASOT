'use client'

import { useState, useEffect } from 'react'
import Link               from 'next/link'
import SmartDisplayIcon   from '@mui/icons-material/SmartDisplay'
import DeleteOutlineIcon  from '@mui/icons-material/DeleteOutline'
import AddIcon            from '@mui/icons-material/Add'
import EditIcon           from '@mui/icons-material/Edit'
import PlayArrowIcon      from '@mui/icons-material/PlayArrow'

const RED    = '#db001d'
const BORDER = 'rgba(255,255,255,0.08)'
const TEXT   = 'rgba(237,237,237,0.85)'
const MUTED  = 'rgba(237,237,237,0.35)'
const DARK   = 'rgba(255,255,255,0.03)'

type VideoWithType = TrainingTypeVideo & { typeName?: string; typeId?: string }

interface CheckpointForm {
    id: string
    timestampSeconds: string
    rewindToSeconds: string
    question: string
    type: 'mcq' | 'written'
    options: string[]
    correctOptionIndex: number
    rubric: string
}

function blankCheckpointForm(): CheckpointForm {
    return { id: crypto.randomUUID(), timestampSeconds: '', rewindToSeconds: '', question: '', type: 'mcq', options: ['', '', '', ''], correctOptionIndex: 0, rubric: '' }
}

function cpFormToCheckpoint(f: CheckpointForm): TrainingVideoCheckpoint {
    const q: CheckpointQuestion = f.type === 'mcq'
        ? { id: f.id + '-q1', question: f.question.trim(), type: 'mcq', options: f.options.map(o => o.trim()).filter(Boolean), correctOptionIndex: f.correctOptionIndex }
        : { id: f.id + '-q1', question: f.question.trim(), type: 'written', rubric: f.rubric.trim() }
    return {
        id: f.id,
        timestampSeconds: Number(f.timestampSeconds) || 0,
        rewindToSeconds: Number(f.rewindToSeconds) || 0,
        questions: [q],
    }
}

function cpToForm(cp: TrainingVideoCheckpoint): CheckpointForm {
    // Support both new (questions array) and legacy (top-level fields) data
    const firstQ = cp.questions?.[0]
    const qType   = firstQ?.type ?? cp.type ?? 'mcq'
    const qText   = firstQ?.question ?? cp.question ?? ''
    const qOpts   = firstQ?.options ?? cp.options ?? ['', '', '', '']
    const qCorr   = firstQ?.correctOptionIndex ?? cp.correctOptionIndex ?? 0
    const qRubric = firstQ?.rubric ?? cp.rubric ?? ''
    return {
        id: cp.id,
        timestampSeconds: String(cp.timestampSeconds),
        rewindToSeconds:  String(cp.rewindToSeconds),
        question:         qText,
        type:             qType,
        options:          qType === 'mcq' ? [...qOpts, '', '', '', ''].slice(0, 4) : ['', '', '', ''],
        correctOptionIndex: qCorr,
        rubric:           qRubric,
    }
}

interface Props {
    isJ3Lead: boolean
    isTrainer: boolean
    myId: string
}

export default function TrainingVideosTab({ isJ3Lead, isTrainer, myId }: Props) {
    const [videos, setVideos]           = useState<VideoWithType[]>([])
    const [loading, setLoading]         = useState(true)
    const [expandedId, setExpandedId]   = useState<string | null>(null)

    // Add video form state
    const [showUpload, setShowUpload]   = useState(false)
    const [uploadTitle, setUploadTitle] = useState('')
    const [uploadDesc,  setUploadDesc]  = useState('')
    const [youtubeUrl,  setYoutubeUrl]  = useState('')
    const [adding,      setAdding]      = useState(false)

    // Checkpoint editor
    const [editingCpVideoId, setEditingCpVideoId] = useState<string | null>(null)
    const [cpForms, setCpForms]                   = useState<CheckpointForm[]>([])
    const [savingCps, setSavingCps]               = useState(false)

    // Deleting
    const [deletingId, setDeletingId]   = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/training-videos/all')
            .then(r => r.json())
            .then(data => { setVideos(data.videos ?? []); setLoading(false) })
            .catch(() => setLoading(false))
    }, [])

    function extractYouTubeId(url: string): string | null {
        for (const re of [/[?&]v=([^&]+)/, /youtu\.be\/([^?&/]+)/, /youtube\.com\/embed\/([^?&/]+)/]) {
            const m = re.exec(url)
            if (m) return m[1]
        }
        return null
    }

    async function handleAdd() {
        if (!youtubeUrl.trim() || !uploadTitle.trim() || adding) return
        setAdding(true)
        try {
            const res = await fetch('/api/training-videos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: uploadTitle.trim(), url: youtubeUrl.trim(), description: uploadDesc.trim() || undefined }),
            })
            if (res.ok) {
                const created = await res.json()
                setVideos(v => [created, ...v])
                setShowUpload(false)
                setUploadTitle('')
                setUploadDesc('')
                setYoutubeUrl('')
            }
        } catch { /* ignore */ } finally {
            setAdding(false)
        }
    }

    function openCheckpointEditor(video: VideoWithType) {
        setEditingCpVideoId(String(video._id))
        setCpForms(video.checkpoints.map(cpToForm))
    }

    async function saveCheckpoints(videoId: string) {
        setSavingCps(true)
        try {
            const checkpoints = cpForms.map(cpFormToCheckpoint).filter(cp => cp.questions[0]?.question)
            await fetch(`/api/training-videos/${videoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ checkpoints }),
            })
            setVideos(v => v.map(vid => String(vid._id) === videoId ? { ...vid, checkpoints } : vid))
            setEditingCpVideoId(null)
        } finally {
            setSavingCps(false)
        }
    }

    async function handleDelete(videoId: string) {
        if (deletingId) return
        if (!confirm('Delete this video? This cannot be undone.')) return
        setDeletingId(videoId)
        try {
            await fetch(`/api/training-videos/${videoId}`, { method: 'DELETE' })
            setVideos(v => v.filter(vid => String(vid._id) !== videoId))
            if (editingCpVideoId === videoId) setEditingCpVideoId(null)
        } finally {
            setDeletingId(null)
        }
    }

    const canManage = isJ3Lead || isTrainer

    if (loading) return <div style={{ padding: 'clamp(1.5rem,3vw,2.5rem)', fontSize: '0.7rem', color: MUTED, letterSpacing: '0.1em' }}>Loading…</div>

    return (
        <div style={{ padding: 'clamp(1.5rem,3vw,2.5rem)', paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED }}>
                    {videos.length} video{videos.length !== 1 ? 's' : ''}
                </div>
                {canManage && !showUpload && (
                    <button onClick={() => setShowUpload(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>
                        <AddIcon sx={{ fontSize: 15 }} /> Add Video
                    </button>
                )}
            </div>

            {/* Add video form */}
            {canManage && showUpload && (
                <div style={{ border: `1px solid ${RED}40`, borderTop: `2px solid ${RED}`, background: 'rgba(219,0,29,0.04)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED }}>Add Training Video</div>

                    <input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder='Video title…'
                        style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, color: TEXT, padding: '8px 10px', fontSize: '0.82rem', outline: 'none', width: '100%', boxSizing: 'border-box' }} />

                    <textarea value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} placeholder='Description (optional)…' rows={2}
                        style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, color: TEXT, padding: '8px 10px', fontSize: '0.82rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />

                    {/* YouTube URL */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <SmartDisplayIcon sx={{ fontSize: 18, color: `${RED}99`, flexShrink: 0 }} />
                            <input type='url' value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)}
                                placeholder='https://www.youtube.com/watch?v=…'
                                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, color: TEXT, padding: '8px 10px', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' as const }} />
                        </div>
                        {youtubeUrl && !extractYouTubeId(youtubeUrl) && (
                            <div style={{ fontSize: '0.62rem', color: `${RED}b3`, paddingLeft: 26 }}>Not a recognised YouTube URL — paste a youtube.com/watch or youtu.be link.</div>
                        )}
                        {youtubeUrl && extractYouTubeId(youtubeUrl) && (
                            <div style={{ fontSize: '0.62rem', color: 'rgba(80,200,120,0.7)', paddingLeft: 26 }}>Video ID: {extractYouTubeId(youtubeUrl)}</div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={handleAdd} disabled={!youtubeUrl.trim() || !uploadTitle.trim() || adding || !extractYouTubeId(youtubeUrl)}
                            style={{ padding: '8px 20px', background: RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: adding ? 'default' : 'pointer', opacity: (!youtubeUrl.trim() || !uploadTitle.trim() || adding || !extractYouTubeId(youtubeUrl)) ? 0.45 : 1 }}>
                            {adding ? 'Adding…' : 'Add Video'}
                        </button>
                        <button onClick={() => { setShowUpload(false); setUploadTitle(''); setUploadDesc(''); setYoutubeUrl('') }}
                            style={{ padding: '8px 14px', background: 'transparent', border: `1px solid ${BORDER}`, color: MUTED, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Video list */}
            {videos.length === 0 ? (
                <div style={{ padding: '56px 0', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>
                    No training videos added yet
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${BORDER}` }}>
                    {/* Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 80px 160px', gap: 12, padding: '7px 14px', background: 'rgba(219,0,29,0.07)', borderBottom: `1px solid ${BORDER}` }}>
                        {['Title', 'Course', 'Checkpoints', ''].map(h => (
                            <div key={h} style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED }}>{h}</div>
                        ))}
                    </div>

                    {videos.map(vid => {
                        const vidId    = String(vid._id)
                        const isEditCp = editingCpVideoId === vidId

                        return (
                            <div key={vidId} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                                {/* Row */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 80px 160px', gap: 12, padding: '10px 14px', alignItems: 'center', background: DARK }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vid.title}</div>
                                        {vid.description && <div style={{ fontSize: '0.62rem', color: MUTED, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vid.description}</div>}
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: vid.typeName ? TEXT : 'rgba(237,237,237,0.18)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {vid.typeName ?? '—'}
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: MUTED }}>
                                        {vid.checkpoints.length > 0
                                            ? <span style={{ color: RED }}>{vid.checkpoints.length}</span>
                                            : <span style={{ color: 'rgba(237,237,237,0.18)' }}>0</span>}
                                    </div>
                                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                                        <Link href={`/dashboard/unit/training-hub/video/${vidId}/watch?from=videos`}
                                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', background: 'transparent', border: `1px solid ${BORDER}`, color: MUTED, fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none' }}>
                                            <PlayArrowIcon sx={{ fontSize: 11 }} /> Watch
                                        </Link>
                                        {isJ3Lead && (
                                            <Link
                                                href={`/dashboard/unit/training-hub/video/${vidId}/edit?from=videos`}
                                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', background: 'transparent', border: `1px solid ${BORDER}`, color: MUTED, fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none' }}
                                            >
                                                <EditIcon sx={{ fontSize: 10 }} /> Edit
                                            </Link>
                                        )}
                                        {!isJ3Lead && canManage && (
                                            <button onClick={() => isEditCp ? setEditingCpVideoId(null) : openCheckpointEditor(vid)}
                                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', background: isEditCp ? 'rgba(219,0,29,0.1)' : 'transparent', border: `1px solid ${isEditCp ? RED + '50' : BORDER}`, color: isEditCp ? RED : MUTED, fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                <EditIcon sx={{ fontSize: 10 }} /> Checkpoints
                                            </button>
                                        )}
                                        {isJ3Lead && (
                                            <button onClick={() => handleDelete(vidId)} disabled={!!deletingId}
                                                style={{ padding: '3px 6px', background: 'transparent', border: 'none', color: 'rgba(219,0,29,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Checkpoint editor */}
                                {isEditCp && (
                                    <CheckpointEditor
                                        forms={cpForms}
                                        onChange={setCpForms}
                                        onSave={() => saveCheckpoints(vidId)}
                                        onCancel={() => setEditingCpVideoId(null)}
                                        saving={savingCps}
                                    />
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ── Checkpoint editor ─────────────────────────────────────────────────────────

function CheckpointEditor({ forms, onChange, onSave, onCancel, saving }: {
    forms: CheckpointForm[]
    onChange: (f: CheckpointForm[]) => void
    onSave: () => void
    onCancel: () => void
    saving: boolean
}) {
    function add() { onChange([...forms, blankCheckpointForm()]) }
    function remove(i: number) { onChange(forms.filter((_, idx) => idx !== i)) }
    function update(i: number, patch: Partial<CheckpointForm>) { onChange(forms.map((f, idx) => idx === i ? { ...f, ...patch } : f)) }
    function updateOption(fi: number, oi: number, val: string) {
        const opts = [...forms[fi].options]
        opts[oi] = val
        update(fi, { options: opts })
    }

    const inputSx: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.08)`, color: TEXT, padding: '6px 8px', fontSize: '0.78rem', outline: 'none', width: '100%', boxSizing: 'border-box' as const }

    return (
        <div style={{ borderTop: `1px solid ${BORDER}`, background: 'rgba(219,0,29,0.03)', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: RED }}>Edit Checkpoints</div>

            {forms.length === 0 && (
                <div style={{ fontSize: '0.68rem', color: MUTED }}>No checkpoints yet. Add one below.</div>
            )}

            {forms.map((f, fi) => (
                <div key={f.id} style={{ border: `1px solid ${BORDER}`, padding: '14px', display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: MUTED }}>Checkpoint {fi + 1}</span>
                        <button onClick={() => remove(fi)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(219,0,29,0.5)', display: 'flex', alignItems: 'center' }}><DeleteOutlineIcon sx={{ fontSize: 14 }} /></button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.58rem', color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                            Pause at (seconds)
                            <input type='number' min={0} value={f.timestampSeconds} onChange={e => update(fi, { timestampSeconds: e.target.value })} style={inputSx} />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.58rem', color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                            Rewind to (seconds)
                            <input type='number' min={0} value={f.rewindToSeconds} onChange={e => update(fi, { rewindToSeconds: e.target.value })} style={inputSx} />
                        </label>
                    </div>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.58rem', color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Question
                        <textarea value={f.question} onChange={e => update(fi, { question: e.target.value })} rows={2} style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit' }} />
                    </label>

                    <div style={{ display: 'flex', gap: 10 }}>
                        {(['mcq', 'written'] as const).map(t => (
                            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', color: f.type === t ? TEXT : MUTED, cursor: 'pointer' }}>
                                <input type='radio' name={`type-${f.id}`} value={t} checked={f.type === t} onChange={() => update(fi, { type: t })} style={{ accentColor: RED }} />
                                {t === 'mcq' ? 'Multiple Choice' : 'Written Answer'}
                            </label>
                        ))}
                    </div>

                    {f.type === 'mcq' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            <div style={{ fontSize: '0.55rem', color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Options (mark correct)</div>
                            {f.options.map((opt, oi) => (
                                <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input type='radio' name={`correct-${f.id}`} checked={f.correctOptionIndex === oi} onChange={() => update(fi, { correctOptionIndex: oi })} style={{ accentColor: RED, flexShrink: 0 }} />
                                    <input value={opt} onChange={e => updateOption(fi, oi, e.target.value)} placeholder={`Option ${oi + 1}`} style={{ ...inputSx, flex: 1 }} />
                                </div>
                            ))}
                        </div>
                    )}

                    {f.type === 'written' && (
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.58rem', color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                            Claude Evaluation Rubric
                            <textarea value={f.rubric} onChange={e => update(fi, { rubric: e.target.value })} rows={3} placeholder='Describe what a correct answer should include…' style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit' }} />
                        </label>
                    )}
                </div>
            ))}

            <button onClick={add} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px dashed rgba(219,0,29,0.3)`, color: RED, padding: '7px 14px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', alignSelf: 'flex-start' }}>
                <AddIcon sx={{ fontSize: 13 }} /> Add Checkpoint
            </button>

            <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onSave} disabled={saving}
                    style={{ padding: '8px 20px', background: RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.5 : 1 }}>
                    {saving ? 'Saving…' : 'Save Checkpoints'}
                </button>
                <button onClick={onCancel} style={{ padding: '8px 14px', background: 'transparent', border: `1px solid ${BORDER}`, color: MUTED, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                    Cancel
                </button>
            </div>
        </div>
    )
}
