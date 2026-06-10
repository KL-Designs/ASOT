'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    ArrowBack, Add, Delete, DriveFileRenameOutline, Folder, Article,
    Upload, Search, CreateNewFolder, Edit, Save, Close,
    School, MenuBook, Shield, Map, People, Star, Build,
    MilitaryTech, Assignment, Policy, FolderOpen, DragIndicator,
} from '@mui/icons-material'
import {
    DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
    useDraggable, useDroppable, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import SimpleEditor from '@/components/editor/SimpleEditor'

const RED = '#db001d'

// ── Icon registry ──────────────────────────────────────────────────────────────

const ICON_OPTIONS = [
    { name: 'FolderOpen', label: 'Folder',   Icon: FolderOpen  },
    { name: 'School',     label: 'School',   Icon: School      },
    { name: 'MenuBook',   label: 'Book',     Icon: MenuBook    },
    { name: 'Shield',     label: 'Shield',   Icon: Shield      },
    { name: 'Map',        label: 'Map',      Icon: Map         },
    { name: 'People',     label: 'Team',     Icon: People      },
    { name: 'Star',       label: 'Star',     Icon: Star        },
    { name: 'Build',      label: 'Tools',    Icon: Build       },
    { name: 'MilitaryTech', label: 'Military', Icon: MilitaryTech },
    { name: 'Assignment', label: 'Tasks',    Icon: Assignment  },
    { name: 'Policy',     label: 'Policy',   Icon: Policy      },
    { name: 'Article',    label: 'Doc',      Icon: Article     },
] as const

const COLOR_PRESETS = [
    RED, '#e65100', '#f9a825', '#2e7d32',
    '#1565c0', '#6a1b9a', '#00838f', '#546e7a',
]

function DocIcon({ iconName, type, size = 18, color }: { iconName?: string; type: 'folder' | 'document'; size?: number; color?: string }) {
    const iconStyle = { fontSize: size, color: color ?? 'rgba(219,0,29,0.6)', flexShrink: 0 as const }
    const found = ICON_OPTIONS.find(o => o.name === iconName)
    if (found) return <found.Icon style={iconStyle} />
    return type === 'folder' ? <Folder style={iconStyle} /> : <Article style={iconStyle} />
}

// ── Types ──────────────────────────────────────────────────────────────────────

type DocItem = {
    _id: string
    type: 'folder' | 'document'
    name: string
    parentId: string | null
    originalFileName?: string
    iconName?: string
    color?: string
    createdAt: string
    updatedAt: string
    createdByName: string
    updatedByName?: string
}

type BreadcrumbEntry = { id: string | null; name: string }

type View =
    | { type: 'list' }
    | { type: 'read';  item: DocItem; html: string }
    | { type: 'edit';  item: DocItem; html: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7)  return `${days}d ago`
    const weeks = Math.floor(days / 7)
    if (weeks < 5) return `${weeks}w ago`
    return `${Math.floor(days / 30)}mo ago`
}

function sortItems(items: DocItem[]): DocItem[] {
    return [...items].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return a.name.localeCompare(b.name)
    })
}

