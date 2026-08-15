'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Box, Typography, Button, CircularProgress, Alert, Collapse, IconButton, TextField, InputAdornment } from '@mui/material'
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
import { ExpandMore, ExpandLess, Refresh, Search } from '@mui/icons-material'

// No literal `border` here — it would land on the outer FormControl root and
// double-border against MUI's own notched-outline fieldset, breaking the
// label notch. The border color is scoped to that fieldset instead.
const searchFieldSx = {
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
}
import type { MemberSyncEntry, MemberSyncReport, GrantDetail } from '@/lib/orbat/member-sync'

const STATUS_STYLE: Record<MemberSyncEntry['status'], { label: string; color: string; bg: string; border: string }> = {
    red: { label: 'Missing', color: 'rgba(239,68,68,0.95)', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)' },
    orange: { label: 'Extra', color: 'rgba(251,146,60,0.95)', bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.4)' },
    green: { label: 'In sync', color: 'rgba(74,222,128,0.95)', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.35)' },
}

const STATUS_ORDER: Record<MemberSyncEntry['status'], number> = { red: 0, orange: 1, green: 2 }

function sortEntries(entries: MemberSyncEntry[]): MemberSyncEntry[] {
    return [...entries].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name))
}

function issueCount(entry: MemberSyncEntry): number {
    return entry.discord.missing.length + entry.discord.extra.length + entry.teamspeak.missing.length + entry.teamspeak.extra.length
}

function GrantDetailList({ title, items, tone }: { title: string; items: GrantDetail[]; tone: 'red' | 'orange' }) {
    if (!items.length) return null
    const color = tone === 'red' ? 'rgba(239,68,68,0.9)' : 'rgba(251,146,60,0.9)'
    return (
        <Box sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color }}>
                {title}
            </Typography>
            {items.map((item, i) => (
                <Typography key={`${item.id}-${i}`} sx={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.75)', pl: 1 }}>
                    {item.name} <span style={{ color: 'rgba(237,237,237,0.4)' }}>— {item.source}</span>
                </Typography>
            ))}
        </Box>
    )
}

function MemberRow({ entry, expanded, onToggle, onSync }: { entry: MemberSyncEntry; expanded: boolean; onToggle: () => void; onSync: (entry: MemberSyncEntry) => void }) {
    const style = STATUS_STYLE[entry.status]
    const count = issueCount(entry)

    return (
        <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <Box
                onClick={onToggle}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, cursor: 'pointer',
                    '&:hover': { background: 'rgba(255,255,255,0.03)' },
                }}
            >
                <IconButton size='small' sx={{ p: 0.2 }}>
                    {expanded ? <ExpandLess sx={{ fontSize: 16, color: 'rgba(237,237,237,0.5)' }} /> : <ExpandMore sx={{ fontSize: 16, color: 'rgba(237,237,237,0.5)' }} />}
                </IconButton>
                <Typography sx={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.85)', flex: 1 }}>{entry.name}</Typography>
                {!entry.teamspeak.linked && (
                    <Typography sx={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic' }}>TeamSpeak not linked</Typography>
                )}
                <Box sx={{
                    fontSize: '0.62rem', fontWeight: 700, letterSpacing: 0.5, padding: '2px 8px', borderRadius: 999,
                    color: style.color, background: style.bg, border: `1px solid ${style.border}`,
                }}>
                    {style.label}{entry.status !== 'green' && ` (${count})`}
                </Box>
                {entry.status !== 'green' && (
                    <Button size='small' variant='outlined' onClick={e => { e.stopPropagation(); onSync(entry) }}
                        sx={{ fontSize: '0.62rem', letterSpacing: 0.5, borderColor: 'rgba(100,180,255,0.4)', color: 'rgba(100,180,255,0.85)' }}>
                        Sync
                    </Button>
                )}
            </Box>
            <Collapse in={expanded}>
                <Box sx={{ px: 2, pb: 1.5, pl: 5.5 }}>
                    {entry.status === 'green' ? (
                        <Typography sx={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)', fontStyle: 'italic' }}>No issues.</Typography>
                    ) : (
                        <>
                            <GrantDetailList title='Missing Discord roles' items={entry.discord.missing} tone='red' />
                            <GrantDetailList title='Extra Discord roles' items={entry.discord.extra} tone='orange' />
                            <GrantDetailList title='Missing TeamSpeak groups' items={entry.teamspeak.missing} tone='red' />
                            <GrantDetailList title='Extra TeamSpeak groups' items={entry.teamspeak.extra} tone='orange' />
                        </>
                    )}
                </Box>
            </Collapse>
        </Box>
    )
}

