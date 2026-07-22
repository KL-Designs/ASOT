'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { IconButton, TextField, CircularProgress } from '@mui/material'
import { Add, Close, DragIndicator, Delete } from '@mui/icons-material'
import {
    DndContext, PointerSensor, useSensor, useSensors, useDroppable,
    type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ConfirmDialog from '@/components/confirm-dialog'
import BoardCardModal from './BoardCardModal'

interface Props {
    department: string
    canManageColumns: boolean
}

// ── Draggable + sortable card ────────────────────────────────────────────────

function SortableCard({ card, onClick }: { card: BoardCard; onClick: () => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(card._id) })

    return (
        <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            onClick={onClick}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                padding: '8px 10px',
                marginBottom: 6,
                background: isDragging ? 'rgba(20,20,24,0.97)' : 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderLeft: '2px solid var(--red)',
                cursor: 'grab',
                touchAction: 'none',
                opacity: isDragging ? 0.5 : 1,
            }}
        >
            <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.85)', marginBottom: card.assigneeName || card.linkedTaskId ? 4 : 0 }}>
                {card.title}
            </div>
            {card.assigneeName && (
                <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)' }}>👤 {card.assigneeName}</div>
            )}
            {card.linkedTaskId && (
                <div style={{ fontSize: '0.62rem', color: 'rgba(0,229,255,0.6)' }}>🔗 Linked task</div>
            )}
        </div>
    )
}

// ── Droppable column ──────────────────────────────────────────────────────────

