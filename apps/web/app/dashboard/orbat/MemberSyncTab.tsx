'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Box, Typography, Button, CircularProgress, Alert, Collapse, IconButton } from '@mui/material'
import { ExpandMore, ExpandLess, Refresh } from '@mui/icons-material'
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

function MemberRow({ entry, expanded, onToggle }: { entry: MemberSyncEntry; expanded: boolean; onToggle: () => void }) {
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

export default function MemberSyncTab() {
    const [report, setReport] = useState<MemberSyncReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [offRosterExpanded, setOffRosterExpanded] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
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

    const onRosterSorted = useMemo(() => report ? sortEntries(report.onRoster) : [], [report])
    const offRosterFlagged = useMemo(() => report ? report.offRoster.filter(e => e.status !== 'green') : [], [report])
    const offRosterSorted = useMemo(() => sortEntries(offRosterFlagged), [offRosterFlagged])

    return (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: 1, color: 'rgba(237,237,237,0.5)', flex: 1 }}>
                    Discord / TeamSpeak grant drift across every member
                </Typography>
                <Button size='small' variant='outlined' startIcon={<Refresh sx={{ fontSize: 15 }} />} onClick={load} disabled={loading}
                    sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.7)' }}>
                    Refresh
                </Button>
            </Box>

            {error && <Alert severity='error' sx={{ fontSize: '0.72rem', borderRadius: 0 }}>{error}</Alert>}

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
                        <MemberRow key={entry.userId} entry={entry} expanded={expandedIds.has(entry.userId)} onToggle={() => toggleExpand(entry.userId)} />
                    ))}
                    {onRosterSorted.length === 0 && (
                        <Typography sx={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic', px: 2, py: 1 }}>No on-roster members.</Typography>
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
                            <MemberRow key={entry.userId} entry={entry} expanded={expandedIds.has(entry.userId)} onToggle={() => toggleExpand(entry.userId)} />
                        ))}
                    </Collapse>
                </Box>
            )}
        </Box>
    )
}
