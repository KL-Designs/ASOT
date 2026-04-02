'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    Box, Typography, Button, Chip, Divider, CircularProgress,
    Checkbox, FormControlLabel, FormGroup,
    Accordion, AccordionSummary, AccordionDetails, Avatar,
    Switch, Tooltip,
} from '@mui/material'
import {
    ExpandMore, CheckCircle, Cancel, HelpOutline,
    Lock, LockOpen, PersonAdd,
} from '@mui/icons-material'

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
}

interface Props {
    operationId: string
    operationStatus: string
    myUserId: string | null
    isHQ: boolean
    isSectionLeader: boolean
    themeColor: string
}

const PLATOON_OPTIONS = [
    { id: 'companyHQ', label: '1-0 HQ' },
    { id: 'platoon11', label: '1-1 Platoon' },
    { id: 'platoon12', label: '1-2 Platoon' },
    { id: 'support',   label: '1-3 Support Platoon' },
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
    const firstSectionByCategory = new Map<string, string>()

    for (const r of records) {
        const cat = r.category ?? 'other'
        const sectionKey = r.reservistSection || r.orbatSection || r.unit || 'Unknown'

        if (!result.has(cat)) result.set(cat, [])
        const catSections = result.get(cat)!

        let entry = catSections.find(s => s.title === sectionKey)
        if (!entry) {
            const isSubSection = firstSectionByCategory.has(cat) && cat !== 'companyHQ' && cat !== 'other'
            if (!firstSectionByCategory.has(cat)) firstSectionByCategory.set(cat, sectionKey)
            entry = { title: sectionKey, isSubSection, records: [] }
            catSections.push(entry)
        }
        entry.records.push(r)
    }

    return result
}

// ── AttendancePanel ───────────────────────────────────────────────────────────

