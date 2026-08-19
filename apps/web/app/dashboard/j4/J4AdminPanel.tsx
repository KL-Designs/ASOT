'use client'

import { useState, useEffect } from 'react'
import { Typography, Dialog, DialogContent, Autocomplete, TextField, Select, MenuItem, FormControl, InputLabel, CircularProgress, Tabs, Tab } from '@mui/material'
import { CalendarMonth, HistoryEdu, Settings } from '@mui/icons-material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import DeptCalendarTab from '@/app/dashboard/unit/calendar/DeptCalendarTab'
import DeptSettingsView from '@/app/dashboard/DeptSettingsView'
import PinTabLabel from '@/app/dashboard/_components/PinTabLabel'
import CornerBrackets from '@/app/dashboard/_components/CornerBrackets'
import { useTabState } from '@/app/dashboard/_components/useTabState'
import BackupsTab from './BackupsTab'
import CommunityTicketsTab from './tabs/CommunityTicketsTab'
import J4MeetingsTab from './tabs/J4MeetingsTab'
import LogsTab from './tabs/LogsTab'
import TeamspeakTab from './tabs/TeamspeakTab'
import MasterSheetTab from './tabs/MasterSheetTab'
import AIAdminTab from './tabs/AIAdminTab'
import RolesManagerPanel from '@/app/dashboard/orbat/RolesManagerPanel'
import DeptLinksRail from '@/app/dashboard/_components/dept-links/DeptLinksRail'
import { Badge, SectionLabel, Switch, ToolCard, ToolGrid } from '@/components/dashboard'

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
    const [dischargeType, setDischargeType] = useState<'honorable' | 'general' | 'dishonorable' | ''>('')
    const [dischargeReason, setDischargeReason] = useState('')
    const [notes, setNotes] = useState('')

    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)

    function handleOpen() {
        if (membersLoaded) return
        setLoadingMembers(true)
        fetch('/api/admin/members?limit=1000')
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
                            onChange={e => setDischargeType(e.target.value as 'honorable' | 'general' | 'dishonorable')}
                            MenuProps={{ PaperProps: { style: { background: '#1a1a1a', color: '#ededed' } } }}
                        >
                            <MenuItem value='honorable'>Honorable Discharge</MenuItem>
                            <MenuItem value='general'>General Discharge</MenuItem>
                            <MenuItem value='dishonorable'>Dishonorable Discharge</MenuItem>
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

interface SnapshotSummary {
    qualifications: number
    awards: number
    trainings: number
    operations: number
    campaignMedals: number
}

const RESTORE_OPTIONS: { key: keyof SnapshotSummary; label: string; detail: (s: SnapshotSummary) => string }[] = [
    { key: 'qualifications', label: 'Qualifications',                    detail: s => `${s.qualifications} qualification${s.qualifications !== 1 ? 's' : ''}` },
    { key: 'awards',         label: 'Awards & Citations',                detail: s => `${s.awards} award${s.awards !== 1 ? 's' : ''}` },
    { key: 'trainings',      label: 'Trainings',                         detail: s => `${s.trainings} training record${s.trainings !== 1 ? 's' : ''}` },
    { key: 'operations',     label: 'Campaign Medals & Op Attendance',   detail: s => `${s.operations} op${s.operations !== 1 ? 's' : ''}, ${s.campaignMedals} medal${s.campaignMedals !== 1 ? 's' : ''}` },
]

function ReinstateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [members, setMembers] = useState<DischargedMember[]>([])
    const [loading, setLoading] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Step 2 state
    const [selected, setSelected] = useState<DischargedMember | null>(null)
    const [snapshot, setSnapshot] = useState<SnapshotSummary | null>(null)
    const [snapshotLoading, setSnapshotLoading] = useState(false)
    const [restoreItems, setRestoreItems] = useState<Set<string>>(new Set())
    const [reinstating, setReinstating] = useState(false)

    function load() {
        if (loaded) return
        setLoading(true)
        fetch('/api/admin/members/discharged')
            .then(r => r.json())
            .then(data => { setMembers(data.members ?? []); setLoaded(true) })
            .catch(() => setError('Failed to load discharged members'))
            .finally(() => setLoading(false))
    }

    function handleClose() {
        setError(null)
        setSelected(null)
        setSnapshot(null)
        onClose()
    }

    async function selectMember(member: DischargedMember) {
        setSelected(member)
        setError(null)
        setSnapshot(null)
        setSnapshotLoading(true)
        setRestoreItems(new Set(['qualifications', 'awards', 'trainings', 'operations']))
        try {
            const res = await fetch(`/api/admin/members/discharged?memberId=${member.id}`)
            const data = await res.json()
            setSnapshot(data.snapshot ?? null)
        } finally {
            setSnapshotLoading(false)
        }
    }

    function toggleItem(key: string) {
        setRestoreItems(prev => {
            const next = new Set(prev)
            next.has(key) ? next.delete(key) : next.add(key)
            return next
        })
    }

    async function confirmReinstate() {
        if (!selected) return
        setReinstating(true)
        setError(null)
        try {
            const res = await fetch('/api/admin/members/discharged', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUserId: selected.id, restoreItems: [...restoreItems] }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error ?? 'Reinstatement failed.')
            } else {
                setMembers(prev => prev.filter(m => m.id !== selected.id))
                setSelected(null)
                setSnapshot(null)
            }
        } catch {
            setError('Network error. Please try again.')
        } finally {
            setReinstating(false)
        }
    }

    const rowSx: React.CSSProperties = {
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.05)',
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
                    {selected ? `Reinstate — ${selected.displayName}` : 'Reinstate Member'}
                </Typography>

                {/* ── Step 1: member list ── */}
                {!selected && (
                    <>
                        {loading && <TacticalSkeleton rows={5} className='px-4' />}
                        {loaded && members.length === 0 && (
                            <Typography fontSize='0.8rem' style={{ color: 'rgba(237,237,237,0.35)', padding: '12px 0' }}>
                                No discharged members.
                            </Typography>
                        )}
                        {members.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {members.map(m => (
                                    <div key={m.id} style={rowSx}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 2 }}>{m.displayName}</div>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                                <span style={{
                                                    fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1, padding: '1px 6px',
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
                                            onClick={() => selectMember(m)}
                                            style={{
                                                background: 'rgba(0,195,100,0.1)', border: '1px solid rgba(0,195,100,0.3)',
                                                color: 'rgb(0,195,100)', padding: '5px 14px', cursor: 'pointer',
                                                fontSize: '0.7rem', fontWeight: 700, letterSpacing: 1, whiteSpace: 'nowrap', flexShrink: 0,
                                            }}
                                        >
                                            REINSTATE
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* ── Step 2: data restoration checklist ── */}
                {selected && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 4 }}>
                            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>
                                Discharge Record
                            </div>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{
                                    fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1, padding: '1px 6px',
                                    background: selected.discharged.type === 'honorable' ? 'rgba(0,195,100,0.12)' : 'rgba(219,0,29,0.12)',
                                    color: selected.discharged.type === 'honorable' ? 'rgb(0,195,100)' : 'var(--red)',
                                }}>
                                    {selected.discharged.type === 'honorable' ? 'HONORABLE' : 'DISHONORABLE'}
                                </span>
                                <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.4)' }}>{selected.discharged.date}</span>
                                <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.4)' }}>{selected.discharged.reason}</span>
                            </div>
                        </div>

                        <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.55)', marginBottom: 2 }}>
                            Select which data to restore from their discharge record. Unchecked items will not be carried over.
                        </div>

                        {snapshotLoading && <TacticalSkeleton rows={4} />}

                        {!snapshotLoading && !snapshot && (
                            <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', padding: '8px 0' }}>
                                No discharge snapshot found — member will be reinstated without data restoration.
                            </div>
                        )}

                        {!snapshotLoading && snapshot && RESTORE_OPTIONS.map(opt => {
                            const count = opt.key === 'operations'
                                ? snapshot.operations + snapshot.campaignMedals
                                : snapshot[opt.key]
                            const checked = restoreItems.has(opt.key)
                            const hasData = count > 0

                            return (
                                <label
                                    key={opt.key}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 12px',
                                        background: checked ? 'rgba(0,195,100,0.05)' : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${checked ? 'rgba(0,195,100,0.2)' : 'rgba(255,255,255,0.06)'}`,
                                        cursor: hasData ? 'pointer' : 'not-allowed',
                                        opacity: hasData ? 1 : 0.4,
                                        transition: 'background 0.15s, border-color 0.15s',
                                    }}
                                >
                                    <input
                                        type='checkbox'
                                        checked={checked && hasData}
                                        disabled={!hasData}
                                        onChange={() => hasData && toggleItem(opt.key)}
                                        style={{ accentColor: 'rgb(0,195,100)', width: 14, height: 14, flexShrink: 0 }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(237,237,237,0.9)' }}>{opt.label}</div>
                                        <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', marginTop: 1 }}>
                                            {hasData ? opt.detail(snapshot) : 'None on record'}
                                        </div>
                                    </div>
                                </label>
                            )
                        })}
                    </div>
                )}

                {error && (
                    <Typography fontSize='0.75rem' style={{ color: '#ff4444', marginTop: 12 }}>{error}</Typography>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                    {selected ? (
                        <>
                            <button
                                onClick={() => { setSelected(null); setSnapshot(null); setError(null) }}
                                disabled={reinstating}
                                style={{ background: 'none', border: '1px solid rgba(237,237,237,0.15)', color: 'rgba(237,237,237,0.6)', padding: '7px 18px', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: 1 }}
                            >
                                BACK
                            </button>
                            <button
                                onClick={confirmReinstate}
                                disabled={reinstating}
                                style={{
                                    background: reinstating ? 'rgba(0,195,100,0.05)' : 'rgba(0,195,100,0.12)',
                                    border: '1px solid rgba(0,195,100,0.35)', color: reinstating ? 'rgba(237,237,237,0.3)' : 'rgb(0,195,100)',
                                    padding: '7px 18px', cursor: reinstating ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontWeight: 700, letterSpacing: 1,
                                }}
                            >
                                {reinstating ? 'REINSTATING…' : 'CONFIRM & REINSTATE'}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleClose}
                            style={{ background: 'none', border: '1px solid rgba(237,237,237,0.15)', color: 'rgba(237,237,237,0.6)', padding: '7px 18px', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: 1 }}
                        >
                            CLOSE
                        </button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

const CPU_PROFILE_DURATIONS: { value: number; label: string }[] = [
    { value: 30,   label: '30s' },
    { value: 60,   label: '1 min' },
    { value: 300,  label: '5 min' },
    { value: 900,  label: '15 min' },
    { value: 1800, label: '30 min' },
]

type ActiveCapture = { filename: string; startedAt: string; durationS: number }
type CpuProfileFile = { filename: string; capturedAt: string; sizeBytes: number }

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatRemaining(seconds: number): string {
    if (seconds <= 0) return 'finishing up…'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}m ${secs}s remaining` : `${secs}s remaining`
}

/**
 * Capture and download CPU profiles.
 *
 * The capture itself is tracked server-side (GET reports whether one is
 * running), so closing this dialog or reloading the page does not abandon it —
 * reopening re-attaches to the run in progress.
 */
function CpuProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [active, setActive] = useState<ActiveCapture | null>(null)
    const [profiles, setProfiles] = useState<CpuProfileFile[]>([])
    const [serverError, setServerError] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [starting, setStarting] = useState(false)
    const [duration, setDuration] = useState(30)
    const [now, setNow] = useState(() => Date.now())

    async function load() {
        try {
            const res = await fetch('/api/admin/diagnostics/cpu-profile')
            if (!res.ok) throw new Error(`Status check failed (${res.status})`)
            const data = await res.json()
            setActive(data.active ?? null)
            setProfiles(data.profiles ?? [])
            setServerError(data.lastError ?? null)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load profile status')
        } finally {
            setLoading(false)
        }
    }

    // Poll while the dialog is open: picks up a capture that finished while it
    // was closed, and refreshes the list the moment one completes.
    useEffect(() => {
        if (!open) return
        const id = setInterval(load, 4000)
        return () => clearInterval(id)
    }, [open])

    // Separate 1s ticker so the countdown moves between polls.
    useEffect(() => {
        if (!open || !active) return
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
    }, [open, active])

    async function start() {
        if (starting || active) return
        setStarting(true)
        setError(null)
        try {
            const res = await fetch(`/api/admin/diagnostics/cpu-profile?duration=${duration}`, { method: 'POST' })
            const data = await res.json().catch(() => null)
            if (!res.ok) {
                // Every failure used to collapse into "back to idle", which was
                // indistinguishable from the button doing nothing at all.
                throw new Error(data?.error ?? `Capture failed to start (${res.status})`)
            }
            setActive(data)
            setServerError(null)
            setNow(Date.now())
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Capture failed to start')
        } finally {
            setStarting(false)
        }
    }

    const remaining = active
        ? Math.ceil(active.durationS - (now - new Date(active.startedAt).getTime()) / 1000)
        : 0

    return (
        <Dialog
            open={open}
            onClose={onClose}
            TransitionProps={{ onEntered: load }}
            PaperProps={{
                style: {
                    background: '#111',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                    borderRadius: 0,
                    minWidth: 480,
                    maxWidth: 620,
                    color: '#ededed',
                },
            }}
        >
            <DialogContent style={{ padding: '28px 28px 24px' }}>
                <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    J4 — Administration
                </Typography>
                <Typography fontWeight={700} fontSize='0.9rem' letterSpacing={3} style={{ textTransform: 'uppercase', marginBottom: 20 }}>
                    CPU Profile
                </Typography>

                {loading ? (
                    <TacticalSkeleton rows={3} />
                ) : active ? (
                    <div style={{ padding: '14px 16px', background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.28)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <CircularProgress size={14} style={{ color: 'var(--red)' }} />
                            <Typography fontSize='0.8rem' fontWeight={600}>
                                Capturing — {formatRemaining(remaining)}
                            </Typography>
                        </div>
                        <Typography fontSize='0.68rem' style={{ color: 'rgba(237,237,237,0.4)', marginTop: 8 }}>
                            Runs on the server. You can close this window or reload the page — the profile will be waiting here when it finishes.
                        </Typography>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.55)' }}>Duration</Typography>
                        <select
                            value={duration}
                            onChange={e => setDuration(Number(e.target.value))}
                            disabled={starting}
                            style={{ background: '#1a1a1a', color: '#ededed', border: '1px solid rgba(237,237,237,0.2)', fontSize: '0.72rem', padding: '5px 8px', borderRadius: 2 }}
                        >
                            {CPU_PROFILE_DURATIONS.map(d => (
                                <option key={d.value} value={d.value}>{d.label}</option>
                            ))}
                        </select>
                        <button
                            onClick={start}
                            disabled={starting}
                            style={{
                                background: 'rgba(219,0,29,0.14)', border: '1px solid rgba(219,0,29,0.4)',
                                color: starting ? 'rgba(237,237,237,0.3)' : '#ededed',
                                padding: '6px 16px', cursor: starting ? 'not-allowed' : 'pointer',
                                fontSize: '0.72rem', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                            }}
                        >
                            {starting ? 'Starting…' : 'Start Capture'}
                        </button>
                    </div>
                )}

                {(error || serverError) && (
                    <Typography fontSize='0.72rem' style={{ color: '#ff4444', marginTop: 12 }}>
                        {error ?? `Last capture failed: ${serverError}`}
                    </Typography>
                )}

                <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', margin: '24px 0 10px' }}>
                    Captured Profiles
                </Typography>

                {profiles.length === 0 ? (
                    <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>
                        No profiles captured yet.
                    </Typography>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                        {profiles.map(p => (
                            <a
                                key={p.filename}
                                href={`/api/admin/diagnostics/cpu-profile/${encodeURIComponent(p.filename)}`}
                                download={p.filename}
                                style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                                    padding: '9px 12px', textDecoration: 'none',
                                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                                }}
                            >
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '0.76rem', color: 'rgba(237,237,237,0.9)' }}>
                                        {new Date(p.capturedAt).toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '0.64rem', color: 'rgba(237,237,237,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {p.filename}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                                    <span style={{ fontSize: '0.66rem', color: 'rgba(237,237,237,0.35)' }}>{formatBytes(p.sizeBytes)}</span>
                                    <span style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: 1, color: 'rgb(0,195,100)', textTransform: 'uppercase' }}>Download</span>
                                </div>
                            </a>
                        ))}
                    </div>
                )}

                <Typography fontSize='0.64rem' style={{ color: 'rgba(237,237,237,0.28)', marginTop: 16 }}>
                    Load a downloaded .cpuprofile in Chrome DevTools → Performance → Load profile.
                </Typography>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                    <button
                        onClick={onClose}
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

