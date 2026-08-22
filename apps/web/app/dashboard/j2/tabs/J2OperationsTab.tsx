'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Typography, LinearProgress } from '@mui/material'
import {
    Edit, ContentCopy, Delete, Add, BookmarkAdd, BookmarkAdded,
    ExpandMore, ExpandLess, NoteAlt, Search, Close,
    ChevronLeft, ChevronRight, ViewList, AccountTree, FolderOpen, Check,
    DeleteSweep, RestoreFromTrash, DeleteForever,
    CalendarToday, EventNote, LinkOff, SwapHoriz,
} from '@mui/icons-material'
import ConfirmDialog from '@/components/confirm-dialog'
import { ConfirmDialog as TypedConfirmDialog } from '@/components/dashboard'

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15

const STATUS_COLORS: Record<string, string> = {
    'Active':         'rgba(0,200,80,0.9)',
    'Upcoming':       'rgba(219,160,0,0.9)',
    'Completed':      'rgba(100,150,237,0.8)',
    'In Development': 'rgba(219,0,29,0.75)',
}
const STATUS_BORDER: Record<string, string> = {
    'Active':         'rgba(0,200,80,0.35)',
    'Upcoming':       'rgba(219,160,0,0.35)',
    'Completed':      'rgba(100,150,237,0.3)',
    'In Development': 'rgba(219,0,29,0.35)',
}

const ALL_STATUSES = ['All', 'In Development', 'Upcoming', 'Active', 'Completed'] as const
type StatusFilter = typeof ALL_STATUSES[number]
type TypeFilter = 'All' | 'Campaigns' | 'Single Missions'
type ViewMode = 'list' | 'bin'

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
    if (!status) return null
    const color = STATUS_COLORS[status] ?? 'rgba(237,237,237,0.35)'
    const border = STATUS_BORDER[status] ?? 'rgba(237,237,237,0.2)'
    return (
        <span style={{
            fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase',
            color, border: `1px solid ${border}`, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0,
            background: 'rgba(0,0,0,0.45)',
        }}>
            {status}
        </span>
    )
}

// ── Template picker modal ─────────────────────────────────────────────────────