function accentColor(item: DocItem, opacity = 1) {
    const hex = item.color ?? RED
    if (opacity === 1) return hex
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${opacity})`
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export default function TrainingDocsPanel({ isJ3, initialDocId }: { isJ3: boolean; initialDocId?: string }) {
    const [view,       setView]       = useState<View>({ type: 'list' })
    const [items,      setItems]      = useState<DocItem[]>([])
    const [loading,    setLoading]    = useState(true)
    const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([{ id: null, name: 'Training Docs' }])
    const [search,     setSearch]     = useState('')

    // Drag state
    const [draggingId, setDraggingId] = useState<string | null>(null)

    // Inline rename state
    const [renamingId,   setRenamingId]   = useState<string | null>(null)
    const [renameValue,  setRenameValue]  = useState('')
    const [savingRename, setSavingRename] = useState(false)

    // Delete confirmation
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
    const [deleting,        setDeleting]        = useState(false)

    // Modals
    const [showCreateFolder,  setShowCreateFolder]  = useState(false)
    const [showUpload,        setShowUpload]        = useState(false)
    const [showNewDoc,        setShowNewDoc]        = useState(false)
    const [showCustomise,     setShowCustomise]     = useState<DocItem | null>(null)

    // Create folder
    const [newFolderName,   setNewFolderName]   = useState('')
    const [folderIcon,      setFolderIcon]      = useState<string>('')
    const [folderColor,     setFolderColor]     = useState<string>('')
    const [creatingFolder,  setCreatingFolder]  = useState(false)

    // New blank doc
    const [newDocName,    setNewDocName]    = useState('')
    const [newDocIcon,    setNewDocIcon]    = useState<string>('')
    const [newDocColor,   setNewDocColor]   = useState<string>('')
    const [creatingDoc,   setCreatingDoc]   = useState(false)

    // Upload zip
    const [uploadName,  setUploadName]  = useState('')
    const [uploadFile,  setUploadFile]  = useState<File | null>(null)
    const [uploading,   setUploading]   = useState(false)
    const [uploadError, setUploadError] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Customise modal
    const [customiseIcon,  setCustomiseIcon]  = useState('')
    const [customiseColor, setCustomiseColor] = useState('')
    const [savingCustomise, setSavingCustomise] = useState(false)

    // Editor save state
    const editorHtmlRef = useRef('')
    const [savingContent, setSavingContent] = useState(false)

    const router = useRouter()
    const openedDocRef = useRef<string | null>(null)  // prevents double-fetch when URL updates after openDocument

    const currentParentId = breadcrumb[breadcrumb.length - 1].id

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    )

    function loadItems(parentId: string | null) {
        setLoading(true)
        const qs = parentId ? `?parentId=${parentId}` : ''
        fetch(`/api/training-docs${qs}`)
            .then(r => r.json())
            .then(data => { setItems(data.items ?? []); setLoading(false) })
            .catch(() => setLoading(false))
    }

    useEffect(() => {
        loadItems(currentParentId)
    }, [currentParentId]) // eslint-disable-line

    // Auto-open document when navigating directly to /training-docs/[id]
    useEffect(() => {
        if (!initialDocId) return
        if (openedDocRef.current === initialDocId) return
        fetch(`/api/training-docs/${initialDocId}`)
            .then(r => r.ok ? r.json() : null)
            .then(doc => {
                if (!doc || doc.type !== 'document') return
                const item: DocItem = {
                    _id: String(doc._id), type: doc.type, name: doc.name,
                    parentId: doc.parentId ? String(doc.parentId) : null,
                    iconName: doc.iconName, color: doc.color,
                    originalFileName: doc.originalFileName,
                    createdAt: doc.createdAt, updatedAt: doc.updatedAt,
                    createdByName: doc.createdByName, updatedByName: doc.updatedByName,
                }
                setView({ type: 'read', item, html: doc.htmlContent ?? '' })
            })
            .catch(() => {})
    }, [initialDocId]) // eslint-disable-line

    // ── Navigation ────────────────────────────────────────────────────────────

    function openFolder(item: DocItem) {
        setBreadcrumb(prev => [...prev, { id: item._id, name: item.name }])
        setSearch('')
        setConfirmDeleteId(null)
        setRenamingId(null)
    }

    function navigateBreadcrumb(index: number) {
        setBreadcrumb(prev => prev.slice(0, index + 1))
        setView({ type: 'list' })
        setSearch('')
        setConfirmDeleteId(null)
        setRenamingId(null)
    }

    async function openDocument(item: DocItem) {
        const res = await fetch(`/api/training-docs/${item._id}`)
        if (!res.ok) return
        const doc = await res.json()
        openedDocRef.current = item._id
        setView({ type: 'read', item, html: doc.htmlContent ?? '' })
        router.push(`/dashboard/unit/training-docs/${item._id}`)
    }

    function backToList() {
        router.push('/dashboard/unit/training-docs')
        setView({ type: 'list' })
        setConfirmDeleteId(null)
        setRenamingId(null)
    }

    // ── Create folder ─────────────────────────────────────────────────────────

    async function handleCreateFolder() {
        if (!newFolderName.trim() || creatingFolder) return
        setCreatingFolder(true)
        try {
            const res = await fetch('/api/training-docs', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    type:     'folder',
                    name:     newFolderName.trim(),
                    parentId: currentParentId,
                    ...(folderIcon  ? { iconName: folderIcon  } : {}),
                    ...(folderColor ? { color:    folderColor } : {}),
                }),
            })
            if (!res.ok) return
            const created = await res.json()
            setItems(prev => sortItems([...prev, created]))
            setShowCreateFolder(false)
            setNewFolderName(''); setFolderIcon(''); setFolderColor('')
        } finally { setCreatingFolder(false) }
    }

    // ── Create blank document ─────────────────────────────────────────────────

    async function handleCreateDoc() {
        if (!newDocName.trim() || creatingDoc) return
        setCreatingDoc(true)
        try {
            const res = await fetch('/api/training-docs', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    type:     'document',
                    name:     newDocName.trim(),
                    parentId: currentParentId,
                    ...(newDocIcon  ? { iconName: newDocIcon  } : {}),
                    ...(newDocColor ? { color:    newDocColor } : {}),
                }),
            })
            if (!res.ok) return
            const created = await res.json()
            setItems(prev => sortItems([...prev, created]))
            setShowNewDoc(false)
            setNewDocName(''); setNewDocIcon(''); setNewDocColor('')
            // Open straight into edit mode
            editorHtmlRef.current = ''
            setView({ type: 'edit', item: created, html: '' })
        } finally { setCreatingDoc(false) }
    }

    // ── Upload zip ────────────────────────────────────────────────────────────

    function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null
        setUploadFile(file)
        setUploadError('')
        if (file && !uploadName) setUploadName(file.name.replace(/\.zip$/i, '').replace(/[-_]/g, ' ').trim())
    }

    async function handleUpload() {
        if (!uploadFile || !uploadName.trim() || uploading) return
        setUploading(true); setUploadError('')
        try {
            const form = new FormData()
            form.append('file', uploadFile)
            form.append('name', uploadName.trim())
            if (currentParentId) form.append('parentId', currentParentId)

            const res = await fetch('/api/training-docs', { method: 'POST', body: form })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                setUploadError(err.error ?? 'Upload failed')
                return
            }
            const created = await res.json()
            setItems(prev => sortItems([...prev, created]))
            setShowUpload(false); setUploadName(''); setUploadFile(null)
            if (fileInputRef.current) fileInputRef.current.value = ''
        } finally { setUploading(false) }
    }

    // ── Rename ────────────────────────────────────────────────────────────────

    function startRename(item: DocItem) {
        setRenamingId(item._id); setRenameValue(item.name); setConfirmDeleteId(null)
    }

    async function handleRename(id: string) {
        if (!renameValue.trim() || savingRename) return
        setSavingRename(true)
        try {
            const res = await fetch(`/api/training-docs/${id}`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ name: renameValue.trim() }),
            })
            if (!res.ok) return
            const updated = await res.json()
            setItems(prev => sortItems(prev.map(i => i._id === id ? updated : i)))
            setRenamingId(null)
        } finally { setSavingRename(false) }
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    async function handleDelete(id: string) {
        if (deleting) return
        setDeleting(true)
        try {
            await fetch(`/api/training-docs/${id}`, { method: 'DELETE' })
            setItems(prev => prev.filter(i => i._id !== id))
            setConfirmDeleteId(null)
            if (view.type !== 'list' && view.item._id === id) backToList()
        } finally { setDeleting(false) }
    }

    // ── Customise icon/color ──────────────────────────────────────────────────

    function openCustomise(item: DocItem) {
        setShowCustomise(item)
        setCustomiseIcon(item.iconName ?? '')
        setCustomiseColor(item.color ?? '')
    }

    async function handleSaveCustomise() {
        if (!showCustomise || savingCustomise) return
        setSavingCustomise(true)
        try {
            const res = await fetch(`/api/training-docs/${showCustomise._id}`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ iconName: customiseIcon || null, color: customiseColor || null }),
            })
            if (!res.ok) return
            const updated = await res.json()
            setItems(prev => prev.map(i => i._id === updated._id ? updated : i))
            // Also update current doc view if that doc is open
            if (view.type !== 'list' && view.item._id === updated._id) {
                setView(v => v.type !== 'list' ? { ...v, item: updated } : v)
            }
            setShowCustomise(null)
        } finally { setSavingCustomise(false) }
    }

    // ── Save editor content ───────────────────────────────────────────────────

    async function handleSaveContent() {
        if (view.type !== 'edit' || savingContent) return
        setSavingContent(true)
        try {
            await fetch(`/api/training-docs/${view.item._id}`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ htmlContent: editorHtmlRef.current }),
            })
            setView({ type: 'read', item: view.item, html: editorHtmlRef.current })
        } finally { setSavingContent(false) }
    }

    // ── Drag and drop ─────────────────────────────────────────────────────────

    function handleDragStart(e: DragStartEvent) {
        setDraggingId(String(e.active.id))
        setRenamingId(null); setConfirmDeleteId(null)
    }

    async function handleDragEnd(e: DragEndEvent) {
        setDraggingId(null)
        const { active, over } = e
        if (!over) return

        const itemId    = String(active.id)
        const overId    = String(over.id)

        // Determine target parentId
        let newParentId: string | null = null

        if (overId.startsWith('folder-')) {
            const targetFolderId = overId.replace('folder-', '')
            if (targetFolderId === itemId) return   // dropped on itself
            newParentId = targetFolderId
        } else if (overId.startsWith('crumb-')) {
            const crumbIndex = Number(overId.replace('crumb-', ''))
            newParentId = breadcrumb[crumbIndex].id
        } else {
            return
        }

        // Skip if item is already in that folder
        const item = items.find(i => i._id === itemId)
        if (!item) return
        if (item.parentId === newParentId) return
        if (newParentId === null && item.parentId === null) return

        await fetch(`/api/training-docs/${itemId}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ parentId: newParentId }),
        })
        setItems(prev => prev.filter(i => i._id !== itemId))
    }

    // ── Document read/edit views ──────────────────────────────────────────────

    if (view.type === 'read' || view.type === 'edit') {
        const { item } = view
        const isEditing = view.type === 'edit'
        const accent    = accentColor(item)

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 'clamp(1.5rem, 3vw, 2.5rem)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <button type='button' onClick={backToList}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'rgba(237,237,237,0.4)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', padding: '4px 0', flexShrink: 0, marginTop: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.85)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.4)')}
                    >
                        <ArrowBack style={{ fontSize: 13 }} /> Back
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <DocIcon iconName={item.iconName} type='document' size={20} color={accent} />
                            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.95)' }}>
                                {item.name}
                            </h2>
                        </div>
                        <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.06em', marginTop: 5, display: 'block' }}>
                            {item.createdByName} · {timeAgo(item.updatedAt)}
                        </span>
                    </div>

                    {isJ3 && (
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginTop: 2 }}>
                            {isEditing ? (
                                <>
                                    <button type='button' onClick={handleSaveContent} disabled={savingContent}
                                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: accent, border: 'none', color: '#fff', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                        <Save style={{ fontSize: 13 }} /> {savingContent ? 'Saving…' : 'Save'}
                                    </button>
                                    <button type='button' onClick={() => setView({ type: 'read', item, html: editorHtmlRef.current })}
                                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.5)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                        <Close style={{ fontSize: 13 }} /> Cancel
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button type='button' onClick={() => { editorHtmlRef.current = view.html; setView({ type: 'edit', item, html: view.html }) }}
                                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.5)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s' }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.color = 'rgba(237,237,237,0.9)' }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(237,237,237,0.5)' }}
                                    >
                                        <Edit style={{ fontSize: 13 }} /> Edit
                                    </button>
                                    {confirmDeleteId === item._id ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: '0.6rem', color: 'rgba(219,0,29,0.8)' }}>Delete?</span>
                                            <button type='button' onClick={() => handleDelete(item._id)} disabled={deleting}
                                                style={{ padding: '5px 12px', background: 'rgba(219,0,29,0.15)', border: '1px solid rgba(219,0,29,0.5)', color: 'rgba(219,0,29,0.9)', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                {deleting ? '…' : 'Confirm'}
                                            </button>
                                            <button type='button' onClick={() => setConfirmDeleteId(null)} style={{ padding: '5px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.62rem', cursor: 'pointer' }}>No</button>
                                        </div>
                                    ) : (
                                        <button type='button' onClick={() => setConfirmDeleteId(item._id)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'transparent', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.5)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s' }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(219,0,29,0.5)'; e.currentTarget.style.color = 'rgba(219,0,29,0.9)' }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(219,0,29,0.2)'; e.currentTarget.style.color = 'rgba(219,0,29,0.5)' }}
                                        >
                                            <Delete style={{ fontSize: 13 }} /> Delete
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Content */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 24 }}>
                    {isEditing ? (
                        <SimpleEditor
                            initialContent={view.html}
                            onChange={html => { editorHtmlRef.current = html }}
                            minHeight={400}
                        />
                    ) : view.html ? (
                        (() => {
                            const bodyHtml = injectHeadingIds(view.html)
                            return (
                                <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
                                    <DocToc headings={extractHeadings(bodyHtml)} />
                                    <div style={{ flex: 1, minWidth: 0 }}
                                        onClick={e => {
                                            const a = (e.target as HTMLElement).closest('a')
                                            if (!a) return
                                            const href = a.getAttribute('href') ?? ''
                                            if (!href.startsWith('#')) return
                                            e.preventDefault()
                                            document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                        }}
                                    >
                                        <style>{docViewerCss}</style>
                                        <div className='training-doc-body' dangerouslySetInnerHTML={{ __html: bodyHtml }} />
                                    </div>
                                </div>
                            )
                        })()
                    ) : (
                        <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.1em' }}>
                            {isJ3 ? 'No content yet — click Edit to start writing.' : 'No content available.'}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // ── List / explorer view ───────────────────────────────────────────────────

    const draggingItem = draggingId ? items.find(i => i._id === draggingId) : null
    const filtered = items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
    const folders  = filtered.filter(i => i.type === 'folder')
    const docs     = filtered.filter(i => i.type === 'document')

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 'clamp(1.5rem, 3vw, 2.5rem)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', marginBottom: 4 }}>{'//'} UNIT</div>
                    <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Training Documentation</h1>
                </div>
                {isJ3 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type='button' onClick={() => { setShowCreateFolder(true); setNewFolderName(''); setFolderIcon(''); setFolderColor('') }}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(237,237,237,0.7)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            <CreateNewFolder style={{ fontSize: 14 }} /> New Folder
                        </button>
                        <button type='button' onClick={() => { setShowNewDoc(true); setNewDocName(''); setNewDocIcon(''); setNewDocColor('') }}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(237,237,237,0.7)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            <Add style={{ fontSize: 14 }} /> New Doc
                        </button>
                        <button type='button' onClick={() => { setShowUpload(true); setUploadName(''); setUploadFile(null); setUploadError('') }}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            <Upload style={{ fontSize: 14 }} /> Upload Doc
                        </button>
                    </div>
                )}
            </div>

            {/* Breadcrumb — items are drop targets */}
            {breadcrumb.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {breadcrumb.map((entry, i) => (
                        <CrumbDropZone key={i} index={i} isLast={i === breadcrumb.length - 1}
                            label={entry.name}
                            onNavigate={() => navigateBreadcrumb(i)}
                        />
                    ))}
                </div>
            )}

            {/* Search */}
            <div style={{ position: 'relative', maxWidth: 380 }}>
                <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'rgba(237,237,237,0.3)', pointerEvents: 'none' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search…'
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px 8px 34px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.85)', fontSize: '0.78rem', outline: 'none' }}
                />
            </div>

            {/* Explorer grid with drag context */}
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                {loading ? (
                    <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.1em' }}>Loading…</div>
                ) : items.length === 0 ? (
                    <div style={{ padding: '56px 0', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>This folder is empty</div>
                        {isJ3 && <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.15)', marginTop: 8 }}>Upload a doc, create a new doc, or create a folder to get started</div>}
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.1em' }}>No results for &ldquo;{search}&rdquo;</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                        {folders.length > 0 && (
                            <div>
                                <SectionLabel label='Folders' count={folders.length} />
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                                    {folders.map(item => (
                                        <ExplorerCard
                                            key={item._id} item={item} isJ3={isJ3}
                                            isDragging={draggingId === item._id}
                                            renamingId={renamingId} renameValue={renameValue} savingRename={savingRename}
                                            confirmDeleteId={confirmDeleteId} deleting={deleting}
                                            onOpen={() => openFolder(item)}
                                            onStartRename={() => startRename(item)}
                                            onRenameChange={setRenameValue}
                                            onRenameSubmit={() => handleRename(item._id)}
                                            onRenameCancel={() => setRenamingId(null)}
                                            onConfirmDelete={() => setConfirmDeleteId(item._id)}
                                            onDelete={() => handleDelete(item._id)}
                                            onCancelDelete={() => setConfirmDeleteId(null)}
                                            onCustomise={() => openCustomise(item)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        {docs.length > 0 && (
                            <div>
                                <SectionLabel label='Documents' count={docs.length} />
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                                    {docs.map(item => (
                                        <ExplorerCard
                                            key={item._id} item={item} isJ3={isJ3}
                                            isDragging={draggingId === item._id}
                                            renamingId={renamingId} renameValue={renameValue} savingRename={savingRename}
                                            confirmDeleteId={confirmDeleteId} deleting={deleting}
                                            onOpen={() => openDocument(item)}
                                            onStartRename={() => startRename(item)}
                                            onRenameChange={setRenameValue}
                                            onRenameSubmit={() => handleRename(item._id)}
                                            onRenameCancel={() => setRenamingId(null)}
                                            onConfirmDelete={() => setConfirmDeleteId(item._id)}
                                            onDelete={() => handleDelete(item._id)}
                                            onCancelDelete={() => setConfirmDeleteId(null)}
                                            onCustomise={() => openCustomise(item)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Ghost card while dragging */}
                <DragOverlay>
                    {draggingItem && (
                        <div style={{ border: `1px solid ${accentColor(draggingItem, 0.4)}`, borderTop: `2px solid ${accentColor(draggingItem)}`, background: 'rgba(8,8,8,0.92)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, opacity: 0.85, cursor: 'grabbing', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                            <DocIcon iconName={draggingItem.iconName} type={draggingItem.type} size={16} color={accentColor(draggingItem)} />
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)' }}>{draggingItem.name}</span>
                        </div>
                    )}
                </DragOverlay>
            </DndContext>

            {/* ── Modals ──────────────────────────────────────────────────────── */}

            {/* Create folder */}
            {showCreateFolder && (
                <Modal onClose={() => setShowCreateFolder(false)} title='New Folder'>
                    <label style={labelStyle}>Folder name *</label>
                    <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder() }}
                        placeholder='e.g. Basic Combat Training' autoFocus style={inputStyle} />
                    <IconColorPicker iconValue={folderIcon} colorValue={folderColor} onIconChange={setFolderIcon} onColorChange={setFolderColor} />
                    <ModalFooter onCancel={() => setShowCreateFolder(false)} onConfirm={handleCreateFolder} disabled={!newFolderName.trim() || creatingFolder} label={creatingFolder ? 'Creating…' : 'Create'} />
                </Modal>
            )}

            {/* New blank document */}
            {showNewDoc && (
                <Modal onClose={() => setShowNewDoc(false)} title='New Document'>
                    <label style={labelStyle}>Document name *</label>
                    <input value={newDocName} onChange={e => setNewDocName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateDoc() }}
                        placeholder='e.g. Fire Control Procedures' autoFocus style={inputStyle} />
                    <IconColorPicker iconValue={newDocIcon} colorValue={newDocColor} onIconChange={setNewDocIcon} onColorChange={setNewDocColor} />
                    <ModalFooter onCancel={() => setShowNewDoc(false)} onConfirm={handleCreateDoc} disabled={!newDocName.trim() || creatingDoc} label={creatingDoc ? 'Creating…' : 'Create & Edit'} />
                </Modal>
            )}

            {/* Upload zip */}
            {showUpload && (
                <Modal onClose={() => { setShowUpload(false); if (fileInputRef.current) fileInputRef.current.value = '' }} title='Upload Google Docs Export'>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                            <label style={labelStyle}>Document name *</label>
                            <input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder='e.g. Introductory Recruit Document' style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>HTML zip file *</label>
                            <div onClick={() => fileInputRef.current?.click()}
                                style={{ border: `1px dashed ${uploadFile ? 'rgba(219,0,29,0.4)' : 'rgba(255,255,255,0.12)'}`, padding: '14px 16px', cursor: 'pointer', textAlign: 'center' }}>
                                <input ref={fileInputRef} type='file' accept='.zip' onChange={handleFileSelect} style={{ display: 'none' }} />
                                {uploadFile
                                    ? <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.7)' }}>{uploadFile.name}</span>
                                    : <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.06em' }}>Click to select .zip</span>
                                }
                            </div>
                            <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.25)', marginTop: 6 }}>
                                Google Docs → File → Download → Web Page (.html, zipped)
                            </div>
                        </div>
                        {uploadError && <div style={{ fontSize: '0.68rem', color: 'rgba(219,0,29,0.85)' }}>{uploadError}</div>}
                    </div>
                    <ModalFooter onCancel={() => { setShowUpload(false); if (fileInputRef.current) fileInputRef.current.value = '' }} onConfirm={handleUpload} disabled={!uploadFile || !uploadName.trim() || uploading} label={uploading ? 'Uploading…' : 'Upload'} />
                </Modal>
            )}

            {/* Customise icon/color */}
            {showCustomise && (
                <Modal onClose={() => setShowCustomise(null)} title={`Customise — ${showCustomise.name}`}>
                    <IconColorPicker iconValue={customiseIcon} colorValue={customiseColor} onIconChange={setCustomiseIcon} onColorChange={setCustomiseColor} />
                    <ModalFooter onCancel={() => setShowCustomise(null)} onConfirm={handleSaveCustomise} disabled={savingCustomise} label={savingCustomise ? 'Saving…' : 'Save'} />
                </Modal>
            )}
        </div>
    )
}

// ── Draggable + Droppable card ─────────────────────────────────────────────────

type CardProps = {
    item: DocItem
    isJ3: boolean
    isDragging: boolean
    renamingId: string | null
    renameValue: string
    savingRename: boolean
    confirmDeleteId: string | null
    deleting: boolean
    onOpen: () => void
    onStartRename: () => void
    onRenameChange: (v: string) => void
    onRenameSubmit: () => void
    onRenameCancel: () => void
    onConfirmDelete: () => void
    onDelete: () => void
    onCancelDelete: () => void
    onCustomise: () => void
}

function ExplorerCard(props: CardProps) {
    const { item, isJ3, isDragging } = props
    const isRenaming       = props.renamingId === item._id
    const isConfirmDelete  = props.confirmDeleteId === item._id
    const accent           = accentColor(item)

    // Every card is draggable (for J3 only)
    const { attributes, listeners, setNodeRef: setDragRef, isDragging: activeDrag } = useDraggable({
        id:       item._id,
        disabled: !isJ3,
    })

    // Folders are also droppable
    const { setNodeRef: setDropRef, isOver } = useDroppable({
        id:       `folder-${item._id}`,
        disabled: item.type !== 'folder',
    })

    const setRef = useCallback((node: HTMLDivElement | null) => {
        setDragRef(node); setDropRef(node)
    }, [setDragRef, setDropRef])

    const cardStyle: React.CSSProperties = {
        border: `1px solid ${isOver ? accentColor(item, 0.6) : 'rgba(255,255,255,0.07)'}`,
        borderTop: `2px solid ${isOver ? accent : accentColor(item, 0.3)}`,
        background: isOver ? accentColor(item, 0.06) : activeDrag ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.02)',
        padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 10,
        position: 'relative', transition: 'all 0.12s',
        opacity: activeDrag ? 0.35 : 1,
    }

    return (
        <div ref={setRef} style={cardStyle}>
            {/* Drag handle — top-right corner, J3 only */}
            {isJ3 && (
                <div
                    {...attributes} {...listeners}
                    title='Drag to move'
                    style={{ position: 'absolute', top: 6, right: 6, cursor: activeDrag ? 'grabbing' : 'grab', color: 'rgba(237,237,237,0.18)', display: 'flex', alignItems: 'center', padding: 2, borderRadius: 2, transition: 'color 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.55)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.18)')}
                >
                    <DragIndicator style={{ fontSize: 14 }} />
                </div>
            )}

            {/* Name row — click to open */}
            <div
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: isRenaming ? 'text' : 'pointer', paddingRight: isJ3 ? 18 : 0 }}
                onClick={() => { if (!isRenaming && !isConfirmDelete) props.onOpen() }}
            >
                <DocIcon iconName={item.iconName} type={item.type} size={18} color={accent} />
                {isRenaming ? (
                    <input
                        value={props.renameValue}
                        onChange={e => props.onRenameChange(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') props.onRenameSubmit(); if (e.key === 'Escape') props.onRenameCancel() }}
                        autoFocus
                        onClick={e => e.stopPropagation()}
                        style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: `1px solid ${accent}`, color: 'rgba(237,237,237,0.9)', fontSize: '0.82rem', fontWeight: 700, outline: 'none', padding: '1px 0' }}
                    />
                ) : (
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.02em', color: 'rgba(237,237,237,0.88)', lineHeight: 1.3, wordBreak: 'break-word' }}>{item.name}</span>
                )}
            </div>

            {/* Footer row — timestamp + actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.22)', letterSpacing: '0.05em' }}>{timeAgo(item.updatedAt)}</span>

                {isJ3 && !isRenaming && !isConfirmDelete && (
                    <div style={{ display: 'flex', gap: 2 }}>
                        <ActionBtn onClick={props.onCustomise}     title='Customise'><Edit style={{ fontSize: 12 }} /></ActionBtn>
                        <ActionBtn onClick={props.onStartRename}   title='Rename'><DriveFileRenameOutline style={{ fontSize: 12 }} /></ActionBtn>
                        <ActionBtn onClick={props.onConfirmDelete} title='Delete' danger><Delete style={{ fontSize: 12 }} /></ActionBtn>
                    </div>
                )}

                {isRenaming && (
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button type='button' onClick={props.onRenameSubmit} disabled={!props.renameValue.trim() || props.savingRename}
                            style={{ padding: '3px 10px', background: accent, border: 'none', color: '#fff', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            {props.savingRename ? '…' : 'Save'}
                        </button>
                        <button type='button' onClick={props.onRenameCancel} style={{ padding: '3px 8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.58rem', cursor: 'pointer' }}>Cancel</button>
                    </div>
                )}

                {isConfirmDelete && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.55rem', color: 'rgba(219,0,29,0.75)' }}>{item.type === 'folder' ? 'Delete folder?' : 'Delete doc?'}</span>
                        <button type='button' onClick={props.onDelete} disabled={props.deleting}
                            style={{ padding: '3px 10px', background: 'rgba(219,0,29,0.15)', border: '1px solid rgba(219,0,29,0.5)', color: 'rgba(219,0,29,0.9)', fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            {props.deleting ? '…' : 'Yes'}
                        </button>
                        <button type='button' onClick={props.onCancelDelete} style={{ padding: '3px 8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.58rem', cursor: 'pointer' }}>No</button>
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Breadcrumb drop zone ───────────────────────────────────────────────────────

function CrumbDropZone({ index, isLast, label, onNavigate }: { index: number; isLast: boolean; label: string; onNavigate: () => void }) {
    const { setNodeRef, isOver } = useDroppable({ id: `crumb-${index}`, disabled: isLast })
    return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {index > 0 && <span style={{ color: 'rgba(237,237,237,0.2)', fontSize: '0.65rem' }}>/</span>}
            <button
                ref={setNodeRef}
                type='button'
                onClick={onNavigate}
                style={{
                    background: isOver ? 'rgba(219,0,29,0.12)' : 'none',
                    border: isOver ? '1px solid rgba(219,0,29,0.4)' : '1px solid transparent',
                    padding: '2px 6px',
                    cursor: isLast ? 'default' : 'pointer',
                    color: isLast ? 'rgba(237,237,237,0.85)' : (isOver ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.4)'),
                    fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    transition: 'all 0.12s',
                }}
            >
                {label}
            </button>
        </span>
    )
}

// ── Icon + color picker ────────────────────────────────────────────────────────

function IconColorPicker({ iconValue, colorValue, onIconChange, onColorChange }: {
    iconValue: string; colorValue: string;
    onIconChange: (v: string) => void; onColorChange: (v: string) => void
}) {
    const activeColor = colorValue || RED
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
                <label style={labelStyle}>Icon <span style={{ textTransform: 'none', fontWeight: 400, color: 'rgba(237,237,237,0.25)' }}>(optional)</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ICON_OPTIONS.map(opt => {
                        const selected = iconValue === opt.name
                        return (
                            <button key={opt.name} type='button' title={opt.label}
                                onClick={() => onIconChange(selected ? '' : opt.name)}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, background: selected ? 'rgba(219,0,29,0.15)' : 'rgba(255,255,255,0.04)', border: selected ? `1px solid ${activeColor}` : '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', transition: 'all 0.12s' }}>
                                <opt.Icon style={{ fontSize: 16, color: selected ? activeColor : 'rgba(237,237,237,0.5)' }} />
                            </button>
                        )
                    })}
                </div>
            </div>
            <div>
                <label style={labelStyle}>Color <span style={{ textTransform: 'none', fontWeight: 400, color: 'rgba(237,237,237,0.25)' }}>(optional)</span></label>
                <div style={{ display: 'flex', gap: 6 }}>
                    {COLOR_PRESETS.map(hex => {
                        const selected = (colorValue || RED) === hex
                        return (
                            <button key={hex} type='button' title={hex}
                                onClick={() => onColorChange(hex === RED && !colorValue ? '' : hex)}
                                style={{ width: 26, height: 26, background: hex, border: selected ? '2px solid rgba(255,255,255,0.8)' : '2px solid transparent', cursor: 'pointer', borderRadius: 2, outline: 'none', transition: 'border-color 0.12s' }} />
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function SectionLabel({ label, count }: { label: string; count: number }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', flexShrink: 0 }}>{label}</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.1em', flexShrink: 0 }}>{count}</span>
        </div>
    )
}

function ActionBtn({ onClick, title, danger, children }: { onClick: () => void; title: string; danger?: boolean; children: React.ReactNode }) {
    return (
        <button type='button' title={title} onClick={e => { e.stopPropagation(); onClick() }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, background: 'transparent', border: 'none', color: danger ? 'rgba(219,0,29,0.45)' : 'rgba(237,237,237,0.3)', cursor: 'pointer', transition: 'color 0.12s' }}
            onMouseEnter={e => (e.currentTarget.style.color = danger ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.85)')}
            onMouseLeave={e => (e.currentTarget.style.color = danger ? 'rgba(219,0,29,0.45)' : 'rgba(237,237,237,0.3)')}
        >
            {children}
        </button>
    )
}

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={e => { if (e.target === e.currentTarget) onClose() }}>
            <div style={{ background: '#0e0e0e', border: `1px solid rgba(219,0,29,0.25)`, borderTop: `3px solid ${RED}`, padding: 28, width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                    <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 6 }}>{'//'} TRAINING DOCS</div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>{title}</h3>
                </div>
                {children}
            </div>
        </div>
    )
}

function ModalFooter({ onCancel, onConfirm, disabled, label }: { onCancel: () => void; onConfirm: () => void; disabled: boolean; label: string }) {
    return (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type='button' onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
            <button type='button' onClick={onConfirm} disabled={disabled} style={primaryBtnStyle(disabled)}>{label}</button>
        </div>
    )
}

// ── Style constants ────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)', borderBottom: '2px solid rgba(219,0,29,0.4)',
    color: 'rgba(237,237,237,0.9)', fontSize: '0.88rem', padding: '8px 10px', outline: 'none',
}
const cancelBtnStyle: React.CSSProperties = {
    padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(237,237,237,0.45)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em',
    textTransform: 'uppercase', cursor: 'pointer',
}
function primaryBtnStyle(disabled: boolean): React.CSSProperties {
    return { padding: '8px 20px', background: disabled ? 'rgba(219,0,29,0.3)' : RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: disabled ? 'default' : 'pointer' }
}

// ── Table of contents ──────────────────────────────────────────────────────────

function decodeEntities(t: string) {
    return t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
}

// Inject id attributes on headings that lack one, so TOC works even for
// blank docs or after edits that cleared the original Google Docs anchor IDs.
function injectHeadingIds(html: string): string {
    const used = new Set<string>()
    return html.replace(/<h([1-4])([^>]*)>([\s\S]*?)<\/h[1-4]>/gi, (full, level, attrs, inner) => {
        const existingId = /\bid="([^"]*)"/.exec(attrs)
        if (existingId) { used.add(existingId[1]); return full }
        const text = decodeEntities(inner.replace(/<[^>]+>/g, '').trim())
        let slug = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 50) || `h${level}`
        let id = slug; let n = 1
        while (used.has(id)) { id = `${slug}-${n++}` }
        used.add(id)
        return `<h${level}${attrs} id="${id}">${inner}</h${level}>`
    })
}

function extractHeadings(html: string): Array<{ id: string; text: string; level: number }> {
    const out: Array<{ id: string; text: string; level: number }> = []
    const re = /<h([1-4])([^>]*)>([\s\S]*?)<\/h[1-4]>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
        const idM = /\bid="([^"]*)"/.exec(m[2])
        if (!idM) continue
        const text = decodeEntities(m[3].replace(/<[^>]+>/g, '').trim())
        if (text) out.push({ id: idM[1], text, level: Number(m[1]) })
    }
    return out
}

function DocToc({ headings }: { headings: Array<{ id: string; text: string; level: number }> }) {
    const [active, setActive] = useState('')
    if (headings.length < 2) return null
    return (
        <div style={{ width: 200, flexShrink: 0, position: 'sticky', top: 24, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', alignSelf: 'flex-start' }}>
            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                Contents
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {headings.map((h, i) => {
                    const isActive = active === h.id
                    return (
                        <a key={i} href={`#${h.id}`}
                            onClick={e => { e.preventDefault(); setActive(h.id); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
                            style={{
                                display: 'block',
                                padding: `3px 4px 3px ${(h.level - 1) * 12 + 4}px`,
                                fontSize: h.level === 1 ? '0.72rem' : '0.68rem',
                                fontWeight: h.level <= 2 ? 600 : 400,
                                color: isActive ? 'rgba(219,0,29,0.85)' : 'rgba(237,237,237,0.4)',
                                textDecoration: 'none', lineHeight: 1.45, cursor: 'pointer',
                                borderLeft: isActive ? '2px solid rgba(219,0,29,0.6)' : '2px solid transparent',
                                transition: 'color 0.12s, border-color 0.12s',
                            }}
                            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'rgba(237,237,237,0.8)' }}
                            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'rgba(237,237,237,0.4)' }}
                        >
                            {h.text.length > 36 ? h.text.slice(0, 36) + '…' : h.text}
                        </a>
                    )
                })}
            </div>
        </div>
    )
}

// ── Document viewer CSS ────────────────────────────────────────────────────────

const docViewerCss = `
.training-doc-body {
    color: rgba(237,237,237,0.85); font-size: 0.88rem; line-height: 1.7; max-width: 794px; margin: 0 auto; position: relative;
}
.training-doc-body h1 {
    font-size: 1.3rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;
    color: rgba(237,237,237,0.95); margin: 2rem 0 0.75rem;
    padding-bottom: 6px; border-bottom: 1px solid rgba(219,0,29,0.25);
}
.training-doc-body h2 {
    font-size: 1.05rem; font-weight: 700; color: rgba(237,237,237,0.9); margin: 1.6rem 0 0.5rem;
}
.training-doc-body h3 {
    font-size: 0.9rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
    color: rgba(219,0,29,0.85); margin: 1.2rem 0 0.4rem;
}
.training-doc-body h4,.training-doc-body h5,.training-doc-body h6 {
    font-size: 0.85rem; font-weight: 700; color: rgba(237,237,237,0.75); margin: 1rem 0 0.3rem;
}
.training-doc-body p { margin: 0.4rem 0; }
.training-doc-body ul,.training-doc-body ol { margin: 0.5rem 0 0.5rem 1.6rem; padding: 0; }
.training-doc-body li { margin: 0.25rem 0; list-style: inherit; }
.training-doc-body li > p { display: inline; margin: 0; padding: 0; }
.training-doc-body ul { list-style-type: disc; }
.training-doc-body ol { list-style-type: decimal; }
.training-doc-body table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
.training-doc-body td,.training-doc-body th { border: 1px solid rgba(255,255,255,0.1); padding: 8px 12px; font-size: 0.82rem; vertical-align: top; }
.training-doc-body th { background: rgba(219,0,29,0.08); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(237,237,237,0.7); }
.training-doc-body tr:nth-child(even) td { background: rgba(255,255,255,0.02); }
.training-doc-body img { max-width: 100%; height: auto; display: block; margin: 1rem 0; border: 1px solid rgba(255,255,255,0.08); }
.training-doc-body [style*="text-align:center"] img,
.training-doc-body [style*="text-align: center"] img { margin-left: auto; margin-right: auto; }
.training-doc-body [style*="text-align:right"] img,
.training-doc-body [style*="text-align: right"] img { margin-left: auto; margin-right: 0; }
.training-doc-body img[data-align="center"]     { margin-left: auto; margin-right: auto; }
.training-doc-body img[data-align="right"]      { margin-left: auto; margin-right: 0; }
.training-doc-body img[data-align="wrap-left"]  { float: left;  margin: 4px 18px 10px 0; }
.training-doc-body img[data-align="wrap-right"] { float: right; margin: 4px 0 10px 18px; }
.training-doc-body img[data-align="free"]       { position: absolute; margin: 0; }
.training-doc-body::after { content: ''; display: table; clear: both; }
.training-doc-body a { color: rgba(219,0,29,0.8); text-decoration: underline; text-underline-offset: 3px; }
.training-doc-body a:hover { color: rgba(219,0,29,1); }
.training-doc-body hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 1.5rem 0; }
.training-doc-body strong,.training-doc-body b { font-weight: 700; color: rgba(237,237,237,0.95); }
.training-doc-body em,.training-doc-body i { font-style: italic; }
.training-doc-body u { text-decoration: underline; text-underline-offset: 2px; }
`
