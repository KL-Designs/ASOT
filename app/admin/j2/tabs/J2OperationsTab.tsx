'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Typography, LinearProgress } from '@mui/material'
import {
    Edit, ContentCopy, Delete, Add, BookmarkAdd, BookmarkAdded,
    ExpandMore, ExpandLess, NoteAlt, Search, Close,
    ChevronLeft, ChevronRight, ViewList, AccountTree, FolderOpen, Check,
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
type ViewMode = 'list' | 'campaigns'

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
            if (data.id) { window.open(`/operations/edit?op=${data.id}`, '_blank'); onClose() }
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
                            <div key={tid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                                    <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 3 }}>
                                        {t.sections?.length ?? 0} section{(t.sections?.length ?? 0) !== 1 ? 's' : ''} · {new Date(t.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </div>
                                </div>
                                <button onClick={() => apply(tid)} disabled={!!applying} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 14px', cursor: applying ? 'not-allowed' : 'pointer', background: isApplying ? 'rgba(219,0,29,0.15)' : 'var(--red)', border: '1px solid var(--red)', color: 'white', transition: 'background 0.15s' }}>
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
                    background: open ? 'rgba(255,255,255,0.02)' : 'transparent',
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
                                    background: isActive ? 'rgba(100,150,237,0.08)' : 'rgba(255,255,255,0.02)',
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
                    background: open ? 'rgba(255,255,255,0.02)' : 'transparent', transition: 'background 0.15s',
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

function OpRow({ op, onDelete, onDuplicate, onNotesSaved, onTemplateSaved, onAssigned, onRemoved }: {
    op: Operation
    onDelete: (id: string) => void
    onDuplicate: (id: string) => void
    onNotesSaved: (id: string, notes: string) => void
    onTemplateSaved: () => void
    onAssigned: (opId: string, campaignId: string, campaignName: string) => void
    onRemoved: (opId: string) => void
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
                        {/* eslint-disable-next-line @next/next/no-img-element */}
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
                    <a href={`/operations/edit?op=${id}`} target='_blank' rel='noreferrer' title='Edit mission'>
                        <button style={iconBtn()} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.85)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.3)')}><Edit style={{ fontSize: 15 }} /></button>
                    </a>
                    <button onClick={duplicate} disabled={duplicating} title='Duplicate' style={iconBtn()} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.85)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.3)')}><ContentCopy style={{ fontSize: 14 }} /></button>
                    <button onClick={() => setTemplateFormOpen(t => !t)} title='Save as template' style={{ ...iconBtn(), color: templateFormOpen ? 'rgba(219,160,0,0.8)' : 'rgba(237,237,237,0.3)' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,160,0,0.8)')} onMouseLeave={e => (e.currentTarget.style.color = templateFormOpen ? 'rgba(219,160,0,0.8)' : 'rgba(237,237,237,0.3)')}>
                        {templateFormOpen ? <BookmarkAdded style={{ fontSize: 15 }} /> : <BookmarkAdd style={{ fontSize: 15 }} />}
                    </button>
                    <button onClick={() => setConfirmOpen(true)} title='Delete' style={iconBtn(true)} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.9)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.4)')}><Delete style={{ fontSize: 15 }} /></button>
                </div>
            </div>

            {templateFormOpen && <SaveTemplateForm op={op} onSaved={() => { setTemplateFormOpen(false); onTemplateSaved() }} onCancel={() => setTemplateFormOpen(false)} />}
            <AssignCampaignSection op={op} onAssigned={onAssigned} onRemoved={onRemoved} />
            <NotesRow op={op} onSaved={onNotesSaved} />

            <ConfirmDialog open={confirmOpen} title='Delete Mission' message={`Delete "${op.title}"? This cannot be undone.`}
                onConfirm={() => { setConfirmOpen(false); fetch(`/api/operations/delete?id=${id}`).then(() => onDelete(id)) }}
                onCancel={() => setConfirmOpen(false)} />
        </div>
    )
}

// ── Campaign group (campaigns view) ───────────────────────────────────────────

