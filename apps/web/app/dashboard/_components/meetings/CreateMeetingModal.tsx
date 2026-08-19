'use client'

import { useState, useEffect } from 'react'
import { CircularProgress } from '@mui/material'
import { Close, AssignmentLate, Person, Public } from '@mui/icons-material'
import MemberPicker from './MemberPicker'

interface Props {
    department: MeetingDepartment
    onClose: () => void
    onCreate: (meeting: Meeting) => void
}

// Roles available to notify per department (dept roles + leads + J4)
const DEPT_ROLES: Record<MeetingDepartment, string[]> = {
    j1: ['J1-Recruiting', 'J1-Staff', 'J4-Administration'],
    j2: ['J2-Mission Making', 'J2-Team Lead', 'J4-Administration'],
    j3: ['J3-Training', 'J3-Team Lead', 'J4-Administration'],
    j4: ['J4-Administration'],
    j5: ['J5-Media', 'J4-Administration'],
    j6: ['J6-Game Master', 'J6-Department Lead', 'J4-Administration'],
    j7: ['J7 Community Development', 'J7 Staff', 'J4-Administration'],
}

// Dept roles used to distinguish invited vs notified dept members
const DEPT_MEMBER_ROLES: Record<MeetingDepartment, string[]> = {
    j1: ['J1-Recruiting', 'J1-Staff'],
    j2: ['J2-Mission Making', 'J2-Team Lead'],
    j3: ['J3-Training', 'J3-Team Lead'],
    j4: ['J4-Administration'],
    j5: ['J5-Media'],
    j6: ['J6-Game Master', 'J6-Department Lead'],
    j7: ['J7 Community Development', 'J7 Staff'],
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
    const [allMembersMode, setAllMembersMode] = useState(false)

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
    // Dept roles help determine if an added member is "external" (invited) or internal (notified)
    const deptRoleSet = new Set(DEPT_MEMBER_ROLES[department] ?? [])

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
            // Split notifyMembers into dept members (notify) and outsiders (invite+notify)
            // Since we can't reliably check roles client-side, send all as notifyUserIds
            // and also send all non-dept members as invitedUserIds so they get access.
            // The API stores both and grants access to invitedUserIds.
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
                    // All selected members are added as invited — the API will also notify dept members normally
                    invitedUserIds: notifyMembers.length > 0 ? notifyMembers.map(m => m.id) : undefined,
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
                style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', background: 'rgb(13,13,13)', border: '1px solid var(--line-2)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace' }}>
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
                                style={{ ...inputSx, cursor: 'pointer', fontSize: '0.78rem', colorScheme: 'dark' }}
                            />
                        </div>
                        <div>
                            <label style={label}>Reminder Date &amp; Time</label>
                            <input
                                type='datetime-local'
                                value={reminderDate}
                                onChange={e => setReminderDate(e.target.value)}
                                style={{ ...inputSx, cursor: 'pointer', fontSize: '0.78rem', colorScheme: 'dark' }}
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
                                        }}
                                    >
                                        <div style={{ width: 12, height: 12, flexShrink: 0, border: `1px solid ${checked ? 'rgba(100,160,255,0.7)' : 'rgba(255,255,255,0.2)'}`, background: checked ? 'rgba(100,160,255,0.7)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

                    {/* Members — with toggle for all ASOT members */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <label style={{ ...label, marginBottom: 0, color: 'rgba(237,237,237,0.3)' }}>Members</label>
                            <button
                                type='button'
                                onClick={() => setAllMembersMode(v => !v)}
                                style={{
                                    all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                    fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em',
                                    color: allMembersMode ? 'rgba(100,160,255,0.8)' : 'rgba(237,237,237,0.3)',
                                    padding: '2px 6px', border: `1px solid ${allMembersMode ? 'rgba(100,160,255,0.35)' : 'rgba(255,255,255,0.1)'}`,
                                    background: allMembersMode ? 'rgba(100,160,255,0.08)' : 'transparent',
                                }}
                            >
                                <Public sx={{ fontSize: 10 }} />
                                {allMembersMode ? 'ALL ASOT' : 'DEPT + J4'}
                            </button>
                        </div>
                        <MemberPicker
                            value={notifyMember}
                            onChange={m => { if (m) addMember(m) }}
                            department={allMembersMode ? undefined : department}
                            allMembers={allMembersMode}
                            placeholder={allMembersMode ? 'Search all ASOT members…' : 'Search dept / J4 members…'}
                        />
                        {notifyMembers.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                {notifyMembers.map(m => {
                                    // Members not in this dept's roles are external invites
                                    const isExternal = !deptRoleSet.has('__placeholder__') // always show indicator
                                    return (
                                        <span key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px', background: 'rgba(219,0,29,0.07)', border: '1px solid rgba(219,0,29,0.22)', fontSize: '0.65rem', color: 'rgba(237,237,237,0.65)' }}>
                                            <Person sx={{ fontSize: 10, color: 'rgba(219,0,29,0.5)' }} />
                                            {m.name}
                                            <button type='button' onClick={() => removeMember(m.id)} style={{ all: 'unset', cursor: 'pointer', marginLeft: 2, color: 'rgba(237,237,237,0.35)', display: 'flex' }}>
                                                <Close sx={{ fontSize: 10 }} />
                                            </button>
                                        </span>
                                    )
                                })}
                            </div>
                        )}
                        {allMembersMode && (
                            <p style={{ margin: '6px 0 0', fontSize: '0.6rem', color: 'rgba(0,195,255,0.5)', lineHeight: 1.4 }}>
                                Members outside this department will receive temporary access to this meeting only.
                            </p>
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
