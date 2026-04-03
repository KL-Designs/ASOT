'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
    Typography, Button, CircularProgress,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, IconButton, Avatar,
} from '@mui/material'
import {
    Edit, Close, AccountTree, Warning, ArrowUpward, ArrowDownward,
    Add, Delete, MoreVert, DragIndicator,
} from '@mui/icons-material'
import { PLATOON_CATEGORIES, RESERVIST_CATEGORIES, SINGLE_SECTION_CATEGORIES } from '@/lib/orbat-constants'
import MilpacEditor from '@/app/members/[username]/MilpacEditor'
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    closestCenter,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'


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

const menuItemBtn = {
    fontSize: '0.67rem',
    color: 'rgba(237,237,237,0.45)',
    padding: '1px 8px',
    minWidth: 0,
    textTransform: 'none' as const,
    '&:hover': { color: 'rgba(237,237,237,0.8)', background: 'rgba(255,255,255,0.05)' },
}


type PickerUser = { id: string; username: string; displayName: string; avatarURL: string }

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


export default function OrbatManager({ initialUsers, canManageStructure, canManageMembers, canMilpacEditRestricted, canMilpacEditStandard }: {
    initialUsers: PickerUser[]
    canManageStructure: boolean
    canManageMembers: boolean
    canMilpacEditRestricted: boolean
    canMilpacEditStandard: boolean
}) {

    const [positions, setPositions] = useState<OrbatPositionWithUser[]>([])
    const [loading, setLoading] = useState(true)
    const allUsers = initialUsers

    // Inline edit state
    const [editRoleId, setEditRoleId] = useState<string | null>(null)
    const [editRoleVal, setEditRoleVal] = useState('')
    const [editSectionKey, setEditSectionKey] = useState<string | null>(null)  // `${cat}::${title}`
    const [editSectionVal, setEditSectionVal] = useState('')

    // Add state
    const [addSectionCat, setAddSectionCat] = useState<string | null>(null)
    const [addSectionVal, setAddSectionVal] = useState('')
    const [addRoleKey, setAddRoleKey] = useState<string | null>(null)  // `${cat}::${sectionTitle}`
    const [addRoleVal, setAddRoleVal] = useState('')

    // Expanded row (...) menu
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

    // Drag state (within a section)
    const [activeDragId, setActiveDragId] = useState<string | null>(null)
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

    // User picker state
    const [pickerOpen, setPickerOpen] = useState<string | null>(null)
    const [userSearch, setUserSearch] = useState('')
    const [savingId, setSavingId] = useState<string | null>(null)

    // Conflict dialog
    const [conflict, setConflict] = useState<{ position: OrbatPositionWithUser; pendingUserId: string; pendingPositionId: string } | null>(null)
    const [resolvingConflict, setResolvingConflict] = useState(false)

    // Confirmation dialogs
    const [confirmDeleteSection, setConfirmDeleteSection] = useState<{ cat: string; sectionTitle: string } | null>(null)
    const [confirmDeletePos, setConfirmDeletePos] = useState<string | null>(null)

    // Add-to-reservists picker
    const [addReservistCat, setAddReservistCat] = useState<'activeReservist' | 'inactiveReservist' | null>(null)
    const [addReservistSearch, setAddReservistSearch] = useState('')

    // Milpac popout
    const [milpacUser, setMilpacUser] = useState<User | null>(null)
    const [milpacConfirmedOps, setMilpacConfirmedOps] = useState<{ operationId: string; name: string; confirmedAt: string | null }[]>([])
    const [milpacLoading, setMilpacLoading] = useState(false)
    const [milpacDirty, setMilpacDirty] = useState(false)
    const [milpacConfirmClose, setMilpacConfirmClose] = useState(false)

    function requestCloseMilpac() {
        if (milpacDirty) {
            setMilpacConfirmClose(true)
        } else {
            setMilpacUser(null)
        }
    }

    function confirmCloseMilpac() {
        setMilpacConfirmClose(false)
        setMilpacDirty(false)
        setMilpacUser(null)
    }

    async function openMilpac(username: string) {
        setMilpacDirty(false)
        setMilpacLoading(true)
        const [memberRes, opsRes] = await Promise.all([
            fetch(`/api/members/${username}`),
            fetch(`/api/members/${username}/confirmed-ops`),
        ])
        if (memberRes.ok) setMilpacUser(await memberRes.json())
        if (opsRes.ok) setMilpacConfirmedOps(await opsRes.json())
        else setMilpacConfirmedOps([])
        setMilpacLoading(false)
    }

    // Import dialog

    const [busy, setBusy] = useState(false)


    const load = useCallback(async () => {
        setLoading(true)
        const res = await fetch('/api/admin/orbat')
        if (res.ok) setPositions(await res.json())
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])


    // ── Local state helpers ──────────────────────────────────────────────────

    function lookupUser(userId: string | null): OrbatPositionWithUser['user'] {
        if (!userId) return null
        const u = allUsers.find(u => u.id === userId)
        return u ? { id: u.id, username: u.username, displayName: u.displayName, avatarURL: u.avatarURL } : null
    }

    function applyPatch(id: string, updates: Partial<OrbatPositionWithUser>) {
        setPositions(prev => prev.map(p => p._id.toString() === id ? { ...p, ...updates } : p))
    }

    function applyRemove(id: string) {
        setPositions(prev => prev.filter(p => p._id.toString() !== id))
    }

    function applyAppend(raw: OrbatPosition, user: OrbatPositionWithUser['user'] = null) {
        setPositions(prev => [...prev, { ...raw, user } as OrbatPositionWithUser])
    }


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
        if (res.ok) {
            const data = await res.json()
            setPickerOpen(null)
            applyPatch(positionId, { userId: userId ?? null, user: lookupUser(userId) })
            if (data.reservistPosition) {
                applyAppend(data.reservistPosition, lookupUser(data.reservistPosition.userId))
            }
        }
        setSavingId(null)
    }

    async function resolveConflict() {
        if (!conflict) return
        setResolvingConflict(true)

        const RESERVIST_IDS = RESERVIST_CATEGORIES.map(c => c._id) as string[]
        const isFromReservist = RESERVIST_IDS.includes(conflict.position.category)

        if (isFromReservist) {
            await fetch('/api/admin/orbat/reservists', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ positionId: conflict.position._id.toString() }),
            })
            applyRemove(conflict.position._id.toString())
        } else {
            await fetch(`/api/admin/orbat/${conflict.position._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: null, skipAutoMove: true }),
            })
            applyPatch(conflict.position._id.toString(), { userId: null, user: null })
        }

        await fetch(`/api/admin/orbat/${conflict.pendingPositionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: conflict.pendingUserId }),
        })
        applyPatch(conflict.pendingPositionId, {
            userId: conflict.pendingUserId,
            user: lookupUser(conflict.pendingUserId),
        })

        setConflict(null)
        setResolvingConflict(false)
    }


    // ── Role CRUD ────────────────────────────────────────────────────────────

    async function saveRole(positionId: string, role: string) {
        if (!role.trim()) { setEditRoleId(null); return }
        setEditRoleId(null)
        applyPatch(positionId, { role: role.trim() })
        await fetch(`/api/admin/orbat/${positionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: role.trim() }),
        })
    }

    async function deletePosition(positionId: string) {
        applyRemove(positionId)
        setConfirmDeletePos(null)
        await fetch(`/api/admin/orbat/${positionId}`, { method: 'DELETE' })
    }

    async function addRole(cat: string, sectionTitle: string, role: string) {
        if (!role.trim()) return
        setAddRoleKey(null)
        setAddRoleVal('')
        const res = await fetch('/api/admin/orbat/positions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, sectionTitle, role: role.trim() }),
        })
        if (res.ok) {
            const data = await res.json()
            applyAppend(data.position, null)
        }
    }

    async function dropPosition(sec: Section, fromId: string, toId: string) {
        if (fromId === toId) return
        const fromIdx = sec.positions.findIndex(p => p._id.toString() === fromId)
        const toIdx = sec.positions.findIndex(p => p._id.toString() === toId)
        if (fromIdx < 0 || toIdx < 0) return

        const reordered = [...sec.positions]
        const [item] = reordered.splice(fromIdx, 1)
        reordered.splice(toIdx, 0, item)

        // Optimistic reorder
        const orderMap = new Map(reordered.map((p, idx) => [p._id.toString(), idx]))
        setPositions(prev => prev.map(p => {
            const newOrder = orderMap.get(p._id.toString())
            return newOrder !== undefined ? { ...p, positionOrder: newOrder } : p
        }))

        await Promise.all(
            reordered.map((p, idx) =>
                fetch(`/api/admin/orbat/${p._id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ positionOrder: idx }),
                })
            )
        )
    }


    // ── Section CRUD ─────────────────────────────────────────────────────────

    async function saveSection(cat: string, oldTitle: string, newTitle: string) {
        if (!newTitle.trim()) { setEditSectionKey(null); return }
        setEditSectionKey(null)
        setPositions(prev => prev.map(p =>
            p.category === cat && p.sectionTitle === oldTitle ? { ...p, sectionTitle: newTitle.trim() } : p
        ))
        await fetch('/api/admin/orbat/sections', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, oldTitle, newTitle: newTitle.trim() }),
        })
    }

    async function addSection(cat: string, sectionTitle: string) {
        if (!sectionTitle.trim()) return
        setAddSectionCat(null)
        setAddSectionVal('')
        const res = await fetch('/api/admin/orbat/sections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, sectionTitle: sectionTitle.trim() }),
        })
        if (res.ok) {
            const data = await res.json()
            applyAppend(data.position, null)
        }
    }

    async function deleteSection(cat: string, sectionTitle: string) {
        setPositions(prev => prev.filter(p => !(p.category === cat && p.sectionTitle === sectionTitle)))
        setConfirmDeleteSection(null)
        await fetch('/api/admin/orbat/sections', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, sectionTitle }),
        })
    }

    async function moveSection(cat: string, sectionTitle: string, dir: 'up' | 'down') {
        const sections = buildSections(positions, cat)
        const idx = sections.findIndex(s => s.title === sectionTitle)
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1
        if (idx < 0 || swapIdx < 0 || swapIdx >= sections.length) return

        const curr = sections[idx]
        const swap = sections[swapIdx]
        setPositions(prev => prev.map(p => {
            if (p.category === cat && p.sectionTitle === curr.title) return { ...p, sectionOrder: swap.sectionOrder }
            if (p.category === cat && p.sectionTitle === swap.title) return { ...p, sectionOrder: curr.sectionOrder }
            return p
        }))

        setBusy(true)
        await fetch('/api/admin/orbat/sections', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, sectionTitle, direction: dir }),
        })
        setBusy(false)
    }


    // ── Reservist actions ────────────────────────────────────────────────────

    async function moveReservist(positionId: string, targetCategory: 'activeReservist' | 'inactiveReservist') {
        applyPatch(positionId, { category: targetCategory })
        await fetch('/api/admin/orbat/reservists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ positionId, targetCategory }),
        })
    }

    async function removeReservist(positionId: string) {
        applyRemove(positionId)
        await fetch('/api/admin/orbat/reservists', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ positionId }),
        })
    }

    async function addToReservists(userId: string, category: 'activeReservist' | 'inactiveReservist') {
        const res = await fetch('/api/admin/orbat/reservists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, category }),
        })
        if (res.status === 409) return  // already on orbat somewhere
        if (res.ok) {
            const data = await res.json()
            setAddReservistCat(null)
            setAddReservistSearch('')
            applyAppend(data.position, lookupUser(userId))
        }
    }


    // ── Import ───────────────────────────────────────────────────────────────

    // ── Derived ──────────────────────────────────────────────────────────────

    const pickerPosition = pickerOpen ? positions.find(p => p._id.toString() === pickerOpen) : null
    const filteredUsers = allUsers.filter(u =>
        u.displayName.toLowerCase().includes(userSearch.toLowerCase())
    )
    const filteredReservistUsers = allUsers.filter(u =>
        u.displayName.toLowerCase().includes(addReservistSearch.toLowerCase())
    )


    // ── Sub-renders ──────────────────────────────────────────────────────────

    function renderPositionRowContent(pos: OrbatPositionWithUser, opts: { isDragOverlay?: boolean; dragListeners?: ReturnType<typeof useSortable>['listeners'] } = {}) {
        const posId = pos._id.toString()
        const isSaving = savingId === posId
        const isExpanded = expandedRowId === posId
        const isEditing = editRoleId === posId

        return (
            <>
                {/* Main row */}
                <div className='flex items-center gap-1.5 px-2 py-1' style={rowStyle}>

                    {/* Drag handle — structure managers only */}
                    {canManageStructure && (
                        <DragIndicator
                            {...(opts.dragListeners ?? {})}
                            sx={{ fontSize: 12, color: opts.isDragOverlay ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)', cursor: 'grab', flexShrink: 0, touchAction: 'none' }}
                        />
                    )}

                    {/* Role name */}
                    <div className='flex-1 min-w-0'>
                        {isEditing && !opts.isDragOverlay ? (
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

                    {/* Assigned user or Assign button */}
                    <div className='flex items-center gap-1 shrink-0'>
                        {isSaving ? (
                            <CircularProgress size={12} sx={{ color: 'var(--red)', opacity: 0.6 }} />
                        ) : pos.user ? (
                            <>
                                <Avatar src={pos.user.avatarURL} sx={{ width: 16, height: 16, fontSize: '0.5rem' }} />
                                <button
                                    onClick={() => pos.user && openMilpac(pos.user.username)}
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                                >
                                    <Typography fontSize='0.68rem' noWrap style={{ color: 'rgba(237,237,237,0.75)', maxWidth: 90 }}>
                                        {pos.user.displayName}
                                    </Typography>
                                </button>
                            </>
                        ) : canManageMembers ? (
                            <Button
                                size='small'
                                onClick={() => { setPickerOpen(posId); setUserSearch('') }}
                                sx={{
                                    fontSize: '0.63rem',
                                    color: 'rgba(237,237,237,0.22)',
                                    border: '1px dashed rgba(237,237,237,0.12)',
                                    borderRadius: '3px',
                                    padding: '0px 7px',
                                    minWidth: 0,
                                    lineHeight: '18px',
                                    textTransform: 'none',
                                    '&:hover': {
                                        color: 'rgba(237,237,237,0.6)',
                                        borderColor: 'rgba(237,237,237,0.3)',
                                        background: 'transparent',
                                    },
                                }}
                            >
                                Assign
                            </Button>
                        ) : null}
                    </div>

                    {/* More menu toggle */}
                    {!isEditing && !opts.isDragOverlay && (canManageStructure || canManageMembers) && (
                        <IconButton
                            size='small'
                            onClick={() => setExpandedRowId(isExpanded ? null : posId)}
                            sx={{ ...ghostBtn, padding: '1px', color: isExpanded ? 'rgba(237,237,237,0.6)' : 'rgba(237,237,237,0.2)' }}
                        >
                            <MoreVert sx={{ fontSize: 13 }} />
                        </IconButton>
                    )}
                </div>

                {/* Expanded options panel */}
                {isExpanded && !opts.isDragOverlay && (
                    <div
                        className='flex flex-wrap items-center gap-x-0.5 gap-y-0.5 px-2 py-1'
                        style={{ background: 'rgba(0,0,0,0.18)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                    >
                        {canManageStructure && (
                            <Button
                                size='small'
                                sx={menuItemBtn}
                                onClick={() => {
                                    setEditRoleId(posId)
                                    setEditRoleVal(pos.role)
                                    setExpandedRowId(null)
                                }}
                            >
                                Edit Name
                            </Button>
                        )}
                        {canManageMembers && (
                            <Button
                                size='small'
                                sx={menuItemBtn}
                                onClick={() => {
                                    setPickerOpen(posId)
                                    setUserSearch('')
                                    setExpandedRowId(null)
                                }}
                            >
                                {pos.user ? 'Change User' : 'Assign User'}
                            </Button>
                        )}
                        {canManageMembers && pos.user && (
                            <Button
                                size='small'
                                sx={menuItemBtn}
                                onClick={() => {
                                    assign(posId, null)
                                    setExpandedRowId(null)
                                }}
                            >
                                Remove User
                            </Button>
                        )}
                        {canManageStructure && (
                            <Button
                                size='small'
                                sx={{ ...menuItemBtn, color: 'rgba(219,0,29,0.45)', '&:hover': { color: 'rgba(219,0,29,0.85)', background: 'rgba(219,0,29,0.06)' } }}
                                onClick={() => {
                                    setConfirmDeletePos(posId)
                                    setExpandedRowId(null)
                                }}
                            >
                                Delete Role
                            </Button>
                        )}
                    </div>
                )}
            </>
        )
    }


    function SortablePositionRow({ pos, sec }: { pos: OrbatPositionWithUser; sec: Section }) {
        const posId = pos._id.toString()
        const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: posId })
        return (
            <div
                ref={setNodeRef}
                {...attributes}
                style={{
                    transform: CSS.Transform.toString(transform),
                    transition,
                    opacity: isDragging ? 0 : 1,
                }}
            >
                {renderPositionRowContent(pos, { dragListeners: listeners })}
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
                        {canManageStructure && (
                            <>
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
                            </>
                        )}
                    </div>
                )}

                {/* Positions */}
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={(e: DragStartEvent) => setActiveDragId(e.active.id as string)}
                    onDragEnd={(e: DragEndEvent) => {
                        setActiveDragId(null)
                        const { active, over } = e
                        if (over && active.id !== over.id) {
                            dropPosition(sec, active.id as string, over.id as string)
                        }
                    }}
                >
                    <SortableContext items={sec.positions.map(p => p._id.toString())} strategy={verticalListSortingStrategy}>
                        <div className='flex flex-col gap-0.5 py-0.5'>
                            {sec.positions.map(pos => (
                                <SortablePositionRow key={pos._id.toString()} pos={pos} sec={sec} />
                            ))}
                        </div>
                    </SortableContext>
                    <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
                        {activeDragId ? (() => {
                            const dragPos = sec.positions.find(p => p._id.toString() === activeDragId)
                            return dragPos ? (
                                <div style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.5)', borderRadius: 2, opacity: 0.95 }}>
                                    {renderPositionRowContent(dragPos, { isDragOverlay: true })}
                                </div>
                            ) : null
                        })() : null}
                    </DragOverlay>
                </DndContext>

                {/* Add Role — structure managers only */}
                {canManageStructure && (
                    addRoleKey === sectionKey ? (
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
                    )
                )}
            </div>
        )
    }


    function renderColumn(cat: { _id: string; label: string }, sections: Section[], canAddSection: boolean) {
        const effectiveSections = sections.length === 0
            ? [{ title: '', sectionOrder: 0, positions: [] }]
            : sections

        return (
            <div key={cat._id} className='flex flex-col' style={tileStyle}>

                {/* Column header — read-only label */}
                <div className='flex items-center px-3 py-2' style={{ borderBottom: '1px solid rgba(219,0,29,0.12)' }}>
                    <Typography
                        fontSize='0.62rem'
                        fontWeight={700}
                        letterSpacing={2}
                        noWrap
                        style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.8)' }}
                    >
                        {cat.label}
                    </Typography>
                </div>

                {/* Sections + positions */}
                <div className='flex flex-col flex-1 overflow-y-auto px-1 pb-2'>
                    {effectiveSections.map((sec, idx) => renderSection(sec, cat._id, effectiveSections, idx))}

                    {/* Add Section */}
                    {canAddSection && (
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


    function renderReservistPanel(cat: { _id: string; label: string }) {
        const reservists = positions.filter(p => p.category === cat._id)
        const isActive = cat._id === 'activeReservist'
        const targetCat = isActive ? 'inactiveReservist' : 'activeReservist'
        const moveLabel = isActive ? 'Move to Inactive' : 'Move to Active'

        return (
            <div key={cat._id} className='flex flex-col' style={tileStyle}>

                {/* Header */}
                <div className='px-3 py-2' style={{ borderBottom: '1px solid rgba(219,0,29,0.12)' }}>
                    <Typography
                        fontSize='0.62rem'
                        fontWeight={700}
                        letterSpacing={2}
                        style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.8)' }}
                    >
                        {cat.label}
                    </Typography>
                    <Typography fontSize='0.6rem' style={{ color: 'rgba(237,237,237,0.2)', marginTop: 2 }}>
                        {reservists.length} member{reservists.length !== 1 ? 's' : ''}
                    </Typography>
                </div>

                {/* Reservist rows */}
                <div className='flex flex-col flex-1 overflow-y-auto px-1 py-1'>
                    {reservists.map(pos => {
                        const posId = pos._id.toString()
                        return (
                            <div key={posId} className='flex items-center gap-2 px-2 py-1' style={rowStyle}>
                                {pos.user ? (
                                    <>
                                        <Avatar src={pos.user.avatarURL} sx={{ width: 18, height: 18, fontSize: '0.5rem' }} />
                                        <button
                                            onClick={() => pos.user && openMilpac(pos.user.username)}
                                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', flex: 1, minWidth: 0 }}
                                        >
                                            <Typography fontSize='0.73rem' noWrap style={{ color: 'rgba(237,237,237,0.75)' }}>
                                                {pos.user.displayName}
                                            </Typography>
                                        </button>
                                    </>
                                ) : (
                                    <Typography fontSize='0.65rem' fontStyle='italic' style={{ flex: 1, color: 'rgba(237,237,237,0.15)' }}>
                                        Unlinked slot
                                    </Typography>
                                )}
                                {canManageMembers && (
                                    <>
                                        <IconButton
                                            size='small'
                                            disabled={busy}
                                            title={moveLabel}
                                            onClick={() => moveReservist(posId, targetCat as 'activeReservist' | 'inactiveReservist')}
                                            sx={{ ...ghostBtn, padding: '1px' }}
                                        >
                                            {isActive
                                                ? <ArrowDownward sx={{ fontSize: 11 }} />
                                                : <ArrowUpward sx={{ fontSize: 11 }} />
                                            }
                                        </IconButton>
                                        <IconButton
                                            size='small'
                                            disabled={busy}
                                            title='Remove from pool'
                                            onClick={() => removeReservist(posId)}
                                            sx={{ ...ghostBtn, padding: '1px', color: 'rgba(219,0,29,0.3)', '&:hover': { color: 'rgba(219,0,29,0.65)' } }}
                                        >
                                            <Delete sx={{ fontSize: 11 }} />
                                        </IconButton>
                                    </>
                                )}
                            </div>
                        )
                    })}
                    {reservists.length === 0 && (
                        <Typography fontSize='0.65rem' fontStyle='italic' style={{ color: 'rgba(237,237,237,0.15)', padding: '8px 8px' }}>
                            None
                        </Typography>
                    )}
                </div>

                {/* Add Member — member managers only */}
                {canManageMembers && (
                    <div className='px-1 pb-2'>
                        <Button
                            size='small'
                            sx={{ ...addBtn, color: 'rgba(237,237,237,0.15)', '&:hover': { color: 'rgba(237,237,237,0.4)', background: 'transparent' } }}
                            startIcon={<Add sx={{ fontSize: '11px !important' }} />}
                            onClick={() => { setAddReservistCat(cat._id as 'activeReservist' | 'inactiveReservist'); setAddReservistSearch('') }}
                        >
                            Add Member
                        </Button>
                    </div>
                )}
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

    const [hqCat, ...platoonCols] = PLATOON_CATEGORIES
    const canAddSectionFor = (id: string) => canManageStructure && !(SINGLE_SECTION_CATEGORIES as readonly string[]).includes(id)


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

            {/* Empty state */}
            {positions.length === 0 && (
                <div className='flex flex-col items-center gap-4 py-16' style={tileStyle}>
                    <AccountTree sx={{ fontSize: 48, color: 'var(--red)', opacity: 0.4 }} />
                    <Typography fontSize='0.85rem' style={{ color: 'rgba(237,237,237,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        No positions loaded
                    </Typography>
                </div>
            )}

            {positions.length > 0 && (
                <>
                    {/* Company HQ — full width */}
                    {renderColumn(hqCat, buildSections(positions, hqCat._id), canAddSectionFor(hqCat._id))}

                    {/* Platoon + Gamemaster columns */}
                    <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4'>
                        {platoonCols.map(cat =>
                            renderColumn(cat, buildSections(positions, cat._id), canAddSectionFor(cat._id))
                        )}
                    </div>

                    {/* Reservists */}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        {RESERVIST_CATEGORIES.map(cat => renderReservistPanel(cat))}
                    </div>
                </>
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
                        {conflict && (['activeReservist', 'inactiveReservist'] as string[]).includes(conflict.position.category)
                            ? <>This member is currently in the <strong style={{ color: 'rgba(237,237,237,0.9)' }}>Reservists</strong> pool.</>
                            : <>This member is already assigned to{' '}
                                <strong style={{ color: 'rgba(237,237,237,0.9)' }}>{conflict?.position.role}</strong>
                                {conflict?.position.sectionTitle ? ` in ${conflict.position.sectionTitle}` : ''}.
                              </>
                        }
                    </Typography>
                    <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.45)', marginTop: 8 }}>
                        Would you like to move them to this position instead?
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
                        This will permanently delete this position. If someone is assigned, they will be moved to Active Reservists.
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
                        Assigned members will be moved to Active Reservists.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button sx={ghostBtn} onClick={() => setConfirmDeleteSection(null)}>Cancel</Button>
                    <Button variant='outlined' sx={redBtn} disabled={busy} onClick={() => confirmDeleteSection && deleteSection(confirmDeleteSection.cat, confirmDeleteSection.sectionTitle)}>
                        {busy ? <CircularProgress size={14} sx={{ color: 'var(--red)' }} /> : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>


            {/* ── Add to Reservists Dialog ─────────────────────────────────────── */}
            <Dialog
                open={!!addReservistCat}
                onClose={() => { setAddReservistCat(null); setAddReservistSearch('') }}
                maxWidth='xs'
                fullWidth
                PaperProps={{ style: { background: '#141414', border: '1px solid rgba(219,0,29,0.2)' } }}
            >
                <DialogTitle style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                    Add Member
                    <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.35)', marginTop: 2 }}>
                        {addReservistCat === 'activeReservist' ? 'Company Reservists (Active)' : 'Company Reservists (Inactive)'}
                    </Typography>
                </DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        size='small'
                        placeholder='Search members...'
                        value={addReservistSearch}
                        onChange={e => setAddReservistSearch(e.target.value)}
                        sx={{ mb: 1.5 }}
                        inputProps={{ style: { fontSize: '0.82rem' } }}
                    />
                    <div className='flex flex-col gap-1' style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {filteredReservistUsers.map(u => (
                            <button
                                key={u.id}
                                onClick={() => addReservistCat && addToReservists(u.id, addReservistCat)}
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
                        {filteredReservistUsers.length === 0 && (
                            <Typography fontSize='0.75rem' style={{ color: 'rgba(237,237,237,0.25)', textAlign: 'center', padding: 16 }}>
                                No members found
                            </Typography>
                        )}
                    </div>
                </DialogContent>
                <DialogActions>
                    <Button sx={ghostBtn} onClick={() => { setAddReservistCat(null); setAddReservistSearch('') }}>Cancel</Button>
                </DialogActions>
            </Dialog>


            {/* ── Milpac Popout ───────────────────────────────────────────────── */}
            <Dialog
                open={!!milpacUser || milpacLoading}
                onClose={requestCloseMilpac}
                maxWidth='md'
                fullWidth
                PaperProps={{
                    style: {
                        background: '#0e0e0e',
                        border: '1px solid rgba(219,0,29,0.2)',
                        maxHeight: '90vh',
                    },
                }}
            >
                <DialogTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.5)' }}>
                        {milpacUser ? `Milpac — ${milpacUser.name || milpacUser.username}` : 'Loading…'}
                        {milpacDirty && <span style={{ marginLeft: 8, color: 'rgba(219,0,29,0.7)', fontSize: '0.65rem' }}>● Unsaved changes</span>}
                    </span>
                    <IconButton size='small' onClick={requestCloseMilpac} sx={ghostBtn}>
                        <Close fontSize='small' />
                    </IconButton>
                </DialogTitle>
                <DialogContent style={{ padding: 0, overflowY: 'auto' }}>
                    {milpacLoading && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                            <CircularProgress size={28} sx={{ color: 'var(--red)' }} />
                        </div>
                    )}
                    {milpacUser && !milpacLoading && (
                        <div style={{ padding: '20px 24px' }}>
                            <MilpacEditor
                            member={milpacUser}
                            confirmedOps={milpacConfirmedOps}
                            onDirtyChange={setMilpacDirty}
                            canEditRestricted={canMilpacEditRestricted}
                            canEditStandard={canMilpacEditStandard}
                        />
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* ── Milpac Unsaved Changes Confirm ──────────────────────────────── */}
            <Dialog
                open={milpacConfirmClose}
                onClose={() => setMilpacConfirmClose(false)}
                PaperProps={{ style: { background: '#0e0e0e', border: '1px solid rgba(219,0,29,0.2)' } }}
            >
                <DialogTitle style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    Unsaved Changes
                </DialogTitle>
                <DialogContent>
                    <span style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.6)' }}>
                        You have unsaved changes. Close anyway and discard them?
                    </span>
                </DialogContent>
                <DialogActions style={{ padding: '8px 16px 16px' }}>
                    <button onClick={() => setMilpacConfirmClose(false)} style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.5)', padding: '6px 16px', cursor: 'pointer' }}>
                        Keep Editing
                    </button>
                    <button onClick={confirmCloseMilpac} style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(219,0,29,0.15)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(219,0,29,0.9)', padding: '6px 16px', cursor: 'pointer' }}>
                        Discard & Close
                    </button>
                </DialogActions>
            </Dialog>


        </div>
    )
}