function DiffPreview({ entries }: { entries: MemberSyncEntry[] }) {
    return (
        <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
            {entries.map(entry => (
                <Box key={entry.userId} sx={{ mb: 1.5 }}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(237,237,237,0.85)' }}>{entry.name}</Typography>
                    <GrantDetailList title='Grant (Discord)' items={entry.discord.missing} tone='red' />
                    <GrantDetailList title='Revoke (Discord)' items={entry.discord.extra} tone='orange' />
                    <GrantDetailList title='Grant (TeamSpeak)' items={entry.teamspeak.missing} tone='red' />
                    <GrantDetailList title='Revoke (TeamSpeak)' items={entry.teamspeak.extra} tone='orange' />
                </Box>
            ))}
        </Box>
    )
}

export default function MemberSyncTab() {
    const [report, setReport] = useState<MemberSyncReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [offRosterExpanded, setOffRosterExpanded] = useState(false)
    const [search, setSearch] = useState('')
    const [confirmTarget, setConfirmTarget] = useState<{ kind: 'all'; entries: MemberSyncEntry[] } | { kind: 'member'; entries: MemberSyncEntry[] } | null>(null)
    const [applying, setApplying] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        setSuccessMessage(null)
        try {
            const res = await fetch('/api/admin/orbat/member-sync')
            const data = await res.json().catch(() => ({}))
            if (!res.ok) { setError(data.error ?? 'Failed to load member sync report'); setReport(null); return }
            setReport(data as MemberSyncReport)
        } catch {
            setError('Failed to load member sync report')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    function toggleExpand(userId: string) {
        setExpandedIds(prev => {
            const next = new Set(prev)
            next.has(userId) ? next.delete(userId) : next.add(userId)
            return next
        })
    }

    function openConfirm(target: { kind: 'all'; entries: MemberSyncEntry[] } | { kind: 'member'; entries: MemberSyncEntry[] }) {
        setSuccessMessage(null)
        setConfirmTarget(target)
    }

    const allEntries = useMemo(() => report ? [...report.onRoster, ...report.offRoster] : [], [report])
    const outOfSync = useMemo(() => allEntries.filter(e => e.status !== 'green'), [allEntries])

    const searchTerm = search.trim().toLowerCase()
    const matchesSearch = useCallback((e: MemberSyncEntry) => !searchTerm || e.name.toLowerCase().includes(searchTerm), [searchTerm])

    const onRosterSorted = useMemo(
        () => report ? sortEntries(report.onRoster.filter(matchesSearch)) : [],
        [report, matchesSearch],
    )
    const offRosterFlagged = useMemo(
        () => report ? report.offRoster.filter(e => e.status !== 'green').filter(matchesSearch) : [],
        [report, matchesSearch],
    )
    const offRosterSorted = useMemo(() => sortEntries(offRosterFlagged), [offRosterFlagged])

    // A search that only matches something in the (collapsed-by-default) Off
    // Roster section shouldn't hide that result behind a "Show" click.
    useEffect(() => {
        if (searchTerm && offRosterFlagged.length > 0) setOffRosterExpanded(true)
    }, [searchTerm, offRosterFlagged.length])

    async function applyConfirmed() {
        if (!confirmTarget) return
        setApplying(true)
        setError(null)
        try {
            const userIds = confirmTarget.kind === 'member' ? confirmTarget.entries.map(e => e.userId) : undefined
            const res = await fetch('/api/admin/orbat/member-sync/apply', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) { setError(data.error ?? 'Sync failed'); return }
            const failedTotal = (data.discordFailed ?? 0) + (data.tsFailed ?? 0)
            setConfirmTarget(null)
            // load() clears successMessage at its own start (stale-message
            // cleanup on any fetch), so the real message must be set AFTER
            // it resolves — setting it before would be clobbered by that
            // clear in the same synchronous batch and never actually render.
            await load()
            setSuccessMessage(
                `Sync complete — ${data.membersChecked} member(s) checked. Discord: +${data.discordGranted}/-${data.discordRevoked}. TeamSpeak: +${data.tsGranted}/-${data.tsRevoked}.` +
                (failedTotal > 0 ? ` ${failedTotal} change(s) failed — see server logs.` : ''),
            )
        } catch {
            setError('Sync failed')
        } finally {
            setApplying(false)
        }
    }

    return (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: 1, color: 'rgba(237,237,237,0.5)', flex: 1 }}>
                    Discord / TeamSpeak grant drift across every member
                </Typography>
                <TextField
                    size='small' placeholder='Search members…' value={search} onChange={e => setSearch(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                    sx={{ ...searchFieldSx, width: 220 }}
                />
                <Button size='small' variant='contained' disabled={loading || outOfSync.length === 0}
                    onClick={() => openConfirm({ kind: 'all', entries: outOfSync })}
                    sx={{ background: 'var(--red)', fontWeight: 700, letterSpacing: 1, fontSize: '0.65rem', '&:hover': { background: 'rgba(219,0,29,0.85)' } }}>
                    Sync All ({outOfSync.length})
                </Button>
                <Button size='small' variant='outlined' startIcon={<Refresh sx={{ fontSize: 15 }} />} onClick={load} disabled={loading}
                    sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.7)' }}>
                    Refresh
                </Button>
            </Box>

            {error && <Alert severity='error' sx={{ fontSize: '0.72rem', borderRadius: 0 }}>{error}</Alert>}
            {successMessage && <Alert severity='success' sx={{ fontSize: '0.72rem', borderRadius: 0 }}>{successMessage}</Alert>}
            {report && !report.tsAvailable && (
                <Alert severity='warning' sx={{ fontSize: '0.72rem', borderRadius: 0 }}>
                    TeamSpeak is currently unreachable — TeamSpeak group drift was not evaluated this run. Discord-only results are shown below.
                </Alert>
            )}

            {loading ? (
                <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <CircularProgress size={26} />
                </Box>
            ) : report && (
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, color: 'rgba(219,0,29,0.75)', px: 2, pt: 1.5, pb: 0.5, textTransform: 'uppercase' }}>
                        On Roster ({onRosterSorted.length})
                    </Typography>
                    {onRosterSorted.map(entry => (
                        <MemberRow key={entry.userId} entry={entry} expanded={expandedIds.has(entry.userId)}
                            onToggle={() => toggleExpand(entry.userId)}
                            onSync={e => openConfirm({ kind: 'member', entries: [e] })} />
                    ))}
                    {onRosterSorted.length === 0 && (
                        <Typography sx={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic', px: 2, py: 1 }}>
                            {searchTerm ? 'No members match your search.' : 'No on-roster members.'}
                        </Typography>
                    )}

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 2, pb: 0.5 }}>
                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, color: 'rgba(219,0,29,0.75)', textTransform: 'uppercase' }}>
                            Off Roster
                        </Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.45)' }}>
                            {offRosterFlagged.length} member(s) with stray grants
                        </Typography>
                        {offRosterFlagged.length > 0 && (
                            <Button size='small' onClick={() => setOffRosterExpanded(v => !v)} sx={{ fontSize: '0.65rem', color: 'rgba(100,180,255,0.85)' }}>
                                {offRosterExpanded ? 'Hide' : 'Show'}
                            </Button>
                        )}
                    </Box>
                    <Collapse in={offRosterExpanded}>
                        {offRosterSorted.map(entry => (
                            <MemberRow key={entry.userId} entry={entry} expanded={expandedIds.has(entry.userId)}
                                onToggle={() => toggleExpand(entry.userId)}
                                onSync={e => openConfirm({ kind: 'member', entries: [e] })} />
                        ))}
                    </Collapse>
                </Box>
            )}

            <Dialog open={!!confirmTarget} onClose={() => !applying && setConfirmTarget(null)} maxWidth='sm' fullWidth
                PaperProps={{ style: { background: 'var(--background, #0a0a0a)', border: '1px solid rgba(219,0,29,0.32)' } }}>
                <DialogTitle sx={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    {confirmTarget?.kind === 'all' ? `Sync ${confirmTarget.entries.length} member(s)?` : `Sync ${confirmTarget?.entries[0]?.name}?`}
                </DialogTitle>
                <DialogContent>
                    {error && <Alert severity='error' sx={{ fontSize: '0.72rem', mb: 1.5 }}>{error}</Alert>}
                    {confirmTarget && <DiffPreview entries={confirmTarget.entries} />}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmTarget(null)} disabled={applying} sx={{ color: 'rgba(237,237,237,0.6)' }}>Cancel</Button>
                    <Button onClick={applyConfirmed} disabled={applying} variant='contained'
                        sx={{ background: 'var(--red)', fontWeight: 700, '&:hover': { background: 'rgba(219,0,29,0.85)' } }}>
                        {applying ? 'Syncing…' : 'Confirm Sync'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
