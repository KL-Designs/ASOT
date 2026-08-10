'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
    Typography, Button, CircularProgress,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, IconButton, Avatar,
} from '@mui/material'
import {
    Edit, Close, AccountTree, Warning, ArrowUpward, ArrowDownward,
    Add, Delete, MoreVert, DragIndicator, Settings,
} from '@mui/icons-material'
import { PLATOON_CATEGORIES, RESERVIST_CATEGORIES, SINGLE_SECTION_CATEGORIES } from '@/lib/orbat/constants'
import MemberDetailPanel from '@/app/dashboard/personnel/all/MemberDetailPanel'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import RolesManagerPanel from './RolesManagerPanel'
import RoleSelect from './RoleSelect'
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
    border: '1px solid rgba(219,0,29,0.42)',
    borderTop: '2px solid var(--red)',
    background: 'rgba(255,255,255,0.04)',
}

const rowStyle = {
    border: '1px solid rgba(219,0,29,0.08)',
    background: 'rgba(255,255,255,0.015)',
}

const redBtn = {
    fontSize: '0.72rem',
    borderColor: 'rgba(219,0,29,0.27)',
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


export default function OrbatManager({ initialUsers, canManageStructure, canManageMembers, canMilpacEditRestricted, canMilpacEditStandard, isJ4, canImpersonate }: {
    initialUsers: PickerUser[]
    canManageStructure: boolean
    canManageMembers: boolean
    canMilpacEditRestricted: boolean
    canMilpacEditStandard: boolean
    isJ4: boolean
    canImpersonate: boolean
}) {

    const [positions, setPositions] = useState<OrbatPositionWithUser[]>([])
    const [loading, setLoading] = useState(true)
    const allUsers = initialUsers

    // Roles Manager panel
    const [rolesManagerOpen, setRolesManagerOpen] = useState(false)

    // Inline edit state
    const [editRoleId, setEditRoleId] = useState<string | null>(null)
    const [editSectionKey, setEditSectionKey] = useState<string | null>(null)  // `${cat}::${title}`
    const [editSectionVal, setEditSectionVal] = useState('')

    // Add state
    const [addSectionCat, setAddSectionCat] = useState<string | null>(null)
    const [addSectionVal, setAddSectionVal] = useState('')
    const [addRoleKey, setAddRoleKey] = useState<string | null>(null)  // `${cat}::${sectionTitle}`

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

    // Member detail popout — shares MemberDetailPanel with the dashboard Members page
    const [milpacUsername, setMilpacUsername] = useState<string | null>(null)
    const [milpacDirty, setMilpacDirty] = useState(false)
    const [milpacConfirmClose, setMilpacConfirmClose] = useState(false)

    function requestCloseMilpac() {
        if (milpacDirty) {
            setMilpacConfirmClose(true)
        } else {
            setMilpacUsername(null)
        }
    }

    function confirmCloseMilpac() {
        setMilpacConfirmClose(false)
        setMilpacDirty(false)
        setMilpacUsername(null)
    }

    function openMilpac(username: string) {
        setMilpacDirty(false)
        setMilpacUsername(username)
    }

    function handleMemberDeletedFromOrbat() {
        setMilpacDirty(false)
        setMilpacUsername(null)
        load()
    }

    // Section metadata (patch images + theme colors + discord roles)
    const [sectionMeta, setSectionMeta] = useState<OrbatSectionMeta[]>([])
    const metaTargetRef = useRef<{ category: string; sectionTitle: string | null } | null>(null)

    // Discord role picker
    const [discordRoles, setDiscordRoles] = useState<Role[]>([])
    const [rolePickerTarget, setRolePickerTarget] = useState<{ category: string; sectionTitle: string | null } | null>(null)
    const [roleSearch, setRoleSearch] = useState('')

    const colorInputRef = useRef<HTMLInputElement>(null)
    const patchInputRef = useRef<HTMLInputElement>(null)
    const colorSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Import dialog

    const [busy, setBusy] = useState(false)


    const load = useCallback(async () => {
        setLoading(true)
        const fetches: Promise<void>[] = [
            fetch('/api/admin/orbat').then(r => r.ok ? r.json() : null).then(d => { if (d) setPositions(d) }),
            fetch('/api/admin/orbat/meta').then(r => r.ok ? r.json() : null).then(d => { if (d) setSectionMeta(d) }),
        ]
        if (canManageStructure) {
            fetches.push(
                fetch('/api/admin/orbat/discord-roles').then(r => r.ok ? r.json() : null).then(d => { if (d) setDiscordRoles(d.roles ?? []) }),
            )
        }
        await Promise.all(fetches)
        setLoading(false)
    }, [canManageStructure])

    useEffect(() => { load() }, [load])


    // ── Section metadata helpers ─────────────────────────────────────────────

    function getMeta(category: string, sectionTitle: string | null): OrbatSectionMeta | null {
        return sectionMeta.find(m => m.category === category && m.sectionTitle === sectionTitle) ?? null
    }

    function updateMetaLocal(category: string, sectionTitle: string | null, patch: Partial<Pick<OrbatSectionMeta, 'color' | 'patch' | 'discordRoleId'>>) {
        setSectionMeta(prev => {
            const idx = prev.findIndex(m => m.category === category && m.sectionTitle === sectionTitle)
            if (idx >= 0) {
                const next = [...prev]
                next[idx] = { ...next[idx], ...patch }
                return next
            }
            return [...prev, { _id: {} as any, category, sectionTitle, ...patch } as OrbatSectionMeta]
        })
    }

    function handleColorInput(color: string) {
        const target = metaTargetRef.current
        if (!target) return
        updateMetaLocal(target.category, target.sectionTitle, { color })
        if (colorSaveTimer.current) clearTimeout(colorSaveTimer.current)
        colorSaveTimer.current = setTimeout(() => {
            fetch('/api/admin/orbat/meta', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: target.category, sectionTitle: target.sectionTitle ?? '', color }),
            })
        }, 350)
    }

    async function handleColorClear(category: string, sectionTitle: string | null) {
        updateMetaLocal(category, sectionTitle, { color: undefined })
        await fetch('/api/admin/orbat/meta', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, sectionTitle: sectionTitle ?? '', field: 'color' }),
        })
    }

    async function handlePatchUpload(file: File) {
        const target = metaTargetRef.current
        if (!target) return
        const form = new FormData()
        form.set('category', target.category)
        form.set('sectionTitle', target.sectionTitle ?? '')
        form.set('file', file)
        const res = await fetch('/api/admin/orbat/meta/patch', { method: 'POST', body: form })
        if (res.ok) {
            const data = await res.json()
            updateMetaLocal(target.category, target.sectionTitle, { patch: data.filename })
        }
    }


    function discordColor(colorInt: number): string {
        if (!colorInt) return 'rgba(237,237,237,0.3)'
        return `#${colorInt.toString(16).padStart(6, '0')}`
    }

    // Returns explicit color, or Discord role color if set, or null
    function getEffectiveColor(meta: OrbatSectionMeta | null): string | null {
        if (meta?.color) return meta.color
        if (meta?.discordRoleId) {
            const role = discordRoles.find(r => r.id === meta.discordRoleId)
            if (role?.color) return `#${role.color.toString(16).padStart(6, '0')}`
        }
        return null
    }

    async function saveDiscordRole(roleId: string | null) {
        const target = rolePickerTarget
        if (!target) return
        setRolePickerTarget(null)
        setRoleSearch('')
        if (roleId) {
            updateMetaLocal(target.category, target.sectionTitle, { discordRoleId: roleId })
            await fetch('/api/admin/orbat/meta', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: target.category, sectionTitle: target.sectionTitle ?? '', discordRoleId: roleId }),
            })
        } else {
            updateMetaLocal(target.category, target.sectionTitle, { discordRoleId: undefined })
            await fetch('/api/admin/orbat/meta', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: target.category, sectionTitle: target.sectionTitle ?? '', field: 'discordRoleId' }),
            })
        }
    }



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

    async function saveRole(positionId: string, roleId: string, roleName: string) {
        setEditRoleId(null)
        // roleId arrives as a plain string from RoleSelect's fetched JSON (same
        // client/server ObjectId-vs-string mismatch already present for `_id`
        // throughout this component's optimistic-update helpers).
        applyPatch(positionId, { role: roleName, roleId: roleId as unknown as OrbatPosition['roleId'] })
        await fetch(`/api/admin/orbat/${positionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleId }),
        })
    }

    async function deletePosition(positionId: string) {
        applyRemove(positionId)
        setConfirmDeletePos(null)
        await fetch(`/api/admin/orbat/${positionId}`, { method: 'DELETE' })
    }

    async function addRole(cat: string, sectionTitle: string, roleId: string) {
        if (!roleId) return
        setAddRoleKey(null)
        const res = await fetch('/api/admin/orbat/positions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, sectionTitle, roleId }),
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
                            <RoleSelect
                                category={pos.category}
                                value={pos.roleId ? String(pos.roleId) : null}
                                onChange={(roleId, roleName) => saveRole(posId, roleId, roleName)}
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
                                    setExpandedRowId(null)
                                }}
                            >
                                Change Role
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
        const secMeta = getMeta(cat, sec.title)
        const secAccent = getEffectiveColor(secMeta) ?? 'rgba(219,0,29,0.1)'
        const secPatchUrl = secMeta?.patch
            ? `/api/orbat/patch?category=${cat}&section=${encodeURIComponent(sec.title)}&v=${secMeta.patch}`
            : null

        return (
            <div key={sectionKey}>
                {/* Section header */}
                {sec.title && (
                    <div className='flex items-center gap-0.5 px-2 py-1 mt-2' style={{ borderBottom: `1px solid ${secAccent}` }}>

                        {/* Patch thumbnail — structure managers only */}
                        {canManageStructure && (
                            <button
                                title='Upload section patch'
                                onClick={() => { metaTargetRef.current = { category: cat, sectionTitle: sec.title }; patchInputRef.current?.click() }}
                                style={{ background: 'none', border: secPatchUrl ? 'none' : '1px dashed rgba(255,255,255,0.1)', borderRadius: 3, padding: 1, cursor: 'pointer', flexShrink: 0, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 2 }}
                            >
                                {secPatchUrl
                                    ? <img src={secPatchUrl} alt='' style={{ width: 18, height: 18, objectFit: 'contain' }} />
                                    : <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.18)', letterSpacing: 0 }}>IMG</span>
                                }
                            </button>
                        )}

                        {/* Color swatch — structure managers only */}
                        {canManageStructure && (
                            <>
                                <button
                                    title='Set section color'
                                    onClick={() => {
                                        metaTargetRef.current = { category: cat, sectionTitle: sec.title }
                                        if (colorInputRef.current) colorInputRef.current.value = secMeta?.color ?? '#db001d'
                                        colorInputRef.current?.click()
                                    }}
                                    style={{ background: secMeta?.color ?? 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50%', width: 11, height: 11, cursor: 'pointer', flexShrink: 0, padding: 0 }}
                                />
                                {secMeta?.color && (
                                    <button
                                        title='Reset section color'
                                        onClick={() => handleColorClear(cat, sec.title)}
                                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.3)', lineHeight: 1, marginLeft: 4, marginRight: 2, flexShrink: 0 }}
                                    >
                                        ×
                                    </button>
                                )}
                                {(() => {
                                    const linkedRole = secMeta?.discordRoleId ? discordRoles.find(r => r.id === secMeta.discordRoleId) : null
                                    return (
                                        <button
                                            title={linkedRole ? `Discord role: ${linkedRole.name}` : 'Set Discord role'}
                                            onClick={() => { setRolePickerTarget({ category: cat, sectionTitle: sec.title }); setRoleSearch('') }}
                                            style={{ background: 'none', border: linkedRole ? 'none' : '1px dashed rgba(255,255,255,0.1)', borderRadius: 3, padding: 1, cursor: 'pointer', flexShrink: 0, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}
                                        >
                                            <span style={{ fontSize: 8, fontWeight: 700, color: linkedRole ? discordColor(linkedRole.color) : 'rgba(255,255,255,0.18)', letterSpacing: 0 }}>@</span>
                                        </button>
                                    )
                                })()}
                            </>
                        )}

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
                            <RoleSelect
                                category={cat}
                                value={null}
                                onChange={(roleId) => addRole(cat, sec.title, roleId)}
                                placeholder='Select a role…'
                            />
                            <IconButton size='small' onClick={() => setAddRoleKey(null)} sx={{ ...ghostBtn, padding: '2px' }}>
                                <Close sx={{ fontSize: 14 }} />
                            </IconButton>
                        </div>
                    ) : (
                        <Button
                            size='small'
                            sx={addBtn}
                            startIcon={<Add sx={{ fontSize: '11px !important' }} />}
                            onClick={() => setAddRoleKey(sectionKey)}
                        >
                            Add Role
                        </Button>
                    )
                )}
            </div>
        )
    }


    function renderColumn(cat: { _id: string; label: string }, sections: Section[], canAddSection: boolean) {
        const catMeta = getMeta(cat._id, null)
        const catEffective = getEffectiveColor(catMeta)
        const catColor = catEffective ?? 'var(--red)'
        const catColorAlpha = catEffective ? `${catEffective}26` : 'rgba(219,0,29,0.12)'

        const effectiveSections = sections.length === 0
            ? [{ title: '', sectionOrder: 0, positions: [] }]
            : sections

        return (
            <div key={cat._id} className='flex flex-col' style={{ ...tileStyle, borderTop: `2px solid ${catColor}` }}>

                {/* Column header */}
                <div className='flex items-center gap-2 px-3 py-2' style={{ borderBottom: `1px solid ${catColorAlpha}` }}>

                    {/* Category patch + color — structure managers only */}
                    {canManageStructure && (
                        <>
                            <button
                                title='Upload patch'
                                onClick={() => { metaTargetRef.current = { category: cat._id, sectionTitle: null }; patchInputRef.current?.click() }}
                                style={{ background: 'none', border: catMeta?.patch ? 'none' : '1px dashed rgba(255,255,255,0.1)', borderRadius: 3, padding: 1, cursor: 'pointer', flexShrink: 0, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                {catMeta?.patch
                                    ? <img src={`/api/orbat/patch?category=${cat._id}&v=${catMeta.patch}`} alt='' style={{ width: 18, height: 18, objectFit: 'contain' }} />
                                    : <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.18)', letterSpacing: 0 }}>IMG</span>
                                }
                            </button>
                            <button
                                title='Set platoon color'
                                onClick={() => {
                                    metaTargetRef.current = { category: cat._id, sectionTitle: null }
                                    if (colorInputRef.current) colorInputRef.current.value = catMeta?.color ?? '#db001d'
                                    colorInputRef.current?.click()
                                }}
                                style={{ background: catColor, border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', width: 11, height: 11, cursor: 'pointer', flexShrink: 0, padding: 0 }}
                            />
                            {catMeta?.color && (
                                <button
                                    title='Reset platoon color'
                                    onClick={() => handleColorClear(cat._id, null)}
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.3)', lineHeight: 1, flexShrink: 0, marginLeft: 2 }}
                                >
                                    ×
                                </button>
                            )}
                            {(() => {
                                const linkedRole = catMeta?.discordRoleId ? discordRoles.find(r => r.id === catMeta.discordRoleId) : null
                                return (
                                    <button
                                        title={linkedRole ? `Discord role: ${linkedRole.name}` : 'Set Discord role'}
                                        onClick={() => { setRolePickerTarget({ category: cat._id, sectionTitle: null }); setRoleSearch('') }}
                                        style={{ background: 'none', border: linkedRole ? 'none' : '1px dashed rgba(255,255,255,0.1)', borderRadius: 3, padding: 1, cursor: 'pointer', flexShrink: 0, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}
                                    >
                                        <span style={{ fontSize: 8, fontWeight: 700, color: linkedRole ? discordColor(linkedRole.color) : 'rgba(255,255,255,0.18)', letterSpacing: 0 }}>@</span>
                                    </button>
                                )
                            })()}
                        </>
                    )}

                    <Typography
                        fontSize='0.62rem'
                        fontWeight={700}
                        letterSpacing={2}
                        noWrap
                        style={{ textTransform: 'uppercase', color: catColor }}
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
        const catMeta = getMeta(cat._id, null)
        const catEffective = getEffectiveColor(catMeta)
        const catColor = catEffective ?? 'rgba(219,0,29,0.8)'
        const catPatchUrl = catMeta?.patch ? `/api/orbat/patch?category=${cat._id}&v=${catMeta.patch}` : null

        return (
            <div key={cat._id} className='flex flex-col' style={tileStyle}>

                {/* Header */}
                <div className='px-3 py-2 flex items-center gap-2' style={{ borderBottom: `1px solid ${catEffective ? `${catEffective}33` : 'rgba(219,0,29,0.12)'}` }}>

                    {/* Patch thumbnail */}
                    {canManageStructure && (
                        <button
                            title='Upload reservist patch'
                            onClick={() => { metaTargetRef.current = { category: cat._id, sectionTitle: null }; patchInputRef.current?.click() }}
                            style={{ background: 'none', border: catPatchUrl ? 'none' : '1px dashed rgba(255,255,255,0.1)', borderRadius: 3, padding: 1, cursor: 'pointer', flexShrink: 0, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            {catPatchUrl
                                ? <img src={catPatchUrl} alt='' style={{ width: 18, height: 18, objectFit: 'contain' }} />
                                : <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.18)', letterSpacing: 0 }}>IMG</span>
                            }
                        </button>
                    )}

                    {/* Color swatch */}
                    {canManageStructure && (
                        <>
                            <button
                                title='Set reservist color'
                                onClick={() => {
                                    metaTargetRef.current = { category: cat._id, sectionTitle: null }
                                    if (colorInputRef.current) colorInputRef.current.value = catMeta?.color ?? '#db001d'
                                    colorInputRef.current?.click()
                                }}
                                style={{ background: catMeta?.color ?? 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50%', width: 11, height: 11, cursor: 'pointer', flexShrink: 0, padding: 0 }}
                            />
                            {catMeta?.color && (
                                <button
                                    title='Reset reservist color'
                                    onClick={() => handleColorClear(cat._id, null)}
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.3)', lineHeight: 1, flexShrink: 0, marginLeft: 2 }}
                                >
                                    ×
                                </button>
                            )}
                            {(() => {
                                const linkedRole = catMeta?.discordRoleId ? discordRoles.find(r => r.id === catMeta.discordRoleId) : null
                                return (
                                    <button
                                        title={linkedRole ? `Discord role: ${linkedRole.name}` : 'Set Discord role'}
                                        onClick={() => { setRolePickerTarget({ category: cat._id, sectionTitle: null }); setRoleSearch('') }}
                                        style={{ background: 'none', border: linkedRole ? 'none' : '1px dashed rgba(255,255,255,0.1)', borderRadius: 3, padding: 1, cursor: 'pointer', flexShrink: 0, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}
                                    >
                                        <span style={{ fontSize: 8, fontWeight: 700, color: linkedRole ? discordColor(linkedRole.color) : 'rgba(255,255,255,0.18)', letterSpacing: 0 }}>@</span>
                                    </button>
                                )
                            })()}
                        </>
                    )}

                    <div className='flex-1 min-w-0'>
                        <Typography
                            fontSize='0.62rem'
                            fontWeight={700}
                            letterSpacing={2}
                            style={{ textTransform: 'uppercase', color: catColor }}
                        >
                            {cat.label}
                        </Typography>
                        <Typography fontSize='0.6rem' style={{ color: 'rgba(237,237,237,0.2)', marginTop: 2 }}>
                            {reservists.length} member{reservists.length !== 1 ? 's' : ''}
                        </Typography>
                    </div>
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
        return <TacticalSkeleton rows={10} className='p-8' />
    }

    const [hqCat, ...platoonCols] = PLATOON_CATEGORIES
    const canAddSectionFor = (id: string) => canManageStructure && !(SINGLE_SECTION_CATEGORIES as readonly string[]).includes(id)


    return (
        <div className='h-full w-full p-6 md:p-8 flex flex-col gap-5'>

            {/* Hidden inputs for color picker + patch upload (J4-Admin only) */}
            {canManageStructure && (
                <>
                    <input
                        ref={colorInputRef}
                        type='color'
                        style={{ position: 'fixed', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
                        onChange={e => handleColorInput(e.target.value)}
                    />
                    <input
                        ref={patchInputRef}
                        type='file'
                        accept='image/*'
                        style={{ position: 'fixed', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
                        onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) handlePatchUpload(file)
                            e.target.value = ''
                        }}
                    />
                </>
            )}

            {/* Header */}
            <div
                className='flex flex-col px-5 py-4'
                style={{
                    border: '1px solid rgba(219,0,29,0.42)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <div className='flex items-center justify-between'>
                    <div>
                        <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                            Unit
                        </Typography>
                        <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                            ORBAT Management
                        </Typography>
                    </div>
                </div>
            </div>
            <RolesManagerPanel open={rolesManagerOpen} onClose={() => setRolesManagerOpen(false)} />

            {canManageStructure && (
                <button
                    onClick={() => setRolesManagerOpen(true)}
                    style={{
                        position: 'fixed', bottom: 24, right: 24, zIndex: 1200,
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 18px', borderRadius: 999,
                        background: 'rgba(15,15,15,0.92)', border: '1px solid rgba(219,0,29,0.5)',
                        color: 'rgba(237,237,237,0.85)', fontSize: '0.72rem', fontWeight: 700,
                        letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)', transition: 'background 0.15s, border-color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(219,0,29,0.18)'; e.currentTarget.style.borderColor = 'var(--red)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(15,15,15,0.92)'; e.currentTarget.style.borderColor = 'rgba(219,0,29,0.5)' }}
                >
                    <Settings sx={{ fontSize: 16 }} />
                    Manage Roles
                </button>
            )}

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
                PaperProps={{ style: { background: '#141414', border: '1px solid rgba(219,0,29,0.32)' } }}
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
                PaperProps={{ style: { background: '#141414', border: '1px solid rgba(219,0,29,0.32)' } }}
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
                PaperProps={{ style: { background: '#141414', border: '1px solid rgba(219,0,29,0.32)' } }}
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
                PaperProps={{ style: { background: '#141414', border: '1px solid rgba(219,0,29,0.32)' } }}
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
                PaperProps={{ style: { background: '#141414', border: '1px solid rgba(219,0,29,0.32)' } }}
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


            {/* ── Discord Role Picker Dialog ──────────────────────────────────── */}
            <Dialog
                open={!!rolePickerTarget}
                onClose={() => { setRolePickerTarget(null); setRoleSearch('') }}
                maxWidth='xs'
                fullWidth
                PaperProps={{ style: { background: '#141414', border: '1px solid rgba(219,0,29,0.32)' } }}
            >
                <DialogTitle style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                    Set Discord Role
                    {rolePickerTarget && (
                        <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.35)', marginTop: 2 }}>
                            {rolePickerTarget.sectionTitle ?? rolePickerTarget.category}
                        </Typography>
                    )}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        size='small'
                        placeholder='Search roles...'
                        value={roleSearch}
                        onChange={e => setRoleSearch(e.target.value)}
                        sx={{ mb: 1.5 }}
                        inputProps={{ style: { fontSize: '0.82rem' } }}
                    />
                    <div className='flex flex-col gap-1' style={{ maxHeight: 340, overflowY: 'auto' }}>
                        {discordRoles
                            .filter(r => r.name.toLowerCase().includes(roleSearch.toLowerCase()))
                            .map(r => {
                                const color = discordColor(r.color)
                                const currentId = rolePickerTarget
                                    ? getMeta(rolePickerTarget.category, rolePickerTarget.sectionTitle)?.discordRoleId
                                    : undefined
                                const isSelected = currentId === r.id
                                return (
                                    <button
                                        key={r.id}
                                        onClick={() => saveDiscordRole(r.id)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '6px 10px',
                                            background: isSelected ? 'rgba(219,0,29,0.1)' : 'rgba(255,255,255,0.03)',
                                            border: isSelected ? '1px solid rgba(219,0,29,0.35)' : '1px solid rgba(255,255,255,0.05)',
                                            borderRadius: 4,
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            width: '100%',
                                        }}
                                    >
                                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
                                        <Typography fontSize='0.78rem' style={{ color: 'rgba(237,237,237,0.8)', flex: 1 }}>
                                            {r.name}
                                        </Typography>
                                        {isSelected && (
                                            <Typography fontSize='0.65rem' style={{ color: 'var(--red)' }}>✓</Typography>
                                        )}
                                    </button>
                                )
                            })
                        }
                        {discordRoles.filter(r => r.name.toLowerCase().includes(roleSearch.toLowerCase())).length === 0 && (
                            <Typography fontSize='0.75rem' style={{ color: 'rgba(237,237,237,0.25)', textAlign: 'center', padding: 16 }}>
                                No roles found
                            </Typography>
                        )}
                    </div>
                </DialogContent>
                <DialogActions>
                    {rolePickerTarget && getMeta(rolePickerTarget.category, rolePickerTarget.sectionTitle)?.discordRoleId && (
                        <Button sx={{ ...ghostBtn, color: 'rgba(219,0,29,0.5)', '&:hover': { color: 'rgba(219,0,29,0.85)' } }} onClick={() => saveDiscordRole(null)}>
                            Clear Role
                        </Button>
                    )}
                    <Button sx={ghostBtn} onClick={() => { setRolePickerTarget(null); setRoleSearch('') }}>Cancel</Button>
                </DialogActions>
            </Dialog>


            {/* ── Member Detail Popout — same MemberDetailPanel used on the dashboard Members page ── */}
            <Dialog
                open={!!milpacUsername}
                onClose={requestCloseMilpac}
                maxWidth='md'
                fullWidth
                PaperProps={{
                    style: {
                        background: '#0e0e0e',
                        border: '1px solid rgba(219,0,29,0.32)',
                        height: '85vh',
                        maxHeight: '85vh',
                    },
                }}
            >
                <DialogTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.5)' }}>
                        {milpacUsername ? `Milpac — ${allUsers.find(u => u.username === milpacUsername)?.displayName || milpacUsername}` : 'Loading…'}
                        {milpacDirty && <span style={{ marginLeft: 8, color: 'rgba(219,0,29,0.7)', fontSize: '0.65rem' }}>● Unsaved changes</span>}
                    </span>
                    <IconButton size='small' onClick={requestCloseMilpac} sx={ghostBtn}>
                        <Close fontSize='small' />
                    </IconButton>
                </DialogTitle>
                <DialogContent style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    {milpacUsername && (
                        <MemberDetailPanel
                            key={milpacUsername}
                            username={milpacUsername}
                            isJ4={isJ4}
                            canEditRestricted={canMilpacEditRestricted}
                            canEditStandard={canMilpacEditStandard}
                            canImpersonate={canImpersonate}
                            onDirtyChange={setMilpacDirty}
                            onMemberDeleted={handleMemberDeletedFromOrbat}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* ── Milpac Unsaved Changes Confirm ──────────────────────────────── */}
            <Dialog
                open={milpacConfirmClose}
                onClose={() => setMilpacConfirmClose(false)}
                PaperProps={{ style: { background: '#0e0e0e', border: '1px solid rgba(219,0,29,0.32)' } }}
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
                    <button onClick={confirmCloseMilpac} style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(219,0,29,0.42)', border: '1px solid rgba(219,0,29,0.27)', color: 'rgba(219,0,29,0.9)', padding: '6px 16px', cursor: 'pointer' }}>
                        Discard & Close
                    </button>
                </DialogActions>
            </Dialog>


        </div>
    )
}
