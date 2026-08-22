'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowBack, CheckCircleOutline, RateReview, DeleteOutline, History, Close, ExpandLess, ExpandMore } from '@mui/icons-material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import ImageIcon from '@mui/icons-material/Image'
import TrainingGuideEditor, { type TrainingGuideEditorHandle } from '@/components/training-guide/TrainingGuideEditor'
import ImageLibraryModal from '@/components/editor/ImageLibraryModal'

const RED = '#db001d'
const DEFAULT_RED = '#db001d'

// ─── History diff types ───────────────────────────────────────────────────────
type HistorySnap = {
    title: string; duration: string; overview: string
    trainingAreaDescription: string; notes: string
    equipment: { id: string; text: string }[]
    teachingPoints: {
        id: string; title: string
        dotPoints: { id: string; text: string; indent?: number }[]
        vitalPoints: { id: string; text: string }[]
        commonFaults: { id: string; fault: string; correction: string }[]
    }[]
}
type DP = { t: 'eq' | 'add' | 'del'; s: string }

function wdiff(a: string, b: string): DP[] {
    const tok = (s: string) => s.match(/[^\s]+|\s+/g) ?? (s.length ? [s] : [])
    const ta = tok(a), tb = tok(b)
    const m = ta.length, n = tb.length
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
    for (let i = m - 1; i >= 0; i--)
        for (let j = n - 1; j >= 0; j--)
            dp[i][j] = ta[i] === tb[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1])
    const out: DP[] = []; let i = 0, j = 0
    while (i < m || j < n) {
        if (i < m && j < n && ta[i] === tb[j]) { out.push({ t: 'eq',  s: ta[i] }); i++; j++ }
        else if (j < n && (i >= m || dp[i][j+1] >= dp[i+1][j])) { out.push({ t: 'add', s: tb[j] }); j++ }
        else { out.push({ t: 'del', s: ta[i] }); i++ }
    }
    return out
}

function DiffText({ a, b }: { a: string; b: string }) {
    if (a === b) return <span style={{ color: 'rgba(237,237,237,0.55)', fontFamily: 'Arial, sans-serif', fontSize: '0.85rem' }}>{a}</span>
    const parts = wdiff(a, b)
    const hasDiff = parts.some(p => p.t !== 'eq')
    if (!hasDiff) return <span style={{ color: 'rgba(237,237,237,0.55)', fontFamily: 'Arial, sans-serif', fontSize: '0.85rem' }}>{a}</span>
    return (
        <span style={{ lineHeight: 1.75, fontFamily: 'Arial, sans-serif', fontSize: '0.85rem' }}>
            {parts.map((p, i) => {
                if (p.t === 'eq')  return <span key={i} style={{ color: 'rgba(237,237,237,0.55)' }}>{p.s}</span>
                if (p.t === 'add') return <span key={i} style={{ background: 'rgba(76,175,80,0.2)', color: '#81c784' }}>{p.s}</span>
                return <span key={i} style={{ background: 'rgba(239,83,80,0.12)', color: '#e57373', textDecoration: 'line-through' }}>{p.s}</span>
            })}
        </span>
    )
}

const DIFF_SECTION: React.CSSProperties = {
    marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)',
}
const DIFF_LABEL: React.CSSProperties = {
    fontFamily: "'Oswald', Arial, sans-serif", fontSize: '0.6rem', fontWeight: 700,
    letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--txt-3)',
    marginBottom: 6,
}

