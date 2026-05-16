'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Typography, LinearProgress } from '@mui/material'
import {
    Edit, ContentCopy, Delete, Add, BookmarkAdd, BookmarkAdded,
    ExpandMore, ExpandLess, NoteAlt, Search, Close,
    ChevronLeft, ChevronRight, ViewList, AccountTree, FolderOpen, Check,
    DeleteSweep, RestoreFromTrash, DeleteForever,
    CalendarToday, EventNote, LinkOff, SwapHoriz,
} from '@mui/icons-material'
import ConfirmDialog from '@/components/confirm-dialog'

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
type ViewMode = 'list' | 'campaigns' | 'bin'

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
            if (data.id) { window.open(`/operations/${data.id}/edit`, '_blank'); onClose() }
        } finally { setApplying(null) }
    }

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '70vh', background: 'rgb(13,13,13)', border: '1px solid rgba(219,0,29,0.25)', borderTop: '2px solid var(--red)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}>
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
                    {saved && <span style={{ fontSize: '0.6rem', color: 'rgba(34,197,94,0.7)', marginRight: 8 }}>Saved</span>}
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
                    <a href={`/operations/${id}/edit`} target='_blank' rel='noreferrer' title='Edit mission'>
                        <button style={iconBtn()} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.85)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.3)')}><Edit style={{ fontSize: 15 }} /></button>
                    </a>
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
                onConfirm={() => { setConfirmOpen(false); fetch(`/api/operations/delete?id=${id}`).then(() => onDelete(id, op.title)) }}
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
                <ConfirmDialog open title={`Delete Campaign`} message={`Delete "${campaign?.name}"? All missions will become standalone.`}
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
    onCreatedCampaign: (campaign: OperationCampaign, mission: CampaignMission) => void
}) {
    const [step, setStep] = useState<'type' | 'campaign'>('type')
    const [campaignMode, setCampaignMode] = useState<'existing' | 'new'>('existing')
    const [selectedCampaignId, setSelectedCampaignId] = useState('')
    const [newCampaignName, setNewCampaignName] = useState('')
    const [plannedCount, setPlannedCount] = useState(1)
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState('')

    async function createSingle() {
        setCreating(true)
        try {
            const res = await fetch('/api/operations/new')
            const data = await res.json()
            if (data.id) {
                window.open(`/operations/${data.id}/edit`, '_blank')
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

            // Figure out what sequence number to use (next after existing missions)
            const mRes = await fetch(`/api/operations/campaign-missions?campaignId=${campaignId}`)
            const mData = await mRes.json()
            const existingMissions: CampaignMission[] = mData.missions ?? []
            const nextSeq = existingMissions.length + 1
            const missionName = `${campaign.name} ${toRoman(nextSeq)}`

            const mRes2 = await fetch('/api/operations/campaign-missions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaignId, name: missionName, sequence: nextSeq }),
            })
            const mData2 = await mRes2.json()
            if (!mRes2.ok) { setError(mData2.error ?? 'Failed'); setCreating(false); return }

            const newMission: CampaignMission = mData2.mission
            onCreatedCampaign(campaign, newMission)
        } catch { setError('Network error') }
        finally { setCreating(false) }
    }

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'rgb(13,13,13)', border: '1px solid rgba(219,0,29,0.25)', borderTop: '2px solid var(--red)', boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}>
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', whiteSpace: 'nowrap' }}>Planned missions (optional):</span>
                                    <input
                                        type='number' min={1} max={10} value={plannedCount}
                                        onChange={e => setPlannedCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                                        style={{
                                            width: 60, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(100,150,237,0.2)',
                                            color: '#ededed', fontSize: '0.82rem', padding: '4px 8px', outline: 'none', fontFamily: 'inherit', textAlign: 'center',
                                        }}
                                    />
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
                            <Add style={{ fontSize: 14 }} />{creating ? 'Creating…' : 'Create Campaign Mission'}
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
            const opRes = await fetch(`/api/operations/${newOpId}`)
            const opData = await opRes.json()
            onLinked(mission, newOpId, opData.operation ?? { _id: newOpId, title: 'New Operation', date: new Date() } as any)
            window.open(`/operations/${newOpId}/edit`, '_blank')
        } catch { setError('Network error') }
        finally { setCreating(false) }
    }

    const label = daySlot === 'saturday' ? 'Saturday' : 'Sunday'

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 500, maxHeight: '80vh', background: 'rgb(13,13,13)', border: '1px solid rgba(219,0,29,0.25)', borderTop: '2px solid var(--red)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}>
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
    const [open, setOpen] = useState(true)
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
        await fetch(`/api/operations/campaign-missions/${missionId}`, { method: 'DELETE' })
        onMissionDeleted(missionId)
    }

    function DaySlotEntry({ slot, op }: { slot: 'saturday' | 'sunday'; op: Operation | null | undefined }) {
        const label = slot === 'saturday' ? 'Saturday' : 'Sunday'
        const accent = slot === 'saturday' ? 'rgba(219,160,0,0.6)' : 'rgba(100,150,237,0.6)'

        if (op) {
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent, flexShrink: 0, width: 56 }}>{label}</span>
                    <a href={`/operations/${op._id.toString()}/edit`} target='_blank' rel='noreferrer' style={{ flex: 1, fontSize: '0.78rem', fontWeight: 600, color: 'rgba(237,237,237,0.8)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {op.title}
                    </a>
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
                <ConfirmDialog open title='Delete Mission' message={`Delete "${mission.name}"? Saturday and Sunday operations will be unlinked.`}
                    onConfirm={() => { setConfirmDelete(false); deleteMission() }}
                    onCancel={() => setConfirmDelete(false)} />
            )}
        </div>
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
}: {
    campaign: OperationCampaign
    missions: CampaignMission[]
    allOperations: Operation[]
    onMissionsChange: (campaignId: string, missions: CampaignMission[]) => void
    onCampaignRenamed: (id: string, name: string) => void
    onCampaignDeleted: (id: string) => void
}) {
    const [open, setOpen] = useState(true)
    const [editing, setEditing] = useState(false)
    const [editName, setEditName] = useState(campaign.name)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [saving, setSaving] = useState(false)
    const [addDaySlot, setAddDaySlot] = useState<{ mission: CampaignMission; slot: 'saturday' | 'sunday' } | null>(null)
    const [addingMission, setAddingMission] = useState(false)

    const campaignId = campaign._id.toString()

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
        await fetch(`/api/operations/campaigns?id=${campaignId}`, { method: 'DELETE' })
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: open ? '1px solid rgba(100,150,237,0.1)' : 'none' }}>
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
                        <button onClick={() => { setEditName(campaign.name); setEditing(true) }} title='Click to rename' style={{ all: 'unset', cursor: 'pointer', flex: 1, fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(100,150,237,0.9)' }}>
                            {campaign.name}
                        </button>
                    )}

                    <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.06em' }}>
                        {missions.length} mission{missions.length !== 1 ? 's' : ''}
                    </span>

                    <button onClick={() => setConfirmDelete(true)} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(219,0,29,0.35)', display: 'flex', transition: 'color 0.15s' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.8)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.35)')}>
                        <Delete style={{ fontSize: 15 }} />
                    </button>
                </div>

                {open && (
                    <div style={{ padding: '8px 8px 4px' }}>
                        {missions.length === 0 && (
                            <Typography style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.2)', padding: '8px 6px', fontStyle: 'italic' }}>No missions yet.</Typography>
                        )}
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
                        <button
                            onClick={addMission}
                            disabled={addingMission}
                            style={{
                                all: 'unset', cursor: addingMission ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', marginTop: 4,
                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                color: addingMission ? 'rgba(100,150,237,0.3)' : 'rgba(100,150,237,0.6)',
                                transition: 'color 0.15s',
                            }}
                            onMouseEnter={e => { if (!addingMission) e.currentTarget.style.color = 'rgba(100,150,237,0.9)' }}
                            onMouseLeave={e => { if (!addingMission) e.currentTarget.style.color = 'rgba(100,150,237,0.6)' }}
                        >
                            <Add style={{ fontSize: 13 }} />{addingMission ? 'Adding…' : '+ Add Mission'}
                        </button>
                    </div>
                )}
            </div>

            {confirmDelete && (
                <ConfirmDialog open title='Delete Campaign' message={`Delete "${campaign.name}"? All missions will be removed.`}
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
        <div style={{ border: '1px solid rgba(219,0,29,0.12)', background: 'rgba(255,255,255,0.01)', marginTop: 16 }}>
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

    // Undo toast
    const [undoItem, setUndoItem] = useState<{ id: string; title: string } | null>(null)
    const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Bin
    const [binOps, setBinOps] = useState<(Operation & { deletedAt: Date; deletedByName?: string })[]>([])
    const [loadingBin, setLoadingBin] = useState(false)
    const [restoringId, setRestoringId] = useState<string | null>(null)
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
            const res = await fetch('/api/operations/bin')
            const data = await res.json()
            setBinOps(data.operations ?? [])
        } finally { setLoadingBin(false) }
    }, [])

    // Lazy-load campaigns (and their missions) when first switching to campaigns view
    useEffect(() => {
        if (viewMode !== 'campaigns' || campaignsLoaded) return
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
    }, [viewMode, campaignsLoaded])

    useEffect(() => { setPage(0) }, [statusFilter, search])

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
        } finally { setRestoringId(null) }
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

    function handleCampaignMissionCreated(campaign: OperationCampaign, mission: CampaignMission) {
        // Ensure campaign exists in list
        setCampaigns(cs => cs.find(c => c._id.toString() === campaign._id.toString()) ? cs : [...cs, campaign])
        setCampaignMissionsMap(m => ({
            ...m,
            [campaign._id.toString()]: [...(m[campaign._id.toString()] ?? []), mission],
        }))
        setNewMissionModalOpen(false)
    }

    // ── List view ──────────────────────────────────────────────────────────────

    const filtered = missions.filter(m => {
        if (statusFilter !== 'All' && m.status !== statusFilter) return false
        if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false
        return true
    })
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
    const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

    // ── Campaigns view ─────────────────────────────────────────────────────────

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
                <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginRight: 'auto' }}>
                    {missions.length} Mission{missions.length !== 1 ? 's' : ''}
                </span>

                {/* View toggle */}
                <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {(['list', 'campaigns'] as ('list' | 'campaigns')[]).map(v => {
                        const active = viewMode === v
                        return (
                            <button key={v} onClick={() => setViewMode(v)} style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                padding: '5px 12px', cursor: 'pointer',
                                background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                                border: 'none', borderRight: '1px solid rgba(255,255,255,0.1)',
                                color: active ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.3)',
                                transition: 'all 0.15s',
                            }}>
                                {v === 'list' ? <ViewList style={{ fontSize: 13 }} /> : <AccountTree style={{ fontSize: 13 }} />}
                                {v === 'list' ? 'List' : 'Campaigns'}
                            </button>
                        )
                    })}
                    <button
                        onClick={() => { setViewMode('bin'); fetchBin() }}
                        title='Recycle Bin'
                        style={{
                            display: 'flex', alignItems: 'center',
                            padding: '5px 10px', cursor: 'pointer',
                            background: viewMode === 'bin' ? 'rgba(219,0,29,0.12)' : 'transparent',
                            border: 'none',
                            color: viewMode === 'bin' ? 'rgba(219,0,29,0.8)' : 'rgba(237,237,237,0.3)',
                            transition: 'all 0.15s',
                        }}
                    >
                        <DeleteSweep style={{ fontSize: 15 }} />
                    </button>
                </div>

                <button onClick={() => setTemplatePickerOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.6)' }}>
                    <BookmarkAdd style={{ fontSize: 14 }} />From Template
                </button>
                <button onClick={() => setNewMissionModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px', cursor: 'pointer', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.42)', color: 'rgba(219,0,29,0.8)' }}>
                    <Add style={{ fontSize: 14 }} />New Mission
                </button>
            </div>

            {loading && <LinearProgress sx={{ mb: 1, backgroundColor: 'rgba(219,0,29,0.1)', '& .MuiLinearProgress-bar': { backgroundColor: 'var(--red)' } }} />}

            {/* ── LIST VIEW ── */}
            {viewMode === 'list' && (
                <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 180, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', padding: '5px 10px' }}>
                            <Search style={{ fontSize: 14, color: 'rgba(237,237,237,0.25)', flexShrink: 0 }} />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search missions…' style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'rgba(237,237,237,0.8)', fontSize: '0.78rem' }} />
                            {search && <button onClick={() => setSearch('')} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.25)', display: 'flex' }}><Close style={{ fontSize: 14 }} /></button>}
                        </div>
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

                    {!loading && filtered.length === 0 && (
                        <Typography style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.25)', padding: '16px 0', fontStyle: 'italic' }}>
                            No missions found{search ? ` matching "${search}"` : statusFilter !== 'All' ? ` with status "${statusFilter}"` : ''}.
                        </Typography>
                    )}

                    <div>
                        {paginated.map(op => <OpRow key={op._id.toString()} op={op} {...opRowProps} />)}
                    </div>

                    {totalPages > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.06em' }}>
                                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                            </span>
                            <button onClick={() => setPage(p => p - 1)} disabled={page === 0} style={{ all: 'unset', cursor: page === 0 ? 'not-allowed' : 'pointer', color: page === 0 ? 'rgba(237,237,237,0.15)' : 'rgba(237,237,237,0.5)', display: 'flex' }}><ChevronLeft style={{ fontSize: 20 }} /></button>
                            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} style={{ all: 'unset', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', color: page >= totalPages - 1 ? 'rgba(237,237,237,0.15)' : 'rgba(237,237,237,0.5)', display: 'flex' }}><ChevronRight style={{ fontSize: 20 }} /></button>
                        </div>
                    )}

                    <TemplatesSection refreshKey={templateRefreshKey} />
                </>
            )}

            {/* ── CAMPAIGNS VIEW ── */}
            {viewMode === 'campaigns' && (
                <>
                    {!campaignsLoaded && <Typography style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.3)' }}>Loading campaigns…</Typography>}

                    {campaignsLoaded && campaigns.map(c => (
                        <CampaignGroupHierarchy
                            key={c._id.toString()}
                            campaign={c}
                            missions={campaignMissionsMap[c._id.toString()] ?? []}
                            allOperations={missions}
                            onMissionsChange={(campaignId, updatedMissions) =>
                                setCampaignMissionsMap(m => ({ ...m, [campaignId]: updatedMissions }))
                            }
                            onCampaignRenamed={(id, name) => setCampaigns(cs => cs.map(x => x._id.toString() === id ? { ...x, name } : x))}
                            onCampaignDeleted={id => {
                                setCampaigns(cs => cs.filter(x => x._id.toString() !== id))
                                setCampaignMissionsMap(m => { const n = { ...m }; delete n[id]; return n })
                            }}
                        />
                    ))}

                    {campaignsLoaded && (
                        <CampaignGroup
                            campaign={null}
                            missions={standalone}
                            {...opRowProps}
                            onCampaignRenamed={() => {}}
                            onCampaignDeleted={() => {}}
                        />
                    )}

                    {campaignsLoaded && (
                        <div style={{ marginTop: 12 }}>
                            <CreateCampaignForm onCreated={c => {
                                setCampaigns(cs => [...cs, c])
                                setCampaignMissionsMap(m => ({ ...m, [c._id.toString()]: [] }))
                            }} />
                        </div>
                    )}
                </>
            )}

            {/* ── BIN VIEW ── */}
            {viewMode === 'bin' && (
                <div>
                    <div style={{ marginBottom: 10 }}>
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)' }}>
                            Operations in bin are permanently deleted after 30 days
                        </span>
                    </div>

                    {loadingBin && <LinearProgress sx={{ mb: 1, backgroundColor: 'rgba(219,0,29,0.1)', '& .MuiLinearProgress-bar': { backgroundColor: 'var(--red)' } }} />}

                    {!loadingBin && binOps.length === 0 && (
                        <Typography style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.25)', padding: '16px 0', fontStyle: 'italic' }}>
                            Recycle bin is empty.
                        </Typography>
                    )}

                    {binOps.length > 0 && (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(219,0,29,0.42)' }}>
                                        {['Title', 'Deleted By', 'Deleted On', 'Days Remaining', ''].map(h => (
                                            <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', whiteSpace: 'nowrap' }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {binOps.map(op => {
                                        const id = op._id.toString()
                                        const daysRemaining = Math.max(0, 30 - Math.floor((Date.now() - new Date(op.deletedAt).getTime()) / 86400000))
                                        const isRestoring = restoringId === id
                                        const isPurging = purgingId === id
                                        return (
                                            <tr key={id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                <td style={{ padding: '8px 12px', color: 'rgba(237,237,237,0.75)', fontWeight: 700 }}>{op.title}</td>
                                                <td style={{ padding: '8px 12px', color: 'rgba(237,237,237,0.45)' }}>{op.deletedByName ?? '—'}</td>
                                                <td style={{ padding: '8px 12px', color: 'rgba(237,237,237,0.45)', whiteSpace: 'nowrap' }}>
                                                    {new Date(op.deletedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </td>
                                                <td style={{ padding: '8px 12px', color: daysRemaining <= 5 ? 'rgba(219,0,29,0.8)' : 'rgba(237,237,237,0.45)' }}>
                                                    {daysRemaining}d
                                                </td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                                                        <button
                                                            onClick={() => restoreFromBin(id)}
                                                            disabled={isRestoring || isPurging}
                                                            title='Restore'
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: 4,
                                                                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em',
                                                                padding: '3px 10px', cursor: isRestoring ? 'not-allowed' : 'pointer',
                                                                background: 'none', border: '1px solid rgba(34,197,94,0.3)',
                                                                color: isRestoring ? 'rgba(34,197,94,0.3)' : 'rgba(34,197,94,0.7)',
                                                            }}
                                                        >
                                                            <RestoreFromTrash style={{ fontSize: 13 }} />
                                                            {isRestoring ? 'Restoring…' : 'Restore'}
                                                        </button>
                                                        {isJ4 && (
                                                            <button
                                                                onClick={() => setConfirmPurgeId(id)}
                                                                disabled={isRestoring || isPurging}
                                                                title='Delete Permanently'
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                                    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em',
                                                                    padding: '3px 10px', cursor: isPurging ? 'not-allowed' : 'pointer',
                                                                    background: 'none', border: '1px solid rgba(219,0,29,0.42)',
                                                                    color: isPurging ? 'rgba(219,0,29,0.3)' : 'rgba(219,0,29,0.7)',
                                                                }}
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
                    )}

                    {confirmPurgeId && (
                        <ConfirmDialog
                            open
                            title='Delete Permanently'
                            message={`Permanently delete "${binOps.find(o => o._id.toString() === confirmPurgeId)?.title}"? This cannot be undone.`}
                            onConfirm={() => purgeFromBin(confirmPurgeId)}
                            onCancel={() => setConfirmPurgeId(null)}
                        />
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
                    border: '1px solid rgba(219,0,29,0.42)', borderLeft: '3px solid var(--red)',
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
