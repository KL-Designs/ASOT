'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Add, CheckCircle, Cancel, Delete, Edit, Refresh, Visibility, VisibilityOff, DragIndicator, Article, VideoLibrary, SmartDisplay } from '@mui/icons-material'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import EventsTab from './EventsTab'
import RequestsTab from './RequestsTab'
import TrainingVideosTab from './TrainingVideosTab'
import { calculateSessionDates, SESSION_DEFS } from '@/lib/training/session-dates'

const RED = '#db001d'
type Tab = 'courses' | 'events' | 'requests' | 'guides' | 'videos'

const CATEGORY_ORDER = ['Selection', 'Reinforcement Cycle', 'BCT', 'Medical', 'CQB', 'Fires', 'Aviation', 'Communications', 'Leadership', 'Special', 'Armoured', 'Proficiency']

const BILLET_LABELS: Record<string, string> = {
    j3Bct12: 'BCT',
    j3OtherTrainings: 'Other Training',
}

type TypeStatus = 'active' | 'wip' | 'inactive'

const STATUS_CFG: Record<TypeStatus, { label: string; color: string; border: string; topBorder: string; cardBorder: string; opacity: number }> = {
    active:   { label: 'Enabled',  color: 'rgba(80,200,120,0.9)',  border: 'rgba(80,200,120,0.35)', topBorder: 'rgba(80,200,120,0.55)',  cardBorder: 'rgba(80,200,120,0.18)', opacity: 1 },
    wip:      { label: 'WIP',      color: 'rgba(255,180,50,0.9)',  border: 'rgba(255,180,50,0.35)', topBorder: 'rgba(255,180,50,0.55)',  cardBorder: 'rgba(255,180,50,0.18)', opacity: 1 },
    inactive: { label: 'Disabled', color: 'rgba(237,237,237,0.3)', border: 'rgba(255,255,255,0.1)', topBorder: 'rgba(255,255,255,0.12)', cardBorder: 'rgba(255,255,255,0.06)', opacity: 0.45 },
}

type TType = {
    _id: string
    name: string
    category: string
    billetField: string
    billetPoints: number
    description?: string
    status: TypeStatus
    isActive: boolean
    durationMinutes?: number
    server?: string
    requiredMods?: string[]
    prerequisites?: string[]
    minTrainers?: number
    minTrainees?: number
    trainerDocUrl?: string
    infoDocUrl?: string
    coverImageUrl?: string
    linkedMedia?: { type: 'video' | 'file' | 'url'; label: string; url: string }[]
    sortOrder?: number
    courseType?: string
}

type TCourseInstance = {
    _id: string
    trainingTypeId: string
    trainingTypeName: string
    courseType: 'selection' | 'reinforcement_cycle'
    instanceNumber: number
    instanceRef: string
    status: 'planning' | 'active' | 'in_progress' | 'completed' | 'cancelled' | 'archived'
    session1Date?: string
    startDate?: string
    endDate?: string
    leadInstructorName?: string
    candidateCount?: number
    createdById: string
    createdByName: string
    createdAt: string
    updatedAt: string
    deletedAt?: string
    deletedById?: string
    deletedByName?: string
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
    deletedAt?: string
    deletedById?: string
    deletedByName?: string
}

type MediaEntry = { type: 'video' | 'file' | 'url'; label: string; url: string }

type ModalState = {
    mode: 'create' | 'edit'
    id?: string
    name: string
    category: string
    billetField: string
    billetPoints: number
    description: string
    status: TypeStatus
    durationMinutes: string
    server: string
    requiredModsRaw: string
    prerequisiteNames: string[]
    minTrainers: string
    minTrainees: string
    trainerDocUrl: string
    infoDocUrl: string
    coverImageUrl: string
    linkedMedia: MediaEntry[]
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

const smallInput: React.CSSProperties = { ...inputStyle, fontSize: '0.78rem', padding: '6px 8px' }

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

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', paddingTop: 6, marginBottom: 2, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {children}
        </div>
    )
}

function TypeCard({ type, isJ3Lead, toggling, onEdit, onToggle, docsExpanded, docsCount, onToggleDocs, videosExpanded, videosCount, onToggleVideos, dragHandleProps }: {
    type: TType
    isJ3Lead: boolean
    toggling: boolean
    onEdit: () => void
    onToggle: () => void
    docsExpanded: boolean
    docsCount?: number
    onToggleDocs: () => void
    videosExpanded: boolean
    videosCount?: number
    onToggleVideos: () => void
    dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
}) {
    const cfg = STATUS_CFG[type.status ?? (type.isActive ? 'active' : 'inactive')]
    const isDisabled = (type.status ?? (type.isActive ? 'active' : 'inactive')) === 'inactive'
    return (
        <div style={{
            border: `1px solid ${cfg.cardBorder}`,
            borderTop: `2px solid ${cfg.topBorder}`,
            borderBottom: docsExpanded ? 'none' : `1px solid ${cfg.cardBorder}`,
            background: isDisabled ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.02)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            opacity: cfg.opacity,
            transition: 'opacity 0.15s, border-color 0.2s',
        }}>
            {/* Title row with status badge */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flex: 1, minWidth: 0 }}>
                    {isJ3Lead && dragHandleProps && (
                        <div
                            {...dragHandleProps}
                            title='Drag to reorder'
                            style={{ cursor: 'grab', color: 'rgba(237,237,237,0.18)', flexShrink: 0, marginTop: 2, touchAction: 'none', userSelect: 'none' }}
                        >
                            <DragIndicator style={{ fontSize: 17 }} />
                        </div>
                    )}
                    <div style={{ fontSize: '0.83rem', fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)', lineHeight: 1.35 }}>
                        {type.name}
                    </div>
                </div>
                {/* Always-visible status badge */}
                <span style={{
                    fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase',
                    color: cfg.color, border: `1px solid ${cfg.border}`, padding: '2px 7px', flexShrink: 0, marginTop: 2,
                    background: isDisabled ? 'rgba(0,0,0,0.2)' : 'transparent',
                }}>
                    {cfg.label}
                </span>
            </div>

            {type.description && (
                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.5 }}>{type.description}</div>
            )}

            {/* Metadata chips */}
            {(type.durationMinutes || (type.prerequisites && type.prerequisites.length > 0)) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {type.durationMinutes && (
                        <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.35)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 6px' }}>
                            {type.durationMinutes >= 60 ? `${Math.floor(type.durationMinutes / 60)}h${type.durationMinutes % 60 > 0 ? ` ${type.durationMinutes % 60}m` : ''}` : `${type.durationMinutes}m`}
                        </span>
                    )}
                    {type.prerequisites && type.prerequisites.length > 0 && (
                        <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.35)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 6px' }}>
                            Prereq: {type.prerequisites.join(', ')}
                        </span>
                    )}
                </div>
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
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', background: 'transparent',
                                border: `1px solid ${isDisabled ? 'rgba(80,200,120,0.35)' : 'rgba(219,0,29,0.25)'}`,
                                color: isDisabled ? 'rgba(80,200,120,0.7)' : 'rgba(219,0,29,0.55)',
                                fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                                cursor: toggling ? 'default' : 'pointer', opacity: toggling ? 0.5 : 1,
                            }}>
                            {isDisabled ? 'Enable' : 'Disable'}
                        </button>
                    </div>
                )}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <button type='button' onClick={onToggleDocs}
                    style={{ padding: '3px 8px', background: docsExpanded ? 'rgba(255,255,255,0.05)' : 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.3)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                    {docsExpanded ? '▲ Docs' : `▼ Docs${docsCount !== undefined ? ` (${docsCount})` : ''}`}
                </button>
                <button type='button' onClick={onToggleVideos}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: videosExpanded ? 'rgba(255,255,255,0.05)' : 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.3)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                    <VideoLibrary style={{ fontSize: 11 }} />
                    {videosExpanded ? '▲ Videos' : `▼ Videos${videosCount !== undefined ? ` (${videosCount})` : ''}`}
                </button>
            </div>
        </div>
    )
}

function SortableTypeCard(props: {
    type: TType
    isJ3Lead: boolean
    toggling: boolean
    onEdit: () => void
    onToggle: () => void
    docsExpanded: boolean
    docsCount?: number
    onToggleDocs: () => void
    videosExpanded: boolean
    videosCount?: number
    onToggleVideos: () => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.type._id })
    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.45 : 1,
                zIndex: isDragging ? 999 : undefined,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <TypeCard {...props} dragHandleProps={props.isJ3Lead ? { ...attributes, ...listeners } : undefined} />
        </div>
    )
}