function CampaignGroup({ campaign, missions, onDelete, onDuplicate, onNotesSaved, onTemplateSaved, onAssigned, onRemoved, onCampaignRenamed, onCampaignDeleted }: {
    campaign: OperationCampaign | null   // null = Standalone group
    missions: Operation[]
    onDelete: (id: string) => void
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
                                <button onClick={() => setConfirmDeleteId(tid)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(219,0,29,0.35)', display: 'flex', transition: 'color 0.15s' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.85)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.35)')}>
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

export default function J2OperationsTab() {
    const [missions, setMissions] = useState<Operation[]>([])
    const [loading, setLoading] = useState(true)
    const [viewMode, setViewMode] = useState<ViewMode>('list')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(0)
    const [creating, setCreating] = useState(false)
    const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
    const [templateRefreshKey, setTemplateRefreshKey] = useState(0)
    const [campaigns, setCampaigns] = useState<OperationCampaign[]>([])
    const [campaignsLoaded, setCampaignsLoaded] = useState(false)

    useEffect(() => {
        setLoading(true)
        fetch('/api/operations')
            .then(r => r.json())
            .then(data => setMissions(data.missions ?? []))
            .finally(() => setLoading(false))
    }, [])

    // Lazy-load campaigns when first switching to campaigns view
    useEffect(() => {
        if (viewMode !== 'campaigns' || campaignsLoaded) return
        fetch('/api/operations/campaigns')
            .then(r => r.json())
            .then(data => { setCampaigns(data.campaigns ?? []); setCampaignsLoaded(true) })
    }, [viewMode, campaignsLoaded])

    useEffect(() => { setPage(0) }, [statusFilter, search])

    const handleDelete = useCallback((id: string) => {
        setMissions(ms => ms.filter(m => m._id.toString() !== id))
    }, [])

    const handleDuplicate = useCallback(() => {
        fetch('/api/operations').then(r => r.json()).then(data => setMissions(data.missions ?? []))
    }, [])

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
                fetch('/api/operations').then(r => r.json()).then(d => setMissions(d.missions ?? []))
                window.open(`/operations/edit?op=${data.id}`, '_blank')
            }
        } finally { setCreating(false) }
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
    }

    return (
        <div className='p-6 flex flex-col gap-0 max-w-[900px]'>

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginRight: 'auto' }}>
                    {missions.length} Mission{missions.length !== 1 ? 's' : ''}
                </span>

                {/* View toggle */}
                <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {(['list', 'campaigns'] as ViewMode[]).map(v => {
                        const active = viewMode === v
                        return (
                            <button key={v} onClick={() => setViewMode(v)} style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                padding: '5px 12px', cursor: 'pointer',
                                background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                                border: 'none', borderRight: v === 'list' ? '1px solid rgba(255,255,255,0.1)' : 'none',
                                color: active ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.3)',
                                transition: 'all 0.15s',
                            }}>
                                {v === 'list' ? <ViewList style={{ fontSize: 13 }} /> : <AccountTree style={{ fontSize: 13 }} />}
                                {v === 'list' ? 'List' : 'Campaigns'}
                            </button>
                        )
                    })}
                </div>

                <button onClick={() => setTemplatePickerOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.6)' }}>
                    <BookmarkAdd style={{ fontSize: 14 }} />From Template
                </button>
                <button onClick={createMission} disabled={creating} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px', cursor: creating ? 'not-allowed' : 'pointer', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.3)', color: creating ? 'rgba(219,0,29,0.3)' : 'rgba(219,0,29,0.8)' }}>
                    <Add style={{ fontSize: 14 }} />{creating ? 'Creating…' : 'New Mission'}
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
                    <CreateCampaignForm onCreated={c => setCampaigns(cs => [c, ...cs])} />

                    {!campaignsLoaded && <Typography style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.3)' }}>Loading campaigns…</Typography>}

                    {campaignsLoaded && campaigns.map(c => (
                        <CampaignGroup
                            key={c._id.toString()}
                            campaign={c}
                            missions={missionsByCampaign.get(c._id.toString()) ?? []}
                            {...opRowProps}
                            onCampaignRenamed={(id, name) => setCampaigns(cs => cs.map(x => x._id.toString() === id ? { ...x, name } : x))}
                            onCampaignDeleted={id => {
                                setCampaigns(cs => cs.filter(x => x._id.toString() !== id))
                                setMissions(ms => ms.map(m => m.campaignId?.toString() === id ? { ...m, campaignId: undefined } : m))
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
                </>
            )}

            {templatePickerOpen && <TemplatePicker onClose={() => setTemplatePickerOpen(false)} />}
        </div>
    )
}
