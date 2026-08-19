'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { CircularProgress } from '@mui/material'
import {
    ArrowBack, UploadFile, Description, FolderOpen,
    Download, Delete, Add, WorkOutline, History,
    Search, Close, Edit, ChevronLeft, ChevronRight,
    ViewList, AccountTree, ExpandMore, ExpandLess,
} from '@mui/icons-material'
import dynamic from 'next/dynamic'

const CollabEditor = dynamic(() => import('@/components/editor/CollabEditor'), { ssr: false })

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkspaceMember {
    id: string
    displayName: string
    currentRank: string | null
    position: string | null
    fileCount: number
    docCount: number
    opCount: number
    lastActivity: string | null
}

interface WorkspaceFile {
    _id: string
    originalName: string
    ext: string
    size: number
    uploadedByName: string
    uploadedAt: string
    description?: string
}

interface WorkspaceDoc {
    _id: string
    title: string
    createdByName: string
    createdAt: string
    lastModifiedByName: string
    lastModifiedAt: string
}

interface Operation {
    _id: string
    title: string
    status?: string
    date?: string | Date
    coverImage?: string
    campaignId?: string
    isSingleMission?: boolean
}

const STATUS_COLORS: Record<string, string> = {
    'Active':         'rgba(0,200,80,0.9)',
    'Upcoming':       'rgba(219,160,0,0.9)',
    'Completed':      'rgba(100,150,237,0.8)',
    'In Development': 'rgba(219,0,29,0.75)',
}
const STATUS_BORDER: Record<string, string> = {
    'Active':         'rgba(0,200,80,0.3)',
    'Upcoming':       'rgba(219,160,0,0.3)',
    'Completed':      'rgba(100,150,237,0.3)',
    'In Development': 'rgba(219,0,29,0.3)',
}
const STATUS_ORDER = ['Active', 'Upcoming', 'In Development', 'Completed'] as const
const OP_PAGE_SIZE = 15
const ALL_OP_STATUSES = ['All', 'In Development', 'Upcoming', 'Active', 'Completed'] as const
type OpStatusFilter = typeof ALL_OP_STATUSES[number]

interface ActivityLogEntry {
    _id: string
    action: string
    performedByName: string
    target?: string
    createdAt: string
    before?: unknown
    after?: unknown
    details?: Record<string, unknown>
}

interface DocVersion {
    _id: string
    docId: string
    docTitle: string
    contentSnapshot: string
    savedBy: string
    savedByName: string
    savedAt: string
    label: string | null
    restoreOf?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extBadgeColor(ext: string): string {
    if (['.pbo'].includes(ext)) return 'var(--live)' // teal for PBOs
    if (['.pdf'].includes(ext)) return 'var(--red)'
    if (['.zip', '.rar', '.7z'].includes(ext)) return 'var(--amber)'
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return '#8b5cf6'
    if (['.doc', '.docx', '.txt', '.md'].includes(ext)) return 'var(--info)'
    return 'rgba(237,237,237,0.3)'
}

// ── Sub-components ────────────────────────────────────────────────────────────

const labelSx: React.CSSProperties = {
    fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)',
}

function SectionHead({ title, action }: { title: string; action?: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={labelSx}>{title}</div>
            {action}
        </div>
    )
}