function Column({
    column, cards, canManageColumns, onAddCard, onEditCard, onRename, onDelete,
}: {
    column: BoardColumn
    cards: BoardCard[]
    canManageColumns: boolean
    onAddCard: (columnId: string) => void
    onEditCard: (card: BoardCard) => void
    onRename: (columnId: string, title: string) => void
    onDelete: (columnId: string) => void
}) {
    const { setNodeRef, isOver } = useDroppable({ id: String(column._id) })
    const [editing, setEditing] = useState(false)
    const [titleVal, setTitleVal] = useState(column.title)

    const cardIds = useMemo(() => cards.map(c => String(c._id)), [cards])

    return (
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px', marginBottom: 4 }}>
                {editing ? (
                    <TextField
                        size='small' value={titleVal} autoFocus
                        onChange={e => setTitleVal(e.target.value)}
                        onBlur={() => { setEditing(false); if (titleVal.trim() && titleVal !== column.title) onRename(String(column._id), titleVal.trim()) }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        inputProps={{ style: { fontSize: '0.72rem', padding: '2px 6px' } }}
                        sx={{ flex: 1 }}
                    />
                ) : (
                    <span
                        onClick={() => canManageColumns && setEditing(true)}
                        style={{ flex: 1, fontSize: '0.68rem', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(237,237,237,0.6)', cursor: canManageColumns ? 'text' : 'default' }}
                    >
                        {column.title}
                    </span>
                )}
                <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.25)' }}>{cards.length}</span>
                {canManageColumns && (
                    <IconButton size='small' onClick={() => onDelete(String(column._id))} sx={{ p: 0.25 }}>
                        <Delete sx={{ fontSize: 13, color: 'rgba(219,0,29,0.4)' }} />
                    </IconButton>
                )}
            </div>

            <div
                ref={setNodeRef}
                style={{
                    flex: 1, minHeight: 80, padding: 6,
                    background: isOver ? 'rgba(219,0,29,0.05)' : 'rgba(255,255,255,0.015)',
                    border: `1px solid ${isOver ? 'rgba(219,0,29,0.35)' : 'rgba(255,255,255,0.06)'}`,
                    borderTop: `2px solid ${isOver ? 'var(--red)' : 'rgba(255,255,255,0.1)'}`,
                    transition: 'background 0.15s, border-color 0.15s',
                }}
            >
                <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
                    {cards.map(card => (
                        <SortableCard key={String(card._id)} card={card} onClick={() => onEditCard(card)} />
                    ))}
                </SortableContext>
                <button
                    onClick={() => onAddCard(String(column._id))}
                    style={{ all: 'unset', display: 'flex', alignItems: 'center', gap: 4, width: '100%', padding: '6px 4px', cursor: 'pointer', fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)' }}
                >
                    <Add sx={{ fontSize: 13 }} /> Add card
                </button>
            </div>
        </div>
    )
}

// ── Main tab ───────────────────────────────────────────────────────────────────

export default function BoardTab({ department, canManageColumns }: Props) {
    const [columns, setColumns] = useState<BoardColumn[]>([])
    const [cards, setCards] = useState<BoardCard[]>([])
    const [loading, setLoading] = useState(true)
    const [addingColumn, setAddingColumn] = useState(false)
    const [newColumnTitle, setNewColumnTitle] = useState('')
    const [modalState, setModalState] = useState<{ columnId: string; card: BoardCard | null } | null>(null)
    const [confirmDeleteColumn, setConfirmDeleteColumn] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const [colRes, cardRes] = await Promise.all([
            fetch(`/api/admin/board/columns?department=${department}`).then(r => r.json()),
            fetch(`/api/admin/board/cards?department=${department}`).then(r => r.json()),
        ])
        setColumns(colRes.columns ?? [])
        setCards(cardRes.cards ?? [])
        setLoading(false)
    }, [department])

    useEffect(() => { load() }, [load])

    const cardsByColumn = useMemo(() => {
        const map = new Map<string, BoardCard[]>()
        for (const col of columns) map.set(String(col._id), [])
        for (const card of cards) {
            const key = String(card.columnId)
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(card)
        }
        for (const list of map.values()) list.sort((a, b) => a.order - b.order)
        return map
    }, [columns, cards])

    // ── DnD ─────────────────────────────────────────────────────────────────────

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

    function findColumnOf(cardId: string): string | null {
        for (const [colId, list] of cardsByColumn) {
            if (list.some(c => String(c._id) === cardId)) return colId
        }
        return null
    }

    async function onDragEnd({ active, over }: DragEndEvent) {
        if (!over) return
        const activeId = String(active.id)
        const overId = String(over.id)
        if (activeId === overId) return

        const fromColId = findColumnOf(activeId)
        if (!fromColId) return

        // Dropped over a column's empty area (over.id is a column id) or over another card
        const toColId = columns.some(c => String(c._id) === overId) ? overId : findColumnOf(overId)
        if (!toColId) return

        const toList = cardsByColumn.get(toColId) ?? []
        const overIndex = toList.findIndex(c => String(c._id) === overId)
        let newOrder: number
        if (overIndex < 0) {
            // Dropped on the column's empty area (not on a specific card) — append to end
            newOrder = (toList[toList.length - 1]?.order ?? -1) + 1
        } else {
            // Dropped onto a specific card — insert immediately before it, using the
            // midpoint between it and its previous sibling so the new order value
            // never collides with an existing one.
            const target = toList[overIndex]
            const prevSibling = toList[overIndex - 1]
            newOrder = prevSibling ? (prevSibling.order + target.order) / 2 : target.order - 1
        }

        // Optimistic local update — columnId is overwritten by the very next load() regardless
        setCards(prev => prev.map(c => String(c._id) === activeId ? { ...c, columnId: toColId as unknown as BoardCard['columnId'], order: newOrder } : c))

        await fetch(`/api/admin/board/cards/${activeId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ columnId: toColId, order: newOrder }),
        })
        load()
    }

    // ── Column CRUD ──────────────────────────────────────────────────────────────

    async function handleAddColumn() {
        if (!newColumnTitle.trim()) return
        setAddingColumn(false)
        await fetch('/api/admin/board/columns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ department, title: newColumnTitle.trim() }),
        })
        setNewColumnTitle('')
        load()
    }

    async function handleRenameColumn(columnId: string, title: string) {
        await fetch(`/api/admin/board/columns/${columnId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title }),
        })
        load()
    }

    async function handleDeleteColumn() {
        if (!confirmDeleteColumn) return
        await fetch(`/api/admin/board/columns/${confirmDeleteColumn}`, { method: 'DELETE' })
        setConfirmDeleteColumn(null)
        load()
    }

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><CircularProgress size={22} /></div>
    }

    return (
        <div style={{ padding: '16px 24px', overflowX: 'auto' }}>
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    {columns.map(col => (
                        <Column
                            key={String(col._id)}
                            column={col}
                            cards={cardsByColumn.get(String(col._id)) ?? []}
                            canManageColumns={canManageColumns}
                            onAddCard={columnId => setModalState({ columnId, card: null })}
                            onEditCard={card => setModalState({ columnId: String(card.columnId), card })}
                            onRename={handleRenameColumn}
                            onDelete={columnId => setConfirmDeleteColumn(columnId)}
                        />
                    ))}

                    {canManageColumns && (
                        <div style={{ width: 220, flexShrink: 0 }}>
                            {addingColumn ? (
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <TextField
                                        size='small' autoFocus value={newColumnTitle}
                                        onChange={e => setNewColumnTitle(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') setAddingColumn(false) }}
                                        placeholder='Column name…'
                                        inputProps={{ style: { fontSize: '0.72rem' } }}
                                        sx={{ flex: 1 }}
                                    />
                                    <IconButton size='small' onClick={() => setAddingColumn(false)}><Close sx={{ fontSize: 14 }} /></IconButton>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setAddingColumn(true)}
                                    style={{ all: 'unset', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', padding: '6px 4px' }}
                                >
                                    <Add sx={{ fontSize: 14 }} /> Add column
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </DndContext>

            {modalState && (
                <BoardCardModal
                    open
                    onClose={() => setModalState(null)}
                    department={department}
                    columnId={modalState.columnId}
                    card={modalState.card}
                    onSaved={load}
                />
            )}

            <ConfirmDialog
                open={!!confirmDeleteColumn}
                title='Delete column?'
                message='This deletes the column and every card in it. This cannot be undone.'
                confirmLabel='Delete'
                danger
                onConfirm={handleDeleteColumn}
                onCancel={() => setConfirmDeleteColumn(null)}
            />
        </div>
    )
}
