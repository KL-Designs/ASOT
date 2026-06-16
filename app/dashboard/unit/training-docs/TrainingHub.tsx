'use client'

import { useEffect, useState } from 'react'
import { Add, CheckCircle, Cancel, Delete, Edit, Refresh, Visibility, VisibilityOff } from '@mui/icons-material'
import EventsTab from './EventsTab'

const RED = '#db001d'
type Tab = 'courses' | 'events'

const CATEGORY_ORDER = ['BCT', 'Medical', 'CQB', 'Fires', 'Aviation', 'Communications', 'Leadership', 'Special', 'Armoured', 'Proficiency']

const BILLET_LABELS: Record<string, string> = {
    j3Bct12: 'BCT',
    j3OtherTrainings: 'Other Training',
}

type TType = {
    _id: string
    name: string
    category: string
    billetField: string
    billetPoints: number
    description?: string
    isActive: boolean
}

type TDoc = {
    _id: string
    trainingTypeId: string
    title: string
    url: string
    description?: string
    approvalStatus: 'pending' | 'approved' | 'rejected'
    rejectionNote?: string
    uploadedById: string
    uploadedByName: string
    approvedByName?: string
}

type ModalState = {
    mode: 'create' | 'edit'
    id?: string
    name: string
    category: string
    billetField: string
    billetPoints: number
    description: string
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderBottom: '2px solid rgba(219,0,29,0.4)',
    color: 'rgba(237,237,237,0.9)',
    fontSize: '0.85rem',
    padding: '8px 10px',
    outline: 'none',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>
                {label}
            </label>
            {children}
        </div>
    )
}

