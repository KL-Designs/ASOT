'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
    Typography, Button, CircularProgress,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, IconButton, Avatar,
} from '@mui/material'
import { Edit, Close, AccountTree, Warning, ArrowUpward, ArrowDownward, Add, Delete } from '@mui/icons-material'


const STRUCTURAL = ['companyHQ', 'activeReservist', 'inactiveReservist', 'gamemaster']

const STRUCTURAL_LABELS: Record<string, string> = {
    companyHQ:        'India Company HQ',
    activeReservist:  'Company Reservists (Active)',
    inactiveReservist:'Company Reservists (Inactive)',
    gamemaster:       'Gamemasters',
}

const tileStyle = {
    border: '1px solid rgba(219,0,29,0.15)',
    borderTop: '2px solid var(--red)',
    background: 'rgba(255,255,255,0.02)',
}

const rowStyle = {
    border: '1px solid rgba(219,0,29,0.08)',
    background: 'rgba(255,255,255,0.015)',
}

const redBtn = {
    fontSize: '0.72rem',
    borderColor: 'rgba(219,0,29,0.4)',
    color: 'rgba(219,0,29,0.8)',
    '&:hover': { borderColor: 'var(--red)', background: 'rgba(219,0,29,0.08)' },
}

const ghostBtn = {
    fontSize: '0.72rem',
    color: 'rgba(237,237,237,0.4)',
    '&:hover': { color: 'rgba(237,237,237,0.7)' },
}

const addBtn = {
    fontSize: '0.67rem',
    letterSpacing: '0.1em',
    color: 'rgba(237,237,237,0.2)',
    '&:hover': { color: 'rgba(237,237,237,0.45)', background: 'transparent' },
    textTransform: 'none' as const,
    padding: '2px 6px',
    minWidth: 0,
    justifyContent: 'flex-start',
}


type PickerUser = { id: string; displayName: string; avatarURL: string }

type Section = {
    title: string
    sectionOrder: number
    positions: OrbatPositionWithUser[]
}

function buildSections(positions: OrbatPositionWithUser[], cat: string): Section[] {
    const catPos = positions.filter(p => p.category === cat)
    const map = new Map<string, OrbatPositionWithUser[]>()
    for (const p of catPos) {
        const key = p.sectionTitle ?? ''
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(p)
    }
    const sections: Section[] = []
    for (const [title, poses] of map.entries()) {
        const sorted = [...poses].sort((a, b) => a.positionOrder - b.positionOrder)
        sections.push({ title, sectionOrder: sorted[0]?.sectionOrder ?? 0, positions: sorted })
    }
    return sections.sort((a, b) => a.sectionOrder - b.sectionOrder)
}