export default function AttendancePanel({
    operationId, operationStatus, myUserId, isHQ, isSectionLeader, themeColor,
}: Props) {
    const [data, setData]               = useState<AttendanceData | null>(null)
    const [loading, setLoading]         = useState(true)
    const [saving, setSaving]           = useState(false)
    const [myRsvp, setMyRsvp]           = useState<'attending' | 'not_attending' | null>(null)
    const [myReservistSection, setMyReservistSection] = useState<string>('')
    const [confirming, setConfirming]   = useState<Record<string, boolean>>({})
    const [confirmingDirty, setConfirmingDirty] = useState(false)

    const r = parseInt(themeColor.replace('#', '').substring(0, 2), 16)
    const g = parseInt(themeColor.replace('#', '').substring(2, 4), 16)
    const b = parseInt(themeColor.replace('#', '').substring(4, 6), 16)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`

    const isUpcomingOrActive = operationStatus === 'Upcoming' || operationStatus === 'Active'
    const isCompleted        = operationStatus === 'Completed'

    // ── Fetch ──────────────────────────────────────────────────────────────────

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/operations/${operationId}/attendance`)
            if (res.ok) {
                const d: AttendanceData = await res.json()
                setData(d)
                if (myUserId) {
                    const mine = d.recordsWithUsers.find(r => r.userId === myUserId)
                    setMyRsvp(mine?.rsvp ?? null)
                    setMyReservistSection(mine?.reservistSection ?? '')
                }
                // Pre-populate confirmation state from existing data
                const init: Record<string, boolean> = {}
                for (const r of d.recordsWithUsers) init[r.userId] = r.confirmed
                setConfirming(init)
            }
        } finally {
            setLoading(false)
        }
    }, [operationId, myUserId])

    useEffect(() => { fetchData() }, [fetchData])

    // ── Live polling ───────────────────────────────────────────────────────────
    useEffect(() => {
        const interval = setInterval(async () => {
            if (saving) return
            try {
                const res = await fetch(`/api/operations/${operationId}/attendance`)
                if (!res.ok) return
                const d: AttendanceData = await res.json()
                setData(d)
                if (myUserId) {
                    const mine = d.recordsWithUsers.find(r => r.userId === myUserId)
                    setMyRsvp(mine?.rsvp ?? null)
                    setMyReservistSection(mine?.reservistSection ?? '')
                }
                if (!confirmingDirty) {
                    const init: Record<string, boolean> = {}
                    for (const r of d.recordsWithUsers) init[r.userId] = r.confirmed
                    setConfirming(init)
                }
            } catch { }
        }, 15000)
        return () => clearInterval(interval)
    }, [operationId, myUserId, saving, confirmingDirty])

    // ── RSVP ───────────────────────────────────────────────────────────────────

    const handleRsvp = async (status: 'attending' | 'not_attending') => {
        if (!data?.rsvpOpen) return
        const next = myRsvp === status ? null : status
        setMyRsvp(next)
        setSaving(true)
        try {
            await fetch(`/api/operations/${operationId}/attendance/rsvp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: next ?? 'not_attending',
                    ...(myReservistSection ? { reservistSection: myReservistSection } : {}),
                }),
            })
            await fetchData()
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
            await fetchData()
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
            await fetchData()
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
            await fetchData()
        } finally {
            setSaving(false)
        }
    }

    // ── Reservist: join a section ──────────────────────────────────────────────

    const handleJoinAsReservist = async (sectionTitle: string) => {
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
                }),
            })
            await fetchData()
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
            await fetchData()
        } finally {
            setSaving(false)
        }
    }

    // ── Section leader: confirm ────────────────────────────────────────────────

    const handleConfirmSubmit = async (sectionTitle: string) => {
        if (!data?.confirmationOpen) return
        const sectionRecords = (data.recordsWithUsers).filter(r => r.orbatSection === sectionTitle)
        const confirmedIds   = sectionRecords.filter(r => confirming[r.userId]).map(r => r.userId)
        setSaving(true)
        try {
            await fetch(`/api/operations/${operationId}/attendance/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmedUserIds: confirmedIds }),
            })
            setConfirmingDirty(false)
            await fetchData()
        } finally {
            setSaving(false)
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress sx={{ color: c(0.8) }} size={28} />
            </Box>
        )
    }

    const records        = data?.recordsWithUsers ?? []
    const byCategory     = groupByCategoryAndSection(records)
    const myOrbatSection = myUserId ? records.find(r => r.userId === myUserId)?.orbatSection : undefined

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
            {myUserId && isUpcomingOrActive && data?.rsvpOpen && (
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
                        const attending    = sectionRecords.filter(r => r.rsvp === 'attending' || r.importedStatus === 'ATTENDED').length
                        const confirmedCnt = sectionRecords.filter(r => r.confirmed).length
                        const canConfirm   = isCompleted && (isSectionLeader || isHQ) && (data?.confirmationOpen ?? false)
                        const isMySection  = sectionRecords.some(r => r.userId === myUserId)

                        return (
                            <Box key={section} sx={isSubSection ? { ml: 2, borderLeft: '2px solid rgba(255,255,255,0.06)' } : {}}>
                                <Accordion
                                    defaultExpanded={isMySection}
                                    sx={{
                                        background: isSubSection ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        borderTop: `2px solid ${c(isMySection ? 0.6 : isSubSection ? 0.1 : 0.2)}`,
                                        boxShadow: 'none',
                                        '&:before': { display: 'none' },
                                    }}
                                >
                                    <AccordionSummary expandIcon={<ExpandMore sx={{ color: 'rgba(237,237,237,0.4)' }} />} sx={{ px: 2, py: 0.5, minHeight: 40 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, mr: 1 }}>
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

                                            <Typography fontSize='0.65rem' sx={{ color: 'rgba(237,237,237,0.35)', letterSpacing: 1 }}>
                                                {isCompleted ? `${confirmedCnt}/${sectionRecords.length}` : `${attending}/${sectionRecords.length}`}
                                            </Typography>
                                        </Box>
                                    </AccordionSummary>

                                    <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
                                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mb: 1.5 }} />

                                        {sectionRecords.map(record => (
                                            <Box
                                                key={record.userId}
                                                sx={{
                                                    display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75,
                                                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                                                    background: record.userId === myUserId ? `${c(0.04)}` : 'transparent',
                                                    px: 0.5,
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
                                                    <Typography fontSize='0.75rem' noWrap sx={{ lineHeight: 1.2 }}>
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

                                                {/* RSVP / status indicator */}
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    {isCompleted && record.confirmed && (
                                                        <Chip label='Confirmed' size='small' sx={{ fontSize: '0.55rem', height: 16, background: 'rgba(76,175,80,0.15)', color: '#4caf50' }} />
                                                    )}
                                                    {record.importedStatus ? (
                                                        <Typography fontSize='0.6rem' letterSpacing={1} sx={{ textTransform: 'uppercase', color: record.importedStatus === 'ATTENDED' ? 'rgba(76,175,80,0.7)' : 'rgba(237,237,237,0.2)' }}>
                                                            {record.importedStatus}
                                                        </Typography>
                                                    ) : (
                                                        rsvpIcon(record.rsvp)
                                                    )}
                                                </Box>
                                            </Box>
                                        ))}

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
                                                    onClick={() => handleJoinAsReservist(section)}
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
                                        {canConfirm && (isHQ || isMySection) && (
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

            {saving && (
                <Box sx={{ position: 'fixed', bottom: 16, right: 16 }}>
                    <CircularProgress size={20} sx={{ color: c(0.8) }} />
                </Box>
            )}
        </Box>
    )
}