export default function J4AdminPanel({ userId, displayName, canManageLinks, canBackupManage, canBackupRestore }: { userId: string; displayName: string; canManageLinks: boolean; canBackupManage: boolean; canBackupRestore: boolean }) {
    const { tab: requestedTab, setTab, view, setView } = useTabState(0, 'dept')
    // Backups is tab 3, but its <Tab> is only rendered for backups.manage
    // holders. The active tab comes straight off the URL (?tab=3), which
    // survives in bookmarks and pinned sidebar links, so a viewer without the
    // permission can land on a tab with no matching child — MUI warns about a
    // Tabs value that matches nothing and the body renders empty. Fall back to
    // the first tab instead.
    const tab = requestedTab === 3 && !canBackupManage ? 0 : requestedTab
    const [dischargeOpen, setDischargeOpen] = useState(false)
    const [reinstateOpen, setReinstateOpen] = useState(false)
    const [testNotifOpen, setTestNotifOpen] = useState(false)
    const [rolesManagerOpen, setRolesManagerOpen] = useState(false)

    const [devMode, setDevMode]           = useState<boolean | null>(null)
    const [devModeLoading, setDevModeLoading] = useState(false)
    const [tsDevMode, setTsDevMode]       = useState<boolean | null>(null)
    const [tsDevModeLoading, setTsDevModeLoading] = useState(false)
    const [cpuProfileOpen, setCpuProfileOpen] = useState(false)

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
                    border: '1px solid var(--line-2)',
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <CornerBrackets />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ color: 'var(--txt-4)' }}>{'//'}</span> DEPARTMENTS
                        </span>
                    <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                        [J4] Administration
                    </Typography>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button style={{ ...btnSx(view === 'settings'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'settings' ? 'dept' : 'settings')}>
                            <Settings sx={{ fontSize: '0.85rem' }} />Management
                        </button>
                        <button style={{ ...btnSx(view === 'calendar'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'calendar' ? 'dept' : 'calendar')}>
                            <CalendarMonth sx={{ fontSize: '0.85rem' }} />Calendar
                        </button>
                        <button style={{ ...btnSx(view === 'logs'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setView(view === 'logs' ? 'dept' : 'logs')}>
                            <HistoryEdu sx={{ fontSize: '0.85rem' }} />Activity Logs
                        </button>
                    </div>
            </div>

            {view === 'settings'     && <DeptSettingsView department='j4' displayName={displayName} userId={userId} canManage={true} canManageLinks={canManageLinks} isJ4={true} />}
            {view === 'calendar'     && <DeptCalendarTab department='j4' userId={userId} isJ4={true} />}
            {view === 'logs' && (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', margin: '8px 0 0' }}>
                    <LogsTab />
                </div>
            )}
            {view === 'dept' && (
                <>
                    <DeptLinksRail department='j4' canManage={canManageLinks} onManage={() => setView('settings')} />

                    {/* Tabs */}
                    <div className='mx-6 mt-4' style={{ borderBottom: '1px solid var(--line-2)' }}>
                        <Tabs
                            value={tab}
                            onChange={(_, v) => setTab(v)}
                            TabIndicatorProps={{ style: { background: 'var(--red)', height: 2 } }}
                            sx={{ minHeight: 40 }}
                        >
                            <Tab value={0} label={<PinTabLabel label='Mastersheet'  pinLabel='J4 — Mastersheet'  href='/dashboard/j4' tabIndex={0} />} sx={tabSx} />
                            <Tab value={1} label={<PinTabLabel label='Tickets'      pinLabel='J4 — Tickets'      href='/dashboard/j4' tabIndex={1} />} sx={tabSx} />
                            <Tab value={2} label={<PinTabLabel label='Meetings'     pinLabel='J4 — Meetings'     href='/dashboard/j4' tabIndex={2} />} sx={tabSx} />
                            {canBackupManage && (
                                <Tab value={3} label={<PinTabLabel label='Backups' pinLabel='J4 — Backups' href='/dashboard/j4' tabIndex={3} />} sx={tabSx} />
                            )}
                            <Tab value={4} label={<PinTabLabel label='Teamspeak'    pinLabel='J4 — Teamspeak'    href='/dashboard/j4' tabIndex={4} />} sx={tabSx} />
                            <Tab value={5} label={<PinTabLabel label='Tools'        pinLabel='J4 — Tools'        href='/dashboard/j4' tabIndex={5} />} sx={tabSx} />
                            <Tab value={6} label={<PinTabLabel label='AI Admin'     pinLabel='J4 — AI Admin'     href='/dashboard/j4' tabIndex={6} />} sx={tabSx} />
                        </Tabs>
                    </div>

                    <div className='flex-1 min-h-0 mt-0' style={{ display: 'flex', flexDirection: 'column' }}>
                        {tab === 0 && (
                            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                <MasterSheetTab />
                            </div>
                        )}
                        {tab === 1 && (
                            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                <CommunityTicketsTab />
                            </div>
                        )}
                        {tab === 2 && <J4MeetingsTab userId={userId} />}
                        {tab === 3 && canBackupManage && <BackupsTab canRestore={canBackupRestore} />}
                        {tab === 4 && (
                            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                                <TeamspeakTab />
                            </div>
                        )}
                        {tab === 6 && <AIAdminTab />}
                        {tab === 5 && (
                            <div className='p-6 md:p-10 flex flex-col gap-8 overflow-y-auto'>

                        {/*
                           Tools, grouped by what they cost you if you are wrong.

                           These were nine identical rectangles: DISCHARGE MEMBER
                           and CPU PROFILE sat side by side in the same red box,
                           with nothing between them to slow a hand down. Tier and
                           grouping now do that work — everyday tools first,
                           environment switches next, and the two that change a
                           member's standing under their own heading at the end.
                        */}
                        <div className='flex flex-col gap-4'>
                            <SectionLabel>Everyday</SectionLabel>
                            <ToolGrid>
                                <ToolCard
                                    href='/dashboard/j4/import'
                                    title='Import Panel'
                                    description='Bulk-load milpacs, trainings and J1 records from a sheet.'
                                />
                                <ToolCard
                                    onClick={() => setTab(0)}
                                    title='HQ Mastersheet'
                                    description='Billet points, leaving notices and discipline in one table.'
                                />
                                <ToolCard
                                    onClick={() => setRolesManagerOpen(true)}
                                    title='ORBAT Roles'
                                    description='Create, rename and reorder the roles positions are filled from.'
                                />
                                <ToolCard
                                    href='/dashboard/j4/website-settings'
                                    icon={<Settings sx={{ fontSize: 20 }} />}
                                    title='Website Settings'
                                    description='Public-site copy, links and feature switches.'
                                />
                            </ToolGrid>
                        </div>

                        <div className='flex flex-col gap-4'>
                            <SectionLabel right={<span style={{ fontSize: '0.62rem', letterSpacing: '0.1em', color: 'rgba(237,237,237,0.3)', textTransform: 'uppercase' }}>Affects live integrations</span>}>
                                Environment
                            </SectionLabel>
                            <ToolGrid>
                                {/* A card whose job is to host a switch is not
                                    itself clickable — one tile, one meaning. */}
                                <ToolCard
                                    tier={devMode ? 'caution' : 'standard'}
                                    title='Discord Dev Mode'
                                    description='Blocks the bot from sending any message to the guild.'
                                    flag={
                                        <Switch
                                            on={!!devMode}
                                            onChange={() => { if (!devModeLoading && devMode !== null) toggleDevMode() }}
                                            label='Discord developer mode'
                                        />
                                    }
                                    footer={
                                        devMode === null
                                            ? <Badge tone='muted'>Loading…</Badge>
                                            : devMode
                                                ? <Badge tone='warn' dot>Active — messages blocked</Badge>
                                                : <Badge tone='muted' dot>Inactive</Badge>
                                    }
                                />
                                <ToolCard
                                    tier={tsDevMode ? 'caution' : 'standard'}
                                    title='TeamSpeak Dev Mode'
                                    description='Blocks channel and permission changes on the TeamSpeak server.'
                                    flag={
                                        <Switch
                                            on={!!tsDevMode}
                                            onChange={() => { if (!tsDevModeLoading && tsDevMode !== null) toggleTsDevMode() }}
                                            label='TeamSpeak developer mode'
                                        />
                                    }
                                    footer={
                                        tsDevMode === null
                                            ? <Badge tone='muted'>Loading…</Badge>
                                            : tsDevMode
                                                ? <Badge tone='warn' dot>Active — changes blocked</Badge>
                                                : <Badge tone='muted' dot>Inactive</Badge>
                                    }
                                />
                                <ToolCard
                                    onClick={() => setTestNotifOpen(true)}
                                    title='Test Notification'
                                    description='Send yourself one of any notification type.'
                                    footer={<Badge tone='muted'>Delivers to you only</Badge>}
                                />
                                <ToolCard
                                    onClick={() => setCpuProfileOpen(true)}
                                    tier='caution'
                                    title='CPU Profile'
                                    description='Capture and download a V8 profile from the running server.'
                                    footer={<Badge tone='warn'>Slows the server while capturing</Badge>}
                                />
                            </ToolGrid>
                        </div>

                        <div className='flex flex-col gap-4'>
                            <SectionLabel>Member standing</SectionLabel>
                            <ToolGrid>
                                <ToolCard
                                    onClick={() => setDischargeOpen(true)}
                                    tier='danger'
                                    title='Discharge Member'
                                    description='Ends a member&rsquo;s service and records the discharge type on their record.'
                                    footer={<Badge tone='alert' dot>Files an HQ ticket for approval</Badge>}
                                />
                                <ToolCard
                                    onClick={() => setReinstateOpen(true)}
                                    tier='safe'
                                    title='Reinstate Member'
                                    description='Returns a discharged member to the roster with their record intact.'
                                    footer={<Badge tone='live' dot>Reversible</Badge>}
                                />
                            </ToolGrid>
                        </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            <DischargeModal open={dischargeOpen} onClose={() => setDischargeOpen(false)} />
            <ReinstateModal open={reinstateOpen} onClose={() => setReinstateOpen(false)} />
            <TestNotificationModal open={testNotifOpen} onClose={() => setTestNotifOpen(false)} selfId={userId} />
            <RolesManagerPanel open={rolesManagerOpen} onClose={() => setRolesManagerOpen(false)} />
            <CpuProfileModal open={cpuProfileOpen} onClose={() => setCpuProfileOpen(false)} />
        </div>
    )
}