export default function OrbatManager({ initialUsers }: { initialUsers: PickerUser[] }) {

    const [positions, setPositions] = useState<OrbatPositionWithUser[]>([])
    const [categories, setCategories] = useState<OrbatCategory[]>([])
    const [loading, setLoading] = useState(true)
    const allUsers = initialUsers

    // Inline edit state
    const [editRoleId, setEditRoleId] = useState<string | null>(null)
    const [editRoleVal, setEditRoleVal] = useState('')
    const [editSectionKey, setEditSectionKey] = useState<string | null>(null)  // `${cat}::${title}`
    const [editSectionVal, setEditSectionVal] = useState('')
    const [editCatKey, setEditCatKey] = useState<string | null>(null)
    const [editCatVal, setEditCatVal] = useState('')

    // Add state
    const [addSectionCat, setAddSectionCat] = useState<string | null>(null)
    const [addSectionVal, setAddSectionVal] = useState('')
    const [addRoleKey, setAddRoleKey] = useState<string | null>(null)  // `${cat}::${sectionTitle}`
    const [addRoleVal, setAddRoleVal] = useState('')
    const [addingCat, setAddingCat] = useState(false)
    const [addCatVal, setAddCatVal] = useState('')

    // User picker state
    const [pickerOpen, setPickerOpen] = useState<string | null>(null)
    const [userSearch, setUserSearch] = useState('')
    const [savingId, setSavingId] = useState<string | null>(null)

    // Conflict dialog
    const [conflict, setConflict] = useState<{ position: OrbatPositionWithUser; pendingUserId: string; pendingPositionId: string } | null>(null)
    const [resolvingConflict, setResolvingConflict] = useState(false)

    // Confirmation dialogs
    const [confirmDeleteSection, setConfirmDeleteSection] = useState<{ cat: string; sectionTitle: string } | null>(null)
    const [confirmDeleteCat, setConfirmDeleteCat] = useState<string | null>(null)
    const [confirmDeletePos, setConfirmDeletePos] = useState<string | null>(null)

    // Import dialog
    const [importOpen, setImportOpen] = useState(false)
    const [importConfirm, setImportConfirm] = useState('')
    const [importing, setImporting] = useState(false)
    const [importResult, setImportResult] = useState<{ inserted: number; matched: number } | null>(null)

    const [busy, setBusy] = useState(false)


    const load = useCallback(async () => {
        setLoading(true)
        const [posRes, catRes] = await Promise.all([
            fetch('/api/admin/orbat'),
            fetch('/api/admin/orbat/categories'),
        ])
        if (posRes.ok) setPositions(await posRes.json())
        if (catRes.ok) setCategories(await catRes.json())
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])


    // ── User assignment ──────────────────────────────────────────────────────

    async function assign(positionId: string, userId: string | null) {
        setSavingId(positionId)
        const res = await fetch(`/api/admin/orbat/${positionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
        })
        if (res.status === 409) {
            const data = await res.json()
            const conflictPos = positions.find(p => p._id.toString() === data.conflict._id.toString())
            if (conflictPos && userId) {
                setConflict({ position: conflictPos, pendingUserId: userId, pendingPositionId: positionId })
            }
            setSavingId(null)
            setPickerOpen(null)
            return
        }
        if (res.ok) { setPickerOpen(null); await load() }
        setSavingId(null)
    }

    async function resolveConflict() {
        if (!conflict) return
        setResolvingConflict(true)
        await fetch(`/api/admin/orbat/${conflict.position._id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: null }),
        })
        await fetch(`/api/admin/orbat/${conflict.pendingPositionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: conflict.pendingUserId }),
        })
        setConflict(null)
        setResolvingConflict(false)
        await load()
    }


    // ── Role CRUD ────────────────────────────────────────────────────────────

    async function saveRole(positionId: string, role: string) {
        if (!role.trim()) { setEditRoleId(null); return }
        setBusy(true)
        await fetch(`/api/admin/orbat/${positionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: role.trim() }),
        })
        setEditRoleId(null)
        setBusy(false)
        await load()
    }

    async function deletePosition(positionId: string) {
        setBusy(true)
        await fetch(`/api/admin/orbat/${positionId}`, { method: 'DELETE' })
        setConfirmDeletePos(null)
        setBusy(false)
        await load()
    }

    async function addRole(cat: string, sectionTitle: string, role: string) {
        if (!role.trim()) return
        setBusy(true)
        await fetch('/api/admin/orbat/positions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, sectionTitle, role: role.trim() }),
        })
        setAddRoleKey(null)
        setAddRoleVal('')
        setBusy(false)
        await load()
    }

    async function movePosition(sec: Section, positionId: string, dir: 'up' | 'down') {
        const idx = sec.positions.findIndex(p => p._id.toString() === positionId)
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1
        if (idx < 0 || swapIdx < 0 || swapIdx >= sec.positions.length) return
        const curr = sec.positions[idx]
        const swap = sec.positions[swapIdx]
        setBusy(true)
        await Promise.all([
            fetch(`/api/admin/orbat/${curr._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ positionOrder: swap.positionOrder }),
            }),
            fetch(`/api/admin/orbat/${swap._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ positionOrder: curr.positionOrder }),
            }),
        ])
        setBusy(false)
        await load()
    }


    // ── Section CRUD ─────────────────────────────────────────────────────────

    async function saveSection(cat: string, oldTitle: string, newTitle: string) {
        if (!newTitle.trim()) { setEditSectionKey(null); return }
        setBusy(true)
        await fetch('/api/admin/orbat/sections', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, oldTitle, newTitle: newTitle.trim() }),
        })
        setEditSectionKey(null)
        setBusy(false)
        await load()
    }

    async function addSection(cat: string, sectionTitle: string) {
        if (!sectionTitle.trim()) return
        setBusy(true)
        await fetch('/api/admin/orbat/sections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, sectionTitle: sectionTitle.trim() }),
        })
        setAddSectionCat(null)
        setAddSectionVal('')
        setBusy(false)
        await load()
    }

    async function deleteSection(cat: string, sectionTitle: string) {
        setBusy(true)
        await fetch('/api/admin/orbat/sections', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, sectionTitle }),
        })
        setConfirmDeleteSection(null)
        setBusy(false)
        await load()
    }

    async function moveSection(cat: string, sectionTitle: string, dir: 'up' | 'down') {
        setBusy(true)
        await fetch('/api/admin/orbat/sections', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, sectionTitle, direction: dir }),
        })
        setBusy(false)
        await load()
    }


    // ── Category CRUD ────────────────────────────────────────────────────────

    async function saveCategory(key: string, label: string) {
        if (!label.trim()) { setEditCatKey(null); return }
        setBusy(true)
        await fetch('/api/admin/orbat/categories', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, label: label.trim() }),
        })
        setEditCatKey(null)
        setBusy(false)
        await load()
    }

    async function addCategory(label: string) {
        if (!label.trim()) return
        setBusy(true)
        await fetch('/api/admin/orbat/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: label.trim() }),
        })
        setAddingCat(false)
        setAddCatVal('')
        setBusy(false)
        await load()
    }

    async function deleteCategory(key: string) {
        setBusy(true)
        await fetch('/api/admin/orbat/categories', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key }),
        })
        setConfirmDeleteCat(null)
        setBusy(false)
        await load()
    }


    // ── Import ───────────────────────────────────────────────────────────────

    async function runImport() {
        setImporting(true)
        const res = await fetch('/api/admin/orbat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirm: true }),
        })
        if (res.ok) {
            setImportResult(await res.json())
            await load()
        }
        setImporting(false)
        setImportOpen(false)
        setImportConfirm('')
    }


    // ── Derived ──────────────────────────────────────────────────────────────

    const platoonCats = categories.filter(c => !STRUCTURAL.includes(c._id))
    const pickerPosition = pickerOpen ? positions.find(p => p._id.toString() === pickerOpen) : null
    const filteredUsers = allUsers.filter(u =>
        u.displayName.toLowerCase().includes(userSearch.toLowerCase())
    )


    // ── Sub-renders ──────────────────────────────────────────────────────────

    function renderPositionRow(pos: OrbatPositionWithUser, sec: Section, posIdx: number) {
        const posId = pos._id.toString()
        const isSaving = savingId === posId
        const isEditing = editRoleId === posId

        return (
            <div key={posId} className='flex items-center gap-1.5 px-2 py-1' style={rowStyle}>

                {/* Role name */}
                <div className='flex-1 min-w-0'>
                    {isEditing ? (
                        <TextField
                            size='small'
                            value={editRoleVal}
                            onChange={e => setEditRoleVal(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') saveRole(posId, editRoleVal)
                                if (e.key === 'Escape') setEditRoleId(null)
                            }}
                            onBlur={() => saveRole(posId, editRoleVal)}
                            autoFocus
                            fullWidth
                            inputProps={{ style: { fontSize: '0.73rem', padding: '2px 6px' } }}
                            sx={{ '& .MuiOutlinedInput-root': { height: 24 } }}
                        />
                    ) : (
                        <Typography
                            fontSize='0.73rem'
                            noWrap
                            style={{
                                color: pos.isSenior ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.62)',
                                fontWeight: pos.isSenior ? 700 : 400,
                            }}
                        >
                            {pos.role}
                        </Typography>
                    )}
                </div>

                {/* Assigned user */}
                <div className='flex items-center gap-1 shrink-0'>
                    {pos.user ? (
                        <>
                            <Avatar src={pos.user.avatarURL} sx={{ width: 16, height: 16, fontSize: '0.5rem' }} />
                            <Typography fontSize='0.68rem' noWrap style={{ color: 'rgba(237,237,237,0.75)', maxWidth: 90 }}>
                                {pos.user.displayName}
                            </Typography>
                        </>
                    ) : (
                        <Typography fontSize='0.65rem' fontStyle='italic' style={{ color: 'rgba(237,237,237,0.15)' }}>
                            Vacant
                        </Typography>
                    )}
                </div>

                {/* Actions */}
                <div className='flex items-center shrink-0'>
                    {isSaving ? (
                        <CircularProgress size={12} sx={{ color: 'var(--red)', opacity: 0.6 }} />
                    ) : (
                        <>
                            <IconButton size='small' disabled={posIdx === 0 || busy} onClick={() => movePosition(sec, posId, 'up')} sx={{ ...ghostBtn, padding: '1px' }}>
                                <ArrowUpward sx={{ fontSize: 11 }} />
                            </IconButton>
                            <IconButton size='small' disabled={posIdx === sec.positions.length - 1 || busy} onClick={() => movePosition(sec, posId, 'down')} sx={{ ...ghostBtn, padding: '1px' }}>
                                <ArrowDownward sx={{ fontSize: 11 }} />
                            </IconButton>
                            <IconButton size='small' onClick={() => { setEditRoleId(posId); setEditRoleVal(pos.role) }} sx={{ ...ghostBtn, padding: '1px' }}>
                                <Edit sx={{ fontSize: 11 }} />
                            </IconButton>
                            <IconButton size='small' onClick={() => { setPickerOpen(posId); setUserSearch('') }} sx={{ ...ghostBtn, padding: '1px' }}>
                                <AccountTree sx={{ fontSize: 11 }} />
                            </IconButton>
                            {pos.user && (
                                <IconButton size='small' onClick={() => assign(posId, null)} sx={{ ...ghostBtn, padding: '1px' }}>
                                    <Close sx={{ fontSize: 11 }} />
                                </IconButton>
                            )}
                            <IconButton size='small' onClick={() => setConfirmDeletePos(posId)} sx={{ ...ghostBtn, padding: '1px', color: 'rgba(219,0,29,0.3)', '&:hover': { color: 'rgba(219,0,29,0.65)' } }}>
                                <Delete sx={{ fontSize: 11 }} />
                            </IconButton>
                        </>
                    )}
                </div>
            </div>
        )
    }


    function renderSection(sec: Section, cat: string, sections: Section[], secIdx: number) {
        const sectionKey = `${cat}::${sec.title}`

        return (
            <div key={sectionKey}>
                {/* Section header */}
                {sec.title && (
                    <div className='flex items-center gap-0.5 px-2 py-1 mt-2' style={{ borderBottom: '1px solid rgba(219,0,29,0.1)' }}>
                        <div className='flex-1 min-w-0'>
                            {editSectionKey === sectionKey ? (
                                <TextField
                                    size='small'
                                    value={editSectionVal}
                                    onChange={e => setEditSectionVal(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') saveSection(cat, sec.title, editSectionVal)
                                        if (e.key === 'Escape') setEditSectionKey(null)
                                    }}
                                    onBlur={() => saveSection(cat, sec.title, editSectionVal)}
                                    autoFocus
                                    fullWidth
                                    inputProps={{ style: { fontSize: '0.65rem', padding: '1px 6px' } }}
                                    sx={{ '& .MuiOutlinedInput-root': { height: 22 } }}
                                />
                            ) : (
                                <Typography
                                    fontSize='0.6rem'
                                    fontWeight={600}
                                    letterSpacing={1.5}
                                    noWrap
                                    style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}
                                >
                                    {sec.title}
                                </Typography>
                            )}
                        </div>
                        <IconButton size='small' disabled={secIdx === 0 || busy} onClick={() => moveSection(cat, sec.title, 'up')} sx={{ ...ghostBtn, padding: '1px' }}>
                            <ArrowUpward sx={{ fontSize: 10 }} />
                        </IconButton>
                        <IconButton size='small' disabled={secIdx === sections.length - 1 || busy} onClick={() => moveSection(cat, sec.title, 'down')} sx={{ ...ghostBtn, padding: '1px' }}>
                            <ArrowDownward sx={{ fontSize: 10 }} />
                        </IconButton>
                        <IconButton size='small' onClick={() => { setEditSectionKey(sectionKey); setEditSectionVal(sec.title) }} sx={{ ...ghostBtn, padding: '1px' }}>
                            <Edit sx={{ fontSize: 10 }} />
                        </IconButton>
                        <IconButton size='small' onClick={() => setConfirmDeleteSection({ cat, sectionTitle: sec.title })} sx={{ ...ghostBtn, padding: '1px', color: 'rgba(219,0,29,0.25)', '&:hover': { color: 'rgba(219,0,29,0.6)' } }}>
                            <Delete sx={{ fontSize: 10 }} />
                        </IconButton>
                    </div>
                )}

                {/* Positions */}
                <div className='flex flex-col gap-0.5 py-0.5'>
                    {sec.positions.map((pos, idx) => renderPositionRow(pos, sec, idx))}
                </div>

                {/* Add Role */}
                {addRoleKey === sectionKey ? (
                    <div className='flex gap-1 px-1 py-1'>
                        <TextField
                            size='small'
                            placeholder='Role name...'
                            value={addRoleVal}
                            onChange={e => setAddRoleVal(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') addRole(cat, sec.title, addRoleVal)
                                if (e.key === 'Escape') { setAddRoleKey(null); setAddRoleVal('') }
                            }}
                            autoFocus
                            fullWidth
                            inputProps={{ style: { fontSize: '0.72rem', padding: '3px 8px' } }}
                            sx={{ '& .MuiOutlinedInput-root': { height: 26 } }}
                        />
                        <IconButton size='small' onClick={() => addRole(cat, sec.title, addRoleVal)} disabled={!addRoleVal.trim() || busy} sx={{ ...ghostBtn, padding: '2px' }}>
                            <Add sx={{ fontSize: 14 }} />
                        </IconButton>
                        <IconButton size='small' onClick={() => { setAddRoleKey(null); setAddRoleVal('') }} sx={{ ...ghostBtn, padding: '2px' }}>
                            <Close sx={{ fontSize: 14 }} />
                        </IconButton>
                    </div>
                ) : (
                    <Button
                        size='small'
                        sx={addBtn}
                        startIcon={<Add sx={{ fontSize: '11px !important' }} />}
                        onClick={() => { setAddRoleKey(sectionKey); setAddRoleVal('') }}
                    >
                        Add Role
                    </Button>
                )}
            </div>
        )
    }


    function renderColumn(cat: OrbatCategory, sections: Section[], isStructural = false) {
        // For structural categories with no data yet, ensure a default empty section exists
        const effectiveSections = (isStructural && sections.length === 0)
            ? [{ title: '', sectionOrder: 0, positions: [] }]
            : sections

        return (
            <div key={cat._id} className='flex flex-col' style={tileStyle}>

                {/* Column header */}
                <div className='flex items-center gap-1 px-3 py-2' style={{ borderBottom: '1px solid rgba(219,0,29,0.12)' }}>
                    <div className='flex-1 min-w-0'>
                        {editCatKey === cat._id ? (
                            <TextField
                                size='small'
                                value={editCatVal}
                                onChange={e => setEditCatVal(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') saveCategory(cat._id, editCatVal)
                                    if (e.key === 'Escape') setEditCatKey(null)
                                }}
                                onBlur={() => saveCategory(cat._id, editCatVal)}
                                autoFocus
                                fullWidth
                                inputProps={{ style: { fontSize: '0.7rem', padding: '2px 6px' } }}
                                sx={{ '& .MuiOutlinedInput-root': { height: 24 } }}
                            />
                        ) : (
                            <Typography
                                fontSize='0.62rem'
                                fontWeight={700}
                                letterSpacing={2}
                                noWrap
                                style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.8)' }}
                            >
                                {cat.label}
                            </Typography>
                        )}
                    </div>
                    {!isStructural && (
                        <>
                            <IconButton size='small' onClick={() => { setEditCatKey(cat._id); setEditCatVal(cat.label) }} sx={{ ...ghostBtn, padding: '2px' }}>
                                <Edit sx={{ fontSize: 12 }} />
                            </IconButton>
                            <IconButton size='small' onClick={() => setConfirmDeleteCat(cat._id)} sx={{ ...ghostBtn, padding: '2px', color: 'rgba(219,0,29,0.3)', '&:hover': { color: 'rgba(219,0,29,0.65)' } }}>
                                <Delete sx={{ fontSize: 12 }} />
                            </IconButton>
                        </>
                    )}
                </div>

                {/* Sections + positions */}
                <div className='flex flex-col flex-1 overflow-y-auto px-1 pb-2'>
                    {effectiveSections.map((sec, idx) => renderSection(sec, cat._id, effectiveSections, idx))}

                    {/* Add Section (platoon columns only) */}
                    {!isStructural && (
                        addSectionCat === cat._id ? (
                            <div className='flex gap-1 px-1 py-1 mt-1'>
                                <TextField
                                    size='small'
                                    placeholder='Section name...'
                                    value={addSectionVal}
                                    onChange={e => setAddSectionVal(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') addSection(cat._id, addSectionVal)
                                        if (e.key === 'Escape') { setAddSectionCat(null); setAddSectionVal('') }
                                    }}
                                    autoFocus
                                    fullWidth
                                    inputProps={{ style: { fontSize: '0.72rem', padding: '3px 8px' } }}
                                    sx={{ '& .MuiOutlinedInput-root': { height: 26 } }}
                                />
                                <IconButton size='small' onClick={() => addSection(cat._id, addSectionVal)} disabled={!addSectionVal.trim() || busy} sx={{ ...ghostBtn, padding: '2px' }}>
                                    <Add sx={{ fontSize: 14 }} />
                                </IconButton>
                                <IconButton size='small' onClick={() => { setAddSectionCat(null); setAddSectionVal('') }} sx={{ ...ghostBtn, padding: '2px' }}>
                                    <Close sx={{ fontSize: 14 }} />
                                </IconButton>
                            </div>
                        ) : (
                            <Button
                                size='small'
                                sx={{ ...addBtn, mt: 0.5, color: 'rgba(237,237,237,0.15)', '&:hover': { color: 'rgba(237,237,237,0.4)', background: 'transparent' } }}
                                startIcon={<Add sx={{ fontSize: '11px !important' }} />}
                                onClick={() => { setAddSectionCat(cat._id); setAddSectionVal('') }}
                            >
                                Add Section
                            </Button>
                        )
                    )}
                </div>
            </div>
        )
    }


    if (loading) {
        return (
            <div className='h-full w-full flex items-center justify-center'>
                <CircularProgress size={32} sx={{ color: 'var(--red)' }} />
            </div>
        )
    }


    const hqCat: OrbatCategory = categories.find(c => c._id === 'companyHQ')
        ?? { _id: 'companyHQ', label: STRUCTURAL_LABELS.companyHQ, order: 0 }

    const structuralBottom = (
        ['activeReservist', 'inactiveReservist', 'gamemaster'] as const
    ).map(id => ({
        cat: categories.find(c => c._id === id) ?? { _id: id, label: STRUCTURAL_LABELS[id], order: 99 },
        sections: buildSections(positions, id),
    }))


    return (
        <div className='h-full w-full p-6 md:p-8 flex flex-col gap-5 max-w-[1600px] mx-auto'>

            {/* Header */}
            <div className='flex items-center gap-4'>
                <Link
                    href='/admin'
                    style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: 'rgba(237,237,237,0.35)',
                        textDecoration: 'none',
                    }}
                >
                    ← Back
                </Link>
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>
                    ORBAT Management
                </span>
            </div>

            {/* Import result banner */}
            {importResult && (
                <div className='flex items-center justify-between px-4 py-3' style={tileStyle}>
                    <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.7)' }}>
                        Import complete — {importResult.inserted} positions loaded, {importResult.matched} users auto-matched.
                    </Typography>
                    <IconButton size='small' onClick={() => setImportResult(null)} sx={ghostBtn}>
                        <Close fontSize='small' />
                    </IconButton>
                </div>
            )}

            {/* Empty state */}
            {positions.length === 0 && (
                <div className='flex flex-col items-center gap-4 py-16' style={tileStyle}>
                    <AccountTree sx={{ fontSize: 48, color: 'var(--red)', opacity: 0.4 }} />
                    <Typography fontSize='0.85rem' style={{ color: 'rgba(237,237,237,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        No positions loaded
                    </Typography>
                    <Button variant='outlined' sx={redBtn} onClick={() => setImportOpen(true)}>
                        Import from Google Sheet
                    </Button>
                </div>
            )}

            {positions.length > 0 && (
                <>
                    {/* Company HQ — full width */}
                    {renderColumn(hqCat, buildSections(positions, 'companyHQ'), true)}

                    {/* Platoon columns */}
                    <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4'>
                        {platoonCats.map(cat => renderColumn(cat, buildSections(positions, cat._id)))}

                        {/* Add Platoon tile */}
                        <div className='flex flex-col items-start justify-start p-3' style={{ ...tileStyle, borderStyle: 'dashed', borderTopStyle: 'solid' }}>
                            {addingCat ? (
                                <div className='flex gap-1 w-full'>
                                    <TextField
                                        size='small'
                                        placeholder='Platoon name...'
                                        value={addCatVal}
                                        onChange={e => setAddCatVal(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') addCategory(addCatVal)
                                            if (e.key === 'Escape') { setAddingCat(false); setAddCatVal('') }
                                        }}
                                        autoFocus
                                        fullWidth
                                        inputProps={{ style: { fontSize: '0.72rem', padding: '3px 8px' } }}
                                        sx={{ '& .MuiOutlinedInput-root': { height: 26 } }}
                                    />
                                    <IconButton size='small' onClick={() => addCategory(addCatVal)} disabled={!addCatVal.trim() || busy} sx={{ ...ghostBtn, padding: '2px' }}>
                                        <Add sx={{ fontSize: 14 }} />
                                    </IconButton>
                                    <IconButton size='small' onClick={() => { setAddingCat(false); setAddCatVal('') }} sx={{ ...ghostBtn, padding: '2px' }}>
                                        <Close sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </div>
                            ) : (
                                <Button
                                    size='small'
                                    sx={{ ...addBtn, color: 'rgba(237,237,237,0.2)', '&:hover': { color: 'rgba(237,237,237,0.45)', background: 'transparent' } }}
                                    startIcon={<Add sx={{ fontSize: '13px !important' }} />}
                                    onClick={() => setAddingCat(true)}
                                >
                                    Add Platoon
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Bottom structural — reservists + gamemasters */}
                    <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                        {structuralBottom.map(({ cat, sections }) => renderColumn(cat, sections, true))}
                    </div>
                </>
            )}

            {/* Re-import */}
            {positions.length > 0 && (
                <div className='flex justify-end'>
                    <Button variant='outlined' size='small' sx={ghostBtn} onClick={() => setImportOpen(true)}>
                        Re-import from Google Sheet
                    </Button>
                </div>
            )}


            {/* ── User Picker Dialog ──────────────────────────────────────────── */}
            <Dialog
                open={!!pickerOpen}
                onClose={() => setPickerOpen(null)}
                maxWidth='xs'
                fullWidth
                PaperProps={{ style: { background: '#141414', border: '1px solid rgba(219,0,29,0.2)' } }}
            >
                <DialogTitle style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                    Assign User
                    {pickerPosition && (
                        <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.35)', marginTop: 2 }}>
                            {pickerPosition.role}{pickerPosition.sectionTitle ? ` — ${pickerPosition.sectionTitle}` : ''}
                        </Typography>
                    )}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        size='small'
                        placeholder='Search members...'
                        value={userSearch}
                        onChange={e => setUserSearch(e.target.value)}
                        sx={{ mb: 1.5 }}
                        inputProps={{ style: { fontSize: '0.82rem' } }}
                    />
                    <div className='flex flex-col gap-1' style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {filteredUsers.map(u => (
                            <button
                                key={u.id}
                                onClick={() => pickerOpen && assign(pickerOpen, u.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '6px 8px',
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    width: '100%',
                                }}
                            >
                                <Avatar src={u.avatarURL} sx={{ width: 28, height: 28, fontSize: '0.7rem' }} />
                                <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.8)' }}>
                                    {u.displayName}
                                </Typography>
                            </button>
                        ))}
                        {filteredUsers.length === 0 && (
                            <Typography fontSize='0.75rem' style={{ color: 'rgba(237,237,237,0.25)', textAlign: 'center', padding: 16 }}>
                                No members found
                            </Typography>
                        )}
                    </div>
                </DialogContent>
                <DialogActions>
                    <Button sx={ghostBtn} onClick={() => setPickerOpen(null)}>Cancel</Button>
                </DialogActions>
            </Dialog>


            {/* ── Conflict Dialog ──────────────────────────────────────────────── */}
            <Dialog
                open={!!conflict}
                onClose={() => setConflict(null)}
                maxWidth='xs'
                fullWidth
                PaperProps={{ style: { background: '#141414', border: '1px solid rgba(219,0,29,0.2)' } }}
            >
                <DialogTitle style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Warning sx={{ fontSize: 18, color: 'var(--red)' }} />
                    Already Assigned
                </DialogTitle>
                <DialogContent>
                    <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.7)' }}>
                        This member is already assigned to{' '}
                        <strong style={{ color: 'rgba(237,237,237,0.9)' }}>{conflict?.position.role}</strong>
                        {conflict?.position.sectionTitle ? ` in ${conflict.position.sectionTitle}` : ''}.
                    </Typography>
                    <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.45)', marginTop: 8 }}>
                        Would you like to unassign them from that position and assign them here instead?
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button sx={ghostBtn} onClick={() => setConflict(null)}>Cancel</Button>
                    <Button variant='outlined' sx={redBtn} disabled={resolvingConflict} onClick={resolveConflict}>
                        {resolvingConflict ? <CircularProgress size={14} sx={{ color: 'var(--red)' }} /> : 'Move Here'}
                    </Button>
                </DialogActions>
            </Dialog>


            {/* ── Confirm Delete Position ──────────────────────────────────────── */}
            <Dialog
                open={!!confirmDeletePos}
                onClose={() => setConfirmDeletePos(null)}
                maxWidth='xs'
                fullWidth
                PaperProps={{ style: { background: '#141414', border: '1px solid rgba(219,0,29,0.2)' } }}
            >
                <DialogTitle style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                    Delete Position
                </DialogTitle>
                <DialogContent>
                    <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.6)' }}>
                        This will permanently delete this position and its user assignment.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button sx={ghostBtn} onClick={() => setConfirmDeletePos(null)}>Cancel</Button>
                    <Button variant='outlined' sx={redBtn} disabled={busy} onClick={() => confirmDeletePos && deletePosition(confirmDeletePos)}>
                        {busy ? <CircularProgress size={14} sx={{ color: 'var(--red)' }} /> : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>


            {/* ── Confirm Delete Section ───────────────────────────────────────── */}
            <Dialog
                open={!!confirmDeleteSection}
                onClose={() => setConfirmDeleteSection(null)}
                maxWidth='xs'
                fullWidth
                PaperProps={{ style: { background: '#141414', border: '1px solid rgba(219,0,29,0.2)' } }}
            >
                <DialogTitle style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                    Delete Section
                </DialogTitle>
                <DialogContent>
                    <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.6)' }}>
                        This will delete all positions in{' '}
                        <strong style={{ color: 'rgba(237,237,237,0.85)' }}>{confirmDeleteSection?.sectionTitle}</strong>.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button sx={ghostBtn} onClick={() => setConfirmDeleteSection(null)}>Cancel</Button>
                    <Button variant='outlined' sx={redBtn} disabled={busy} onClick={() => confirmDeleteSection && deleteSection(confirmDeleteSection.cat, confirmDeleteSection.sectionTitle)}>
                        {busy ? <CircularProgress size={14} sx={{ color: 'var(--red)' }} /> : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>


            {/* ── Confirm Delete Category ──────────────────────────────────────── */}
            <Dialog
                open={!!confirmDeleteCat}
                onClose={() => setConfirmDeleteCat(null)}
                maxWidth='xs'
                fullWidth
                PaperProps={{ style: { background: '#141414', border: '1px solid rgba(219,0,29,0.2)' } }}
            >
                <DialogTitle style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                    Delete Platoon
                </DialogTitle>
                <DialogContent>
                    <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.6)' }}>
                        This will permanently delete the platoon and{' '}
                        <strong style={{ color: 'rgba(219,0,29,0.9)' }}>all positions within it</strong>.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button sx={ghostBtn} onClick={() => setConfirmDeleteCat(null)}>Cancel</Button>
                    <Button variant='outlined' sx={redBtn} disabled={busy} onClick={() => confirmDeleteCat && deleteCategory(confirmDeleteCat)}>
                        {busy ? <CircularProgress size={14} sx={{ color: 'var(--red)' }} /> : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>


            {/* ── Import Dialog ────────────────────────────────────────────────── */}
            <Dialog
                open={importOpen}
                onClose={() => { setImportOpen(false); setImportConfirm('') }}
                maxWidth='xs'
                fullWidth
                PaperProps={{ style: { background: '#141414', border: '1px solid rgba(219,0,29,0.2)' } }}
            >
                <DialogTitle style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                    Import from Google Sheet
                </DialogTitle>
                <DialogContent>
                    <Typography fontSize='0.82rem' style={{ color: 'rgba(237,237,237,0.6)', marginBottom: 12 }}>
                        This will <strong style={{ color: 'rgba(219,0,29,0.9)' }}>delete all current positions</strong> and
                        re-import from the Google Sheet, attempting to auto-match users by Discord nickname.
                        Any manual assignments made since the last import will be lost.
                    </Typography>
                    <Typography fontSize='0.75rem' style={{ color: 'rgba(237,237,237,0.35)', marginBottom: 8 }}>
                        Type <strong>IMPORT</strong> to confirm:
                    </Typography>
                    <TextField
                        fullWidth
                        size='small'
                        value={importConfirm}
                        onChange={e => setImportConfirm(e.target.value)}
                        inputProps={{ style: { fontSize: '0.82rem' } }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button sx={ghostBtn} onClick={() => { setImportOpen(false); setImportConfirm('') }}>Cancel</Button>
                    <Button variant='outlined' sx={redBtn} disabled={importConfirm !== 'IMPORT' || importing} onClick={runImport}>
                        {importing ? <CircularProgress size={14} sx={{ color: 'var(--red)' }} /> : 'Import'}
                    </Button>
                </DialogActions>
            </Dialog>

        </div>
    )
}