function HistoryDiffModal({ entry, prev, onClose }: {
    entry: TrainingGuideEditEntry
    prev: TrainingGuideEditEntry | null
    onClose: () => void
}) {
    const after:  HistorySnap | null = entry.snapshot  ? JSON.parse(entry.snapshot)  : null
    const before: HistorySnap | null = prev?.snapshot  ? JSON.parse(prev.snapshot)   : null

    const sections: React.ReactNode[] = []

    if (after && before) {
        // Simple text fields
        const textFields: [string, keyof HistorySnap][] = [
            ['Title', 'title'], ['Duration', 'duration'],
            ['Overview', 'overview'], ['Training Area', 'trainingAreaDescription'], ['Notes', 'notes'],
        ]
        for (const [label, key] of textFields) {
            const a = (before[key] as string) ?? '', b = (after[key] as string) ?? ''
            if (a === b) continue
            sections.push(
                <div key={label} style={DIFF_SECTION}>
                    <div style={DIFF_LABEL}>{label}</div>
                    <DiffText a={a} b={b} />
                </div>
            )
        }

        // Equipment
        const eqBefore = before.equipment ?? [], eqAfter = after.equipment ?? []
        const eqChanged = eqBefore.some((e, i) => JSON.stringify(e) !== JSON.stringify(eqAfter[i])) || eqBefore.length !== eqAfter.length
        if (eqChanged) {
            const allIds = Array.from(new Set([...eqBefore.map(e => e.id), ...eqAfter.map(e => e.id)]))
            sections.push(
                <div key='equipment' style={DIFF_SECTION}>
                    <div style={DIFF_LABEL}>Equipment</div>
                    {allIds.map(id => {
                        const b = eqBefore.find(e => e.id === id)
                        const a = eqAfter.find(e => e.id === id)
                        if (!b) return <div key={id} style={{ display: 'flex', gap: 6, marginBottom: 4, fontSize: '0.83rem', color: '#81c784' }}>
                            <span>+</span><span>{a?.text}</span></div>
                        if (!a) return <div key={id} style={{ display: 'flex', gap: 6, marginBottom: 4, fontSize: '0.83rem', color: '#e57373', textDecoration: 'line-through' }}>
                            <span>−</span><span>{b.text}</span></div>
                        if (b.text === a.text) return null
                        return <div key={id} style={{ marginBottom: 6 }}><DiffText a={b.text} b={a.text} /></div>
                    })}
                </div>
            )
        }

        // Teaching points
        const allTpIds = Array.from(new Set([...before.teachingPoints.map(t => t.id), ...after.teachingPoints.map(t => t.id)]))
        for (const tpId of allTpIds) {
            const tb = before.teachingPoints.find(t => t.id === tpId)
            const ta = after.teachingPoints.find(t => t.id === tpId)

            if (!tb) {
                sections.push(
                    <div key={tpId} style={DIFF_SECTION}>
                        <div style={DIFF_LABEL}>Teaching Point Added</div>
                        <div style={{ color: '#81c784', fontSize: '0.85rem', fontFamily: 'Arial, sans-serif' }}>+ {ta?.title}</div>
                    </div>
                )
                continue
            }
            if (!ta) {
                sections.push(
                    <div key={tpId} style={DIFF_SECTION}>
                        <div style={DIFF_LABEL}>Teaching Point Removed</div>
                        <div style={{ color: '#e57373', fontSize: '0.85rem', textDecoration: 'line-through', fontFamily: 'Arial, sans-serif' }}>− {tb.title}</div>
                    </div>
                )
                continue
            }

            // Check if anything in this TP changed
            const tpChanged = JSON.stringify(tb) !== JSON.stringify(ta)
            if (!tpChanged) continue

            const tpSections: React.ReactNode[] = []

            if (tb.title !== ta.title) {
                tpSections.push(<div key='title' style={{ marginBottom: 8 }}>
                    <div style={{ ...DIFF_LABEL, color: 'rgba(237,237,237,0.3)', fontSize: '0.5rem' }}>Title</div>
                    <DiffText a={tb.title} b={ta.title} />
                </div>)
            }

            // Dot points
            const allDpIds = Array.from(new Set([...tb.dotPoints.map(d => d.id), ...ta.dotPoints.map(d => d.id)]))
            const dpRows = allDpIds.map(id => {
                const db = tb.dotPoints.find(d => d.id === id)
                const da = ta.dotPoints.find(d => d.id === id)
                if (!db) return <div key={id} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                    <span style={{ color: '#81c784', fontSize: '0.75rem', paddingLeft: (da?.indent ?? 0) * 14 }}>+</span>
                    <span style={{ color: '#81c784', fontSize: '0.83rem', fontFamily: 'Arial, sans-serif' }}>{da?.text}</span>
                </div>
                if (!da) return <div key={id} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                    <span style={{ color: '#e57373', fontSize: '0.75rem', paddingLeft: (db?.indent ?? 0) * 14 }}>−</span>
                    <span style={{ color: '#e57373', textDecoration: 'line-through', fontSize: '0.83rem', fontFamily: 'Arial, sans-serif' }}>{db.text}</span>
                </div>
                if (JSON.stringify(db) === JSON.stringify(da)) return null
                return <div key={id} style={{ marginBottom: 3, paddingLeft: (da.indent ?? 0) * 14 }}><DiffText a={db.text} b={da.text} /></div>
            }).filter(Boolean)
            if (dpRows.length > 0) {
                tpSections.push(<div key='dp' style={{ marginBottom: 8 }}>
                    <div style={{ ...DIFF_LABEL, color: 'rgba(237,237,237,0.3)', fontSize: '0.5rem' }}>Dot Points</div>
                    {dpRows}
                </div>)
            }

            // Vital points
            const allVpIds = Array.from(new Set([...tb.vitalPoints.map(v => v.id), ...ta.vitalPoints.map(v => v.id)]))
            const vpRows = allVpIds.map(id => {
                const vb = tb.vitalPoints.find(v => v.id === id)
                const va = ta.vitalPoints.find(v => v.id === id)
                if (!vb) return <div key={id} style={{ color: '#81c784', fontSize: '0.83rem', fontFamily: 'Arial, sans-serif', marginBottom: 3 }}>+ {va?.text}</div>
                if (!va) return <div key={id} style={{ color: '#e57373', textDecoration: 'line-through', fontSize: '0.83rem', fontFamily: 'Arial, sans-serif', marginBottom: 3 }}>− {vb.text}</div>
                if (vb.text === va.text) return null
                return <div key={id} style={{ marginBottom: 3 }}><DiffText a={vb.text} b={va.text} /></div>
            }).filter(Boolean)
            if (vpRows.length > 0) {
                tpSections.push(<div key='vp' style={{ marginBottom: 8 }}>
                    <div style={{ ...DIFF_LABEL, color: 'rgba(237,237,237,0.3)', fontSize: '0.5rem' }}>Vital Points</div>
                    {vpRows}
                </div>)
            }

            // Common faults
            const allCfIds = Array.from(new Set([...tb.commonFaults.map(c => c.id), ...ta.commonFaults.map(c => c.id)]))
            const cfRows = allCfIds.map(id => {
                const cb = tb.commonFaults.find(c => c.id === id)
                const ca = ta.commonFaults.find(c => c.id === id)
                if (!cb) return <div key={id} style={{ display: 'flex', gap: 16, color: '#81c784', fontSize: '0.83rem', fontFamily: 'Arial, sans-serif', marginBottom: 3 }}>
                    <span>+ {ca?.fault}</span><span style={{ opacity: 0.6 }}>→ {ca?.correction}</span></div>
                if (!ca) return <div key={id} style={{ display: 'flex', gap: 16, color: '#e57373', textDecoration: 'line-through', fontSize: '0.83rem', fontFamily: 'Arial, sans-serif', marginBottom: 3 }}>
                    <span>− {cb.fault}</span><span style={{ opacity: 0.6 }}>{cb.correction}</span></div>
                if (JSON.stringify(cb) === JSON.stringify(ca)) return null
                return <div key={id} style={{ display: 'flex', gap: 16, marginBottom: 4 }}>
                    <div style={{ flex: 1 }}><DiffText a={cb.fault} b={ca.fault} /></div>
                    <div style={{ flex: 1 }}><DiffText a={cb.correction} b={ca.correction} /></div>
                </div>
            }).filter(Boolean)
            if (cfRows.length > 0) {
                tpSections.push(<div key='cf' style={{ marginBottom: 8 }}>
                    <div style={{ ...DIFF_LABEL, color: 'rgba(237,237,237,0.3)', fontSize: '0.5rem' }}>Common Faults</div>
                    {cfRows}
                </div>)
            }

            if (tpSections.length > 0) {
                sections.push(
                    <div key={tpId} style={DIFF_SECTION}>
                        <div style={DIFF_LABEL}>Teaching Point — {ta.title || tb.title}</div>
                        {tpSections}
                    </div>
                )
            }
        }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={e => { if (e.target === e.currentTarget) onClose() }}>
            <div style={{ background: '#0d0d0d', border: '1px solid var(--line-2)', borderTop: `3px solid ${RED}`, width: '100%', maxWidth: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                    <History sx={{ fontSize: 14, color: 'rgba(219,0,29,0.6)' }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "'Oswald', Arial, sans-serif", fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.85)' }}>
                            {entry.type === 'created' ? 'Document Created' : `Edit by ${entry.byName}`}
                        </div>
                        <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>
                            {new Date(entry.at).toLocaleString('en-AU', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.4)', padding: 4 }}>
                        <Close sx={{ fontSize: 18 }} />
                    </button>
                </div>
                <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>
                    {!after || !before ? (
                        <div style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.8rem', fontFamily: 'Arial, sans-serif' }}>
                            {entry.type === 'created'
                                ? 'This is the initial version of the document.'
                                : 'Snapshot not available — this entry was recorded before diff tracking was added.'}
                            {entry.changes && entry.changes.length > 0 && (
                                <ul style={{ marginTop: 12, paddingLeft: 16 }}>
                                    {entry.changes.map((c, i) => <li key={i} style={{ marginBottom: 4 }}>{c}</li>)}
                                </ul>
                            )}
                        </div>
                    ) : sections.length === 0 ? (
                        <div style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.8rem', fontFamily: 'Arial, sans-serif' }}>No content changes detected.</div>
                    ) : sections}
                </div>
            </div>
        </div>
    )
}

interface Props {
    guide: TrainingGuide
    guideId: string
    isEditable: boolean
    canApprove: boolean
    canDelete: boolean
    backUrl: string
}

const inputSx: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    padding: '8px 10px',
    fontSize: '0.82rem',
    outline: 'none',
    color: 'rgba(237,237,237,0.8)',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
}

function statusLabel(guide: TrainingGuide) {
    if (guide.status === 'approved') return `Approved · v${guide.version}`
    if (guide.status === 'archived') return `Archived · v${guide.version}`
    return `Draft · v${guide.version}`
}

function statusColor(status: TrainingGuideStatus) {
    if (status === 'approved') return 'rgba(80,200,120,0.8)'
    if (status === 'archived') return 'rgba(237,237,237,0.3)'
    return 'rgba(255,180,50,0.8)'
}

function statusBorder(status: TrainingGuideStatus) {
    if (status === 'approved') return 'rgba(80,200,120,0.3)'
    if (status === 'archived') return 'rgba(255,255,255,0.1)'
    return 'rgba(255,180,50,0.3)'
}

export default function GuideEditorPage({ guide: initialGuide, guideId, isEditable, canApprove, canDelete, backUrl }: Props) {
    const router    = useRouter()
    const editorRef = useRef<TrainingGuideEditorHandle>(null)
    const sidebarFileRef = useRef<HTMLInputElement>(null)
    const [sidebarUploading, setSidebarUploading] = useState(false)
    const [showAddMenu,      setShowAddMenu]      = useState(false)
    const [showImgLibrary,   setShowImgLibrary]   = useState(false)
    const [sidebarDragOver,  setSidebarDragOver]  = useState(false)
    const [guide,          setGuide]          = useState(initialGuide)
    const [accentColor,    setAccentColor]    = useState(initialGuide.accentColor || DEFAULT_RED)
    const [colorInput,     setColorInput]     = useState(initialGuide.accentColor || DEFAULT_RED)
    const [historyOpen,    setHistoryOpen]    = useState(false)
    const [diffEntry,      setDiffEntry]      = useState<{ entry: TrainingGuideEditEntry; prev: TrainingGuideEditEntry | null } | null>(null)
    const [editMode,       setEditMode]       = useState(false)
    const [outlineColor,   setOutlineColor]   = useState(initialGuide.outlineColor || initialGuide.accentColor || DEFAULT_RED)
    const [outlineInput,   setOutlineInput]   = useState(initialGuide.outlineColor || initialGuide.accentColor || DEFAULT_RED)
    const [approvingNow,   setApprovingNow]   = useState(false)
    const [showReviewModal, setShowReviewModal] = useState(false)
    const [reviewComments, setReviewComments] = useState('')
    const [reviewDate,     setReviewDate]     = useState('')
    const [sendingReview,  setSendingReview]  = useState(false)
    const [confirmDelete,  setConfirmDelete]  = useState(false)
    const [deletingNow,    setDeletingNow]    = useState(false)
    const [reviewMsg,      setReviewMsg]      = useState('')

    const isJ3Context = isEditable || canApprove || canDelete

    function applyColor(hex: string) {
        setColorInput(hex)
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) setAccentColor(hex)
    }

    function applyOutlineColor(hex: string) {
        setOutlineInput(hex)
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) setOutlineColor(hex)
    }

    async function handleApprove() {
        if (approvingNow) return
        setApprovingNow(true)
        try {
            const res = await fetch(`/api/training-guides/${guideId}/approve`, { method: 'POST' })
            if (!res.ok) return
            const data = await res.json()
            setGuide(prev => ({ ...prev, status: 'approved', version: data.version }))
        } finally {
            setApprovingNow(false)
        }
    }

    async function handleSendReview() {
        if (sendingReview) return
        setSendingReview(true)
        try {
            const res = await fetch(`/api/training-guides/${guideId}/review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comments: reviewComments, checkDate: reviewDate || undefined }),
            })
            if (!res.ok) return
            setShowReviewModal(false)
            setReviewComments('')
            setReviewDate('')
            setReviewMsg('Review task sent to J3 leads.')
            setTimeout(() => setReviewMsg(''), 4000)
        } finally {
            setSendingReview(false)
        }
    }

    async function handleDelete() {
        if (deletingNow) return
        setDeletingNow(true)
        try {
            const res = await fetch(`/api/training-guides/${guideId}`, { method: 'DELETE' })
            if (!res.ok) return
            router.push(backUrl as never)
        } finally {
            setDeletingNow(false)
        }
    }

    async function sidebarUpload(file: File) {
        if (!file.type.startsWith('image/')) return
        setSidebarUploading(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            const res = await fetch('/api/training-guides/image', { method: 'POST', body: fd })
            if (res.ok) {
                const { url } = await res.json()
                editorRef.current?.addFreeImage(url)
            }
        } finally {
            setSidebarUploading(false)
            if (sidebarFileRef.current) sidebarFileRef.current.value = ''
        }
    }

    async function handleSidebarImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (file) await sidebarUpload(file)
    }

    const guideTypeLabel = guide.guideType === 'training_document' ? "Training Document" : "Trainer's Guide"

    return (
        <div style={{ height: '100vh', background: '#080808', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* ── Page header ──────────────────────────────────────────────────────── */}
            <div style={{
                borderBottom: '1px solid var(--line-2)',
                padding: '10px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: 'rgba(0,0,0,0.4)',
                flexShrink: 0,
            }}>
                <button
                    onClick={() => router.push(backUrl as never)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', padding: '5px 12px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0 }}
                >
                    <ArrowBack sx={{ fontSize: 12 }} /> Back
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.45rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace', marginBottom: 1 }}>
                        {'//'} {guideTypeLabel} · {guide.docRef}
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {guide.title}
                    </div>
                </div>
                <span style={{
                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                    padding: '3px 8px',
                    border: `1px solid ${statusBorder(guide.status)}`,
                    color: statusColor(guide.status),
                    flexShrink: 0,
                }}>
                    {statusLabel(guide)}
                </span>
                {isEditable && (
                    <button
                        onClick={() => setEditMode(prev => !prev)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            background: editMode ? 'rgba(219,0,29,0.12)' : 'transparent',
                            border: editMode ? '1px solid rgba(219,0,29,0.35)' : '1px solid rgba(255,255,255,0.12)',
                            color: editMode ? 'rgba(219,0,29,0.85)' : 'rgba(237,237,237,0.45)',
                            padding: '5px 14px', fontSize: '0.6rem', fontWeight: 700,
                            letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0,
                        }}
                    >
                        {editMode ? 'Done Editing' : 'Edit'}
                    </button>
                )}
            </div>

            {/* ── Two-column body ───────────────────────────────────────────────────── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Left: editor content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>
                    {/* Document backdrop */}
                    <div style={{
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        padding: '32px 40px',
                        minHeight: '100%',
                    }}>
                        <TrainingGuideEditor
                            ref={editorRef}
                            guide={guide}
                            guideId={guideId}
                            isEditable={editMode}
                            accentColor={accentColor}
                            outlineColor={outlineColor}
                            onSaved={(version, editEntry, sessionMerged) => setGuide(prev => {
                                const history = prev.editHistory ?? []
                                const newHistory = sessionMerged
                                    ? [...history.slice(0, -1), editEntry]
                                    : [...history, editEntry]
                                return { ...prev, version, editHistory: newHistory }
                            })}
                        />
                    </div>
                </div>

                {/* Right: sidebar — only shown to J3 / approvers */}
                {isJ3Context && (
                    <div style={{
                        width: 272,
                        borderLeft: '1px solid rgba(219,0,29,0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'rgba(0,0,0,0.22)',
                        flexShrink: 0,
                        overflowY: 'auto',
                    }}>

                        {/* Actions */}
                        <div style={{ padding: '18px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', marginBottom: 2, fontFamily: 'monospace' }}>{'//'} ACTIONS</div>

                            {reviewMsg && (
                                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(80,200,120,0.8)', padding: '6px 10px', border: '1px solid rgba(80,200,120,0.2)', background: 'rgba(80,200,120,0.04)' }}>
                                    {reviewMsg}
                                </div>
                            )}

                            {canApprove && guide.status === 'draft' && (
                                <button
                                    onClick={handleApprove}
                                    disabled={approvingNow}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(80,200,120,0.07)', border: '1px solid rgba(80,200,120,0.22)', color: 'rgba(80,200,120,0.82)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: approvingNow ? 'default' : 'pointer', opacity: approvingNow ? 0.6 : 1 }}
                                >
                                    <CheckCircleOutline sx={{ fontSize: 13 }} />
                                    {approvingNow ? 'Approving…' : 'Approve Guide'}
                                </button>
                            )}

                            {!canApprove && isEditable && guide.status === 'draft' && (
                                <button
                                    onClick={() => setShowReviewModal(true)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(219,0,29,0.05)', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.7)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}
                                >
                                    <RateReview sx={{ fontSize: 13 }} /> Send for Review
                                </button>
                            )}

                            {canDelete && (
                                confirmDelete ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.35)', letterSpacing: '0.06em' }}>This cannot be undone.</div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button onClick={handleDelete} disabled={deletingNow}
                                                style={{ flex: 1, padding: '6px', background: RED, border: 'none', color: '#fff', fontSize: '0.58rem', fontWeight: 800, cursor: deletingNow ? 'default' : 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                                {deletingNow ? 'Deleting…' : 'Confirm Delete'}
                                            </button>
                                            <button onClick={() => setConfirmDelete(false)}
                                                style={{ flex: 1, padding: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.58rem', cursor: 'pointer' }}>
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button onClick={() => setConfirmDelete(true)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'transparent', border: '1px solid rgba(219,0,29,0.14)', color: 'rgba(219,0,29,0.4)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                        <DeleteOutline sx={{ fontSize: 13 }} /> Delete Guide
                                    </button>
                                )
                            )}
                        </div>

                        {/* Guide info */}
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 9 }}>
                            <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace' }}>{'//'} INFO</div>
                            {[
                                { label: 'Reference',    value: guide.docRef, mono: true },
                                { label: 'Type',         value: guideTypeLabel },
                                { label: 'Version',      value: guide.version, mono: true },
                                { label: 'Last Revised', value: new Date(guide.lastRevisedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) },
                                { label: 'Created By',   value: guide.createdByName },
                            ].map(({ label, value, mono }) => (
                                <div key={label}>
                                    <div style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)', marginBottom: 2 }}>{label}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.55)', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Add Image — only in edit mode */}
                        {editMode && (
                            <div
                                style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.12s', background: sidebarDragOver ? 'rgba(219,0,29,0.06)' : 'transparent' }}
                                onDragOver={e => { e.preventDefault(); e.stopPropagation(); setSidebarDragOver(true) }}
                                onDragLeave={() => setSidebarDragOver(false)}
                                onDrop={async e => { e.preventDefault(); e.stopPropagation(); setSidebarDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) await sidebarUpload(f) }}
                            >
                                <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace', marginBottom: 10 }}>{'//'} ADD IMAGE</div>

                                {/* Main trigger button */}
                                <button
                                    onClick={() => { if (!sidebarUploading) setShowAddMenu(prev => !prev) }}
                                    disabled={sidebarUploading}
                                    style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '9px 12px', background: showAddMenu ? 'rgba(219,0,29,0.08)' : 'rgba(255,255,255,0.04)', border: `1.5px ${sidebarDragOver ? 'solid rgba(219,0,29,0.5)' : 'dashed rgba(255,255,255,0.12)'}`, color: sidebarUploading ? 'rgba(237,237,237,0.22)' : 'rgba(237,237,237,0.55)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: sidebarUploading ? 'default' : 'pointer' }}
                                >
                                    {sidebarUploading ? <CloudUploadIcon sx={{ fontSize: 15 }} /> : <AddPhotoAlternateIcon sx={{ fontSize: 15 }} />}
                                    {sidebarUploading ? 'Uploading…' : 'Add Image'}
                                </button>

                                {/* Expanded options */}
                                {showAddMenu && !sidebarUploading && (
                                    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        <button
                                            onClick={() => { setShowAddMenu(false); sidebarFileRef.current?.click() }}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(237,237,237,0.55)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', textAlign: 'left' }}
                                        >
                                            <CloudUploadIcon sx={{ fontSize: 13 }} /> Upload Image
                                        </button>
                                        <button
                                            onClick={() => { setShowAddMenu(false); setShowImgLibrary(true) }}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(237,237,237,0.55)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', textAlign: 'left' }}
                                        >
                                            <ImageIcon sx={{ fontSize: 13 }} /> Image Library
                                        </button>
                                    </div>
                                )}

                                <div style={{ marginTop: 6, fontSize: '0.54rem', color: sidebarDragOver ? 'rgba(219,0,29,0.6)' : 'rgba(237,237,237,0.18)', lineHeight: 1.4, transition: 'color 0.12s' }}>
                                    {sidebarDragOver ? 'Drop to place in document' : 'Drop an image here, or click to choose'}
                                </div>
                                <input ref={sidebarFileRef} type='file' accept='image/*' onChange={handleSidebarImageUpload} style={{ display: 'none' }} />
                            </div>
                        )}

                        {/* Colours */}
                        {editMode && (
                            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace' }}>{'//'} COLOURS</div>

                                {/* Section Accent */}
                                <div>
                                    <div style={{ fontSize: '0.44rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)', marginBottom: 6 }}>Section Accent</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <input
                                            type='color'
                                            value={accentColor}
                                            onChange={e => { setAccentColor(e.target.value); setColorInput(e.target.value) }}
                                            style={{ width: 32, height: 28, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', padding: 0, background: 'none', flexShrink: 0 }}
                                            title='Pick section accent colour'
                                        />
                                        <input
                                            type='text'
                                            value={colorInput}
                                            onChange={e => applyColor(e.target.value)}
                                            maxLength={7}
                                            placeholder='#db001d'
                                            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.7)', padding: '5px 8px', fontSize: '0.72rem', fontFamily: 'monospace', outline: 'none' }}
                                        />
                                    </div>
                                </div>

                                {/* Outline Accent */}
                                <div>
                                    <div style={{ fontSize: '0.44rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)', marginBottom: 6 }}>Outline Accent</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <input
                                            type='color'
                                            value={outlineColor}
                                            onChange={e => { setOutlineColor(e.target.value); setOutlineInput(e.target.value) }}
                                            style={{ width: 32, height: 28, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', padding: 0, background: 'none', flexShrink: 0 }}
                                            title='Pick outline accent colour'
                                        />
                                        <input
                                            type='text'
                                            value={outlineInput}
                                            onChange={e => applyOutlineColor(e.target.value)}
                                            maxLength={7}
                                            placeholder='#db001d'
                                            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.7)', padding: '5px 8px', fontSize: '0.72rem', fontFamily: 'monospace', outline: 'none' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* History — collapsible */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <button
                                onClick={() => setHistoryOpen(prev => !prev)}
                                style={{ padding: '10px 16px 8px', display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                            >
                                <History sx={{ fontSize: 12, color: 'rgba(219,0,29,0.5)' }} />
                                <span style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace', flex: 1 }}>HISTORY</span>
                                {historyOpen
                                    ? <ExpandLess sx={{ fontSize: 14, color: 'rgba(219,0,29,0.4)' }} />
                                    : <ExpandMore sx={{ fontSize: 14, color: 'rgba(219,0,29,0.4)' }} />
                                }
                            </button>
                            {historyOpen && (
                                <div>
                                    {(guide.editHistory ?? []).length === 0 && (
                                        <div style={{ padding: '12px 16px', fontSize: '0.62rem', color: 'rgba(237,237,237,0.18)' }}>No history yet.</div>
                                    )}
                                    {(guide.editHistory ?? []).slice().reverse().map((entry, i) => {
                                        const history = guide.editHistory ?? []
                                        const chronIdx = history.length - 1 - i
                                        const prevEntry = chronIdx > 0 ? history[chronIdx - 1] : null
                                        const clickable = entry.snapshot != null || (entry.changes?.length ?? 0) > 0
                                        return (
                                            <div key={i}
                                                onClick={() => clickable && setDiffEntry({ entry, prev: prevEntry })}
                                                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '8px 16px', cursor: clickable ? 'pointer' : 'default', transition: 'background 0.12s' }}
                                                onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                                    <span style={{
                                                        fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                                                        padding: '1px 5px', flexShrink: 0,
                                                        border: `1px solid ${entry.type === 'approved' ? 'rgba(80,200,120,0.22)' : entry.type === 'created' ? 'rgba(100,160,240,0.22)' : 'rgba(255,255,255,0.07)'}`,
                                                        color: entry.type === 'approved' ? 'rgba(80,200,120,0.8)' : entry.type === 'created' ? 'rgba(100,160,240,0.8)' : 'rgba(237,237,237,0.28)',
                                                    }}>
                                                        {entry.type === 'approved' ? `v${entry.version}` : entry.type === 'created' ? 'Created' : 'Edit'}
                                                    </span>
                                                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.58)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.byName}</span>
                                                    {clickable && <span style={{ fontSize: '0.5rem', color: 'rgba(219,0,29,0.4)', flexShrink: 0 }}>↗</span>}
                                                </div>
                                                <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.22)', marginBottom: entry.changes?.length ? 4 : 0 }}>
                                                    {new Date(entry.at).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                                {entry.changes?.map((c, ci) => (
                                                    <div key={ci} style={{ fontSize: '0.56rem', color: 'rgba(237,237,237,0.28)', display: 'flex', gap: 4 }}>
                                                        <span style={{ color: 'rgba(219,0,29,0.4)', flexShrink: 0 }}>·</span>{c}
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── History diff modal ───────────────────────────────────────────────── */}
            {diffEntry && (
                <HistoryDiffModal
                    entry={diffEntry.entry}
                    prev={diffEntry.prev}
                    onClose={() => setDiffEntry(null)}
                />
            )}

            {/* ── Image Library modal ───────────────────────────────────────────────── */}
            {showImgLibrary && (
                <ImageLibraryModal
                    onSelect={url => { editorRef.current?.addFreeImage(url) }}
                    onClose={() => setShowImgLibrary(false)}
                />
            )}

            {/* ── Send for Review modal ─────────────────────────────────────────────── */}
            {showReviewModal && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setShowReviewModal(false) }}
                >
                    <div style={{ background: '#0d0d0d', border: `1px solid rgba(219,0,29,0.22)`, borderTop: `3px solid ${RED}`, padding: 28, width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.85)' }}>Send for Review</span>
                            <button onClick={() => setShowReviewModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.35)', display: 'flex' }}>
                                <Close sx={{ fontSize: 18 }} />
                            </button>
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.5, margin: 0 }}>
                            A review task will be created and assigned to J3 Department Leaders.
                        </p>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 6 }}>Comments (optional)</label>
                            <textarea
                                value={reviewComments}
                                onChange={e => setReviewComments(e.target.value)}
                                placeholder='Notes for reviewers…'
                                rows={3}
                                style={{ ...inputSx, resize: 'vertical' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 6 }}>Suggested Review Date (optional)</label>
                            <input type='datetime-local' value={reviewDate} onChange={e => setReviewDate(e.target.value)} style={inputSx} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowReviewModal(false)} style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Cancel</button>
                            <button onClick={handleSendReview} disabled={sendingReview}
                                style={{ padding: '8px 20px', background: sendingReview ? 'rgba(219,0,29,0.35)' : RED, border: 'none', color: '#fff', fontSize: '0.62rem', fontWeight: 800, cursor: sendingReview ? 'default' : 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                {sendingReview ? 'Sending…' : 'Send for Review'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