function TypeCard({ type, isJ3Lead, toggling, onEdit, onToggle, docsExpanded, docsCount, onToggleDocs }: {
    type: TType
    isJ3Lead: boolean
    toggling: boolean
    onEdit: () => void
    onToggle: () => void
    docsExpanded: boolean
    docsCount?: number
    onToggleDocs: () => void
}) {
    const inactive = !type.isActive
    return (
        <div style={{
            border: '1px solid rgba(255,255,255,0.07)',
            borderTop: `2px solid ${inactive ? 'rgba(255,255,255,0.08)' : 'rgba(219,0,29,0.3)'}`,
            borderBottom: docsExpanded ? 'none' : '1px solid rgba(255,255,255,0.07)',
            background: inactive ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.02)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            opacity: inactive ? 0.5 : 1,
            transition: 'opacity 0.15s',
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: '0.83rem', fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)', lineHeight: 1.35 }}>
                    {type.name}
                </div>
                {inactive && (
                    <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '2px 6px', flexShrink: 0, marginTop: 2 }}>
                        Inactive
                    </span>
                )}
            </div>
            {type.description && (
                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.5 }}>{type.description}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', border: '1px solid rgba(219,0,29,0.25)', padding: '2px 7px' }}>
                        {BILLET_LABELS[type.billetField] ?? type.billetField}
                    </span>
                    <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.22)', letterSpacing: '0.06em' }}>
                        {type.billetPoints} pt{type.billetPoints !== 1 ? 's' : ''}
                    </span>
                </div>
                {isJ3Lead && (
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button type='button' onClick={onEdit}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            <Edit style={{ fontSize: 11 }} /> Edit
                        </button>
                        <button type='button' onClick={onToggle} disabled={toggling}
                            style={{ padding: '4px 9px', background: 'transparent', border: `1px solid ${type.isActive ? 'rgba(219,0,29,0.2)' : 'rgba(100,200,100,0.2)'}`, color: type.isActive ? 'rgba(219,0,29,0.55)' : 'rgba(100,200,100,0.6)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: toggling ? 'default' : 'pointer', opacity: toggling ? 0.5 : 1 }}>
                            {type.isActive ? 'Disable' : 'Enable'}
                        </button>
                    </div>
                )}
            </div>
            <button type='button' onClick={onToggleDocs}
                style={{ alignSelf: 'flex-start', padding: '3px 8px', background: docsExpanded ? 'rgba(255,255,255,0.05)' : 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.3)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', marginTop: 2 }}>
                {docsExpanded ? '▲ Docs' : `▼ Docs${docsCount !== undefined ? ` (${docsCount})` : ''}`}
            </button>
        </div>
    )
}

export default function TrainingHub({ isJ3Lead, isTrainer, myId }: { isJ3Lead: boolean; isTrainer: boolean; myId: string }) {
    const [tab, setTab] = useState<Tab>('courses')
    const [types, setTypes] = useState<TType[]>([])
    const [loading, setLoading] = useState(true)
    const [showInactive, setShowInactive] = useState(false)
    const [modal, setModal] = useState<ModalState | null>(null)
    const [saving, setSaving] = useState(false)
    const [seeding, setSeeding] = useState(false)
    const [togglingId, setTogglingId] = useState<string | null>(null)

    // Docs state
    const [docsExpanded, setDocsExpanded] = useState<string | null>(null)
    const [docsCache, setDocsCache] = useState<Record<string, TDoc[]>>({})
    const [docsLoading, setDocsLoading] = useState(false)
    const [addDocTypeId, setAddDocTypeId] = useState<string | null>(null)
    const [addDocForm, setAddDocForm] = useState<{ title: string; url: string; description: string }>({ title: '', url: '', description: '' })
    const [addingDoc, setAddingDoc] = useState(false)
    const [deletingDocId, setDeletingDocId] = useState<string | null>(null)
    const [approvingDocId, setApprovingDocId] = useState<string | null>(null)
    const [rejectDocModal, setRejectDocModal] = useState<{ docId: string; typeId: string; note: string } | null>(null)
    const [rejectingDoc, setRejectingDoc] = useState(false)

    useEffect(() => {
        fetch('/api/training/types')
            .then(r => r.json())
            .then(data => { setTypes(data.types ?? []); setLoading(false) })
            .catch(() => setLoading(false))
    }, [])

    async function handleSave() {
        if (!modal || saving) return
        setSaving(true)
        try {
            const body = {
                name: modal.name.trim(),
                category: modal.category.trim(),
                billetField: modal.billetField,
                billetPoints: modal.billetPoints,
                description: modal.description.trim() || undefined,
            }
            if (modal.mode === 'create') {
                const res = await fetch('/api/training/types', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                })
                if (!res.ok) return
                const created = await res.json()
                setTypes(prev => [...prev, created].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)))
            } else {
                const res = await fetch(`/api/training/types/${modal.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                })
                if (!res.ok) return
                const updated = await res.json()
                setTypes(prev => prev.map(t => t._id === updated._id ? updated : t))
            }
            setModal(null)
        } finally {
            setSaving(false)
        }
    }

    async function handleToggle(type: TType) {
        if (togglingId) return
        setTogglingId(type._id)
        try {
            const res = await fetch(`/api/training/types/${type._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !type.isActive }),
            })
            if (!res.ok) return
            const updated = await res.json()
            setTypes(prev => prev.map(t => t._id === updated._id ? updated : t))
        } finally {
            setTogglingId(null)
        }
    }

    async function handleSeed() {
        if (seeding) return
        setSeeding(true)
        try {
            const res = await fetch('/api/training/types/seed', { method: 'POST' })
            if (!res.ok) return
            const data = await res.json()
            if (data.inserted > 0) {
                const refresh = await fetch('/api/training/types').then(r => r.json())
                setTypes(refresh.types ?? [])
            }
        } finally {
            setSeeding(false)
        }
    }

    async function handleToggleDocs(typeId: string) {
        if (docsExpanded === typeId) { setDocsExpanded(null); return }
        setDocsExpanded(typeId)
        if (docsCache[typeId] !== undefined) return
        setDocsLoading(true)
        try {
            const res = await fetch(`/api/training/types/${typeId}/docs`)
            if (!res.ok) return
            const data = await res.json()
            setDocsCache(prev => ({ ...prev, [typeId]: data.docs ?? [] }))
        } finally {
            setDocsLoading(false)
        }
    }

    async function handleAddDoc(typeId: string) {
        if (addingDoc || !addDocForm.title.trim() || !addDocForm.url.trim()) return
        setAddingDoc(true)
        try {
            const res = await fetch(`/api/training/types/${typeId}/docs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: addDocForm.title.trim(),
                    url: addDocForm.url.trim(),
                    description: addDocForm.description.trim() || undefined,
                }),
            })
            if (!res.ok) return
            const created = await res.json()
            setDocsCache(prev => ({ ...prev, [typeId]: [...(prev[typeId] ?? []), created] }))
            setAddDocForm({ title: '', url: '', description: '' })
            setAddDocTypeId(null)
        } finally {
            setAddingDoc(false)
        }
    }

    async function handleDeleteDoc(typeId: string, docId: string) {
        if (deletingDocId) return
        setDeletingDocId(docId)
        try {
            const res = await fetch(`/api/training/types/${typeId}/docs/${docId}`, { method: 'DELETE' })
            if (!res.ok) return
            setDocsCache(prev => ({ ...prev, [typeId]: (prev[typeId] ?? []).filter(d => d._id !== docId) }))
        } finally {
            setDeletingDocId(null)
        }
    }

    async function handleApproveDoc(typeId: string, docId: string) {
        if (approvingDocId) return
        setApprovingDocId(docId)
        try {
            const res = await fetch(`/api/training/types/${typeId}/docs/${docId}/approve`, { method: 'POST' })
            if (!res.ok) return
            const updated = await res.json()
            setDocsCache(prev => ({ ...prev, [typeId]: (prev[typeId] ?? []).map(d => d._id === docId ? updated : d) }))
        } finally {
            setApprovingDocId(null)
        }
    }

    async function handleRejectDoc() {
        if (!rejectDocModal || rejectingDoc) return
        setRejectingDoc(true)
        try {
            const res = await fetch(`/api/training/types/${rejectDocModal.typeId}/docs/${rejectDocModal.docId}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note: rejectDocModal.note }),
            })
            if (!res.ok) return
            const updated = await res.json()
            setDocsCache(prev => ({
                ...prev,
                [rejectDocModal.typeId]: (prev[rejectDocModal.typeId] ?? []).map(d => d._id === rejectDocModal.docId ? updated : d),
            }))
            setRejectDocModal(null)
        } finally {
            setRejectingDoc(false)
        }
    }

    function openCreate() {
        setModal({ mode: 'create', name: '', category: 'BCT', billetField: 'j3Bct12', billetPoints: 1, description: '' })
    }

    function openEdit(t: TType) {
        setModal({ mode: 'edit', id: t._id, name: t.name, category: t.category, billetField: t.billetField, billetPoints: t.billetPoints, description: t.description ?? '' })
    }

    const canSubmitDoc = isJ3Lead || isTrainer
    const visible = types.filter(t => (isJ3Lead && showInactive) ? true : t.isActive)
    const orderedCats = [
        ...CATEGORY_ORDER.filter(c => visible.some(t => t.category === c)),
        ...[...new Set(visible.map(t => t.category))].filter(c => !CATEGORY_ORDER.includes(c)).sort(),
    ]

    function renderDocsPanel(t: TType) {
        const allDocs = docsCache[t._id] ?? []
        const pendingDocs = allDocs.filter(d => d.approvalStatus === 'pending')
        const approvedDocs = allDocs.filter(d => d.approvalStatus === 'approved')
        // Trainers (non-leads) see their own non-approved submissions
        const myPendingOrRejected = !isJ3Lead ? allDocs.filter(d => d.approvalStatus !== 'approved' && d.uploadedById === myId) : []

        return (
            <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderTop: 'none', background: 'rgba(0,0,0,0.15)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Pending docs section — J3 leads only */}
                {isJ3Lead && pendingDocs.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,200,50,0.6)', marginBottom: 2 }}>
                            Pending Review ({pendingDocs.length})
                        </div>
                        {pendingDocs.map(doc => (
                            <div key={doc._id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(255,200,50,0.04)', border: '1px solid rgba(255,200,50,0.1)', padding: '8px 10px' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(237,237,237,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
                                    {doc.description && <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', marginTop: 2 }}>{doc.description}</div>}
                                    <div style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.2)', marginTop: 2 }}>Submitted by {doc.uploadedByName}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                    <button type='button' onClick={() => handleApproveDoc(t._id, doc._id)}
                                        disabled={!!approvingDocId}
                                        style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: 'rgba(80,200,120,0.1)', border: '1px solid rgba(80,200,120,0.3)', color: 'rgba(80,200,120,0.85)', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: approvingDocId ? 'default' : 'pointer', opacity: approvingDocId ? 0.5 : 1 }}>
                                        <CheckCircle style={{ fontSize: 10 }} /> Approve
                                    </button>
                                    <button type='button' onClick={() => setRejectDocModal({ docId: doc._id, typeId: t._id, note: '' })}
                                        style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.25)', color: 'rgba(219,0,29,0.7)', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                        <Cancel style={{ fontSize: 10 }} /> Reject
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Own pending/rejected submissions — trainer view */}
                {myPendingOrRejected.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', marginBottom: 2 }}>My Submissions</div>
                        {myPendingOrRejected.map(doc => (
                            <div key={doc._id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'rgba(237,237,237,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
                                    {doc.approvalStatus === 'rejected' && doc.rejectionNote && (
                                        <div style={{ fontSize: '0.6rem', color: 'rgba(219,0,29,0.6)', marginTop: 2, borderLeft: '2px solid rgba(219,0,29,0.3)', paddingLeft: 6 }}>{doc.rejectionNote}</div>
                                    )}
                                    <span style={{ display: 'inline-block', marginTop: 3, fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: doc.approvalStatus === 'pending' ? 'rgba(255,200,50,0.7)' : 'rgba(219,0,29,0.6)', border: `1px solid ${doc.approvalStatus === 'pending' ? 'rgba(255,200,50,0.25)' : 'rgba(219,0,29,0.2)'}`, padding: '1px 5px' }}>
                                        {doc.approvalStatus === 'pending' ? 'Pending Review' : 'Rejected'}
                                    </span>
                                </div>
                                <button type='button' onClick={() => handleDeleteDoc(t._id, doc._id)}
                                    disabled={deletingDocId === doc._id}
                                    style={{ flexShrink: 0, padding: '3px 6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.25)', fontSize: '0.55rem', cursor: deletingDocId === doc._id ? 'default' : 'pointer', opacity: deletingDocId === doc._id ? 0.4 : 1 }}>
                                    <Delete style={{ fontSize: 11 }} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add / Submit document button or form */}
                {canSubmitDoc && (
                    addDocTypeId === t._id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <input value={addDocForm.title} onChange={e => setAddDocForm(p => ({ ...p, title: e.target.value }))}
                                placeholder='Document title *' autoFocus
                                style={{ ...inputStyle, fontSize: '0.78rem', padding: '6px 8px' }} />
                            <input value={addDocForm.url} onChange={e => setAddDocForm(p => ({ ...p, url: e.target.value }))}
                                placeholder='URL *'
                                style={{ ...inputStyle, fontSize: '0.78rem', padding: '6px 8px' }} />
                            <input value={addDocForm.description} onChange={e => setAddDocForm(p => ({ ...p, description: e.target.value }))}
                                placeholder='Short description (optional)'
                                style={{ ...inputStyle, fontSize: '0.78rem', padding: '6px 8px' }} />
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button type='button' onClick={() => { setAddDocTypeId(null); setAddDocForm({ title: '', url: '', description: '' }) }}
                                    style={{ padding: '4px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.35)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                                <button type='button' onClick={() => handleAddDoc(t._id)}
                                    disabled={!addDocForm.title.trim() || !addDocForm.url.trim() || addingDoc}
                                    style={{ padding: '4px 10px', background: addDocForm.title.trim() && addDocForm.url.trim() && !addingDoc ? RED : 'rgba(219,0,29,0.3)', border: 'none', color: '#fff', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: addDocForm.title.trim() && addDocForm.url.trim() && !addingDoc ? 'pointer' : 'default' }}>
                                    {addingDoc ? 'Submitting…' : isJ3Lead ? 'Add' : 'Submit for Review'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button type='button' onClick={() => { setAddDocTypeId(t._id); setAddDocForm({ title: '', url: '', description: '' }) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', padding: '4px 9px', background: 'transparent', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.6)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            <Add style={{ fontSize: 11 }} /> {isJ3Lead ? 'Add Document' : 'Submit Document'}
                        </button>
                    )
                )}

                {/* Approved docs list */}
                {docsLoading && docsCache[t._id] === undefined ? (
                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)' }}>Loading…</div>
                ) : approvedDocs.length === 0 && addDocTypeId !== t._id ? (
                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.04em' }}>No approved documents</div>
                ) : (
                    approvedDocs.map(doc => (
                        <div key={doc._id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <a href={doc.url} target='_blank' rel='noopener noreferrer'
                                    style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(219,0,29,0.75)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                                    {doc.title}
                                </a>
                                {doc.description && <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>{doc.description}</div>}
                                <div style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.18)', marginTop: 2, letterSpacing: '0.04em' }}>by {doc.uploadedByName}</div>
                            </div>
                            {isJ3Lead && (
                                <button type='button' onClick={() => handleDeleteDoc(t._id, doc._id)}
                                    disabled={deletingDocId === doc._id}
                                    style={{ flexShrink: 0, padding: '3px 6px', background: 'transparent', border: '1px solid rgba(219,0,29,0.15)', color: 'rgba(219,0,29,0.4)', fontSize: '0.55rem', cursor: deletingDocId === doc._id ? 'default' : 'pointer', opacity: deletingDocId === doc._id ? 0.4 : 1 }}>
                                    <Delete style={{ fontSize: 11 }} />
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Page header */}
            <div style={{ padding: 'clamp(1.5rem, 3vw, 2.5rem)', paddingBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                    <div>
                        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', marginBottom: 4 }}>{'//'} UNIT / J3</div>
                        <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Training Hub</h1>
                    </div>
                    {tab === 'courses' && isJ3Lead && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button type='button' onClick={handleSeed} disabled={seeding}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.35)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: seeding ? 'default' : 'pointer', opacity: seeding ? 0.5 : 1 }}>
                                <Refresh style={{ fontSize: 13 }} /> {seeding ? 'Seeding…' : 'Seed Defaults'}
                            </button>
                            <button type='button' onClick={() => setShowInactive(v => !v)}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: showInactive ? 'rgba(255,255,255,0.05)' : 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: showInactive ? 'rgba(237,237,237,0.65)' : 'rgba(237,237,237,0.35)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                {showInactive ? <VisibilityOff style={{ fontSize: 13 }} /> : <Visibility style={{ fontSize: 13 }} />}
                                {showInactive ? 'Hide Inactive' : 'Show Inactive'}
                            </button>
                            <button type='button' onClick={openCreate}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0 }}>
                                <Add style={{ fontSize: 15 }} /> Add Type
                            </button>
                        </div>
                    )}
                </div>

                {/* Tab navigation */}
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {(['courses', 'events'] as Tab[]).map(t => (
                        <button key={t} type='button' onClick={() => setTab(t)}
                            style={{ padding: '8px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? RED : 'transparent'}`, color: tab === t ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.35)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', marginBottom: -1, transition: 'color 0.15s, border-color 0.15s' }}>
                            {t === 'courses' ? 'Courses' : 'Events'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab: Courses */}
            {tab === 'courses' && (
                <div style={{ padding: 'clamp(1.5rem, 3vw, 2.5rem)', paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 28 }}>
                    {loading ? (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.1em' }}>Loading…</div>
                    ) : visible.length === 0 ? (
                        <div style={{ padding: '56px 0', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>
                                {types.length === 0 ? 'No training courses configured' : 'No active training courses'}
                            </div>
                            {isJ3Lead && types.length === 0 && (
                                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.15)', marginTop: 8 }}>
                                    Click Seed Defaults to populate from the standard certification list
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                            {orderedCats.map(cat => {
                                const items = visible.filter(t => t.category === cat)
                                if (!items.length) return null
                                return (
                                    <div key={cat}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                                            <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', flexShrink: 0 }}>{cat}</span>
                                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                                            <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.1em', flexShrink: 0 }}>{items.length}</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                                            {items.map(t => (
                                                <div key={t._id} style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <TypeCard
                                                        type={t}
                                                        isJ3Lead={isJ3Lead}
                                                        toggling={togglingId === t._id}
                                                        onEdit={() => openEdit(t)}
                                                        onToggle={() => handleToggle(t)}
                                                        docsExpanded={docsExpanded === t._id}
                                                        docsCount={docsCache[t._id]?.filter(d => d.approvalStatus === 'approved').length}
                                                        onToggleDocs={() => handleToggleDocs(t._id)}
                                                    />
                                                    {docsExpanded === t._id && renderDocsPanel(t)}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Tab: Events */}
            {tab === 'events' && <EventsTab isJ3Lead={isJ3Lead} isTrainer={isTrainer} />}

            {/* Course type create / edit modal */}
            {modal && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
                >
                    <div style={{ background: '#0e0e0e', border: `1px solid rgba(219,0,29,0.25)`, borderTop: `3px solid ${RED}`, padding: 28, width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 6 }}>
                                {'//'} {modal.mode === 'create' ? 'ADD' : 'EDIT'} TRAINING TYPE
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                                {modal.mode === 'create' ? 'New Training Course' : 'Edit Training Course'}
                            </h3>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <Field label='Course Name *'>
                                <input value={modal.name} onChange={e => setModal(m => m && ({ ...m, name: e.target.value }))}
                                    placeholder='e.g. Advanced Medical Course' autoFocus style={inputStyle} />
                            </Field>
                            <Field label='Category *'>
                                <input value={modal.category} onChange={e => setModal(m => m && ({ ...m, category: e.target.value }))}
                                    placeholder='e.g. Medical' list='training-cat-list' style={inputStyle} />
                                <datalist id='training-cat-list'>
                                    {CATEGORY_ORDER.map(c => <option key={c} value={c} />)}
                                </datalist>
                            </Field>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Field label='Trainer Billet Type *'>
                                    <select value={modal.billetField}
                                        onChange={e => {
                                            const field = e.target.value
                                            setModal(m => m && ({ ...m, billetField: field, billetPoints: field === 'j3Bct12' ? 1 : 2 }))
                                        }}
                                        style={{ ...inputStyle, cursor: 'pointer' }}>
                                        <option value='j3Bct12'>BCT (1 pt default)</option>
                                        <option value='j3OtherTrainings'>Other Training (2 pts default)</option>
                                    </select>
                                </Field>
                                <Field label='Trainer Billet Points *'>
                                    <input type='number' min={0} step={1} value={modal.billetPoints}
                                        onChange={e => setModal(m => m && ({ ...m, billetPoints: Math.max(0, parseInt(e.target.value) || 0) }))}
                                        style={inputStyle} />
                                </Field>
                            </div>
                            <Field label='Description'>
                                <input value={modal.description} onChange={e => setModal(m => m && ({ ...m, description: e.target.value }))}
                                    placeholder='Short description (optional)' style={inputStyle} />
                            </Field>
                        </div>

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                            <button type='button' onClick={() => setModal(null)}
                                style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.45)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type='button' onClick={handleSave} disabled={!modal.name.trim() || !modal.category.trim() || saving}
                                style={{ padding: '8px 20px', background: modal.name.trim() && modal.category.trim() && !saving ? RED : 'rgba(219,0,29,0.3)', border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: modal.name.trim() && modal.category.trim() && !saving ? 'pointer' : 'default' }}>
                                {saving ? 'Saving…' : modal.mode === 'create' ? 'Add Course' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Doc reject modal */}
            {rejectDocModal && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setRejectDocModal(null) }}
                >
                    <div style={{ background: '#0e0e0e', border: '1px solid rgba(219,0,29,0.25)', borderTop: `3px solid ${RED}`, padding: 28, width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 6 }}>{'//'} REJECT DOCUMENT</div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Reject Submission</h3>
                        </div>
                        <Field label='Reason (optional)'>
                            <input value={rejectDocModal.note}
                                onChange={e => setRejectDocModal(m => m && ({ ...m, note: e.target.value }))}
                                placeholder='e.g. Broken link or incorrect format'
                                autoFocus style={inputStyle} />
                        </Field>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button type='button' onClick={() => setRejectDocModal(null)}
                                style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.45)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type='button' onClick={handleRejectDoc} disabled={rejectingDoc}
                                style={{ padding: '8px 20px', background: rejectingDoc ? 'rgba(219,0,29,0.3)' : RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: rejectingDoc ? 'default' : 'pointer' }}>
                                {rejectingDoc ? 'Rejecting…' : 'Reject'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
