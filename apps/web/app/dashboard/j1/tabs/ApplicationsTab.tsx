'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
    Chip, CircularProgress, Alert, Button,
    TextField, Select, MenuItem, FormControl, InputLabel,
    Dialog, DialogContent, DialogTitle, IconButton, Autocomplete,
    InputAdornment,
} from '@mui/material'
import {
    Refresh, LinkOff, Link as LinkIcon, Close,
    Search, ArrowUpward, ArrowDownward, UnfoldMore, Warning,
} from '@mui/icons-material'
import { Typography } from '@mui/material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'

type Application = J1Application & { _id: string }

interface DiscordMember {
    id: string
    displayName: string
    username: string | null
    inGameName: string | null
    discharged: boolean
    isSkeleton: boolean
    isActiveMember: boolean
}

const STATUS_COLORS: Record<string, 'warning' | 'info' | 'success' | 'error' | 'default'> = {
    pending: 'warning',
    reviewing: 'info',
    accepted: 'success',
    rejected: 'error',
    returned: 'warning',
}

const FILTERS = ['all', 'pending', 'reviewing', 'returned', 'accepted', 'rejected'] as const
type Filter = typeof FILTERS[number]

type SortKey = 'discordUsername' | 'inGameName' | 'submittedAt' | 'status'
type SortDir = 'asc' | 'desc'

function formatDate(date: string | Date) {
    return new Date(date).toLocaleDateString('en-AU', {
        day: '2-digit', month: 'short', year: 'numeric',
    })
}

