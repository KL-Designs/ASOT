'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    Box, Typography, Button, Chip, Divider, CircularProgress,
    Checkbox, FormControlLabel, FormGroup, Skeleton, IconButton,
    Accordion, AccordionSummary, AccordionDetails, Avatar,
    Switch, Tooltip, Popover,
} from '@mui/material'
import {
    ExpandMore, CheckCircle, Cancel, HelpOutline,
    Lock, LockOpen, PersonAdd, Tune, Add,
} from '@mui/icons-material'
import AttendanceManageDialog from '@/components/operations/AttendanceManageDialog'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttendanceRecord {
    userId: string
    unit: string
    orbatSection: string
    orbatRole: string
    rsvp: 'attending' | 'not_attending' | null
    confirmed: boolean
    confirmedBy: string | null
    confirmedAt: string | null
    importedStatus?: string
    attendanceType?: string
    reservistSection?: string
    category?: string
    user: {
        id: string
        displayName: string
        avatarURL: string
        isSkeletonAccount?: boolean
        csvName?: string
    } | null
}

interface AttendanceData {
    operationId: string
    assignedPlatoons: string[]
    records: AttendanceRecord[]
    recordsWithUsers: AttendanceRecord[]
    reservistAssignments: { userId: string; sectionTitle: string }[]
    rsvpOpen: boolean
    confirmationOpen: boolean
    sectionRolesMap: Record<string, { role: string; userId: string | null }[]>
}

interface Props {
    operationId: string
    operationStatus: string
    myUserId: string | null
    isHQ: boolean
    isSectionLeader: boolean
    isAllStaff: boolean
    themeColor: string
}

const PLATOON_OPTIONS = [
    { id: 'companyHQ', label: '1-0 HQ' },
    { id: 'platoon11', label: '1-1 Platoon' },
    { id: 'platoon12', label: '1-2 Platoon' },
    { id: 'support',   label: '1-3 Support Platoon' },
]

// ── Constants ─────────────────────────────────────────────────────────────────

