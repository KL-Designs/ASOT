'use client'

import { useState, useEffect, useRef } from 'react'
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Box, Typography, Button, Avatar, IconButton,
    TextField, Autocomplete, CircularProgress, Divider, Chip,
} from '@mui/material'
import { Close, Delete, Add, DragIndicator } from '@mui/icons-material'
import {
    DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
    type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'

// ── Types ──────────────────────────────────────────────────────────────────────

interface MemberRecord {
    userId: string
    displayName: string
    avatarURL: string
    orbatRole: string
    orbatSection: string       // their real ORBAT home section
    currentSection: string     // where they are in this op (may differ)
    rsvp: 'attending' | 'not_attending' | null
    confirmed: boolean
}

interface MemberOption {
    id: string
    displayName: string
}

interface Props {
    open: boolean
    onClose: () => void
    operationId: string
    sections: string[]           // ordered list of section titles visible in the panel
    records: MemberRecord[]
    themeColor: string
    onSaved: () => void | Promise<void>
}

// ── Draggable member row ───────────────────────────────────────────────────────

function DraggableMember({
    record, onRemove, c, isDragOverlay = false,
}: {
    record: MemberRecord
    onRemove: (userId: string) => void
    c: (a: number) => string
    isDragOverlay?: boolean
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: record.userId })

    return (
        <Box
            ref={setNodeRef}
            {...attributes}
            sx={{
                display: 'flex', alignItems: 'center', gap: 1, py: 0.6, px: 1,
                borderRadius: 1,
                background: isDragging ? 'rgba(255,255,255,0.0)' : isDragOverlay ? 'rgba(20,20,24,0.97)' : 'rgba(255,255,255,0.03)',
                border: isDragOverlay ? `1px solid ${c(0.4)}` : '1px solid transparent',
                opacity: isDragging ? 0.3 : 1,
                cursor: isDragOverlay ? 'grabbing' : 'default',
                '&:hover': { background: isDragging ? undefined : 'rgba(255,255,255,0.05)' },
            }}
        >
            <Box
                {...listeners}
                sx={{ color: 'rgba(237,237,237,0.2)', cursor: 'grab', display: 'flex', alignItems: 'center', flexShrink: 0, touchAction: 'none' }}
            >
                <DragIndicator sx={{ fontSize: 16 }} />
            </Box>
            <Avatar src={record.avatarURL} sx={{ width: 20, height: 20, fontSize: '0.5rem', background: c(0.3), flexShrink: 0 }}>
                {record.displayName.charAt(0)}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontSize='0.72rem' noWrap>
                    {record.orbatRole && (
                        <span style={{ color: 'rgba(237,237,237,0.3)', marginRight: 4, fontSize: '0.65rem' }}>{record.orbatRole}</span>
                    )}
                    {record.displayName}
                </Typography>
            </Box>
            {record.rsvp === 'attending' && (
                <Chip label='RSVP' size='small' sx={{ fontSize: '0.5rem', height: 14, background: 'rgba(76,175,80,0.15)', color: '#4caf50', flexShrink: 0 }} />
            )}
            <IconButton
                size='small'
                onClick={() => onRemove(record.userId)}
                sx={{ color: 'rgba(219,0,29,0.4)', '&:hover': { color: 'rgba(219,0,29,0.8)' }, p: 0.25, flexShrink: 0 }}
            >
                <Delete sx={{ fontSize: 14 }} />
            </IconButton>
        </Box>
    )
}

// ── Droppable section ──────────────────────────────────────────────────────────