export default function TrainingHub({ isJ3Lead, isTrainer, isJ3Trainer, myId, isJ3Context = false, canApproveGuides = false }: { isJ3Lead: boolean; isTrainer: boolean; isJ3Trainer: boolean; myId: string; isJ3Context?: boolean; canApproveGuides?: boolean }) {
    const router = useRouter()
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
    const [deleteDocModal, setDeleteDocModal] = useState<{ typeId: string; docId: string; docTitle: string } | null>(null)
    const [showDeletedDocs, setShowDeletedDocs] = useState<Record<string, boolean>>({})
    const [deletedDocsCache, setDeletedDocsCache] = useState<Record<string, TDoc[]>>({})
    const [loadingDeletedDocs, setLoadingDeletedDocs] = useState<string | null>(null)
    const [restoringDocId, setRestoringDocId] = useState<string | null>(null)

    // Add-doc mode: when addDocTypeId is set, 'pick' shows two options, 'url' shows form, 'guide' was used to create
    const [addDocMode, setAddDocMode] = useState<'pick' | 'url'>('pick')

    // Trainer's Guide / Training Document state
    const [guidesCache, setGuidesCache] = useState<Record<string, TrainingGuide[]>>({})
    const [guidesLoading, setGuidesLoading] = useState<string | null>(null)
    const [creatingGuide, setCreatingGuide] = useState(false)

    // Videos state (per-course panel within Courses tab)
    const [videosExpanded, setVideosExpanded] = useState<string | null>(null)
    const [videosCache, setVideosCache]       = useState<Record<string, TrainingTypeVideo[]>>({})
    const [videosLoading, setVideosLoading]   = useState<string | null>(null)
    const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null)

    // Course instance state (Selection / Reinforcement Cycle)
    const [courseInstancesCache, setCourseInstancesCache] = useState<Record<string, TCourseInstance[]>>({})
    const [creatingInstance, setCreatingInstance] = useState(false)
    const [deletingInstanceId, setDeletingInstanceId] = useState<string | null>(null)
    const [restoringInstanceId, setRestoringInstanceId] = useState<string | null>(null)
    const [showDeletedInstances, setShowDeletedInstances] = useState<Record<string, boolean>>({})
    const [showHistoryInstances, setShowHistoryInstances] = useState<Record<string, boolean>>({})
    const [createInstanceModal, setCreateInstanceModal] = useState<{ typeId: string; typeName: string; courseType: string; session1Date: string } | null>(null)
    const [deleteInstanceModal, setDeleteInstanceModal] = useState<{ instanceId: string; typeId: string; instanceRef: string } | null>(null)

    // Per-course add video form state
    const [courseUploadTypeId, setCourseUploadTypeId] = useState<string | null>(null)
    const [courseUploadTitle,  setCourseUploadTitle]  = useState('')
    const [courseUploadDesc,   setCourseUploadDesc]   = useState('')
    const [courseYoutubeUrl,   setCourseYoutubeUrl]   = useState('')
    const [courseAdding,       setCourseAdding]       = useState(false)

    // Training Documents tab state
    const [allGuides, setAllGuides]           = useState<TrainingGuide[]>([])
    const [allGuidesLoading, setAllGuidesLoading] = useState(false)
    const [linkingGuideId, setLinkingGuideId] = useState<string | null>(null)
    const [linkTarget, setLinkTarget]         = useState<string>('')
    const [deleteGuideModal, setDeleteGuideModal] = useState<{ guideId: string; guideTitle: string } | null>(null)
    const [deletingGuide, setDeletingGuide]   = useState(false)
    const [showDeletedGuides, setShowDeletedGuides] = useState(false)
    const [deletedGuidesCache, setDeletedGuidesCache] = useState<TrainingGuide[]>([])
    const [loadingDeletedGuides, setLoadingDeletedGuides] = useState(false)
    const [restoringGuideId, setRestoringGuideId] = useState<string | null>(null)
    const [deletedGuideView, setDeletedGuideView] = useState<TrainingGuide | null>(null)
    const [loadingGuideView, setLoadingGuideView] = useState<string | null>(null)

    // dnd-kit sensors
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

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
                status: modal.status,
                durationMinutes: modal.durationMinutes ? parseInt(modal.durationMinutes) || undefined : undefined,
                server: modal.server.trim() || undefined,
                requiredMods: modal.requiredModsRaw.split(',').map(s => s.trim()).filter(Boolean),
                prerequisites: modal.prerequisiteNames,
                minTrainers: modal.minTrainers ? parseInt(modal.minTrainers) || undefined : undefined,
                minTrainees: modal.minTrainees ? parseInt(modal.minTrainees) || undefined : undefined,
                trainerDocUrl: modal.trainerDocUrl.trim() || undefined,
                infoDocUrl: modal.infoDocUrl.trim() || undefined,
                coverImageUrl: modal.coverImageUrl.trim() || undefined,
                linkedMedia: modal.linkedMedia.filter(m => m.label.trim() && m.url.trim()),
            }
            if (modal.mode === 'create') {
                const res = await fetch('/api/training/types', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                })
                if (!res.ok) return
                const created = await res.json()
                setTypes(prev => [...prev, created].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name)))
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
            const newStatus = type.status === 'active' ? 'inactive' : 'active'
            const res = await fetch(`/api/training/types/${type._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
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
        const promises: Promise<void>[] = []
        if (docsCache[typeId] === undefined) {
            promises.push(
                fetch(`/api/training/types/${typeId}/docs`)
                    .then(r => r.json())
                    .then(data => setDocsCache(prev => ({ ...prev, [typeId]: data.docs ?? [] })))
                    .catch(() => {})
            )
        }
        if (guidesCache[typeId] === undefined) {
            setGuidesLoading(typeId)
            promises.push(
                fetch(`/api/training-guides?trainingTypeId=${typeId}`)
                    .then(r => r.json())
                    .then(data => setGuidesCache(prev => ({ ...prev, [typeId]: Array.isArray(data) ? data : [] })))
                    .catch(() => {})
                    .finally(() => setGuidesLoading(null))
            )
        }
        const typeObj = types.find(t => t._id === typeId)
        if (isJ3Lead && typeObj?.courseType && courseInstancesCache[typeId] === undefined) {
            promises.push(
                fetch(`/api/j3/course-instances?trainingTypeId=${typeId}&includeDeleted=true`)
                    .then(r => r.json())
                    .then(data => setCourseInstancesCache(prev => ({ ...prev, [typeId]: data.instances ?? [] })))
                    .catch(() => {})
            )
        }
        if (promises.length > 0) {
            setDocsLoading(true)
            await Promise.all(promises)
            setDocsLoading(false)
        }
    }

    async function refreshInstances(typeId: string) {
        const data = await fetch(`/api/j3/course-instances?trainingTypeId=${typeId}&includeDeleted=true`).then(r => r.json()).catch(() => null)
        if (data) setCourseInstancesCache(prev => ({ ...prev, [typeId]: data.instances ?? [] }))
    }

    async function handleCreateInstance(typeId: string, session1Date?: string) {
        if (creatingInstance) return
        setCreatingInstance(true)
        try {
            const body: Record<string, string> = { trainingTypeId: typeId }
            if (session1Date) body.session1Date = session1Date
            const res = await fetch('/api/j3/course-instances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (!res.ok) return
            await refreshInstances(typeId)
            setCreateInstanceModal(null)
        } finally {
            setCreatingInstance(false)
        }
    }

    async function handleDeleteInstance(instanceId: string, typeId: string) {
        if (deletingInstanceId) return
        setDeletingInstanceId(instanceId)
        try {
            const res = await fetch(`/api/j3/course-instances/${instanceId}`, { method: 'DELETE' })
            if (!res.ok) return
            await refreshInstances(typeId)
            setDeleteInstanceModal(null)
        } finally {
            setDeletingInstanceId(null)
        }
    }

    async function handleRestoreInstance(instanceId: string, typeId: string) {
        if (restoringInstanceId) return
        setRestoringInstanceId(instanceId)
        try {
            const res = await fetch(`/api/j3/course-instances/${instanceId}/restore`, { method: 'POST' })
            if (!res.ok) return
            await refreshInstances(typeId)
        } finally {
            setRestoringInstanceId(null)
        }
    }

    async function handleCreateGuide(typeId: string, guideType: TrainingGuide['guideType'] = 'trainers_guide') {
        if (creatingGuide) return
        setCreatingGuide(true)
        try {
            const res = await fetch('/api/training-guides', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trainingTypeId: typeId, guideType }),
            })
            if (!res.ok) return
            const guide: TrainingGuide = await res.json()
            const id = String(guide._id)
            setGuidesCache(prev => ({ ...prev, [typeId]: [...(prev[typeId] ?? []), guide] }))
            setAddDocTypeId(null)
            setAddDocMode('pick')
            router.push(`/dashboard/unit/training-hub/guide/${id}?from=${isJ3Context ? 'j3' : 'hub'}`)
        } finally {
            setCreatingGuide(false)
        }
    }

    function handleOpenGuide(guideId: string) {
        router.push(`/dashboard/unit/training-hub/guide/${guideId}?from=${isJ3Context ? 'j3' : 'hub'}`)
    }

    function extractYouTubeId(url: string): string | null {
        for (const re of [/[?&]v=([^&]+)/, /youtu\.be\/([^?&/]+)/, /youtube\.com\/embed\/([^?&/]+)/]) {
            const m = re.exec(url)
            if (m) return m[1]
        }
        return null
    }

    async function handleCourseVideoAdd(typeId: string) {
        if (courseAdding || !courseYoutubeUrl.trim() || !courseUploadTitle.trim()) return
        setCourseAdding(true)
        try {
            const res = await fetch(`/api/training/types/${typeId}/videos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: courseUploadTitle.trim(), url: courseYoutubeUrl.trim(), description: courseUploadDesc.trim() || undefined }),
            })
            if (!res.ok) return
            const created = await res.json()
            setVideosCache(prev => ({ ...prev, [typeId]: [created] }))
            setCourseUploadTypeId(null)
            setCourseUploadTitle('')
            setCourseUploadDesc('')
            setCourseYoutubeUrl('')
        } finally {
            setCourseAdding(false)
        }
    }

    async function handleDeleteVideo(typeId: string, videoId: string) {
        if (deletingVideoId) return
        setDeletingVideoId(videoId)
        try {
            const res = await fetch(`/api/training/types/${typeId}/videos`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId }),
            })
            if (!res.ok) return
            setVideosCache(prev => ({ ...prev, [typeId]: (prev[typeId] ?? []).filter(v => String(v._id) !== videoId) }))
        } finally {
            setDeletingVideoId(null)
        }
    }

    async function loadAllGuides() {
        if (allGuidesLoading || allGuides.length > 0) return
        setAllGuidesLoading(true)
        try {
            const res = await fetch('/api/training-guides')
            const data = await res.json()
            setAllGuides(Array.isArray(data) ? data : [])
        } catch { /* ignore */ } finally {
            setAllGuidesLoading(false)
        }
    }

    async function handleLinkGuide(guideId: string, trainingTypeId: string | null) {
        await fetch(`/api/training-guides/${guideId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trainingTypeId }),
        })
        setAllGuides(prev => prev.map(g => String(g._id) === guideId ? { ...g, trainingTypeId: trainingTypeId ?? undefined } : g))
        setLinkingGuideId(null)
        setLinkTarget('')
    }

    async function handleConfirmDeleteGuide() {
        if (!deleteGuideModal || deletingGuide) return
        setDeletingGuide(true)
        try {
            const res = await fetch(`/api/training-guides/${deleteGuideModal.guideId}`, { method: 'DELETE' })
            if (!res.ok) return
            setAllGuides(prev => prev.filter(g => String(g._id) !== deleteGuideModal.guideId))
            setDeleteGuideModal(null)
        } finally {
            setDeletingGuide(false)
        }
    }

    async function handleLoadDeletedGuides() {
        if (loadingDeletedGuides) return
        setLoadingDeletedGuides(true)
        try {
            const res = await fetch('/api/training-guides?deleted=true')
            if (res.ok) { const data = await res.json(); setDeletedGuidesCache(Array.isArray(data) ? data : []) }
        } finally { setLoadingDeletedGuides(false) }
    }

    async function handleRestoreGuide(guideId: string) {
        if (restoringGuideId) return
        setRestoringGuideId(guideId)
        try {
            const res = await fetch(`/api/training-guides/${guideId}/restore`, { method: 'POST' })
            if (!res.ok) return
            const restored = deletedGuidesCache.find(g => String(g._id) === guideId)
            if (restored) {
                setDeletedGuidesCache(prev => prev.filter(g => String(g._id) !== guideId))
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { deletedAt, deletedById, deletedByName, ...rest } = restored
                setAllGuides(prev => [...prev, rest as TrainingGuide])
            }
        } finally { setRestoringGuideId(null) }
    }

    async function handleViewDeletedGuide(guideId: string) {
        if (loadingGuideView) return
        setLoadingGuideView(guideId)
        try {
            const res = await fetch(`/api/training-guides/${guideId}`)
            if (res.ok) setDeletedGuideView(await res.json())
        } finally { setLoadingGuideView(null) }
    }

    async function handleToggleVideos(typeId: string) {
        if (videosExpanded === typeId) { setVideosExpanded(null); return }
        setVideosExpanded(typeId)
        if (videosCache[typeId] === undefined) {
            setVideosLoading(typeId)
            try {
                const res = await fetch(`/api/training/types/${typeId}/videos`)
                const data = await res.json()
                setVideosCache(prev => ({ ...prev, [typeId]: data.videos ?? [] }))
            } catch { /* ignore */ } finally {
                setVideosLoading(null)
            }
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

    function handleDeleteDoc(typeId: string, docId: string, docTitle: string) {
        setDeleteDocModal({ typeId, docId, docTitle })
    }

    async function handleConfirmDeleteDoc() {
        if (!deleteDocModal || deletingDocId) return
        const { typeId, docId } = deleteDocModal
        setDeletingDocId(docId)
        setDeleteDocModal(null)
        try {
            const res = await fetch(`/api/training/types/${typeId}/docs/${docId}`, { method: 'DELETE' })
            if (!res.ok) return
            setDocsCache(prev => ({ ...prev, [typeId]: (prev[typeId] ?? []).filter(d => d._id !== docId) }))
            // If the deleted docs panel is open for this type, refresh it
            if (showDeletedDocs[typeId]) {
                setLoadingDeletedDocs(typeId)
                try {
                    const r2 = await fetch(`/api/training/types/${typeId}/docs?deleted=true`)
                    if (r2.ok) { const d = await r2.json(); setDeletedDocsCache(prev => ({ ...prev, [typeId]: d.docs ?? [] })) }
                } finally { setLoadingDeletedDocs(null) }
            }
        } finally {
            setDeletingDocId(null)
        }
    }

    async function handleLoadDeletedDocs(typeId: string) {
        setLoadingDeletedDocs(typeId)
        try {
            const res = await fetch(`/api/training/types/${typeId}/docs?deleted=true`)
            if (res.ok) { const d = await res.json(); setDeletedDocsCache(prev => ({ ...prev, [typeId]: d.docs ?? [] })) }
        } finally { setLoadingDeletedDocs(null) }
    }

    async function handleRestoreDoc(typeId: string, docId: string) {
        if (restoringDocId) return
        setRestoringDocId(docId)
        try {
            const res = await fetch(`/api/training/types/${typeId}/docs/${docId}/restore`, { method: 'POST' })
            if (!res.ok) return
            const restored = deletedDocsCache[typeId]?.find(d => d._id === docId)
            if (restored) {
                setDeletedDocsCache(prev => ({ ...prev, [typeId]: (prev[typeId] ?? []).filter(d => d._id !== docId) }))
                setDocsCache(prev => ({
                    ...prev,
                    [typeId]: prev[typeId] ? [...prev[typeId], { ...restored, deletedAt: undefined, deletedById: undefined, deletedByName: undefined }] : prev[typeId]
                }))
            }
        } finally {
            setRestoringDocId(null)
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

    async function handleCategoryDragEnd(cat: string, event: DragEndEvent) {
        const { active, over } = event
        if (!over || active.id === over.id) return

        const catItems = types.filter(t => t.category === cat).sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name))
        const oldIdx = catItems.findIndex(t => t._id === active.id)
        const newIdx = catItems.findIndex(t => t._id === over.id)
        if (oldIdx === -1 || newIdx === -1) return

        const reordered = arrayMove(catItems, oldIdx, newIdx)

        // Compute base sortOrder for this category (lowest existing sortOrder in this cat)
        const existingOrders = catItems.map(t => t.sortOrder).filter((v): v is number => v !== undefined)
        const base = existingOrders.length > 0 ? Math.min(...existingOrders) : CATEGORY_ORDER.indexOf(cat) * 100

        setTypes(prev => {
            const updated = [...prev]
            reordered.forEach((t, i) => {
                const idx = updated.findIndex(u => u._id === t._id)
                if (idx !== -1) updated[idx] = { ...updated[idx], sortOrder: base + i }
            })
            return updated
        })

        reordered.forEach((t, i) => {
            fetch(`/api/training/types/${t._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sortOrder: base + i }),
            }).catch(console.error)
        })
    }

    function openCreate() {
        setModal({ mode: 'create', name: '', category: CATEGORY_ORDER[0], billetField: 'j3Bct12', billetPoints: 1, description: '', status: 'active', durationMinutes: '', server: '', requiredModsRaw: '', prerequisiteNames: [], minTrainers: '', minTrainees: '', trainerDocUrl: '', infoDocUrl: '', coverImageUrl: '', linkedMedia: [] })
    }

    function openEdit(t: TType) {
        setModal({
            mode: 'edit', id: t._id,
            name: t.name, category: t.category, billetField: t.billetField, billetPoints: t.billetPoints,
            description: t.description ?? '',
            status: t.status ?? (t.isActive ? 'active' : 'inactive'),
            durationMinutes: t.durationMinutes?.toString() ?? '',
            server: t.server ?? '',
            requiredModsRaw: (t.requiredMods ?? []).join(', '),
            prerequisiteNames: t.prerequisites ?? [],
            minTrainers: t.minTrainers?.toString() ?? '',
            minTrainees: t.minTrainees?.toString() ?? '',
            trainerDocUrl: t.trainerDocUrl ?? '',
            infoDocUrl: t.infoDocUrl ?? '',
            coverImageUrl: t.coverImageUrl ?? '',
            linkedMedia: t.linkedMedia ?? [],
        })
    }

    function addMediaRow() {
        setModal(m => m ? { ...m, linkedMedia: [...m.linkedMedia, { type: 'url', label: '', url: '' }] } : m)
    }

    function updateMedia(i: number, field: keyof MediaEntry, value: string) {
        setModal(m => m ? { ...m, linkedMedia: m.linkedMedia.map((e, idx) => idx === i ? { ...e, [field]: value } : e) } : m)
    }

    function removeMedia(i: number) {
        setModal(m => m ? { ...m, linkedMedia: m.linkedMedia.filter((_, idx) => idx !== i) } : m)
    }

    function togglePrerequisite(name: string) {
        setModal(m => {
            if (!m) return m
            const already = m.prerequisiteNames.includes(name)
            return { ...m, prerequisiteNames: already ? m.prerequisiteNames.filter(n => n !== name) : [...m.prerequisiteNames, name] }
        })
    }

    const canSubmitDoc = isJ3Lead || isTrainer
    const visible = types.filter(t => {
        const s = t.status ?? (t.isActive ? 'active' : 'inactive')
        if (!isJ3Context) return s === 'active'
        if (isJ3Lead && showInactive) return true
        if (isJ3Lead) return s !== 'inactive'
        return s !== 'inactive'
    })
    const orderedCats = [
        ...CATEGORY_ORDER.filter(c => visible.some(t => t.category === c)),
        ...[...new Set(visible.map(t => t.category))].filter(c => !CATEGORY_ORDER.includes(c)).sort(),
    ]

    function renderDocsPanel(t: TType) {
        const allDocs = docsCache[t._id] ?? []
        const pendingDocs = allDocs.filter(d => d.approvalStatus === 'pending')
        const approvedDocs = allDocs.filter(d => d.approvalStatus === 'approved')
        const myPendingOrRejected = !isJ3Lead ? allDocs.filter(d => d.approvalStatus !== 'approved' && d.uploadedById === myId) : []

        return (
            <div style={{ border: `1px solid rgba(255,255,255,0.07)`, borderTop: 'none', background: 'rgba(0,0,0,0.15)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Course instance management — Selection / Reinforcement Cycle only */}
                {isJ3Lead && t.courseType && (() => {
                    const instances = courseInstancesCache[t._id] ?? []
                    const isLoaded = courseInstancesCache[t._id] !== undefined
                    const activeInst = instances.find(i => !i.deletedAt && ['planning', 'active', 'in_progress'].includes(i.status))
                    const historyInsts = instances.filter(i => !i.deletedAt && ['completed', 'cancelled', 'archived'].includes(i.status))
                    const deletedInsts = instances.filter(i => !!i.deletedAt)
                    const showDeleted = showDeletedInstances[t._id] ?? false
                    const tLabel = t.courseType === 'selection' ? 'Selection' : 'Reinforcement Cycle'
                    const sColor = (s: string) => s === 'planning' ? 'rgba(255,180,50,0.8)' : (s === 'active' || s === 'in_progress') ? 'rgba(80,200,120,0.8)' : s === 'completed' ? 'rgba(100,160,240,0.8)' : 'rgba(237,237,237,0.3)'
                    const sBorder = (s: string) => s === 'planning' ? 'rgba(255,180,50,0.25)' : (s === 'active' || s === 'in_progress') ? 'rgba(80,200,120,0.25)' : s === 'completed' ? 'rgba(100,160,240,0.25)' : 'rgba(255,255,255,0.1)'
                    return (
                        <div style={{ paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)' }}>
                                Course Instances
                            </div>
                            {!isLoaded ? (
                                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)' }}>Loading…</div>
                            ) : activeInst ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.04em', color: 'rgba(237,237,237,0.85)' }}>{activeInst.instanceRef}</span>
                                                <span style={{ fontSize: '0.45rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: sColor(activeInst.status), border: `1px solid ${sBorder(activeInst.status)}`, padding: '1px 5px' }}>
                                                    {activeInst.status}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.04em' }}>
                                                Created by {activeInst.createdByName} · {new Date(activeInst.createdAt).toLocaleDateString('en-AU')}
                                            </div>
                                            {activeInst.startDate && (
                                                <div style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.18)', marginTop: 1 }}>
                                                    {new Date(activeInst.startDate).toLocaleDateString('en-AU')} – {activeInst.endDate ? new Date(activeInst.endDate).toLocaleDateString('en-AU') : '…'}
                                                </div>
                                            )}
                                            {activeInst.candidateCount !== undefined && activeInst.candidateCount > 0 && (
                                                <div style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.15)', marginTop: 1 }}>
                                                    {activeInst.candidateCount} candidate{activeInst.candidateCount !== 1 ? 's' : ''}
                                                </div>
                                            )}
                                        </div>
                                        <button type='button' onClick={() => setDeleteInstanceModal({ instanceId: activeInst._id, typeId: t._id, instanceRef: activeInst.instanceRef })}
                                            style={{ padding: '3px 6px', background: 'transparent', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                            <Delete style={{ fontSize: 12 }} />
                                        </button>
                                    </div>
                                    <Link href={`/dashboard/unit/training-hub/course/${activeInst._id}`}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px 0', background: 'rgba(219,0,29,0.07)', border: '1px solid rgba(219,0,29,0.22)', color: 'rgba(219,0,29,0.7)', fontSize: '0.56rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none' }}>
                                        Open Course Workspace →
                                    </Link>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)' }}>No active {tLabel} instance</div>
                                    <button type='button' onClick={() => setCreateInstanceModal({ typeId: t._id, typeName: t.name, courseType: t.courseType!, session1Date: '' })}
                                        style={{ display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', padding: '4px 10px', background: 'transparent', border: '1px solid rgba(219,0,29,0.25)', color: 'rgba(219,0,29,0.65)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                        <Add style={{ fontSize: 11 }} /> Launch {tLabel}
                                    </button>
                                </div>
                            )}
                            {historyInsts.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {!(showHistoryInstances[t._id]) ? (
                                        <button type='button' onClick={() => setShowHistoryInstances(prev => ({ ...prev, [t._id]: true }))}
                                            style={{ fontSize: '0.5rem', color: 'rgba(237,237,237,0.2)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, letterSpacing: '0.08em', textAlign: 'left' }}>
                                            ▾ Show history ({historyInsts.length})
                                        </button>
                                    ) : (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>History ({historyInsts.length})</div>
                                                <button type='button' onClick={() => setShowHistoryInstances(prev => ({ ...prev, [t._id]: false }))}
                                                    style={{ fontSize: '0.5rem', color: 'rgba(237,237,237,0.2)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                                                    ▴ Hide
                                                </button>
                                            </div>
                                            {historyInsts.map(inst => (
                                                <div key={inst._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(237,237,237,0.45)', flex: 1 }}>{inst.instanceRef}</span>
                                                    <span style={{ fontSize: '0.45rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: sColor(inst.status), border: `1px solid ${sBorder(inst.status)}`, padding: '1px 5px' }}>{inst.status}</span>
                                                    <Link href={`/dashboard/unit/training-hub/course/${inst._id}`}
                                                        style={{ padding: '2px 8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.35)', fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none' }}>
                                                        Open
                                                    </Link>
                                                    <button type='button' onClick={() => setDeleteInstanceModal({ instanceId: inst._id, typeId: t._id, instanceRef: inst.instanceRef })}
                                                        style={{ padding: '2px 5px', background: 'transparent', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(237,237,237,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                                        <Delete style={{ fontSize: 10 }} />
                                                    </button>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </div>
                            )}
                            <div>
                                {!showDeleted ? (
                                    <button type='button' onClick={() => setShowDeletedInstances(prev => ({ ...prev, [t._id]: true }))}
                                        style={{ fontSize: '0.5rem', color: 'rgba(237,237,237,0.2)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, letterSpacing: '0.08em' }}>
                                        ▾ Show deleted
                                    </button>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.4)' }}>Deleted ({deletedInsts.length})</div>
                                            <button type='button' onClick={() => setShowDeletedInstances(prev => ({ ...prev, [t._id]: false }))}
                                                style={{ fontSize: '0.5rem', color: 'rgba(237,237,237,0.2)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                                                ▴ Hide
                                            </button>
                                        </div>
                                        {deletedInsts.length === 0 ? (
                                            <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.15)' }}>No deleted instances</div>
                                        ) : deletedInsts.map(inst => (
                                            <div key={inst._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'rgba(219,0,29,0.02)', border: '1px solid rgba(219,0,29,0.08)' }}>
                                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(237,237,237,0.25)', flex: 1, textDecoration: 'line-through' }}>{inst.instanceRef}</span>
                                                <span style={{ fontSize: '0.46rem', color: 'rgba(237,237,237,0.18)', letterSpacing: '0.06em' }}>by {inst.deletedByName}</span>
                                                <button type='button' onClick={() => handleRestoreInstance(inst._id, t._id)} disabled={restoringInstanceId === inst._id}
                                                    style={{ padding: '2px 8px', background: 'transparent', border: '1px solid rgba(80,200,120,0.25)', color: 'rgba(80,200,120,0.6)', fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: restoringInstanceId === inst._id ? 0.4 : 1 }}>
                                                    Restore
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })()}

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
                                    <button type='button' onClick={() => handleApproveDoc(t._id, doc._id)} disabled={!!approvingDocId}
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
                                <button type='button' onClick={() => handleDeleteDoc(t._id, doc._id, doc.title)} disabled={deletingDocId === doc._id}
                                    style={{ flexShrink: 0, padding: '3px 6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.25)', fontSize: '0.55rem', cursor: deletingDocId === doc._id ? 'default' : 'pointer', opacity: deletingDocId === doc._id ? 0.4 : 1 }}>
                                    <Delete style={{ fontSize: 11 }} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Persistent guide buttons for J3 context */}
                {isJ3Context && (() => {
                    const cached = guidesCache[t._id] ?? []
                    const tDoc    = cached.find(g => g.guideType === 'training_document')
                    const tGuide  = cached.find(g => g.guideType === 'trainers_guide' || !g.guideType)
                    return (
                        <div style={{ display: 'flex', gap: 6 }}>
                            {/* Training Document button */}
                            <button type='button'
                                onClick={() => tDoc ? handleOpenGuide(String(tDoc._id)) : handleCreateGuide(t._id, 'training_document')}
                                disabled={creatingGuide || guidesLoading === t._id}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 10px', background: tDoc ? 'rgba(100,160,240,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${tDoc ? 'rgba(100,160,240,0.25)' : 'rgba(255,255,255,0.1)'}`, color: tDoc ? 'rgba(100,160,240,0.85)' : 'rgba(237,237,237,0.45)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: creatingGuide ? 'default' : 'pointer', opacity: (creatingGuide || guidesLoading === t._id) ? 0.5 : 1 }}>
                                <Article style={{ fontSize: 12 }} />
                                {tDoc ? 'Training Document' : (creatingGuide ? 'Creating…' : '+ Training Document')}
                            </button>
                            {/* Trainer's Guide button */}
                            <button type='button'
                                onClick={() => tGuide ? handleOpenGuide(String(tGuide._id)) : handleCreateGuide(t._id, 'trainers_guide')}
                                disabled={creatingGuide || guidesLoading === t._id}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 10px', background: tGuide ? 'rgba(219,0,29,0.08)' : 'rgba(219,0,29,0.03)', border: `1px solid ${tGuide ? 'rgba(219,0,29,0.3)' : 'rgba(219,0,29,0.15)'}`, color: tGuide ? 'rgba(219,0,29,0.85)' : 'rgba(219,0,29,0.45)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: creatingGuide ? 'default' : 'pointer', opacity: (creatingGuide || guidesLoading === t._id) ? 0.5 : 1 }}>
                                <Article style={{ fontSize: 12 }} />
                                {tGuide ? "Trainer's Guide" : (creatingGuide ? 'Creating…' : "+ Trainer's Guide")}
                            </button>
                        </div>
                    )
                })()}

                {isJ3Lead && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.4)' }}>
                            Approved Documents
                        </div>
                        <button type='button'
                            onClick={() => {
                                const next = !showDeletedDocs[t._id]
                                setShowDeletedDocs(prev => ({ ...prev, [t._id]: next }))
                                if (next && deletedDocsCache[t._id] === undefined) handleLoadDeletedDocs(t._id)
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'transparent', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.4)', fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                            <Delete style={{ fontSize: 10 }} />
                            Bin {deletedDocsCache[t._id]?.length ? `(${deletedDocsCache[t._id].length})` : ''}
                        </button>
                    </div>
                )}
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
                                <button type='button' onClick={() => handleDeleteDoc(t._id, doc._id, doc.title)} disabled={deletingDocId === doc._id}
                                    style={{ flexShrink: 0, padding: '3px 6px', background: 'transparent', border: '1px solid rgba(219,0,29,0.15)', color: 'rgba(219,0,29,0.4)', fontSize: '0.55rem', cursor: deletingDocId === doc._id ? 'default' : 'pointer', opacity: deletingDocId === doc._id ? 0.4 : 1 }}>
                                    <Delete style={{ fontSize: 11 }} />
                                </button>
                            )}
                        </div>
                    ))
                )}
                {isJ3Lead && showDeletedDocs[t._id] && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(219,0,29,0.1)' }}>
                        <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.35)', marginBottom: 6 }}>
                            Recycle Bin
                        </div>
                        {loadingDeletedDocs === t._id ? (
                            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)' }}>Loading…</div>
                        ) : (deletedDocsCache[t._id] ?? []).length === 0 ? (
                            <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.2)' }}>Recycle bin is empty</div>
                        ) : (deletedDocsCache[t._id] ?? []).map(doc => (
                            <div key={doc._id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6, padding: '6px 8px', background: 'rgba(219,0,29,0.03)', border: '1px solid rgba(219,0,29,0.08)' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(237,237,237,0.3)', textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
                                    <div style={{ fontSize: '0.52rem', color: 'rgba(237,237,237,0.18)', marginTop: 2 }}>Deleted by {doc.deletedByName}</div>
                                </div>
                                <button type='button' onClick={() => handleRestoreDoc(t._id, doc._id)} disabled={restoringDocId === doc._id}
                                    style={{ flexShrink: 0, padding: '3px 8px', background: 'transparent', border: '1px solid rgba(80,200,120,0.25)', color: 'rgba(80,200,120,0.6)', fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: restoringDocId === doc._id ? 'default' : 'pointer', opacity: restoringDocId === doc._id ? 0.4 : 1 }}>
                                    Restore
                                </button>
                            </div>
                        ))}
                    </div>
                )}


            </div>
        )
    }

    function renderVideosPanel(t: TType) {
        const videos    = videosCache[t._id] ?? []
        const cfg       = STATUS_CFG[t.status ?? (t.isActive ? 'active' : 'inactive')]
        const existing  = videos[0] ?? null
        const isUploading = courseUploadTypeId === t._id

        return (
            <div style={{ border: `1px solid ${cfg.cardBorder}`, borderTop: 'none', background: 'rgba(0,0,0,0.18)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <VideoLibrary style={{ fontSize: 12 }} /> Course Video
                </div>

                {videosLoading === t._id && <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)' }}>Loading…</div>}

                {/* Existing video */}
                {!videosLoading && existing && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(237,237,237,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{existing.title}</div>
                                <div style={{ fontSize: '0.52rem', color: 'rgba(237,237,237,0.2)', marginTop: 2 }}>
                                    {existing.checkpoints.length} checkpoint{existing.checkpoints.length !== 1 ? 's' : ''} · by {existing.addedByName}
                                </div>
                            </div>
                            <Link href={`/dashboard/unit/training-hub/video/${String(existing._id)}/watch?from=courses`}
                                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none' }}>
                                ▶ Watch
                            </Link>
                            {isJ3Lead && (
                                <Link href={`/dashboard/unit/training-hub/video/${String(existing._id)}/edit?from=courses`}
                                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.45)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none' }}>
                                    <Edit style={{ fontSize: 11 }} /> Edit
                                </Link>
                            )}
                            {isJ3Lead && (
                                <button type='button' onClick={() => handleDeleteVideo(t._id, String(existing._id))} disabled={!!deletingVideoId}
                                    style={{ flexShrink: 0, padding: '4px 6px', background: 'transparent', border: '1px solid rgba(219,0,29,0.15)', color: 'rgba(219,0,29,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: deletingVideoId ? 0.4 : 1 }}>
                                    <Delete style={{ fontSize: 12 }} />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* No video yet */}
                {!videosLoading && !existing && !isUploading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)' }}>No video added yet</div>
                        {(isJ3Lead || isTrainer) && (
                            <button type='button' onClick={() => { setCourseUploadTypeId(t._id); setCourseUploadTitle(''); setCourseUploadDesc(''); setCourseYoutubeUrl('') }}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', padding: '4px 9px', background: 'transparent', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.6)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                <Add style={{ fontSize: 11 }} /> Add Video
                            </button>
                        )}
                    </div>
                )}

                {/* Add video form */}
                {isUploading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input value={courseUploadTitle} onChange={e => setCourseUploadTitle(e.target.value)} placeholder='Video title *' autoFocus style={smallInput} />
                        <input value={courseUploadDesc}  onChange={e => setCourseUploadDesc(e.target.value)}  placeholder='Description (optional)' style={smallInput} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <SmartDisplay style={{ fontSize: 15, color: 'rgba(219,0,29,0.5)', flexShrink: 0 }} />
                            <input type='url' value={courseYoutubeUrl} onChange={e => setCourseYoutubeUrl(e.target.value)}
                                placeholder='https://www.youtube.com/watch?v=…'
                                style={{ ...smallInput, flex: 1 }} />
                        </div>
                        {courseYoutubeUrl && !extractYouTubeId(courseYoutubeUrl) && (
                            <div style={{ fontSize: '0.58rem', color: 'rgba(219,0,29,0.65)', paddingLeft: 21 }}>Not a recognised YouTube URL.</div>
                        )}
                        {courseYoutubeUrl && extractYouTubeId(courseYoutubeUrl) && (
                            <div style={{ fontSize: '0.58rem', color: 'rgba(80,200,120,0.65)', paddingLeft: 21 }}>ID: {extractYouTubeId(courseYoutubeUrl)}</div>
                        )}
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button type='button' onClick={() => setCourseUploadTypeId(null)}
                                style={{ padding: '4px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.35)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type='button' onClick={() => handleCourseVideoAdd(t._id)}
                                disabled={!courseYoutubeUrl.trim() || !courseUploadTitle.trim() || courseAdding || !extractYouTubeId(courseYoutubeUrl)}
                                style={{ padding: '4px 10px', background: RED, border: 'none', color: '#fff', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: (!courseYoutubeUrl.trim() || !courseUploadTitle.trim() || courseAdding || !extractYouTubeId(courseYoutubeUrl)) ? 0.4 : 1 }}>
                                {courseAdding ? 'Adding…' : 'Add Video'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // Prerequisites available for the current modal (exclude the item being edited)
    const prereqOptions = types.filter(t => t._id !== modal?.id).sort((a, b) => a.name.localeCompare(b.name))

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
                    {(['courses', 'events', 'requests'] as Tab[]).map(t => (
                        <button key={t} type='button' onClick={() => setTab(t)}
                            style={{ padding: '8px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? RED : 'transparent'}`, color: tab === t ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.35)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', marginBottom: -1, transition: 'color 0.15s, border-color 0.15s' }}>
                            {t === 'courses' ? 'Courses' : t === 'events' ? 'Events' : 'Requests'}
                        </button>
                    ))}
                    {isJ3Context && (
                        <button type='button' onClick={() => { setTab('guides'); loadAllGuides() }}
                            style={{ padding: '8px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === 'guides' ? RED : 'transparent'}`, color: tab === 'guides' ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.35)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', marginBottom: -1, transition: 'color 0.15s, border-color 0.15s' }}>
                            Training Documents
                        </button>
                    )}
                    {isJ3Context && (
                        <button type='button' onClick={() => setTab('videos')}
                            style={{ padding: '8px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === 'videos' ? RED : 'transparent'}`, color: tab === 'videos' ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.35)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', marginBottom: -1, transition: 'color 0.15s, border-color 0.15s' }}>
                            Training Videos
                        </button>
                    )}
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
                                const catItems = visible
                                    .filter(t => t.category === cat)
                                    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name))
                                if (!catItems.length) return null
                                return (
                                    <div key={cat}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                                            <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', flexShrink: 0 }}>{cat}</span>
                                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                                            <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.1em', flexShrink: 0 }}>{catItems.length}</span>
                                        </div>
                                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleCategoryDragEnd(cat, e)}>
                                            <SortableContext items={catItems.map(t => t._id)} strategy={rectSortingStrategy}>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                                                    {catItems.map(t => (
                                                        <div key={t._id} style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <SortableTypeCard
                                                                type={t}
                                                                isJ3Lead={isJ3Lead}
                                                                toggling={togglingId === t._id}
                                                                onEdit={() => openEdit(t)}
                                                                onToggle={() => handleToggle(t)}
                                                                docsExpanded={docsExpanded === t._id}
                                                                docsCount={docsCache[t._id]?.filter(d => d.approvalStatus === 'approved').length}
                                                                onToggleDocs={() => handleToggleDocs(t._id)}
                                                                videosExpanded={videosExpanded === t._id}
                                                                videosCount={videosCache[t._id]?.length}
                                                                onToggleVideos={() => handleToggleVideos(t._id)}
                                                            />
                                                            {docsExpanded === t._id && renderDocsPanel(t)}
                                                            {videosExpanded === t._id && renderVideosPanel(t)}
                                                        </div>
                                                    ))}
                                                </div>
                                            </SortableContext>
                                        </DndContext>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Tab: Training Documents */}
            {tab === 'guides' && (
                <div style={{ padding: 'clamp(1.5rem, 3vw, 2.5rem)', paddingTop: 24 }}>
                    {/* Recycle bin toggle */}
                    {isJ3Lead && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                            <button type='button' onClick={() => {
                                const next = !showDeletedGuides
                                setShowDeletedGuides(next)
                                if (next && deletedGuidesCache.length === 0) handleLoadDeletedGuides()
                            }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 11px', background: showDeletedGuides ? 'rgba(219,0,29,0.08)' : 'transparent', border: '1px solid rgba(219,0,29,0.22)', color: 'rgba(219,0,29,0.55)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                <Delete style={{ fontSize: 12 }} />
                                Recycle Bin{deletedGuidesCache.length > 0 ? ` (${deletedGuidesCache.length})` : ''}
                            </button>
                        </div>
                    )}

                    {/* Deleted guides panel */}
                    {isJ3Lead && showDeletedGuides && (
                        <div style={{ marginBottom: 20, border: '1px solid rgba(219,0,29,0.15)', background: 'rgba(219,0,29,0.03)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 2 }}>
                                Recycle Bin
                            </div>
                            {loadingDeletedGuides ? (
                                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)' }}>Loading…</div>
                            ) : deletedGuidesCache.length === 0 ? (
                                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)' }}>No deleted guides.</div>
                            ) : deletedGuidesCache.map(g => {
                                const gId = String(g._id)
                                return (
                                    <div key={gId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <span style={{ fontSize: '0.58rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.2)', flexShrink: 0 }}>{g.docRef}</span>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(237,237,237,0.3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'line-through' }}>{g.title || '(Untitled)'}</span>
                                        <span style={{ fontSize: '0.52rem', color: 'rgba(237,237,237,0.18)', flexShrink: 0 }}>
                                            Deleted by {g.deletedByName ?? '—'}
                                        </span>
                                        <button type='button' onClick={() => handleViewDeletedGuide(gId)} disabled={loadingGuideView === gId}
                                            style={{ padding: '2px 9px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: loadingGuideView === gId ? 'default' : 'pointer', opacity: loadingGuideView === gId ? 0.4 : 1, flexShrink: 0 }}>
                                            {loadingGuideView === gId ? '…' : 'View'}
                                        </button>
                                        <button type='button' onClick={() => handleRestoreGuide(gId)} disabled={restoringGuideId === gId}
                                            style={{ padding: '2px 9px', background: 'transparent', border: '1px solid rgba(80,200,120,0.3)', color: 'rgba(80,200,120,0.65)', fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: restoringGuideId === gId ? 'default' : 'pointer', opacity: restoringGuideId === gId ? 0.4 : 1, flexShrink: 0 }}>
                                            Restore
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {allGuidesLoading ? (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.1em' }}>Loading…</div>
                    ) : allGuides.length === 0 ? (
                        <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.06em' }}>No training guides or documents found.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid rgba(255,255,255,0.07)' }}>
                            {/* Header row */}
                            <div style={{ display: 'grid', gridTemplateColumns: `90px 1fr 100px 80px 1fr ${isJ3Lead ? '160px' : '120px'}`, gap: 12, padding: '7px 14px', background: 'rgba(219,0,29,0.07)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                {['Ref', 'Title', 'Type', 'Status', 'Linked Course', ''].map(h => (
                                    <div key={h} style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>{h}</div>
                                ))}
                            </div>
                            {allGuides.map(g => {
                                const gId = String(g._id)
                                const linkedType = g.trainingTypeId ? types.find(t => t._id === g.trainingTypeId) : null
                                const isLinking  = linkingGuideId === gId
                                return (
                                    <div key={gId} style={{ display: 'grid', gridTemplateColumns: `90px 1fr 100px 80px 1fr ${isJ3Lead ? '160px' : '120px'}`, gap: 12, padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
                                        <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.docRef}</div>
                                        <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'rgba(237,237,237,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title || '(Untitled)'}</div>
                                        <div>
                                            <span style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '2px 6px', border: g.guideType === 'training_document' ? '1px solid rgba(100,160,240,0.25)' : '1px solid rgba(219,0,29,0.25)', color: g.guideType === 'training_document' ? 'rgba(100,160,240,0.8)' : 'rgba(219,0,29,0.7)' }}>
                                                {g.guideType === 'training_document' ? 'Document' : 'Guide'}
                                            </span>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 6px', border: g.status === 'approved' ? '1px solid rgba(80,200,120,0.25)' : '1px solid rgba(255,180,50,0.25)', color: g.status === 'approved' ? 'rgba(80,200,120,0.8)' : 'rgba(255,180,50,0.8)' }}>
                                                {g.status}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {linkedType ? linkedType.name : <span style={{ color: 'rgba(237,237,237,0.2)' }}>—</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                                            <button type='button' onClick={() => handleOpenGuide(gId)}
                                                style={{ padding: '3px 9px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.45)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                Open
                                            </button>
                                            {isLinking ? (
                                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                    <select value={linkTarget} onChange={e => setLinkTarget(e.target.value)}
                                                        style={{ fontSize: '0.62rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.7)', padding: '3px 5px', outline: 'none', maxWidth: 120 }}>
                                                        <option value=''>— unlink —</option>
                                                        {types.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                                                    </select>
                                                    <button type='button' onClick={() => handleLinkGuide(gId, linkTarget || null)}
                                                        style={{ padding: '3px 7px', background: RED, border: 'none', color: '#fff', fontSize: '0.55rem', fontWeight: 800, cursor: 'pointer' }}>
                                                        Save
                                                    </button>
                                                    <button type='button' onClick={() => setLinkingGuideId(null)}
                                                        style={{ padding: '3px 6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.3)', fontSize: '0.55rem', cursor: 'pointer' }}>
                                                        ✕
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <button type='button' onClick={() => { setLinkingGuideId(gId); setLinkTarget(g.trainingTypeId ?? '') }}
                                                        style={{ padding: '3px 7px', background: 'transparent', border: '1px solid rgba(219,0,29,0.18)', color: 'rgba(219,0,29,0.5)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                        {g.trainingTypeId ? 'Relink' : 'Link'}
                                                    </button>
                                                    {isJ3Lead && (
                                                        <button type='button' onClick={() => setDeleteGuideModal({ guideId: gId, guideTitle: g.title || '(Untitled)' })}
                                                            style={{ display: 'flex', alignItems: 'center', padding: '3px 6px', background: 'transparent', border: '1px solid rgba(219,0,29,0.15)', color: 'rgba(219,0,29,0.4)', cursor: 'pointer' }}
                                                            title='Delete guide'>
                                                            <Delete style={{ fontSize: 12 }} />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Tab: Events */}
            {tab === 'events' && <EventsTab isJ3Lead={isJ3Lead} isTrainer={isTrainer} isJ3Trainer={isJ3Trainer} />}

            {/* Tab: Requests */}
            {tab === 'requests' && <RequestsTab isJ3Lead={isJ3Lead} myId={myId} />}

            {/* Tab: Training Videos */}
            {tab === 'videos' && <TrainingVideosTab isJ3Lead={isJ3Lead} isTrainer={isTrainer} myId={myId} />}

            {/* Course type create / edit modal */}
            {modal && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
                >
                    <div style={{ background: '#0e0e0e', border: `1px solid rgba(219,0,29,0.25)`, borderTop: `3px solid ${RED}`, padding: 28, width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 6 }}>
                                {'//'} {modal.mode === 'create' ? 'ADD' : 'EDIT'} TRAINING TYPE
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                                {modal.mode === 'create' ? 'New Training Course' : 'Edit Training Course'}
                            </h3>
                        </div>

                        {/* ── Core ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <Field label='Course Name *'>
                                <input value={modal.name} onChange={e => setModal(m => m && ({ ...m, name: e.target.value }))}
                                    placeholder='e.g. Advanced Medical Course' autoFocus style={inputStyle} />
                            </Field>
                            <Field label='Category *'>
                                <select
                                    value={modal.category}
                                    onChange={e => setModal(m => m && ({ ...m, category: e.target.value }))}
                                    style={{ ...inputStyle, cursor: 'pointer' }}
                                >
                                    {CATEGORY_ORDER.map(c => <option key={c} value={c}>{c}</option>)}
                                    {/* Show current category if it's not in the standard list */}
                                    {!CATEGORY_ORDER.includes(modal.category) && modal.category && (
                                        <option value={modal.category}>{modal.category}</option>
                                    )}
                                </select>
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

                        {/* ── Status ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <SectionLabel>Status</SectionLabel>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {(['active', 'wip', 'inactive'] as TypeStatus[]).map(s => {
                                    const cfg = STATUS_CFG[s]
                                    const sel = modal.status === s
                                    return (
                                        <button key={s} type='button' onClick={() => setModal(m => m && ({ ...m, status: s }))}
                                            style={{ flex: 1, padding: '8px 6px', background: sel ? `rgba(${s === 'active' ? '80,200,120' : s === 'wip' ? '255,180,50' : '100,100,100'},0.1)` : 'transparent', border: `1px solid ${sel ? cfg.border : 'rgba(255,255,255,0.08)'}`, color: sel ? cfg.color : 'rgba(237,237,237,0.35)', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s' }}>
                                            {cfg.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* ── Event Defaults ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <SectionLabel>Event Defaults</SectionLabel>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Field label='Duration (minutes)'>
                                    <input type='number' min={1} step={1} value={modal.durationMinutes}
                                        onChange={e => setModal(m => m && ({ ...m, durationMinutes: e.target.value }))}
                                        placeholder='e.g. 90' style={inputStyle} />
                                </Field>
                                <Field label='Default Server'>
                                    <input value={modal.server} onChange={e => setModal(m => m && ({ ...m, server: e.target.value }))}
                                        placeholder='e.g. Training' style={inputStyle} />
                                </Field>
                            </div>
                            <Field label='Required Mods (comma-separated)'>
                                <input value={modal.requiredModsRaw} onChange={e => setModal(m => m && ({ ...m, requiredModsRaw: e.target.value }))}
                                    placeholder='e.g. ACE, TFAR' style={inputStyle} />
                            </Field>
                        </div>

                        {/* ── Requirements ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <SectionLabel>Requirements</SectionLabel>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Field label='Min Trainers'>
                                    <input type='number' min={1} step={1} value={modal.minTrainers}
                                        onChange={e => setModal(m => m && ({ ...m, minTrainers: e.target.value }))}
                                        placeholder='1' style={inputStyle} />
                                </Field>
                                <Field label='Min Trainees'>
                                    <input type='number' min={1} step={1} value={modal.minTrainees}
                                        onChange={e => setModal(m => m && ({ ...m, minTrainees: e.target.value }))}
                                        placeholder='1' style={inputStyle} />
                                </Field>
                            </div>
                            <Field label='Prerequisites (select from available courses)'>
                                {prereqOptions.length === 0 ? (
                                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', padding: '8px 0' }}>No other courses available</div>
                                ) : (
                                    <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: '6px 0' }}>
                                        {prereqOptions.map(t => {
                                            const checked = modal.prerequisiteNames.includes(t.name)
                                            return (
                                                <label key={t._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 12px', cursor: 'pointer', background: checked ? 'rgba(219,0,29,0.06)' : 'transparent', transition: 'background 0.1s' }}>
                                                    <input
                                                        type='checkbox'
                                                        checked={checked}
                                                        onChange={() => togglePrerequisite(t.name)}
                                                        style={{ accentColor: RED, flexShrink: 0 }}
                                                    />
                                                    <span style={{ fontSize: '0.72rem', color: checked ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.5)' }}>
                                                        {t.name}
                                                    </span>
                                                    <span style={{ fontSize: '0.52rem', color: 'rgba(237,237,237,0.2)', marginLeft: 'auto', flexShrink: 0 }}>{t.category}</span>
                                                </label>
                                            )
                                        })}
                                    </div>
                                )}
                                {modal.prerequisiteNames.length > 0 && (
                                    <div style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.3)', marginTop: 5, letterSpacing: '0.06em' }}>
                                        Selected: {modal.prerequisiteNames.join(', ')}
                                    </div>
                                )}
                            </Field>
                        </div>

                        {/* ── Resources ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <SectionLabel>Resources</SectionLabel>
                            <Field label='Trainer Guide URL'>
                                <input value={modal.trainerDocUrl} onChange={e => setModal(m => m && ({ ...m, trainerDocUrl: e.target.value }))}
                                    placeholder='https://…' style={inputStyle} />
                            </Field>
                            <Field label='Info / Student Doc URL'>
                                <input value={modal.infoDocUrl} onChange={e => setModal(m => m && ({ ...m, infoDocUrl: e.target.value }))}
                                    placeholder='https://…' style={inputStyle} />
                            </Field>
                            <Field label='Cover Image URL'>
                                <input value={modal.coverImageUrl} onChange={e => setModal(m => m && ({ ...m, coverImageUrl: e.target.value }))}
                                    placeholder='https://…' style={inputStyle} />
                            </Field>
                        </div>

                        {/* ── Linked Media ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <SectionLabel>Linked Media</SectionLabel>
                            {modal.linkedMedia.map((m, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto', gap: 6, alignItems: 'end' }}>
                                    <select value={m.type} onChange={e => updateMedia(i, 'type', e.target.value)}
                                        style={{ ...inputStyle, width: 'auto', fontSize: '0.72rem', padding: '7px 8px', cursor: 'pointer' }}>
                                        <option value='url'>URL</option>
                                        <option value='video'>Video</option>
                                        <option value='file'>File</option>
                                    </select>
                                    <input value={m.label} onChange={e => updateMedia(i, 'label', e.target.value)}
                                        placeholder='Label' style={{ ...inputStyle, fontSize: '0.78rem', padding: '7px 8px' }} />
                                    <input value={m.url} onChange={e => updateMedia(i, 'url', e.target.value)}
                                        placeholder='URL' style={{ ...inputStyle, fontSize: '0.78rem', padding: '7px 8px' }} />
                                    <button type='button' onClick={() => removeMedia(i)}
                                        style={{ padding: '7px 8px', background: 'transparent', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.5)', cursor: 'pointer', flexShrink: 0 }}>
                                        <Delete style={{ fontSize: 13 }} />
                                    </button>
                                </div>
                            ))}
                            <button type='button' onClick={addMediaRow}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', padding: '4px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.3)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                <Add style={{ fontSize: 11 }} /> Add Media
                            </button>
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

            {/* Delete course instance confirmation modal */}
            {deleteInstanceModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setDeleteInstanceModal(null) }}>
                    <div style={{ background: '#0e0e0e', border: '1px solid rgba(219,0,29,0.35)', borderTop: '3px solid #db001d', padding: 28, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 6 }}>{'//'} DELETE INSTANCE</div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                                Delete {deleteInstanceModal.instanceRef}?
                            </h3>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.45)', lineHeight: 1.6 }}>
                            This instance will be moved to the recycle bin. It can be restored by a J3 lead at any time.
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button type='button' onClick={() => setDeleteInstanceModal(null)}
                                style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.45)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type='button' onClick={() => handleDeleteInstance(deleteInstanceModal.instanceId, deleteInstanceModal.typeId)} disabled={!!deletingInstanceId}
                                style={{ padding: '8px 20px', background: deletingInstanceId ? 'rgba(219,0,29,0.3)' : RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: deletingInstanceId ? 'default' : 'pointer' }}>
                                {deletingInstanceId ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create course instance confirmation modal */}
            {createInstanceModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setCreateInstanceModal(null) }}>
                    <div style={{ background: '#0e0e0e', border: '1px solid rgba(219,0,29,0.25)', borderTop: '3px solid #db001d', padding: 28, width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 6 }}>{'//'} LAUNCH COURSE</div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                                Launch {createInstanceModal.courseType === 'selection' ? 'Selection' : 'Reinforcement Cycle'}?
                            </h3>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.6 }}>
                            Creating a new course instance for <strong style={{ color: 'rgba(237,237,237,0.8)' }}>{createInstanceModal.typeName}</strong>. Only one active instance is permitted at a time.
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>Session 1 Date (optional)</label>
                            <input
                                type='date'
                                value={createInstanceModal.session1Date}
                                min={new Date().toLocaleDateString('en-CA')}
                                onChange={e => setCreateInstanceModal(m => m ? { ...m, session1Date: e.target.value } : m)}
                                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderBottom: '2px solid rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.9)', fontSize: '0.82rem', padding: '7px 10px', outline: 'none' }}
                            />
                        </div>
                        {createInstanceModal.session1Date && (() => {
                            const dates = calculateSessionDates(createInstanceModal.session1Date)
                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', marginBottom: 2 }}>Calculated Session Dates</div>
                                    {SESSION_DEFS.map((def, i) => (
                                        <div key={def.sessionNumber} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem', color: def.catchUp ? 'rgba(255,180,50,0.65)' : 'rgba(237,237,237,0.45)' }}>
                                            <span>Session {def.sessionNumber}</span>
                                            <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.62rem' }}>{dates[i].toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                        </div>
                                    ))}
                                </div>
                            )
                        })()}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button type='button' onClick={() => setCreateInstanceModal(null)}
                                style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.45)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button type='button' onClick={() => handleCreateInstance(createInstanceModal.typeId, createInstanceModal.session1Date || undefined)} disabled={creatingInstance}
                                style={{ padding: '8px 20px', background: creatingInstance ? 'rgba(219,0,29,0.3)' : RED, border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: creatingInstance ? 'default' : 'pointer' }}>
                                {creatingInstance ? 'Launching…' : 'Launch'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete doc confirmation modal */}
            {deleteDocModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setDeleteDocModal(null) }}>
                    <div style={{ background: '#0d0d0d', border: '1px solid rgba(219,0,29,0.25)', borderTop: '3px solid #db001d', padding: 28, width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.85)' }}>Delete Document</div>
                        <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.6)', fontFamily: 'Arial, sans-serif' }}>
                            Delete <strong style={{ color: 'rgba(237,237,237,0.85)' }}>{deleteDocModal.docTitle}</strong>? It will be moved to the recycle bin and can be restored later.
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={handleConfirmDeleteDoc}
                                style={{ flex: 1, padding: '9px', background: '#db001d', border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                                Delete
                            </button>
                            <button onClick={() => setDeleteDocModal(null)}
                                style={{ flex: 1, padding: '9px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.5)', fontSize: '0.65rem', cursor: 'pointer' }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Deleted guide view modal */}
            {deletedGuideView && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 24px', overflowY: 'auto' }}
                    onClick={e => { if (e.target === e.currentTarget) setDeletedGuideView(null) }}>
                    <div style={{ background: '#0d0d0d', border: '1px solid rgba(219,0,29,0.2)', borderTop: '3px solid rgba(219,0,29,0.5)', width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {/* Header */}
                        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                            <div>
                                <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 5 }}>
                                    Recycle Bin — Read-only Preview
                                </div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.85)' }}>
                                    {deletedGuideView.title || '(Untitled)'}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                    <span style={{ fontSize: '0.52rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.3)' }}>{deletedGuideView.docRef}</span>
                                    <span style={{ fontSize: '0.45rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '1px 6px', border: deletedGuideView.guideType === 'training_document' ? '1px solid rgba(100,160,240,0.25)' : '1px solid rgba(219,0,29,0.25)', color: deletedGuideView.guideType === 'training_document' ? 'rgba(100,160,240,0.7)' : 'rgba(219,0,29,0.6)' }}>
                                        {deletedGuideView.guideType === 'training_document' ? 'Document' : 'Guide'}
                                    </span>
                                    <span style={{ fontSize: '0.45rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '1px 6px', border: deletedGuideView.status === 'approved' ? '1px solid rgba(80,200,120,0.25)' : '1px solid rgba(255,180,50,0.25)', color: deletedGuideView.status === 'approved' ? 'rgba(80,200,120,0.7)' : 'rgba(255,180,50,0.7)' }}>
                                        {deletedGuideView.status}
                                    </span>
                                    {deletedGuideView.duration && (
                                        <span style={{ fontSize: '0.48rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.06em' }}>{deletedGuideView.duration}</span>
                                    )}
                                </div>
                                {deletedGuideView.deletedByName && (
                                    <div style={{ fontSize: '0.5rem', color: 'rgba(219,0,29,0.4)', marginTop: 5, letterSpacing: '0.04em' }}>
                                        Deleted by {deletedGuideView.deletedByName}
                                        {deletedGuideView.deletedAt && <> · {new Date(deletedGuideView.deletedAt).toLocaleDateString('en-AU')}</>}
                                    </div>
                                )}
                            </div>
                            <button type='button' onClick={() => setDeletedGuideView(null)}
                                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.9rem', padding: '3px 9px', cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>
                                ✕
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                            {/* Overview */}
                            {deletedGuideView.overview && (
                                <div>
                                    <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 7 }}>Overview</div>
                                    <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{deletedGuideView.overview}</div>
                                </div>
                            )}

                            {/* Training area */}
                            {deletedGuideView.trainingAreaDescription && (
                                <div>
                                    <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 7 }}>Training Area</div>
                                    <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{deletedGuideView.trainingAreaDescription}</div>
                                </div>
                            )}

                            {/* Equipment */}
                            {deletedGuideView.equipment?.length > 0 && (
                                <div>
                                    <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 7 }}>Equipment</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        {deletedGuideView.equipment.map((e, i) => (
                                            <div key={i} style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', display: 'flex', gap: 8 }}>
                                                <span style={{ color: 'rgba(219,0,29,0.4)', flexShrink: 0 }}>·</span>
                                                {e.text}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Teaching Points */}
                            {deletedGuideView.teachingPoints?.length > 0 && (
                                <div>
                                    <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 10 }}>
                                        Teaching Points ({deletedGuideView.teachingPoints.length})
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                        {deletedGuideView.teachingPoints.map((tp, i) => (
                                            <div key={tp.id} style={{ borderLeft: '2px solid rgba(219,0,29,0.2)', paddingLeft: 12 }}>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.75)', marginBottom: 6 }}>
                                                    {i + 1}. {tp.title}
                                                </div>
                                                {tp.dotPoints?.length > 0 && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
                                                        {tp.dotPoints.map(dp => (
                                                            <div key={dp.id} style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)', paddingLeft: (dp.indent ?? 0) * 16, display: 'flex', gap: 6 }}>
                                                                <span style={{ color: 'rgba(237,237,237,0.25)', flexShrink: 0, fontSize: '0.6rem' }}>
                                                                    {(['●','○','■','□'] as const)[(dp.indent ?? 0) % 4]}
                                                                </span>
                                                                {dp.text}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {tp.vitalPoints?.length > 0 && (
                                                    <div style={{ marginBottom: 5 }}>
                                                        <div style={{ fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,180,50,0.5)', marginBottom: 4 }}>Vital Points</div>
                                                        {tp.vitalPoints.map(vp => (
                                                            <div key={vp.id} style={{ fontSize: '0.7rem', color: 'rgba(255,180,50,0.55)', display: 'flex', gap: 6 }}>
                                                                <span style={{ flexShrink: 0 }}>★</span>{vp.text}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {tp.commonFaults?.length > 0 && (
                                                    <div>
                                                        <div style={{ fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.45)', marginBottom: 4 }}>Common Faults</div>
                                                        {tp.commonFaults.map(cf => (
                                                            <div key={cf.id} style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)', marginBottom: 4 }}>
                                                                <span style={{ color: 'rgba(219,0,29,0.5)', fontWeight: 700 }}>Fault: </span>{cf.fault}
                                                                {cf.correction && <><br /><span style={{ color: 'rgba(80,200,120,0.5)', fontWeight: 700 }}>Correction: </span>{cf.correction}</>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Notes */}
                            {deletedGuideView.notes && (
                                <div>
                                    <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 7 }}>Notes</div>
                                    <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.45)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{deletedGuideView.notes}</div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button type='button' onClick={() => {
                                const gId = String(deletedGuideView._id)
                                setDeletedGuideView(null)
                                handleRestoreGuide(gId)
                            }} disabled={!!restoringGuideId}
                                style={{ padding: '7px 18px', background: 'transparent', border: '1px solid rgba(80,200,120,0.35)', color: 'rgba(80,200,120,0.7)', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: restoringGuideId ? 'default' : 'pointer', opacity: restoringGuideId ? 0.4 : 1 }}>
                                Restore
                            </button>
                            <button type='button' onClick={() => setDeletedGuideView(null)}
                                style={{ padding: '7px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', fontSize: '0.6rem', cursor: 'pointer' }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete guide confirmation modal */}
            {deleteGuideModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setDeleteGuideModal(null) }}>
                    <div style={{ background: '#0d0d0d', border: '1px solid rgba(219,0,29,0.25)', borderTop: '3px solid #db001d', padding: 28, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.85)' }}>Delete Training Guide</div>
                        <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.6)', fontFamily: 'Arial, sans-serif', lineHeight: 1.5 }}>
                            Delete <strong style={{ color: 'rgba(237,237,237,0.85)' }}>{deleteGuideModal.guideTitle}</strong>? It will be moved to the recycle bin and can be restored later. J3 leads will be notified.
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button type='button' onClick={handleConfirmDeleteGuide} disabled={deletingGuide}
                                style={{ flex: 1, padding: '9px', background: deletingGuide ? 'rgba(219,0,29,0.4)' : '#db001d', border: 'none', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: deletingGuide ? 'default' : 'pointer' }}>
                                {deletingGuide ? 'Deleting…' : 'Delete'}
                            </button>
                            <button type='button' onClick={() => setDeleteGuideModal(null)} disabled={deletingGuide}
                                style={{ flex: 1, padding: '9px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.5)', fontSize: '0.65rem', cursor: 'pointer' }}>
                                Cancel
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
