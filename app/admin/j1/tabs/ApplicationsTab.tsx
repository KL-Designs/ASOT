'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    Chip, CircularProgress, Alert, Button,
    TextField, Select, MenuItem, FormControl, InputLabel, Collapse,
    Autocomplete,
} from '@mui/material'
import { ExpandMore, ExpandLess, Refresh, LinkOff, Link as LinkIcon } from '@mui/icons-material'
import { Typography } from '@mui/material'

type Application = J1Application & { _id: string }

interface DiscordMember {
    id: string
    displayName: string
    inGameName: string | null
}

const STATUS_COLORS: Record<string, 'warning' | 'info' | 'success' | 'error' | 'default'> = {
    pending: 'warning',
    reviewing: 'info',
    accepted: 'success',
    rejected: 'error',
}

const FILTERS = ['all', 'pending', 'reviewing', 'accepted', 'rejected'] as const
type Filter = typeof FILTERS[number]

function formatDate(date: string | Date) {
    return new Date(date).toLocaleDateString('en-AU', {
        day: '2-digit', month: 'short', year: 'numeric',
    })
}

function ApplicationRow({ app, members, onUpdate }: {
    app: Application
    members: DiscordMember[]
    onUpdate: (id: string, patch: Partial<Application>) => void
}) {
    const [expanded, setExpanded] = useState(false)
    const [status, setStatus] = useState(app.status)
    const [notes, setNotes] = useState(app.notes || '')
    const [linkedMember, setLinkedMember] = useState<DiscordMember | null>(
        app.linkedUserId ? (members.find(m => m.id === app.linkedUserId) ?? null) : null
    )
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    // Keep linkedMember in sync once members list loads
    useEffect(() => {
        if (app.linkedUserId && members.length > 0) {
            setLinkedMember(members.find(m => m.id === app.linkedUserId) ?? null)
        }
    }, [members, app.linkedUserId])

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
                }),
            })
            onUpdate(app._id, {
                status,
                notes,
                linkedUserId: linkedMember?.id,
                linkedUserDisplayName: linkedMember?.displayName,
            })
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        } finally {
            setSaving(false)
        }
    }

    const inputSx = {
        '& .MuiOutlinedInput-root': {
            borderRadius: 0,
            fontSize: '0.8rem',
            '& fieldset': { borderColor: 'rgba(219,0,29,0.2)' },
            '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.4)' },
            '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
        },
        '& .MuiInputLabel-root': { fontSize: '0.8rem' },
        '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
        '& .MuiSelect-select': { fontSize: '0.8rem' },
    }

    return (
        <div style={{ borderBottom: '1px solid rgba(219,0,29,0.1)' }}>
            {/* Row */}
            <div
                className='flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors'
                style={{ background: expanded ? 'rgba(219,0,29,0.04)' : 'transparent' }}
                onClick={() => setExpanded(v => !v)}
                onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)' }}
                onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
                <div className='flex-1 min-w-0 grid grid-cols-[1fr_1fr_40px_80px_1fr] gap-3 items-center'>
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
                </div>
                <span style={{ color: 'rgba(237,237,237,0.3)', fontSize: 18, flexShrink: 0 }}>
                    {expanded ? <ExpandLess fontSize='small' /> : <ExpandMore fontSize='small' />}
                </span>
            </div>

            {/* Expanded detail */}
            <Collapse in={expanded}>
                <div className='flex flex-col gap-4 px-4 pb-4 pt-2' style={{ background: 'rgba(219,0,29,0.02)' }}>
                    {app.experience && (
                        <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 6 }}>
                                Experience
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.7)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                {app.experience}
                            </div>
                        </div>
                    )}

                    {app.recruiter && (
                        <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)' }}>
                            Recruited by <span style={{ color: 'rgba(237,237,237,0.7)' }}>{app.recruiter}</span>
                        </div>
                    )}

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

                    {/* Discord account linking */}
                    <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 8 }}>
                            Link Discord Account
                        </div>
                        <div className='flex items-center gap-2'>
                            <Autocomplete
                                size='small'
                                options={members}
                                value={linkedMember}
                                onChange={(_, val) => setLinkedMember(val)}
                                getOptionLabel={m => m.displayName + (m.inGameName ? ` (${m.inGameName})` : '')}
                                isOptionEqualToValue={(a, b) => a.id === b.id}
                                renderInput={params => (
                                    <TextField
                                        {...params}
                                        label='Discord Member'
                                        placeholder='Search by display name...'
                                        sx={inputSx}
                                    />
                                )}
                                noOptionsText={<span style={{ fontSize: '0.8rem' }}>No members found</span>}
                                sx={{ flex: 1, maxWidth: 380 }}
                                ListboxProps={{ style: { fontSize: '0.82rem' } }}
                            />
                            {linkedMember && (
                                <button
                                    onClick={() => setLinkedMember(null)}
                                    title='Unlink'
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid rgba(219,0,29,0.2)',
                                        cursor: 'pointer',
                                        color: 'rgba(237,237,237,0.4)',
                                        padding: '6px 8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                    }}
                                >
                                    <LinkOff style={{ fontSize: 16 }} />
                                </button>
                            )}
                        </div>
                        {linkedMember && (
                            <div style={{ fontSize: '0.72rem', color: '#00c364', marginTop: 6 }}>
                                ✓ Will be linked to <strong>{linkedMember.displayName}</strong>
                                {linkedMember.inGameName && ` — current in-game name: ${linkedMember.inGameName}`}
                            </div>
                        )}
                    </div>

                    <div className='flex items-center gap-3'>
                        <Button
                            variant='contained'
                            size='small'
                            onClick={handleSave}
                            disabled={saving}
                            sx={{
                                borderRadius: 0,
                                background: 'var(--red)',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                fontSize: '0.72rem',
                                '&:hover': { background: 'rgba(219,0,29,0.85)' },
                                '&.Mui-disabled': { background: 'rgba(219,0,29,0.3)' },
                            }}
                        >
                            {saving ? <CircularProgress size={12} color='inherit' /> : 'SAVE'}
                        </Button>
                        {saved && (
                            <span style={{ fontSize: '0.75rem', color: '#00c364' }}>Saved</span>
                        )}
                        {app.reviewedBy && (
                            <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', marginLeft: 'auto' }}>
                                Last reviewed by {app.reviewedBy} on {formatDate(app.reviewedAt!)}
                            </span>
                        )}
                    </div>
                </div>
            </Collapse>
        </div>
    )
}

