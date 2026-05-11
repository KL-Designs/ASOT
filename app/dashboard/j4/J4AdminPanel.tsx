'use client'

import { useState, useEffect } from 'react'
import { Typography, Dialog, DialogContent, Autocomplete, TextField, Select, MenuItem, FormControl, InputLabel, CircularProgress, Tabs, Tab } from '@mui/material'
import { PeopleAlt, CalendarMonth, HistoryEdu, Settings } from '@mui/icons-material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import ImportPanel from '../ImportPanel'
import DeptCalendarTab from '@/app/dashboard/unit/calendar/DeptCalendarTab'
import DeptMembersTab from '@/app/dashboard/DeptMembersTab'
import PinTabLabel from '@/app/dashboard/_components/PinTabLabel'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import { useTabState } from '@/app/dashboard/_components/useTabState'
import SnapshotsTab from './SnapshotsTab'
import CommunityTicketsTab from './tabs/CommunityTicketsTab'
import J4MeetingsTab from './tabs/J4MeetingsTab'
import LogsTab from './tabs/LogsTab'
import TeamspeakTab from './tabs/TeamspeakTab'

const btnSx = (active: boolean): React.CSSProperties => ({
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    padding: '5px 14px',
    background: active ? 'rgba(219,0,29,0.35)' : 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(219,0,29,0.25)',
    color: active ? 'var(--foreground)' : 'rgba(237,237,237,0.55)',
    cursor: 'pointer',
    borderRadius: 999,
})