const ATTENDANCE_TYPES = [
    { value: 'ATTENDED',       label: 'Attended',      color: '#4caf50' },
    { value: 'NOT ATTENDING',  label: 'Not Attending', color: 'rgba(219,0,29,0.9)' },
    { value: 'RESOLVED',       label: 'Resolved',      color: '#2196f3' },
    { value: 'NO NOTICE',      label: 'No Notice',     color: '#ff9800' },
    { value: 'LOA',            label: 'LOA',           color: '#9c27b0' },
    { value: 'CONFIRM',        label: 'Confirm',       color: '#00bcd4' },
    { value: 'N/A',            label: 'N/A',           color: 'rgba(237,237,237,0.35)' },
    { value: 'ADDED TO UNIT',  label: 'Added To Unit', color: '#3f51b5' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function rsvpIcon(rsvp: 'attending' | 'not_attending' | null) {
    if (rsvp === 'attending')     return <CheckCircle sx={{ fontSize: 14, color: '#4caf50' }} />
    if (rsvp === 'not_attending') return <Cancel sx={{ fontSize: 14, color: 'rgba(219,0,29,0.7)' }} />
    return <HelpOutline sx={{ fontSize: 14, color: 'rgba(237,237,237,0.2)' }} />
}

// category → [ { sectionTitle, isSubSection, records[] } ]
// The first section in each multi-section category is the "platoon HQ" level;
// subsequent sections within the same category are indented sub-sections.
function groupByCategoryAndSection(records: AttendanceRecord[]): Map<string, { title: string; isSubSection: boolean; records: AttendanceRecord[] }[]> {
    const result = new Map<string, { title: string; isSubSection: boolean; records: AttendanceRecord[] }[]>()

    // Map section title → category so reservists can be placed in the right platoon group
    const sectionCategoryMap = new Map<string, string>()
    for (const r of records) {
        const sec = r.orbatSection || r.unit
        if (sec && r.category) sectionCategoryMap.set(sec, r.category)
    }

    for (const r of records) {
        const sectionKey = r.reservistSection || r.orbatSection || r.unit || 'Unknown'
        const cat = (r.reservistSection && sectionCategoryMap.get(r.reservistSection))
            ? sectionCategoryMap.get(r.reservistSection)!
            : (r.category ?? 'other')

        if (!result.has(cat)) result.set(cat, [])
        const catSections = result.get(cat)!

        let entry = catSections.find(s => s.title === sectionKey)
        if (!entry) {
            const isSubSection = false
            entry = { title: sectionKey, isSubSection, records: [] }
            catSections.push(entry)
        }
        entry.records.push(r)
    }

    // Within each section, sort reservists (those with reservistSection set) to the bottom
    for (const catSections of result.values()) {
        for (const section of catSections) {
            section.records.sort((a, b) => {
                const aRes = !!a.reservistSection
                const bRes = !!b.reservistSection
                if (aRes !== bRes) return aRes ? 1 : -1
                return 0
            })
        }
    }

    return result
}

// ── AttendancePanel ───────────────────────────────────────────────────────────

export default function AttendancePanel({
    operationId, operationStatus, myUserId, isHQ, isSectionLeader, isAllStaff, themeColor,
}: Props) {
    const [data, setData]               = useState<AttendanceData | null>(null)
    const [loading, setLoading]         = useState(true)
    const [saving, setSaving]           = useState(false)
    const [myRsvp, setMyRsvp]           = useState<'attending' | 'not_attending' | null>(null)
    const [myReservistSection, setMyReservistSection] = useState<string>('')
    const [confirming, setConfirming]   = useState<Record<string, boolean>>({})
    const [confirmingDirty, setConfirmingDirty] = useState(false)
    const [manageOpen, setManageOpen]   = useState(false)
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
    const [sectionMeta, setSectionMeta] = useState<OrbatSectionMeta[]>([])
    const [typeAnchor, setTypeAnchor] = useState<{ el: HTMLElement; userId: string } | null>(null)
    const [joinRoleAnchor, setJoinRoleAnchor] = useState<{ el: HTMLElement; sectionTitle: string } | null>(null)
    const [liveStatus, setLiveStatus] = useState(operationStatus)

    const r = parseInt(themeColor.replace('#', '').substring(0, 2), 16)
    const g = parseInt(themeColor.replace('#', '').substring(2, 4), 16)
    const b = parseInt(themeColor.replace('#', '').substring(4, 6), 16)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`

    const isUpcomingOrActive = liveStatus === 'Upcoming' || liveStatus === 'Active'
    const isCompleted        = liveStatus === 'Completed'

    // ── Fetch ──────────────────────────────────────────────────────────────────

    // Shared logic for applying fetched data — used by both initial load and silent refresh
    const applyData = useCallback((d: AttendanceData, resetConfirming = true) => {
        setData(d)
        if (myUserId) {
            const mine = d.recordsWithUsers.find(r => r.userId === myUserId)
            setMyRsvp(mine?.rsvp ?? null)
            setMyReservistSection(mine?.reservistSection ?? '')
        }
        if (resetConfirming) {
            const init: Record<string, boolean> = {}
            for (const r of d.recordsWithUsers) init[r.userId] = r.confirmed
            setConfirming(init)
        }
        // Initialize expanded state once (don't override user-toggled sections on subsequent polls)
        setExpandedSections(prev => {
            if (Object.keys(prev).length > 0) return prev
            const sections = new Set(d.recordsWithUsers.map(r => r.reservistSection || r.orbatSection || r.unit || 'Unknown'))
            const init: Record<string, boolean> = {}
            for (const sec of sections) {
                init[sec] = myUserId ? d.recordsWithUsers.some(r => (r.reservistSection || r.orbatSection || r.unit) === sec && r.userId === myUserId) : true
            }
            return init
        })
    }, [myUserId])

    // Initial load — shows skeleton
    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const [res, metaRes] = await Promise.all([
                fetch(`/api/operations/${operationId}/attendance`),
                fetch('/api/admin/orbat/meta'),
            ])
            if (res.ok) applyData(await res.json())
            if (metaRes.ok) setSectionMeta(await metaRes.json())
        } finally {
            setLoading(false)
        }
    }, [operationId, applyData])

    // Silent refresh — no skeleton flash, used after mutations and polling
    const refreshData = useCallback(async (resetConfirming = true) => {
        try {
            const res = await fetch(`/api/operations/${operationId}/attendance`)
            if (res.ok) applyData(await res.json(), resetConfirming)
        } catch { }
    }, [operationId, applyData])

    useEffect(() => { fetchData() }, [fetchData])

    // ── Live polling ───────────────────────────────────────────────────────────
    useEffect(() => {
        const interval = setInterval(() => {
            if (!saving && !manageOpen) refreshData(!confirmingDirty)
        }, 15000)
        return () => clearInterval(interval)
    }, [saving, manageOpen, refreshData, confirmingDirty])

    // Poll operation status separately (lightweight) so RSVP/confirmation UI
    // reflects status changes without needing a page reload.
    useEffect(() => {
        const poll = () => {
            fetch(`/api/operations/${operationId}/live-status`)
                .then(res => res.json())
                .then(json => { if (json.operationStatus) setLiveStatus(json.operationStatus) })
                .catch(() => {})
        }
        const interval = setInterval(poll, 30_000)
        return () => clearInterval(interval)
    }, [operationId])

    // ── RSVP ───────────────────────────────────────────────────────────────────

    const handleRsvp = async (status: 'attending' | 'not_attending') => {
        if (!data?.rsvpOpen) return
        const next = myRsvp === status ? null : status
        const effectiveStatus = next ?? 'not_attending'
        setMyRsvp(next)
        if (effectiveStatus === 'not_attending') setMyReservistSection('')
        setSaving(true)
        try {
            await fetch(`/api/operations/${operationId}/attendance/rsvp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: effectiveStatus,
                    ...(myReservistSection && effectiveStatus !== 'not_attending' ? { reservistSection: myReservistSection } : {}),
                }),
            })
            await refreshData()
        } finally {
            setSaving(false)
        }
    }

    // ── HQ: platoon assignment ─────────────────────────────────────────────────

    const handlePlatoonToggle = async (platoonId: string) => {
        if (!data || !isHQ) return
        const current  = data.assignedPlatoons ?? []
        const updated  = current.includes(platoonId)
            ? current.filter(p => p !== platoonId)
            : [...current, platoonId]
        setSaving(true)
        try {
            await fetch(`/api/operations/${operationId}/attendance/platoons`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assignedPlatoons: updated, reservistAssignments: data.reservistAssignments }),
            })
            await refreshData()
        } finally {
            setSaving(false)
        }
    }

    const handleRsvpToggle = async (open: boolean) => {
        if (!isHQ) return
        setSaving(true)
        try {
            await fetch(`/api/operations/${operationId}/attendance/platoons`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assignedPlatoons: data?.assignedPlatoons ?? [],
                    reservistAssignments: data?.reservistAssignments ?? [],
                    rsvpOpen: open,
                }),
            })
            await refreshData()
        } finally {
            setSaving(false)
        }
    }

    const handleConfirmToggle = async (open: boolean) => {
        if (!isHQ) return
        setSaving(true)
        try {
            await fetch(`/api/operations/${operationId}/attendance/platoons`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assignedPlatoons: data?.assignedPlatoons ?? [],
                    reservistAssignments: data?.reservistAssignments ?? [],
                    confirmationOpen: open,
                }),
            })
            await refreshData()
        } finally {
            setSaving(false)
        }
    }

    // ── Reservist: join a section ──────────────────────────────────────────────

    const handleJoinAsReservist = async (sectionTitle: string, role?: string) => {
        if (!data?.rsvpOpen) return
        const isLeaving = myReservistSection === sectionTitle
        const newSection = isLeaving ? '' : sectionTitle
        setMyReservistSection(newSection)
        setSaving(true)
        try {
            await fetch(`/api/operations/${operationId}/attendance/rsvp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: myRsvp ?? 'attending',
                    ...(newSection ? { reservistSection: newSection } : {}),
                    ...(role ? { reservistRole: role } : {}),
                }),
            })
            await refreshData()
        } finally {
            setSaving(false)
        }
    }

    // Clears reservistSection so the member returns to their own ORBAT section
    const handleRejoinSection = async () => {
        if (!data?.rsvpOpen) return
        setMyReservistSection('')
        setSaving(true)
        try {
            await fetch(`/api/operations/${operationId}/attendance/rsvp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: myRsvp ?? 'attending' }),
            })
            await refreshData()
        } finally {
            setSaving(false)
        }
    }

    // ── Section leader: confirm ────────────────────────────────────────────────

    const handleConfirmSubmit = async (sectionTitle: string) => {
        if (!data?.confirmationOpen) return
        const sectionRecords = (data.recordsWithUsers).filter(r => (r.reservistSection || r.orbatSection) === sectionTitle || r.orbatSection === sectionTitle)
        const confirmedIds   = sectionRecords.filter(r => confirming[r.userId]).map(r => r.userId)
        setSaving(true)
        try {
            await fetch(`/api/operations/${operationId}/attendance/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmedUserIds: confirmedIds, sectionTitle }),
            })
            setConfirmingDirty(false)
            await refreshData()
        } finally {
            setSaving(false)
        }
    }

    // ── Attendance type ────────────────────────────────────────────────────────

    const handleSetType = async (attendanceType: string | null) => {
        if (!typeAnchor) return
        const userId = typeAnchor.userId
        setTypeAnchor(null)
        await fetch(`/api/operations/${operationId}/attendance/type`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, attendanceType }),
        })
        refreshData(false)
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    if (loading) {
        // Skeleton sections — widths vary to feel natural
        const skeletonSections = [
            { titleW: '20%', rows: 4, sub: false },
            { titleW: '18%', rows: 6, sub: false },
            { titleW: '24%', rows: 5, sub: true  },
            { titleW: '22%', rows: 4, sub: true  },
            { titleW: '16%', rows: 3, sub: false },
        ]
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {/* Status chip skeletons */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Skeleton variant='rounded' width={90} height={22} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.05)' }} />
                    <Skeleton variant='rounded' width={80} height={22} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.05)' }} />
                </Box>

                {skeletonSections.map((s, i) => (
                    <Box key={i} sx={s.sub ? { ml: 2, borderLeft: '2px solid rgba(255,255,255,0.06)' } : {}}>
                        <Box sx={{
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderTop: `2px solid rgba(255,255,255,${s.sub ? 0.04 : 0.08})`,
                            background: s.sub ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.02)',
                        }}>
                            {/* Section header */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1, minHeight: 40 }}>
                                <Skeleton variant='text' width={s.titleW} height={14} sx={{ bgcolor: 'rgba(255,255,255,0.07)', flex: 'none' }} />
                                {/* Avatar stack skeleton */}
                                <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                    {Array.from({ length: Math.min(s.rows, 5) }).map((_, j) => (
                                        <Skeleton key={j} variant='circular' width={20} height={20} sx={{ ml: j === 0 ? 0 : '-6px', bgcolor: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                                    ))}
                                </Box>
                                <Skeleton variant='text' width={28} height={14} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
                            </Box>

                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.04)' }} />

                            {/* Member rows */}
                            {Array.from({ length: s.rows }).map((_, j) => (
                                <Box key={j} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 0.75, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <Skeleton variant='circular' width={22} height={22} sx={{ bgcolor: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                                    <Skeleton variant='text' width={`${40 + (j * 13) % 30}%`} height={14} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
                                    <Skeleton variant='circular' width={14} height={14} sx={{ bgcolor: 'rgba(255,255,255,0.04)', ml: 'auto', flexShrink: 0 }} />
                                </Box>
                            ))}
                        </Box>
                    </Box>
                ))}
            </Box>
        )
    }

    const records        = data?.recordsWithUsers ?? []
    const byCategory     = groupByCategoryAndSection(records)
    const myOrbatSection = myUserId ? records.find(r => r.userId === myUserId)?.orbatSection : undefined

    function getSectionMeta(category: string, sectionTitle: string | null) {
        return sectionMeta.find(m => m.category === category && m.sectionTitle === sectionTitle) ?? null
    }
    function getSectionPatchUrl(category: string, sectionTitle: string): string | null {
        const meta = getSectionMeta(category, sectionTitle)
        if (!meta?.patch) return null
        return `/api/orbat/patch?category=${category}&section=${encodeURIComponent(sectionTitle)}&v=${meta.patch}`
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* ── Status chips + HQ controls ─────────────────────────────── */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Chip
                        icon={data?.rsvpOpen ? <LockOpen sx={{ fontSize: 14 }} /> : <Lock sx={{ fontSize: 14 }} />}
                        label={data?.rsvpOpen ? 'RSVP Open' : 'RSVP Closed'}
                        size='small'
                        sx={{ fontSize: '0.65rem', letterSpacing: 1.5, textTransform: 'uppercase',
                            background: data?.rsvpOpen ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.05)',
                            color: data?.rsvpOpen ? '#4caf50' : 'rgba(237,237,237,0.3)',
                            border: `1px solid ${data?.rsvpOpen ? 'rgba(76,175,80,0.3)' : 'rgba(255,255,255,0.08)'}`,
                        }}
                    />
                    {isCompleted && (
                        <Chip
                            icon={data?.confirmationOpen ? <LockOpen sx={{ fontSize: 14 }} /> : <Lock sx={{ fontSize: 14 }} />}
                            label={data?.confirmationOpen ? 'Confirming' : 'Locked'}
                            size='small'
                            sx={{ fontSize: '0.65rem', letterSpacing: 1.5, textTransform: 'uppercase',
                                background: data?.confirmationOpen ? 'rgba(255,152,0,0.15)' : 'rgba(255,255,255,0.05)',
                                color: data?.confirmationOpen ? '#ff9800' : 'rgba(237,237,237,0.3)',
                                border: `1px solid ${data?.confirmationOpen ? 'rgba(255,152,0,0.3)' : 'rgba(255,255,255,0.08)'}`,
                            }}
                        />
                    )}
                </Box>

                {/* HQ manage button */}
                {isHQ && (
                    <Button
                        size='small'
                        variant='outlined'
                        startIcon={<Tune sx={{ fontSize: 14 }} />}
                        onClick={() => setManageOpen(true)}
                        sx={{
                            fontSize: '0.6rem', letterSpacing: 1.5, textTransform: 'uppercase',
                            borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(237,237,237,0.45)',
                            '&:hover': { borderColor: 'rgba(255,255,255,0.25)', color: 'rgba(237,237,237,0.8)', background: 'rgba(255,255,255,0.04)' },
                        }}
                    >
                        Manage Attendance
                    </Button>
                )}

                {/* Login prompt */}
                {!myUserId && (
                    <Button
                        component='a'
                        href={`/login?returnTo=/operations/${operationId}`}
                        size='small'
                        variant='outlined'
                        sx={{
                            fontSize: '0.6rem', letterSpacing: 2, textTransform: 'uppercase',
                            borderColor: c(0.35), color: c(0.8),
                            '&:hover': { borderColor: c(0.7), background: c(0.08) },
                        }}
                    >
                        Log in to RSVP
                    </Button>
                )}

                {/* HQ controls */}
                {isHQ && (
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Tooltip title={data?.rsvpOpen ? 'Close RSVP' : 'Open RSVP'}>
                            <FormControlLabel
                                control={<Switch checked={data?.rsvpOpen ?? false} onChange={e => handleRsvpToggle(e.target.checked)} size='small' sx={{ '& .MuiSwitch-thumb': { color: c(0.9) }, '& .Mui-checked + .MuiSwitch-track': { backgroundColor: c(0.4) } }} />}
                                label={<Typography fontSize='0.65rem' letterSpacing={1.5} sx={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' }}>RSVP</Typography>}
                            />
                        </Tooltip>
                        {isCompleted && (
                            <Tooltip title={data?.confirmationOpen ? 'Lock confirmation' : 'Open for confirmation'}>
                                <FormControlLabel
                                    control={<Switch checked={data?.confirmationOpen ?? false} onChange={e => handleConfirmToggle(e.target.checked)} size='small' sx={{ '& .MuiSwitch-thumb': { color: c(0.9) }, '& .Mui-checked + .MuiSwitch-track': { backgroundColor: c(0.4) } }} />}
                                    label={<Typography fontSize='0.65rem' letterSpacing={1.5} sx={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' }}>Confirm</Typography>}
                                />
                            </Tooltip>
                        )}
                    </Box>
                )}
            </Box>


            {/* ── My RSVP (logged-in member) ─────────────────────────────── */}
            {myUserId && data?.rsvpOpen && (
                <Box sx={{ p: 2, border: '1px solid rgba(255,255,255,0.06)', borderTop: `2px solid ${c(0.5)}`, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} sx={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', flex: 1 }}>
                            My Attendance
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                                size='small'
                                variant={myRsvp === 'attending' ? 'contained' : 'outlined'}
                                disabled={saving}
                                onClick={() => handleRsvp('attending')}
                                startIcon={<CheckCircle sx={{ fontSize: 14 }} />}
                                sx={{
                                    fontSize: '0.65rem', letterSpacing: 2, textTransform: 'uppercase',
                                    ...(myRsvp === 'attending'
                                        ? { background: 'rgba(76,175,80,0.7)', '&:hover': { background: 'rgba(76,175,80,0.9)' } }
                                        : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)' })
                                }}
                            >
                                Attending
                            </Button>
                            <Button
                                size='small'
                                variant={myRsvp === 'not_attending' ? 'contained' : 'outlined'}
                                disabled={saving}
                                onClick={() => handleRsvp('not_attending')}
                                startIcon={<Cancel sx={{ fontSize: 14 }} />}
                                sx={{
                                    fontSize: '0.65rem', letterSpacing: 2, textTransform: 'uppercase',
                                    ...(myRsvp === 'not_attending'
                                        ? { background: 'rgba(219,0,29,0.6)', '&:hover': { background: 'rgba(219,0,29,0.8)' } }
                                        : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)' })
                                }}
                            >
                                Not Attending
                            </Button>
                        </Box>
                    </Box>

                </Box>
            )}

            {/* ── Attendance by section ──────────────────────────────────── */}
            {records.length === 0 ? (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                    <Typography fontSize='0.75rem' sx={{ color: 'rgba(237,237,237,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        No attendance records yet
                    </Typography>
                </Box>
            ) : (
                Array.from(byCategory.values()).map(sections =>
                    sections.map(({ title: section, isSubSection, records: sectionRecords }) => {
                        const permRecords   = sectionRecords.filter(r => !r.reservistSection)
                        const resRecords    = sectionRecords.filter(r => !!r.reservistSection)
                        const attending    = permRecords.filter(r => r.rsvp === 'attending' || r.importedStatus === 'ATTENDED').length
                        const resAttending = resRecords.filter(r => r.rsvp === 'attending' || r.importedStatus === 'ATTENDED').length
                        const confirmedCnt = permRecords.filter(r => r.confirmed).length
                        const resConfirmed = resRecords.filter(r => r.confirmed).length
                        const canConfirm   = isCompleted && (isSectionLeader || isHQ || isAllStaff) && (data?.confirmationOpen ?? false)
                        const isMySection  = sectionRecords.some(r => r.userId === myUserId)
                        const category     = sectionRecords[0]?.category ?? ''
                        const patchUrl     = isSubSection ? getSectionPatchUrl(category, section) : null
                        const secColor     = isSubSection
                            ? (getSectionMeta(category, section)?.color ?? null)
                            : (getSectionMeta(category, null)?.color ?? null)

                        return (
                            <Box key={section} sx={isSubSection ? { ml: 2, borderLeft: '2px solid rgba(255,255,255,0.06)' } : {}}>
                                <Accordion
                                    expanded={expandedSections[section] ?? true}
                                    onChange={(_, expanded) => setExpandedSections(prev => ({ ...prev, [section]: expanded }))}
                                    sx={{
                                        background: isSubSection ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        borderTop: secColor
                                            ? `2px solid ${secColor}${isMySection ? '' : 'aa'}`
                                            : `2px solid ${c(isMySection ? 0.6 : isSubSection ? 0.1 : 0.2)}`,
                                        boxShadow: 'none',
                                        '&:before': { display: 'none' },
                                    }}
                                >
                                    <AccordionSummary expandIcon={<ExpandMore sx={{ color: 'rgba(237,237,237,0.4)' }} />} sx={{ px: 2, py: 0.5, minHeight: 40 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, mr: 1 }}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            {patchUrl && <img src={patchUrl} alt='' style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0, opacity: 0.9 }} />}
                                            <Typography
                                                fontSize={isSubSection ? '0.65rem' : '0.72rem'}
                                                fontWeight={700}
                                                letterSpacing={isSubSection ? 1.5 : 2}
                                                sx={{ textTransform: 'uppercase', flex: 1, color: isSubSection ? 'rgba(237,237,237,0.6)' : 'rgba(237,237,237,0.9)' }}
                                            >
                                                {section}
                                            </Typography>

                                            {/* Avatar stack — members who are attending */}
                                            {(() => {
                                                const attendingRecords = sectionRecords.filter(r =>
                                                    r.rsvp === 'attending' || r.importedStatus === 'ATTENDED' || r.confirmed
                                                )
                                                const MAX = 8
                                                const visible = attendingRecords.slice(0, MAX)
                                                const overflow = attendingRecords.length - MAX
                                                if (visible.length === 0) return null
                                                return (
                                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                        {visible.map((r, i) => (
                                                            <Tooltip key={r.userId} title={r.user?.displayName ?? r.userId} placement='top'>
                                                                <Avatar
                                                                    src={r.user?.avatarURL}
                                                                    sx={{
                                                                        width: 20, height: 20, fontSize: '0.5rem',
                                                                        background: c(0.4),
                                                                        border: '1.5px solid rgba(18,18,18,0.9)',
                                                                        ml: i === 0 ? 0 : '-6px',
                                                                        zIndex: visible.length - i,
                                                                    }}
                                                                >
                                                                    {r.user?.displayName?.charAt(0) ?? '?'}
                                                                </Avatar>
                                                            </Tooltip>
                                                        ))}
                                                        {overflow > 0 && (
                                                            <Box sx={{
                                                                width: 20, height: 20, borderRadius: '50%', ml: '-6px',
                                                                background: 'rgba(255,255,255,0.08)',
                                                                border: '1.5px solid rgba(18,18,18,0.9)',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontSize: '0.45rem', color: 'rgba(237,237,237,0.5)', zIndex: 0,
                                                            }}>
                                                                +{overflow}
                                                            </Box>
                                                        )}
                                                    </Box>
                                                )
                                            })()}

                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                                <Typography fontSize='0.65rem' sx={{ color: 'rgba(237,237,237,0.35)', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                                                    {isCompleted ? `${confirmedCnt}/${permRecords.length}` : `${attending}/${permRecords.length}`}
                                                </Typography>
                                                {(isCompleted ? resConfirmed : resAttending) > 0 && <>
                                                    <Box sx={{ width: 14, height: '1px', background: 'rgba(255,255,255,0.12)' }} />
                                                    <Typography fontSize='0.65rem' sx={{ color: 'rgba(219,0,29,0.75)', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                                                        +{isCompleted ? resConfirmed : resAttending}
                                                    </Typography>
                                                </>}
                                            </Box>
                                        </Box>
                                    </AccordionSummary>

                                    <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
                                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mb: 1.5 }} />

                                        {(() => {
                                            return sectionRecords.flatMap((record, recordIdx) => {
                                                const isReservist = !!record.reservistSection
                                                const prevIsReservist = recordIdx > 0 ? !!sectionRecords[recordIdx - 1].reservistSection : false
                                                const showDivider = isReservist && !prevIsReservist && isUpcomingOrActive && (data?.rsvpOpen ?? false)
                                                return [
                                                    showDivider ? (
                                                        <Box key={`divider-${record.userId}`} sx={{ my: 1 }}>
                                                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                                                                <Typography fontSize='0.58rem' sx={{ color: 'rgba(237,237,237,0.25)', letterSpacing: 1.5, textTransform: 'uppercase', px: 1 }}>
                                                                    Reservists
                                                                </Typography>
                                                            </Divider>
                                                        </Box>
                                                    ) : null,
                                                    <Box
                                                        key={record.userId}
                                                        sx={{
                                                            display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75,
                                                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                                                            background: record.userId === myUserId ? `${c(0.04)}` : 'transparent',
                                                            px: 0.5,
                                                            opacity: (data?.rsvpOpen && !record.reservistSection && record.rsvp === null) ? 0.4 : 1,
                                                            transition: 'opacity 0.2s',
                                                        }}
                                                    >
                                                        {/* Confirm checkbox (section leader / HQ only) */}
                                                        {canConfirm && (
                                                            <Checkbox
                                                                size='small'
                                                                checked={confirming[record.userId] ?? false}
                                                                onChange={e => { setConfirming(prev => ({ ...prev, [record.userId]: e.target.checked })); setConfirmingDirty(true) }}
                                                                sx={{ p: 0.25, color: c(0.4), '&.Mui-checked': { color: c(0.9) } }}
                                                            />
                                                        )}

                                                        {/* Avatar */}
                                                        <Avatar
                                                            src={record.user?.avatarURL}
                                                            sx={{ width: 22, height: 22, fontSize: '0.6rem', background: c(0.3) }}
                                                        >
                                                            {record.user?.displayName?.charAt(0) ?? '?'}
                                                        </Avatar>

                                                        {/* Name + role */}
                                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                                            <Typography component='div' fontSize='0.75rem' noWrap sx={{ lineHeight: 1.2 }}>
                                                                {record.orbatRole && <span style={{ color: 'rgba(237,237,237,0.35)', marginRight: 4 }}>{record.orbatRole}</span>}
                                                                {record.user?.displayName ?? record.userId}
                                                                {record.reservistSection && (
                                                                    <Chip label='Reservist' size='small' sx={{ ml: 0.5, fontSize: '0.55rem', height: 14, background: 'rgba(100,150,237,0.15)', color: 'rgba(100,150,237,0.9)' }} />
                                                                )}
                                                                {record.user?.isSkeletonAccount && (
                                                                    <Chip label='Pending' size='small' sx={{ ml: 0.5, fontSize: '0.55rem', height: 14, background: 'rgba(255,152,0,0.15)', color: '#ff9800' }} />
                                                                )}
                                                            </Typography>
                                                        </Box>

                                                        {/* RSVP / confirmation status */}
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                            {(isCompleted || (data?.confirmationOpen ?? false)) && record.confirmed && (
                                                                <Chip label='Confirmed' size='small' sx={{ fontSize: '0.55rem', height: 16, background: 'rgba(76,175,80,0.15)', color: '#4caf50' }} />
                                                            )}
                                                            {(() => {
                                                                const inConfirmStage = isCompleted || (data?.confirmationOpen ?? false)
                                                                const canSetType = (isHQ || isAllStaff || isSectionLeader) && inConfirmStage
                                                                if (inConfirmStage) {
                                                                    const effectiveType = record.attendanceType ?? record.importedStatus ?? null
                                                                    const typeDef = ATTENDANCE_TYPES.find(t => t.value === effectiveType)
                                                                    if (typeDef) {
                                                                        return (
                                                                            <Chip
                                                                                label={typeDef.label}
                                                                                size='small'
                                                                                onClick={canSetType ? (e) => setTypeAnchor({ el: e.currentTarget as HTMLElement, userId: record.userId }) : undefined}
                                                                                sx={{ fontSize: '0.55rem', height: 16, background: `${typeDef.color}22`, color: typeDef.color, border: `1px solid ${typeDef.color}44`, cursor: canSetType ? 'pointer' : 'default' }}
                                                                            />
                                                                        )
                                                                    }
                                                                    if (canSetType) {
                                                                        return (
                                                                            <IconButton size='small' onClick={(e) => setTypeAnchor({ el: e.currentTarget, userId: record.userId })} sx={{ p: 0.25, color: 'rgba(237,237,237,0.12)', '&:hover': { color: 'rgba(237,237,237,0.4)' } }}>
                                                                                <Add sx={{ fontSize: 12 }} />
                                                                            </IconButton>
                                                                        )
                                                                    }
                                                                    return null
                                                                }
                                                                if (data?.rsvpOpen) {
                                                                    if (record.rsvp === 'attending') return <CheckCircle sx={{ fontSize: 14, color: '#4caf50' }} />
                                                                    if (record.rsvp === 'not_attending') return <Cancel sx={{ fontSize: 14, color: 'rgba(219,0,29,0.9)' }} />
                                                                    return null
                                                                }
                                                                return rsvpIcon(record.rsvp)
                                                            })()}
                                                        </Box>
                                                    </Box>,
                                                ]
                                            })
                                        })()}

                                        {/* Join as Reservist / Rejoin your squad */}
                                        {isUpcomingOrActive && data?.rsvpOpen && myUserId && !sectionRecords.some(r => r.userId === myUserId) && (
                                            myOrbatSection === section && myReservistSection ? (
                                                <Button
                                                    size='small'
                                                    variant='text'
                                                    disabled={saving}
                                                    onClick={handleRejoinSection}
                                                    startIcon={<PersonAdd sx={{ fontSize: 12 }} />}
                                                    sx={{
                                                        mt: 0.5, fontSize: '0.6rem', letterSpacing: 2, textTransform: 'uppercase',
                                                        color: c(0.6),
                                                        '&:hover': { color: c(0.9), background: 'rgba(255,255,255,0.03)' },
                                                    }}
                                                >
                                                    Rejoin your squad
                                                </Button>
                                            ) : (
                                                <Button
                                                    size='small'
                                                    variant='text'
                                                    disabled={saving}
                                                    onClick={myReservistSection === section
                                                    ? () => handleJoinAsReservist(section)
                                                    : (e) => {
                                                        const roles = data?.sectionRolesMap?.[section] ?? []
                                                        if (roles.length > 0) {
                                                            setJoinRoleAnchor({ el: e.currentTarget as HTMLElement, sectionTitle: section })
                                                        } else {
                                                            handleJoinAsReservist(section)
                                                        }
                                                    }
                                                }
                                                    startIcon={<PersonAdd sx={{ fontSize: 12 }} />}
                                                    sx={{
                                                        mt: 0.5, fontSize: '0.6rem', letterSpacing: 2, textTransform: 'uppercase',
                                                        color: myReservistSection === section ? c(0.7) : 'rgba(237,237,237,0.15)',
                                                        '&:hover': { color: myReservistSection === section ? c(0.9) : 'rgba(237,237,237,0.4)', background: 'rgba(255,255,255,0.03)' },
                                                    }}
                                                >
                                                    {myReservistSection === section ? 'Leave Reservist' : 'Join as Reservist'}
                                                </Button>
                                            )
                                        )}

                                        {/* Confirm submit button */}
                                        {canConfirm && (isHQ || isAllStaff || isMySection) && (
                                            <Button
                                                size='small'
                                                variant='contained'
                                                disabled={saving}
                                                onClick={() => handleConfirmSubmit(section)}
                                                sx={{
                                                    mt: 1.5, fontSize: '0.65rem', letterSpacing: 2, textTransform: 'uppercase',
                                                    background: c(0.7), '&:hover': { background: c(0.9) },
                                                }}
                                            >
                                                Confirm Section Attendance
                                            </Button>
                                        )}
                                    </AccordionDetails>
                                </Accordion>
                            </Box>
                        )
                    })
                )
            )}

            {/* ── Attendance type popout ──────────────────────────────────── */}
            <Popover
                open={!!typeAnchor}
                anchorEl={typeAnchor?.el}
                onClose={() => setTypeAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                transformOrigin={{ vertical: 'top', horizontal: 'center' }}
                PaperProps={{ sx: { background: 'rgba(22,22,26,0.98)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' } }}
            >
                <Box sx={{ p: 0.75, display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 148 }}>
                    {ATTENDANCE_TYPES.map(t => (
                        <Button
                            key={t.value}
                            size='small'
                            onClick={() => handleSetType(t.value)}
                            sx={{ justifyContent: 'flex-start', fontSize: '0.65rem', color: t.color, py: 0.5, px: 1, letterSpacing: 0.5, '&:hover': { background: `${t.color}18` } }}
                        >
                            {t.label}
                        </Button>
                    ))}
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 0.25 }} />
                    <Button
                        size='small'
                        onClick={() => handleSetType(null)}
                        sx={{ justifyContent: 'flex-start', fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', py: 0.5, px: 1, '&:hover': { background: 'rgba(255,255,255,0.04)' } }}
                    >
                        Clear
                    </Button>
                </Box>
            </Popover>

            {/* ── Join as reservist: role picker popup ──────────────────────────── */}
            {joinRoleAnchor && (() => {
                const joinRoles = data?.sectionRolesMap?.[joinRoleAnchor.sectionTitle] ?? []
                const joinOccupied = new Set(
                    (data?.recordsWithUsers ?? [])
                        .filter(r => !r.reservistSection && r.rsvp === 'attending' && (r.orbatSection || r.unit) === joinRoleAnchor.sectionTitle)
                        .map(r => r.orbatRole)
                        .filter(Boolean)
                )
                return (
                    <Popover
                        open
                        anchorEl={joinRoleAnchor.el}
                        onClose={() => setJoinRoleAnchor(null)}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
                        PaperProps={{ sx: { background: 'rgba(22,22,26,0.98)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' } }}
                    >
                        <Box sx={{ p: 0.75, display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 180 }}>
                            <Typography fontSize='0.58rem' sx={{ letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', px: 1, pt: 0.25, pb: 0.5 }}>
                                Select a role
                            </Typography>
                            {joinRoles.map(({ role }, roleIdx) => {
                                const isOccupied = joinOccupied.has(role)
                                return (
                                    <Button
                                        key={`${roleIdx}-${role}`}
                                        size='small'
                                        onClick={() => { setJoinRoleAnchor(null); handleJoinAsReservist(joinRoleAnchor.sectionTitle, role) }}
                                        sx={{ justifyContent: 'space-between', fontSize: '0.65rem', color: 'rgba(237,237,237,0.7)', py: 0.5, px: 1, letterSpacing: 0.5, '&:hover': { background: 'rgba(255,255,255,0.06)' } }}
                                    >
                                        <span>{role}</span>
                                        {isOccupied && (
                                            <Chip label='In use' size='small' sx={{ fontSize: '0.5rem', height: 14, background: 'rgba(255,152,0,0.15)', color: '#ff9800', ml: 1 }} />
                                        )}
                                    </Button>
                                )
                            })}
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 0.25 }} />
                            <Button
                                size='small'
                                onClick={() => { setJoinRoleAnchor(null); handleJoinAsReservist(joinRoleAnchor.sectionTitle) }}
                                sx={{ justifyContent: 'flex-start', fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', py: 0.5, px: 1, '&:hover': { background: 'rgba(255,255,255,0.04)' } }}
                            >
                                Join without a role
                            </Button>
                        </Box>
                    </Popover>
                )
            })()}

            {saving && (
                <Box sx={{ position: 'fixed', bottom: 16, right: 16 }}>
                    <CircularProgress size={20} sx={{ color: c(0.8) }} />
                </Box>
            )}

            {/* ── HQ manage dialog ───────────────────────────────────────── */}
            {isHQ && (
                <AttendanceManageDialog
                    open={manageOpen}
                    onClose={() => setManageOpen(false)}
                    operationId={operationId}
                    sections={Array.from(new Map(
                        records.map(r => [r.category ?? 'other', r])
                    ).keys()).flatMap(cat =>
                        [...new Set(
                            records.filter(r => (r.category ?? 'other') === cat)
                                   .map(r => r.reservistSection || r.orbatSection || r.unit)
                        )]
                    )}
                    records={records.map(r => ({
                        userId: r.userId,
                        displayName: r.user?.displayName ?? r.userId,
                        avatarURL: r.user?.avatarURL ?? '',
                        orbatRole: r.orbatRole ?? '',
                        orbatSection: r.orbatSection ?? r.unit ?? '',
                        currentSection: r.reservistSection || r.orbatSection || r.unit || '',
                        rsvp: r.rsvp,
                        confirmed: r.confirmed,
                    }))}
                    themeColor={themeColor}
                    onSaved={refreshData}
                />
            )}
        </Box>
    )
}
