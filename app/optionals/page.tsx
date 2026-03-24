'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Typography, Switch, CircularProgress } from '@mui/material'
import { WarningAmber, CheckCircleOutline, Launch, RestartAlt, Tune, Engineering, Videocam, FlashOn, Psychology, DoneAll, DeleteOutline, Add, Close, EditOutlined } from '@mui/icons-material'

type ModEntry = { id: string; name: string }
type OptType = 'qol' | 'gfx' | 'zeus' | 'j2' | 'j5'

const TYPES: OptType[] = ['qol', 'gfx', 'zeus', 'j2', 'j5']
const GFX_KEY = 'asot-gfx-acknowledged'
const emptyRecord = (): Record<OptType, string[]> => ({ qol: [], gfx: [], zeus: [], j2: [], j5: [] })
const sortMods = (mods: ModEntry[]) => [...mods].sort((a, b) => a.name.localeCompare(b.name))


// ─── Mod row ──────────────────────────────────────────────────────────────────

function Mod({ details, enabled, loading, onToggle, editMode, onRemove }: {
    details: ModEntry
    enabled: boolean
    loading: boolean
    onToggle: (enabled: boolean) => void
    editMode: boolean
    onRemove: () => Promise<void>
}) {
    const [confirming, setConfirming] = useState(false)
    const [removing, setRemoving] = useState(false)

    async function handleConfirm() {
        setRemoving(true)
        try { await onRemove() }
        catch { setRemoving(false); setConfirming(false) }
    }

    if (confirming) return (
        <div
            className='flex items-center gap-2 px-3 py-[7px]'
            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(219,0,29,0.05)' }}
        >
            <Typography fontSize='0.78rem' style={{ flex: 1, color: 'rgba(237,237,237,0.5)' }}>
                Remove <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{details.name}</span>?
            </Typography>
            <button
                onClick={() => setConfirming(false)}
                disabled={removing}
                style={{
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(237,237,237,0.4)', padding: '2px 10px',
                    fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em',
                    textTransform: 'uppercase', cursor: 'pointer',
                }}
            >
                Cancel
            </button>
            <button
                onClick={handleConfirm}
                disabled={removing}
                style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'rgba(219,0,29,0.15)', border: '1px solid rgba(219,0,29,0.4)',
                    color: 'rgba(219,0,29,0.9)', padding: '2px 10px',
                    fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em',
                    textTransform: 'uppercase', cursor: removing ? 'not-allowed' : 'pointer',
                    opacity: removing ? 0.6 : 1,
                }}
            >
                {removing ? <CircularProgress size={10} style={{ color: 'rgba(219,0,29,0.8)' }} /> : <DeleteOutline style={{ fontSize: 12 }} />}
                Remove
            </button>
        </div>
    )

    return (
        <div
            className='flex flex-row items-center gap-2 px-3 py-[6px] rounded transition-colors group'
            style={{
                background: enabled ? 'rgba(219,0,29,0.05)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
        >
            <Link
                href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${details.id}`}
                target='_blank'
                className='flex items-center gap-2 min-w-0 flex-1'
            >
                <Typography
                    fontSize='0.82rem'
                    fontWeight={enabled ? 600 : 400}
                    letterSpacing='0.02em'
                    style={{
                        color: enabled ? 'var(--foreground)' : 'rgba(237,237,237,0.55)',
                        transition: 'color 0.15s',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {details.name}
                </Typography>
                <Launch style={{ fontSize: 11, color: 'rgba(237,237,237,0.2)', flexShrink: 0 }} />
            </Link>

            {editMode
                ? (
                    <button
                        onClick={() => setConfirming(true)}
                        title='Remove mod from list'
                        style={{
                            display: 'flex', alignItems: 'center',
                            background: 'transparent', border: 'none',
                            color: 'rgba(219,0,29,0.35)', cursor: 'pointer',
                            padding: '2px', flexShrink: 0,
                            transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.8)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.35)')}
                    >
                        <DeleteOutline style={{ fontSize: 14 }} />
                    </button>
                ) : (
                    loading
                        ? <CircularProgress size={16} style={{ color: 'rgba(219,0,29,0.5)', flexShrink: 0 }} />
                        : <Switch
                            size='small'
                            checked={enabled}
                            onChange={e => onToggle(e.currentTarget.checked)}
                            sx={{
                                flexShrink: 0,
                                '& .MuiSwitch-thumb': { background: enabled ? 'var(--red)' : 'rgba(237,237,237,0.3)' },
                                '& .MuiSwitch-track': { background: enabled ? 'rgba(219,0,29,0.35) !important' : 'rgba(255,255,255,0.1) !important', opacity: '1 !important' },
                            }}
                        />
                )
            }
        </div>
    )
}


// ─── Mod category card ────────────────────────────────────────────────────────

function ModCard({ title, icon, warning, list, type, enabledIds, loadingIds, isBulkLoading, editMode, onToggle, onToggleAll, onAddMod, onRemoveMod }: {
    title: string
    icon: React.ReactNode
    warning?: string
    list: ModEntry[]
    type: OptType
    enabledIds: string[]
    loadingIds: Set<string>
    isBulkLoading: boolean
    editMode: boolean
    onToggle: (id: string, name: string, enabled: boolean) => void
    onToggleAll: (enable: boolean) => void
    onAddMod: (id: string, name: string) => Promise<void>
    onRemoveMod: (id: string) => Promise<void>
}) {
    const [addingMod, setAddingMod] = useState(false)
    const [newId, setNewId] = useState('')
    const [newName, setNewName] = useState('')
    const [addLoading, setAddLoading] = useState(false)
    const [addError, setAddError] = useState('')

    const allEnabled = list.length > 0 && list.every(m => enabledIds.includes(m.id))

    async function handleAddSubmit() {
        const trimId = newId.trim()
        const trimName = newName.trim()
        if (!trimId || !trimName) return
        if (!/^\d+$/.test(trimId)) { setAddError('ID must be a numeric Steam Workshop ID'); return }

        setAddError('')
        setAddLoading(true)
        try {
            await onAddMod(trimId, trimName)
            setNewId('')
            setNewName('')
            setAddingMod(false)
        } catch (e: any) {
            setAddError(e.message ?? 'Failed to add mod')
        } finally {
            setAddLoading(false)
        }
    }

    function handleCancel() {
        setAddingMod(false)
        setNewId('')
        setNewName('')
        setAddError('')
    }

    const inputStyle: React.CSSProperties = {
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'var(--foreground)',
        padding: '6px 10px',
        fontSize: '0.78rem',
        outline: 'none',
        width: '100%',
    }

    return (
        <div
            className='flex flex-col'
            style={{
                border: '1px solid rgba(219,0,29,0.15)',
                borderTop: '2px solid var(--red)',
                background: 'rgba(255,255,255,0.02)',
            }}
        >
            {/* Card header */}
            <div className='flex items-center gap-3 px-4 py-3' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'var(--red)', display: 'flex', opacity: 0.8 }}>{icon}</span>
                <Typography fontWeight={600} fontSize='0.8rem' letterSpacing={2} style={{ textTransform: 'uppercase', flex: 1 }}>
                    {title}
                </Typography>

                {/* Toggle all (hidden in edit mode) */}
                {!editMode && (
                    <button
                        onClick={() => onToggleAll(!allEnabled)}
                        disabled={isBulkLoading || list.length === 0}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(237,237,237,0.4)', padding: '2px 8px',
                            fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            cursor: isBulkLoading || list.length === 0 ? 'not-allowed' : 'pointer',
                            opacity: isBulkLoading ? 0.4 : 1,
                            transition: 'all 0.2s',
                        }}
                    >
                        {isBulkLoading
                            ? <CircularProgress size={10} style={{ color: 'rgba(237,237,237,0.4)' }} />
                            : <DoneAll style={{ fontSize: 11 }} />
                        }
                        {allEnabled ? 'Disable All' : 'Enable All'}
                    </button>
                )}

                <span style={{
                    fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em',
                    color: 'rgba(219,0,29,0.7)', background: 'rgba(219,0,29,0.08)',
                    border: '1px solid rgba(219,0,29,0.2)', padding: '2px 8px',
                }}>
                    {list.length} MODS
                </span>
            </div>

            {/* Warning banner */}
            {warning && (
                <div className='flex items-center gap-2 px-4 py-2' style={{ background: 'rgba(255,160,0,0.06)', borderBottom: '1px solid rgba(255,160,0,0.12)' }}>
                    <WarningAmber style={{ fontSize: 13, color: 'rgba(255,160,0,0.7)' }} />
                    <Typography fontSize='0.72rem' style={{ color: 'rgba(255,160,0,0.7)' }}>{warning}</Typography>
                </div>
            )}

            {/* Mod list */}
            <div className='flex flex-col px-1 py-2'>
                {list.length === 0
                    ? <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.25)', padding: '8px 12px' }}>No mods in this category</Typography>
                    : list.map(mod => (
                        <Mod
                            key={mod.id}
                            details={mod}
                            enabled={enabledIds.includes(mod.id)}
                            loading={isBulkLoading || loadingIds.has(mod.id)}
                            onToggle={enabled => onToggle(mod.id, mod.name, enabled)}
                            editMode={editMode}
                            onRemove={() => onRemoveMod(mod.id)}
                        />
                    ))
                }
            </div>

            {/* Add mod (edit mode only) */}
            {editMode && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {addingMod ? (
                        <div className='flex flex-col gap-2 px-3 py-3' style={{ background: 'rgba(219,0,29,0.02)' }}>
                            <input
                                placeholder='Steam Workshop ID (numeric)'
                                value={newId}
                                onChange={e => setNewId(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddSubmit()}
                                style={inputStyle}
                            />
                            <input
                                placeholder='Mod name'
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddSubmit()}
                                style={inputStyle}
                            />
                            {addError && (
                                <Typography fontSize='0.72rem' style={{ color: 'rgba(219,0,29,0.8)' }}>{addError}</Typography>
                            )}
                            <div className='flex gap-2'>
                                <button
                                    onClick={handleCancel}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'rgba(237,237,237,0.4)', padding: '7px 14px',
                                        fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.1em',
                                        textTransform: 'uppercase', cursor: 'pointer',
                                    }}
                                >
                                    <Close style={{ fontSize: 13 }} />
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddSubmit}
                                    disabled={addLoading || !newId.trim() || !newName.trim()}
                                    style={{
                                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        background: 'var(--red)', border: '1px solid var(--red)',
                                        color: 'white', padding: '7px',
                                        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em',
                                        textTransform: 'uppercase',
                                        cursor: addLoading || !newId.trim() || !newName.trim() ? 'not-allowed' : 'pointer',
                                        opacity: !newId.trim() || !newName.trim() ? 0.4 : 1,
                                        transition: 'opacity 0.2s',
                                    }}
                                >
                                    {addLoading ? <CircularProgress size={12} style={{ color: 'white' }} /> : <Add style={{ fontSize: 14 }} />}
                                    Add Mod
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setAddingMod(true)}
                            className='w-full flex items-center justify-center gap-2'
                            style={{
                                background: 'transparent', border: 'none',
                                color: 'rgba(219,0,29,0.5)', padding: '10px',
                                fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em',
                                textTransform: 'uppercase', cursor: 'pointer',
                                transition: 'color 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.85)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(219,0,29,0.5)')}
                        >
                            <Add style={{ fontSize: 14 }} />
                            Add Mod
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}


// ─── FPS warning modal ────────────────────────────────────────────────────────

function GfxWarningModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
    const [countdown, setCountdown] = useState(5)

    useEffect(() => {
        if (countdown === 0) return
        const t = setTimeout(() => setCountdown(c => c - 1), 1000)
        return () => clearTimeout(t)
    }, [countdown])

    return (
        <div
            className='fixed inset-0 flex items-center justify-center z-50'
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
            onClick={onCancel}
        >
            <div
                className='flex flex-col gap-5 mx-4'
                style={{
                    maxWidth: 460, width: '100%',
                    border: '1px solid rgba(219,0,29,0.2)', borderTop: '2px solid var(--red)',
                    background: 'rgb(12,12,14)', padding: '2rem',
                }}
                onClick={e => e.stopPropagation()}
            >
                <div className='flex flex-col items-center gap-3'>
                    <WarningAmber style={{ fontSize: 40, color: 'var(--red)', opacity: 0.85 }} />
                    <Typography fontWeight={700} fontSize='0.95rem' letterSpacing={4} style={{ textTransform: 'uppercase' }}>
                        Performance Warning
                    </Typography>
                    <div style={{ width: 40, height: 2, background: 'var(--red)' }} />
                </div>

                <Typography style={{ color: 'rgba(237,237,237,0.6)', fontSize: '0.875rem', lineHeight: 1.75, textAlign: 'center' }}>
                    FPS-Intensive mods can significantly degrade game performance and stability — expect reduced FPS, longer load times, and potential crashes.
                    <br /><br />
                    Only enable mods you understand and intend to use.
                </Typography>

                <div className='flex gap-3'>
                    <button
                        onClick={onCancel}
                        style={{
                            flex: 1, padding: '9px',
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(237,237,237,0.4)',
                            fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em',
                            textTransform: 'uppercase', cursor: 'pointer',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={countdown > 0}
                        style={{
                            flex: 2, padding: '9px',
                            background: countdown > 0 ? 'rgba(219,0,29,0.25)' : 'var(--red)',
                            border: '1px solid var(--red)',
                            color: 'white',
                            fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            cursor: countdown > 0 ? 'not-allowed' : 'pointer',
                            transition: 'background 0.3s',
                        }}
                    >
                        {countdown > 0 ? `I Understand, Enable (${countdown})` : 'I Understand, Enable'}
                    </button>
                </div>
            </div>
        </div>
    )
}


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Page() {

    const [lists, setLists] = useState<Record<OptType, ModEntry[]>>({ qol: [], gfx: [], zeus: [], j2: [], j5: [] })
    const [enabledIds, setEnabledIds] = useState<Record<OptType, string[]>>(emptyRecord())
    const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
    const [bulkLoading, setBulkLoading] = useState<Set<OptType>>(new Set())
    const [initialLoading, setInitialLoading] = useState(true)
    const [resetting, setResetting] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [showGfxWarning, setShowGfxWarning] = useState(false)
    const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

    // Load all mod lists and user's enabled state in parallel
    useEffect(() => {
        Promise.all([
            ...TYPES.map(t => fetch(`/optionals/fetch?type=${t}`).then(r => r.json())),
            fetch('/optionals/me?mode=all').then(r => r.json()),
        ]).then(([qol, gfx, zeus, j2, j5, user]) => {
            setLists({ qol: sortMods(qol), gfx: sortMods(gfx), zeus: sortMods(zeus), j2: sortMods(j2), j5: sortMods(j5) })
            if (!user.error) {
                setEnabledIds({
                    qol: (user.qol ?? []).map((m: ModEntry) => m.id),
                    gfx: (user.gfx ?? []).map((m: ModEntry) => m.id),
                    zeus: (user.zeus ?? []).map((m: ModEntry) => m.id),
                    j2: (user.j2 ?? []).map((m: ModEntry) => m.id),
                    j5: (user.j5 ?? []).map((m: ModEntry) => m.id),
                })
                setIsAdmin(user.isAdmin ?? false)
            }
            setInitialLoading(false)
        })
    }, [])

    function doToggle(type: OptType, id: string, name: string, enable: boolean) {
        const prev = enabledIds[type]

        setEnabledIds(cur => ({ ...cur, [type]: enable ? [...cur[type], id] : cur[type].filter(i => i !== id) }))
        setLoadingIds(cur => new Set(cur).add(id))

        const url = enable
            ? `/optionals/me?type=${type}&id=${id}&mode=add&name=${encodeURIComponent(name)}`
            : `/optionals/me?type=${type}&id=${id}&mode=remove`

        fetch(url).then(r => r.json()).then(json => {
            if (json.error) setEnabledIds(cur => ({ ...cur, [type]: prev }))
        }).finally(() => {
            setLoadingIds(cur => { const n = new Set(cur); n.delete(id); return n })
        })
    }

    function doToggleAll(type: OptType, enable: boolean) {
        const prev = enabledIds[type]

        setEnabledIds(cur => ({ ...cur, [type]: enable ? lists[type].map(m => m.id) : [] }))
        setBulkLoading(cur => new Set(cur).add(type))

        fetch('/optionals/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, action: enable ? 'enable-all' : 'disable-all', mods: lists[type] }),
        }).then(r => r.json()).then(json => {
            if (json.error) setEnabledIds(cur => ({ ...cur, [type]: prev }))
        }).finally(() => {
            setBulkLoading(cur => { const n = new Set(cur); n.delete(type); return n })
        })
    }

    function withGfxCheck(action: () => void) {
        if (sessionStorage.getItem(GFX_KEY)) return action()
        setPendingAction(() => action)
        setShowGfxWarning(true)
    }

    function handleToggle(type: OptType, id: string, name: string, enable: boolean) {
        if (type === 'gfx' && enable) withGfxCheck(() => doToggle(type, id, name, enable))
        else doToggle(type, id, name, enable)
    }

    function handleToggleAll(type: OptType, enable: boolean) {
        if (type === 'gfx' && enable) withGfxCheck(() => doToggleAll(type, enable))
        else doToggleAll(type, enable)
    }

    function handleGfxConfirm() {
        sessionStorage.setItem(GFX_KEY, '1')
        setShowGfxWarning(false)
        pendingAction?.()
        setPendingAction(null)
    }

    function handleGfxCancel() {
        setShowGfxWarning(false)
        setPendingAction(null)
    }

    async function handleAddMod(type: OptType, id: string, name: string) {
        const res = await fetch('/optionals/manage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', type, id, name }),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        setLists(cur => ({ ...cur, [type]: sortMods([...cur[type], { id, name }]) }))
    }

    async function handleRemoveMod(type: OptType, id: string) {
        const res = await fetch('/optionals/manage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'remove', type, id }),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        setLists(cur => ({ ...cur, [type]: cur[type].filter(m => m.id !== id) }))
        setEnabledIds(cur => ({ ...cur, [type]: cur[type].filter(i => i !== id) }))
    }

    function handleReset() {
        setResetting(true)
        fetch('/optionals/reset').then(r => r.json()).then(j => {
            if (j.error) { alert(j.error); setResetting(false); return }
            if (j.success) { setEnabledIds(emptyRecord()); setResetting(false) }
        })
    }

    const cardProps = (type: OptType) => ({
        list: lists[type],
        type,
        enabledIds: enabledIds[type],
        loadingIds,
        isBulkLoading: bulkLoading.has(type),
        editMode,
        onToggle: (id: string, name: string, en: boolean) => handleToggle(type, id, name, en),
        onToggleAll: (en: boolean) => handleToggleAll(type, en),
        onAddMod: (id: string, name: string) => handleAddMod(type, id, name),
        onRemoveMod: (id: string) => handleRemoveMod(type, id),
    })

    return (
        <div className='w-full flex flex-col gap-8'>

            {showGfxWarning && <GfxWarningModal onConfirm={handleGfxConfirm} onCancel={handleGfxCancel} />}

            {/* Header */}
            <div className='flex flex-col sm:flex-row sm:items-start justify-between gap-4'>
                <div>
                    <Typography fontWeight={700} fontSize='1.4rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        Configure Optional Addons
                    </Typography>
                    <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.4)', marginTop: 4 }}>
                        Only enable addons you know and use regularly — some have significant performance impact.
                    </Typography>
                </div>

                <div className='flex items-center gap-3 shrink-0'>
                    <div className='flex items-center gap-2' style={{ color: 'rgba(237,237,237,0.35)', fontSize: '0.75rem', letterSpacing: '0.06em' }}>
                        <CheckCircleOutline style={{ fontSize: 14, color: 'rgba(80,200,80,0.6)' }} />
                        Auto-saved
                    </div>

                    {isAdmin && (
                        <>
                            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
                            <button
                                onClick={() => setEditMode(e => !e)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    background: editMode ? 'rgba(219,0,29,0.12)' : 'transparent',
                                    border: `1px solid ${editMode ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.15)'}`,
                                    color: editMode ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.45)',
                                    padding: '6px 14px',
                                    fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.1em',
                                    textTransform: 'uppercase', cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <EditOutlined style={{ fontSize: 13 }} />
                                {editMode ? 'Done' : 'Edit Lists'}
                            </button>
                        </>
                    )}

                    <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />

                    <button
                        onClick={handleReset}
                        disabled={resetting}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'transparent', border: '1px solid rgba(219,0,29,0.3)',
                            color: 'rgba(219,0,29,0.8)', padding: '6px 14px',
                            fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            cursor: resetting ? 'not-allowed' : 'pointer',
                            opacity: resetting ? 0.5 : 1,
                            transition: 'all 0.2s',
                        }}
                    >
                        <RestartAlt style={{ fontSize: 14 }} />
                        Disable All
                    </button>
                </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'linear-gradient(to right, rgba(219,0,29,0.4), rgba(255,255,255,0.06), transparent)' }} />

            {initialLoading ? (
                <div className='flex items-center justify-center' style={{ minHeight: 200 }}>
                    <CircularProgress style={{ color: 'var(--red)' }} />
                </div>
            ) : (
                <>
                    {/* General addons */}
                    <div className='flex flex-col gap-3'>
                        <div className='flex items-center gap-3'>
                            <Typography fontSize='0.7rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                                General Addons
                            </Typography>
                            <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.06)' }} />
                        </div>
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                            <ModCard title='Quality of Life' icon={<Tune fontSize='small' />} {...cardProps('qol')} />
                            <ModCard
                                title='FPS-Intensive Mods' icon={<FlashOn fontSize='small' />}
                                warning='Some of these addons may significantly affect your performance.'
                                {...cardProps('gfx')}
                            />
                        </div>
                    </div>

                    {/* Department addons */}
                    <div className='flex flex-col gap-3'>
                        <div className='flex items-center gap-3'>
                            <Typography fontSize='0.7rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                                Department Addons
                            </Typography>
                            <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.06)' }} />
                        </div>
                        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                            <ModCard title='J2 Mission Making' icon={<Engineering fontSize='small' />} {...cardProps('j2')} />
                            <ModCard title='J5 Media' icon={<Videocam fontSize='small' />} {...cardProps('j5')} />
                            <ModCard title='J6 Zeus' icon={<Psychology fontSize='small' />} {...cardProps('zeus')} />
                        </div>
                    </div>
                </>
            )}

        </div>
    )
}