function ApplicationModal({ app, members, isJ4, isLead, userId, onClose, onUpdate, onDelete }: {
    app: Application
    members: DiscordMember[]
    isJ4: boolean
    isLead: boolean
    userId: string
    onClose: () => void
    onUpdate: (id: string, patch: Partial<Application>) => void
    onDelete: (id: string) => void
}) {
    const [notes, setNotes] = useState(app.notes || '')
    const [linkedMember, setLinkedMember] = useState<DiscordMember | null>(
        app.linkedUserId
            ? (members.find(m => m.id === app.linkedUserId) ?? null)
            : app.discordId
            ? (members.find(m => m.id === app.discordId) ?? null)
            : null
    )
    const [recruiter, setRecruiter] = useState<DiscordMember | null>(
        app.assignedReviewerId ? (members.find(m => m.id === app.assignedReviewerId) ?? null) : null
    )
    const [recruiterNote, setRecruiterNote] = useState(app.recruiterNote ?? '')
    const [reviewDeadline, setReviewDeadline] = useState<string>('72')
    const [reviewCustomDate, setReviewCustomDate] = useState('')
    const [assigningMode, setAssigningMode] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [statusChanging, setStatusChanging] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [j4DecisionNote, setJ4DecisionNote] = useState('')
    const [j4Deciding, setJ4Deciding] = useState(false)
    const [notifyingJ4, setNotifyingJ4] = useState(false)

    const isAssignedRecruiter = userId === app.assignedReviewerId
    const canChangeStatus = isLead || isAssignedRecruiter
    const isJ4ReviewPending = app.j4ReviewStatus === 'pending'
    const returningStatus = (app.returningMemberCheck as any)?.status as string | undefined
    // Only DD (and backward-compat old 'REVIEW' or no status) locks the recruiter
    const recruiterLocked = isAssignedRecruiter && !isLead && isJ4ReviewPending && (returningStatus === 'DD' || returningStatus === 'REVIEW' || !returningStatus)

    useEffect(() => {
        if (members.length === 0) return
        if (app.linkedUserId) {
            setLinkedMember(members.find(m => m.id === app.linkedUserId) ?? null)
        } else if (app.discordId) {
            setLinkedMember(prev => prev ?? (members.find(m => m.id === app.discordId) ?? null))
        }
        if (app.assignedReviewerId) {
            setRecruiter(members.find(m => m.id === app.assignedReviewerId) ?? null)
        }
    }, [members, app.linkedUserId, app.assignedReviewerId, app.discordId])

    async function handleSave() {
        setSaving(true)
        setSaved(false)
        try {
            const body: Record<string, unknown> = {
                notes,
                linkedUserId: linkedMember?.id ?? null,
                linkedUserDisplayName: linkedMember?.displayName ?? null,
            }
            if (isLead) {
                body.assignedReviewerId = recruiter?.id ?? null
                body.assignedReviewerName = recruiter?.displayName ?? null
                body.recruiterNote = recruiterNote
                if (recruiter && recruiter.id !== app.assignedReviewerId) {
                    if (reviewDeadline === 'custom') {
                        body.reviewCustomDate = reviewCustomDate
                    } else {
                        body.reviewHours = Number(reviewDeadline)
                    }
                }
            }
            await fetch(`/api/admin/j1/applications/${app._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            onUpdate(app._id, {
                notes,
                linkedUserId: linkedMember?.id,
                linkedUserDisplayName: linkedMember?.displayName,
                assignedReviewerId: recruiter?.id,
                assignedReviewerName: recruiter?.displayName,
                recruiterNote,
            })
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        } finally {
            setSaving(false)
        }
    }

    async function handleStatusChange(newStatus: Application['status']) {
        setStatusChanging(true)
        try {
            await fetch(`/api/admin/j1/applications/${app._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            })
            onUpdate(app._id, { status: newStatus })
            onClose()
        } finally {
            setStatusChanging(false)
        }
    }

    async function handleSendBack() {
        if (!recruiterNote.trim()) return
        setStatusChanging(true)
        try {
            await fetch(`/api/admin/j1/applications/${app._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'returned', recruiterNote: recruiterNote.trim() }),
            })
            onUpdate(app._id, { status: 'returned', recruiterNote: recruiterNote.trim() })
            onClose()
        } finally {
            setStatusChanging(false)
        }
    }

    async function handleResubmit() {
        setStatusChanging(true)
        try {
            await fetch(`/api/admin/j1/applications/${app._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'pending' }),
            })
            onUpdate(app._id, { status: 'pending' })
            onClose()
        } finally {
            setStatusChanging(false)
        }
    }

    async function handleDelete() {
        setDeleting(true)
        try {
            await fetch(`/api/admin/j1/applications/${app._id}`, { method: 'DELETE' })
            onDelete(app._id)
            onClose()
        } finally {
            setDeleting(false)
        }
    }

    async function handleRecommend(rec: 'approve' | 'deny' | 'pend') {
        setStatusChanging(true)
        try {
            const res = await fetch(`/api/admin/j1/applications/${app._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recruiterRecommendation: rec }),
            })
            if (res.ok) {
                onUpdate(app._id, {
                    recruiterRecommendation: rec,
                    recruiterRecommendationAt: new Date().toISOString(),
                } as any)
            }
        } finally {
            setStatusChanging(false)
        }
    }

    async function handleJ4Decision(decision: 'approved' | 'rejected') {
        setJ4Deciding(true)
        try {
            const res = await fetch(`/api/admin/j1/applications/${app._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ j4ReviewDecision: decision, j4ReviewNote: j4DecisionNote.trim() || undefined }),
            })
            if (res.ok) {
                onUpdate(app._id, {
                    j4ReviewStatus: decision,
                    j4ReviewedByName: 'You',
                    j4ReviewNote: j4DecisionNote.trim() || undefined,
                } as any)
            }
        } finally {
            setJ4Deciding(false)
        }
    }

    async function handleNotifyJ4Optional() {
        setNotifyingJ4(true)
        try {
            const res = await fetch(`/api/admin/j1/applications/${app._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notifyJ4GD: true }),
            })
            if (res.ok) onUpdate(app._id, { j4GDNotified: true } as any)
        } finally {
            setNotifyingJ4(false)
        }
    }

    const inputSx = {
        '& .MuiOutlinedInput-root': {
            borderRadius: 0,
            fontSize: '0.82rem',
            '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
            '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
            '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
        },
        '& .MuiInputLabel-root': { fontSize: '0.82rem' },
        '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
        '& .MuiSelect-select': { fontSize: '0.82rem' },
    }

    const Field = ({ label, value }: { label: string; value?: string | number | boolean | null }) => {
        if (value == null || value === '' || value === false) return null
        return (
            <div>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 3 }}>
                    {label}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.75)' }}>
                    {String(value)}
                </div>
            </div>
        )
    }

    return (
        <Dialog
            open
            onClose={onClose}
            maxWidth='md'
            fullWidth
            PaperProps={{
                style: {
                    background: '#0f0f0f',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                    borderRadius: 0,
                    color: 'var(--foreground)',
                },
            }}
        >
            <DialogTitle style={{ padding: '16px 20px', borderBottom: '1px solid var(--line-2)' }}>
                <div className='flex items-center justify-between'>
                    <div>
                        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                            Application
                        </div>
                        <div className='flex items-center gap-3'>
                            <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '0.05em' }}>
                                {app.discordUsername}
                            </span>
                            <Chip
                                label={app.status.toUpperCase()}
                                color={STATUS_COLORS[app.status] || 'default'}
                                size='small'
                                sx={{ borderRadius: 0, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em', height: 20 }}
                            />
                            {app.isDirectRecruit && (
                                <span style={{ color: '#00c3ff', fontSize: '0.65rem', fontWeight: 700 }}>DIRECT RECRUIT</span>
                            )}
                        </div>
                    </div>
                    <IconButton onClick={onClose} size='small' style={{ color: 'rgba(237,237,237,0.4)' }}>
                        <Close fontSize='small' />
                    </IconButton>
                </div>
            </DialogTitle>

            <DialogContent style={{ padding: 20 }}>
                <div className='flex flex-col gap-5'>
                    {/* Identity & Background */}
                    <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
                        <Field label='In-Game Name' value={app.inGameName} />
                        {app.age && app.age < 17 ? (
                            <div>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#f59e0b', marginBottom: 3 }}>
                                    Age ⚠
                                </div>
                                <div style={{ fontSize: '0.82rem', color: '#f59e0b', fontWeight: 700 }}>
                                    {app.age} <span style={{ fontSize: '0.68rem', fontWeight: 400, color: 'rgba(245,158,11,0.7)' }}>— Under 17</span>
                                </div>
                            </div>
                        ) : (
                            <Field label='Age' value={app.age || null} />
                        )}
                        <Field label='Region' value={app.region} />
                        <Field label='ARMA 3 Hours' value={app.armaHours} />
                        <Field label='Available Nights' value={app.availableNights} />
                        <Field label='Ops Per Month' value={app.opsPerMonth} />
                        <Field label='Primary Role' value={app.primaryRole} />
                        <Field label='Secondary Role' value={app.secondaryRole} />
                        <Field label='Owns ARMA 3' value={app.ownsArma ? 'Yes' : (app.ownsArma === false ? 'No' : null)} />
                        <Field label='Prior Milsim' value={app.priorMilsim ? 'Yes' : (app.priorMilsim === false ? 'No' : null)} />
                        <Field label='Dual Clan' value={app.dualClan ? 'Yes' : (app.dualClan === false ? 'No' : null)} />
                    </div>

                    {(app.heardAbout) && (
                        <div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 6 }}>
                                How They Heard About Us
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.7)' }}>
                                {app.heardAbout}
                                {app.heardAboutOther && <span style={{ color: 'rgba(237,237,237,0.45)' }}> — {app.heardAboutOther}</span>}
                            </div>
                        </div>
                    )}

                    {app.ownsArma === false && (
                        <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', borderLeft: '3px solid #f59e0b', fontSize: '0.78rem', color: '#f59e0b', lineHeight: 1.6 }}>
                            ⚠ Applicant does not currently own ARMA 3 — must purchase before officially joining.
                        </div>
                    )}

                    {app.ageExemptionNote && (
                        <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', borderLeft: '3px solid #f59e0b' }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#f59e0b', marginBottom: 5 }}>
                                Age Exemption / Vouch Note
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.75)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                {app.ageExemptionNote}
                            </div>
                        </div>
                    )}

                    {app.additionalRoles && app.additionalRoles.length > 0 && (
                        <div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 6 }}>
                                Additional Roles
                            </div>
                            <div className='flex flex-wrap gap-2'>
                                {app.additionalRoles.map(r => (
                                    <Chip key={r} label={r} size='small' sx={{ borderRadius: 0, fontSize: '0.72rem', background: 'rgba(219,0,29,0.08)', color: 'rgba(237,237,237,0.7)', border: '1px solid rgba(219,0,29,0.42)' }} />
                                ))}
                            </div>
                        </div>
                    )}

                    {app.departmentInterest && app.departmentInterest.length > 0 && (
                        <div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 6 }}>
                                Department Interest
                            </div>
                            <div className='flex flex-wrap gap-2'>
                                {app.departmentInterest.map(d => (
                                    <Chip key={d} label={d} size='small' sx={{ borderRadius: 0, fontSize: '0.72rem', background: 'rgba(0,120,255,0.08)', color: 'rgba(237,237,237,0.7)', border: '1px solid rgba(0,120,255,0.15)' }} />
                                ))}
                            </div>
                        </div>
                    )}

                    {app.previousUnits && (
                        <div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 6 }}>
                                Previous Units
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.7)' }}>{app.previousUnits}</div>
                        </div>
                    )}

                    {app.steamUrl && (
                        <div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 6 }}>
                                Steam Profile
                            </div>
                            <a href={app.steamUrl} target='_blank' rel='noreferrer' style={{ fontSize: '0.82rem', color: '#00c3ff', wordBreak: 'break-all' }}>
                                {app.steamUrl}
                            </a>
                        </div>
                    )}

                    {app.experience && (
                        <div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 6 }}>
                                Experience
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.75)', whiteSpace: 'pre-wrap', lineHeight: 1.7, background: 'rgba(255,255,255,0.04)', padding: '10px 12px', border: '1px solid var(--line-2)' }}>
                                {app.experience}
                            </div>
                        </div>
                    )}

                    {app.recruiter && (
                        <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)' }}>
                            Recruited by <span style={{ color: 'rgba(237,237,237,0.7)' }}>{app.recruiter}</span>
                        </div>
                    )}

                    {/* Returning-member check result */}
                    {app.returningMemberCheck && (() => {
                        const check = app.returningMemberCheck as any
                        const raw: string = check.status ?? ''
                        const st = raw === 'YES' ? 'CLEAR' : raw === 'REVIEW' ? 'GD' : raw
                        const j4StatusLine = app.j4ReviewStatus && (
                            <div style={{ marginTop: 6, fontSize: '0.72rem', fontWeight: 700, color: app.j4ReviewStatus === 'approved' ? '#00c364' : app.j4ReviewStatus === 'rejected' ? 'var(--red)' : '#f59e0b' }}>
                                J4 decision: {app.j4ReviewStatus.toUpperCase()}
                                {app.j4ReviewedByName && <span style={{ fontWeight: 400, color: 'rgba(237,237,237,0.4)' }}> by {app.j4ReviewedByName}</span>}
                                {app.j4ReviewNote && <span style={{ fontWeight: 400, color: 'rgba(237,237,237,0.5)' }}> — {app.j4ReviewNote}</span>}
                            </div>
                        )
                        if (st === 'CLEAR') return (
                            <div style={{ padding: '10px 14px', background: 'rgba(0,195,100,0.04)', border: '1px solid rgba(0,195,100,0.2)', borderLeft: '3px solid #00c364' }}>
                                <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#00c364', marginBottom: 4 }}>Returning Member Check — Clear</div>
                                <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.5)' }}>{check.details}</div>
                                {j4StatusLine}
                            </div>
                        )
                        if (st === 'HD') return (
                            <div style={{ padding: '10px 14px', background: 'rgba(0,120,255,0.06)', border: '1px solid rgba(0,120,255,0.3)', borderLeft: '3px solid #60a5fa' }}>
                                <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#60a5fa', marginBottom: 4 }}>Returning Member — Honourable Discharge (HD)</div>
                                <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.6 }}>{check.details}</div>
                                <div style={{ marginTop: 5, fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>No restrictions — applicant may proceed normally.</div>
                                {j4StatusLine}
                            </div>
                        )
                        if (st === 'GD') return (
                            <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.35)', borderLeft: '3px solid #f59e0b' }}>
                                <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#f59e0b', marginBottom: 4 }}>Returning Member — General Discharge (GD)</div>
                                <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.6 }}>{check.details}</div>
                                <div style={{ marginTop: 5, fontSize: '0.72rem', color: 'rgba(245,158,11,0.7)' }}>Recruiter may continue at their discretion. J4 notification is optional.</div>
                                {(app as any).j4GDNotified && <div style={{ marginTop: 5, fontSize: '0.72rem', color: '#00c364' }}>✓ J4 has been notified</div>}
                                {j4StatusLine}
                            </div>
                        )
                        if (st === 'DD') return (
                            <div style={{ padding: '10px 14px', background: 'rgba(219,0,29,0.07)', border: '1px solid rgba(219,0,29,0.4)', borderLeft: '3px solid var(--red)' }}>
                                <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--red)', marginBottom: 4 }}>Returning Member — Dishonourable Discharge (DD)</div>
                                <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.6 }}>{check.details}</div>
                                <div style={{ marginTop: 5, fontSize: '0.72rem', color: 'rgba(219,0,29,0.8)' }}>J4 review is mandatory. Recruiter cannot proceed until J4 approves.</div>
                                {j4StatusLine}
                            </div>
                        )
                        return (
                            <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.35)', borderLeft: '3px solid #f59e0b' }}>
                                <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#f59e0b', marginBottom: 4 }}>Returning Member Check — {raw}</div>
                                <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.6 }}>{check.details}</div>
                                {j4StatusLine}
                            </div>
                        )
                    })()}

                    {/* Divider */}
                    <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 16 }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 14 }}>
                            Review
                        </div>
                        <div className='flex flex-col gap-3'>
                            <TextField
                                label='Notes'
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                multiline
                                minRows={2}
                                fullWidth
                                size='small'
                                inputProps={{ maxLength: 1000 }}
                                sx={inputSx}
                            />

                            {/* Recruiter assignment + decision — grouped */}
                            {app.status !== 'accepted' && app.status !== 'rejected' && (
                                <div style={{ border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.02)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                                    {/* Assign Recruiter form — only shown in assign mode (J1 Lead) */}
                                    {isLead && assigningMode && (
                                        <div>
                                            <div className='flex items-center gap-2'>
                                                <Autocomplete
                                                    size='small'
                                                    options={members}
                                                    value={recruiter}
                                                    onChange={(_, val) => setRecruiter(val)}
                                                    getOptionLabel={m => m.displayName + (m.inGameName ? ` (${m.inGameName})` : '')}
                                                    getOptionKey={m => m.id}
                                                    isOptionEqualToValue={(a, b) => a.id === b.id}
                                                    renderInput={params => (
                                                        <TextField {...params} label='Recruiter (J1 member)' placeholder='Search by display name...' sx={inputSx} />
                                                    )}
                                                    noOptionsText={<span style={{ fontSize: '0.8rem' }}>No members found</span>}
                                                    sx={{ flex: 1, maxWidth: 320 }}
                                                    ListboxProps={{ style: { fontSize: '0.82rem' } }}
                                                />
                                                {recruiter && (
                                                    <button
                                                        onClick={() => setRecruiter(null)}
                                                        title='Remove recruiter'
                                                        style={{ background: 'transparent', border: '1px solid var(--line-2)', cursor: 'pointer', color: 'rgba(237,237,237,0.4)', padding: '6px 8px', display: 'flex', alignItems: 'center' }}
                                                    >
                                                        <LinkOff style={{ fontSize: 16 }} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* New assignment: deadline + notification notice */}
                                            {recruiter && recruiter.id !== app.assignedReviewerId && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                                                    <div style={{ fontSize: '0.72rem', color: '#f59e0b' }}>
                                                        ● Will assign <strong>{recruiter.displayName}</strong> — they'll receive a task notification
                                                    </div>
                                                    <div className='flex flex-wrap items-center gap-2'>
                                                        <FormControl size='small' sx={{ ...inputSx, minWidth: 160 }}>
                                                            <InputLabel>Review deadline</InputLabel>
                                                            <Select
                                                                value={reviewDeadline}
                                                                label='Review deadline'
                                                                onChange={e => { setReviewDeadline(e.target.value as string); setReviewCustomDate('') }}
                                                            >
                                                                <MenuItem value='24'>24 hours</MenuItem>
                                                                <MenuItem value='48'>48 hours</MenuItem>
                                                                <MenuItem value='72'>72 hours</MenuItem>
                                                                <MenuItem value='120'>5 days</MenuItem>
                                                                <MenuItem value='168'>7 days</MenuItem>
                                                                <MenuItem value='custom'>Custom…</MenuItem>
                                                            </Select>
                                                        </FormControl>
                                                        {reviewDeadline === 'custom' && (
                                                            <input
                                                                type='datetime-local'
                                                                value={reviewCustomDate}
                                                                onChange={e => setReviewCustomDate(e.target.value)}
                                                                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                                                                style={{
                                                                    background: 'rgba(255,255,255,0.04)',
                                                                    border: '1px solid var(--line-2)',
                                                                    color: 'rgba(237,237,237,0.85)',
                                                                    padding: '7px 10px',
                                                                    fontSize: '0.82rem',
                                                                    outline: 'none',
                                                                    borderRadius: 0,
                                                                    colorScheme: 'dark',
                                                                    cursor: 'pointer',
                                                                }}
                                                            />
                                                        )}
                                                    </div>
                                                    {reviewDeadline === 'custom' && !reviewCustomDate && (
                                                        <div style={{ fontSize: '0.68rem', color: 'rgba(219,0,29,0.8)' }}>
                                                            Select a custom date and time for the review deadline.
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Note for recruiter — in assign mode */}
                                            <TextField
                                                label='Note for recruiter (optional)'
                                                value={recruiterNote}
                                                onChange={e => setRecruiterNote(e.target.value)}
                                                multiline
                                                minRows={2}
                                                fullWidth
                                                size='small'
                                                placeholder='Add a note for the recruiter...'
                                                inputProps={{ maxLength: 500 }}
                                                sx={inputSx}
                                            />
                                        </div>
                                    )}

                                    {/* Current assignment info — shown outside assign mode */}
                                    {isLead && !assigningMode && app.assignedReviewerName && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)' }}>
                                                Assigned recruiter: <strong style={{ color: '#f59e0b' }}>{app.assignedReviewerName}</strong>
                                                {app.assignedByLeadName && <span style={{ color: 'rgba(237,237,237,0.2)' }}> (assigned by {app.assignedByLeadName})</span>}
                                            </div>
                                            {/* Note field for send back — always visible to lead when a recruiter is assigned */}
                                            <TextField
                                                label='Note for recruiter (required to send back)'
                                                value={recruiterNote}
                                                onChange={e => setRecruiterNote(e.target.value)}
                                                multiline
                                                minRows={2}
                                                fullWidth
                                                size='small'
                                                placeholder='Enter a note for the recruiter (required to send back for review)...'
                                                inputProps={{ maxLength: 500 }}
                                                sx={inputSx}
                                            />
                                        </div>
                                    )}

                                    {/* Show assigned recruiter info to non-leads */}
                                    {!isLead && app.assignedReviewerName && (
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)' }}>
                                            Assigned recruiter: <span style={{ color: '#f59e0b' }}>{app.assignedReviewerName}</span>
                                        </div>
                                    )}

                                    {/* Action Required banner — shown to recruiter when application is returned */}
                                    {isAssignedRecruiter && !isLead && app.status === 'returned' && (
                                        <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.35)', borderLeft: '3px solid #f59e0b', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                <Warning style={{ fontSize: 15, color: '#f59e0b', flexShrink: 0 }} />
                                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f59e0b' }}>Action Required — Sent Back for Review</div>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.6 }}>
                                                A J1 lead has reviewed this application and sent it back. Review the note below, make any necessary changes, then resubmit.
                                            </div>
                                            {app.recruiterNote && (
                                                <div style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.78rem', color: 'rgba(237,237,237,0.75)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                                    {app.recruiterNote}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Action buttons — context-sensitive based on role and application state */}
                                    {(() => {
                                        const hasRecruiter = !!app.assignedReviewerId
                                        const j4Override = !hasRecruiter && isJ4 && !isLead
                                        const dividerStyle: React.CSSProperties = { borderTop: '1px solid var(--line-2)', paddingTop: 10, marginTop: 4 }
                                        const btnBase: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '7px 18px', cursor: 'pointer' }

                                        // Recruiter resubmit (returned status only)
                                        if (isAssignedRecruiter && !isLead && app.status === 'returned') {
                                            return (
                                                <div style={dividerStyle}>
                                                    <button
                                                        onClick={handleResubmit}
                                                        disabled={statusChanging}
                                                        style={{ ...btnBase, background: 'rgba(0,195,255,0.1)', border: '1px solid rgba(0,195,255,0.35)', color: '#00c3ff', opacity: statusChanging ? 0.5 : 1 }}
                                                    >
                                                        ↩ Resubmit to J1 Lead
                                                    </button>
                                                </div>
                                            )
                                        }

                                        // Assign Recruiter mode (lead)
                                        if (isLead && assigningMode) {
                                            const canAssign = !!recruiter && (reviewDeadline !== 'custom' || !!reviewCustomDate)
                                            return (
                                                <div style={dividerStyle}>
                                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 10 }}>
                                                        Assign Recruiter
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                                        <button
                                                            onClick={() => { if (canAssign) handleSave() }}
                                                            disabled={saving || !canAssign}
                                                            style={{ ...btnBase, background: 'rgba(0,120,255,0.15)', border: '1px solid rgba(0,120,255,0.4)', color: '#60a5fa', cursor: canAssign && !saving ? 'pointer' : 'not-allowed', opacity: saving || !canAssign ? 0.45 : 1 }}
                                                        >
                                                            {saving ? '…' : '✓ Assign Recruiter'}
                                                        </button>
                                                        <button
                                                            onClick={() => { setAssigningMode(false); setRecruiter(app.assignedReviewerId ? (members.find(m => m.id === app.assignedReviewerId) ?? null) : null) }}
                                                            disabled={saving}
                                                            style={{ ...btnBase, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.5)', opacity: saving ? 0.5 : 1 }}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        }

                                        // J4 returning-member review panel (shown to J4 when pending)
                                        if (isJ4 && isJ4ReviewPending) {
                                            return (
                                                <div style={dividerStyle}>
                                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#f59e0b', marginBottom: 8 }}>
                                                        J4 Review Required
                                                    </div>
                                                    <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.6)', marginBottom: 10, lineHeight: 1.6 }}>
                                                        A prior record was found for this applicant. Review the details above and approve or reject their history.
                                                    </div>
                                                    <TextField
                                                        label='Note (optional)'
                                                        value={j4DecisionNote}
                                                        onChange={e => setJ4DecisionNote(e.target.value)}
                                                        size='small'
                                                        fullWidth
                                                        multiline
                                                        minRows={2}
                                                        inputProps={{ maxLength: 500 }}
                                                        sx={inputSx}
                                                    />
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                                                        <button
                                                            onClick={() => handleJ4Decision('approved')}
                                                            disabled={j4Deciding}
                                                            style={{ ...btnBase, background: 'rgba(0,195,100,0.15)', border: '1px solid rgba(0,195,100,0.4)', color: '#00c364', opacity: j4Deciding ? 0.5 : 1 }}
                                                        >
                                                            ✓ Approve — Allow to Proceed
                                                        </button>
                                                        <button
                                                            onClick={() => handleJ4Decision('rejected')}
                                                            disabled={j4Deciding}
                                                            style={{ ...btnBase, background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.4)', color: 'var(--red)', opacity: j4Deciding ? 0.5 : 1 }}
                                                        >
                                                            ✗ Reject — Deny Application
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        }

                                        // Recruiter locked — DD J4 review in progress
                                        if (recruiterLocked) {
                                            return (
                                                <div style={dividerStyle}>
                                                    <div style={{ padding: '10px 14px', background: 'rgba(219,0,29,0.07)', border: '1px solid rgba(219,0,29,0.35)', borderLeft: '3px solid var(--red)', fontSize: '0.78rem', color: 'var(--red)' }}>
                                                        ⛔ J4 review required — this applicant has a Dishonourable Discharge on record. You cannot submit a recommendation until J4 approves or rejects their history.
                                                    </div>
                                                </div>
                                            )
                                        }

                                        // Recruiter recommendation panel (assigned non-lead)
                                        if (isAssignedRecruiter && !isLead) {
                                            const gdNotifyBanner = returningStatus === 'GD' && !(app as any).j4GDNotified && (
                                                <div style={{ padding: '8px 12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', borderLeft: '3px solid #f59e0b', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                                    <div style={{ fontSize: '0.74rem', color: '#f59e0b', lineHeight: 1.5 }}>
                                                        This applicant has a General Discharge. You may continue, but can optionally notify J4.
                                                    </div>
                                                    <button
                                                        onClick={handleNotifyJ4Optional}
                                                        disabled={notifyingJ4}
                                                        style={{ ...btnBase, fontSize: '0.65rem', padding: '5px 12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b', flexShrink: 0, opacity: notifyingJ4 ? 0.5 : 1, cursor: notifyingJ4 ? 'not-allowed' : 'pointer' }}
                                                    >
                                                        {notifyingJ4 ? '…' : 'Notify J4 (Optional)'}
                                                    </button>
                                                </div>
                                            )
                                            if (app.recruiterRecommendation) {
                                                const recLabel = app.recruiterRecommendation === 'approve' ? 'APPROVE' : app.recruiterRecommendation === 'deny' ? 'DENY' : 'PEND'
                                                const recColor = app.recruiterRecommendation === 'approve' ? '#00c364' : app.recruiterRecommendation === 'deny' ? 'var(--red)' : '#f59e0b'
                                                return (
                                                    <div style={dividerStyle}>
                                                        {gdNotifyBanner}
                                                        <div style={{ padding: '10px 14px', background: 'rgba(0,195,100,0.04)', border: '1px solid rgba(0,195,100,0.2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                            <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.5)' }}>
                                                                Your recommendation: <span style={{ fontWeight: 700, color: recColor }}>{recLabel}</span>
                                                                {' '}<span style={{ color: 'rgba(237,237,237,0.3)' }}>— Awaiting J1 Lead final decision</span>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 6 }}>
                                                                {(['approve', 'deny', 'pend'] as const).map(r => (
                                                                    <button
                                                                        key={r}
                                                                        onClick={() => handleRecommend(r)}
                                                                        disabled={statusChanging || app.recruiterRecommendation === r}
                                                                        style={{ ...btnBase, fontSize: '0.65rem', padding: '5px 12px', background: app.recruiterRecommendation === r ? 'rgba(255,255,255,0.08)' : 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.5)', cursor: app.recruiterRecommendation === r ? 'default' : 'pointer', opacity: statusChanging ? 0.5 : 1 }}
                                                                    >
                                                                        {r === 'approve' ? '✓ Approve' : r === 'deny' ? '✗ Deny' : '⏸ Pend'}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            }
                                            return (
                                                <div style={dividerStyle}>
                                                    {gdNotifyBanner}
                                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 8 }}>
                                                        Submit Recommendation
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        <button
                                                            onClick={() => handleRecommend('approve')}
                                                            disabled={statusChanging}
                                                            style={{ ...btnBase, background: 'rgba(0,195,100,0.15)', border: '1px solid rgba(0,195,100,0.4)', color: '#00c364', opacity: statusChanging ? 0.5 : 1 }}
                                                        >
                                                            ✓ Recommend Approve
                                                        </button>
                                                        <button
                                                            onClick={() => handleRecommend('deny')}
                                                            disabled={statusChanging}
                                                            style={{ ...btnBase, background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.4)', color: 'var(--red)', opacity: statusChanging ? 0.5 : 1 }}
                                                        >
                                                            ✗ Recommend Deny
                                                        </button>
                                                        <button
                                                            onClick={() => handleRecommend('pend')}
                                                            disabled={statusChanging}
                                                            style={{ ...btnBase, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', opacity: statusChanging ? 0.5 : 1 }}
                                                        >
                                                            ⏸ Pend (flag for lead)
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        }

                                        // J4 direct override (no recruiter assigned)
                                        if (j4Override) {
                                            return (
                                                <div style={dividerStyle}>
                                                    <div style={{ fontSize: '0.65rem', color: '#f59e0b', marginBottom: 8, letterSpacing: '0.05em' }}>
                                                        ⚠ No recruiter assigned — J4 override
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        <button onClick={() => handleStatusChange('accepted')} disabled={statusChanging} style={{ ...btnBase, background: 'rgba(0,195,100,0.15)', border: '1px solid rgba(0,195,100,0.4)', color: '#00c364', opacity: statusChanging ? 0.5 : 1 }}>✓ Approve</button>
                                                        <button onClick={() => handleStatusChange('rejected')} disabled={statusChanging} style={{ ...btnBase, background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.4)', color: 'var(--red)', opacity: statusChanging ? 0.5 : 1 }}>✗ Reject</button>
                                                    </div>
                                                </div>
                                            )
                                        }

                                        // J1 Lead final decision panel
                                        if (isLead) {
                                            return (
                                                <div style={dividerStyle}>
                                                    {app.recruiterRecommendation && (
                                                        <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 10, fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)' }}>
                                                            Recruiter recommends:{' '}
                                                            <span style={{ fontWeight: 700, color: app.recruiterRecommendation === 'approve' ? '#00c364' : app.recruiterRecommendation === 'deny' ? 'var(--red)' : '#f59e0b' }}>
                                                                {app.recruiterRecommendation.toUpperCase()}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        <button onClick={() => handleStatusChange('accepted')} disabled={statusChanging} style={{ ...btnBase, background: 'rgba(0,195,100,0.15)', border: '1px solid rgba(0,195,100,0.4)', color: '#00c364', opacity: statusChanging ? 0.5 : 1 }}>✓ Accept</button>
                                                        <button onClick={() => handleStatusChange('rejected')} disabled={statusChanging} style={{ ...btnBase, background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.4)', color: 'var(--red)', opacity: statusChanging ? 0.5 : 1 }}>✗ Reject</button>
                                                        <button onClick={() => setAssigningMode(true)} style={{ ...btnBase, background: 'rgba(0,120,255,0.1)', border: '1px solid rgba(0,120,255,0.35)', color: '#60a5fa' }}>＋ Assign Recruiter</button>
                                                        {hasRecruiter && (
                                                            <button
                                                                onClick={handleSendBack}
                                                                disabled={statusChanging || !recruiterNote.trim()}
                                                                title={!recruiterNote.trim() ? 'Enter a note for the recruiter before sending back' : 'Send back to recruiter for review'}
                                                                style={{ ...btnBase, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b', cursor: !recruiterNote.trim() ? 'not-allowed' : 'pointer', opacity: statusChanging || !recruiterNote.trim() ? 0.45 : 1 }}
                                                            >
                                                                ↩ Send Back
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        }

                                        return null
                                    })()}
                                </div>
                            )}

                            {/* Discord linking */}
                            <div>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 8 }}>
                                    Link Discord Account
                                </div>

                                {linkedMember ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(0,195,100,0.04)', border: '1px solid rgba(0,195,100,0.2)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)' }}>{linkedMember.displayName}</span>
                                                {linkedMember.username && (
                                                    <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)' }}>@{linkedMember.username}</span>
                                                )}
                                                {linkedMember.discharged && (
                                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 5px' }}>DISCHARGED</span>
                                                )}
                                                {linkedMember.isSkeleton && (
                                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.35)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '1px 5px' }}>CSV</span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: 12, fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)' }}>
                                                <span style={{ fontFamily: 'monospace' }}>{linkedMember.id}</span>
                                                {linkedMember.inGameName && (
                                                    <span>In-game: <strong style={{ color: 'rgba(237,237,237,0.5)' }}>{linkedMember.inGameName}</strong></span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setLinkedMember(null)}
                                            title='Unlink'
                                            disabled={app.status === 'accepted' || app.status === 'rejected'}
                                            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', cursor: app.status === 'accepted' || app.status === 'rejected' ? 'default' : 'pointer', color: 'rgba(237,237,237,0.35)', padding: '5px 8px', display: 'flex', alignItems: 'center', flexShrink: 0, opacity: app.status === 'accepted' || app.status === 'rejected' ? 0.3 : 1 }}
                                        >
                                            <LinkOff style={{ fontSize: 15 }} />
                                        </button>
                                    </div>
                                ) : (
                                    <Autocomplete
                                        size='small'
                                        options={members}
                                        value={linkedMember}
                                        onChange={(_, val) => setLinkedMember(val)}
                                        getOptionLabel={m => m.displayName + (m.username ? ` @${m.username}` : '') + (m.inGameName ? ` (${m.inGameName})` : '')}
                                        getOptionKey={m => m.id}
                                        isOptionEqualToValue={(a, b) => a.id === b.id}
                                        filterOptions={(options, { inputValue }) => {
                                            const q = inputValue.toLowerCase().trim()
                                            if (!q) return options
                                            return options.filter(o =>
                                                o.displayName.toLowerCase().includes(q) ||
                                                (o.username && o.username.toLowerCase().includes(q)) ||
                                                o.id.includes(q) ||
                                                (o.inGameName && o.inGameName.toLowerCase().includes(q))
                                            )
                                        }}
                                        renderOption={(props, option) => {
                                            const { key, ...liProps } = props
                                            return (
                                                <li key={option.id} {...liProps} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', padding: '6px 12px' }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span>{option.displayName}</span>
                                                            {option.username && (
                                                                <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)' }}>@{option.username}</span>
                                                            )}
                                                            {option.discharged && (
                                                                <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 4px' }}>DISCHARGED</span>
                                                            )}
                                                            {option.isSkeleton && (
                                                                <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.35)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '1px 4px' }}>CSV</span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.2)', fontFamily: 'monospace', marginTop: 1 }}>{option.id}</div>
                                                    </div>
                                                    {option.inGameName && (
                                                        <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.35)', fontFamily: 'monospace', flexShrink: 0 }}>{option.inGameName}</span>
                                                    )}
                                                </li>
                                            )
                                        }}
                                        renderInput={params => (
                                            <TextField {...params} label='Search Discord member' placeholder='Name, @username, or Discord ID...' sx={inputSx} />
                                        )}
                                        noOptionsText={<span style={{ fontSize: '0.8rem' }}>No members found</span>}
                                        fullWidth
                                        PaperComponent={({ children, ...props }) => (
                                            <div {...props as React.HTMLAttributes<HTMLDivElement>} style={{ background: '#1a1a1a', border: '1px solid var(--line-2)', borderRadius: 0, marginTop: 2 }}>
                                                {children}
                                            </div>
                                        )}
                                    />
                                )}
                            </div>

                            <div className='flex items-center gap-3 mt-1'>
                                <Button
                                    variant='contained'
                                    size='small'
                                    onClick={handleSave}
                                    disabled={saving}
                                    sx={{ borderRadius: 0, background: 'var(--red)', fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.72rem', '&:hover': { background: 'rgba(219,0,29,0.85)' }, '&.Mui-disabled': { background: 'rgba(219,0,29,0.42)' } }}
                                >
                                    {saving ? <CircularProgress size={12} color='inherit' /> : 'SAVE'}
                                </Button>
                                {saved && <span style={{ fontSize: '0.75rem', color: '#00c364' }}>Saved</span>}
                                {app.reviewedBy && (
                                    <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', marginLeft: 'auto' }}>
                                        Last reviewed by {app.reviewedBy} on {formatDate(app.reviewedAt!)}
                                    </span>
                                )}
                            </div>

                            <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)', marginTop: 2 }}>
                                Submitted {formatDate(app.submittedAt)}
                            </div>

                            {isJ4 && (
                                <div style={{ marginTop: 8, borderTop: '1px solid rgba(239,68,68,0.15)', paddingTop: 12 }}>
                                    {!confirmDelete ? (
                                        <button
                                            type='button'
                                            onClick={() => setConfirmDelete(true)}
                                            style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(239,68,68,0.5)', background: 'none', border: '1px solid rgba(239,68,68,0.2)', padding: '4px 12px', cursor: 'pointer' }}
                                        >
                                            Delete Application
                                        </button>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ fontSize: '0.72rem', color: 'rgba(239,68,68,0.7)' }}>Permanently delete this application?</span>
                                            <button
                                                type='button'
                                                onClick={handleDelete}
                                                disabled={deleting}
                                                style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', background: '#ef4444', border: 'none', padding: '4px 12px', cursor: 'pointer' }}
                                            >
                                                {deleting ? 'Deleting...' : 'Confirm Delete'}
                                            </button>
                                            <button
                                                type='button'
                                                onClick={() => setConfirmDelete(false)}
                                                style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

const PAGE_SIZE = 50

export default function ApplicationsTab({ isJ4 = false, isLead = false, userId = '' }: { isJ4?: boolean; isLead?: boolean; userId?: string }) {
    const [applications, setApplications] = useState<Application[]>([])
    const [members, setMembers] = useState<DiscordMember[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState<Filter>('all')
    const [search, setSearch] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('submittedAt')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [page, setPage] = useState(0)
    const [selected, setSelected] = useState<Application | null>(null)

    const searchParams = useSearchParams()
    const deepLinkAppId = searchParams.get('app')
    const deepLinkHandled = useRef(false)

    const fetchApps = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [appsRes, membersRes] = await Promise.all([
                fetch('/api/admin/j1/applications'),
                fetch('/api/admin/j1/members'),
            ])
            if (!appsRes.ok) throw new Error('Failed to fetch applications')
            const appsData = await appsRes.json()
            setApplications(appsData.applications)
            if (membersRes.ok) {
                const membersData = await membersRes.json()
                setMembers(membersData.members)
            }
        } catch {
            setError('Failed to load applications.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchApps() }, [fetchApps])

    useEffect(() => {
        if (!deepLinkAppId || deepLinkHandled.current || applications.length === 0) return
        const target = applications.find(a => a._id === deepLinkAppId)
        if (target) {
            deepLinkHandled.current = true
            setFilter('all')
            setSelected(target)
        }
    }, [deepLinkAppId, applications])

    function handleUpdate(id: string, patch: Partial<Application>) {
        setApplications(prev => prev.map(a => a._id === id ? { ...a, ...patch } : a))
        if (selected?._id === id) setSelected(prev => prev ? { ...prev, ...patch } : null)
    }

    function handleDelete(id: string) {
        setApplications(prev => prev.filter(a => a._id !== id))
    }

    const nonAccepted = useMemo(() => applications.filter(a => a.status !== 'accepted'), [applications])

    const filtered = useMemo(() => {
        let list: Application[]
        if (filter === 'all') list = applications
        else if (filter === 'accepted') list = applications.filter(a => a.status === 'accepted')
        else list = nonAccepted.filter(a => a.status === filter)
        if (search.trim()) {
            const q = search.toLowerCase()
            list = list.filter(a =>
                a.discordUsername.toLowerCase().includes(q) ||
                a.inGameName.toLowerCase().includes(q)
            )
        }
        return [...list].sort((a, b) => {
            let av: string | number, bv: string | number
            if (sortKey === 'submittedAt') {
                av = new Date(a.submittedAt).getTime()
                bv = new Date(b.submittedAt).getTime()
            } else {
                av = (a[sortKey] as string ?? '').toLowerCase()
                bv = (b[sortKey] as string ?? '').toLowerCase()
            }
            if (av < bv) return sortDir === 'asc' ? -1 : 1
            if (av > bv) return sortDir === 'asc' ? 1 : -1
            return 0
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applications is captured transitively via nonAccepted
    }, [nonAccepted, filter, search, sortKey, sortDir])

    const counts = (['pending', 'reviewing', 'returned', 'accepted', 'rejected'] as const).reduce(
        (acc, s) => ({ ...acc, [s]: applications.filter(a => a.status === s).length }), {} as Record<string, number>
    )

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
    const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

    function toggleSort(key: SortKey) {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSortKey(key); setSortDir('asc') }
        setPage(0)
    }

    function handleFilterChange(f: Filter) {
        setFilter(f)
        setPage(0)
    }

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return <UnfoldMore style={{ fontSize: 13, opacity: 0.3, verticalAlign: 'middle' }} />
        return sortDir === 'asc'
            ? <ArrowUpward style={{ fontSize: 13, opacity: 0.7, verticalAlign: 'middle' }} />
            : <ArrowDownward style={{ fontSize: 13, opacity: 0.7, verticalAlign: 'middle' }} />
    }

    const inputSx = {
        '& .MuiOutlinedInput-root': {
            borderRadius: 0,
            fontSize: '0.8rem',
            height: 34,
            '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
            '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.22)' },
            '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
        },
        '& .MuiInputLabel-root': { fontSize: '0.8rem' },
    }

    return (
        <div className='flex flex-col gap-0'>
            {/* Filter bar */}
            <div className='flex items-center gap-0 flex-wrap px-4 pt-4 pb-0'>
                {FILTERS.map(f => (
                    <button
                        key={f}
                        onClick={() => handleFilterChange(f)}
                        style={{
                            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', padding: '6px 14px',
                            textTransform: 'uppercase', cursor: 'pointer', border: 'none',
                            borderBottom: filter === f ? '2px solid var(--red)' : '2px solid transparent',
                            background: filter === f ? 'rgba(219,0,29,0.06)' : 'transparent',
                            color: filter === f ? 'var(--foreground)' : 'rgba(237,237,237,0.45)',
                            transition: 'all 0.15s',
                        }}
                    >
                        {f === 'all' ? `All (${applications.length})` : `${f} (${counts[f] ?? 0})`}
                    </button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TextField
                        placeholder='Search name...'
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(0) }}
                        size='small'
                        sx={{ ...inputSx, width: 200 }}
                        InputProps={{
                            startAdornment: <InputAdornment position='start'><Search style={{ fontSize: 15, color: 'rgba(237,237,237,0.3)' }} /></InputAdornment>,
                        }}
                    />
                    <button
                        onClick={fetchApps}
                        title='Refresh'
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(237,237,237,0.4)', padding: '4px 8px', display: 'flex', alignItems: 'center' }}
                    >
                        <Refresh style={{ fontSize: 18 }} />
                    </button>
                </div>
            </div>

            {/* Column headers */}
            <div className='grid gap-3 px-4 py-2 mx-4 mt-3' style={{ gridTemplateColumns: '1fr 1fr 40px 80px 1fr 100px', borderBottom: '1px solid var(--line-2)' }}>
                {([
                    { label: 'Discord', key: 'discordUsername' },
                    { label: 'In-Game Name', key: 'inGameName' },
                    { label: 'Age', key: null },
                    { label: 'Status', key: 'status' },
                    { label: 'Submitted', key: 'submittedAt' },
                    { label: 'Reviewer', key: null },
                ] as { label: string; key: SortKey | null }[]).map(({ label, key }) => (
                    <button
                        key={label}
                        onClick={key ? () => toggleSort(key) : undefined}
                        style={{
                            background: 'none', border: 'none', cursor: key ? 'pointer' : 'default',
                            textAlign: 'left', padding: 0,
                            fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2,
                            textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)',
                            display: 'flex', alignItems: 'center', gap: 3,
                        }}
                    >
                        {label}
                        {key && <SortIcon col={key} />}
                    </button>
                ))}
            </div>

            {/* Content */}
            {loading ? (
                <TacticalSkeleton rows={6} className='px-4' />
            ) : error ? (
                <div className='px-4 py-4'>
                    <Alert severity='error' sx={{ borderRadius: 0 }}>{error}</Alert>
                </div>
            ) : filtered.length === 0 ? (
                <div className='flex flex-col items-center py-12 gap-2'>
                    <Typography style={{ fontSize: '0.85rem', color: 'rgba(237,237,237,0.3)' }}>
                        No {filter === 'all' ? '' : filter} applications found.
                    </Typography>
                </div>
            ) : (
                <>
                    {paginated.map(app => (
                        <div
                            key={app._id}
                            className='grid gap-3 px-4 py-3 cursor-pointer transition-colors'
                            style={{ gridTemplateColumns: '1fr 1fr 40px 80px 1fr 100px', borderBottom: '1px solid var(--line-2)' }}
                            onClick={() => setSelected(app)}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {app.discordUsername}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {app.inGameName}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.5)' }}>
                                {app.age || '—'}
                            </span>
                            <Chip
                                label={app.status.toUpperCase()}
                                color={STATUS_COLORS[app.status] || 'default'}
                                size='small'
                                sx={{ borderRadius: 0, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em', height: 20 }}
                            />
                            <div className='flex items-center gap-2'>
                                <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)' }}>
                                    {formatDate(app.submittedAt)}
                                </span>
                                {app.isDirectRecruit && (
                                    <span style={{ color: '#00c3ff', fontSize: '0.65rem' }}>[DIRECT]</span>
                                )}
                                {app.linkedUserId && (
                                    <LinkIcon style={{ fontSize: 14, color: '#00c364' }} titleAccess={`Linked: ${app.linkedUserDisplayName}`} />
                                )}
                                {app.j4ReviewStatus === 'pending' && (
                                    <span title='J4 review pending' style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', padding: '1px 5px' }}>J4</span>
                                )}
                                {(() => {
                                    const rs = (app.returningMemberCheck as any)?.status as string | undefined
                                    const st = rs === 'YES' ? 'CLEAR' : rs === 'REVIEW' ? 'GD' : rs
                                    if (!st || st === 'CLEAR') return null
                                    const c = st === 'HD'
                                        ? { bg: 'rgba(0,120,255,0.1)', border: 'rgba(0,120,255,0.35)', text: '#60a5fa' }
                                        : st === 'DD'
                                        ? { bg: 'rgba(219,0,29,0.1)', border: 'rgba(219,0,29,0.4)', text: 'var(--red)' }
                                        : { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.35)', text: '#f59e0b' }
                                    return <span title={`Returning member: ${st}`} style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: c.text, background: c.bg, border: `1px solid ${c.border}`, padding: '1px 5px' }}>{st}</span>
                                })()}
                                {app.recruiterRecommendation && !app.j4ReviewStatus && (
                                    <span title={`Recruiter: ${app.recruiterRecommendation}`} style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: app.recruiterRecommendation === 'approve' ? '#00c364' : app.recruiterRecommendation === 'deny' ? 'var(--red)' : '#f59e0b', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', padding: '1px 5px' }}>REC</span>
                                )}
                                {app.returningMemberCheck?.status === 'YES' && (
                                    <span title='Returning member' style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: '#00c364', background: 'rgba(0,195,100,0.12)', border: '1px solid rgba(0,195,100,0.35)', padding: '1px 5px' }}>RTN</span>
                                )}
                                {app.returningMemberCheck?.status === 'REVIEW' && (
                                    <span title='Returning member — J4 review required' style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', padding: '1px 5px' }}>RTN</span>
                                )}
                            </div>
                            <span style={{ fontSize: '0.7rem', color: app.assignedReviewerName ? 'rgba(245,158,11,0.8)' : 'rgba(237,237,237,0.2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {app.assignedReviewerName ?? '—'}
                            </span>
                        </div>
                    ))}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className='flex items-center justify-between px-4 py-3' style={{ borderTop: '1px solid var(--line-2)' }}>
                            <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)' }}>
                                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                            </span>
                            <div className='flex items-center gap-1'>
                                <button
                                    onClick={() => setPage(p => p - 1)}
                                    disabled={page === 0}
                                    style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', background: 'transparent', border: '1px solid var(--line-2)', color: page === 0 ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.6)', cursor: page === 0 ? 'default' : 'pointer' }}
                                >
                                    ‹ Prev
                                </button>
                                {Array.from({ length: totalPages }, (_, i) => i)
                                    .filter(i => i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1)
                                    .reduce<(number | '...')[]>((acc, i, idx, arr) => {
                                        if (idx > 0 && (i as number) - (arr[idx - 1] as number) > 1) acc.push('...')
                                        acc.push(i)
                                        return acc
                                    }, [])
                                    .map((item, idx) => item === '...' ? (
                                        <span key={`ellipsis-${idx}`} style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', padding: '0 4px' }}>…</span>
                                    ) : (
                                        <button
                                            key={item}
                                            onClick={() => setPage(item as number)}
                                            style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 8px', minWidth: 30, background: page === item ? 'rgba(219,0,29,0.42)' : 'transparent', border: '1px solid', borderColor: page === item ? 'var(--red)' : 'rgba(219,0,29,0.32)', color: page === item ? 'var(--foreground)' : 'rgba(237,237,237,0.5)', cursor: 'pointer' }}
                                        >
                                            {(item as number) + 1}
                                        </button>
                                    ))
                                }
                                <button
                                    onClick={() => setPage(p => p + 1)}
                                    disabled={page === totalPages - 1}
                                    style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', background: 'transparent', border: '1px solid var(--line-2)', color: page === totalPages - 1 ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.6)', cursor: page === totalPages - 1 ? 'default' : 'pointer' }}
                                >
                                    Next ›
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Modal */}
            {selected && (
                <ApplicationModal
                    app={selected}
                    members={members}
                    isJ4={isJ4}
                    isLead={isLead}
                    userId={userId}
                    onClose={() => setSelected(null)}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                />
            )}
        </div>
    )
}
