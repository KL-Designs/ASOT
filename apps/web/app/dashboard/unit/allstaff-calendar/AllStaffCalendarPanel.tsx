'use client'

import { useCallback, useEffect, useState } from 'react'
import { Add, ContentCopy } from '@mui/icons-material'
import DeptCalendarTab from '@/app/dashboard/unit/calendar/DeptCalendarTab'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'

type TrainingType = {
    _id: string
    name: string
    description?: string
    durationMinutes?: number
    category: string
    status: string
}

const inputStyle: React.CSSProperties = {
    boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderBottom: '1px solid var(--line-2)',
    color: 'rgba(237,237,237,0.9)',
    fontSize: '0.82rem',
    padding: '7px 10px',
    outline: 'none',
}

const RED = '#db001d'

function pad(n: number) { return String(n).padStart(2, '0') }
function toDatetimeLocal(d: Date) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AllStaffCalendarPanel({ userId, displayName, isTrainer, isJ3Lead }: {
    userId: string
    displayName: string
    isTrainer: boolean
    isJ3Lead: boolean
}) {
    const [types, setTypes] = useState<TrainingType[]>([])
    const [showTemplateModal, setShowTemplateModal] = useState(false)
    const [selectedType, setSelectedType] = useState<TrainingType | null>(null)
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [startAt, setStartAt] = useState('')
    const [isPrivate, setIsPrivate] = useState(false)
    const [saving, setSaving] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)

    const loadTypes = useCallback(async () => {
        const res = await fetch('/api/training/types')
        if (res.ok) {
            const data = await res.json()
            setTypes(data.types.filter((t: TrainingType) => t.status === 'active'))
        }
    }, [])

    useEffect(() => { if (isTrainer) loadTypes() }, [isTrainer, loadTypes])

    function openTemplate(type?: TrainingType) {
        const now = new Date()
        now.setMinutes(0, 0, 0)
        now.setHours(now.getHours() + 1)
        setStartAt(toDatetimeLocal(now))
        if (type) {
            setSelectedType(type)
            setTitle(type.name)
            setDescription(type.description ?? '')
        } else {
            setSelectedType(null)
            setTitle('')
            setDescription('')
        }
        setIsPrivate(false)
        setShowTemplateModal(true)
    }

    async function handleCreate() {
        if (!title.trim() || !startAt) return
        setSaving(true)
        const start = new Date(startAt)
        const durationMs = (selectedType?.durationMinutes ?? 60) * 60_000
        const end = new Date(start.getTime() + durationMs)

        await fetch('/api/admin/calendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: title.trim(),
                description: description.trim() || undefined,
                start: start.toISOString(),
                end: end.toISOString(),
                allDay: false,
                department: 'unit',
                isPrivate,
                ...(selectedType ? { templateTrainingTypeId: selectedType._id } : {}),
            }),
        })

        setSaving(false)
        setShowTemplateModal(false)
        setRefreshKey(k => k + 1)
    }

    return (
        <div className='h-full w-full flex flex-col'>
            {/* Header */}
            <div
                className='flex items-center justify-between px-5 py-3 mx-6 mt-6'
                style={{
                    position: 'relative',
                    border: '1px solid var(--line-2)',
                    borderTop: '1px solid var(--line-2)',
                    background: 'rgba(255,255,255,0.04)',
                    flexShrink: 0,
                }}
            >
                <CornerBrackets />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace' }}>
                        <span style={{ color: 'var(--txt-4)' }}>{'//'}</span> UNIT
                    </span>
                    <span style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                        All Staff Calendar
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {isTrainer && (
                        <button
                            onClick={() => openTemplate()}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(219,0,29,0.2)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.8)', padding: '6px 12px', cursor: 'pointer' }}
                        >
                            <Add sx={{ fontSize: '0.85rem' }} /> Create Event
                        </button>
                    )}
                    {isTrainer && types.length > 0 && (
                        <div style={{ position: 'relative' }}>
                            <select
                                onChange={e => {
                                    const t = types.find(t => t._id === e.target.value)
                                    if (t) openTemplate(t)
                                    e.target.value = ''
                                }}
                                defaultValue=''
                                style={{ ...inputStyle, fontSize: '0.62rem', padding: '6px 10px', cursor: 'pointer', borderRadius: 0 }}
                            >
                                <option value='' disabled>Use J3 Template…</option>
                                {types.map(t => (
                                    <option key={t._id} value={t._id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* Calendar */}
            <div className='flex-1 min-h-0 mx-6 mt-2 mb-6'>
                <DeptCalendarTab key={refreshKey} department='unit' userId={userId} isJ4={isJ3Lead} />
            </div>

            {/* Create from template modal */}
            {showTemplateModal && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={e => { if (e.target === e.currentTarget) setShowTemplateModal(false) }}
                >
                    <div style={{ background: '#0e0e0e', border: `1px solid rgba(219,0,29,0.25)`, borderTop: `3px solid ${RED}`, padding: 28, width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', marginBottom: 2 }}>
                            {selectedType ? `J3 Template — ${selectedType.category}` : 'Create Calendar Event'}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 5 }}>Title</label>
                                <input value={title} onChange={e => setTitle(e.target.value)} placeholder='Event title…' style={{ ...inputStyle, width: '100%' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 5 }}>Start Date & Time</label>
                                <input
                                    type='datetime-local'
                                    value={startAt}
                                    onChange={e => setStartAt(e.target.value)}
                                    style={{ ...inputStyle, width: '100%', colorScheme: 'dark' } as React.CSSProperties}
                                />
                                {selectedType?.durationMinutes && (
                                    <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)', marginTop: 4 }}>
                                        Duration: {selectedType.durationMinutes} min — end calculated automatically
                                    </div>
                                )}
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 5 }}>Description (optional)</label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    rows={3}
                                    placeholder='Additional details…'
                                    style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
                                />
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.72rem', color: 'rgba(237,237,237,0.6)' }}>
                                <input
                                    type='checkbox'
                                    checked={isPrivate}
                                    onChange={e => setIsPrivate(e.target.checked)}
                                    style={{ accentColor: RED }}
                                />
                                Private (only visible to me)
                            </label>
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <button
                                disabled={saving || !title.trim() || !startAt}
                                onClick={handleCreate}
                                style={{
                                    flex: 1, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                    background: 'rgba(219,0,29,0.25)', border: '1px solid rgba(219,0,29,0.45)',
                                    color: 'rgba(237,237,237,0.9)', padding: '8px 0', cursor: 'pointer',
                                    opacity: !title.trim() || !startAt ? 0.5 : 1,
                                }}
                            >
                                {saving ? 'Creating…' : 'Create Event'}
                            </button>
                            <button
                                onClick={() => setShowTemplateModal(false)}
                                style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.35)', padding: '8px 16px', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