function TemplatePicker({ onClose }: { onClose: () => void }) {
    const [templates, setTemplates] = useState<OperationTemplate[]>([])
    const [loading, setLoading] = useState(true)
    const [applying, setApplying] = useState<string | null>(null)
    const router = useRouter()

    useEffect(() => {
        fetch('/api/operations/templates')
            .then(r => r.json())
            .then(data => setTemplates(data.templates ?? []))
            .finally(() => setLoading(false))
    }, [])

    async function apply(templateId: string) {
        setApplying(templateId)
        try {
            const res = await fetch('/api/operations/templates/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateId }),
            })
            const data = await res.json()
            if (data.id) { router.push(`/operations/${data.id}/edit`); onClose() }
        } finally { setApplying(null) }
    }

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '70vh', background: 'rgb(13,13,13)', border: '1px solid var(--line-2)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.8)' }}>New from Template</span>
                    <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.35)', display: 'flex' }}><Close style={{ fontSize: 18 }} /></button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {loading && <Typography style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.3)' }}>Loading…</Typography>}
                    {!loading && templates.length === 0 && (
                        <div style={{ padding: '24px 0', textAlign: 'center' }}>
                            <Typography style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No templates yet.</Typography>
                            <Typography style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.18)', marginTop: 6 }}>Use the bookmark icon on any mission row to save one.</Typography>
                        </div>
                    )}
                    {templates.map(t => {
                        const tid = t._id.toString()
                        const isApplying = applying === tid
                        return (
                            <div key={tid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.04)' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                                    <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 3 }}>
                                        {t.sections?.length ?? 0} section{(t.sections?.length ?? 0) !== 1 ? 's' : ''} · {new Date(t.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </div>
                                </div>
                                <button onClick={() => apply(tid)} disabled={!!applying} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 14px', cursor: applying ? 'not-allowed' : 'pointer', background: isApplying ? 'rgba(219,0,29,0.42)' : 'var(--red)', border: '1px solid var(--red)', color: 'white', transition: 'background 0.15s' }}>
                                    <Add style={{ fontSize: 13 }} />{isApplying ? 'Creating…' : 'Use'}
                                </button>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

// ── Assign-to-campaign inline section ────────────────────────────────────────

function AssignCampaignSection({ op, onAssigned, onRemoved }: {
    op: Operation
    onAssigned: (opId: string, campaignId: string, campaignName: string) => void
    onRemoved: (opId: string) => void
}) {
    const [open, setOpen] = useState(false)
    const [campaigns, setCampaigns] = useState<OperationCampaign[] | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (!open || campaigns !== null) return
        fetch('/api/operations/campaigns')
            .then(r => r.json())
            .then(data => setCampaigns(data.campaigns ?? []))
    }, [open, campaigns])

    async function assign(campaignId: string, campaignName: string) {
        setBusy(true)
        try {
            await fetch('/api/operations/campaigns/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operationId: op._id.toString(), campaignId }),
            })
            onAssigned(op._id.toString(), campaignId, campaignName)
            setOpen(false)
        } finally { setBusy(false) }
    }

    async function remove() {
        setBusy(true)
        try {
            await fetch(`/api/operations/campaigns/assign?operationId=${op._id.toString()}`, { method: 'DELETE' })
            onRemoved(op._id.toString())
            setOpen(false)
        } finally { setBusy(false) }
    }

    const currentCampaignId = op.campaignId?.toString()

    return (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    width: '100%', padding: '6px 14px',
                    color: currentCampaignId ? 'rgba(100,150,237,0.75)' : 'rgba(237,237,237,0.25)',
                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                    background: open ? 'rgba(255,255,255,0.04)' : 'transparent',
                    transition: 'background 0.15s',
                }}
            >
                <FolderOpen style={{ fontSize: 13 }} />
                {currentCampaignId ? 'In Campaign' : 'Assign to Campaign'}
                <span style={{ marginLeft: 'auto', display: 'flex' }}>
                    {open ? <ExpandLess style={{ fontSize: 14 }} /> : <ExpandMore style={{ fontSize: 14 }} />}
                </span>
            </button>

            {open && (
                <div style={{ padding: '6px 14px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {campaigns === null && <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)' }}>Loading…</span>}
                    {campaigns !== null && campaigns.length === 0 && (
                        <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No campaigns yet. Create one in the Campaigns view.</span>
                    )}
                    {campaigns !== null && campaigns.map(c => {
                        const cid = c._id.toString()
                        const isActive = currentCampaignId === cid
                        return (
                            <button
                                key={cid}
                                onClick={() => isActive ? remove() : assign(cid, c.name)}
                                disabled={busy}
                                style={{
                                    all: 'unset', cursor: busy ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '5px 10px',
                                    background: isActive ? 'rgba(100,150,237,0.08)' : 'rgba(255,255,255,0.04)',
                                    border: `1px solid ${isActive ? 'rgba(100,150,237,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                    color: isActive ? 'rgba(100,150,237,0.9)' : 'rgba(237,237,237,0.6)',
                                    fontSize: '0.75rem', fontWeight: isActive ? 700 : 400,
                                    transition: 'all 0.15s',
                                }}
                            >
                                {isActive && <Check style={{ fontSize: 12 }} />}
                                <span style={{ flex: 1 }}>{c.name}</span>
                                <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>{isActive ? 'Remove' : 'Assign'}</span>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ── Internal notes ────────────────────────────────────────────────────────────

function NotesRow({ op, onSaved }: { op: Operation; onSaved: (id: string, notes: string) => void }) {
    const [open, setOpen] = useState(false)
    const [value, setValue] = useState(op.internalNotes ?? '')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

    useEffect(() => { setValue(op.internalNotes ?? '') }, [op.internalNotes])

    async function saveNotes(notes: string) {
        setSaving(true)
        try {
            await fetch('/api/operations/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: op._id.toString(), notes }),
            })
            onSaved(op._id.toString(), notes)
            setSaved(true)
            clearTimeout(timeoutRef.current)
            timeoutRef.current = setTimeout(() => setSaved(false), 2000)
        } finally { setSaving(false) }
    }

    return (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    width: '100%', padding: '6px 14px',
                    color: op.internalNotes ? 'rgba(219,160,0,0.75)' : 'rgba(237,237,237,0.25)',
                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                    background: open ? 'rgba(255,255,255,0.04)' : 'transparent', transition: 'background 0.15s',
                }}
            >
                <NoteAlt style={{ fontSize: 13 }} />
                {op.internalNotes ? 'Internal Notes' : 'Add Internal Notes'}
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                    {saved && <span style={{ fontSize: '0.6rem', color: 'color-mix(in srgb, var(--live) 70%, transparent)', marginRight: 8 }}>Saved</span>}
                    {open ? <ExpandLess style={{ fontSize: 14 }} /> : <ExpandMore style={{ fontSize: 14 }} />}
                </span>
            </button>
            {open && (
                <div style={{ padding: '0 14px 12px' }}>
                    <textarea
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        onBlur={() => saveNotes(value)}
                        placeholder='Internal notes — not visible to regular members…'
                        rows={3}
                        style={{
                            width: '100%', resize: 'vertical', boxSizing: 'border-box',
                            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(219,160,0,0.2)',
                            color: 'rgba(237,237,237,0.8)', fontSize: '0.78rem', padding: '8px 10px',
                            outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                            opacity: saving ? 0.6 : 1,
                        }}
                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(219,160,0,0.5)')}
                        onBlurCapture={e => (e.currentTarget.style.borderColor = 'rgba(219,160,0,0.2)')}
                    />
                </div>
            )}
        </div>
    )
}

// ── Save-as-template inline form ──────────────────────────────────────────────

function SaveTemplateForm({ op, onSaved, onCancel }: { op: Operation; onSaved: () => void; onCancel: () => void }) {
    const [name, setName] = useState(op.title)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    async function submit() {
        if (!name.trim()) { setError('Name required'); return }
        setSaving(true)
        try {
            const res = await fetch('/api/operations/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), sourceOperationId: op._id.toString() }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error ?? 'Failed'); setSaving(false); return }
            onSaved()
        } catch { setError('Network error'); setSaving(false) }
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'rgba(219,160,0,0.04)', borderTop: '1px solid rgba(219,160,0,0.12)' }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(219,160,0,0.7)', whiteSpace: 'nowrap' }}>SAVE AS TEMPLATE</span>
            <input autoFocus value={name} onChange={e => { setName(e.target.value); setError('') }} onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
                style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: `1px solid ${error ? 'rgba(219,0,29,0.5)' : 'rgba(219,160,0,0.3)'}`, color: '#ededed', fontSize: '0.78rem', padding: '4px 8px', outline: 'none', fontFamily: 'inherit' }} placeholder='Template name…' />
            {error && <span style={{ fontSize: '0.65rem', color: 'rgba(219,0,29,0.8)' }}>{error}</span>}
            <button onClick={submit} disabled={saving} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 12px', cursor: saving ? 'not-allowed' : 'pointer', background: 'rgba(219,160,0,0.15)', border: '1px solid rgba(219,160,0,0.4)', color: 'rgba(219,160,0,0.9)' }}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={onCancel} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', cursor: 'pointer', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)' }}>Cancel</button>
        </div>
    )
}

// ── Single operation row ───────────────────────────────────────────────────────

function OpRow({ op, onDelete, onDuplicate, onNotesSaved, onTemplateSaved, onAssigned, onRemoved, onConvertToCampaign }: {
    op: Operation
    onDelete: (id: string, title: string) => void
    onDuplicate: (id: string) => void
    onNotesSaved: (id: string, notes: string) => void
    onTemplateSaved: () => void
    onAssigned: (opId: string, campaignId: string, campaignName: string) => void
    onRemoved: (opId: string) => void
    onConvertToCampaign?: (op: Operation) => void
}) {
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [templateFormOpen, setTemplateFormOpen] = useState(false)
    const [duplicating, setDuplicating] = useState(false)
    const id = op._id.toString()

    async function duplicate() {
        setDuplicating(true)
        try { await fetch(`/api/operations/duplicate?id=${id}`); onDuplicate(id) }
        finally { setDuplicating(false) }
    }

    const iconBtn = (danger = false): React.CSSProperties => ({
        background: 'none', border: 'none', cursor: 'pointer', padding: 5, display: 'flex', alignItems: 'center',
        color: danger ? 'rgba(219,0,29,0.4)' : 'rgba(237,237,237,0.3)', transition: 'color 0.15s',
    })

    return (
        <div style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
                {op.coverImage ? (
                    <div style={{ width: 52, height: 34, flexShrink: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <img src={op.coverImage} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                ) : (
                    <div style={{ width: 52, height: 34, flexShrink: 0, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(237,237,237,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.title}</div>
                    <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 2, letterSpacing: '0.05em' }}>
                        {new Date(op.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                </div>
                <StatusBadge status={op.status} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
                    <button onClick={() => window.location.href = `/operations/${id}/edit?from=j2`} title='Edit mission' style={iconBtn()} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.85)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.3)')}><Edit style={{ fontSize: 15 }} /></button>
                    <button onClick={duplicate} disabled={duplicating} title='Duplicate' style={iconBtn()} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.85)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.3)')}><ContentCopy style={{ fontSize: 14 }} /></button>
                    {onConvertToCampaign && !op.campaignId && (
                        <button onClick={() => onConvertToCampaign(op)} title='Convert to Campaign' style={{ ...iconBtn(), color: 'rgba(100,150,237,0.3)' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(100,150,237,0.85)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(100,150,237,0.3)')}>
                            <SwapHoriz style={{ fontSize: 15 }} />
                        </button>
                    )}
                    <button onClick={() => setTemplateFormOpen(t => !t)} title='Save as template' style={{ ...iconBtn(), color: templateFormOpen ? 'rgba(219,160,0,0.8)' : 'rgba(237,237,237,0.3)' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,160,0,0.8)')} onMouseLeave={e => (e.currentTarget.style.color = templateFormOpen ? 'rgba(219,160,0,0.8)' : 'rgba(237,237,237,0.3)')}>
                        {templateFormOpen ? <BookmarkAdded style={{ fontSize: 15 }} /> : <BookmarkAdd style={{ fontSize: 15 }} />}
                    </button>
                    <button onClick={() => setConfirmOpen(true)} title='Delete' style={iconBtn(true)} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.9)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.4)')}><Delete style={{ fontSize: 15 }} /></button>
                </div>
            </div>

            {templateFormOpen && <SaveTemplateForm op={op} onSaved={() => { setTemplateFormOpen(false); onTemplateSaved() }} onCancel={() => setTemplateFormOpen(false)} />}
            <AssignCampaignSection op={op} onAssigned={onAssigned} onRemoved={onRemoved} />
            <NotesRow op={op} onSaved={onNotesSaved} />

            <ConfirmDialog open={confirmOpen} title='Delete Mission' message={`Delete "${op.title}"? You can restore it from the recycle bin within 30 days.`}
                onConfirm={() => { setConfirmOpen(false); fetch(`/api/operations/delete?id=${id}`).then(r => { if (r.ok) onDelete(id, op.title) }) }}
                onCancel={() => setConfirmOpen(false)} />
        </div>
    )
}

// ── Campaign group (campaigns view) ───────────────────────────────────────────

function CampaignGroup({ campaign, missions, onDelete, onDuplicate, onNotesSaved, onTemplateSaved, onAssigned, onRemoved, onCampaignRenamed, onCampaignDeleted }: {
    campaign: OperationCampaign | null   // null = Standalone group
    missions: Operation[]
    onDelete: (id: string, title: string) => void
    onDuplicate: (id: string) => void
    onNotesSaved: (id: string, notes: string) => void
    onTemplateSaved: () => void
    onAssigned: (opId: string, campaignId: string, campaignName: string) => void
    onRemoved: (opId: string) => void
    onCampaignRenamed: (id: string, name: string) => void
    onCampaignDeleted: (id: string) => void
}) {
    const [open, setOpen] = useState(true)
    const [editing, setEditing] = useState(false)
    const [editName, setEditName] = useState(campaign?.name ?? '')
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [saving, setSaving] = useState(false)

    const isStandalone = campaign === null

    async function saveName() {
        if (!campaign || !editName.trim() || editName.trim() === campaign.name) { setEditing(false); return }
        setSaving(true)
        try {
            await fetch('/api/operations/campaigns', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: campaign._id.toString(), name: editName.trim() }),
            })
            onCampaignRenamed(campaign._id.toString(), editName.trim())
            setEditing(false)
        } finally { setSaving(false) }
    }

    async function deleteCampaign() {
        if (!campaign) return
        await fetch(`/api/operations/campaigns?id=${campaign._id.toString()}`, { method: 'DELETE' })
        onCampaignDeleted(campaign._id.toString())
    }

    const accent = isStandalone ? 'rgba(237,237,237,0.15)' : 'rgba(100,150,237,0.5)'
    const accentBg = isStandalone ? 'rgba(255,255,255,0.01)' : 'rgba(100,150,237,0.05)'

    return (
        <div style={{ border: `1px solid ${isStandalone ? 'rgba(255,255,255,0.06)' : 'rgba(100,150,237,0.18)'}`, borderTop: `2px solid ${accent}`, background: accentBg, marginBottom: 12 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: open ? `1px solid ${isStandalone ? 'rgba(255,255,255,0.05)' : 'rgba(100,150,237,0.1)'}` : 'none' }}>
                <button onClick={() => setOpen(o => !o)} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.35)', display: 'flex' }}>
                    {open ? <ExpandLess style={{ fontSize: 16 }} /> : <ExpandMore style={{ fontSize: 16 }} />}
                </button>

                {isStandalone ? (
                    <span style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' }}>
                        Standalone Missions
                    </span>
                ) : editing ? (
                    <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onBlur={saveName}
                        onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditing(false) }}
                        style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(100,150,237,0.4)', color: '#ededed', fontSize: '0.82rem', fontWeight: 700, padding: '2px 8px', outline: 'none', fontFamily: 'inherit', opacity: saving ? 0.5 : 1 }}
                    />
                ) : (
                    <button onClick={() => { setEditName(campaign!.name); setEditing(true) }} title='Click to rename' style={{ all: 'unset', cursor: 'pointer', flex: 1, fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(100,150,237,0.9)' }}>
                        {campaign!.name}
                    </button>
                )}

                <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.06em' }}>
                    {missions.length} mission{missions.length !== 1 ? 's' : ''}
                </span>

                {!isStandalone && (
                    <button onClick={() => setConfirmDelete(true)} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(219,0,29,0.35)', display: 'flex', transition: 'color 0.15s' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.8)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.35)')}>
                        <Delete style={{ fontSize: 15 }} />
                    </button>
                )}
            </div>

            {/* Missions */}
            {open && (
                <div style={{ padding: '8px 8px 4px' }}>
                    {missions.length === 0 && (
                        <Typography style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.2)', padding: '8px 6px', fontStyle: 'italic' }}>No missions in this campaign.</Typography>
                    )}
                    {missions.map(op => (
                        <OpRow key={op._id.toString()} op={op} onDelete={onDelete} onDuplicate={onDuplicate} onNotesSaved={onNotesSaved} onTemplateSaved={onTemplateSaved} onAssigned={onAssigned} onRemoved={onRemoved} />
                    ))}
                </div>
            )}

            {confirmDelete && (
                <ConfirmDialog open danger title='Delete Campaign' message={`Are you sure you want to delete "${campaign?.name}"? You can restore it from View Deleted.`}
                    onConfirm={() => { setConfirmDelete(false); deleteCampaign() }}
                    onCancel={() => setConfirmDelete(false)} />
            )}
        </div>
    )
}

// ── Roman numeral helper ──────────────────────────────────────────────────────

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const
function toRoman(n: number): string { return ROMAN[n - 1] ?? String(n) }

// ── New Mission type selection modal ─────────────────────────────────────────

function NewMissionModal({
    campaigns,
    onClose,
    onCreatedSingle,
    onCreatedCampaign,
}: {
    campaigns: OperationCampaign[]
    onClose: () => void
    onCreatedSingle: () => void
    onCreatedCampaign: (campaign: OperationCampaign, missions: CampaignMission[]) => void
}) {
    const [step, setStep] = useState<'type' | 'campaign'>('type')
    const [campaignMode, setCampaignMode] = useState<'existing' | 'new'>('existing')
    const [selectedCampaignId, setSelectedCampaignId] = useState('')
    const [newCampaignName, setNewCampaignName] = useState('')
    const [plannedCount, setPlannedCount] = useState(3)
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState('')
    const nmRouter = useRouter()

    async function createSingle() {
        setCreating(true)
        try {
            const res = await fetch('/api/operations/new')
            const data = await res.json()
            if (data.id) {
                nmRouter.push(`/operations/${data.id}/edit?from=j2`)
                onCreatedSingle()
            }
        } finally { setCreating(false) }
    }

    async function createCampaignMission() {
        setCreating(true)
        setError('')
        try {
            let campaignId = selectedCampaignId
            let campaign: OperationCampaign | null = null

            if (campaignMode === 'new') {
                if (!newCampaignName.trim()) { setError('Campaign name required'); setCreating(false); return }
                if (plannedCount < 3) { setError('Campaigns must contain a minimum of three missions.'); setCreating(false); return }
                const res = await fetch('/api/operations/campaigns', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newCampaignName.trim() }),
                })
                const data = await res.json()
                if (!res.ok) { setError(data.error ?? 'Failed'); setCreating(false); return }
                campaignId = data.id.toString()
                campaign = { _id: data.id, name: newCampaignName.trim(), createdBy: '', createdAt: new Date().toISOString() }
            } else {
                campaign = campaigns.find(c => c._id.toString() === campaignId) ?? null
                if (!campaign) { setError('Select a campaign'); setCreating(false); return }
            }

            // Fetch current missions to determine next sequence
            const mRes = await fetch(`/api/operations/campaign-missions?campaignId=${campaignId}`)
            const mData = await mRes.json()
            const existingMissions: CampaignMission[] = mData.missions ?? []
            const startSeq = existingMissions.length + 1

            const count = campaignMode === 'new' ? plannedCount : 1
            const createdMissions: CampaignMission[] = []

            for (let i = 0; i < count; i++) {
                const seq = startSeq + i
                const missionName = `${campaign.name} ${toRoman(seq)}`
                const mRes2 = await fetch('/api/operations/campaign-missions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ campaignId, name: missionName, sequence: seq }),
                })
                const mData2 = await mRes2.json()
                if (!mRes2.ok) { setError(mData2.error ?? 'Failed'); setCreating(false); return }
                createdMissions.push(mData2.mission)
            }

            onCreatedCampaign(campaign, createdMissions)
        } catch { setError('Network error') }
        finally { setCreating(false) }
    }

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'rgb(13,13,13)', border: '1px solid var(--line-2)', boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.8)' }}>New Mission</span>
                    <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.35)', display: 'flex' }}><Close style={{ fontSize: 18 }} /></button>
                </div>

                {step === 'type' && (
                    <div style={{ padding: '20px 18px', display: 'flex', gap: 12 }}>
                        <button
                            onClick={createSingle}
                            disabled={creating}
                            style={{
                                flex: 1, padding: '16px 12px', cursor: creating ? 'not-allowed' : 'pointer',
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                        >
                            <EventNote style={{ fontSize: 28, color: 'rgba(237,237,237,0.5)' }} />
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(237,237,237,0.8)' }}>Single Mission</span>
                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', textAlign: 'center' }}>Standalone operation, not part of a campaign</span>
                        </button>
                        <button
                            onClick={() => setStep('campaign')}
                            style={{
                                flex: 1, padding: '16px 12px', cursor: 'pointer',
                                background: 'rgba(100,150,237,0.04)', border: '1px solid rgba(100,150,237,0.2)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(100,150,237,0.08)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(100,150,237,0.04)')}
                        >
                            <AccountTree style={{ fontSize: 28, color: 'rgba(100,150,237,0.6)' }} />
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(100,150,237,0.9)' }}>Campaign Mission</span>
                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', textAlign: 'center' }}>Part of a multi-mission campaign</span>
                        </button>
                    </div>
                )}

                {step === 'campaign' && (
                    <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <button onClick={() => setStep('type')} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            ← Back
                        </button>

                        {/* Mode selector */}
                        <div style={{ display: 'flex', gap: 0, border: '1px solid rgba(255,255,255,0.1)' }}>
                            {(['existing', 'new'] as const).map(m => (
                                <button key={m} onClick={() => setCampaignMode(m)} style={{
                                    flex: 1, padding: '7px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                    background: campaignMode === m ? 'rgba(100,150,237,0.12)' : 'transparent',
                                    border: 'none', cursor: 'pointer',
                                    color: campaignMode === m ? 'rgba(100,150,237,0.9)' : 'rgba(237,237,237,0.3)',
                                    transition: 'all 0.15s',
                                }}>{m === 'existing' ? 'Existing Campaign' : 'New Campaign'}</button>
                            ))}
                        </div>

                        {campaignMode === 'existing' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {campaigns.length === 0 ? (
                                    <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>No campaigns yet. Use the "New Campaign" tab.</span>
                                ) : (
                                    campaigns.map(c => {
                                        const cid = c._id.toString()
                                        const isSelected = selectedCampaignId === cid
                                        return (
                                            <button key={cid} onClick={() => setSelectedCampaignId(cid)} style={{
                                                all: 'unset', cursor: 'pointer', padding: '8px 12px',
                                                background: isSelected ? 'rgba(100,150,237,0.1)' : 'rgba(255,255,255,0.03)',
                                                border: `1px solid ${isSelected ? 'rgba(100,150,237,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                                color: isSelected ? 'rgba(100,150,237,0.9)' : 'rgba(237,237,237,0.7)',
                                                fontSize: '0.8rem', fontWeight: isSelected ? 700 : 400,
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                transition: 'all 0.15s',
                                            }}>
                                                {isSelected && <Check style={{ fontSize: 13 }} />}
                                                {c.name}
                                            </button>
                                        )
                                    })
                                )}
                            </div>
                        )}

                        {campaignMode === 'new' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <input
                                    autoFocus
                                    value={newCampaignName}
                                    onChange={e => { setNewCampaignName(e.target.value); setError('') }}
                                    placeholder='Campaign name…'
                                    style={{
                                        background: 'rgba(0,0,0,0.25)', border: `1px solid ${error ? 'rgba(219,0,29,0.5)' : 'rgba(100,150,237,0.2)'}`,
                                        color: '#ededed', fontSize: '0.82rem', padding: '8px 10px', outline: 'none', fontFamily: 'inherit',
                                    }}
                                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(100,150,237,0.5)')}
                                    onBlur={e => (e.currentTarget.style.borderColor = error ? 'rgba(219,0,29,0.5)' : 'rgba(100,150,237,0.2)')}
                                />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', whiteSpace: 'nowrap' }}>Planned missions:</span>
                                        <input
                                            type='number' min={3} max={10} value={plannedCount}
                                            onChange={e => setPlannedCount(Math.max(3, Math.min(10, parseInt(e.target.value) || 3)))}
                                            style={{
                                                width: 60, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(100,150,237,0.2)',
                                                color: '#ededed', fontSize: '0.82rem', padding: '4px 8px', outline: 'none', fontFamily: 'inherit', textAlign: 'center',
                                            }}
                                        />
                                    </div>
                                    <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>
                                        Campaigns must contain a minimum of three missions.
                                    </span>
                                </div>
                            </div>
                        )}

                        {error && <span style={{ fontSize: '0.7rem', color: 'rgba(219,0,29,0.8)' }}>{error}</span>}

                        <button
                            onClick={createCampaignMission}
                            disabled={creating || (campaignMode === 'existing' && !selectedCampaignId)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                padding: '9px 14px', cursor: creating || (campaignMode === 'existing' && !selectedCampaignId) ? 'not-allowed' : 'pointer',
                                background: 'rgba(100,150,237,0.12)', border: '1px solid rgba(100,150,237,0.35)', color: 'rgba(100,150,237,0.9)',
                                opacity: campaignMode === 'existing' && !selectedCampaignId ? 0.4 : 1,
                            }}
                        >
                            <Add style={{ fontSize: 14 }} />{creating ? 'Creating…' : (campaignMode === 'new' ? 'Create Campaign' : 'Add Mission')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Add Sun/Sat Day slot modal ────────────────────────────────────────────────

function AddDaySlotModal({
    mission,
    daySlot,
    saturdayOp,
    onClose,
    onLinked,
}: {
    mission: CampaignMission
    daySlot: 'saturday' | 'sunday'
    saturdayOp?: Operation | null
    onClose: () => void
    onLinked: (mission: CampaignMission, opId: string, op: Operation) => void
}) {
    const [mode, setMode] = useState<'blank' | 'full' | 'partial'>('blank')
    const [replacePlatoon, setReplacePlatoon] = useState(false)
    const [selectedSections, setSelectedSections] = useState<string[]>([])
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState('')
    const slotRouter = useRouter()

    const missionId = mission._id?.toString() ?? ''
    const hasSaturdayOp = !!saturdayOp

    async function createAndLink() {
        setCreating(true)
        setError('')
        try {
            let newOpId: string

            if (mode === 'blank' || !hasSaturdayOp) {
                // Create blank operation
                const res = await fetch('/api/operations/new')
                const data = await res.json()
                if (!data.id) { setError('Failed to create operation'); setCreating(false); return }
                newOpId = data.id.toString()
            } else if (mode === 'full') {
                // Full duplicate
                const res = await fetch(`/api/operations/duplicate?id=${saturdayOp!._id.toString()}`)
                const data = await res.json()
                if (!data.id) { setError('Failed to duplicate'); setCreating(false); return }
                newOpId = data.id.toString()

                if (replacePlatoon) {
                    await fetch('/api/operations/duplicate-partial', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sourceId: newOpId, targetId: newOpId,
                            sections: saturdayOp!.sections?.map(s => s.id) ?? [],
                            replacePlatoon11: true,
                        }),
                    })
                }
            } else {
                // Partial duplicate — first create blank, then copy sections
                const res = await fetch('/api/operations/new')
                const data = await res.json()
                if (!data.id) { setError('Failed to create operation'); setCreating(false); return }
                newOpId = data.id.toString()

                if (selectedSections.length > 0) {
                    await fetch('/api/operations/duplicate-partial', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sourceId: saturdayOp!._id.toString(),
                            targetId: newOpId,
                            sections: selectedSections,
                            replacePlatoon11: replacePlatoon,
                        }),
                    })
                }
            }

            // Link operation to mission
            const linkRes = await fetch(`/api/operations/campaign-missions/${missionId}/link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ daySlot, operationId: newOpId }),
            })
            if (!linkRes.ok) { setError('Failed to link operation'); setCreating(false); return }

            // Fetch the new op to pass back
            const opRes = await fetch(`/api/operations?id=${newOpId}`)
            const opData = await opRes.json()
            onLinked(mission, newOpId, opData.mission ?? { _id: newOpId, title: 'New Operation', date: new Date() } as any)
            slotRouter.push(`/operations/${newOpId}/edit?from=j2`)
        } catch { setError('Network error') }
        finally { setCreating(false) }
    }

    const label = daySlot === 'saturday' ? 'Saturday' : 'Sunday'

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 500, maxHeight: '80vh', background: 'rgb(13,13,13)', border: '1px solid var(--line-2)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.8)' }}>
                        Add {label} — {mission.name}
                    </span>
                    <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.35)', display: 'flex' }}><Close style={{ fontSize: 18 }} /></button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Mode selection */}
                    <div style={{ display: 'flex', gap: 0, border: '1px solid rgba(255,255,255,0.1)' }}>
                        {([
                            { id: 'blank', label: 'Blank' },
                            ...(hasSaturdayOp ? [
                                { id: 'full', label: 'Full Duplicate' },
                                { id: 'partial', label: 'Partial Duplicate' },
                            ] : []),
                        ] as { id: 'blank' | 'full' | 'partial'; label: string }[]).map(opt => (
                            <button key={opt.id} onClick={() => setMode(opt.id)} style={{
                                flex: 1, padding: '7px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                background: mode === opt.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                                border: 'none', borderRight: '1px solid rgba(255,255,255,0.1)',
                                cursor: 'pointer',
                                color: mode === opt.id ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.35)',
                                transition: 'all 0.15s',
                            }}>{opt.label}</button>
                        ))}
                    </div>

                    {mode === 'blank' && (
                        <p style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.45)', margin: 0 }}>
                            Creates a fresh empty operation and links it as the {label} slot for this mission.
                        </p>
                    )}

                    {mode === 'full' && hasSaturdayOp && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <p style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.45)', margin: 0 }}>
                                Full copy of "{saturdayOp!.title}" including all sections.
                            </p>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.75rem', color: 'rgba(237,237,237,0.7)' }}>
                                <input type='checkbox' checked={replacePlatoon} onChange={e => setReplacePlatoon(e.target.checked)}
                                    style={{ accentColor: 'var(--red)', width: 14, height: 14 }} />
                                Replace "1-1" with "1-2" in all text content
                            </label>
                        </div>
                    )}

                    {mode === 'partial' && hasSaturdayOp && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>
                                Select sections to copy:
                            </span>
                            {(saturdayOp!.sections ?? []).map(s => (
                                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.78rem', color: 'rgba(237,237,237,0.75)' }}>
                                    <input
                                        type='checkbox'
                                        checked={selectedSections.includes(s.id)}
                                        onChange={e => setSelectedSections(prev =>
                                            e.target.checked ? [...prev, s.id] : prev.filter(x => x !== s.id)
                                        )}
                                        style={{ accentColor: 'var(--red)', width: 14, height: 14 }}
                                    />
                                    {s.title}
                                    {!s.isPublic && <span style={{ fontSize: '0.55rem', color: 'rgba(219,160,0,0.6)', border: '1px solid rgba(219,160,0,0.25)', padding: '1px 5px' }}>Classified</span>}
                                </label>
                            ))}
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.75rem', color: 'rgba(237,237,237,0.7)', marginTop: 4 }}>
                                <input type='checkbox' checked={replacePlatoon} onChange={e => setReplacePlatoon(e.target.checked)}
                                    style={{ accentColor: 'var(--red)', width: 14, height: 14 }} />
                                Replace "1-1" with "1-2" in copied content
                            </label>
                        </div>
                    )}

                    {error && <span style={{ fontSize: '0.7rem', color: 'rgba(219,0,29,0.8)' }}>{error}</span>}
                </div>

                <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                    <button
                        onClick={createAndLink}
                        disabled={creating || (mode === 'partial' && selectedSections.length === 0)}
                        style={{
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                            padding: '9px', cursor: creating ? 'not-allowed' : 'pointer',
                            background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.42)', color: creating ? 'rgba(219,0,29,0.42)' : 'rgba(219,0,29,0.8)',
                            opacity: mode === 'partial' && selectedSections.length === 0 ? 0.4 : 1,
                        }}
                    >
                        <CalendarToday style={{ fontSize: 13 }} />
                        {creating ? 'Creating…' : `Create ${label} Operation`}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Convert to Campaign modal ─────────────────────────────────────────────────

function ConvertToCampaignModal({
    op,
    onClose,
    onConverted,
}: {
    op: Operation
    onClose: () => void
    onConverted: (campaign: OperationCampaign, mission: CampaignMission) => void
}) {
    const [campaignName, setCampaignName] = useState(op.title)
    const [converting, setConverting] = useState(false)
    const [error, setError] = useState('')

    async function convert() {
        if (!campaignName.trim()) { setError('Campaign name required'); return }
        setConverting(true)
        setError('')
        try {
            // Create campaign
            const cRes = await fetch('/api/operations/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: campaignName.trim() }),
            })
            const cData = await cRes.json()
            if (!cRes.ok) { setError(cData.error ?? 'Failed'); setConverting(false); return }
            const campaignId = cData.id.toString()
            const campaign: OperationCampaign = { _id: cData.id, name: campaignName.trim(), createdBy: '', createdAt: new Date().toISOString() }

            // Create mission "I"
            const mRes = await fetch('/api/operations/campaign-missions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaignId, name: `${campaignName.trim()} I`, sequence: 1 }),
            })
            const mData = await mRes.json()
            if (!mRes.ok) { setError(mData.error ?? 'Failed'); setConverting(false); return }
            const mission: CampaignMission = mData.mission

            // Link this operation as Saturday
            await fetch(`/api/operations/campaign-missions/${mission._id?.toString()}/link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ daySlot: 'saturday', operationId: op._id.toString() }),
            })

            // Also assign campaign to operation
            await fetch('/api/operations/campaigns/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operationId: op._id.toString(), campaignId }),
            })

            onConverted(campaign, mission)
        } catch { setError('Network error') }
        finally { setConverting(false) }
    }

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'rgb(13,13,13)', border: '1px solid rgba(100,150,237,0.25)', borderTop: '2px solid rgba(100,150,237,0.6)', boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(100,150,237,0.8)' }}>Convert to Campaign</span>
                    <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.35)', display: 'flex' }}><Close style={{ fontSize: 18 }} /></button>
                </div>
                <div style={{ padding: '18px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.45)', margin: 0 }}>
                        Creates a new campaign and links "{op.title}" as Mission I (Saturday).
                    </p>
                    <input
                        autoFocus
                        value={campaignName}
                        onChange={e => { setCampaignName(e.target.value); setError('') }}
                        placeholder='Campaign name…'
                        onKeyDown={e => { if (e.key === 'Enter') convert() }}
                        style={{
                            background: 'rgba(0,0,0,0.25)', border: `1px solid ${error ? 'rgba(219,0,29,0.5)' : 'rgba(100,150,237,0.2)'}`,
                            color: '#ededed', fontSize: '0.82rem', padding: '8px 10px', outline: 'none', fontFamily: 'inherit',
                        }}
                    />
                    {error && <span style={{ fontSize: '0.7rem', color: 'rgba(219,0,29,0.8)' }}>{error}</span>}
                    <button
                        onClick={convert} disabled={converting}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                            padding: '9px', cursor: converting ? 'not-allowed' : 'pointer',
                            background: 'rgba(100,150,237,0.12)', border: '1px solid rgba(100,150,237,0.35)', color: 'rgba(100,150,237,0.9)',
                        }}
                    >
                        <SwapHoriz style={{ fontSize: 14 }} />{converting ? 'Converting…' : 'Convert to Campaign'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Campaign mission row (Sat/Sun slots) ──────────────────────────────────────

function CampaignMissionRow({
    mission,
    allOperations,
    themeColor,
    onAddSlot,
    onUnlinkSlot,
    onMissionRenamed,
    onMissionDeleted,
}: {
    mission: CampaignMission
    allOperations: Operation[]
    themeColor?: string
    onAddSlot: (mission: CampaignMission, daySlot: 'saturday' | 'sunday') => void
    onUnlinkSlot: (mission: CampaignMission, daySlot: 'saturday' | 'sunday') => void
    onMissionRenamed: (id: string, name: string) => void
    onMissionDeleted: (id: string) => void
}) {
    const [open, setOpen] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editName, setEditName] = useState(mission.name)
    const [saving, setSaving] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const satOp = mission.saturdayOpId ? allOperations.find(o => o._id.toString() === mission.saturdayOpId) : null
    const sunOp = mission.sundayOpId ? allOperations.find(o => o._id.toString() === mission.sundayOpId) : null
    const missionId = mission._id?.toString() ?? ''

    async function saveName() {
        if (!editName.trim() || editName.trim() === mission.name) { setEditing(false); return }
        setSaving(true)
        try {
            await fetch(`/api/operations/campaign-missions/${missionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName.trim() }),
            })
            onMissionRenamed(missionId, editName.trim())
            setEditing(false)
        } finally { setSaving(false) }
    }

    async function deleteMission() {
        const res = await fetch(`/api/operations/campaign-missions/${missionId}`, { method: 'DELETE' })
        if (!res.ok) return
        onMissionDeleted(missionId)
    }

    function DaySlotEntry({ slot, op }: { slot: 'saturday' | 'sunday'; op: Operation | null | undefined }) {
        const label = slot === 'saturday' ? 'Saturday' : 'Sunday'
        const accent = slot === 'saturday' ? 'rgba(219,160,0,0.6)' : 'rgba(100,150,237,0.6)'

        if (op) {
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent, flexShrink: 0, width: 56 }}>{label}</span>
                    <button onClick={() => window.location.href = `/operations/${op._id.toString()}/edit?from=j2`} style={{ all: 'unset', cursor: 'pointer', flex: 1, fontSize: '0.78rem', fontWeight: 600, color: 'rgba(237,237,237,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {op.title}
                    </button>
                    <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.22)', flexShrink: 0 }}>
                        {new Date(op.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    </span>
                    {op.status && (
                        <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: STATUS_COLORS[op.status] ?? 'rgba(237,237,237,0.35)', border: `1px solid ${STATUS_BORDER[op.status] ?? 'rgba(237,237,237,0.2)'}`, padding: '1px 5px', flexShrink: 0 }}>
                            {op.status}
                        </span>
                    )}
                    <button
                        onClick={() => onUnlinkSlot(mission, slot)}
                        title={`Unlink ${label}`}
                        style={{ all: 'unset', cursor: 'pointer', color: 'rgba(219,0,29,0.3)', display: 'flex', transition: 'color 0.15s', flexShrink: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.8)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.3)')}
                    >
                        <LinkOff style={{ fontSize: 13 }} />
                    </button>
                </div>
            )
        }

        return (
            <button
                onClick={() => onAddSlot(mission, slot)}
                style={{
                    all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px',
                    background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)',
                    width: '100%', boxSizing: 'border-box',
                    transition: 'all 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = accent }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.01)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
            >
                <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent, width: 56, flexShrink: 0 }}>{label}</span>
                <Add style={{ fontSize: 12, color: 'rgba(237,237,237,0.25)' }} />
                <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)' }}>Add {label}</span>
            </button>
        )
    }

    return (
        <div style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)', marginBottom: 6, marginLeft: 12 }}>
            {/* Mission header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: open ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <button onClick={() => setOpen(o => !o)} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.3)', display: 'flex' }}>
                    {open ? <ExpandLess style={{ fontSize: 14 }} /> : <ExpandMore style={{ fontSize: 14 }} />}
                </button>

                {editing ? (
                    <input
                        autoFocus value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onBlur={saveName}
                        onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditing(false) }}
                        style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', color: '#ededed', fontSize: '0.78rem', fontWeight: 700, padding: '2px 6px', outline: 'none', fontFamily: 'inherit', opacity: saving ? 0.5 : 1 }}
                    />
                ) : (
                    <button onClick={() => { setEditName(mission.name); setEditing(true) }} title='Click to rename' style={{ all: 'unset', cursor: 'pointer', flex: 1, fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(237,237,237,0.75)' }}>
                        {mission.name}
                    </button>
                )}

                <button onClick={() => setConfirmDelete(true)} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(219,0,29,0.25)', display: 'flex', transition: 'color 0.15s', flexShrink: 0 }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.75)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.25)')}>
                    <Delete style={{ fontSize: 13 }} />
                </button>
            </div>

            {open && (
                <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <DaySlotEntry slot='saturday' op={satOp} />
                    <DaySlotEntry slot='sunday' op={sunOp} />
                </div>
            )}

            {confirmDelete && (
                <ConfirmDialog open danger title='Delete Mission' message={`Are you sure you want to delete "${mission.name}"? You can restore it from View Deleted.`}
                    onConfirm={() => { setConfirmDelete(false); deleteMission() }}
                    onCancel={() => setConfirmDelete(false)} />
            )}
        </div>
    )
}

// ── Virtual mission groups (for ops linked to campaign but no CampaignMission) ──

function VirtualMissionGroups({ campaignId, allOperations }: { campaignId: string; allOperations: Operation[] }) {
    const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

    const unlinkedOps = allOperations.filter(op =>
        op.campaignId?.toString() === campaignId &&
        !op.campaignMissionId &&
        !op.isSingleMission
    )
    if (unlinkedOps.length === 0) return null

    // Group by title pattern (Roman numeral + day slot)
    const groupMap = new Map<string, { name: string; slots: { op: Operation; slot: 'saturday' | 'sunday' | 'standalone' }[]; romanIdx: number }>()
    const ungrouped: Operation[] = []

    for (const op of unlinkedOps) {
        const { stripped: withoutDay, day } = detectDaySlot(op.title)
        const { roman } = detectRomanSuffix(withoutDay)
        if (!roman) { ungrouped.push(op); continue }
        const key = withoutDay.toLowerCase()
        if (!groupMap.has(key)) {
            const romanIdx = ROMAN.indexOf(roman.toUpperCase() as typeof ROMAN[number])
            groupMap.set(key, { name: withoutDay, slots: [], romanIdx: romanIdx >= 0 ? romanIdx : 99 })
        }
        const slot: 'saturday' | 'sunday' | 'standalone' = day === 'saturday' ? 'saturday' : day === 'sunday' ? 'sunday' : 'standalone'
        groupMap.get(key)!.slots.push({ op, slot })
    }

    const groups = Array.from(groupMap.entries())
        .sort(([, a], [, b]) => a.romanIdx - b.romanIdx)

    const satAccent = 'rgba(219,160,0,0.6)'
    const sunAccent = 'rgba(100,150,237,0.6)'

    return (
        <>
            {groups.map(([key, group]) => {
                const isOpen = openGroups.has(key)
                return (
                    <div key={key} style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)', marginBottom: 6, marginLeft: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: isOpen ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                            <button onClick={() => setOpenGroups(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.3)', display: 'flex' }}>
                                {isOpen ? <ExpandLess style={{ fontSize: 14 }} /> : <ExpandMore style={{ fontSize: 14 }} />}
                            </button>
                            <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(237,237,237,0.65)' }}>{group.name}</span>
                            <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.2)', letterSpacing: '0.06em' }}>{group.slots.length} op{group.slots.length !== 1 ? 's' : ''}</span>
                        </div>
                        {isOpen && (
                            <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {group.slots.map(({ op, slot }) => {
                                    const label = slot === 'saturday' ? 'Saturday' : slot === 'sunday' ? 'Sunday' : 'Op'
                                    const accent = slot === 'saturday' ? satAccent : slot === 'sunday' ? sunAccent : 'rgba(237,237,237,0.4)'
                                    return (
                                        <div key={op._id.toString()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                            <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent, flexShrink: 0, width: 56 }}>{label}</span>
                                            <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: 600, color: 'rgba(237,237,237,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {op.title}
                                            </span>
                                            <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.22)', flexShrink: 0 }}>
                                                {new Date(op.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                            </span>
                                            {op.status && (
                                                <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: STATUS_COLORS[op.status] ?? 'rgba(237,237,237,0.35)', border: `1px solid ${STATUS_BORDER[op.status] ?? 'rgba(237,237,237,0.2)'}`, padding: '1px 5px', flexShrink: 0 }}>
                                                    {op.status}
                                                </span>
                                            )}
                                            <button onClick={() => window.location.href = `/operations/${op._id.toString()}/edit?from=j2`} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(219,160,0,0.55)', border: '1px solid rgba(219,160,0,0.2)', padding: '1px 6px', flexShrink: 0, transition: 'color 0.12s, border-color 0.12s' }} onMouseEnter={e => { e.currentTarget.style.color = 'rgba(219,160,0,0.9)'; e.currentTarget.style.borderColor = 'rgba(219,160,0,0.5)' }} onMouseLeave={e => { e.currentTarget.style.color = 'rgba(219,160,0,0.55)'; e.currentTarget.style.borderColor = 'rgba(219,160,0,0.2)' }}>Edit</button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )
            })}
            {ungrouped.map(op => (
                <div key={op._id.toString()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)', marginBottom: 4, marginLeft: 12 }}>
                    <button onClick={() => window.location.href = `/operations/${op._id.toString()}/edit?from=j2`} style={{ all: 'unset', cursor: 'pointer', flex: 1, fontSize: '0.78rem', fontWeight: 600, color: 'rgba(237,237,237,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {op.title}
                    </button>
                    {op.status && (
                        <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: STATUS_COLORS[op.status] ?? 'rgba(237,237,237,0.35)', border: `1px solid ${STATUS_BORDER[op.status] ?? 'rgba(237,237,237,0.2)'}`, padding: '1px 5px', flexShrink: 0 }}>
                            {op.status}
                        </span>
                    )}
                </div>
            ))}
        </>
    )
}

// ── Enhanced campaign group with 3-level hierarchy ────────────────────────────

function CampaignGroupHierarchy({
    campaign,
    missions,
    allOperations,
    onMissionsChange,
    onCampaignRenamed,
    onCampaignDeleted,
    onCampaignStatusChanged,
    onRefreshOps,
}: {
    campaign: OperationCampaign
    missions: CampaignMission[]
    allOperations: Operation[]
    onMissionsChange: (campaignId: string, missions: CampaignMission[]) => void
    onCampaignRenamed: (id: string, name: string) => void
    onCampaignDeleted: (id: string) => void
    onCampaignStatusChanged?: (id: string, status: string | null) => void
    onRefreshOps?: () => void
}) {
    const [open, setOpen] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editName, setEditName] = useState(campaign.name)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [saving, setSaving] = useState(false)
    const [addDaySlot, setAddDaySlot] = useState<{ mission: CampaignMission; slot: 'saturday' | 'sunday' } | null>(null)
    const [addingMission, setAddingMission] = useState(false)
    const [normalising, setNormalising] = useState(false)
    const [statusUpdating, setStatusUpdating] = useState(false)
    const [completionPromptDismissed, setCompletionPromptDismissed] = useState(false)

    const campaignId = campaign._id.toString()

    // Count virtual mission groups (ops linked by campaignId only, title-parsed)
    const unlinkedOps = allOperations.filter(o => o.campaignId?.toString() === campaignId && !o.campaignMissionId && !o.isSingleMission)
    const virtualGroupKeys = new Set<string>()
    for (const op of unlinkedOps) {
        const { stripped: withoutDay } = detectDaySlot(op.title)
        const { roman } = detectRomanSuffix(withoutDay)
        if (roman) virtualGroupKeys.add(withoutDay.toLowerCase())
    }
    const totalMissions = missions.length + virtualGroupKeys.size

    const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    const campaignDateRange = campaign.startDate && campaign.endDate
        ? `${fmtDate(campaign.startDate)} — ${fmtDate(campaign.endDate)}`
        : campaign.startDate ? fmtDate(campaign.startDate)
        : campaign.endDate ? fmtDate(campaign.endDate)
        : null

    async function saveName() {
        if (!campaign || !editName.trim() || editName.trim() === campaign.name) { setEditing(false); return }
        setSaving(true)
        try {
            await fetch('/api/operations/campaigns', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: campaignId, name: editName.trim() }),
            })
            onCampaignRenamed(campaignId, editName.trim())
            setEditing(false)
        } finally { setSaving(false) }
    }

    async function deleteCampaign() {
        const res = await fetch(`/api/operations/campaigns?id=${campaignId}`, { method: 'DELETE' })
        if (!res.ok) return
        onCampaignDeleted(campaignId)
    }

    async function addMission() {
        setAddingMission(true)
        try {
            const nextSeq = missions.length + 1
            const missionName = `${campaign.name} ${toRoman(nextSeq)}`
            const res = await fetch('/api/operations/campaign-missions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaignId, name: missionName, sequence: nextSeq }),
            })
            const data = await res.json()
            if (data.mission) {
                onMissionsChange(campaignId, [...missions, data.mission])
            }
        } finally { setAddingMission(false) }
    }

    async function normalise() {
        setNormalising(true)
        try {
            const res = await fetch(`/api/operations/campaigns/${campaignId}/normalise`, { method: 'POST' })
            if (!res.ok) return
            // Refresh campaign missions and all operations
            const mRes = await fetch(`/api/operations/campaign-missions?campaignId=${campaignId}`)
            const mData = await mRes.json()
            onMissionsChange(campaignId, mData.missions ?? [])
            onRefreshOps?.()
        } finally { setNormalising(false) }
    }

    async function updateCampaignStatus(newStatus: string | null) {
        setStatusUpdating(true)
        try {
            await fetch('/api/operations/campaigns', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: campaignId, status: newStatus }),
            })
            onCampaignStatusChanged?.(campaignId, newStatus)
        } finally { setStatusUpdating(false) }
    }

    // Determine if all linked ops are completed (for the completion prompt)
    const campaignMissionIds = new Set(missions.map(m => m._id?.toString()).filter(Boolean) as string[])
    const linkedOps = allOperations.filter(op =>
        op.campaignId?.toString() === campaignId ||
        (op.campaignMissionId && campaignMissionIds.has(op.campaignMissionId))
    )
    const allOpsCompleted = linkedOps.length > 0 && linkedOps.every(op => op.status === 'Completed')
    const showCompletionPrompt = open && allOpsCompleted && !campaign.status && !completionPromptDismissed

    function handleUnlinkSlot(mission: CampaignMission, slot: 'saturday' | 'sunday') {
        const mId = mission._id?.toString() ?? ''
        fetch(`/api/operations/campaign-missions/${mId}/link?daySlot=${slot}`, { method: 'DELETE' })
            .then(() => {
                const updated = missions.map(m =>
                    m._id?.toString() === mId
                        ? { ...m, [slot === 'saturday' ? 'saturdayOpId' : 'sundayOpId']: undefined }
                        : m
                )
                onMissionsChange(campaignId, updated)
            })
    }

    function handleLinked(mission: CampaignMission, opId: string, op: Operation) {
        const mId = mission._id?.toString() ?? ''
        const slot = addDaySlot?.slot ?? 'saturday'
        const updated = missions.map(m =>
            m._id?.toString() === mId
                ? { ...m, [slot === 'saturday' ? 'saturdayOpId' : 'sundayOpId']: opId }
                : m
        )
        onMissionsChange(campaignId, updated)
        setAddDaySlot(null)
    }

    const satOp = addDaySlot
        ? (addDaySlot.mission.saturdayOpId ? allOperations.find(o => o._id.toString() === addDaySlot.mission.saturdayOpId) : null)
        : null

    return (
        <>
            <div style={{ border: '1px solid rgba(100,150,237,0.18)', borderTop: '2px solid rgba(100,150,237,0.5)', background: 'rgba(100,150,237,0.05)', marginBottom: 12 }}>
                {/* Campaign header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: open ? '1px solid rgba(100,150,237,0.1)' : 'none', flexWrap: 'wrap' }}>
                    <button onClick={() => setOpen(o => !o)} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.35)', display: 'flex' }}>
                        {open ? <ExpandLess style={{ fontSize: 16 }} /> : <ExpandMore style={{ fontSize: 16 }} />}
                    </button>

                    {editing ? (
                        <input
                            autoFocus value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onBlur={saveName}
                            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditing(false) }}
                            style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(100,150,237,0.4)', color: '#ededed', fontSize: '0.82rem', fontWeight: 700, padding: '2px 8px', outline: 'none', fontFamily: 'inherit', opacity: saving ? 0.5 : 1 }}
                        />
                    ) : (
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <button onClick={() => { setEditName(campaign.name); setEditing(true) }} title='Click to rename' style={{ all: 'unset', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(100,150,237,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {campaign.name}
                            </button>
                            {campaignDateRange && (
                                <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.28)', letterSpacing: '0.04em' }}>{campaignDateRange}</span>
                            )}
                        </div>
                    )}

                    <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.06em' }}>
                        {totalMissions} mission{totalMissions !== 1 ? 's' : ''}
                    </span>

                    {/* Status selector */}
                    <select
                        value={campaign.status ?? ''}
                        onChange={e => updateCampaignStatus(e.target.value || null)}
                        disabled={statusUpdating}
                        title='Set campaign status'
                        style={{
                            background: 'rgba(0,0,0,0.35)',
                            border: `1px solid ${STATUS_BORDER[campaign.status ?? ''] ?? 'rgba(255,255,255,0.12)'}`,
                            color: STATUS_COLORS[campaign.status ?? ''] ?? 'rgba(237,237,237,0.3)',
                            fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                            padding: '2px 5px', cursor: statusUpdating ? 'not-allowed' : 'pointer',
                            outline: 'none', fontFamily: 'inherit', flexShrink: 0,
                        }}
                    >
                        <option value=''>Auto</option>
                        <option value='In Development'>In Development</option>
                        <option value='Upcoming'>Upcoming</option>
                        <option value='Active'>Active</option>
                        <option value='Completed'>Completed</option>
                    </select>

                    <button onClick={() => setConfirmDelete(true)} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(219,0,29,0.35)', display: 'flex', transition: 'color 0.15s' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.8)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.35)')}>
                        <Delete style={{ fontSize: 15 }} />
                    </button>
                </div>

                {/* All missions completed — prompt to mark campaign complete */}
                {showCompletionPrompt && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', background: 'rgba(100,150,237,0.07)', borderBottom: '1px solid rgba(100,150,237,0.12)' }}>
                        <span style={{ flex: 1, fontSize: '0.68rem', color: 'rgba(100,150,237,0.85)' }}>
                            All missions in this campaign are completed. Mark the campaign as completed?
                        </span>
                        <button onClick={() => { updateCampaignStatus('Completed'); setCompletionPromptDismissed(true) }} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 10px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.35)', color: 'rgba(16,185,129,0.9)', flexShrink: 0 }}>
                            Yes, complete
                        </button>
                        <button onClick={() => setCompletionPromptDismissed(true)} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', flexShrink: 0, padding: '3px 6px' }}>
                            Not yet
                        </button>
                    </div>
                )}

                {open && (
                    <div style={{ padding: '8px 8px 4px' }}>
                        {missions.map(m => (
                            <CampaignMissionRow
                                key={m._id?.toString() ?? m.name}
                                mission={m}
                                allOperations={allOperations}
                                onAddSlot={(mission, slot) => setAddDaySlot({ mission, slot })}
                                onUnlinkSlot={handleUnlinkSlot}
                                onMissionRenamed={(id, name) => onMissionsChange(campaignId, missions.map(x => x._id?.toString() === id ? { ...x, name } : x))}
                                onMissionDeleted={id => onMissionsChange(campaignId, missions.filter(x => x._id?.toString() !== id))}
                            />
                        ))}

                        {/* Virtual mission groups derived from ops with campaignId but no campaignMissionId */}
                        <VirtualMissionGroups campaignId={campaignId} allOperations={allOperations} />

                        {missions.length === 0 && allOperations.filter(o => o.campaignId?.toString() === campaignId && !o.campaignMissionId && !o.isSingleMission).length === 0 && (
                            <Typography style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.2)', padding: '8px 6px', fontStyle: 'italic' }}>No missions yet.</Typography>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                            <button
                                onClick={addMission}
                                disabled={addingMission}
                                style={{
                                    all: 'unset', cursor: addingMission ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '6px 12px',
                                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                    color: addingMission ? 'rgba(100,150,237,0.3)' : 'rgba(100,150,237,0.6)',
                                    transition: 'color 0.15s',
                                }}
                                onMouseEnter={e => { if (!addingMission) e.currentTarget.style.color = 'rgba(100,150,237,0.9)' }}
                                onMouseLeave={e => { if (!addingMission) e.currentTarget.style.color = 'rgba(100,150,237,0.6)' }}
                            >
                                <Add style={{ fontSize: 13 }} />{addingMission ? 'Adding…' : '+ Add Mission'}
                            </button>
                            {unlinkedOps.length > 0 && (
                                <button
                                    onClick={normalise}
                                    disabled={normalising}
                                    title={`Auto-group ${unlinkedOps.length} unlinked op${unlinkedOps.length !== 1 ? 's' : ''} into mission hierarchy`}
                                    style={{
                                        all: 'unset', cursor: normalising ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        padding: '4px 10px',
                                        fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                        color: normalising ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.7)',
                                        border: '1px solid rgba(16,185,129,0.25)',
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={e => { if (!normalising) { e.currentTarget.style.color = 'rgba(16,185,129,1)'; e.currentTarget.style.borderColor = 'rgba(16,185,129,0.5)' } }}
                                    onMouseLeave={e => { if (!normalising) { e.currentTarget.style.color = 'rgba(16,185,129,0.7)'; e.currentTarget.style.borderColor = 'rgba(16,185,129,0.25)' } }}
                                >
                                    {normalising ? 'Grouping…' : `⟳ Auto-group ${unlinkedOps.length} op${unlinkedOps.length !== 1 ? 's' : ''}`}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {confirmDelete && (
                <ConfirmDialog open danger title='Delete Campaign' message={`Are you sure you want to delete "${campaign.name}"? You can restore it from View Deleted.`}
                    onConfirm={() => { setConfirmDelete(false); deleteCampaign() }}
                    onCancel={() => setConfirmDelete(false)} />
            )}

            {addDaySlot && (
                <AddDaySlotModal
                    mission={addDaySlot.mission}
                    daySlot={addDaySlot.slot}
                    saturdayOp={addDaySlot.slot === 'sunday' ? satOp : null}
                    onClose={() => setAddDaySlot(null)}
                    onLinked={handleLinked}
                />
            )}
        </>
    )
}

// ── Create campaign form ──────────────────────────────────────────────────────

function CreateCampaignForm({ onCreated }: { onCreated: (c: OperationCampaign) => void }) {
    const [name, setName] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    async function submit() {
        if (!name.trim()) { setError('Name required'); return }
        setSaving(true)
        try {
            const res = await fetch('/api/operations/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error ?? 'Failed'); return }
            onCreated({ _id: data.id, name: name.trim(), createdBy: '', createdAt: new Date().toISOString() })
            setName('')
            setError('')
        } catch { setError('Network error') }
        finally { setSaving(false) }
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <input
                value={name}
                onChange={e => { setName(e.target.value); setError('') }}
                onKeyDown={e => { if (e.key === 'Enter') submit() }}
                placeholder='New campaign name…'
                style={{
                    flex: 1, background: 'rgba(0,0,0,0.25)', border: `1px solid ${error ? 'rgba(219,0,29,0.5)' : 'rgba(100,150,237,0.2)'}`,
                    color: '#ededed', fontSize: '0.78rem', padding: '6px 10px', outline: 'none', fontFamily: 'inherit',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(100,150,237,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = error ? 'rgba(219,0,29,0.5)' : 'rgba(100,150,237,0.2)')}
            />
            {error && <span style={{ fontSize: '0.65rem', color: 'rgba(219,0,29,0.8)' }}>{error}</span>}
            <button
                onClick={submit}
                disabled={saving}
                style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                    padding: '6px 14px', cursor: saving ? 'not-allowed' : 'pointer',
                    background: 'rgba(100,150,237,0.12)', border: '1px solid rgba(100,150,237,0.35)', color: 'rgba(100,150,237,0.9)',
                }}
            >
                <Add style={{ fontSize: 13 }} />{saving ? 'Creating…' : 'Create Campaign'}
            </button>
        </div>
    )
}

// ── Campaign Organiser Modal ──────────────────────────────────────────────────

function detectDaySlot(title: string): { stripped: string; day: 'saturday' | 'sunday' | null } {
    const sat = title.match(/\s*[-–—]?\s*(sat|saturday)\s*$/i)
    if (sat) return { stripped: title.slice(0, title.length - sat[0].length).trim(), day: 'saturday' }
    const sun = title.match(/\s*[-–—]?\s*(sun|sunday)\s*$/i)
    if (sun) return { stripped: title.slice(0, title.length - sun[0].length).trim(), day: 'sunday' }
    return { stripped: title, day: null }
}
function detectRomanSuffix(title: string): { stripped: string; roman: string | null } {
    const m = title.match(/\s+(I{1,3}|IV|VI{0,3}|IX|X)\s*$/i)
    if (m) return { stripped: title.slice(0, title.length - m[0].length).trim(), roman: m[1].toUpperCase() }
    return { stripped: title, roman: null }
}
function makeTempId() { return Math.random().toString(36).slice(2, 10) }

interface OrgMission { tempId: string; name: string; saturday: Operation | null; sunday: Operation | null; standalone: Operation | null; isSingleEvent?: boolean }
interface OrgGroup { tempId: string; name: string; missions: OrgMission[]; selected: boolean; startDate: string; endDate: string; dateOverridden: boolean }

function computeGroupDates(missions: OrgMission[]): { startDate: string; endDate: string } {
    const ts = missions.flatMap(m => [m.saturday?.date, m.sunday?.date, m.standalone?.date])
        .filter(Boolean).map(d => new Date(d!).getTime())
    if (ts.length === 0) return { startDate: '', endDate: '' }
    const fmt = (t: number) => new Date(t).toISOString().split('T')[0]
    return { startDate: fmt(Math.min(...ts)), endDate: fmt(Math.max(...ts)) }
}

function buildOrgGroups(allOps: Operation[], _existingCampaigns: OperationCampaign[]): { groups: OrgGroup[]; unassigned: Operation[] } {
    // Only include ops with no campaign assignment (excludes ops from active AND deleted campaigns)
    const pool = allOps.filter(op =>
        !op.isSingleMission &&
        !op.campaignId
    )

    const analysed = pool.map(op => {
        const { stripped: withoutDay, day } = detectDaySlot(op.title)
        const { stripped: campaignBase } = detectRomanSuffix(withoutDay)
        return { op, day, missionKey: withoutDay.toLowerCase(), campaignKey: campaignBase.toLowerCase(), campaignName: campaignBase }
    })

    const campaignMap = new Map<string, typeof analysed>()
    for (const a of analysed) {
        if (!campaignMap.has(a.campaignKey)) campaignMap.set(a.campaignKey, [])
        campaignMap.get(a.campaignKey)!.push(a)
    }

    const groups: OrgGroup[] = []
    const usedIds = new Set<string>()

    for (const [, items] of campaignMap) {
        const missionKeys = new Set(items.map(i => i.missionKey))
        const hasSatSun = items.some(i => i.day !== null)
        if (missionKeys.size < 2 && !hasSatSun) continue

        const missionMap = new Map<string, typeof items>()
        for (const item of items) {
            if (!missionMap.has(item.missionKey)) missionMap.set(item.missionKey, [])
            missionMap.get(item.missionKey)!.push(item)
        }

        const campaignName = items[0]?.campaignName ?? 'Campaign'
        const missions: OrgMission[] = []

        for (const [, mItems] of missionMap) {
            const sat = mItems.find(i => i.day === 'saturday')?.op ?? null
            const sun = mItems.find(i => i.day === 'sunday')?.op ?? null
            const standalone = mItems.find(i => i.day === null)?.op ?? null
            const missionName = (sat ?? sun ?? standalone)?.title
                .replace(/\s*[-–]?\s*(sat|saturday|sun|sunday)\s*$/i, '').trim() ?? ''
            missions.push({ tempId: makeTempId(), name: missionName, saturday: sat, sunday: sun, standalone })
            mItems.forEach(i => usedIds.add(i.op._id.toString()))
        }

        missions.sort((a, b) => {
            const t = (m: OrgMission) => new Date(m.saturday?.date ?? m.sunday?.date ?? m.standalone?.date ?? 0).getTime()
            return t(a) - t(b)
        })
        missions.forEach((m, i) => { m.name = `${campaignName} ${toRoman(i + 1)}` })
        const { startDate, endDate } = computeGroupDates(missions)
        groups.push({ tempId: makeTempId(), name: campaignName, missions, selected: false, startDate, endDate, dateOverridden: false })
    }

    const unassigned = pool.filter(op => !usedIds.has(op._id.toString()))
    return { groups: groups.sort((a, b) => a.name.localeCompare(b.name)), unassigned }
}

type DragItem =
    | { kind: 'mission'; groupId: string; missionId: string }
    | { kind: 'slot'; groupId: string; missionId: string; slot: 'saturday' | 'sunday' | 'standalone'; op: Operation }
    | { kind: 'unassigned'; op: Operation }

function AutoOrganiseModal({
    allOps, existingCampaigns, onClose, onOrganised,
}: {
    allOps: Operation[]
    existingCampaigns: OperationCampaign[]
    onClose: () => void
    onOrganised: (campaigns: OperationCampaign[], missionsMap: Record<string, CampaignMission[]>) => void
}) {
    const [groups, setGroups] = useState<OrgGroup[]>([])
    const [unassigned, setUnassigned] = useState<Operation[]>([])
    const [applying, setApplying] = useState(false)
    const [error, setError] = useState('')
    const [showConfirm, setShowConfirm] = useState(false)
    const [deletedCampaigns, setDeletedCampaigns] = useState<OperationCampaign[]>([])
    const [deletedMissions, setDeletedMissions] = useState<CampaignMission[]>([])
    const [deletedOps, setDeletedOps] = useState<(Operation & { deletedAt: Date; deletedByName?: string })[]>([])
    const [showDeletedView, setShowDeletedView] = useState(false)
    const [restoringCampaignId, setRestoringCampaignId] = useState<string | null>(null)
    const [restoringMissionId, setRestoringMissionId] = useState<string | null>(null)
    const [restoringOpId, setRestoringOpId] = useState<string | null>(null)
    const [confirmRemoveGroupId, setConfirmRemoveGroupId] = useState<string | null>(null)
    const [confirmRemoveMission, setConfirmRemoveMission] = useState<{ gId: string; mId: string } | null>(null)
    const [orgSearch, setOrgSearch] = useState('')
    const [markedSingleMissions, setMarkedSingleMissions] = useState<Operation[]>([])
    const [singleMissionError, setSingleMissionError] = useState<string | null>(null)
    // Drag state: stored in ref (avoids re-renders), dragOver state for visual feedback
    const dragRef = useRef<DragItem | null>(null)
    const [dragOver, setDragOver] = useState<string | null>(null) // target key

    useEffect(() => {
        const { groups: g, unassigned: u } = buildOrgGroups(allOps, existingCampaigns)
        setGroups(g)
        setUnassigned(u)
        // Load soft-deleted campaigns, missions, and operations (same sources as J2 bin view)
        fetch('/api/operations/campaigns?includeDeleted=true')
            .then(r => r.json())
            .then(d => setDeletedCampaigns((d.campaigns ?? []).filter((c: OperationCampaign) => c.isDeleted)))
        fetch('/api/operations/campaign-missions?includeDeleted=true')
            .then(r => r.json())
            .then(d => setDeletedMissions((d.missions ?? []).filter((m: CampaignMission) => m.isDeleted)))
        fetch('/api/operations/bin')
            .then(r => r.json())
            .then(d => setDeletedOps(d.operations ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    async function markSingleMission(opId: string) {
        setSingleMissionError(null)
        const op = unassigned.find(o => o._id.toString() === opId)
        try {
            const res = await fetch(`/api/operations/update?id=${opId}&isSingleMission=true`)
            if (!res.ok) {
                setSingleMissionError('Failed to mark as single mission — item kept in unassigned.')
                return
            }
            setUnassigned(u => u.filter(o => o._id.toString() !== opId))
            if (op) setMarkedSingleMissions(ms => [...ms, op])
        } catch {
            setSingleMissionError('Network error — item kept in unassigned.')
        }
    }

    async function restoreDeletedCampaign(campaignId: string) {
        setRestoringCampaignId(campaignId)
        try {
            await fetch('/api/operations/campaigns', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: campaignId, restore: true }),
            })
            setDeletedCampaigns(cs => cs.filter(c => c._id.toString() !== campaignId))
        } finally { setRestoringCampaignId(null) }
    }

    async function restoreDeletedMission(missionId: string) {
        setRestoringMissionId(missionId)
        try {
            await fetch(`/api/operations/campaign-missions/${missionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ restore: true }),
            })
            setDeletedMissions(ms => ms.filter(m => m._id?.toString() !== missionId))
        } finally { setRestoringMissionId(null) }
    }

    const selectedGroups = groups.filter(g => g.selected)

    const updGroup = (id: string, fn: (g: OrgGroup) => OrgGroup) =>
        setGroups(gs => gs.map(g => g.tempId === id ? fn(g) : g))
    const updMission = (gId: string, mId: string, fn: (m: OrgMission) => OrgMission) =>
        updGroup(gId, g => ({ ...g, missions: g.missions.map(m => m.tempId === mId ? fn(m) : m) }))

    // Auto-recompute dates when missions change, unless overridden
    function recheckDates(gs: OrgGroup[]): OrgGroup[] {
        return gs.map(g => {
            if (g.dateOverridden) return g
            const { startDate, endDate } = computeGroupDates(g.missions)
            return { ...g, startDate, endDate }
        })
    }
    const setGroupsWithDates = (fn: (gs: OrgGroup[]) => OrgGroup[]) =>
        setGroups(gs => recheckDates(fn(gs)))

    function unlinkOp(gId: string, mId: string, slot: 'saturday' | 'sunday' | 'standalone') {
        let freed: Operation | null = null
        setGroupsWithDates(gs => gs.map(g => g.tempId !== gId ? g : {
            ...g, missions: g.missions.map(m => {
                if (m.tempId !== mId) return m
                freed = m[slot]; return { ...m, [slot]: null }
            })
        }))
        if (freed) setUnassigned(u => [...u, freed!])
    }

    function removeGroup(gId: string) {
        setGroups(gs => gs.filter(x => x.tempId !== gId))
        // Ops are NOT returned to unassigned — they had no campaignId in DB
        // and will re-appear in the next organiser session automatically.
    }

    function removeMission(gId: string, mId: string) {
        setGroupsWithDates(gs => gs.map(g => g.tempId !== gId ? g : {
            ...g, missions: g.missions.filter(x => x.tempId !== mId)
        }))
        // Ops are NOT returned to unassigned.
    }

    function moveMissionBtn(gId: string, mId: string, dir: -1 | 1) {
        setGroupsWithDates(gs => gs.map(g => {
            if (g.tempId !== gId) return g
            const idx = g.missions.findIndex(m => m.tempId === mId)
            if (idx < 0 || idx + dir < 0 || idx + dir >= g.missions.length) return g
            const ms = [...g.missions];
            [ms[idx], ms[idx + dir]] = [ms[idx + dir], ms[idx]]
            return { ...g, missions: ms }
        }))
    }

    function addOpToGroup(op: Operation, gId: string) {
        const g = groups.find(x => x.tempId === gId)
        if (!g) return
        const { day } = detectDaySlot(op.title)
        const newM: OrgMission = { tempId: makeTempId(), name: `${g.name} ${toRoman(g.missions.length + 1)}`, saturday: day === 'saturday' ? op : null, sunday: day === 'sunday' ? op : null, standalone: day === null ? op : null }
        setGroupsWithDates(gs => gs.map(x => x.tempId !== gId ? x : { ...x, missions: [...x.missions, newM] }))
        setUnassigned(u => u.filter(o => o._id.toString() !== op._id.toString()))
    }

    // ── Drag helpers ──────────────────────────────────────────────────────────

    function handleMissionDragStart(e: React.DragEvent, groupId: string, missionId: string) {
        e.stopPropagation()
        dragRef.current = { kind: 'mission', groupId, missionId }
        e.dataTransfer.effectAllowed = 'move'
    }

    function handleSlotDragStart(e: React.DragEvent, groupId: string, missionId: string, slot: 'saturday' | 'sunday' | 'standalone', op: Operation) {
        e.stopPropagation()
        dragRef.current = { kind: 'slot', groupId, missionId, slot, op }
        e.dataTransfer.effectAllowed = 'move'
    }

    function handleUnassignedDragStart(e: React.DragEvent, op: Operation) {
        dragRef.current = { kind: 'unassigned', op }
        e.dataTransfer.effectAllowed = 'move'
    }

    // Drop on a campaign body — receive a mission (from another group or same group)
    function handleGroupDrop(e: React.DragEvent, targetGroupId: string) {
        e.preventDefault(); e.stopPropagation()
        setDragOver(null)
        const item = dragRef.current; dragRef.current = null
        if (!item) return

        if (item.kind === 'mission') {
            if (item.groupId === targetGroupId) return
            // Move mission from source to target group
            let moved: OrgMission | null = null
            setGroupsWithDates(gs => {
                const src = gs.find(g => g.tempId === item.groupId)
                moved = src?.missions.find(m => m.tempId === item.missionId) ?? null
                return gs.map(g => {
                    if (g.tempId === item.groupId) return { ...g, missions: g.missions.filter(m => m.tempId !== item.missionId) }
                    if (g.tempId === targetGroupId && moved) return { ...g, missions: [...g.missions, { ...moved, tempId: makeTempId() }] }
                    return g
                })
            })
        } else if (item.kind === 'unassigned') {
            addOpToGroup(item.op, targetGroupId)
        }
    }

    // Drop on a mission row (reorder or receive a slot)
    function handleMissionDrop(e: React.DragEvent, targetGroupId: string, targetMissionId: string) {
        e.preventDefault(); e.stopPropagation()
        setDragOver(null)
        const item = dragRef.current; dragRef.current = null
        if (!item) return

        if (item.kind === 'mission') {
            if (item.missionId === targetMissionId && item.groupId === targetGroupId) return
            setGroupsWithDates(gs => {
                let moved: OrgMission | null = null
                const cleaned = gs.map(g => {
                    if (g.tempId !== item.groupId) return g
                    moved = g.missions.find(m => m.tempId === item.missionId) ?? null
                    return { ...g, missions: g.missions.filter(m => m.tempId !== item.missionId) }
                })
                return cleaned.map(g => {
                    if (g.tempId !== targetGroupId || !moved) return g
                    if (item.groupId !== targetGroupId) {
                        // Cross-campaign: always append to bottom
                        return { ...g, missions: [...g.missions, { ...moved, tempId: makeTempId() }] }
                    }
                    // Same campaign: insert before target (reorder)
                    const tIdx = g.missions.findIndex(m => m.tempId === targetMissionId)
                    const ms = [...g.missions]
                    ms.splice(tIdx >= 0 ? tIdx : ms.length, 0, moved)
                    return { ...g, missions: ms }
                })
            })
        } else if (item.kind === 'slot' || item.kind === 'unassigned') {
            const op = item.kind === 'slot' ? item.op : item.op
            const { day } = detectDaySlot(op.title)
            const slot: 'saturday' | 'sunday' | 'standalone' = day === 'saturday' ? 'saturday' : day === 'sunday' ? 'sunday' : 'standalone'
            // If came from a slot, clear the source slot
            if (item.kind === 'slot') {
                setGroupsWithDates(gs => gs.map(g => g.tempId !== item.groupId ? g : {
                    ...g, missions: g.missions.map(m => m.tempId !== item.missionId ? m : { ...m, [item.slot]: null })
                }))
                setUnassigned(u => u.filter(o => o._id.toString() !== op._id.toString()))
            } else {
                setUnassigned(u => u.filter(o => o._id.toString() !== op._id.toString()))
            }
            setGroupsWithDates(gs => gs.map(g => g.tempId !== targetGroupId ? g : {
                ...g, missions: g.missions.map(m => m.tempId !== targetMissionId ? m : { ...m, [slot]: op })
            }))
        }
    }

    // Drop on a specific slot (SAT/SUN/OP zone)
    function handleSlotDrop(e: React.DragEvent, targetGroupId: string, targetMissionId: string, targetSlot: 'saturday' | 'sunday' | 'standalone') {
        e.preventDefault(); e.stopPropagation()
        setDragOver(null)
        const item = dragRef.current; dragRef.current = null
        if (!item || item.kind === 'mission') return

        const op = item.op
        // Clear from source
        if (item.kind === 'slot') {
            setGroupsWithDates(gs => gs.map(g => g.tempId !== item.groupId ? g : {
                ...g, missions: g.missions.map(m => m.tempId !== item.missionId ? m : { ...m, [item.slot]: null })
            }))
        } else { setUnassigned(u => u.filter(o => o._id.toString() !== op._id.toString())) }
        // Set target slot
        setGroupsWithDates(gs => gs.map(g => g.tempId !== targetGroupId ? g : {
            ...g, missions: g.missions.map(m => m.tempId !== targetMissionId ? m : { ...m, [targetSlot]: op })
        }))
    }

    function dvOver(e: React.DragEvent, key: string) { e.preventDefault(); setDragOver(key) }
    function dvLeave() { setDragOver(null) }

    // ── Apply ─────────────────────────────────────────────────────────────────

    async function applyOrganisation() {
        setApplying(true); setError('')
        try {
            const newCampaigns: OperationCampaign[] = []
            const newMissionsMap: Record<string, CampaignMission[]> = {}

            for (const group of selectedGroups) {
                const cRes = await fetch('/api/operations/campaigns', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: group.name, startDate: group.startDate || undefined, endDate: group.endDate || undefined })
                })
                const cData = await cRes.json()
                if (!cRes.ok) { setError(cData.error ?? 'Failed to create campaign'); setApplying(false); return }
                const campaignId = cData.id.toString()
                newCampaigns.push({ _id: cData.id, name: group.name, createdBy: '', createdAt: new Date().toISOString(), startDate: group.startDate, endDate: group.endDate })
                newMissionsMap[campaignId] = []

                for (let i = 0; i < group.missions.length; i++) {
                    const m = group.missions[i]
                    const mRes = await fetch('/api/operations/campaign-missions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId, name: m.name, sequence: i + 1 }) })
                    const mData = await mRes.json()
                    if (!mRes.ok) continue
                    const mId = mData.id.toString()
                    newMissionsMap[campaignId].push(mData.mission)
                    if (m.saturday) await fetch(`/api/operations/campaign-missions/${mId}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ daySlot: 'saturday', operationId: m.saturday._id.toString() }) })
                    if (m.sunday) await fetch(`/api/operations/campaign-missions/${mId}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ daySlot: 'sunday', operationId: m.sunday._id.toString() }) })
                    if (m.standalone) await fetch('/api/operations/campaigns/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: m.standalone._id.toString(), campaignId }) })
                }
            }
            onOrganised(newCampaigns, newMissionsMap)
        } catch { setError('Network error') }
        finally { setApplying(false) }
    }

    // ── Slot renderer ─────────────────────────────────────────────────────────

    function OpSlot({ gId, mId, slot, label, op, accent }: { gId: string; mId: string; slot: 'saturday' | 'sunday' | 'standalone'; label: string; op: Operation | null; accent: string }) {
        const dropKey = `slot:${gId}:${mId}:${slot}`
        const isDragTarget = dragOver === dropKey && !!dragRef.current && dragRef.current.kind !== 'mission'
        if (op) return (
            <div draggable onDragStart={e => handleSlotDragStart(e, gId, mId, slot, op)}
                onDragOver={e => dvOver(e, dropKey)} onDragLeave={dvLeave} onDrop={e => handleSlotDrop(e, gId, mId, slot)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: isDragTarget ? 'rgba(100,150,237,0.12)' : 'rgba(255,255,255,0.025)', border: `1px solid ${isDragTarget ? 'rgba(100,150,237,0.5)' : 'rgba(255,255,255,0.05)'}`, cursor: 'grab' }}>
                <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent, width: 26, flexShrink: 0 }}>{label}</span>
                <span style={{ flex: 1, fontSize: '0.68rem', color: 'rgba(237,237,237,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.title}</span>
                <span style={{ fontSize: '0.52rem', color: 'rgba(237,237,237,0.18)', flexShrink: 0 }}>{new Date(op.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                <button type='button' onClick={() => unlinkOp(gId, mId, slot)} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(219,0,29,0.25)', display: 'flex', flexShrink: 0 }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.7)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.25)')}><Close style={{ fontSize: 11 }} /></button>
            </div>
        )
        return (
            <div onDragOver={e => dvOver(e, dropKey)} onDragLeave={dvLeave} onDrop={e => handleSlotDrop(e, gId, mId, slot)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: isDragTarget ? 'rgba(100,150,237,0.1)' : 'rgba(255,255,255,0.01)', border: `1px dashed ${isDragTarget ? 'rgba(100,150,237,0.5)' : 'rgba(255,255,255,0.07)'}`, transition: 'all 0.1s' }}>
                <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: `${accent.replace(/[\d.]+\)$/, '0.35)')}`, width: 26, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.18)', fontStyle: 'italic' }}>Drop here</span>
            </div>
        )
    }

    const fmtDate = (iso: string) => {
        if (!iso) return ''
        const d = new Date(iso)
        return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    }

    const searchTerm = orgSearch.trim().toLowerCase()
    const filteredGroups = searchTerm
        ? groups.filter(g =>
            g.name.toLowerCase().includes(searchTerm) ||
            g.missions.some(m => m.name.toLowerCase().includes(searchTerm))
        )
        : groups
    const filteredUnassigned = searchTerm
        ? unassigned.filter(op => op.title.toLowerCase().includes(searchTerm))
        : unassigned

    const modalContent = (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9900, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 700, maxHeight: 'calc(100vh - 32px)', background: 'rgb(13,13,13)', border: '1px solid rgba(100,150,237,0.25)', borderTop: '2px solid rgba(100,150,237,0.6)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                    <div>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(100,150,237,0.8)' }}>Campaign Organiser</span>
                        <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>Drag missions and day slots into the correct campaign structure, then apply.</div>
                    </div>
                    <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.35)', display: 'flex' }}><Close style={{ fontSize: 18 }} /></button>
                </div>

                {/* Toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0, flexWrap: 'wrap' }}>
                    <button onClick={() => setGroups(gs => gs.map(g => ({ ...g, selected: true })))} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(100,150,237,0.7)', padding: '3px 8px', border: '1px solid rgba(100,150,237,0.2)' }}>Select All</button>
                    <button onClick={() => setGroups(gs => gs.map(g => ({ ...g, selected: false })))} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', padding: '3px 8px', border: '1px solid rgba(255,255,255,0.1)' }}>Deselect All</button>
                    <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)', margin: '0 2px' }} />
                    <button onClick={() => { const id = makeTempId(); setGroups(gs => [...gs, { tempId: id, name: 'New Campaign', missions: [], selected: true, startDate: '', endDate: '', dateOverridden: false }]) }} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(100,150,237,0.6)', padding: '3px 8px', border: '1px solid rgba(100,150,237,0.15)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Add style={{ fontSize: 11 }} />New Campaign
                    </button>
                    <button onClick={() => setShowDeletedView(true)} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.55)', padding: '3px 8px', border: '1px solid rgba(219,0,29,0.2)', display: 'flex', alignItems: 'center', gap: 4 }} onMouseEnter={e => { e.currentTarget.style.color = 'rgba(219,0,29,0.9)'; e.currentTarget.style.borderColor = 'rgba(219,0,29,0.45)' }} onMouseLeave={e => { e.currentTarget.style.color = 'rgba(219,0,29,0.55)'; e.currentTarget.style.borderColor = 'rgba(219,0,29,0.2)' }}>
                        <Delete style={{ fontSize: 11 }} />View Deleted{(deletedCampaigns.length + deletedMissions.length + deletedOps.length) > 0 ? ` (${deletedCampaigns.length + deletedMissions.length + deletedOps.length})` : ''}
                    </button>
                    {/* Search */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', padding: '2px 8px', flex: 1, minWidth: 120 }}>
                        <Search style={{ fontSize: 12, color: 'rgba(237,237,237,0.25)', flexShrink: 0 }} />
                        <input
                            value={orgSearch}
                            onChange={e => setOrgSearch(e.target.value)}
                            placeholder='Search campaigns, missions…'
                            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'rgba(237,237,237,0.7)', fontSize: '0.6rem', fontFamily: 'inherit' }}
                        />
                        {orgSearch && <button type='button' onClick={() => setOrgSearch('')} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.25)', display: 'flex' }}><Close style={{ fontSize: 11 }} /></button>}
                    </div>
                    <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.22)', flexShrink: 0 }}>{selectedGroups.length}/{groups.length} · {unassigned.length} unassigned</span>
                </div>

                {/* Body — normal organiser OR deleted view */}
                {showDeletedView ? (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <button type='button' onClick={() => setShowDeletedView(false)} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(100,150,237,0.7)', display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', border: '1px solid rgba(100,150,237,0.2)' }}>← Back to Organiser</button>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)' }}>Recycle Bin</span>
                        </div>

                        {deletedCampaigns.length === 0 && deletedMissions.length === 0 && deletedOps.length === 0 && (
                            <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(237,237,237,0.2)', fontSize: '0.72rem', fontStyle: 'italic' }}>Recycle bin is empty.</div>
                        )}

                        {deletedCampaigns.length > 0 && (
                            <>
                                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(100,150,237,0.5)', marginTop: 4 }}>Campaigns</div>
                                {deletedCampaigns.map(c => (
                                    <div key={c._id.toString()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid rgba(219,0,29,0.15)', background: 'rgba(219,0,29,0.03)' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(237,237,237,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                                            {c.deletedAt && <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.22)', marginTop: 2 }}>Deleted {new Date(c.deletedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
                                        </div>
                                        <button type='button' onClick={() => restoreDeletedCampaign(c._id.toString())} disabled={restoringCampaignId === c._id.toString()} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(16,185,129,0.75)', border: '1px solid rgba(16,185,129,0.25)', padding: '4px 12px', flexShrink: 0, transition: 'color 0.12s' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(16,185,129,1)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(16,185,129,0.75)')}>
                                            {restoringCampaignId === c._id.toString() ? 'Restoring…' : 'Restore'}
                                        </button>
                                    </div>
                                ))}
                            </>
                        )}

                        {deletedMissions.length > 0 && (
                            <>
                                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,160,0,0.5)', marginTop: 8 }}>Campaign Missions</div>
                                {deletedMissions.map(m => {
                                    const mId = m._id?.toString() ?? ''
                                    return (
                                        <div key={mId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid rgba(219,160,0,0.12)', background: 'rgba(219,160,0,0.02)' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(237,237,237,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                                                {m.deletedAt && <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.22)', marginTop: 2 }}>
                                                    Deleted {new Date(m.deletedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    {m.deletedByName && ` by ${m.deletedByName}`}
                                                </div>}
                                            </div>
                                            <button type='button' onClick={() => restoreDeletedMission(mId)} disabled={restoringMissionId === mId} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(16,185,129,0.75)', border: '1px solid rgba(16,185,129,0.25)', padding: '4px 12px', flexShrink: 0, transition: 'color 0.12s' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(16,185,129,1)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(16,185,129,0.75)')}>
                                                {restoringMissionId === mId ? 'Restoring…' : 'Restore'}
                                            </button>
                                        </div>
                                    )
                                })}
                            </>
                        )}

                        {deletedOps.length > 0 && (
                            <>
                                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginTop: 8 }}>Operations</div>
                                {deletedOps.map(op => {
                                    const opId = op._id.toString()
                                    const isRestoring = restoringOpId === opId
                                    return (
                                        <div key={opId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid rgba(219,0,29,0.12)', background: 'rgba(219,0,29,0.02)' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(237,237,237,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.title}</div>
                                                {op.deletedAt && <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.22)', marginTop: 2 }}>
                                                    Deleted {new Date(op.deletedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    {op.deletedByName && ` by ${op.deletedByName}`}
                                                </div>}
                                            </div>
                                            <button type='button' onClick={async () => {
                                                setRestoringOpId(opId)
                                                try {
                                                    const res = await fetch(`/api/operations/restore?id=${opId}`)
                                                    if (res.ok) setDeletedOps(ops => ops.filter(o => o._id.toString() !== opId))
                                                } finally { setRestoringOpId(null) }
                                            }} disabled={isRestoring} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(16,185,129,0.75)', border: '1px solid rgba(16,185,129,0.25)', padding: '4px 12px', flexShrink: 0, transition: 'color 0.12s' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(16,185,129,1)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(16,185,129,0.75)')}>
                                                {isRestoring ? 'Restoring…' : 'Restore'}
                                            </button>
                                        </div>
                                    )
                                })}
                            </>
                        )}
                    </div>
                ) : null}

                {/* Body */}
                {!showDeletedView && (
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {groups.length === 0 && unassigned.length === 0 && <div style={{ padding: '32px 0', textAlign: 'center', color: 'rgba(237,237,237,0.2)', fontSize: '0.75rem', fontStyle: 'italic' }}>No operations available to organise.</div>}
                    {searchTerm && filteredGroups.length === 0 && filteredUnassigned.length === 0 && groups.length > 0 && <div style={{ padding: '16px 0', textAlign: 'center', color: 'rgba(237,237,237,0.2)', fontSize: '0.72rem', fontStyle: 'italic' }}>No results for "{orgSearch}".</div>}

                    {filteredGroups.map(group => {
                        const groupDropKey = `group:${group.tempId}`
                        const isGroupTarget = dragOver === groupDropKey
                        return (
                            <div key={group.tempId}
                                onDragOver={e => dvOver(e, groupDropKey)} onDragLeave={dvLeave} onDrop={e => handleGroupDrop(e, group.tempId)}
                                style={{ border: `1px solid ${isGroupTarget ? 'rgba(100,150,237,0.55)' : group.selected ? 'rgba(100,150,237,0.28)' : 'rgba(255,255,255,0.06)'}`, background: isGroupTarget ? 'rgba(100,150,237,0.07)' : group.selected ? 'rgba(100,150,237,0.03)' : 'transparent', transition: 'all 0.1s' }}>

                                {/* Campaign header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap' }}>
                                    <input type='checkbox' checked={group.selected} onChange={e => updGroup(group.tempId, g => ({ ...g, selected: e.target.checked }))} style={{ accentColor: 'rgba(100,150,237,0.9)', cursor: 'pointer', width: 14, height: 14, flexShrink: 0 }} />
                                    <input value={group.name} onChange={e => updGroup(group.tempId, g => ({ ...g, name: e.target.value }))} style={{ flex: 1, minWidth: 100, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(100,150,237,0.2)', color: 'rgba(237,237,237,0.9)', fontSize: '0.8rem', fontWeight: 700, padding: '1px 4px', outline: 'none', fontFamily: 'inherit' }} />
                                    {/* Date range */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                        <input type='date' value={group.startDate} onChange={e => updGroup(group.tempId, g => ({ ...g, startDate: e.target.value, dateOverridden: true }))}
                                            style={{ background: 'rgba(100,150,237,0.06)', border: '1px solid rgba(100,150,237,0.15)', color: 'rgba(100,150,237,0.65)', fontSize: '0.58rem', padding: '2px 4px', outline: 'none', fontFamily: 'inherit', colorScheme: 'dark', width: 108 }} />
                                        <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.2)' }}>→</span>
                                        <input type='date' value={group.endDate} onChange={e => updGroup(group.tempId, g => ({ ...g, endDate: e.target.value, dateOverridden: true }))}
                                            style={{ background: 'rgba(100,150,237,0.06)', border: '1px solid rgba(100,150,237,0.15)', color: 'rgba(100,150,237,0.65)', fontSize: '0.58rem', padding: '2px 4px', outline: 'none', fontFamily: 'inherit', colorScheme: 'dark', width: 108 }} />
                                        {group.dateOverridden && (
                                            <button type='button' title='Reset to auto-detect' onClick={() => { const { startDate, endDate } = computeGroupDates(group.missions); updGroup(group.tempId, g => ({ ...g, startDate, endDate, dateOverridden: false })) }} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.55rem', color: 'rgba(237,237,237,0.25)' }}>↺</button>
                                        )}
                                    </div>
                                    <span style={{ fontSize: '0.56rem', color: 'rgba(237,237,237,0.22)', flexShrink: 0 }}>{group.missions.length}m</span>
                                    <button type='button' onClick={() => setConfirmRemoveGroupId(group.tempId)} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(219,0,29,0.22)', display: 'flex', flexShrink: 0 }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.75)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.22)')}><Delete style={{ fontSize: 14 }} /></button>
                                </div>

                                {/* Missions */}
                                <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    {group.missions.map((mission, mIdx) => {
                                        const mDropKey = `mission:${group.tempId}:${mission.tempId}`
                                        const isMDrop = dragOver === mDropKey
                                        return (
                                            <div key={mission.tempId}
                                                draggable onDragStart={e => handleMissionDragStart(e, group.tempId, mission.tempId)}
                                                onDragOver={e => dvOver(e, mDropKey)} onDragLeave={dvLeave} onDrop={e => handleMissionDrop(e, group.tempId, mission.tempId)}
                                                style={{ borderTop: `2px solid ${isMDrop ? 'rgba(16,185,129,0.7)' : 'transparent'}`, borderRight: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)', borderLeft: '1px solid rgba(255,255,255,0.04)', background: isMDrop ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.01)', padding: '5px 8px', display: 'flex', flexDirection: 'column', gap: 4, cursor: 'grab', transition: 'all 0.1s' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                                                        <button type='button' onClick={() => moveMissionBtn(group.tempId, mission.tempId, -1)} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.18)', lineHeight: 1, fontSize: '0.5rem', transition: 'color 0.1s' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(16,185,129,0.85)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.18)')}>▲</button>
                                                        <button type='button' onClick={() => moveMissionBtn(group.tempId, mission.tempId, 1)} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.18)', lineHeight: 1, fontSize: '0.5rem', transition: 'color 0.1s' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(16,185,129,0.85)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.18)')}>▼</button>
                                                    </div>
                                                    <span style={{ fontSize: '0.58rem', color: 'rgba(100,150,237,0.55)', fontWeight: 700, width: 20, flexShrink: 0 }}>{toRoman(mIdx + 1)}</span>
                                                    <input value={mission.name} onChange={e => updMission(group.tempId, mission.tempId, m => ({ ...m, name: e.target.value }))} onClick={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(237,237,237,0.7)', fontSize: '0.72rem', padding: '1px 3px', outline: 'none', fontFamily: 'inherit', cursor: 'text' }} />
                                                    {/* Mark as Single Event — applies to the whole mission block */}
                                                    {mission.isSingleEvent ? (
                                                        <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(219,160,0,0.8)', border: '1px solid rgba(219,160,0,0.3)', padding: '1px 5px', flexShrink: 0, whiteSpace: 'nowrap' }}>Single Event</span>
                                                    ) : (
                                                        <button type='button' onClick={async e => {
                                                            e.stopPropagation()
                                                            // Mark all ops in this mission as isSingleMission
                                                            const ops = [mission.saturday, mission.sunday, mission.standalone].filter(Boolean) as Operation[]
                                                            await Promise.all(ops.map(op => fetch(`/api/operations/update?id=${op._id.toString()}&isSingleMission=true`)))
                                                            updMission(group.tempId, mission.tempId, m => ({ ...m, isSingleEvent: true }))
                                                        }} title='Mark as Single Event — excludes from campaign organiser' style={{ all: 'unset', cursor: 'pointer', fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(219,160,0,0.4)', border: '1px solid rgba(219,160,0,0.15)', padding: '1px 5px', flexShrink: 0, whiteSpace: 'nowrap' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,160,0,0.85)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,160,0,0.4)')}>Single Event</button>
                                                    )}
                                                    <button type='button' onClick={() => setConfirmRemoveMission({ gId: group.tempId, mId: mission.tempId })} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(219,0,29,0.18)', display: 'flex', flexShrink: 0 }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.65)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.18)')}><Close style={{ fontSize: 12 }} /></button>
                                                </div>
                                                <div style={{ paddingLeft: 30, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                    <OpSlot gId={group.tempId} mId={mission.tempId} slot='saturday' label='SAT' op={mission.saturday} accent='rgba(219,160,0,0.7)' />
                                                    <OpSlot gId={group.tempId} mId={mission.tempId} slot='sunday' label='SUN' op={mission.sunday} accent='rgba(100,150,237,0.7)' />
                                                    <OpSlot gId={group.tempId} mId={mission.tempId} slot='standalone' label='OP' op={mission.standalone} accent='rgba(237,237,237,0.4)' />
                                                </div>
                                            </div>
                                        )
                                    })}
                                    <button type='button' onClick={() => setGroupsWithDates(gs => gs.map(g => g.tempId !== group.tempId ? g : { ...g, missions: [...g.missions, { tempId: makeTempId(), name: `${g.name} ${toRoman(g.missions.length + 1)}`, saturday: null, sunday: null, standalone: null }] }))} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(100,150,237,0.35)', display: 'flex', alignItems: 'center', gap: 3, padding: '3px 0' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(100,150,237,0.75)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(100,150,237,0.35)')}><Add style={{ fontSize: 11 }} />Add Mission</button>
                                </div>
                            </div>
                        )
                    })}

                    {singleMissionError && (
                        <div style={{ padding: '8px 12px', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.3)', fontSize: '0.68rem', color: 'rgba(219,0,29,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span>{singleMissionError}</span>
                            <button type='button' onClick={() => setSingleMissionError(null)} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(219,0,29,0.5)', display: 'flex' }}><Close style={{ fontSize: 13 }} /></button>
                        </div>
                    )}

                    {markedSingleMissions.length > 0 && (
                        <div style={{ border: '1px solid rgba(219,160,0,0.18)', borderTop: '2px solid rgba(219,160,0,0.45)', background: 'rgba(219,160,0,0.03)' }}>
                            <div style={{ padding: '5px 12px', borderBottom: '1px solid rgba(219,160,0,0.1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,160,0,0.65)' }}>Marked as Single Missions</span>
                                <span style={{ fontSize: '0.55rem', color: 'rgba(219,160,0,0.4)' }}>— will appear in J2 Dashboard after closing</span>
                            </div>
                            <div style={{ padding: '5px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {markedSingleMissions.map(op => (
                                    <div key={op._id.toString()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', background: 'rgba(219,160,0,0.04)', border: '1px solid rgba(219,160,0,0.1)' }}>
                                        <span style={{ fontSize: '0.62rem', color: 'rgba(219,160,0,0.75)', letterSpacing: '0.04em', flexShrink: 0 }}>★</span>
                                        <span style={{ flex: 1, fontSize: '0.7rem', color: 'rgba(237,237,237,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.title}</span>
                                        <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.2)', flexShrink: 0 }}>{new Date(op.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {(filteredUnassigned.length > 0 || (!searchTerm && unassigned.length > 0)) && (
                        <>
                        {/* Drop zones: Create New Single Mission / Create New Campaign */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                            <div
                                onDragOver={e => dvOver(e, 'new-single')}
                                onDragLeave={dvLeave}
                                onDrop={e => {
                                    e.preventDefault(); setDragOver(null)
                                    const item = dragRef.current; dragRef.current = null
                                    if (!item || item.kind !== 'unassigned') return
                                    markSingleMission(item.op._id.toString())
                                }}
                                style={{
                                    flex: 1, padding: '8px 10px', textAlign: 'center',
                                    border: `2px dashed ${dragOver === 'new-single' ? 'rgba(219,160,0,0.7)' : 'rgba(219,160,0,0.2)'}`,
                                    background: dragOver === 'new-single' ? 'rgba(219,160,0,0.07)' : 'rgba(219,160,0,0.01)',
                                    transition: 'all 0.1s', cursor: 'default',
                                }}
                            >
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: dragOver === 'new-single' ? 'rgba(219,160,0,0.9)' : 'rgba(219,160,0,0.5)' }}>
                                    + Single Mission
                                </div>
                                <div style={{ fontSize: '0.52rem', color: 'rgba(219,160,0,0.35)', marginTop: 2 }}>Drag here to mark as standalone</div>
                            </div>
                            <div
                                onDragOver={e => dvOver(e, 'new-campaign')}
                                onDragLeave={dvLeave}
                                onDrop={e => {
                                    e.preventDefault(); setDragOver(null)
                                    const item = dragRef.current; dragRef.current = null
                                    if (!item || item.kind !== 'unassigned') return
                                    const op = item.op
                                    const { stripped: withoutDay, day } = detectDaySlot(op.title)
                                    const { stripped: campaignBase } = detectRomanSuffix(withoutDay)
                                    const newCampaignName = campaignBase || op.title
                                    const newM: OrgMission = { tempId: makeTempId(), name: `${newCampaignName} I`, saturday: day === 'saturday' ? op : null, sunday: day === 'sunday' ? op : null, standalone: day === null ? op : null }
                                    const { startDate, endDate } = computeGroupDates([newM])
                                    const newGroup: OrgGroup = { tempId: makeTempId(), name: newCampaignName, missions: [newM], selected: true, startDate, endDate, dateOverridden: false }
                                    setGroupsWithDates(gs => [...gs, newGroup])
                                    setUnassigned(u => u.filter(o => o._id.toString() !== op._id.toString()))
                                }}
                                style={{
                                    flex: 1, padding: '8px 10px', textAlign: 'center',
                                    border: `2px dashed ${dragOver === 'new-campaign' ? 'rgba(100,150,237,0.7)' : 'rgba(100,150,237,0.2)'}`,
                                    background: dragOver === 'new-campaign' ? 'rgba(100,150,237,0.07)' : 'rgba(100,150,237,0.01)',
                                    transition: 'all 0.1s', cursor: 'default',
                                }}
                            >
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: dragOver === 'new-campaign' ? 'rgba(100,150,237,0.9)' : 'rgba(100,150,237,0.5)' }}>
                                    + New Campaign
                                </div>
                                <div style={{ fontSize: '0.52rem', color: 'rgba(100,150,237,0.35)', marginTop: 2 }}>Drag here to start a new campaign</div>
                            </div>
                        </div>

                        <div style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.28)' }}>Unassigned — drag into a campaign or use dropdown</div>
                            <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {filteredUnassigned.map(op => (
                                    <div key={op._id.toString()} draggable onDragStart={e => handleUnassignedDragStart(e, op)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: 'grab', border: '1px solid rgba(255,255,255,0.03)', background: 'rgba(255,255,255,0.01)' }}>
                                        <span style={{ flex: 1, fontSize: '0.7rem', color: 'rgba(237,237,237,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.title}</span>
                                        <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.18)', flexShrink: 0 }}>{new Date(op.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                        {groups.length > 0 && <select value='' onChange={e => { if (e.target.value) addOpToGroup(op, e.target.value) }} style={{ background: 'rgba(100,150,237,0.08)', border: '1px solid rgba(100,150,237,0.18)', color: 'rgba(100,150,237,0.65)', fontSize: '0.58rem', padding: '2px 4px', cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}><option value=''>+ Add to…</option>{groups.map(g => <option key={g.tempId} value={g.tempId}>{g.name}</option>)}</select>}
                                        <button type='button' onClick={() => markSingleMission(op._id.toString())} title='Mark as single mission (exclude from future organiser)' style={{ all: 'unset', cursor: 'pointer', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(219,160,0,0.55)', border: '1px solid rgba(219,160,0,0.2)', padding: '1px 5px', flexShrink: 0, whiteSpace: 'nowrap' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,160,0,0.9)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,160,0,0.55)')}>Single</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        </>
                    )}

                </div>
                )}

                {/* Footer */}
                <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {error && <span style={{ fontSize: '0.68rem', color: 'rgba(219,0,29,0.8)', flex: 1 }}>{error}</span>}
                    {!error && <span style={{ flex: 1, fontSize: '0.6rem', color: 'rgba(237,237,237,0.28)' }}>{selectedGroups.length} group{selectedGroups.length !== 1 ? 's' : ''} selected</span>}
                    <button onClick={onClose} style={{ padding: '6px 14px', fontSize: '0.68rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}>CANCEL</button>
                    <button onClick={() => { if (selectedGroups.length > 0) { setError(''); setShowConfirm(true) } else setError('Select at least one group to apply.') }} style={{ padding: '6px 14px', fontSize: '0.68rem', fontWeight: 700, background: 'rgba(100,150,237,0.12)', border: '1px solid rgba(100,150,237,0.35)', color: 'rgba(100,150,237,0.9)', cursor: 'pointer' }}>
                        Apply Organisation →
                    </button>
                </div>
            </div>

            {confirmRemoveGroupId && (
                <ConfirmDialog open title='Remove Campaign Group'
                    message='Remove this campaign group from the organiser? Operations will not be lost — they will re-appear in the next organiser session.'
                    onConfirm={() => { removeGroup(confirmRemoveGroupId); setConfirmRemoveGroupId(null) }}
                    onCancel={() => setConfirmRemoveGroupId(null)} />
            )}
            {confirmRemoveMission && (
                <ConfirmDialog open title='Remove Mission'
                    message='Remove this mission from the group? Operations will not be lost — they will re-appear in the next organiser session.'
                    onConfirm={() => { removeMission(confirmRemoveMission.gId, confirmRemoveMission.mId); setConfirmRemoveMission(null) }}
                    onCancel={() => setConfirmRemoveMission(null)} />
            )}

            {/* Confirmation modal */}
            {showConfirm && (

                <div onClick={() => setShowConfirm(false)} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'rgb(18,18,18)', border: '1px solid var(--line-2)', padding: '22px 24px', maxWidth: 440, width: '100%', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.95)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(237,237,237,0.9)' }}>Apply campaign organisation?</div>
                        <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.65 }}>
                            This will create {selectedGroups.length} campaign{selectedGroups.length !== 1 ? 's' : ''} and link the operations into the campaign hierarchy.
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                            {selectedGroups.map(g => (
                                <div key={g.tempId} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <span style={{ fontSize: '0.7rem', color: 'rgba(100,150,237,0.8)', fontWeight: 700 }}>{g.name} — {g.missions.length} mission{g.missions.length !== 1 ? 's' : ''}</span>
                                    {(g.startDate || g.endDate) && <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)' }}>{fmtDate(g.startDate)} → {fmtDate(g.endDate)}</span>}
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowConfirm(false)} style={{ padding: '7px 16px', fontSize: '0.7rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.45)', cursor: 'pointer' }}>CANCEL</button>
                            <button onClick={() => { setShowConfirm(false); applyOrganisation() }} disabled={applying} style={{ padding: '7px 16px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.35)', color: 'rgba(219,0,29,0.85)', cursor: applying ? 'not-allowed' : 'pointer' }}>
                                {applying ? 'Applying…' : 'Confirm & Apply'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
    return typeof document === 'undefined' ? modalContent : createPortal(modalContent, document.body)
}

// ── Templates management section ──────────────────────────────────────────────

function TemplatesSection({ refreshKey }: { refreshKey: number }) {
    const [open, setOpen] = useState(true)
    const [templates, setTemplates] = useState<OperationTemplate[]>([])
    const [loading, setLoading] = useState(false)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return
        setLoading(true)
        fetch('/api/operations/templates')
            .then(r => r.json())
            .then(data => setTemplates(data.templates ?? []))
            .finally(() => setLoading(false))
    }, [open, refreshKey])

    async function deleteTemplate(id: string) {
        await fetch(`/api/operations/templates?id=${id}`, { method: 'DELETE' })
        setTemplates(ts => ts.filter(t => t._id.toString() !== id))
    }

    return (
        <div style={{ border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.01)', marginTop: 16 }}>
            <button onClick={() => setOpen(o => !o)} style={{ all: 'unset', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: open ? '1px solid rgba(219,0,29,0.12)' : 'none' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)' }}>Manage Templates</span>
                <span style={{ color: 'rgba(237,237,237,0.3)', display: 'flex' }}>{open ? <ExpandLess style={{ fontSize: 16 }} /> : <ExpandMore style={{ fontSize: 16 }} />}</span>
            </button>
            {open && (
                <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {loading && <Typography style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.3)' }}>Loading…</Typography>}
                    {!loading && templates.length === 0 && <Typography style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No templates yet — use the bookmark icon on any mission row to save one.</Typography>}
                    {templates.map(t => {
                        const tid = t._id.toString()
                        return (
                            <div key={tid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(237,237,237,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                                    <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>
                                        {t.sections?.length ?? 0} section{(t.sections?.length ?? 0) !== 1 ? 's' : ''} · {new Date(t.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </div>
                                </div>
                                <button onClick={() => setConfirmDeleteId(tid)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(219,0,29,0.22)', display: 'flex', transition: 'color 0.15s' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.85)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.22)')}>
                                    <Delete style={{ fontSize: 15 }} />
                                </button>
                            </div>
                        )
                    })}
                    {confirmDeleteId && (
                        <ConfirmDialog open title='Delete Template' message={`Delete template "${templates.find(t => t._id.toString() === confirmDeleteId)?.name}"?`}
                            onConfirm={() => { deleteTemplate(confirmDeleteId); setConfirmDeleteId(null) }}
                            onCancel={() => setConfirmDeleteId(null)} />
                    )}
                </div>
            )}
        </div>
    )
}


// ── Main tab ───────────────────────────────────────────────────────────────────

export default function J2OperationsTab({ isJ4 = false }: { isJ4?: boolean }) {
    const [missions, setMissions] = useState<Operation[]>([])
    const [loading, setLoading] = useState(true)
    const [viewMode, setViewMode] = useState<ViewMode>('list')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('All')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(0)
    const [creating, setCreating] = useState(false)
    const [newMissionModalOpen, setNewMissionModalOpen] = useState(false)
    const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
    const [templateRefreshKey, setTemplateRefreshKey] = useState(0)
    const [campaigns, setCampaigns] = useState<OperationCampaign[]>([])
    const [campaignsLoaded, setCampaignsLoaded] = useState(false)
    const [campaignMissionsMap, setCampaignMissionsMap] = useState<Record<string, CampaignMission[]>>({})
    const [convertOp, setConvertOp] = useState<Operation | null>(null)
    const [autoOrganiseOpen, setAutoOrganiseOpen] = useState(false)

    // Undo toast
    const [undoItem, setUndoItem] = useState<{ id: string; title: string } | null>(null)
    const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Bin
    const [binOps, setBinOps] = useState<(Operation & { deletedAt: Date; deletedByName?: string })[]>([])
    const [binCampaigns, setBinCampaigns] = useState<OperationCampaign[]>([])
    const [binMissions, setBinMissions] = useState<CampaignMission[]>([])
    const [loadingBin, setLoadingBin] = useState(false)
    const [restoringId, setRestoringId] = useState<string | null>(null)
    const [restoringCampaignBinId, setRestoringCampaignBinId] = useState<string | null>(null)
    const [restoringMissionBinId, setRestoringMissionBinId] = useState<string | null>(null)
    const [purgingId, setPurgingId] = useState<string | null>(null)
    const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null)

    const fetchMissions = useCallback(() => {
        setLoading(true)
        fetch('/api/operations')
            .then(r => r.json())
            .then(data => setMissions(data.missions ?? []))
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => { fetchMissions() }, [fetchMissions])

    const fetchBin = useCallback(async () => {
        setLoadingBin(true)
        try {
            const [opsRes, campaignsRes, missionsRes] = await Promise.all([
                fetch('/api/operations/bin'),
                fetch('/api/operations/campaigns?includeDeleted=true'),
                fetch('/api/operations/campaign-missions?includeDeleted=true'),
            ])
            const [opsData, campaignsData, missionsData] = await Promise.all([
                opsRes.json(), campaignsRes.json(), missionsRes.json()
            ])
            setBinOps(opsData.operations ?? [])
            setBinCampaigns((campaignsData.campaigns ?? []).filter((c: OperationCampaign) => c.isDeleted))
            setBinMissions((missionsData.missions ?? []).filter((m: CampaignMission) => m.isDeleted))
        } finally { setLoadingBin(false) }
    }, [])

    // Load campaigns + missions on mount (used in unified list view)
    useEffect(() => {
        if (campaignsLoaded) return
        fetch('/api/operations/campaigns')
            .then(r => r.json())
            .then(async data => {
                const loadedCampaigns: OperationCampaign[] = data.campaigns ?? []
                setCampaigns(loadedCampaigns)
                setCampaignsLoaded(true)
                // Load missions for each campaign in parallel
                if (loadedCampaigns.length > 0) {
                    const missionResults = await Promise.all(
                        loadedCampaigns.map(c =>
                            fetch(`/api/operations/campaign-missions?campaignId=${c._id.toString()}`).then(r => r.json())
                        )
                    )
                    const newMap: Record<string, CampaignMission[]> = {}
                    loadedCampaigns.forEach((c, i) => {
                        newMap[c._id.toString()] = missionResults[i].missions ?? []
                    })
                    setCampaignMissionsMap(newMap)
                }
            })
    }, [campaignsLoaded])

    useEffect(() => { setPage(0) }, [statusFilter, typeFilter, search])

    const handleDelete = useCallback((id: string, title: string) => {
        setMissions(ms => ms.filter(m => m._id.toString() !== id))
        setUndoItem({ id, title })
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
        undoTimerRef.current = setTimeout(() => setUndoItem(null), 8000)
    }, [])

    async function handleUndo() {
        if (!undoItem) return
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
        setUndoItem(null)
        await fetch(`/api/operations/restore?id=${undoItem.id}`)
        fetchMissions()
    }

    async function restoreFromBin(id: string) {
        setRestoringId(id)
        try {
            await fetch(`/api/operations/restore?id=${id}`)
            setBinOps(ops => ops.filter(o => o._id.toString() !== id))
            fetchMissions()
        } finally { setRestoringId(null) }
    }

    async function restoreCampaignFromBin(campaignId: string) {
        setRestoringCampaignBinId(campaignId)
        try {
            await fetch('/api/operations/campaigns', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: campaignId, restore: true }),
            })
            setBinCampaigns(cs => cs.filter(c => c._id.toString() !== campaignId))
            setCampaignsLoaded(false)
        } finally { setRestoringCampaignBinId(null) }
    }

    async function restoreMissionFromBin(missionId: string) {
        setRestoringMissionBinId(missionId)
        try {
            await fetch(`/api/operations/campaign-missions/${missionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ restore: true }),
            })
            setBinMissions(ms => ms.filter(m => m._id?.toString() !== missionId))
            setCampaignsLoaded(false)
        } finally { setRestoringMissionBinId(null) }
    }

    async function purgeFromBin(id: string) {
        setPurgingId(id)
        try {
            await fetch(`/api/operations/purge?id=${id}`)
            setBinOps(ops => ops.filter(o => o._id.toString() !== id))
        } finally { setPurgingId(null); setConfirmPurgeId(null) }
    }

    const handleDuplicate = useCallback(() => {
        fetchMissions()
    }, [fetchMissions])

    const handleNotesSaved = useCallback((id: string, notes: string) => {
        setMissions(ms => ms.map(m => m._id.toString() === id ? { ...m, internalNotes: notes } : m))
    }, [])

    const handleAssigned = useCallback((opId: string, campaignId: string) => {
        setMissions(ms => ms.map(m => m._id.toString() === opId ? { ...m, campaignId: campaignId as unknown as import('mongodb').ObjectId } : m))
    }, [])

    const handleRemoved = useCallback((opId: string) => {
        setMissions(ms => ms.map(m => m._id.toString() === opId ? { ...m, campaignId: undefined } : m))
    }, [])

    async function createMission() {
        setCreating(true)
        try {
            const res = await fetch('/api/operations/new')
            const data = await res.json()
            if (data.id) {
                fetchMissions()
                window.open(`/operations/${data.id}/edit`, '_blank')
            }
        } finally { setCreating(false) }
    }

    function handleNewMissionCreated() {
        fetchMissions()
        setNewMissionModalOpen(false)
    }

    function handleCampaignMissionCreated(campaign: OperationCampaign, missions: CampaignMission[]) {
        setCampaigns(cs => cs.find(c => c._id.toString() === campaign._id.toString()) ? cs : [...cs, campaign])
        setCampaignMissionsMap(m => ({
            ...m,
            [campaign._id.toString()]: [...(m[campaign._id.toString()] ?? []), ...missions],
        }))
        setNewMissionModalOpen(false)
    }

    // ── Compute effective campaign status from linked ops ─────────────────────

    function campaignEffectiveStatus(campaign: OperationCampaign): string {
        // 1. Explicit campaign status always wins
        if (campaign.status) return campaign.status
        // 2. Derive from linked operations
        const cid = campaign._id.toString()
        // Include ops linked by campaignId OR by campaignMissionId (for ops linked via mission slots)
        const campaignMissionIds = new Set(
            (campaignMissionsMap[cid] ?? []).map(m => m._id?.toString()).filter(Boolean) as string[]
        )
        const linked = missions.filter(op =>
            op.campaignId?.toString() === cid ||
            (op.campaignMissionId && campaignMissionIds.has(op.campaignMissionId))
        )
        if (linked.some(op => op.status === 'Active')) return 'Active'
        if (linked.some(op => op.status === 'Upcoming')) return 'Upcoming'
        if (linked.length > 0 && linked.every(op => !op.status || op.status === 'Completed')) return 'Completed'
        if (linked.length > 0) return 'In Development'
        return 'In Development'
    }

    const STATUS_ORDER = ['Active', 'Upcoming', 'In Development', 'Completed'] as const
    type SortableStatus = typeof STATUS_ORDER[number]

    // ── List view ──────────────────────────────────────────────────────────────

    // Standalone missions (no campaignId)
    const standaloneFiltered = missions.filter(m => {
        if (m.campaignId) return false  // campaign ops handled separately
        if (typeFilter === 'Campaigns') return false
        if (statusFilter !== 'All' && m.status !== statusFilter) return false
        if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false
        return true
    })

    const filtered = missions.filter(m => {
        if (statusFilter !== 'All' && m.status !== statusFilter) return false
        if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false
        if (typeFilter === 'Campaigns' && !m.campaignId) return false
        if (typeFilter === 'Single Missions' && m.campaignId) return false
        return true
    })
    const totalPages = Math.ceil(standaloneFiltered.length / PAGE_SIZE)
    const paginatedStandalone = standaloneFiltered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

    // Campaigns grouped by effective status
    const campaignsByStatus: Record<string, OperationCampaign[]> = { Active: [], Upcoming: [], 'In Development': [], Completed: [] }
    const visibleCampaigns = typeFilter === 'Single Missions' ? [] :
        campaigns.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))
    for (const c of visibleCampaigns) {
        const s = campaignEffectiveStatus(c)
        if (statusFilter !== 'All' && s !== statusFilter) continue
        ;(campaignsByStatus[s] ?? (campaignsByStatus[s] = [])).push(c)
    }

    // Standalone grouped by status
    const standaloneByStatus: Record<string, Operation[]> = { Active: [], Upcoming: [], 'In Development': [], Completed: [] }
    for (const op of paginatedStandalone) {
        const s = op.status ?? 'In Development'
        ;(standaloneByStatus[s] ?? (standaloneByStatus[s] = [])).push(op)
    }

    // ── Campaigns view (legacy, unused now) ────────────────────────────────────

    const missionsByCampaign = new Map<string, Operation[]>()
    for (const c of campaigns) missionsByCampaign.set(c._id.toString(), [])
    const standalone: Operation[] = []
    for (const m of missions) {
        const cid = m.campaignId?.toString()
        if (cid && missionsByCampaign.has(cid)) missionsByCampaign.get(cid)!.push(m)
        else standalone.push(m)
    }

    const opRowProps = {
        onDelete: handleDelete,
        onDuplicate: handleDuplicate,
        onNotesSaved: handleNotesSaved,
        onTemplateSaved: () => setTemplateRefreshKey(k => k + 1),
        onAssigned: handleAssigned,
        onRemoved: handleRemoved,
        onConvertToCampaign: (op: Operation) => setConvertOp(op),
    }

    return (
        <div className='p-6 flex flex-col gap-0'>

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--txt-3)', marginRight: 'auto' }}>
                    {missions.length} Mission{missions.length !== 1 ? 's' : ''}
                </span>

                {/* View toggle — List only (campaigns merged in), + bin */}
                <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <button onClick={() => setViewMode('list')} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 12px', cursor: 'pointer', background: viewMode === 'list' ? 'rgba(255,255,255,0.08)' : 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.1)', color: viewMode === 'list' ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.3)', transition: 'all 0.15s' }}>
                        <ViewList style={{ fontSize: 13 }} />List
                    </button>
                    <button onClick={() => { setViewMode('bin'); fetchBin() }} title='Recycle Bin' style={{ display: 'flex', alignItems: 'center', padding: '5px 10px', cursor: 'pointer', background: viewMode === 'bin' ? 'rgba(219,0,29,0.12)' : 'transparent', border: 'none', color: viewMode === 'bin' ? 'rgba(219,0,29,0.8)' : 'rgba(237,237,237,0.3)', transition: 'all 0.15s' }}>
                        <DeleteSweep style={{ fontSize: 15 }} />
                    </button>
                </div>

                {/* Auto-organise button (was in campaigns view, now accessible from list) */}
                <button onClick={() => setAutoOrganiseOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 12px', cursor: 'pointer', background: 'rgba(100,150,237,0.06)', border: '1px solid rgba(100,150,237,0.2)', color: 'rgba(100,150,237,0.65)' }}>
                    <AccountTree style={{ fontSize: 13 }} />Organise
                </button>

                <button onClick={() => setTemplatePickerOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.6)' }}>
                    <BookmarkAdd style={{ fontSize: 14 }} />From Template
                </button>
                <button onClick={() => setNewMissionModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px', cursor: 'pointer', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.42)', color: 'rgba(219,0,29,0.8)' }}>
                    <Add style={{ fontSize: 14 }} />New Mission
                </button>
            </div>

            {loading && <LinearProgress sx={{ mb: 1, backgroundColor: 'rgba(219,0,29,0.1)', '& .MuiLinearProgress-bar': { backgroundColor: 'var(--red)' } }} />}

            {/* ── UNIFIED LIST VIEW (campaigns + standalone) ── */}
            {viewMode === 'list' && (
                <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 180, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', padding: '5px 10px' }}>
                            <Search style={{ fontSize: 14, color: 'rgba(237,237,237,0.25)', flexShrink: 0 }} />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search missions…' style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'rgba(237,237,237,0.8)', fontSize: '0.78rem' }} />
                            {search && <button onClick={() => setSearch('')} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.25)', display: 'flex' }}><Close style={{ fontSize: 14 }} /></button>}
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {(['All', 'Campaigns', 'Single Missions'] as TypeFilter[]).map(t => {
                                const active = typeFilter === t
                                const color = t === 'Campaigns' ? 'rgba(100,150,237,0.75)' : 'rgba(237,237,237,0.6)'
                                return (
                                    <button key={t} onClick={() => setTypeFilter(t)} style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '3px 10px', cursor: 'pointer', background: active ? 'rgba(255,255,255,0.06)' : 'transparent', border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`, color: active ? color : 'rgba(237,237,237,0.3)', transition: 'all 0.15s' }}>{t}</button>
                                )
                            })}
                        </div>
                        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {ALL_STATUSES.map(s => {
                                const active = statusFilter === s
                                const color = s === 'All' ? 'rgba(237,237,237,0.6)' : (STATUS_COLORS[s] ?? 'rgba(237,237,237,0.6)')
                                return (
                                    <button key={s} onClick={() => setStatusFilter(s)} style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '3px 10px', cursor: 'pointer', background: active ? 'rgba(255,255,255,0.06)' : 'transparent', border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`, color: active ? color : 'rgba(237,237,237,0.3)', transition: 'all 0.15s' }}>{s}</button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Status-grouped unified view: Active → Upcoming → In Development → Completed */}
                    {STATUS_ORDER.map(status => {
                        const cs = (campaignsByStatus[status] ?? []).filter(() => typeFilter !== 'Single Missions')
                        const ss = (standaloneByStatus[status] ?? []).filter(() => typeFilter !== 'Campaigns')
                        const isEmpty = cs.length === 0 && ss.length === 0
                        // When a specific status filter is selected, skip sections that don't match
                        if (statusFilter !== 'All' && status !== statusFilter) return null
                        const statusColor = STATUS_COLORS[status] ?? 'rgba(237,237,237,0.35)'
                        const emptyMessages: Record<string, string> = {
                            'Active': 'No campaigns or missions active.',
                            'Upcoming': 'No campaigns or missions upcoming.',
                            'In Development': 'No campaigns or missions in development.',
                            'Completed': 'No campaigns or missions completed.',
                        }
                        return (
                            <div key={status} style={{
                                marginBottom: 10,
                                border: `1px solid ${statusColor.replace(/[\d.]+\)$/, '0.12)')}`,
                                borderTop: `2px solid ${statusColor.replace(/[\d.]+\)$/, '0.45)')}`,
                                background: 'rgba(255,255,255,0.01)',
                            }}>
                                {/* Section header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: `1px solid ${statusColor.replace(/[\d.]+\)$/, '0.08)')}` }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: statusColor }}>{status}</span>
                                    {!isEmpty && <span style={{ fontSize: '0.54rem', color: 'rgba(237,237,237,0.2)', marginLeft: 2 }}>{cs.length + ss.length}</span>}
                                </div>

                                {/* Section body */}
                                {isEmpty ? (
                                    <div style={{ padding: '10px 14px' }}>
                                        <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>
                                            {emptyMessages[status] ?? 'No items.'}
                                        </span>
                                    </div>
                                ) : (
                                    <div style={{ padding: '6px 0 2px' }}>
                                        {/* Campaigns */}
                                        {cs.length > 0 && (
                                            <div style={{ marginBottom: 4 }}>
                                                {cs.map(c => (
                                                    <CampaignGroupHierarchy
                                                        key={c._id.toString()}
                                                        campaign={c}
                                                        missions={campaignMissionsMap[c._id.toString()] ?? []}
                                                        allOperations={missions}
                                                        onMissionsChange={(campaignId, updatedMissions) => setCampaignMissionsMap(m => ({ ...m, [campaignId]: updatedMissions }))}
                                                        onCampaignRenamed={(id, name) => setCampaigns(cs => cs.map(x => x._id.toString() === id ? { ...x, name } : x))}
                                                        onCampaignDeleted={id => {
                                                            setCampaigns(cs => cs.filter(x => x._id.toString() !== id))
                                                            setCampaignMissionsMap(m => { const n = { ...m }; delete n[id]; return n })
                                                        }}
                                                        onCampaignStatusChanged={(id, status) => setCampaigns(cs => cs.map(x => x._id.toString() === id ? { ...x, status: (status as OperationCampaign['status']) ?? undefined } : x))}
                                                        onRefreshOps={fetchMissions}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {/* Standalone missions */}
                                        {ss.length > 0 && (
                                            <div>
                                                {ss.map(op => <OpRow key={op._id.toString()} op={op} {...opRowProps} />)}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {/* Pagination for standalone missions */}
                    {typeFilter !== 'Campaigns' && totalPages > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.06em' }}>
                                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, standaloneFiltered.length)} of {standaloneFiltered.length}
                            </span>
                            <button onClick={() => setPage(p => p - 1)} disabled={page === 0} style={{ all: 'unset', cursor: page === 0 ? 'not-allowed' : 'pointer', color: page === 0 ? 'rgba(237,237,237,0.15)' : 'rgba(237,237,237,0.5)', display: 'flex' }}><ChevronLeft style={{ fontSize: 20 }} /></button>
                            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} style={{ all: 'unset', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', color: page >= totalPages - 1 ? 'rgba(237,237,237,0.15)' : 'rgba(237,237,237,0.5)', display: 'flex' }}><ChevronRight style={{ fontSize: 20 }} /></button>
                        </div>
                    )}

                    {/* Create campaign form (visible when not filtering to single missions only) */}
                    {typeFilter !== 'Single Missions' && campaignsLoaded && (
                        <div style={{ marginTop: 12 }}>
                            <CreateCampaignForm onCreated={c => {
                                setCampaigns(cs => [...cs, c])
                                setCampaignMissionsMap(m => ({ ...m, [c._id.toString()]: [] }))
                            }} />
                        </div>
                    )}

                    <TemplatesSection refreshKey={templateRefreshKey} />
                </>
            )}

            {/* ── BIN VIEW ── */}
            {viewMode === 'bin' && (
                <div>
                    <div style={{ marginBottom: 10 }}>
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)' }}>
                            Items in recycle bin are permanently deleted after 6 months
                        </span>
                    </div>

                    {loadingBin && <LinearProgress sx={{ mb: 1, backgroundColor: 'rgba(219,0,29,0.1)', '& .MuiLinearProgress-bar': { backgroundColor: 'var(--red)' } }} />}

                    {!loadingBin && binOps.length === 0 && binCampaigns.length === 0 && binMissions.length === 0 && (
                        <Typography style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.25)', padding: '16px 0', fontStyle: 'italic' }}>
                            Recycle bin is empty.
                        </Typography>
                    )}

                    {/* Deleted Campaigns */}
                    {binCampaigns.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(100,150,237,0.55)', marginBottom: 6 }}>Campaigns</div>
                            {binCampaigns.map(c => {
                                const cid = c._id.toString()
                                const isRestoring = restoringCampaignBinId === cid
                                return (
                                    <div key={cid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid rgba(100,150,237,0.12)', background: 'rgba(100,150,237,0.02)', marginBottom: 4 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(237,237,237,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                                            {c.deletedAt && <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.28)', marginTop: 2 }}>Deleted {new Date(c.deletedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
                                        </div>
                                        <button onClick={() => restoreCampaignFromBin(cid)} disabled={isRestoring} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', padding: '3px 10px', cursor: isRestoring ? 'not-allowed' : 'pointer', background: 'none', border: '1px solid color-mix(in srgb, var(--live) 30%, transparent)', color: isRestoring ? 'color-mix(in srgb, var(--live) 30%, transparent)' : 'color-mix(in srgb, var(--live) 70%, transparent)' }}>
                                            <RestoreFromTrash style={{ fontSize: 13 }} />{isRestoring ? 'Restoring…' : 'Restore'}
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Deleted Campaign Missions */}
                    {binMissions.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,160,0,0.55)', marginBottom: 6 }}>Campaign Missions</div>
                            {binMissions.map(m => {
                                const mId = m._id?.toString() ?? ''
                                const isRestoring = restoringMissionBinId === mId
                                return (
                                    <div key={mId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid rgba(219,160,0,0.1)', background: 'rgba(219,160,0,0.02)', marginBottom: 4 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(237,237,237,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                                            {m.deletedAt && <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.28)', marginTop: 2 }}>
                                                Deleted {new Date(m.deletedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                {m.deletedByName && ` by ${m.deletedByName}`}
                                            </div>}
                                        </div>
                                        <button onClick={() => restoreMissionFromBin(mId)} disabled={isRestoring} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', padding: '3px 10px', cursor: isRestoring ? 'not-allowed' : 'pointer', background: 'none', border: '1px solid color-mix(in srgb, var(--live) 30%, transparent)', color: isRestoring ? 'color-mix(in srgb, var(--live) 30%, transparent)' : 'color-mix(in srgb, var(--live) 70%, transparent)' }}>
                                            <RestoreFromTrash style={{ fontSize: 13 }} />{isRestoring ? 'Restoring…' : 'Restore'}
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Deleted Operations */}
                    {binOps.length > 0 && (
                        <div>
                            {(binCampaigns.length > 0 || binMissions.length > 0) && (
                                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.55)', marginBottom: 6 }}>Operations</div>
                            )}
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                                            {['Title', 'Deleted By', 'Deleted On', 'Days Remaining', ''].map(h => (
                                                <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {binOps.map(op => {
                                            const id = op._id.toString()
                                            const daysRemaining = Math.max(0, 180 - Math.floor((Date.now() - new Date(op.deletedAt).getTime()) / 86400000))
                                            const isRestoring = restoringId === id
                                            const isPurging = purgingId === id
                                            return (
                                                <tr key={id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                    <td style={{ padding: '8px 12px', color: 'rgba(237,237,237,0.75)', fontWeight: 700 }}>{op.title}</td>
                                                    <td style={{ padding: '8px 12px', color: 'rgba(237,237,237,0.45)' }}>{op.deletedByName ?? '—'}</td>
                                                    <td style={{ padding: '8px 12px', color: 'rgba(237,237,237,0.45)', whiteSpace: 'nowrap' }}>
                                                        {new Date(op.deletedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', color: daysRemaining <= 14 ? 'rgba(219,0,29,0.8)' : 'rgba(237,237,237,0.45)' }}>
                                                        {daysRemaining}d
                                                    </td>
                                                    <td style={{ padding: '8px 12px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                                                            <button
                                                                onClick={() => restoreFromBin(id)}
                                                                disabled={isRestoring || isPurging}
                                                                title='Restore'
                                                                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', padding: '3px 10px', cursor: isRestoring ? 'not-allowed' : 'pointer', background: 'none', border: '1px solid color-mix(in srgb, var(--live) 30%, transparent)', color: isRestoring ? 'color-mix(in srgb, var(--live) 30%, transparent)' : 'color-mix(in srgb, var(--live) 70%, transparent)' }}
                                                            >
                                                                <RestoreFromTrash style={{ fontSize: 13 }} />
                                                                {isRestoring ? 'Restoring…' : 'Restore'}
                                                            </button>
                                                            {isJ4 && (
                                                                <button
                                                                    onClick={() => setConfirmPurgeId(id)}
                                                                    disabled={isRestoring || isPurging}
                                                                    title='Delete Permanently'
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', padding: '3px 10px', cursor: isPurging ? 'not-allowed' : 'pointer', background: 'none', border: '1px solid rgba(219,0,29,0.42)', color: isPurging ? 'rgba(219,0,29,0.3)' : 'rgba(219,0,29,0.7)' }}
                                                                >
                                                                    <DeleteForever style={{ fontSize: 13 }} />
                                                                    {isPurging ? 'Deleting…' : 'Delete Permanently'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/*
                       Emptying the bin is the one delete on this screen with no
                       undo behind it — everything else lands in the bin first
                       and keeps for 30 days. Typing the word is the friction
                       that difference deserves.
                    */}
                    {confirmPurgeId && (
                        <TypedConfirmDialog
                            open
                            title='Delete permanently'
                            confirmWord='DELETE'
                            confirmLabel='Delete permanently'
                            warning='The operation, its attendance and its sign-on records are removed outright. This cannot be undone.'
                            onConfirm={() => purgeFromBin(confirmPurgeId)}
                            onCancel={() => setConfirmPurgeId(null)}
                        >
                            <p>
                                Permanently delete <b>{binOps.find(o => o._id.toString() === confirmPurgeId)?.title}</b>?
                            </p>
                        </TypedConfirmDialog>
                    )}
                </div>
            )}

            {templatePickerOpen && <TemplatePicker onClose={() => setTemplatePickerOpen(false)} />}

            {newMissionModalOpen && (
                <NewMissionModal
                    campaigns={campaigns}
                    onClose={() => setNewMissionModalOpen(false)}
                    onCreatedSingle={handleNewMissionCreated}
                    onCreatedCampaign={handleCampaignMissionCreated}
                />
            )}

            {autoOrganiseOpen && (
                <AutoOrganiseModal
                    allOps={missions}
                    existingCampaigns={campaigns}
                    onClose={() => { setAutoOrganiseOpen(false); fetchMissions() }}
                    onOrganised={(newCampaigns, newMissionsMap) => {
                        setCampaigns(cs => {
                            const existing = new Set(cs.map(c => c._id.toString()))
                            return [...cs, ...newCampaigns.filter(c => !existing.has(c._id.toString()))]
                        })
                        setCampaignMissionsMap(m => ({ ...m, ...newMissionsMap }))
                        fetchMissions()
                        setAutoOrganiseOpen(false)
                    }}
                />
            )}

            {convertOp && (
                <ConvertToCampaignModal
                    op={convertOp}
                    onClose={() => setConvertOp(null)}
                    onConverted={(campaign, mission) => {
                        setCampaigns(cs => cs.find(c => c._id.toString() === campaign._id.toString()) ? cs : [...cs, campaign])
                        setCampaignMissionsMap(m => ({
                            ...m,
                            [campaign._id.toString()]: [...(m[campaign._id.toString()] ?? []), mission],
                        }))
                        fetchMissions()
                        setConvertOp(null)
                    }}
                />
            )}

            {/* ── UNDO TOAST ── */}
            {undoItem && (
                <div style={{
                    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                    zIndex: 1400, display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px', background: 'rgb(22,22,22)',
                    border: '1px solid var(--line-2)', borderLeft: '3px solid var(--red)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                    fontSize: '0.8rem', color: 'rgba(237,237,237,0.8)', whiteSpace: 'nowrap',
                }}>
                    <span>Deleted <strong style={{ color: 'rgba(237,237,237,0.95)' }}>{undoItem.title}</strong></span>
                    <button
                        onClick={handleUndo}
                        style={{
                            all: 'unset', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700,
                            letterSpacing: '0.1em', color: 'var(--red)', padding: '2px 8px',
                            border: '1px solid rgba(219,0,29,0.27)',
                        }}
                    >UNDO</button>
                    <button
                        onClick={() => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); setUndoItem(null) }}
                        style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.3)', display: 'flex' }}
                    >
                        <Close style={{ fontSize: 15 }} />
                    </button>
                </div>
            )}
        </div>
    )
}