export default function ApplicationsTab() {
    const [applications, setApplications] = useState<Application[]>([])
    const [members, setMembers] = useState<DiscordMember[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState<Filter>('all')

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
    }

    const filtered = filter === 'all' ? applications : applications.filter(a => a.status === filter)
    const counts = FILTERS.slice(1).reduce((acc, s) => ({ ...acc, [s]: applications.filter(a => a.status === s).length }), {} as Record<string, number>)

    return (
        <div className='flex flex-col gap-0'>
            {/* Filter bar */}
            <div className='flex items-center gap-0 flex-wrap px-4 pt-4 pb-0'>
                {FILTERS.map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            padding: '6px 14px',
                            textTransform: 'uppercase',
                            cursor: 'pointer',
                            border: 'none',
                            borderBottom: filter === f ? '2px solid var(--red)' : '2px solid transparent',
                            background: filter === f ? 'rgba(219,0,29,0.06)' : 'transparent',
                            color: filter === f ? 'var(--foreground)' : 'rgba(237,237,237,0.45)',
                            transition: 'all 0.15s',
                        }}
                    >
                        {f === 'all' ? `All (${applications.length})` : `${f} (${counts[f] ?? 0})`}
                    </button>
                ))}
                <button
                    onClick={fetchApps}
                    title='Refresh'
                    style={{
                        marginLeft: 'auto',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'rgba(237,237,237,0.4)',
                        padding: '4px 8px',
                        display: 'flex',
                        alignItems: 'center',
                    }}
                >
                    <Refresh style={{ fontSize: 18 }} />
                </button>
            </div>

            {/* Column headers */}
            <div className='grid grid-cols-[1fr_1fr_40px_80px_1fr] gap-3 px-4 py-2 mx-4 mt-3' style={{ borderBottom: '1px solid rgba(219,0,29,0.15)' }}>
                {['Discord', 'In-Game Name', 'Age', 'Status', 'Submitted'].map(h => (
                    <span key={h} style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                        {h}
                    </span>
                ))}
            </div>

            {/* Content */}
            {loading ? (
                <div className='flex justify-center py-12'>
                    <CircularProgress size={24} style={{ color: 'var(--red)' }} />
                </div>
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
                filtered.map(app => (
                    <ApplicationRow key={app._id} app={app} members={members} onUpdate={handleUpdate} />
                ))
            )}
        </div>
    )
}
