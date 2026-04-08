'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    Chip, Alert,
    Dialog, DialogContent, DialogTitle, IconButton,
    TextField, InputAdornment,
} from '@mui/material'
import { Refresh, Link as LinkIcon, Close, Search, ArrowUpward, ArrowDownward, UnfoldMore } from '@mui/icons-material'
import { Typography } from '@mui/material'
import TacticalSkeleton from '@/app/admin/_components/TacticalSkeleton'

type Application = J1Application & { _id: string }

type SortKey = 'discordUsername' | 'inGameName' | 'submittedAt' | 'region' | 'recruiter'
type SortDir = 'asc' | 'desc'

function formatDate(date: string | Date) {
    return new Date(date).toLocaleDateString('en-AU', {
        day: '2-digit', month: 'short', year: 'numeric',
    })
}

function DetailModal({ app, onClose }: { app: Application; onClose: () => void }) {
    const Field = ({ label, value }: { label: string; value?: string | number | boolean | null }) => {
        if (value == null || value === '') return null
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
                    border: '1px solid rgba(0,195,100,0.2)',
                    borderTop: '2px solid #00c364',
                    borderRadius: 0,
                    color: 'var(--foreground)',
                },
            }}
        >
            <DialogTitle style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,195,100,0.1)' }}>
                <div className='flex items-center justify-between'>
                    <div>
                        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(0,195,100,0.7)', marginBottom: 4 }}>
                            Accepted Member
                        </div>
                        <div className='flex items-center gap-3'>
                            <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '0.05em' }}>
                                {app.discordUsername}
                            </span>
                            {app.isDirectRecruit && (
                                <span style={{ color: '#00c3ff', fontSize: '0.65rem', fontWeight: 700 }}>DIRECT RECRUIT</span>
                            )}
                            {app.linkedUserId && (
                                <span style={{ fontSize: '0.65rem', color: '#00c364', display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <LinkIcon style={{ fontSize: 13 }} /> {app.linkedUserDisplayName}
                                </span>
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
                        <Field label='Recruiter' value={app.recruiter} />
                        <Field label='Reviewed By' value={app.reviewedBy} />
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
                            <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.75)', whiteSpace: 'pre-wrap', lineHeight: 1.7, background: 'rgba(255,255,255,0.04)', padding: '10px 12px', border: '1px solid rgba(0,195,100,0.08)' }}>
                                {app.experience}
                            </div>
                        </div>
                    )}

                    {app.notes && (
                        <div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 6 }}>
                                Reviewer Notes
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.65)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                {app.notes}
                            </div>
                        </div>
                    )}

                    <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)', borderTop: '1px solid rgba(0,195,100,0.08)', paddingTop: 12 }}>
                        Submitted {formatDate(app.submittedAt)}
                        {app.reviewedAt && <> · Accepted {formatDate(app.reviewedAt)}</>}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

const COLUMNS: { label: string; key: SortKey | null }[] = [
    { label: 'Discord', key: 'discordUsername' },
    { label: 'Joining Name', key: 'inGameName' },
    { label: 'Discord ID', key: null },
    { label: 'Steam ID64', key: null },
    { label: 'Region', key: 'region' },
    { label: 'Recruited By', key: 'recruiter' },
    { label: 'Join Date', key: 'submittedAt' },
]

const GRID = '1.4fr 1fr 110px 130px 90px 1fr 90px'

const PAGE_SIZE = 50