function EmptyRow({ text }: { text: string }) {
    return (
        <div style={{ padding: '18px 0', textAlign: 'center', fontSize: '0.75rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>
            {text}
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
    userId: string
    isJ4: boolean
    canManage: boolean
}

export default function MembersWorkspaceTab({ userId, isJ4, canManage }: Props) {
    const [view, setView] = useState<'list' | 'workspace'>('list')
    const [members, setMembers] = useState<WorkspaceMember[]>([])
    const [loadingMembers, setLoadingMembers] = useState(true)
    const [activeMember, setActiveMember] = useState<WorkspaceMember | null>(null)
    const [workspaceTab, setWorkspaceTab] = useState<'operations' | 'files' | 'docs' | 'activity'>('operations')

    // Workspace data
    const [files, setFiles] = useState<WorkspaceFile[]>([])
    const [docs, setDocs] = useState<WorkspaceDoc[]>([])
    const [ops, setOps] = useState<Operation[]>([])
    const [loadingWs, setLoadingWs] = useState(false)

    // Operations filters/pagination
    const [opsSearch, setOpsSearch] = useState('')
    const [opsStatusFilter, setOpsStatusFilter] = useState<OpStatusFilter>('All')
    const [opsPage, setOpsPage] = useState(0)
    const [opsViewMode, setOpsViewMode] = useState<'list' | 'tree'>('list')
    const [campaigns, setCampaigns] = useState<{ _id: string; name: string }[]>([])
    const [loadingCampaigns, setLoadingCampaigns] = useState(false)
    const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set(['standalone']))

    // Activity feed
    const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([])
    const [activityLoading, setActivityLoading] = useState(false)
    const [activityTotal, setActivityTotal] = useState(0)
    const [activityPage, setActivityPage] = useState(0)
    const [activityFilter, setActivityFilter] = useState<string>('')
    const [activityFrom, setActivityFrom] = useState<string>('')
    const [activityTo, setActivityTo] = useState<string>('')

    // Doc editor
    const [openDocId, setOpenDocId] = useState<string | null>(null)
    const [editingDocTitle, setEditingDocTitle] = useState<string>('')
    const [savingTitle, setSavingTitle] = useState(false)
    const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Version history panel
    const [showVersions, setShowVersions] = useState(false)
    const [versions, setVersions] = useState<DocVersion[]>([])
    const [versionsLoading, setVersionsLoading] = useState(false)
    const [savingVersion, setSavingVersion] = useState(false)
    const [versionLabelPrompt, setVersionLabelPrompt] = useState(false)
    const [versionLabel, setVersionLabel] = useState('')
    // Compare view
    const [compareVersions, setCompareVersions] = useState<[DocVersion, DocVersion] | null>(null)
    const [compareSelectA, setCompareSelectA] = useState<DocVersion | null>(null)
    // Restore modal
    const [restoreTarget, setRestoreTarget] = useState<DocVersion | null>(null)
    const [restoring, setRestoring] = useState(false)


    // File upload
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Delete confirm
    const [deleteFileId, setDeleteFileId] = useState<string | null>(null)
    const [deleteDocId, setDeleteDocId] = useState<string | null>(null)

    const fetchMembers = useCallback(async () => {
        setLoadingMembers(true)
        try {
            const res = await fetch('/api/j2/workspace/members')
            const data = await res.json()
            setMembers(data.members ?? [])
        } catch { /* silently fail */ } finally {
            setLoadingMembers(false)
        }
    }, [])

    useEffect(() => { fetchMembers() }, [fetchMembers])

    const fetchWorkspace = useCallback(async (memberId: string) => {
        setLoadingWs(true)
        try {
            const [fRes, dRes, oRes] = await Promise.all([
                fetch(`/api/j2/workspace/files?memberId=${memberId}`),
                fetch(`/api/j2/workspace/docs?memberId=${memberId}`),
                fetch(`/api/operations?authorId=${memberId}`),
            ])
            const [fData, dData, oData] = await Promise.all([fRes.json(), dRes.json(), oRes.json()])
            setFiles(fData.files ?? [])
            setDocs(dData.docs ?? [])
            setOps((oData.operations ?? oData.ops ?? []).filter((o: Operation) => !!(o._id)))
        } catch { /* silently fail */ } finally {
            setLoadingWs(false)
        }
    }, [])

    const opsFiltered = useMemo(() => {
        const q = opsSearch.trim().toLowerCase()
        return ops
            .filter(op => !q || op.title.toLowerCase().includes(q))
            .filter(op => opsStatusFilter === 'All' || op.status === opsStatusFilter)
    }, [ops, opsSearch, opsStatusFilter])

    const opsTotalPages = Math.ceil(opsFiltered.length / OP_PAGE_SIZE)

    useEffect(() => {
        if (opsViewMode !== 'tree') return
        setLoadingCampaigns(true)
        fetch('/api/operations/campaigns')
            .then(r => r.json())
            .then(d => setCampaigns(d.campaigns ?? []))
            .catch(() => setCampaigns([]))
            .finally(() => setLoadingCampaigns(false))
    }, [opsViewMode])

    const opsByCampaign = useMemo(() => {
        if (opsViewMode !== 'tree') return null
        const byCampaign: Record<string, Operation[]> = { standalone: [] }
        for (const c of campaigns) byCampaign[c._id] = []
        for (const op of opsFiltered) {
            const key = op.campaignId && byCampaign[op.campaignId] !== undefined ? op.campaignId : 'standalone'
            byCampaign[key].push(op)
        }
        return byCampaign
    }, [opsViewMode, opsFiltered, campaigns])

    const WORKSPACE_ACTION_LABELS: Record<string, string> = {
        'workspace.file.upload':     'File Uploaded',
        'workspace.file.delete':     'File Deleted',
        'workspace.doc.create':      'Document Created',
        'workspace.doc.edit':        'Document Renamed',
        'workspace.doc.delete':      'Document Deleted',
        'workspace.version.save':    'Version Saved',
        'workspace.version.restore': 'Version Restored',
    }

    const fetchActivity = useCallback(async (memberId: string, filter: string, from: string, to: string, page: number) => {
        setActivityLoading(true)
        try {
            const params = new URLSearchParams({ memberId, page: String(page), limit: '30' })
            if (filter) params.set('actionType', filter)
            if (from) params.set('from', from)
            if (to) params.set('to', to)
            const res = await fetch(`/api/j2/workspace/activity?${params}`)
            const data = await res.json()
            setActivityLogs(data.logs ?? [])
            setActivityTotal(data.total ?? 0)
        } finally { setActivityLoading(false) }
    }, [])

    function openMember(m: WorkspaceMember) {
        setActiveMember(m)
        setView('workspace')
        setWorkspaceTab('operations')
        setOpenDocId(null)
        setActivityPage(0)
        setActivityFilter('')
        setActivityFrom('')
        setActivityTo('')
        fetchWorkspace(m.id)
    }

    function closeMember() {
        setView('list')
        setActiveMember(null)
        setOpenDocId(null)
    }

    async function handleUpload(file: File) {
        if (!activeMember) return
        setUploading(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            fd.append('memberId', activeMember.id)
            fd.append('memberName', activeMember.displayName)
            await fetch('/api/j2/workspace/files', { method: 'POST', body: fd })
            fetchWorkspace(activeMember.id)
        } finally { setUploading(false) }
    }

    async function handleDeleteFile(id: string) {
        await fetch(`/api/j2/workspace/files?id=${id}`, { method: 'DELETE' })
        setDeleteFileId(null)
        if (activeMember) fetchWorkspace(activeMember.id)
    }

    async function handleCreateDoc() {
        if (!activeMember) return
        const res = await fetch('/api/j2/workspace/docs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId: activeMember.id, memberName: activeMember.displayName }),
        })
        const data = await res.json()
        if (data.ok) {
            fetchWorkspace(activeMember.id)
            setOpenDocId(data.id)
            setEditingDocTitle('Untitled Document')
        }
    }

    async function handleDeleteDoc(id: string) {
        await fetch(`/api/j2/workspace/docs/${id}`, { method: 'DELETE' })
        setDeleteDocId(null)
        if (openDocId === id) setOpenDocId(null)
        if (activeMember) fetchWorkspace(activeMember.id)
    }

    function openDoc(doc: WorkspaceDoc) {
        setOpenDocId(doc._id)
        setEditingDocTitle(doc.title)
        setShowVersions(false)
        setVersions([])
        setCompareVersions(null)
        setCompareSelectA(null)
    }

    async function loadVersions(docId: string) {
        setVersionsLoading(true)
        try {
            const res = await fetch(`/api/j2/workspace/docs/${docId}/versions`)
            const data = await res.json()
            setVersions(data.versions ?? [])
        } finally { setVersionsLoading(false) }
    }

    async function handleSaveVersion() {
        if (!openDocId) return
        setSavingVersion(true)
        try {
            await fetch(`/api/j2/workspace/docs/${openDocId}/versions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: versionLabel.trim() || null }),
            })
            setVersionLabelPrompt(false)
            setVersionLabel('')
            if (showVersions) loadVersions(openDocId)
        } finally { setSavingVersion(false) }
    }

    async function handleRestore(version: DocVersion, mode: 'overwrite' | 'copy') {
        if (!openDocId) return
        setRestoring(true)
        try {
            const res = await fetch(`/api/j2/workspace/docs/${openDocId}/versions/${version._id}/restore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode }),
            })
            const data = await res.json()
            setRestoreTarget(null)
            if (mode === 'copy' && data.newDocId) {
                // Open the new copy
                if (activeMember) fetchWorkspace(activeMember.id)
                setOpenDocId(data.newDocId)
                setEditingDocTitle(`${editingDocTitle} (restored copy)`)
                setVersions([])
            } else {
                // Overwrite — reload the editor by briefly toggling docId
                const cur = openDocId
                setOpenDocId(null)
                setTimeout(() => setOpenDocId(cur), 50)
            }
            if (showVersions) loadVersions(openDocId)
        } finally { setRestoring(false) }
    }

    function handleTitleChange(val: string) {
        setEditingDocTitle(val)
        if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current)
        if (!openDocId) return
        titleSaveTimer.current = setTimeout(async () => {
            setSavingTitle(true)
            await fetch(`/api/j2/workspace/docs/${openDocId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: val }),
            }).catch(() => {})
            setSavingTitle(false)
            if (activeMember) fetchWorkspace(activeMember.id)
        }, 1200)
    }

    const canEdit = (ownerId: string) => ownerId === userId || canManage || isJ4

    // ── Render: Member list ───────────────────────────────────────────────────

    if (view === 'list') {
        return (
            <div style={{ padding: '20px 24px' }}>
                <div style={{ marginBottom: 16 }}>
                    <div style={labelSx}>J2 Members Workspace</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', marginTop: 4 }}>
                        Select a member to view their workspace.
                    </div>
                </div>

                {loadingMembers ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                        <CircularProgress size={24} sx={{ color: 'var(--red)' }} />
                    </div>
                ) : members.length === 0 ? (
                    <EmptyRow text='No J2 members found.' />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {members.map(m => (
                            <button
                                key={m.id}
                                type='button'
                                onClick={() => openMember(m)}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr auto',
                                    gap: 12,
                                    alignItems: 'center',
                                    padding: '12px 16px',
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    borderLeft: '2px solid rgba(219,0,29,0.3)',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'background 0.12s, border-color 0.12s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                            >
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)', marginBottom: 2 }}>
                                        {m.displayName}
                                    </div>
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                        {m.currentRank && <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)' }}>{m.currentRank}</span>}
                                        {m.position && (
                                            <span style={{ fontSize: '0.65rem', color: 'rgba(219,0,29,0.75)', fontWeight: 700 }}>{m.position}</span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(237,237,237,0.7)' }}>{m.opCount}</div>
                                        <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.1em' }}>OPS</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(237,237,237,0.7)' }}>{m.fileCount}</div>
                                        <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.1em' }}>FILES</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(237,237,237,0.7)' }}>{m.docCount}</div>
                                        <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.1em' }}>DOCS</div>
                                    </div>
                                    {m.lastActivity && (
                                        <div style={{ textAlign: 'right', minWidth: 80 }}>
                                            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)' }}>{formatDate(m.lastActivity)}</div>
                                            <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.2)' }}>last active</div>
                                        </div>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    // ── Render: Member workspace ──────────────────────────────────────────────

    if (!activeMember) return null

    const wsTabSx = (active: boolean): React.CSSProperties => ({
        padding: '7px 16px',
        fontSize: '0.68rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--red)' : '2px solid transparent',
        color: active ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.4)',
        transition: 'color 0.12s',
    })

    // ── Compare view ─────────────────────────────────────────────────────────
    if (compareVersions) {
        const [vA, vB] = compareVersions
        const linesA = vA.contentSnapshot.split('\n')
        const linesB = vB.contentSnapshot.split('\n')
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line-2)', background: 'rgba(0,0,0,0.15)', flexShrink: 0 }}>
                    <button type='button' onClick={() => setCompareVersions(null)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.4)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em' }}
                    >
                        <ArrowBack sx={{ fontSize: 14 }} /> Back
                    </button>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(237,237,237,0.5)', letterSpacing: '0.06em' }}>VERSION COMPARE</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, minHeight: 0, gap: 0 }}>
                    {([{ v: vA, side: 'A' }, { v: vB, side: 'B' }] as { v: DocVersion; side: string }[]).map(({ v, side }) => (
                        <div key={side} style={{ display: 'flex', flexDirection: 'column', borderRight: side === 'A' ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                            <div style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                                <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: side === 'A' ? 'var(--info)' : '#8b5cf6' }}>
                                    {side === 'A' ? 'Version A' : 'Version B'}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.6)', marginTop: 2 }}>
                                    {v.label ?? formatDate(v.savedAt)} — by {v.savedByName}
                                </div>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.75rem', lineHeight: 1.7 }}>
                                {(side === 'A' ? linesA : linesB).map((line, i) => {
                                    const other = (side === 'A' ? linesB : linesA)[i]
                                    const changed = other !== undefined && line !== other
                                    const added = other === undefined
                                    return (
                                        <div key={i} style={{
                                            padding: '1px 4px',
                                            background: added ? 'rgba(16,185,129,0.12)' : changed ? 'rgba(245,158,11,0.1)' : 'transparent',
                                            color: added ? 'var(--live)' : changed ? 'var(--amber)' : 'rgba(237,237,237,0.65)',
                                            whiteSpace: 'pre-wrap',
                                        }}>
                                            {line || <span style={{ opacity: 0.2 }}>—</span>}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    // ── Doc editor ───────────────────────────────────────────────────────────
    if (openDocId) {
        const btnStyle = (color: string): React.CSSProperties => ({
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.07em',
            background: `${color}18`, border: `1px solid ${color}44`, color,
            cursor: 'pointer', flexShrink: 0,
        })

        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--line-2)', background: 'rgba(0,0,0,0.15)', flexShrink: 0, flexWrap: 'wrap' }}>
                    <button type='button' onClick={() => setOpenDocId(null)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.4)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', flexShrink: 0 }}
                    >
                        <ArrowBack sx={{ fontSize: 14 }} /> Back
                    </button>
                    <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
                    <input
                        value={editingDocTitle}
                        onChange={e => handleTitleChange(e.target.value)}
                        style={{ background: 'none', border: 'none', outline: 'none', fontSize: '0.85rem', fontWeight: 700, color: 'rgba(237,237,237,0.85)', flex: 1, minWidth: 120, letterSpacing: '0.02em' }}
                        placeholder='Document title…'
                    />
                    {savingTitle && <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.25)' }}>saving…</span>}

                    {/* Version controls */}
                    <button type='button' style={btnStyle('rgba(139,92,246,0.8)')} onClick={() => setVersionLabelPrompt(true)}>
                        Save Version
                    </button>
                    <button type='button' style={btnStyle('rgba(237,237,237,0.45)')}
                        onClick={() => { setShowVersions(v => !v); if (!showVersions) loadVersions(openDocId) }}
                    >
                        History {showVersions ? '▲' : '▼'}
                    </button>
                </div>

                <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                    {/* Editor */}
                    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                        <CollabEditor documentId={`ws-${openDocId}`} themeColor='#8b5cf6' />
                    </div>

                    {/* Version history sidebar */}
                    {showVersions && (
                        <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.15)' }}>
                            <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(139,92,246,0.7)' }}>
                                Version History
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {versionsLoading ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                                        <CircularProgress size={16} sx={{ color: '#8b5cf6' }} />
                                    </div>
                                ) : versions.length === 0 ? (
                                    <div style={{ padding: '16px 14px', fontSize: '0.72rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>
                                        No saved versions yet.
                                    </div>
                                ) : (
                                    versions.map((v, idx) => (
                                        <div key={v._id} style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(237,237,237,0.75)', marginBottom: 2 }}>
                                                {v.label ?? `v${versions.length - idx}`}
                                            </div>
                                            <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', marginBottom: 6 }}>
                                                {formatDate(v.savedAt)} · {v.savedByName}
                                            </div>
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                <button type='button' onClick={() => setRestoreTarget(v)}
                                                    style={{ padding: '2px 7px', fontSize: '0.6rem', fontWeight: 700, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: 'rgba(139,92,246,0.8)', cursor: 'pointer' }}
                                                >Restore</button>
                                                <button type='button' onClick={() => {
                                                    if (!compareSelectA) { setCompareSelectA(v) }
                                                    else if (compareSelectA._id !== v._id) { setCompareVersions([compareSelectA, v]); setCompareSelectA(null) }
                                                    else { setCompareSelectA(null) }
                                                }}
                                                    style={{ padding: '2px 7px', fontSize: '0.6rem', fontWeight: 700, background: compareSelectA?._id === v._id ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.06)', border: `1px solid ${compareSelectA?._id === v._id ? 'rgba(59,130,246,0.6)' : 'rgba(59,130,246,0.2)'}`, color: 'rgba(59,130,246,0.8)', cursor: 'pointer' }}
                                                >
                                                    {compareSelectA?._id === v._id ? 'Selected (A)' : compareSelectA ? 'Compare ▶' : 'Compare'}
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            {compareSelectA && (
                                <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(59,130,246,0.2)', fontSize: '0.62rem', color: 'rgba(59,130,246,0.7)' }}>
                                    Select second version to compare with &quot;{compareSelectA.label ?? 'version'}&quot;
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Save version label prompt */}
                {versionLabelPrompt && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: '#0f0f10', border: '1px solid rgba(139,92,246,0.4)', borderTop: '2px solid #8b5cf6', padding: '24px 28px', maxWidth: 380, width: '90%', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Save Version</div>
                            <input
                                autoFocus
                                value={versionLabel}
                                onChange={e => setVersionLabel(e.target.value)}
                                placeholder='Version label (optional)…'
                                style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.3)', color: 'rgba(237,237,237,0.85)', fontSize: '0.82rem', outline: 'none' }}
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveVersion() }}
                            />
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button onClick={() => { setVersionLabelPrompt(false); setVersionLabel('') }}
                                    style={{ padding: '7px 16px', fontSize: '0.72rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}>CANCEL</button>
                                <button onClick={handleSaveVersion} disabled={savingVersion}
                                    style={{ padding: '7px 16px', fontSize: '0.72rem', fontWeight: 700, background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.5)', color: '#8b5cf6', cursor: 'pointer', opacity: savingVersion ? 0.6 : 1 }}>
                                    {savingVersion ? 'SAVING…' : 'SAVE VERSION'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Restore modal */}
                {restoreTarget && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: '#0f0f10', border: '1px solid rgba(139,92,246,0.4)', borderTop: '2px solid #8b5cf6', padding: '24px 28px', maxWidth: 440, width: '90%', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(139,92,246,0.55)', fontFamily: 'monospace' }}>{'// RESTORE VERSION'}</div>
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Restore: {restoreTarget.label ?? formatDate(restoreTarget.savedAt)}</div>
                            <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.65 }}>
                                How would you like to restore this version?
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <button onClick={() => handleRestore(restoreTarget, 'overwrite')} disabled={restoring}
                                    style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 700, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.4)', color: '#8b5cf6', cursor: 'pointer' }}>
                                    Restore Over Current
                                    <div style={{ fontSize: '0.65rem', fontWeight: 400, color: 'rgba(139,92,246,0.6)', marginTop: 3 }}>Replaces this document with the selected version. Version history is preserved.</div>
                                </button>
                                <button onClick={() => handleRestore(restoreTarget, 'copy')} disabled={restoring}
                                    style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 700, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--live)', cursor: 'pointer' }}>
                                    Restore As Copy
                                    <div style={{ fontSize: '0.65rem', fontWeight: 400, color: 'rgba(16,185,129,0.6)', marginTop: 3 }}>Creates a new document from this version. Current document is not changed.</div>
                                </button>
                            </div>
                            <button onClick={() => setRestoreTarget(null)}
                                style={{ alignSelf: 'flex-end', padding: '6px 14px', fontSize: '0.7rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.35)', cursor: 'pointer' }}>
                                CANCEL
                            </button>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Workspace header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                <button type='button' onClick={closeMember}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.4)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em' }}
                >
                    <ArrowBack sx={{ fontSize: 14 }} /> All Members
                </button>
                <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.1)' }} />
                <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)' }}>{activeMember.displayName}</div>
                    {activeMember.position && (
                        <div style={{ fontSize: '0.62rem', color: 'rgba(219,0,29,0.7)', fontWeight: 700 }}>{activeMember.position}</div>
                    )}
                </div>
            </div>

            {/* Sub-tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingLeft: 12, flexShrink: 0 }}>
                <button style={wsTabSx(workspaceTab === 'operations')} onClick={() => setWorkspaceTab('operations')}>
                    <WorkOutline sx={{ fontSize: 13, mr: 0.5 }} />Operations
                </button>
                <button style={wsTabSx(workspaceTab === 'files')} onClick={() => setWorkspaceTab('files')}>
                    <FolderOpen sx={{ fontSize: 13, mr: 0.5 }} />Files & PBOs
                </button>
                <button style={wsTabSx(workspaceTab === 'docs')} onClick={() => setWorkspaceTab('docs')}>
                    <Description sx={{ fontSize: 13, mr: 0.5 }} />Documents
                </button>
                <button style={wsTabSx(workspaceTab === 'activity')} onClick={() => {
                    setWorkspaceTab('activity')
                    if (activeMember) fetchActivity(activeMember.id, activityFilter, activityFrom, activityTo, 0)
                }}>
                    <History sx={{ fontSize: 13, mr: 0.5 }} />Activity
                </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
                {loadingWs ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                        <CircularProgress size={20} sx={{ color: 'var(--red)' }} />
                    </div>
                ) : (

                    /* ── Operations ─────────────────────────────────────── */
                    workspaceTab === 'operations' ? (
                        <div>
                            <SectionHead title={`Operations (${ops.length})`} action={
                                <div style={{ display: 'flex', gap: 2 }}>
                                    {(['list', 'tree'] as const).map(mode => (
                                        <button
                                            key={mode}
                                            onClick={() => setOpsViewMode(mode)}
                                            title={mode === 'list' ? 'List view' : 'Campaign tree view'}
                                            style={{
                                                display: 'flex', alignItems: 'center', padding: '4px 8px',
                                                background: opsViewMode === mode ? 'rgba(219,0,29,0.15)' : 'rgba(255,255,255,0.03)',
                                                border: opsViewMode === mode ? '1px solid rgba(219,0,29,0.4)' : '1px solid rgba(255,255,255,0.08)',
                                                color: opsViewMode === mode ? 'var(--red)' : 'rgba(237,237,237,0.3)',
                                                cursor: 'pointer', transition: 'all 0.12s',
                                            }}
                                        >
                                            {mode === 'list' ? <ViewList style={{ fontSize: 15 }} /> : <AccountTree style={{ fontSize: 15 }} />}
                                        </button>
                                    ))}
                                </div>
                            } />

                            {/* Search + status filter */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 160, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', padding: '5px 10px' }}>
                                    <Search style={{ fontSize: 14, color: 'rgba(237,237,237,0.25)', flexShrink: 0 }} />
                                    <input
                                        value={opsSearch}
                                        onChange={e => { setOpsSearch(e.target.value); setOpsPage(0) }}
                                        placeholder='Search missions…'
                                        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'rgba(237,237,237,0.8)', fontSize: '0.78rem' }}
                                    />
                                    {opsSearch && (
                                        <button onClick={() => setOpsSearch('')} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.25)', display: 'flex' }}>
                                            <Close style={{ fontSize: 14 }} />
                                        </button>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {ALL_OP_STATUSES.map(s => {
                                        const active = opsStatusFilter === s
                                        const color = s === 'All' ? 'rgba(237,237,237,0.6)' : (STATUS_COLORS[s] ?? 'rgba(237,237,237,0.6)')
                                        return (
                                            <button key={s} onClick={() => { setOpsStatusFilter(s); setOpsPage(0) }} style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '3px 10px', cursor: 'pointer', background: active ? 'rgba(255,255,255,0.06)' : 'transparent', border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`, color: active ? color : 'rgba(237,237,237,0.3)', transition: 'all 0.15s' }}>{s}</button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Tree view */}
                            {opsViewMode === 'tree' && (
                                loadingCampaigns ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                                        <CircularProgress size={18} sx={{ color: 'var(--red)' }} />
                                    </div>
                                ) : opsByCampaign && (
                                    <div>
                                        {opsFiltered.length === 0 && (
                                            <EmptyRow text={ops.length === 0 ? 'No operations found for this member.' : 'No operations match your filters.'} />
                                        )}
                                        {/* Campaign groups */}
                                        {campaigns.map(c => {
                                            const cid = c._id
                                            const missions = opsByCampaign[cid] ?? []
                                            if (missions.length === 0) return null
                                            const expanded = expandedCampaigns.has(cid)
                                            return (
                                                <div key={cid} style={{ border: '1px solid rgba(100,150,237,0.18)', borderTop: '2px solid rgba(100,150,237,0.5)', background: 'rgba(100,150,237,0.04)', marginBottom: 10 }}>
                                                    <button
                                                        onClick={() => setExpandedCampaigns(prev => {
                                                            const next = new Set(prev)
                                                            expanded ? next.delete(cid) : next.add(cid)
                                                            return next
                                                        })}
                                                        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', borderBottom: expanded ? '1px solid rgba(100,150,237,0.1)' : 'none' }}
                                                    >
                                                        {expanded ? <ExpandLess style={{ fontSize: 16, color: 'rgba(237,237,237,0.35)' }} /> : <ExpandMore style={{ fontSize: 16, color: 'rgba(237,237,237,0.35)' }} />}
                                                        <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(100,150,237,0.9)' }}>{c.name}</span>
                                                        <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.06em' }}>{missions.length} mission{missions.length !== 1 ? 's' : ''}</span>
                                                    </button>
                                                    {expanded && (
                                                        <div style={{ padding: '6px 8px 2px' }}>
                                                            {missions.map(op => (
                                                                <div key={op._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.015)', marginBottom: 3 }}>
                                                                    {op.coverImage ? (
                                                                        <div style={{ width: 52, height: 34, flexShrink: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
                                                                            <img src={op.coverImage} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                                                        </div>
                                                                    ) : (
                                                                        <div style={{ width: 52, height: 34, flexShrink: 0, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }} />
                                                                    )}
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.title}</div>
                                                                        {op.date && <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>{new Date(op.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
                                                                    </div>
                                                                    {op.status && (
                                                                        <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: STATUS_COLORS[op.status] ?? 'rgba(237,237,237,0.35)', border: `1px solid ${STATUS_BORDER[op.status] ?? 'rgba(237,237,237,0.2)'}`, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0, background: 'rgba(0,0,0,0.45)' }}>
                                                                            {op.status}
                                                                        </span>
                                                                    )}
                                                                    <a href={`/operations/${op._id}/edit?from=j2`} style={{ display: 'flex', alignItems: 'center', padding: '4px', color: 'rgba(237,237,237,0.25)', textDecoration: 'none', flexShrink: 0 }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.7)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.25)')}>
                                                                        <Edit style={{ fontSize: 15 }} />
                                                                    </a>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                        {/* Standalone missions */}
                                        {(opsByCampaign['standalone'] ?? []).length > 0 && (() => {
                                            const standaloneOps = opsByCampaign['standalone']
                                            const expanded = expandedCampaigns.has('standalone')
                                            return (
                                                <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderTop: '2px solid rgba(237,237,237,0.15)', background: 'rgba(255,255,255,0.01)', marginBottom: 10 }}>
                                                    <button
                                                        onClick={() => setExpandedCampaigns(prev => {
                                                            const next = new Set(prev)
                                                            expanded ? next.delete('standalone') : next.add('standalone')
                                                            return next
                                                        })}
                                                        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', borderBottom: expanded ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                                                    >
                                                        {expanded ? <ExpandLess style={{ fontSize: 16, color: 'rgba(237,237,237,0.35)' }} /> : <ExpandMore style={{ fontSize: 16, color: 'rgba(237,237,237,0.35)' }} />}
                                                        <span style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' }}>Standalone Missions</span>
                                                        <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.06em' }}>{standaloneOps.length} mission{standaloneOps.length !== 1 ? 's' : ''}</span>
                                                    </button>
                                                    {expanded && (
                                                        <div style={{ padding: '6px 8px 2px' }}>
                                                            {standaloneOps.map(op => (
                                                                <div key={op._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.015)', marginBottom: 3 }}>
                                                                    {op.coverImage ? (
                                                                        <div style={{ width: 52, height: 34, flexShrink: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
                                                                            <img src={op.coverImage} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                                                        </div>
                                                                    ) : (
                                                                        <div style={{ width: 52, height: 34, flexShrink: 0, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }} />
                                                                    )}
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.title}</div>
                                                                        {op.date && <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>{new Date(op.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
                                                                    </div>
                                                                    {op.status && (
                                                                        <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: STATUS_COLORS[op.status] ?? 'rgba(237,237,237,0.35)', border: `1px solid ${STATUS_BORDER[op.status] ?? 'rgba(237,237,237,0.2)'}`, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0, background: 'rgba(0,0,0,0.45)' }}>
                                                                            {op.status}
                                                                        </span>
                                                                    )}
                                                                    <a href={`/operations/${op._id}/edit?from=j2`} style={{ display: 'flex', alignItems: 'center', padding: '4px', color: 'rgba(237,237,237,0.25)', textDecoration: 'none', flexShrink: 0 }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.7)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.25)')}>
                                                                        <Edit style={{ fontSize: 15 }} />
                                                                    </a>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })()}
                                    </div>
                                )
                            )}

                            {/* Status-grouped op cards (list view) */}
                            {opsViewMode === 'list' && opsFiltered.length === 0 ? (
                                <EmptyRow text={ops.length === 0 ? 'No operations found for this member.' : 'No operations match your filters.'} />
                            ) : opsViewMode === 'list' && (
                                <>
                                    {STATUS_ORDER.map(status => {
                                        const group = opsFiltered.filter(op => op.status === status)
                                        if (group.length === 0) return null
                                        const statusColor = STATUS_COLORS[status]
                                        const statusBorder = STATUS_BORDER[status]
                                        return (
                                            <div key={status} style={{ marginBottom: 8, border: `1px solid ${statusBorder}`, borderTop: `2px solid ${statusColor}66`, background: 'rgba(255,255,255,0.01)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderBottom: `1px solid ${statusBorder}40` }}>
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: statusColor }}>{status}</span>
                                                    <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.3)', marginLeft: 2 }}>{group.length}</span>
                                                </div>
                                                {group.map(op => (
                                                    <div key={op._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                                                        {op.coverImage ? (
                                                            <div style={{ width: 52, height: 34, flexShrink: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
                                                                <img src={op.coverImage} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                                            </div>
                                                        ) : (
                                                            <div style={{ width: 52, height: 34, flexShrink: 0, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }} />
                                                        )}
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(237,237,237,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.title}</div>
                                                            {op.date && (
                                                                <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>
                                                                    {new Date(op.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: statusColor, border: `1px solid ${statusBorder}`, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0, background: 'rgba(0,0,0,0.45)' }}>
                                                            {status}
                                                        </span>
                                                        <a href={`/operations/${op._id}/edit?from=j2`} title='Edit mission' style={{ display: 'flex', alignItems: 'center', padding: '4px', color: 'rgba(237,237,237,0.25)', textDecoration: 'none', flexShrink: 0 }}
                                                            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.7)')}
                                                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.25)')}
                                                        >
                                                            <Edit style={{ fontSize: 15 }} />
                                                        </a>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    })}

                                    {/* Ops without a known status */}
                                    {(() => {
                                        const other = opsFiltered.filter(op => !op.status || !STATUS_ORDER.includes(op.status as typeof STATUS_ORDER[number]))
                                        if (other.length === 0) return null
                                        return other.map(op => (
                                            <div key={op._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 2, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <div style={{ width: 52, height: 34, flexShrink: 0, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.title}</div>
                                                </div>
                                                <a href={`/operations/${op._id}/edit?from=j2`} title='Edit mission' style={{ display: 'flex', alignItems: 'center', padding: '4px', color: 'rgba(237,237,237,0.25)', textDecoration: 'none', flexShrink: 0 }}>
                                                    <Edit style={{ fontSize: 15 }} />
                                                </a>
                                            </div>
                                        ))
                                    })()}

                                    {/* Pagination */}
                                    {opsTotalPages > 1 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, justifyContent: 'flex-end' }}>
                                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.06em' }}>
                                                {opsPage * OP_PAGE_SIZE + 1}–{Math.min((opsPage + 1) * OP_PAGE_SIZE, opsFiltered.length)} of {opsFiltered.length}
                                            </span>
                                            <button onClick={() => setOpsPage(p => p - 1)} disabled={opsPage === 0} style={{ all: 'unset', cursor: opsPage === 0 ? 'not-allowed' : 'pointer', color: opsPage === 0 ? 'rgba(237,237,237,0.15)' : 'rgba(237,237,237,0.5)', display: 'flex' }}>
                                                <ChevronLeft style={{ fontSize: 20 }} />
                                            </button>
                                            <button onClick={() => setOpsPage(p => p + 1)} disabled={opsPage >= opsTotalPages - 1} style={{ all: 'unset', cursor: opsPage >= opsTotalPages - 1 ? 'not-allowed' : 'pointer', color: opsPage >= opsTotalPages - 1 ? 'rgba(237,237,237,0.15)' : 'rgba(237,237,237,0.5)', display: 'flex' }}>
                                                <ChevronRight style={{ fontSize: 20 }} />
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                    /* ── Files ──────────────────────────────────────────── */
                    ) : workspaceTab === 'files' ? (
                        <div>
                            <SectionHead title='Files & PBOs' action={
                                <button
                                    type='button'
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.3)', color: 'rgba(237,237,237,0.7)', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}
                                >
                                    <UploadFile sx={{ fontSize: 13 }} />
                                    {uploading ? 'Uploading…' : 'Upload File'}
                                </button>
                            } />
                            <input ref={fileInputRef} type='file' style={{ display: 'none' }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }}
                            />

                            {files.length === 0 ? (
                                <EmptyRow text='No files uploaded yet.' />
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                            {['File', 'Type', 'Size', 'Uploaded by', 'Date', ''].map(h => (
                                                <th key={h} style={{ textAlign: 'left', padding: '5px 10px', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.3)', textTransform: 'uppercase' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {files.map(f => (
                                            <tr key={f._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                <td style={{ padding: '8px 10px', color: 'rgba(237,237,237,0.8)', fontWeight: 600 }}>{f.originalName}</td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', background: `${extBadgeColor(f.ext)}22`, border: `1px solid ${extBadgeColor(f.ext)}66`, color: extBadgeColor(f.ext) }}>
                                                        {f.ext.replace('.', '').toUpperCase() || 'FILE'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 10px', color: 'rgba(237,237,237,0.4)' }}>{formatSize(f.size)}</td>
                                                <td style={{ padding: '8px 10px', color: 'rgba(237,237,237,0.4)' }}>{f.uploadedByName}</td>
                                                <td style={{ padding: '8px 10px', color: 'rgba(237,237,237,0.4)' }}>{formatDate(f.uploadedAt)}</td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <a href={`/api/j2/workspace/files/${f._id}/download`}
                                                            style={{ display: 'flex', alignItems: 'center', padding: '3px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.5)', textDecoration: 'none', fontSize: '0.65rem' }}
                                                        >
                                                            <Download sx={{ fontSize: 12 }} />
                                                        </a>
                                                        {canEdit(activeMember.id) && (
                                                            <button type='button' onClick={() => setDeleteFileId(f._id)}
                                                                style={{ display: 'flex', alignItems: 'center', padding: '3px 8px', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.6)', cursor: 'pointer', fontSize: '0.65rem' }}
                                                            >
                                                                <Delete sx={{ fontSize: 12 }} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                    /* ── Activity ───────────────────────────────────────── */
                    ) : workspaceTab === 'activity' ? (
                        <div>
                            {/* Filter bar */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <select
                                    value={activityFilter}
                                    onChange={e => {
                                        setActivityFilter(e.target.value)
                                        setActivityPage(0)
                                        if (activeMember) fetchActivity(activeMember.id, e.target.value, activityFrom, activityTo, 0)
                                    }}
                                    style={{ padding: '5px 10px', fontSize: '0.7rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.6)', cursor: 'pointer' }}
                                >
                                    <option value=''>All Actions</option>
                                    {Object.entries(WORKSPACE_ACTION_LABELS).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                                <input type='date' value={activityFrom}
                                    onChange={e => {
                                        setActivityFrom(e.target.value)
                                        setActivityPage(0)
                                        if (activeMember) fetchActivity(activeMember.id, activityFilter, e.target.value, activityTo, 0)
                                    }}
                                    style={{ padding: '5px 8px', fontSize: '0.7rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.55)' }}
                                />
                                <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)' }}>→</span>
                                <input type='date' value={activityTo}
                                    onChange={e => {
                                        setActivityTo(e.target.value)
                                        setActivityPage(0)
                                        if (activeMember) fetchActivity(activeMember.id, activityFilter, activityFrom, e.target.value, 0)
                                    }}
                                    style={{ padding: '5px 8px', fontSize: '0.7rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.55)' }}
                                />
                                {(activityFilter || activityFrom || activityTo) && (
                                    <button type='button' onClick={() => {
                                        setActivityFilter(''); setActivityFrom(''); setActivityTo(''); setActivityPage(0)
                                        if (activeMember) fetchActivity(activeMember.id, '', '', '', 0)
                                    }}
                                        style={{ padding: '4px 10px', fontSize: '0.65rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.35)', cursor: 'pointer' }}
                                    >Clear</button>
                                )}
                                <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)' }}>{activityTotal} entries</span>
                            </div>

                            {activityLoading ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                                    <CircularProgress size={18} sx={{ color: 'var(--red)' }} />
                                </div>
                            ) : activityLogs.length === 0 ? (
                                <EmptyRow text='No workspace activity yet.' />
                            ) : (
                                <>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        {activityLogs.map(log => {
                                            const label = WORKSPACE_ACTION_LABELS[log.action] ?? log.action
                                            const isFile = log.action.includes('.file.')
                                            const isDoc  = log.action.includes('.doc.')
                                            const isVer  = log.action.includes('.version.')
                                            const color  = isVer ? '#8b5cf6' : isDoc ? 'var(--info)' : isFile ? 'var(--live)' : 'rgba(237,237,237,0.4)'
                                            return (
                                                <div key={log._id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', padding: '9px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderLeft: `2px solid ${color}55` }}>
                                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', padding: '2px 7px', background: `${color}18`, border: `1px solid ${color}44`, color, whiteSpace: 'nowrap' }}>
                                                        {label}
                                                    </span>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {log.target ?? '—'}
                                                        </div>
                                                        <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 1 }}>
                                                            {log.performedByName}
                                                        </div>
                                                    </div>
                                                    <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        {formatDate(log.createdAt)}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/* Pagination */}
                                    {activityTotal > 30 && (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                                            <button type='button' disabled={activityPage === 0}
                                                onClick={() => {
                                                    const p = activityPage - 1; setActivityPage(p)
                                                    if (activeMember) fetchActivity(activeMember.id, activityFilter, activityFrom, activityTo, p)
                                                }}
                                                style={{ padding: '5px 14px', fontSize: '0.68rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: activityPage === 0 ? 'default' : 'pointer', opacity: activityPage === 0 ? 0.3 : 1 }}
                                            >← Prev</button>
                                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)' }}>
                                                Page {activityPage + 1} of {Math.ceil(activityTotal / 30)}
                                            </span>
                                            <button type='button' disabled={(activityPage + 1) * 30 >= activityTotal}
                                                onClick={() => {
                                                    const p = activityPage + 1; setActivityPage(p)
                                                    if (activeMember) fetchActivity(activeMember.id, activityFilter, activityFrom, activityTo, p)
                                                }}
                                                style={{ padding: '5px 14px', fontSize: '0.68rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: (activityPage + 1) * 30 >= activityTotal ? 'default' : 'pointer', opacity: (activityPage + 1) * 30 >= activityTotal ? 0.3 : 1 }}
                                            >Next →</button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                    /* ── Documents ───────────────────────────────────────── */
                    ) : (
                        <div>
                            <SectionHead title='Documents' action={
                                <button
                                    type='button'
                                    onClick={handleCreateDoc}
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: 'rgba(139,92,246,0.85)', cursor: 'pointer' }}
                                >
                                    <Add sx={{ fontSize: 13 }} /> New Document
                                </button>
                            } />

                            {docs.length === 0 ? (
                                <EmptyRow text='No documents yet.' />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {docs.map(d => (
                                        <div key={d._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                            <Description sx={{ fontSize: 16, color: 'rgba(139,92,246,0.6)', flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <button type='button' onClick={() => openDoc(d)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.85)', padding: 0, textAlign: 'left' }}
                                                >
                                                    {d.title}
                                                </button>
                                                <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 1 }}>
                                                    Edited by {d.lastModifiedByName} · {formatDate(d.lastModifiedAt)}
                                                </div>
                                            </div>
                                            {canEdit(activeMember.id) && (
                                                <button type='button' onClick={() => setDeleteDocId(d._id)}
                                                    style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.2)', color: 'rgba(219,0,29,0.6)', cursor: 'pointer' }}
                                                >
                                                    <Delete sx={{ fontSize: 12 }} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                )}
            </div>

            {/* Delete file confirmation */}
            {deleteFileId && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#0f0f10', border: '1px solid var(--line-2)', padding: '24px 28px', maxWidth: 380, width: '90%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Delete File?</div>
                        <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.6 }}>This will permanently remove the file and cannot be undone.</div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                            <button onClick={() => setDeleteFileId(null)} style={{ padding: '7px 16px', fontSize: '0.72rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}>CANCEL</button>
                            <button onClick={() => handleDeleteFile(deleteFileId)} style={{ padding: '7px 16px', fontSize: '0.72rem', fontWeight: 700, background: 'rgba(219,0,29,0.2)', border: '1px solid rgba(219,0,29,0.5)', color: 'rgba(237,237,237,0.85)', cursor: 'pointer' }}>DELETE</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete doc confirmation */}
            {deleteDocId && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#0f0f10', border: '1px solid var(--line-2)', padding: '24px 28px', maxWidth: 380, width: '90%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>Delete Document?</div>
                        <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.6 }}>The document will be removed. This cannot be undone.</div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                            <button onClick={() => setDeleteDocId(null)} style={{ padding: '7px 16px', fontSize: '0.72rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}>CANCEL</button>
                            <button onClick={() => handleDeleteDoc(deleteDocId)} style={{ padding: '7px 16px', fontSize: '0.72rem', fontWeight: 700, background: 'rgba(219,0,29,0.2)', border: '1px solid rgba(219,0,29,0.5)', color: 'rgba(237,237,237,0.85)', cursor: 'pointer' }}>DELETE</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