function DroppableSection({
    title, members, onRemove, c, isOver,
}: {
    title: string
    members: MemberRecord[]
    onRemove: (userId: string) => void
    c: (a: number) => string
    isOver: boolean
}) {
    const { setNodeRef } = useDroppable({ id: title })

    return (
        <Box
            ref={setNodeRef}
            sx={{
                mb: 1.5,
                border: `1px solid ${isOver ? c(0.4) : 'rgba(255,255,255,0.07)'}`,
                borderTop: `2px solid ${isOver ? c(0.7) : 'rgba(255,255,255,0.12)'}`,
                borderRadius: '2px',
                background: isOver ? c(0.04) : 'rgba(255,255,255,0.02)',
                transition: 'border-color 0.15s, background 0.15s',
                minHeight: 60,
            }}
        >
            <Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography fontSize='0.62rem' fontWeight={700} letterSpacing={2} sx={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.5)' }}>
                    {title}
                </Typography>
                <Typography fontSize='0.6rem' sx={{ color: 'rgba(237,237,237,0.25)' }}>
                    {members.length}
                </Typography>
            </Box>
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.04)' }} />
            <Box sx={{ p: 0.75, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                {members.length === 0 && (
                    <Typography fontSize='0.6rem' sx={{ color: 'rgba(237,237,237,0.15)', textAlign: 'center', py: 1.5, letterSpacing: 1 }}>
                        Drop here
                    </Typography>
                )}
                {members.map(r => (
                    <DraggableMember key={r.userId} record={r} onRemove={onRemove} c={c} />
                ))}
            </Box>
        </Box>
    )
}

// ── Main dialog ────────────────────────────────────────────────────────────────

export default function AttendanceManageDialog({ open, onClose, operationId, sections, records, themeColor, onSaved }: Props) {
    const [r_, g_, b_] = [
        parseInt(themeColor.replace('#', '').substring(0, 2), 16),
        parseInt(themeColor.replace('#', '').substring(2, 4), 16),
        parseInt(themeColor.replace('#', '').substring(4, 6), 16),
    ]
    const c = (a: number) => `rgba(${r_},${g_},${b_},${a})`

    // Local working copy: section → members
    const [sectionMap, setSectionMap] = useState<Map<string, MemberRecord[]>>(new Map())
    const [activeDrag, setActiveDrag] = useState<MemberRecord | null>(null)
    const [overSection, setOverSection]   = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    // Member search (add)
    const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
    const [addSection, setAddSection] = useState<string>('')
    const [addMember, setAddMember] = useState<MemberOption | null>(null)
    const [loadingMembers, setLoadingMembers] = useState(false)

    // Initialise local state only when the dialog transitions from closed → open
    // (not on every poll refresh that changes the records/sections props)
    const prevOpenRef = useRef(false)
    useEffect(() => {
        if (open && !prevOpenRef.current) {
            snapshotRef.current = records.map(r => ({ ...r }))
            const map = new Map<string, MemberRecord[]>()
            for (const s of sections) map.set(s, [])
            for (const r of records) {
                const sec = r.currentSection || r.orbatSection
                if (!map.has(sec)) map.set(sec, [])
                map.get(sec)!.push({ ...r })
            }
            setSectionMap(map)
            setAddSection(sections[0] ?? '')
            setAddMember(null)
            setSaveError(null)
        }
        prevOpenRef.current = open
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    // Fetch member list once on open
    useEffect(() => {
        if (!open || memberOptions.length > 0) return
        setLoadingMembers(true)
        fetch('/api/members')
            .then(r => r.json())
            .then(d => setMemberOptions(d.members ?? []))
            .catch(() => {})
            .finally(() => setLoadingMembers(false))
    }, [open])

    // ── DnD ─────────────────────────────────────────────────────────────────────

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

    const findSection = (userId: string) => {
        for (const [sec, members] of sectionMap) {
            if (members.some(m => m.userId === userId)) return sec
        }
        return null
    }

    const onDragStart = ({ active }: DragStartEvent) => {
        for (const members of sectionMap.values()) {
            const found = members.find(m => m.userId === active.id)
            if (found) { setActiveDrag(found); break }
        }
    }

    const onDragOver = ({ over }: DragOverEvent) => {
        setOverSection(over ? String(over.id) : null)
    }

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        setActiveDrag(null)
        setOverSection(null)
        if (!over) return
        const fromSec = findSection(String(active.id))
        const toSec   = String(over.id)
        if (!fromSec || fromSec === toSec) return

        setSectionMap(prev => {
            const next = new Map(prev)
            const member = next.get(fromSec)!.find(m => m.userId === active.id)!
            next.set(fromSec, next.get(fromSec)!.filter(m => m.userId !== active.id))
            next.set(toSec, [...(next.get(toSec) ?? []), { ...member, currentSection: toSec }])
            return next
        })
    }

    // ── Remove ───────────────────────────────────────────────────────────────────

    const handleRemove = (userId: string) => {
        setSectionMap(prev => {
            const next = new Map(prev)
            for (const [sec, members] of next) {
                next.set(sec, members.filter(m => m.userId !== userId))
            }
            return next
        })
    }

    // ── Add member ───────────────────────────────────────────────────────────────

    const handleAdd = () => {
        if (!addMember || !addSection) return
        const existing = [...sectionMap.values()].flat().find(m => m.userId === addMember.id)
        if (existing) return  // already present

        setSectionMap(prev => {
            const next = new Map(prev)
            if (!next.has(addSection)) next.set(addSection, [])
            next.get(addSection)!.push({
                userId: addMember.id,
                displayName: addMember.displayName,
                avatarURL: '',
                orbatRole: '',
                orbatSection: addSection,
                currentSection: addSection,
                rsvp: null,
                confirmed: false,
            })
            return next
        })
        setAddMember(null)
    }

    // ── Save ─────────────────────────────────────────────────────────────────────

    // Snapshot of records taken when the dialog opened (stable reference for diff)
    const snapshotRef = useRef<MemberRecord[]>([])

    const handleSave = async () => {
        setSaving(true)
        setSaveError(null)
        try {
            const originalMap = new Map(snapshotRef.current.map(r => [r.userId, r]))
            const newFlat = [...sectionMap.entries()].flatMap(([sec, mems]) =>
                mems.map(m => ({ ...m, currentSection: sec }))
            )
            const newIds = new Set(newFlat.map(m => m.userId))

            const removals = snapshotRef.current.filter(r => !newIds.has(r.userId)).map(r => r.userId)

            const moves = newFlat
                .filter(m => {
                    const orig = originalMap.get(m.userId)
                    if (!orig) return false
                    return m.currentSection !== orig.currentSection
                })
                .map(m => ({
                    userId: m.userId,
                    targetSection: m.currentSection === m.orbatSection ? null : m.currentSection,
                }))

            const additions = newFlat
                .filter(m => !originalMap.has(m.userId))
                .map(m => ({ userId: m.userId, sectionTitle: m.currentSection, orbatRole: m.orbatRole }))

            const res = await fetch(`/api/operations/${operationId}/attendance/manage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ moves, removals, additions }),
            })

            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                setSaveError(body.error ?? `Server error ${res.status}`)
                return
            }

            await onSaved()
            onClose()
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : 'Unknown error')
        } finally {
            setSaving(false)
        }
    }

    const allSections = [...sectionMap.keys()]

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth='xl'
            fullWidth
            PaperProps={{
                sx: {
                    background: 'rgba(12,12,16,0.98)',
                    border: `1px solid ${c(0.25)}`,
                    borderTop: `3px solid ${c(0.7)}`,
                    backdropFilter: 'blur(20px)',
                    maxHeight: '90vh',
                },
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ width: 3, height: 12, background: c(0.8), flexShrink: 0 }} />
                    <Typography fontSize='0.7rem' fontWeight={800} letterSpacing={3} sx={{ textTransform: 'uppercase', color: c(0.9) }}>
                        Manage Attendance
                    </Typography>
                </Box>
                <IconButton size='small' onClick={onClose} sx={{ color: 'rgba(237,237,237,0.4)' }}>
                    <Close sx={{ fontSize: 18 }} />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ pt: 2, pb: 0, overflowX: 'hidden' }}>
                <Typography fontSize='0.6rem' letterSpacing={1.5} sx={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', mb: 2 }}>
                    Drag members between sections · remove with × · add new below
                </Typography>

                {/* ── Add member row ──────────────────────────────────────── */}
                <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <Autocomplete
                        options={memberOptions}
                        getOptionLabel={o => o.displayName}
                        value={addMember}
                        onChange={(_, v) => setAddMember(v)}
                        loading={loadingMembers}
                        size='small'
                        sx={{ flex: 2, minWidth: 180 }}
                        renderInput={params => (
                            <TextField
                                {...params}
                                label='Member'
                                size='small'
                                sx={{
                                    '& .MuiOutlinedInput-root': { fontSize: '0.75rem', background: 'rgba(0,0,0,0.3)' },
                                    '& .MuiInputLabel-root': { fontSize: '0.72rem' },
                                }}
                            />
                        )}
                    />
                    <Autocomplete
                        options={allSections}
                        value={addSection}
                        onChange={(_, v) => setAddSection(v ?? '')}
                        size='small'
                        sx={{ flex: 2, minWidth: 150 }}
                        renderInput={params => (
                            <TextField
                                {...params}
                                label='Section'
                                size='small'
                                sx={{
                                    '& .MuiOutlinedInput-root': { fontSize: '0.75rem', background: 'rgba(0,0,0,0.3)' },
                                    '& .MuiInputLabel-root': { fontSize: '0.72rem' },
                                }}
                            />
                        )}
                    />
                    <Button
                        variant='outlined'
                        size='small'
                        disabled={!addMember || !addSection}
                        onClick={handleAdd}
                        startIcon={<Add sx={{ fontSize: 14 }} />}
                        sx={{
                            fontSize: '0.65rem', letterSpacing: 1.5, textTransform: 'uppercase', flexShrink: 0,
                            borderColor: c(0.35), color: c(0.8),
                            '&:hover': { borderColor: c(0.6), background: c(0.08) },
                            '&.Mui-disabled': { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.2)' },
                        }}
                    >
                        Add
                    </Button>
                </Box>

                {/* ── Drag-and-drop sections ──────────────────────────────── */}
                <DndContext sensors={sensors} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
                    <Box sx={{ columns: { xs: 1, sm: 2 }, columnGap: 2 }}>
                        {allSections.map(sec => (
                            <Box key={sec} sx={{ breakInside: 'avoid', mb: 0 }}>
                                <DroppableSection
                                    title={sec}
                                    members={sectionMap.get(sec) ?? []}
                                    onRemove={handleRemove}
                                    c={c}
                                    isOver={overSection === sec}
                                />
                            </Box>
                        ))}
                    </Box>

                    <DragOverlay dropAnimation={null}>
                        {activeDrag && (
                            <DraggableMember record={activeDrag} onRemove={() => {}} c={c} isDragOverlay />
                        )}
                    </DragOverlay>
                </DndContext>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(255,255,255,0.06)', gap: 1, flexWrap: 'wrap' }}>
                {saveError && (
                    <Typography fontSize='0.65rem' sx={{ color: '#f44336', flex: 1 }}>
                        {saveError}
                    </Typography>
                )}
                <Button
                    size='small'
                    onClick={onClose}
                    sx={{ fontSize: '0.65rem', letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' }}
                >
                    Cancel
                </Button>
                <Button
                    size='small'
                    variant='contained'
                    disabled={saving}
                    onClick={handleSave}
                    sx={{
                        fontSize: '0.65rem', letterSpacing: 2, textTransform: 'uppercase',
                        background: c(0.75), '&:hover': { background: c(0.95) },
                    }}
                >
                    {saving ? <CircularProgress size={14} sx={{ color: 'white' }} /> : 'Save Changes'}
                </Button>
            </DialogActions>
        </Dialog>
    )
}
