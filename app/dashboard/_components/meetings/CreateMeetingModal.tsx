'use client'

import { useState, useEffect } from 'react'
import { CircularProgress } from '@mui/material'
import { Close, AssignmentLate, Person } from '@mui/icons-material'
import MemberPicker from './MemberPicker'

interface Props {
    department: MeetingDepartment
    onClose: () => void
    onCreate: (meeting: Meeting) => void
}

// Roles available to notify per department (dept roles + leads + J4, deduplicated)
const DEPT_ROLES: Record<MeetingDepartment, string[]> = {
    j1: ['J1-Recruiting', 'J1-Staff', 'J4-Administration'],
    j2: ['J2-Mission Making', 'J2-Team Lead', 'J4-Administration'],
    j3: ['J3-Training', 'J3-Team Lead', 'J4-Administration'],
    j4: ['J4-Administration'],
    j5: ['J5-Media', 'J4-Administration'],
    j6: ['J6-Game Master', 'J6-Department Lead', 'J4-Administration'],
    j7: ['J7 Community Development', 'J7 Staff', 'J4-Administration'],
}

const label: React.CSSProperties = {
    display: 'block', fontSize: '0.6rem', fontWeight: 700,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    color: 'rgba(237,237,237,0.4)', marginBottom: 4,
}

const inputSx: React.CSSProperties = {
    all: 'unset', display: 'block', width: '100%',
    fontSize: '0.82rem', color: 'var(--foreground)',
    background: 'rgba(255,255,255,0.04)', padding: '7px 10px',
    border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box',
}

