'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    Chip, CircularProgress, Alert, Button,
    TextField, Select, MenuItem, FormControl, InputLabel,
    Dialog, DialogContent, DialogTitle, IconButton, Autocomplete,
    InputAdornment,
} from '@mui/material'
import {
    Refresh, LinkOff, Link as LinkIcon, Close,
    Search, ArrowUpward, ArrowDownward, UnfoldMore,
} from '@mui/icons-material'
import { Typography } from '@mui/material'
import TacticalSkeleton from '@/app/admin/_components/TacticalSkeleton'

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
}

const FILTERS = ['all', 'pending', 'reviewing', 'accepted', 'rejected'] as const
type Filter = typeof FILTERS[number]

type SortKey = 'discordUsername' | 'inGameName' | 'submittedAt' | 'status'
type SortDir = 'asc' | 'desc'

function formatDate(date: string | Date) {
    return new Date(date).toLocaleDateString('en-AU', {
        day: '2-digit', month: 'short', year: 'numeric',
    })
}

function ApplicationModal({ app, members, isJ4, onClose, onUpdate, onDelete }: {
    app: Application
    members: DiscordMember[]
    isJ4: boolean
    onClose: () => void
    onUpdate: (id: string, patch: Partial<Application>) => void
    onDelete: (id: string) => void
}) {
    const [status, setStatus] = useState(app.status)
    const [notes, setNotes] = useState(app.notes || '')
    const [linkedMember, setLinkedMember] = useState<DiscordMember | null>(
        app.linkedUserId ? (members.find(m => m.id === app.linkedUserId) ?? null) : null
    )
    const [reviewer, setReviewer] = useState<DiscordMember | null>(
        app.assignedReviewerId ? (members.find(m => m.id === app.assignedReviewerId) ?? null) : null
    )
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [deleting, setDeleting] = useState(false)

    useEffect(() => {
        if (app.linkedUserId && members.length > 0) {
            setLinkedMember(members.find(m => m.id === app.linkedUserId) ?? null)
        }
        if (app.assignedReviewerId && members.length > 0) {
            setReviewer(members.find(m => m.id === app.assignedReviewerId) ?? null)
        }
    }, [members, app.linkedUserId, app.assignedReviewerId])

    async function handleSave() {
        setSaving(true)
        setSaved(false)
        try {
            await fetch(`/api/admin/j1/applications/${app._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status,
                    notes,
                    linkedUserId: linkedMember?.id ?? null,
                    linkedUserDisplayName: linkedMember?.displayName ?? null,
                    assignedReviewerId: reviewer?.id ?? null,
                    assignedReviewerName: reviewer?.displayName ?? null,
                }),
            })
            onUpdate(app._id, {
                status,
                notes,
                linkedUserId: linkedMember?.id,
                linkedUserDisplayName: linkedMember?.displayName,
                assignedReviewerId: reviewer?.id,
                assignedReviewerName: reviewer?.displayName,
            })
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        } finally {
            setSaving(false)
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
            <DialogTitle style={{ padding: '16px 20px', borderBottom: '1px solid rgba(219,0,29,0.22)' }}>
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
                        <Field label='Age' value={app.age || null} />
                        <Field label='Region' value={app.region} />
                        <Field label='ARMA 3 Hours' value={app.armaHours} />
                        <Field label='Available Nights' value={app.availableNights} />
                        <Field label='Ops Per Month' value={app.opsPerMonth} />
                        <Field label='Primary Role' value={app.primaryRole} />
                        <Field label='Owns ARMA 3' value={app.ownsArma ? 'Yes' : (app.ownsArma === false ? 'No' : null)} />
                        <Field label='Prior Milsim' value={app.priorMilsim ? 'Yes' : (app.priorMilsim === false ? 'No' : null)} />
                        <Field label='Dual Clan' value={app.dualClan ? 'Yes' : (app.dualClan === false ? 'No' : null)} />
                    </div>

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
                            <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.75)', whiteSpace: 'pre-wrap', lineHeight: 1.7, background: 'rgba(255,255,255,0.04)', padding: '10px 12px', border: '1px solid rgba(219,0,29,0.08)' }}>
                                {app.experience}
                            </div>
                        </div>
                    )}

                    {app.recruiter && (
                        <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)' }}>
                            Recruited by <span style={{ color: 'rgba(237,237,237,0.7)' }}>{app.recruiter}</span>
                        </div>
                    )}

                    {/* Divider */}
                    <div style={{ borderTop: '1px solid rgba(219,0,29,0.22)', paddingTop: 16 }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 14 }}>
                            Review
                        </div>
                        <div className='flex flex-col gap-3'>
                            <div className='grid grid-cols-1 md:grid-cols-[200px_1fr] gap-3 items-start'>
                                <FormControl size='small' sx={inputSx}>
                                    <InputLabel>Status</InputLabel>
                                    <Select
                                        value={status}
                                        label='Status'
                                        onChange={e => setStatus(e.target.value as Application['status'])}
                                    >
                                        <MenuItem value='pending'>Pending</MenuItem>
                                        <MenuItem value='reviewing'>Reviewing</MenuItem>
                                        <MenuItem value='accepted'>Accepted</MenuItem>
                                        <MenuItem value='rejected'>Rejected</MenuItem>
                                    </Select>
                                </FormControl>
                                <TextField
                                    label='Reviewer Notes'
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    multiline
                                    minRows={2}
                                    fullWidth
                                    size='small'
                                    inputProps={{ maxLength: 1000 }}
                                    sx={inputSx}
                                />
                            </div>

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
                                            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', color: 'rgba(237,237,237,0.35)', padding: '5px 8px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
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
                                            <div {...props as React.HTMLAttributes<HTMLDivElement>} style={{ background: '#1a1a1a', border: '1px solid rgba(219,0,29,0.32)', borderRadius: 0, marginTop: 2 }}>
                                                {children}
                                            </div>
                                        )}
                                    />
                                )}
                            </div>

                            {/* Assign reviewer */}
                            <div>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 8 }}>
                                    Assign Reviewer
                                </div>
                                <div className='flex items-center gap-2'>
                                    <Autocomplete
                                        size='small'
                                        options={members}
                                        value={reviewer}
                                        onChange={(_, val) => setReviewer(val)}
                                        getOptionLabel={m => m.displayName + (m.inGameName ? ` (${m.inGameName})` : '')}
                                        getOptionKey={m => m.id}
                                        isOptionEqualToValue={(a, b) => a.id === b.id}
                                        renderInput={params => (
                                            <TextField {...params} label='Reviewer (J1 member)' placeholder='Search by display name...' sx={inputSx} />
                                        )}
                                        noOptionsText={<span style={{ fontSize: '0.8rem' }}>No members found</span>}
                                        sx={{ flex: 1, maxWidth: 380 }}
                                        ListboxProps={{ style: { fontSize: '0.82rem' } }}
                                    />
                                    {reviewer && (
                                        <button
                                            onClick={() => setReviewer(null)}
                                            title='Remove reviewer'
                                            style={{ background: 'transparent', border: '1px solid rgba(219,0,29,0.32)', cursor: 'pointer', color: 'rgba(237,237,237,0.4)', padding: '6px 8px', display: 'flex', alignItems: 'center' }}
                                        >
                                            <LinkOff style={{ fontSize: 16 }} />
                                        </button>
                                    )}
                                </div>
                                {reviewer && reviewer.id !== app.assignedReviewerId && (
                                    <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: 6 }}>
                                        ● Will assign <strong>{reviewer.displayName}</strong> — they'll receive a task notification
                                    </div>
                                )}
                                {reviewer && reviewer.id === app.assignedReviewerId && (
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', marginTop: 6 }}>
                                        Currently assigned to <strong>{reviewer.displayName}</strong>
                                    </div>
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

export default function ApplicationsTab({ isJ4 = false }: { isJ4?: boolean }) {
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
    }, [nonAccepted, filter, search, sortKey, sortDir])

    const counts = (['pending', 'reviewing', 'accepted', 'rejected'] as const).reduce(
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
                        {f === 'all' ? `All (${nonAccepted.length})` : `${f} (${counts[f] ?? 0})`}
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
            <div className='grid gap-3 px-4 py-2 mx-4 mt-3' style={{ gridTemplateColumns: '1fr 1fr 40px 80px 1fr 100px', borderBottom: '1px solid rgba(219,0,29,0.42)' }}>
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
                            style={{ gridTemplateColumns: '1fr 1fr 40px 80px 1fr 100px', borderBottom: '1px solid rgba(219,0,29,0.08)' }}
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
                            </div>
                            <span style={{ fontSize: '0.7rem', color: app.assignedReviewerName ? 'rgba(245,158,11,0.8)' : 'rgba(237,237,237,0.2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {app.assignedReviewerName ?? '—'}
                            </span>
                        </div>
                    ))}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className='flex items-center justify-between px-4 py-3' style={{ borderTop: '1px solid rgba(219,0,29,0.22)' }}>
                            <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)' }}>
                                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                            </span>
                            <div className='flex items-center gap-1'>
                                <button
                                    onClick={() => setPage(p => p - 1)}
                                    disabled={page === 0}
                                    style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(219,0,29,0.32)', color: page === 0 ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.6)', cursor: page === 0 ? 'default' : 'pointer' }}
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
                                    style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(219,0,29,0.32)', color: page === totalPages - 1 ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.6)', cursor: page === totalPages - 1 ? 'default' : 'pointer' }}
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
                    onClose={() => setSelected(null)}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                />
            )}
        </div>
    )
}
