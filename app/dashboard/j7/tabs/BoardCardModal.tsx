'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, IconButton, CircularProgress, Alert } from '@mui/material'
import { Close } from '@mui/icons-material'
import MemberPicker from '@/app/dashboard/_components/meetings/MemberPicker'

interface TaskOption {
    _id: string
    title: string
    dueDate: string | null
    completedAt: string | null
}

interface Props {
    open: boolean
    onClose: () => void
    department: string
    columnId: string
    card: BoardCard | null   // null = create mode
    onSaved: () => void | Promise<void>
}

export default function BoardCardModal({ open, onClose, department, columnId, card, onSaved }: Props) {
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [assignee, setAssignee] = useState<{ id: string; name: string } | null>(null)
    const [linkedTask, setLinkedTask] = useState<TaskOption | null>(null)
    const [taskOptions, setTaskOptions] = useState<TaskOption[]>([])
    const [taskQuery, setTaskQuery] = useState('')
    const [taskPickerOpen, setTaskPickerOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return
        setTitle(card?.title ?? '')
        setDescription(card?.description ?? '')
        setAssignee(card?.assigneeId ? { id: card.assigneeId, name: card.assigneeName ?? card.assigneeId } : null)
        setLinkedTask(null)   // resolved below if card.linkedTaskId is set
        setError(null)

        if (card?.linkedTaskId) {
            fetch('/api/admin/tasks?view=mine').then(r => r.json()).then(d => {
                const found = (d.tasks ?? []).find((t: TaskOption) => t._id === String(card.linkedTaskId))
                if (found) setLinkedTask(found)
            }).catch(() => {})
        }
    }, [open, card])

    const loadTaskOptions = useCallback(() => {
        if (taskOptions.length > 0) return
        Promise.all([
            fetch('/api/admin/tasks?view=mine').then(r => r.json()),
            fetch('/api/admin/tasks?view=created').then(r => r.json()),
        ]).then(([mine, created]) => {
            const merged = new Map<string, TaskOption>()
            for (const t of [...(mine.tasks ?? []), ...(created.tasks ?? [])]) merged.set(t._id, t)
            setTaskOptions([...merged.values()])
        }).catch(() => {})
    }, [taskOptions.length])

    async function handleSave() {
        if (!title.trim()) { setError('Title is required'); return }
        setSaving(true)
        setError(null)

        const body = {
            department,
            columnId,
            title: title.trim(),
            description: description.trim() || undefined,
            assigneeId: assignee?.id,
            assigneeName: assignee?.name,
            linkedTaskId: linkedTask?._id ?? null,
        }

        const res = card
            ? await fetch(`/api/admin/board/cards/${card._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            : await fetch('/api/admin/board/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

        setSaving(false)
        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setError(data.error ?? 'Save failed')
            return
        }
        await onSaved()
        onClose()
    }

    const filteredTasks = taskQuery.trim()
        ? taskOptions.filter(t => t.title.toLowerCase().includes(taskQuery.toLowerCase()))
        : taskOptions

    return (
        <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth
            PaperProps={{ sx: { background: 'rgba(12,12,16,0.98)', border: '1px solid rgba(219,0,29,0.25)', borderTop: '3px solid var(--red)' } }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                    {card ? 'Edit Card' : 'New Card'}
                </span>
                <IconButton size='small' onClick={onClose}><Close sx={{ fontSize: 16, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
            </DialogTitle>

            <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {error && <Alert severity='error' sx={{ fontSize: '0.72rem' }}>{error}</Alert>}

                <TextField size='small' label='Title' value={title} onChange={e => setTitle(e.target.value)} autoFocus fullWidth sx={{ mt: 1 }} />
                <TextField size='small' label='Description' value={description} onChange={e => setDescription(e.target.value)} multiline minRows={3} fullWidth />

                <div>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>Assignee</div>
                    <MemberPicker value={assignee} onChange={setAssignee} department={department as any} placeholder='Assign to…' />
                </div>

                <div style={{ position: 'relative' }}>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>Linked task (optional)</div>
                    {linkedTask ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'rgba(219,0,29,0.07)', border: '1px solid rgba(219,0,29,0.25)' }}>
                            <span style={{ flex: 1, fontSize: '0.73rem', color: 'rgba(237,237,237,0.8)' }}>
                                {linkedTask.title}{linkedTask.completedAt ? ' ✓' : ''}
                            </span>
                            <button type='button' onClick={() => setLinkedTask(null)} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.35)' }}>
                                <Close sx={{ fontSize: 11 }} />
                            </button>
                        </div>
                    ) : (
                        <input
                            value={taskQuery}
                            onChange={e => setTaskQuery(e.target.value)}
                            onFocus={() => { setTaskPickerOpen(true); loadTaskOptions() }}
                            onBlur={() => setTimeout(() => setTaskPickerOpen(false), 150)}
                            placeholder='Search your tasks…'
                            style={{ all: 'unset', display: 'block', width: '100%', fontSize: '0.75rem', color: 'var(--foreground)', background: 'rgba(255,255,255,0.04)', padding: '5px 8px', border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box' }}
                        />
                    )}
                    {taskPickerOpen && !linkedTask && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'rgb(13,13,13)', border: '1px solid rgba(255,255,255,0.12)', maxHeight: 200, overflowY: 'auto' }}>
                            {filteredTasks.length === 0 && <div style={{ padding: '8px 10px', fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)' }}>No matching tasks</div>}
                            {filteredTasks.slice(0, 20).map(t => (
                                <button key={t._id} type='button'
                                    onMouseDown={() => { setLinkedTask(t); setTaskQuery('') }}
                                    style={{ all: 'unset', display: 'block', width: '100%', padding: '7px 10px', cursor: 'pointer', fontSize: '0.73rem', color: 'rgba(237,237,237,0.75)', boxSizing: 'border-box' }}
                                >
                                    {t.title}{t.completedAt ? ' ✓' : ''}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <Button size='small' onClick={onClose} sx={{ color: 'rgba(237,237,237,0.4)' }}>Cancel</Button>
                <Button size='small' variant='contained' disabled={saving} onClick={handleSave}>
                    {saving ? <CircularProgress size={14} sx={{ color: 'white' }} /> : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    )
}