export default function MastersheetTab() {
    const [applications, setApplications] = useState<Application[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('submittedAt')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [page, setPage] = useState(0)
    const [selected, setSelected] = useState<Application | null>(null)

    const fetchApps = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/admin/j1/applications')
            if (!res.ok) throw new Error('Failed to fetch')
            const data = await res.json()
            setApplications(data.applications)
        } catch {
            setError('Failed to load data.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchApps() }, [fetchApps])

    const accepted = useMemo(() => applications.filter(a => a.status === 'accepted'), [applications])

    const filtered = useMemo(() => {
        let list = accepted
        if (search.trim()) {
            const q = search.toLowerCase()
            list = list.filter(a =>
                a.discordUsername.toLowerCase().includes(q) ||
                a.inGameName.toLowerCase().includes(q) ||
                (a.discordId ?? '').toLowerCase().includes(q) ||
                (a.steamId64 ?? '').toLowerCase().includes(q) ||
                (a.region ?? '').toLowerCase().includes(q) ||
                (a.recruiter ?? '').toLowerCase().includes(q)
            )
        }
        return [...list].sort((a, b) => {
            let av: string | number, bv: string | number
            if (sortKey === 'submittedAt') {
                av = new Date(a.submittedAt).getTime()
                bv = new Date(b.submittedAt).getTime()
            } else {
                av = ((a[sortKey as keyof J1Application] as string) ?? '').toLowerCase()
                bv = ((b[sortKey as keyof J1Application] as string) ?? '').toLowerCase()
            }
            if (av < bv) return sortDir === 'asc' ? -1 : 1
            if (av > bv) return sortDir === 'asc' ? 1 : -1
            return 0
        })
    }, [accepted, search, sortKey, sortDir])

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
    const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

    function toggleSort(key: SortKey) {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSortKey(key); setSortDir('asc') }
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
    }

    return (
        <div className='flex flex-col gap-0'>
            {/* Toolbar */}
            <div className='flex items-center gap-3 px-4 pt-4 pb-2'>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(0,195,100,0.7)' }}>
                    Accepted Members — {accepted.length} total
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TextField
                        placeholder='Search...'
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(0) }}
                        size='small'
                        sx={{ ...inputSx, width: 220 }}
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
            <div
                className='grid gap-3 px-4 py-2 mx-4 mt-1'
                style={{ gridTemplateColumns: GRID, borderBottom: '1px solid rgba(0,195,100,0.12)' }}
            >
                {COLUMNS.map(({ label, key }) => (
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
                        {search ? 'No members match your search.' : 'No accepted members yet.'}
                    </Typography>
                </div>
            ) : (
                <>
                    {paginated.map(app => (
                        <div
                            key={app._id}
                            className='grid gap-3 px-4 py-3 cursor-pointer'
                            style={{ gridTemplateColumns: GRID, borderBottom: '1px solid rgba(0,195,100,0.06)' }}
                            onClick={() => setSelected(app)}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,195,100,0.03)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            {/* Discord */}
                            <div className='flex items-center gap-2' style={{ overflow: 'hidden' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {app.discordUsername}
                                </span>
                                {app.linkedUserId && <LinkIcon style={{ fontSize: 13, color: '#00c364', flexShrink: 0 }} />}
                                {app.isDirectRecruit && <span style={{ color: '#00c3ff', fontSize: '0.6rem', flexShrink: 0 }}>[D]</span>}
                            </div>
                            {/* Joining Name */}
                            <span style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {app.inGameName || '—'}
                            </span>
                            {/* Discord ID */}
                            <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                                {app.discordId || '—'}
                            </span>
                            {/* Steam ID64 */}
                            <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                                {app.steamId64 || '—'}
                            </span>
                            {/* Region */}
                            <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {app.region || '—'}
                            </span>
                            {/* Recruited By */}
                            <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {app.recruiter || '—'}
                            </span>
                            {/* Join Date */}
                            <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.35)' }}>
                                {formatDate(app.submittedAt)}
                            </span>
                        </div>
                    ))}

                    {totalPages > 1 && (
                        <div className='flex items-center justify-between px-4 py-3' style={{ borderTop: '1px solid rgba(0,195,100,0.08)' }}>
                            <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)' }}>
                                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                            </span>
                            <div className='flex items-center gap-1'>
                                <button onClick={() => setPage(p => p - 1)} disabled={page === 0} style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(219,0,29,0.32)', color: page === 0 ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.6)', cursor: page === 0 ? 'default' : 'pointer' }}>
                                    ‹ Prev
                                </button>
                                <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages - 1} style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(219,0,29,0.32)', color: page === totalPages - 1 ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.6)', cursor: page === totalPages - 1 ? 'default' : 'pointer' }}>
                                    Next ›
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {selected && (
                <DetailModal app={selected} onClose={() => setSelected(null)} />
            )}
        </div>
    )
}