const inputSx = {
    '& .MuiOutlinedInput-root': {
        '& fieldset': { borderColor: 'rgba(219,0,29,0.25)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.5)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
        background: 'rgba(255,255,255,0.04)',
        color: '#ededed',
        borderRadius: 0,
    },
    '& .MuiInputLabel-root': { color: 'rgba(237,237,237,0.4)' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
    '& .MuiSvgIcon-root': { color: 'rgba(237,237,237,0.4)' },
}

interface MemberOption {
    id: string
    displayName: string
}

function DischargeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [members, setMembers] = useState<MemberOption[]>([])
    const [membersLoaded, setMembersLoaded] = useState(false)
    const [loadingMembers, setLoadingMembers] = useState(false)

    const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
    const [dischargeType, setDischargeType] = useState<'honorable' | 'dishonorable' | ''>('')
    const [dischargeReason, setDischargeReason] = useState('')
    const [notes, setNotes] = useState('')

    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)

    function handleOpen() {
        if (membersLoaded) return
        setLoadingMembers(true)
        fetch('/api/admin/members')
            .then(r => r.json())
            .then(data => {
                setMembers(data.members ?? [])
                setMembersLoaded(true)
            })
            .catch(() => setError('Failed to load members'))
            .finally(() => setLoadingMembers(false))
    }

    function handleClose() {
        setSelectedMember(null)
        setDischargeType('')
        setDischargeReason('')
        setNotes('')
        setError(null)
        setSuccessMsg(null)
        onClose()
    }

    async function handleSubmit() {
        if (!selectedMember || !dischargeType || !dischargeReason.trim()) {
            setError('Please fill in all required fields.')
            return
        }
        setSubmitting(true)
        setError(null)
        try {
            const res = await fetch('/api/admin/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'j4-discharge',
                    targetUserId: selectedMember.id,
                    targetUserName: selectedMember.displayName,
                    dischargeType,
                    dischargeReason: dischargeReason.trim(),
                    notes: notes.trim() || undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error ?? 'Submission failed.')
            } else {
                setSuccessMsg('Discharge request submitted. Awaiting approval from another J4 member.')
                setSelectedMember(null)
                setDischargeType('')
                setDischargeReason('')
                setNotes('')
            }
        } catch {
            setError('Network error. Please try again.')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            TransitionProps={{ onEntered: handleOpen }}
            PaperProps={{
                style: {
                    background: '#111',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                    borderRadius: 0,
                    minWidth: 480,
                    maxWidth: 560,
                    color: '#ededed',
                },
            }}
        >
            <DialogContent style={{ padding: '28px 28px 24px' }}>
                <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    J4 — Administration
                </Typography>
                <Typography fontWeight={700} fontSize='0.9rem' letterSpacing={3} style={{ textTransform: 'uppercase', marginBottom: 20 }}>
                    Discharge Member
                </Typography>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <Autocomplete
                        options={members}
                        getOptionLabel={o => o.displayName}
                        value={selectedMember}
                        onChange={(_, v) => setSelectedMember(v)}
                        loading={loadingMembers}
                        noOptionsText={membersLoaded ? 'No members found' : 'Loading…'}
                        renderInput={params => (
                            <TextField
                                {...params}
                                label='Member *'
                                sx={inputSx}
                                InputProps={{
                                    ...params.InputProps,
                                    endAdornment: (
                                        <>
                                            {loadingMembers && <CircularProgress size={16} style={{ color: 'var(--red)' }} />}
                                            {params.InputProps.endAdornment}
                                        </>
                                    ),
                                }}
                            />
                        )}
                        ListboxProps={{ style: { background: '#1a1a1a', color: '#ededed' } }}
                    />

                    <FormControl fullWidth sx={inputSx}>
                        <InputLabel>Discharge Type *</InputLabel>
                        <Select
                            value={dischargeType}
                            label='Discharge Type *'
                            onChange={e => setDischargeType(e.target.value as 'honorable' | 'dishonorable')}
                            MenuProps={{ PaperProps: { style: { background: '#1a1a1a', color: '#ededed' } } }}
                        >
                            <MenuItem value='honorable'>Honorable</MenuItem>
                            <MenuItem value='dishonorable'>Dishonorable</MenuItem>
                        </Select>
                    </FormControl>

                    <TextField
                        label='Reason *'
                        value={dischargeReason}
                        onChange={e => setDischargeReason(e.target.value)}
                        multiline
                        minRows={3}
                        fullWidth
                        sx={inputSx}
                    />

                    <TextField
                        label='Notes (optional)'
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        multiline
                        minRows={2}
                        fullWidth
                        sx={inputSx}
                    />
                </div>

                {error && (
                    <Typography fontSize='0.75rem' style={{ color: '#ff4444', marginTop: 12 }}>{error}</Typography>
                )}
                {successMsg && (
                    <Typography fontSize='0.75rem' style={{ color: 'rgba(100,220,100,0.9)', marginTop: 12 }}>{successMsg}</Typography>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                    <button
                        onClick={handleClose}
                        style={{ background: 'none', border: '1px solid rgba(237,237,237,0.15)', color: 'rgba(237,237,237,0.6)', padding: '7px 18px', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: 1 }}
                    >
                        CANCEL
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        style={{
                            background: submitting ? 'rgba(219,0,29,0.3)' : 'rgba(219,0,29,0.3)',
                            border: '1px solid rgba(219,0,29,0.27)',
                            color: submitting ? 'rgba(237,237,237,0.4)' : '#ededed',
                            padding: '7px 18px',
                            cursor: submitting ? 'not-allowed' : 'pointer',
                            fontSize: '0.78rem',
                            letterSpacing: 1,
                        }}
                    >
                        {submitting ? 'SUBMITTING…' : 'SUBMIT'}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

interface DischargedMember {
    id: string
    displayName: string
    discharged: {
        date: string
        type: 'honorable' | 'dishonorable'
        reason: string
        dischargedByName: string
        approvedByName: string
    }
}

function ReinstateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [members, setMembers] = useState<DischargedMember[]>([])
    const [loading, setLoading] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [reinstating, setReinstating] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    function load() {
        if (loaded) return
        setLoading(true)
        fetch('/api/admin/members/discharged')
            .then(r => r.json())
            .then(data => {
                setMembers(data.members ?? [])
                setLoaded(true)
            })
            .catch(() => setError('Failed to load discharged members'))
            .finally(() => setLoading(false))
    }

    function handleClose() {
        setError(null)
        onClose()
    }

    async function reinstate(member: DischargedMember) {
        setReinstating(member.id)
        setError(null)
        try {
            const res = await fetch('/api/admin/members/discharged', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUserId: member.id }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error ?? 'Reinstatement failed.')
            } else {
                setMembers(prev => prev.filter(m => m.id !== member.id))
            }
        } catch {
            setError('Network error. Please try again.')
        } finally {
            setReinstating(null)
        }
    }

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            TransitionProps={{ onEntered: load }}
            PaperProps={{
                style: {
                    background: '#111',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                    borderRadius: 0,
                    minWidth: 520,
                    maxWidth: 640,
                    color: '#ededed',
                },
            }}
        >
            <DialogContent style={{ padding: '28px 28px 24px' }}>
                <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    J4 — Administration
                </Typography>
                <Typography fontWeight={700} fontSize='0.9rem' letterSpacing={3} style={{ textTransform: 'uppercase', marginBottom: 20 }}>
                    Reinstate Member
                </Typography>

                {loading && <TacticalSkeleton rows={5} className='px-4' />}

                {loaded && members.length === 0 && (
                    <Typography fontSize='0.8rem' style={{ color: 'rgba(237,237,237,0.35)', padding: '12px 0' }}>
                        No discharged members.
                    </Typography>
                )}

                {members.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {members.map(m => (
                            <div
                                key={m.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '10px 12px',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 2 }}>{m.displayName}</div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{
                                            fontSize: '0.6rem',
                                            fontWeight: 700,
                                            letterSpacing: 1,
                                            padding: '1px 6px',
                                            background: m.discharged.type === 'honorable' ? 'rgba(0,195,100,0.12)' : 'rgba(219,0,29,0.12)',
                                            color: m.discharged.type === 'honorable' ? 'rgb(0,195,100)' : 'var(--red)',
                                        }}>
                                            {m.discharged.type === 'honorable' ? 'HONORABLE' : 'DISHONORABLE'}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)' }}>{m.discharged.date}</span>
                                        <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                                            {m.discharged.reason}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => reinstate(m)}
                                    disabled={reinstating === m.id}
                                    style={{
                                        background: 'rgba(0,195,100,0.1)',
                                        border: '1px solid rgba(0,195,100,0.3)',
                                        color: reinstating === m.id ? 'rgba(237,237,237,0.3)' : 'rgb(0,195,100)',
                                        padding: '5px 14px',
                                        cursor: reinstating === m.id ? 'not-allowed' : 'pointer',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        letterSpacing: 1,
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0,
                                    }}
                                >
                                    {reinstating === m.id ? 'REINSTATING…' : 'REINSTATE'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {error && (
                    <Typography fontSize='0.75rem' style={{ color: '#ff4444', marginTop: 12 }}>{error}</Typography>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                    <button
                        onClick={handleClose}
                        style={{ background: 'none', border: '1px solid rgba(237,237,237,0.15)', color: 'rgba(237,237,237,0.6)', padding: '7px 18px', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: 1 }}
                    >
                        CLOSE
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

const NOTIF_TYPES: { value: string; label: string }[] = [
    { value: 'system',                     label: 'System' },
    { value: 'task_assigned',              label: 'Task Assigned' },
    { value: 'task_extended',              label: 'Task Extended' },
    { value: 'task_completed',             label: 'Task Completed' },
    { value: 'task_extension_requested',   label: 'Task Extension Requested' },
    { value: 'task_extension_approved',    label: 'Task Extension Approved' },
    { value: 'task_extension_denied',      label: 'Task Extension Denied' },
    { value: 'calendar_reminder',          label: 'Calendar Reminder' },
    { value: 'meeting_created',            label: 'Meeting Created' },
    { value: 'meeting_started',            label: 'Meeting Started' },
    { value: 'meeting_reminder',           label: 'Meeting Reminder' },
    { value: 'meeting_task_assigned',      label: 'Meeting Task Assigned' },
    { value: 'meeting_attendance_overdue', label: 'Meeting Attendance Overdue' },
    { value: 'meeting_task_chaseup',       label: 'Meeting Task Chase-Up' },
    { value: 'quiz_assigned',              label: 'Quiz Assigned' },
    { value: 'quiz_submitted',             label: 'Quiz Submitted' },
    { value: 'quiz_result',               label: 'Quiz Result' },
    { value: 'quiz_review_requested',      label: 'Quiz Review Requested' },
    { value: 'ticket_assigned',            label: 'Ticket Assigned' },
    { value: 'ticket_transferred',         label: 'Ticket Transferred' },
    { value: 'ticket_status_changed',      label: 'Ticket Status Changed' },
    { value: 'ticket_reopened',            label: 'Ticket Reopened' },
    { value: 'ticket_task_assigned',       label: 'Ticket Task Assigned' },
    { value: 'ticket_comment',             label: 'Ticket Comment' },
]

function TestNotificationModal({ open, onClose, selfId }: { open: boolean; onClose: () => void; selfId: string }) {
    const [members, setMembers] = useState<MemberOption[]>([])
    const [membersLoaded, setMembersLoaded] = useState(false)
    const [loadingMembers, setLoadingMembers] = useState(false)

    const [sendToSelf, setSendToSelf] = useState(true)
    const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
    const [channels, setChannels] = useState<{ site: boolean; discord: boolean }>({ site: true, discord: false })
    const [type, setType] = useState('system')
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')

    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)

    function handleOpen() {
        if (membersLoaded) return
        setLoadingMembers(true)
        fetch('/api/admin/members?limit=500')
            .then(r => r.json())
            .then(data => {
                setMembers(data.members ?? [])
                setMembersLoaded(true)
            })
            .catch(() => setError('Failed to load members'))
            .finally(() => setLoadingMembers(false))
    }

    function handleClose() {
        setSendToSelf(true)
        setSelectedMember(null)
        setChannels({ site: true, discord: false })
        setType('system')
        setTitle('')
        setBody('')
        setError(null)
        setSuccessMsg(null)
        onClose()
    }

    function toggleChannel(ch: 'site' | 'discord') {
        setChannels(prev => ({ ...prev, [ch]: !prev[ch] }))
    }

    async function handleSend() {
        const targetId = sendToSelf ? selfId : selectedMember?.id
        if (!targetId) { setError('Select a member to send to.'); return }
        if (!channels.site && !channels.discord) { setError('Select at least one channel.'); return }
        if (!title.trim()) { setError('Title is required.'); return }
        if (!body.trim()) { setError('Body is required.'); return }

        setSubmitting(true)
        setError(null)
        setSuccessMsg(null)
        try {
            const res = await fetch('/api/admin/notifications/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetUserId: targetId,
                    channels: Object.entries(channels).filter(([, v]) => v).map(([k]) => k),
                    type,
                    title: title.trim(),
                    notifBody: body.trim(),
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error ?? 'Send failed.')
            } else {
                const sent = (data.sent as string[]).join(' + ')
                setSuccessMsg(`Sent via: ${sent}`)
                setTitle('')
                setBody('')
            }
        } catch {
            setError('Network error. Please try again.')
        } finally {
            setSubmitting(false)
        }
    }

    const chipSx = (active: boolean): React.CSSProperties => ({
        fontSize: '0.65rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '5px 14px',
        background: active ? 'rgba(219,0,29,0.25)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${active ? 'rgba(219,0,29,0.5)' : 'rgba(255,255,255,0.1)'}`,
        color: active ? '#ededed' : 'rgba(237,237,237,0.4)',
        cursor: 'pointer',
        borderRadius: 999,
    })

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            TransitionProps={{ onEntered: handleOpen }}
            PaperProps={{
                style: {
                    background: '#111',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                    borderRadius: 0,
                    minWidth: 480,
                    maxWidth: 560,
                    color: '#ededed',
                },
            }}
        >
            <DialogContent style={{ padding: '28px 28px 24px' }}>
                <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    J4 — Administration
                </Typography>
                <Typography fontWeight={700} fontSize='0.9rem' letterSpacing={3} style={{ textTransform: 'uppercase', marginBottom: 20 }}>
                    Send Test Notification
                </Typography>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Target */}
                    <div>
                        <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={2} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 8 }}>
                            Recipient
                        </Typography>
                        <div style={{ display: 'flex', gap: 8, marginBottom: sendToSelf ? 0 : 10 }}>
                            <button style={chipSx(sendToSelf)} onClick={() => setSendToSelf(true)}>Myself</button>
                            <button style={chipSx(!sendToSelf)} onClick={() => setSendToSelf(false)}>Select Member</button>
                        </div>
                        {!sendToSelf && (
                            <Autocomplete
                                options={members}
                                getOptionLabel={o => o.displayName}
                                value={selectedMember}
                                onChange={(_, v) => setSelectedMember(v)}
                                loading={loadingMembers}
                                noOptionsText={membersLoaded ? 'No members found' : 'Loading…'}
                                renderInput={params => (
                                    <TextField
                                        {...params}
                                        label='Member *'
                                        sx={inputSx}
                                        InputProps={{
                                            ...params.InputProps,
                                            endAdornment: (
                                                <>
                                                    {loadingMembers && <CircularProgress size={16} style={{ color: 'var(--red)' }} />}
                                                    {params.InputProps.endAdornment}
                                                </>
                                            ),
                                        }}
                                    />
                                )}
                                ListboxProps={{ style: { background: '#1a1a1a', color: '#ededed' } }}
                                sx={{ mt: 1 }}
                            />
                        )}
                    </div>

                    {/* Channels */}
                    <div>
                        <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={2} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 8 }}>
                            Channels
                        </Typography>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button style={chipSx(channels.site)} onClick={() => toggleChannel('site')}>Site</button>
                            <button style={chipSx(channels.discord)} onClick={() => toggleChannel('discord')}>Discord DM</button>
                        </div>
                    </div>

                    {/* Type */}
                    <FormControl fullWidth sx={inputSx}>
                        <InputLabel>Notification Type</InputLabel>
                        <Select
                            value={type}
                            label='Notification Type'
                            onChange={e => setType(e.target.value)}
                            MenuProps={{ PaperProps: { style: { background: '#1a1a1a', color: '#ededed', maxHeight: 300 } } }}
                        >
                            {NOTIF_TYPES.map(t => (
                                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {/* Title */}
                    <TextField
                        label='Title *'
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        fullWidth
                        sx={inputSx}
                    />

                    {/* Body */}
                    <TextField
                        label='Body *'
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        multiline
                        minRows={3}
                        fullWidth
                        sx={inputSx}
                    />
                </div>

                {error && (
                    <Typography fontSize='0.75rem' style={{ color: '#ff4444', marginTop: 12 }}>{error}</Typography>
                )}
                {successMsg && (
                    <Typography fontSize='0.75rem' style={{ color: 'rgba(100,220,100,0.9)', marginTop: 12 }}>{successMsg}</Typography>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                    <button
                        onClick={handleClose}
                        style={{ background: 'none', border: '1px solid rgba(237,237,237,0.15)', color: 'rgba(237,237,237,0.6)', padding: '7px 18px', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: 1 }}
                    >
                        CLOSE
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={submitting}
                        style={{
                            background: 'rgba(219,0,29,0.3)',
                            border: '1px solid rgba(219,0,29,0.27)',
                            color: submitting ? 'rgba(237,237,237,0.4)' : '#ededed',
                            padding: '7px 18px',
                            cursor: submitting ? 'not-allowed' : 'pointer',
                            fontSize: '0.78rem',
                            letterSpacing: 1,
                        }}
                    >
                        {submitting ? 'SENDING…' : 'SEND'}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default function J4AdminPanel({ userId, displayName }: { userId: string; displayName: string }) {
    const { tab, setTab, view, setView } = useTabState(0, 'dept')
    const [importOpen, setImportOpen] = useState(false)
    const [dischargeOpen, setDischargeOpen] = useState(false)
    const [reinstateOpen, setReinstateOpen] = useState(false)
    const [testNotifOpen, setTestNotifOpen] = useState(false)

    const [devMode, setDevMode]           = useState<boolean | null>(null)
    const [devModeLoading, setDevModeLoading] = useState(false)
    const [tsDevMode, setTsDevMode]       = useState<boolean | null>(null)
    const [tsDevModeLoading, setTsDevModeLoading] = useState(false)

    useEffect(() => {
        fetch('/api/admin/discord-devmode')
            .then(r => r.json())
            .then(d => setDevMode(!!d.enabled))
            .catch(() => setDevMode(false))
        fetch('/api/admin/teamspeak-devmode')
            .then(r => r.json())
            .then(d => setTsDevMode(!!d.enabled))
            .catch(() => setTsDevMode(false))
    }, [])

    async function toggleDevMode() {
        if (devModeLoading) return
        setDevModeLoading(true)
        try {
            const res = await fetch('/api/admin/discord-devmode', { method: 'POST' })
            const data = await res.json()
            setDevMode(!!data.enabled)
        } finally {
            setDevModeLoading(false)
        }
    }

    async function toggleTsDevMode() {
        if (tsDevModeLoading) return
        setTsDevModeLoading(true)
        try {
            const res = await fetch('/api/admin/teamspeak-devmode', { method: 'POST' })
            const data = await res.json()
            setTsDevMode(!!data.enabled)
        } finally {
            setTsDevModeLoading(false)
        }
    }

    const tabSx = {
        fontSize: '0.72rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        minHeight: 40,
        padding: '8px 16px',
        color: 'rgba(237,237,237,0.5)',
        '&.Mui-selected': { color: 'var(--foreground)' },
    }

    return (
        <div className='h-full w-full flex flex-col'>

            {/* Header */}
            <div
                className='flex items-center justify-between px-5 py-3 mx-6 mt-6'
                style={{
                    position: 'relative',
                    border: '1px solid rgba(219,0,29,0.42)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <CornerBrackets />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ color: 'rgba(219,0,29,0.35)' }}>{'//'}</span> DEPARTMENTS
                        </span>
                    <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        [J4] Administration
                    </Typography>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button style={{ ...btnSx(view === 'members'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'members' ? 'dept' : 'members')}>
                            <PeopleAlt sx={{ fontSize: '0.85rem' }} />Members
                        </button>
                        <button style={{ ...btnSx(view === 'calendar'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'calendar' ? 'dept' : 'calendar')}>
                            <CalendarMonth sx={{ fontSize: '0.85rem' }} />Calendar
                        </button>
                        <button style={{ ...btnSx(view === 'logs'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'logs' ? 'dept' : 'logs')}>
                            <HistoryEdu sx={{ fontSize: '0.85rem' }} />Activity Logs
                        </button>
                    </div>
            </div>

            {view === 'members'      && <DeptMembersTab department='j4' displayName={displayName} userId={userId} canManage={true} isJ4={true} />}
            {view === 'calendar'     && <DeptCalendarTab department='j4' userId={userId} isJ4={true} />}
            {view === 'logs' && (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', margin: '8px 0 0' }}>
                    <LogsTab />
                </div>
            )}
            {view === 'dept' && (
                <>
                    {/* Tabs */}
                    <div className='mx-6 mt-4' style={{ borderBottom: '1px solid rgba(219,0,29,0.42)' }}>
                        <Tabs
                            value={tab}
                            onChange={(_, v) => setTab(v)}
                            TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                            sx={{ minHeight: 40 }}
                        >
                            <Tab label={<PinTabLabel label='Tools'      pinLabel='J4 — Tools'      href='/dashboard/j4' tabIndex={0} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Snapshots'  pinLabel='J4 — Snapshots'  href='/dashboard/j4' tabIndex={1} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Meetings'   pinLabel='J4 — Meetings'   href='/dashboard/j4' tabIndex={2} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Tickets'    pinLabel='J4 — Tickets'    href='/dashboard/j4' tabIndex={3} />} sx={tabSx} />
                            <Tab label={<PinTabLabel label='Teamspeak'  pinLabel='J4 — Teamspeak'  href='/dashboard/j4' tabIndex={4} />} sx={tabSx} />
                        </Tabs>
                    </div>

                    <div className='flex-1 min-h-0 mt-0' style={{ display: 'flex', flexDirection: 'column' }}>
                        {tab === 1 && <SnapshotsTab />}
                        {tab === 2 && <J4MeetingsTab userId={userId} />}
                        {tab === 4 && (
                            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                                <TeamspeakTab />
                            </div>
                        )}
                        {tab === 3 && (
                            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                <CommunityTicketsTab />
                            </div>
                        )}
                        {tab === 0 && (
                            <div className='p-6 md:p-10 flex flex-col gap-6'>
                        {/* Tools */}
                        <div>
                            <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 12 }}>
                                Tools
                            </Typography>
                            <div className='flex flex-wrap gap-4'>

                                <button
                                    onClick={() => setImportOpen(true)}
                                    className='flex-1 min-w-[160px]'
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                                >
                                    <div
                                        className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] transition-colors duration-200 bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(219,0,29,0.08)]'
                                        style={{ border: '1px solid rgba(219,0,29,0.42)', borderTop: '2px solid var(--red)' }}
                                    >
                                        <Typography fontWeight={700} fontSize='0.78rem' letterSpacing={3} textAlign='center' style={{ textTransform: 'uppercase' }}>
                                            Import<br />Panel
                                        </Typography>
                                    </div>
                                </button>

                                <button
                                    onClick={() => setDischargeOpen(true)}
                                    className='flex-1 min-w-[160px]'
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                                >
                                    <div
                                        className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] transition-colors duration-200 bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(219,0,29,0.08)]'
                                        style={{ border: '1px solid rgba(219,0,29,0.42)', borderTop: '2px solid var(--red)' }}
                                    >
                                        <Typography fontWeight={700} fontSize='0.78rem' letterSpacing={3} textAlign='center' style={{ textTransform: 'uppercase' }}>
                                            Discharge<br />Member
                                        </Typography>
                                    </div>
                                </button>

                                <button
                                    onClick={() => setReinstateOpen(true)}
                                    className='flex-1 min-w-[160px]'
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                                >
                                    <div
                                        className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] transition-colors duration-200 bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(0,195,100,0.06)]'
                                        style={{ border: '1px solid rgba(0,195,100,0.15)', borderTop: '2px solid rgb(0,195,100)' }}
                                    >
                                        <Typography fontWeight={700} fontSize='0.78rem' letterSpacing={3} textAlign='center' style={{ textTransform: 'uppercase', color: 'rgba(0,195,100,0.8)' }}>
                                            Reinstate<br />Member
                                        </Typography>
                                    </div>
                                </button>

                                {/* Discord Developer Mode toggle */}
                                <button
                                    onClick={toggleDevMode}
                                    disabled={devModeLoading || devMode === null}
                                    className='flex-1 min-w-[160px]'
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: devModeLoading || devMode === null ? 'default' : 'pointer', textAlign: 'left' }}
                                >
                                    <div
                                        className='flex flex-col justify-center items-center gap-3 p-6 h-[160px] transition-colors duration-200'
                                        style={{
                                            background: devMode ? 'rgba(255,180,0,0.07)' : 'rgba(255,255,255,0.04)',
                                            border: `1px solid ${devMode ? 'rgba(255,180,0,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                            borderTop: `2px solid ${devMode ? 'rgb(255,180,0)' : 'rgba(255,255,255,0.15)'}`,
                                            opacity: devMode === null ? 0.4 : 1,
                                        }}
                                    >
                                        <div style={{
                                            width: 32, height: 18, borderRadius: 9,
                                            background: devMode ? 'rgba(255,180,0,0.9)' : 'rgba(255,255,255,0.15)',
                                            border: `1px solid ${devMode ? 'rgba(255,180,0,0.6)' : 'rgba(255,255,255,0.1)'}`,
                                            position: 'relative', transition: 'background 0.2s',
                                            flexShrink: 0,
                                        }}>
                                            <div style={{
                                                position: 'absolute', top: 2,
                                                left: devMode ? 14 : 2,
                                                width: 12, height: 12, borderRadius: '50%',
                                                background: '#fff',
                                                transition: 'left 0.2s',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                                            }} />
                                        </div>
                                        <Typography
                                            fontWeight={700}
                                            fontSize='0.78rem'
                                            letterSpacing={3}
                                            textAlign='center'
                                            style={{ textTransform: 'uppercase', color: devMode ? 'rgb(255,180,0)' : 'rgba(237,237,237,0.5)' }}
                                        >
                                            Discord<br />Dev Mode
                                        </Typography>
                                        <Typography fontSize='0.58rem' letterSpacing={1} style={{ color: devMode ? 'rgba(255,180,0,0.7)' : 'rgba(237,237,237,0.25)', textTransform: 'uppercase' }}>
                                            {devMode === null ? 'Loading…' : devMode ? 'Active — msgs blocked' : 'Inactive'}
                                        </Typography>
                                    </div>
                                </button>

                                {/* TeamSpeak Developer Mode toggle */}
                                <button
                                    onClick={toggleTsDevMode}
                                    disabled={tsDevModeLoading || tsDevMode === null}
                                    className='flex-1 min-w-[160px]'
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: tsDevModeLoading || tsDevMode === null ? 'default' : 'pointer', textAlign: 'left' }}
                                >
                                    <div
                                        className='flex flex-col justify-center items-center gap-3 p-6 h-[160px] transition-colors duration-200'
                                        style={{
                                            background: tsDevMode ? 'rgba(255,180,0,0.07)' : 'rgba(255,255,255,0.04)',
                                            border: `1px solid ${tsDevMode ? 'rgba(255,180,0,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                            borderTop: `2px solid ${tsDevMode ? 'rgb(255,180,0)' : 'rgba(255,255,255,0.15)'}`,
                                            opacity: tsDevMode === null ? 0.4 : 1,
                                        }}
                                    >
                                        <div style={{
                                            width: 32, height: 18, borderRadius: 9,
                                            background: tsDevMode ? 'rgba(255,180,0,0.9)' : 'rgba(255,255,255,0.15)',
                                            border: `1px solid ${tsDevMode ? 'rgba(255,180,0,0.6)' : 'rgba(255,255,255,0.1)'}`,
                                            position: 'relative', transition: 'background 0.2s',
                                            flexShrink: 0,
                                        }}>
                                            <div style={{
                                                position: 'absolute', top: 2,
                                                left: tsDevMode ? 14 : 2,
                                                width: 12, height: 12, borderRadius: '50%',
                                                background: '#fff',
                                                transition: 'left 0.2s',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                                            }} />
                                        </div>
                                        <Typography
                                            fontWeight={700}
                                            fontSize='0.78rem'
                                            letterSpacing={3}
                                            textAlign='center'
                                            style={{ textTransform: 'uppercase', color: tsDevMode ? 'rgb(255,180,0)' : 'rgba(237,237,237,0.5)' }}
                                        >
                                            TeamSpeak<br />Dev Mode
                                        </Typography>
                                        <Typography fontSize='0.58rem' letterSpacing={1} style={{ color: tsDevMode ? 'rgba(255,180,0,0.7)' : 'rgba(237,237,237,0.25)', textTransform: 'uppercase' }}>
                                            {tsDevMode === null ? 'Loading…' : tsDevMode ? 'Active — changes blocked' : 'Inactive'}
                                        </Typography>
                                    </div>
                                </button>

                                <button
                                    onClick={() => setTestNotifOpen(true)}
                                    className='flex-1 min-w-[160px]'
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                                >
                                    <div
                                        className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] transition-colors duration-200 bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(219,0,29,0.08)]'
                                        style={{ border: '1px solid rgba(219,0,29,0.42)', borderTop: '2px solid var(--red)' }}
                                    >
                                        <Typography fontWeight={700} fontSize='0.78rem' letterSpacing={3} textAlign='center' style={{ textTransform: 'uppercase' }}>
                                            Test<br />Notification
                                        </Typography>
                                    </div>
                                </button>

                            </div>
                        </div>

                        {/* Manage Preferences */}
                        <div>
                            <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 12 }}>
                                Settings and Management
                            </Typography>
                            <div className='flex flex-wrap gap-4'>
                                <a href='/dashboard/j4/preferences' style={{ textDecoration: 'none', flex: 1, minWidth: 160, maxWidth: 220 }}>
                                    <div
                                        className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] transition-colors duration-200 bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(219,0,29,0.08)]'
                                        style={{ border: '1px solid rgba(219,0,29,0.42)', borderTop: '2px solid var(--red)', cursor: 'pointer' }}
                                    >
                                        <Settings sx={{ fontSize: 28, color: 'rgba(237,237,237,0.4)' }} />
                                        <Typography fontWeight={700} fontSize='0.78rem' letterSpacing={3} textAlign='center' style={{ textTransform: 'uppercase' }}>
                                            Website Settings
                                        </Typography>
                                    </div>
                                </a>
                            </div>
                        </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            <ImportPanel open={importOpen} onClose={() => setImportOpen(false)} />
            <DischargeModal open={dischargeOpen} onClose={() => setDischargeOpen(false)} />
            <ReinstateModal open={reinstateOpen} onClose={() => setReinstateOpen(false)} />
            <TestNotificationModal open={testNotifOpen} onClose={() => setTestNotifOpen(false)} selfId={userId} />
        </div>
    )
}
