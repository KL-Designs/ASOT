'use client'

import { useEffect, useState } from 'react'
import { ArrowBack, Add, Edit, Delete, Search } from '@mui/icons-material'
import CollabEditor from '@/components/editor/CollabEditor'

const RED = '#db001d'
const SOP_CATEGORIES = ['General', 'Operations', 'Training', 'Administration', 'Communications'] as const
type SopCat = typeof SOP_CATEGORIES[number]

type SopItem = {
    _id: string
    title: string
    category: SopCat
    description?: string
    createdAt: string
    updatedAt: string
    createdByName: string
    updatedByName?: string
}

type View = { type: 'list' } | { type: 'document'; sop: SopItem }

export default function SopsPanel({ isJ4 }: { isJ4: boolean }) {
    const [view, setView] = useState<View>({ type: 'list' })
    const [sops, setSops] = useState<SopItem[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    // Create modal state
    const [showCreate, setShowCreate] = useState(false)
    const [creating, setCreating] = useState(false)
    const [newTitle, setNewTitle] = useState('')
    const [newCategory, setNewCategory] = useState<SopCat>('General')
    const [newDescription, setNewDescription] = useState('')

    // Document view edit/delete state
    const [editingMeta, setEditingMeta] = useState(false)
    const [editTitle, setEditTitle] = useState('')
    const [editCategory, setEditCategory] = useState<SopCat>('General')
    const [editDescription, setEditDescription] = useState('')
    const [savingMeta, setSavingMeta] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [deleting, setDeleting] = useState(false)

    useEffect(() => {
        fetch('/api/sops')
            .then(r => r.json())
            .then(data => { setSops(data.sops ?? []); setLoading(false) })
            .catch(() => setLoading(false))
    }, [])

    function timeAgo(dateStr: string) {
        const diff = Date.now() - new Date(dateStr).getTime()
        const days = Math.floor(diff / 86400000)
        if (days === 0) return 'Today'
        if (days === 1) return 'Yesterday'
        if (days < 7) return `${days} days ago`
        const weeks = Math.floor(days / 7)
        if (weeks === 1) return '1 week ago'
        if (weeks < 5) return `${weeks} weeks ago`
        const months = Math.floor(days / 30)
        if (months === 1) return '1 month ago'
        return `${months} months ago`
    }

    async function handleCreate() {
        if (!newTitle.trim() || creating) return
        setCreating(true)
        try {
            const res = await fetch('/api/sops', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle.trim(), category: newCategory, description: newDescription.trim() || undefined }),
            })
            if (!res.ok) return
            const sop = await res.json()
            setSops(prev => [...prev, sop].sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title)))
            setShowCreate(false)
            setNewTitle('')
            setNewCategory('General')
            setNewDescription('')
            setView({ type: 'document', sop })
        } finally {
            setCreating(false)
        }
    }

    async function handleSaveMeta() {
        if (view.type !== 'document' || savingMeta) return
        setSavingMeta(true)
        try {
            const res = await fetch(`/api/sops/${view.sop._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: editTitle, category: editCategory, description: editDescription || undefined }),
            })
            if (!res.ok) return
            const updated = await res.json()
            setSops(prev => prev.map(s => s._id === updated._id ? updated : s))
            setView({ type: 'document', sop: updated })
            setEditingMeta(false)
        } finally {
            setSavingMeta(false)
        }
    }

    async function handleDelete() {
        if (view.type !== 'document' || deleting) return
        setDeleting(true)
        try {
            await fetch(`/api/sops/${view.sop._id}`, { method: 'DELETE' })
            setSops(prev => prev.filter(s => s._id !== view.sop._id))
            setView({ type: 'list' })
            setConfirmDelete(false)
        } finally {
            setDeleting(false)
        }
    }

    function openDocument(sop: SopItem) {
        setView({ type: 'document', sop })
        setEditingMeta(false)
        setConfirmDelete(false)
    }

    function backToList() {
        setView({ type: 'list' })
        setEditingMeta(false)
        setConfirmDelete(false)
    }

    // ── Document view ────────────────────────────────────────────────────────────
    if (view.type === 'document') {
        const sop = view.sop
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 'clamp(1.5rem, 3vw, 2.5rem)' }}>
                {/* Document header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <button type='button' onClick={backToList}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'rgba(237,237,237,0.4)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', padding: '4px 0', flexShrink: 0, marginTop: 4, transition: 'color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.85)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.4)')}
                    >
                        <ArrowBack style={{ fontSize: 13 }} /> Back
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                        {editingMeta ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder='SOP Title'
                                    style={{ background: 'transparent', border: 'none', borderBottom: `2px solid ${RED}`, color: 'rgba(237,237,237,0.95)', fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', outline: 'none', padding: '2px 0', width: '100%' }}
                                />
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    <select value={editCategory} onChange={e => setEditCategory(e.target.value as SopCat)}
                                        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.85)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', padding: '5px 10px', outline: 'none', cursor: 'pointer' }}>
                                        {SOP_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <input value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder='Short description (optional)'
                                        style={{ flex: 1, minWidth: 180, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.7)', fontSize: '0.8rem', outline: 'none', padding: '3px 0' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type='button' onClick={handleSaveMeta} disabled={savingMeta || !editTitle.trim()}
                                        style={{ padding: '6px 16px', background: RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', opacity: savingMeta ? 0.6 : 1 }}>
                                        {savingMeta ? 'Saving…' : 'Save'}
                                    </button>
                                    <button type='button' onClick={() => setEditingMeta(false)}
                                        style={{ padding: '6px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.5)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.95)' }}>{sop.title}</h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: `rgba(219,0,29,0.8)`, border: `1px solid rgba(219,0,29,0.3)`, padding: '2px 8px' }}>{sop.category}</span>
                                    {sop.description && <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.45)' }}>{sop.description}</span>}
                                    <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)', marginLeft: 'auto' }}>Updated {timeAgo(sop.updatedAt)}</span>
                                </div>
                            </>
                        )}
                    </div>

                    {isJ4 && !editingMeta && (
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginTop: 2 }}>
                            <button type='button'
                                onClick={() => { setEditTitle(sop.title); setEditCategory(sop.category); setEditDescription(sop.description || ''); setEditingMeta(true); setConfirmDelete(false) }}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.5)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.color = 'rgba(237,237,237,0.9)' }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(237,237,237,0.5)' }}
                            >
                                <Edit style={{ fontSize: 13 }} /> Edit Details
                            </button>

                            {confirmDelete ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: '0.6rem', color: 'rgba(219,0,29,0.8)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Delete SOP?</span>
                                    <button type='button' onClick={handleDelete} disabled={deleting}
                                        style={{ padding: '5px 12px', background: 'rgba(219,0,29,0.15)', border: '1px solid rgba(219,0,29,0.5)', color: 'rgba(219,0,29,0.9)', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                        {deleting ? '…' : 'Confirm'}
                                    </button>
                                    <button type='button' onClick={() => setConfirmDelete(false)}
                                        style={{ padding: '5px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                        No
                                    </button>
                                </div>
                            ) : (
                                <button type='button' onClick={() => setConfirmDelete(true)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'transparent', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.5)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(219,0,29,0.5)'; e.currentTarget.style.color = 'rgba(219,0,29,0.9)' }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(219,0,29,0.2)'; e.currentTarget.style.color = 'rgba(219,0,29,0.5)' }}
                                >
                                    <Delete style={{ fontSize: 13 }} /> Delete
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Editor */}
                <CollabEditor
                    documentId={`sop-${sop._id}`}
                    uploadUrl='/api/upload'
                    defaultSectionTitle='Section'
                    readOnly={!isJ4}
                    themeColor={RED}
                />
            </div>
        )
    }

    // ── List view ────────────────────────────────────────────────────────────────
    const filtered = sops.filter(s =>
        !search ||
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        (s.description ?? '').toLowerCase().includes(search.toLowerCase())
    )
    const grouped = SOP_CATEGORIES
        .map(cat => ({ cat, items: filtered.filter(s => s.category === cat) }))
        .filter(g => g.items.length > 0)

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 'clamp(1.5rem, 3vw, 2.5rem)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', marginBottom: 4 }}>{'//'} UNIT</div>
                    <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Standard Operating Procedures</h1>
                </div>
                {isJ4 && (
                    <button type='button' onClick={() => setShowCreate(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0 }}>
                        <Add style={{ fontSize: 15 }} /> New SOP
                    </button>
                )}
            </div>

            {/* Search */}
            <div style={{ position: 'relative', maxWidth: 380 }}>
                <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'rgba(237,237,237,0.3)', pointerEvents: 'none' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search SOPs…'
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px 8px 34px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.85)', fontSize: '0.78rem', outline: 'none' }}
                />
            </div>

            {/* Content */}
            {loading ? (
                <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.1em' }}>Loading…</div>
            ) : sops.length === 0 ? (
                <div style={{ padding: '56px 0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>No SOPs published yet</div>
                    {isJ4 && <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.15)', marginTop: 8 }}>Click New SOP to create the first one</div>}
                </div>
            ) : grouped.length === 0 ? (
                <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.1em' }}>No results for &ldquo;{search}&rdquo;</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                    {grouped.map(({ cat, items }) => (
                        <div key={cat}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                                <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', flexShrink: 0 }}>{cat}</span>
                                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                                <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.1em', flexShrink: 0 }}>{items.length}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                                {items.map(sop => (
                                    <SopCard key={sop._id} sop={sop} timeAgo={timeAgo} onOpen={() => openDocument(sop)} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create modal */}
            {showCreate && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}
                >
                    <div style={{ background: '#0e0e0e', border: `1px solid rgba(219,0,29,0.25)`, borderTop: `3px solid ${RED}`, padding: 28, width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 6 }}>{'//'} CREATE SOP</div>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>New Standard Operating Procedure</h3>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>Title *</label>
                                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder='e.g. Unit Standards' autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                                    style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderBottom: `2px solid rgba(219,0,29,0.4)`, color: 'rgba(237,237,237,0.9)', fontSize: '0.88rem', padding: '8px 10px', outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>Category *</label>
                                <select value={newCategory} onChange={e => setNewCategory(e.target.value as SopCat)}
                                    style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.85)', fontSize: '0.82rem', padding: '8px 10px', outline: 'none', cursor: 'pointer' }}>
                                    {SOP_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>
                                    Description <span style={{ color: 'rgba(237,237,237,0.2)', textTransform: 'none', fontWeight: 400, letterSpacing: 0 }}>(optional)</span>
                                </label>
                                <input value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder='Short description shown on the card'
                                    style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.7)', fontSize: '0.82rem', padding: '8px 10px', outline: 'none' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                            <button type='button' onClick={() => { setShowCreate(false); setNewTitle(''); setNewDescription('') }}
                                style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.45)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type='button' onClick={handleCreate} disabled={!newTitle.trim() || creating}
                                style={{ padding: '8px 20px', background: newTitle.trim() && !creating ? RED : 'rgba(219,0,29,0.3)', border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: newTitle.trim() && !creating ? 'pointer' : 'default' }}>
                                {creating ? 'Creating…' : 'Create SOP'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function SopCard({ sop, timeAgo, onOpen }: { sop: SopItem; timeAgo: (d: string) => string; onOpen: () => void }) {
    return (
        <div
            style={{ border: '1px solid rgba(255,255,255,0.07)', borderTop: '2px solid rgba(219,0,29,0.3)', background: 'rgba(255,255,255,0.02)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', transition: 'all 0.15s' }}
            onClick={onOpen}
            onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderTopColor = RED; el.style.background = 'rgba(219,0,29,0.04)' }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderTopColor = 'rgba(219,0,29,0.3)'; el.style.background = 'rgba(255,255,255,0.02)' }}
        >
            <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)', marginBottom: sop.description ? 6 : 0 }}>{sop.title}</div>
                {sop.description && <div style={{ fontSize: '0.73rem', color: 'rgba(237,237,237,0.45)', lineHeight: 1.55 }}>{sop.description}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.06em' }}>Updated {timeAgo(sop.updatedAt)}</span>
                <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)' }}>Open →</span>
            </div>
        </div>
    )
}
