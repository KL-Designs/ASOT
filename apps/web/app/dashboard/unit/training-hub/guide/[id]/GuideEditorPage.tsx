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
                borderBottom: '1px solid rgba(219,0,29,0.3)',
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
                    <div style={{ fontSize: '0.45rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', fontFamily: 'monospace', marginBottom: 1 }}>
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
                            onSaved={version => setGuide(prev => ({ ...prev, version }))}
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
                            <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 2, fontFamily: 'monospace' }}>{'//'} ACTIONS</div>

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
                            <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', fontFamily: 'monospace' }}>{'//'} INFO</div>
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
                                <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', fontFamily: 'monospace', marginBottom: 10 }}>{'//'} ADD IMAGE</div>

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
                                <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', fontFamily: 'monospace' }}>{'//'} COLOURS</div>

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
                                <span style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', fontFamily: 'monospace', flex: 1 }}>HISTORY</span>
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
                                    {(guide.editHistory ?? []).slice().reverse().map((entry, i) => (
                                        <div key={i} style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{
                                                    fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                                                    padding: '1px 5px',
                                                    border: `1px solid ${entry.type === 'approved' ? 'rgba(80,200,120,0.22)' : entry.type === 'created' ? 'rgba(100,160,240,0.22)' : 'rgba(255,255,255,0.07)'}`,
                                                    color: entry.type === 'approved' ? 'rgba(80,200,120,0.8)' : entry.type === 'created' ? 'rgba(100,160,240,0.8)' : 'rgba(237,237,237,0.28)',
                                                }}>
                                                    {entry.type === 'approved' ? `v${entry.version}` : entry.type === 'created' ? 'Created' : 'Edit'}
                                                </span>
                                                <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.58)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.byName}</span>
                                            </div>
                                            <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.22)' }}>
                                                {new Date(entry.at).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

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
