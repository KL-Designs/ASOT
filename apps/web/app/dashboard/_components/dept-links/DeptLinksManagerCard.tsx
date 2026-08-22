'use client'

import { useState, useEffect, useCallback } from 'react'
import { IconButton, Alert, Button, Tooltip } from '@mui/material'
import { Add, Refresh, Edit, Delete, DragIndicator, Link as LinkIcon, Lock } from '@mui/icons-material'
import {
    DndContext, PointerSensor, useSensor, useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import ConfirmDialog from '@/components/confirm-dialog'
import DeptLinkModal from './DeptLinkModal'

interface Props {
    department: string
    canManage: boolean
}

function SortableRow({
    link, onEdit, onDelete, onRefresh, refreshingId,
}: {
    link: DepartmentLinkListItem
    onEdit: (link: DepartmentLinkListItem) => void
    onDelete: (link: DepartmentLinkListItem) => void
    onRefresh: (link: DepartmentLinkListItem) => void
    refreshingId: string | null
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link._id })
    const [iconFailed, setIconFailed] = useState(false)

    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px',
                marginBottom: 4,
                background: isDragging ? 'rgba(20,20,24,0.97)' : 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                opacity: isDragging ? 0.5 : 1,
            }}
        >
            <span {...attributes} {...listeners} style={{ display: 'flex', cursor: 'grab', color: 'rgba(237,237,237,0.25)', touchAction: 'none', flexShrink: 0 }}>
                <DragIndicator sx={{ fontSize: 16 }} />
            </span>

            {link.hasFavicon && !iconFailed ? (
                <img
                    src={`/api/admin/dept-links/${link._id}/favicon?v=${link.faviconVersion}`}
                    width={18} height={18}
                    style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }}
                    onError={() => setIconFailed(true)}
                />
            ) : (
                <LinkIcon sx={{ fontSize: 18, color: 'rgba(237,237,237,0.35)', flexShrink: 0 }} />
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.85)' }}>
                        {link.nameOverride ?? link.fetchedTitle}
                    </span>
                    {link.visibleToRoleIds.length > 0 && (
                        <Tooltip title='Restricted to specific sub-roles'>
                            <Lock sx={{ fontSize: 13, color: 'rgb(255,179,0)' }} />
                        </Tooltip>
                    )}
                </div>
                {link.nameOverride && (
                    <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)' }}>{link.fetchedTitle}</div>
                )}
                <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {link.url}
                </div>
            </div>

            <IconButton size='small' onClick={() => onRefresh(link)} disabled={refreshingId === link._id}>
                <Refresh sx={{ fontSize: 15, color: 'rgba(237,237,237,0.4)' }} />
            </IconButton>
            <IconButton size='small' onClick={() => onEdit(link)}>
                <Edit sx={{ fontSize: 15, color: 'rgba(237,237,237,0.4)' }} />
            </IconButton>
            <IconButton size='small' onClick={() => onDelete(link)}>
                <Delete sx={{ fontSize: 15, color: 'rgba(219,0,29,0.4)' }} />
            </IconButton>
        </div>
    )
}

// Renders only for managers (D8); non-managers reach Settings for the
// members/leadership cards and see their links on the rail instead.
export default function DeptLinksManagerCard({ department, canManage }: Props) {
    const [links, setLinks] = useState<DepartmentLinkListItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [modalState, setModalState] = useState<{ link: DepartmentLinkListItem | null } | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<DepartmentLinkListItem | null>(null)
    const [refreshingId, setRefreshingId] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`/api/admin/dept-links?department=${department}`)
            const data = await res.json()
            if (!res.ok) {
                setError(data.error ?? 'Failed to load quick links')
                setLinks([])
            } else {
                setLinks(data.links ?? [])
            }
        } catch {
            setError('Failed to load quick links')
        } finally {
            setLoading(false)
        }
    }, [department])

    useEffect(() => {
        if (canManage) load()
    }, [canManage, load])

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

    async function onDragEnd({ active, over }: DragEndEvent) {
        if (!over) return
        const activeId = String(active.id)
        const overId = String(over.id)
        if (activeId === overId) return

        const sorted = [...links].sort((a, b) => a.order - b.order)
        const overIndex = sorted.findIndex(l => l._id === overId)
        if (overIndex < 0) return

        const target = sorted[overIndex]
        const prevSibling = sorted[overIndex - 1]
        const newOrder = prevSibling ? (prevSibling.order + target.order) / 2 : target.order - 1

        setLinks(prev => prev.map(l => l._id === activeId ? { ...l, order: newOrder } : l))

        await fetch(`/api/admin/dept-links/${activeId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: newOrder }),
        })
        load()
    }

    async function handleRefresh(link: DepartmentLinkListItem) {
        setRefreshingId(link._id)
        await fetch(`/api/admin/dept-links/${link._id}/favicon`, { method: 'POST' })
        setRefreshingId(null)
        load()
    }

    async function handleDelete() {
        if (!confirmDelete) return
        await fetch(`/api/admin/dept-links/${confirmDelete._id}`, { method: 'DELETE' })
        setConfirmDelete(null)
        load()
    }

    if (!canManage) return null

    const sortedLinks = [...links].sort((a, b) => a.order - b.order)

    return (
        <div className='px-6 pt-6'>
            <div style={{ position: 'relative', border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.04)', padding: '16px 20px' }}>
                <CornerBrackets />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'var(--txt-4)' }}>{'//'}</span> QUICK LINKS
                    </span>
                    <Button size='small' startIcon={<Add sx={{ fontSize: 14 }} />} onClick={() => setModalState({ link: null })} sx={{ fontSize: '0.65rem' }}>
                        Add Link
                    </Button>
                </div>

                {error && <Alert severity='error' sx={{ fontSize: '0.72rem', mb: 1.5 }}>{error}</Alert>}

                {!loading && sortedLinks.length === 0 && !error && (
                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', padding: '8px 0' }}>
                        No quick links yet.
                    </div>
                )}

                <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                    <SortableContext items={sortedLinks.map(l => l._id)} strategy={verticalListSortingStrategy}>
                        {sortedLinks.map(link => (
                            <SortableRow
                                key={link._id}
                                link={link}
                                onEdit={l => setModalState({ link: l })}
                                onDelete={l => setConfirmDelete(l)}
                                onRefresh={handleRefresh}
                                refreshingId={refreshingId}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
            </div>

            {modalState && (
                <DeptLinkModal
                    open
                    onClose={() => setModalState(null)}
                    department={department}
                    link={modalState.link}
                    onSaved={load}
                />
            )}

            <ConfirmDialog
                open={!!confirmDelete}
                danger
                title='Delete Quick Link'
                message={`Delete "${confirmDelete?.nameOverride ?? confirmDelete?.fetchedTitle ?? ''}"? This cannot be undone.`}
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete(null)}
            />
        </div>
    )
}