export default function CreateMeetingModal({ department, onClose, onCreate }: Props) {
    const [title, setTitle] = useState('')
    const [date, setDate] = useState(new Date().toISOString().slice(0, 16))
    const [reminderDate, setReminderDate] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Notification targets
    const [notifyRoles, setNotifyRoles] = useState<Set<string>>(new Set())
    const [notifyMember, setNotifyMember] = useState<{ id: string; name: string } | null>(null)
    const [notifyMembers, setNotifyMembers] = useState<{ id: string; name: string }[]>([])

    // Incomplete task carryover
    const [prevMeeting, setPrevMeeting] = useState<Meeting | null>(null)
    const [prevLoading, setPrevLoading] = useState(true)
    const [carryOver, setCarryOver] = useState(true)

    useEffect(() => {
        fetch(`/api/admin/meetings?department=${department}`)
            .then(r => r.json())
            .then(data => {
                const meetings: Meeting[] = data.meetings ?? []
                setPrevMeeting(meetings[0] ?? null)
            })
            .catch(() => {})
            .finally(() => setPrevLoading(false))
    }, [department])

    const incompleteTasks = prevMeeting?.tasks.filter(t => t.status !== 'completed') ?? []
    const availableRoles = DEPT_ROLES[department] ?? []

    function toggleRole(role: string) {
        setNotifyRoles(prev => {
            const next = new Set(prev)
            next.has(role) ? next.delete(role) : next.add(role)
            return next
        })
    }

    function addMember(m: { id: string; name: string }) {
        if (!notifyMembers.find(x => x.id === m.id)) {
            setNotifyMembers(prev => [...prev, m])
        }
        setNotifyMember(null)
    }

    function removeMember(id: string) {
        setNotifyMembers(prev => prev.filter(m => m.id !== id))
    }

    async function submit() {
        if (!title.trim()) { setError('Title is required'); return }
        setSaving(true)
        setError(null)
        try {
            const res = await fetch('/api/admin/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    department,
                    title: title.trim(),
                    date,
                    carryoverFromId: carryOver && incompleteTasks.length > 0
                        ? prevMeeting?._id?.toString()
                        : undefined,
                    notifyRoles: notifyRoles.size > 0 ? Array.from(notifyRoles) : undefined,
                    notifyUserIds: notifyMembers.length > 0 ? notifyMembers.map(m => m.id) : undefined,
                    reminderDate: reminderDate || undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error ?? 'Failed to create'); return }

            const fresh = await fetch(`/api/admin/meetings/${data.id}`).then(r => r.json())
            if (fresh.meeting) onCreate(fresh.meeting)
        } finally { setSaving(false) }
    }

    return (
        <div
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', background: 'rgb(13,13,13)', border: '1px solid rgba(219,0,29,0.32)', borderTop: '2px solid var(--red)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', fontFamily: 'monospace' }}>
                        {'// New Meeting'}
                    </span>
                    <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.4)' }}>
                        <Close sx={{ fontSize: 16 }} />
                    </button>
                </div>

                {/* Core fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                        <label style={label}>Title</label>
                        <input
                            autoFocus
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') submit() }}
                            placeholder='Meeting title…'
                            style={inputSx}
                        />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                            <label style={label}>Date &amp; Time</label>
                            <input
                                type='datetime-local'
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                style={{ ...inputSx, cursor: 'pointer', fontSize: '0.78rem' }}
                            />
                        </div>
                        <div>
                            <label style={label}>Reminder Date &amp; Time</label>
                            <input
                                type='datetime-local'
                                value={reminderDate}
                                onChange={e => setReminderDate(e.target.value)}
                                style={{ ...inputSx, cursor: 'pointer', fontSize: '0.78rem' }}
                            />
                        </div>
                    </div>
                </div>

                {/* Notification targets */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', background: 'rgba(0,100,220,0.04)', border: '1px solid rgba(0,100,220,0.15)' }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(100,160,255,0.7)' }}>
                        Notify on Creation
                    </span>

                    {/* Roles — checkbox list */}
                    <div>
                        <label style={{ ...label, color: 'rgba(237,237,237,0.3)' }}>Roles</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {availableRoles.map(role => {
                                const checked = notifyRoles.has(role)
                                return (
                                    <button
                                        key={role}
                                        type='button'
                                        onClick={() => toggleRole(role)}
                                        style={{
                                            all: 'unset', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '5px 8px',
                                            background: checked ? 'rgba(100,160,255,0.08)' : 'rgba(255,255,255,0.02)',
                                            border: `1px solid ${checked ? 'rgba(100,160,255,0.3)' : 'rgba(255,255,255,0.07)'}`,
                                            transition: 'background 0.1s, border-color 0.1s',
                                        }}
                                    >
                                        {/* Checkbox indicator */}
                                        <div style={{
                                            width: 12, height: 12, flexShrink: 0,
                                            border: `1px solid ${checked ? 'rgba(100,160,255,0.7)' : 'rgba(255,255,255,0.2)'}`,
                                            background: checked ? 'rgba(100,160,255,0.7)' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            {checked && (
                                                <svg width='8' height='6' viewBox='0 0 8 6' fill='none'>
                                                    <path d='M1 3L3 5L7 1' stroke='white' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' />
                                                </svg>
                                            )}
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: checked ? 'rgba(180,210,255,0.9)' : 'rgba(237,237,237,0.5)' }}>
                                            {role}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Members — picker with chip list */}
                    <div>
                        <label style={{ ...label, color: 'rgba(237,237,237,0.3)' }}>Members</label>
                        <MemberPicker
                            value={notifyMember}
                            onChange={m => { if (m) addMember(m) }}
                            department={department}
                            placeholder='Search member to notify…'
                        />
                        {notifyMembers.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                {notifyMembers.map(m => (
                                    <span key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px', background: 'rgba(219,0,29,0.07)', border: '1px solid rgba(219,0,29,0.22)', fontSize: '0.65rem', color: 'rgba(237,237,237,0.65)' }}>
                                        <Person sx={{ fontSize: 10, color: 'rgba(219,0,29,0.5)' }} />{m.name}
                                        <button type='button' onClick={() => removeMember(m.id)} style={{ all: 'unset', cursor: 'pointer', marginLeft: 2, color: 'rgba(237,237,237,0.35)', display: 'flex' }}>
                                            <Close sx={{ fontSize: 10 }} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Carryover section */}
                {!prevLoading && incompleteTasks.length > 0 && (
                    <div style={{ padding: '10px 12px', background: 'rgba(255,160,0,0.05)', border: '1px solid rgba(255,160,0,0.2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AssignmentLate sx={{ fontSize: 14, color: 'rgba(255,160,0,0.7)' }} />
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,160,0,0.8)', letterSpacing: '0.06em' }}>
                                {incompleteTasks.length} incomplete task{incompleteTasks.length !== 1 ? 's' : ''} from previous meeting
                            </span>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                            <div
                                onClick={() => setCarryOver(v => !v)}
                                style={{ width: 28, height: 16, borderRadius: 8, position: 'relative', background: carryOver ? 'rgba(74,222,128,0.6)' : 'rgba(255,255,255,0.1)', border: `1px solid ${carryOver ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.15)'}`, cursor: 'pointer', transition: 'background 0.15s', flexShrink: 0 }}
                            >
                                <div style={{ position: 'absolute', top: 2, left: carryOver ? 12 : 2, width: 10, height: 10, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                            </div>
                            <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.6)' }}>
                                Carry over incomplete tasks to this meeting
                            </span>
                        </label>
                        {carryOver && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                                {incompleteTasks.map((t, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', background: 'rgba(255,255,255,0.03)' }}>
                                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: t.status === 'in_progress' ? 'rgba(219,160,0,0.6)' : 'rgba(237,237,237,0.2)', flexShrink: 0 }} />
                                        <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.55)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                                        {t.assignedToName && (
                                            <span style={{ fontSize: '0.56rem', color: 'rgba(219,0,29,0.5)', flexShrink: 0 }}>{t.assignedToName}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {error && <span style={{ fontSize: '0.7rem', color: 'rgba(219,0,29,0.8)' }}>{error}</span>}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', padding: '6px 14px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(237,237,237,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        Cancel
                    </button>
                    <button onClick={submit} disabled={saving} style={{ all: 'unset', cursor: saving ? 'wait' : 'pointer', padding: '6px 16px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', background: 'rgba(219,0,29,0.2)', border: '1px solid rgba(219,0,29,0.45)', color: 'rgba(219,0,29,0.9)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {saving ? <CircularProgress size={12} color='inherit' /> : 'Create Meeting'}
                    </button>
                </div>
            </div>
        </div>
    )
}
