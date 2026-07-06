'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import ConfirmDialog from '@/components/confirm-dialog'
import dayjs, { Dayjs } from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import dynamic from 'next/dynamic'
import PERMISSIONS from '@/lib/permissions'
import ActivityLog from './activity-log'
const OperationEditor = dynamic(() => import('@/components/editor/CollabEditor'), { ssr: false })

interface MetaFields { title: string; department: string; date: string; loreDate: string }

type AttendanceStage = 'preparing' | 'rsvp_open' | 'rsvp_closed' | 'op_running' | 'confirmations_open' | 'completed'

const STAGE_DEFS: { id: AttendanceStage; label: string; sub: string }[] = [
    { id: 'preparing',          label: 'Preparing',    sub: '' },
    { id: 'rsvp_open',          label: 'RSVP',         sub: 'Open' },
    { id: 'rsvp_closed',        label: 'RSVP',         sub: 'Closed' },
    { id: 'op_running',         label: 'Op',           sub: 'Running' },
    { id: 'confirmations_open', label: 'Confirm',      sub: 'Open' },
    { id: 'completed',          label: 'Completed',    sub: '' },
]

function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}


export default function Page() {
    const { id: routeId } = useParams<{ id: string }>()
    const editSearchParams = useSearchParams()
    const fromJ2 = editSearchParams?.get('from') === 'j2'

    const [opID, setOpID] = useState(routeId || '')
    const [title, setTitle] = useState('')
    const [date, setDate] = useState<Dayjs | null>(null)
    const [loreDate, setLoreDate] = useState<string>('')
    const [loreDateDayjs, setLoreDateDayjs] = useState<Dayjs | null>(null)
    const [department, setDepartment] = useState('')
    const [themeColor, setThemeColor] = useState('#db001d')
    const [pageTheme, setPageTheme] = useState<string>('modern')
    const [eraOptions, setEraOptions] = useState<{ _id: string; name: string; value: string }[]>([])
    const [customTheme, setCustomTheme] = useState<string>('')
    const [status, setStatus] = useState<string>('Upcoming')
    const [coverImage, setCoverImage] = useState<string | null>(null)
    const [coverUploading, setCoverUploading] = useState(false)
    const [mapWorld, setMapWorld] = useState<string>('')
    const [availableWorlds, setAvailableWorlds] = useState<{ name: string; displayName: string; hasPreview: boolean }[]>([])
    const [isHQ, setIsHQ] = useState(false)
    const [isJ2Lead, setIsJ2Lead] = useState(false)
    const [isJ4Admin, setIsJ4Admin] = useState(false)
    const [initialContent, setInitialContent] = useState<any>(undefined)
    const [loaded, setLoaded] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')

    // Mission Development
    const [missionDev, setMissionDev] = useState<MissionDevelopment | null>(null)
    const [missionDevOpen, setMissionDevOpen] = useState(true)
    const [missionDevSaving, setMissionDevSaving] = useState(false)
    const [isCampaignOp, setIsCampaignOp] = useState(false)
    const [campaignStartDate, setCampaignStartDate] = useState<string | null>(null)
    const [completingCheckId, setCompletingCheckId] = useState<string | null>(null)
    const [completionReviewerName, setCompletionReviewerName] = useState('')
    const [completionComments, setCompletionComments] = useState('')
    const [completionOutcome, setCompletionOutcome] = useState('')

    // Publish flow
    const [publishSaving, setPublishSaving] = useState(false)
    const [publishConfirmOpen, setPublishConfirmOpen] = useState(false)

    // Ownership
    const [ownedBy, setOwnedBy] = useState('')
    const [ownedByName, setOwnedByName] = useState('')
    const [billetPoints, setBilletPoints] = useState(2)
    const [j2Members, setJ2Members] = useState<{ id: string; displayName: string }[]>([])
    const [ownerPickerOpen, setOwnerPickerOpen] = useState(false)

    // Acknowledgements
    const [ackCount, setAckCount] = useState(0)
    const [ackList, setAckList] = useState<{ userId: string; userName: string; acknowledgedAt: string }[]>([])
    const [ackExpanded, setAckExpanded] = useState(false)
    const [remindSaving, setRemindSaving] = useState(false)
    const [remindSent, setRemindSent] = useState<number | null>(null)

    // Orders Check Request
    const [ordersCheckModal, setOrdersCheckModal]           = useState(false)
    const [ordersCheckPreferredAt, setOrdersCheckPreferredAt] = useState<Dayjs | null>(null)
    const [ordersCheckComments, setOrdersCheckComments]     = useState('')
    const [ordersCheckSaving, setOrdersCheckSaving]         = useState(false)
    const [ordersCheckTask, setOrdersCheckTask]             = useState<null | { _id?: string; status: string; ordersCheckAt?: string; ordersCheckStatus?: string; ordersCheckProposedAt?: string; ordersCheckProposedBy?: string }>(null)
    const [ordersCheckCancelling, setOrdersCheckCancelling] = useState(false)
    const [ordersCheckReminderAt, setOrdersCheckReminderAt] = useState<Dayjs | null>(null)
    const [ordersCheckReminderSaving, setOrdersCheckReminderSaving] = useState(false)
    const [ordersCheckReminderSet, setOrdersCheckReminderSet] = useState(false)

    const [assignedPlatoons, setAssignedPlatoons] = useState<string[]>([])
    const [discordPingEnabled, setDiscordPingEnabled] = useState(false)
    const [discordPingRoles, setDiscordPingRoles] = useState<string[]>([])
    const [rsvpOpen, setRsvpOpen] = useState(false)
    const [confirmationOpen, setConfirmationOpen] = useState(false)
    const [confirmationOpenedAt, setConfirmationOpenedAt] = useState<Date | null>(null)
    const [rsvpOpenAt, setRsvpOpenAt] = useState<string | null>(null)
    const [rsvpCloseOffsetMins, setRsvpCloseOffsetMins] = useState(90)
    const [attendanceSaving, setAttendanceSaving] = useState(false)
    const [tickNow, setTickNow] = useState(() => new Date())

    // Draft state for the schedule panel — only committed on "Confirm Schedule"
    const [draftDate, setDraftDate] = useState<Dayjs | null>(null)
    const [draftRsvpOpenAt, setDraftRsvpOpenAt] = useState<string | null>(null)
    const [draftRsvpCloseOffsetMins, setDraftRsvpCloseOffsetMins] = useState(90)
    const [draftRsvpCloseMode, setDraftRsvpCloseMode] = useState<'preset' | 'custom'>('preset')
    const [draftRsvpCloseAt, setDraftRsvpCloseAt] = useState<string | null>(null)
    const [scheduleSaving, setScheduleSaving] = useState(false)
    const [attendanceOpen, setAttendanceOpen] = useState(true)
    const [scheduleOpen, setScheduleOpen] = useState(true)

    const [attStage, setAttStage] = useState<AttendanceStage>('preparing')
    const [confirmStage, setConfirmStage] = useState<AttendanceStage | null>(null)

    const [confirmDelete, setConfirmDelete] = useState(false)
    const [previewOpen, setPreviewOpen] = useState(false)
    const [activityOpen, setActivityOpen] = useState(false)
    const router = useRouter()

    // Custom attendance units
    const [customUnits, setCustomUnits] = useState<{ id: string; name: string; color?: string }[]>([])
    const [customUnitsOpen, setCustomUnitsOpen] = useState(false)
    const [newUnitName, setNewUnitName] = useState('')
    const [newUnitColor, setNewUnitColor] = useState('#6366f1')
    const [customUnitsSaving, setCustomUnitsSaving] = useState(false)

    const metaSaveTimer = useRef<ReturnType<typeof setTimeout>>()
    const metaHandleRef = useRef<{ set: (key: string, value: string) => void } | null>(null)
    const previewIframeRef = useRef<HTMLIFrameElement>(null)

    useEffect(() => {
        const id = setInterval(() => setTickNow(new Date()), 1000)
        return () => clearInterval(id)
    }, [])

    // Client-side auto-open/close/activate: fire the moment the scheduled time crosses zero
    // so we don't wait up to 5 minutes for the next cron tick.
    const autoOpenFiredRef       = useRef<string | null>(null)
    const autoCloseFiredRef      = useRef<string | null>(null)
    const autoActivateFiredRef   = useRef<string | null>(null)
    const autoConfirmFiredRef    = useRef<string | null>(null)
    useEffect(() => {
        if (!isHQ || !opID) return

        // Auto-open (skip if still In Development)
        if (rsvpOpenAt && !rsvpOpen && status !== 'In Development') {
            if (autoOpenFiredRef.current !== rsvpOpenAt && new Date(rsvpOpenAt) <= tickNow) {
                autoOpenFiredRef.current = rsvpOpenAt
                setRsvpOpen(true)
                setAttStage('rsvp_open')
                saveAttendanceSettings({ rsvpOpen: true, stage: 'rsvp_open' })
                return
            }
        }

        // Auto-close: fires when op date is known and close offset has been reached
        if (rsvpOpen && date) {
            const closeAt = new Date(date.toDate().getTime() - rsvpCloseOffsetMins * 60000)
            const closeKey = closeAt.toISOString()
            if (autoCloseFiredRef.current !== closeKey && tickNow >= closeAt) {
                autoCloseFiredRef.current = closeKey
                // Also stamp the open-ref so the auto-open can't immediately re-fire
                if (rsvpOpenAt) autoOpenFiredRef.current = rsvpOpenAt
                setRsvpOpen(false)
                setAttStage('rsvp_closed')
                saveAttendanceSettings({ rsvpOpen: false, stage: 'rsvp_closed' })
            }
        }

        // Auto-activate: Upcoming → Active when op date is reached
        if (status === 'Upcoming' && date) {
            const activateAt = date.toDate()
            const activateKey = activateAt.toISOString()
            if (autoActivateFiredRef.current !== activateKey && tickNow >= activateAt) {
                autoActivateFiredRef.current = activateKey
                fetch(`/api/operations/update?id=${opID}&status=Active`).then(() => {
                    setStatus('Active')
                    setAttStage('op_running')
                    saveAttendanceSettings({ stage: 'op_running' })
                })
            }
        }

        // Auto-open confirmation: fires when status is Completed and confirmation not yet open
        if (status === 'Completed' && !confirmationOpen && !confirmationOpenedAt) {
            const confirmKey = `confirm-${opID}`
            if (autoConfirmFiredRef.current !== confirmKey) {
                autoConfirmFiredRef.current = confirmKey
                const now = new Date()
                setConfirmationOpen(true)
                setConfirmationOpenedAt(now)
                setAttStage('confirmations_open')
                saveAttendanceSettings({ confirmationOpen: true, stage: 'confirmations_open' })
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tickNow])

    useEffect(() => {
        const id = routeId || ''
        setOpID(id)

        if (!id) return

        fetch(`/api/me/roles?has=${PERMISSIONS.pages.operationsEdit.join(',')}`)
            .then(r => r.json())
            .then(json => { if (!json.error) setIsHQ(json.access) })

        fetch(`/api/me/roles?has=${PERMISSIONS.departmentLeads.j2.join(',')}`)
            .then(r => r.json())
            .then(json => { if (!json.error) setIsJ2Lead(json.access) })

        fetch(`/api/me/roles?has=${PERMISSIONS.members.editRestricted.join(',')}`)
            .then(r => r.json())
            .then(json => { if (!json.error) setIsJ4Admin(json.access) })

        fetch('/api/maps/worlds')
            .then(r => r.json())
            .then(worlds => { if (Array.isArray(worlds)) setAvailableWorlds(worlds) })

        fetch('/api/admin/era-options')
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setEraOptions(data) })

        fetch(`/api/operations?id=${id}`)
            .then(r => r.json())
            .then(json => {
                if (json.error) return
                const op: Operation = json.mission
                setTitle(op.title || '')
                const opDate = op.date ? dayjs(op.date) : null
                setDate(opDate)
                setDraftDate(opDate)
                const loreDateStr = op.loreDate instanceof Date ? op.loreDate.toISOString() : (op.loreDate ?? '')
                setLoreDate(loreDateStr)
                const parsed = loreDateStr ? dayjs(loreDateStr) : null
                setLoreDateDayjs(parsed?.isValid() ? parsed : null)
                setDepartment(op.department || '')
                setThemeColor(op.themeColor || '#db001d')
                setPageTheme(op.pageTheme || 'modern')
                setCustomTheme((op as any).customTheme || '')
                setStatus(op.status || 'Upcoming')
                setCoverImage(op.coverImage || null)
                setMapWorld(op.mapWorld || '')
                setInitialContent(op.content ?? null)
                setLoaded(true)

                // Mission Development
                const hasCampaign = !!(op as any).campaignId
                setIsCampaignOp(hasCampaign)
                setMissionDev((op as any).missionDevelopment ?? null)
                if (hasCampaign) {
                    fetch(`/api/operations/campaigns`)
                        .then(r => r.json())
                        .then(data => {
                            const campId = String((op as any).campaignId)
                            const camp = (data.campaigns ?? []).find((c: any) => String(c._id) === campId)
                            if (camp?.startDate) setCampaignStartDate(camp.startDate)
                        })
                        .catch(() => {})
                }

                // Load any existing orders_check task
                fetch(`/api/operations/${id}/orders-check`)
                    .then(r => r.ok ? r.json() : null)
                    .then(d => { if (d?.task) setOrdersCheckTask(d.task) })
                    .catch(() => {})

                // Ownership
                if ((op as any).ownedBy) setOwnedBy((op as any).ownedBy)
                if ((op as any).ownedByName) setOwnedByName((op as any).ownedByName)
                if ((op as any).billetPoints != null) setBilletPoints((op as any).billetPoints)

                // Acknowledgements
                fetch(`/api/operations/${id}/acknowledge`)
                    .then(r => r.ok ? r.json() : null)
                    .then(d => { if (d) { setAckCount(d.count ?? 0); setAckList(d.acks ?? []) } })
                    .catch(() => {})
            })

        fetch(`/api/operations/${id}/attendance/custom-units`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setCustomUnits(d.customUnits ?? []) })
            .catch(() => {})

        fetch(`/api/operations/${id}/attendance`)
            .then(r => r.json())
            .then(json => {
                if (json.error) return
                setAssignedPlatoons(json.assignedPlatoons ?? [])
                setDiscordPingEnabled(json.discordPingEnabled ?? false)
                setDiscordPingRoles(json.discordPingRoles ?? [])
                setRsvpOpen(json.rsvpOpen ?? false)
                setConfirmationOpen(json.confirmationOpen ?? false)
                setConfirmationOpenedAt(json.confirmationOpenedAt ? new Date(json.confirmationOpenedAt) : null)
                const openAt = json.rsvpOpenAt ? new Date(json.rsvpOpenAt).toISOString() : null
                setRsvpOpenAt(openAt)
                setRsvpCloseOffsetMins(json.rsvpCloseOffsetMins ?? 90)
                setDraftRsvpOpenAt(openAt)
                setDraftRsvpCloseOffsetMins(json.rsvpCloseOffsetMins ?? 90)
                setAttStage(json.stage ?? 'preparing')
                // If RSVP is already open when we load, mark the auto-open as already fired
                // so the close→re-open bounce can't happen.
                if (json.rsvpOpen && openAt) autoOpenFiredRef.current = openAt
            })
    }, [routeId])


    function scheduleSave(updates: Record<string, string>) {
        setSaveStatus('unsaved')
        clearTimeout(metaSaveTimer.current)
        metaSaveTimer.current = setTimeout(async () => {
            setSaveStatus('saving')
            const qs = Object.entries(updates).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
            try {
                await fetch(`/api/operations/update?id=${opID}&${qs}`)
                setSaveStatus('saved')
            } catch {
                setSaveStatus('unsaved')
            }
        }, 1000)
    }

    async function uploadCover(file: File) {
        setCoverUploading(true)
        const form = new FormData()
        form.append('file', file)
        try {
            const res = await fetch('/api/operations/upload', { method: 'POST', body: form })
            const json = await res.json()
            if (json.url) {
                setCoverImage(json.url)
                await fetch(`/api/operations/update?id=${opID}&coverImage=${encodeURIComponent(json.url)}`)
            }
        } finally {
            setCoverUploading(false)
        }
    }

    async function handleDelete() {
        const json = await fetch(`/api/operations/delete?id=${opID}`).then(r => r.json())
        if (json.error) { alert(json.error); return }
        router.push('/operations')
    }

    async function removeCover() {
        setCoverImage(null)
        await fetch(`/api/operations/update?id=${opID}&coverImage=`)
    }

    async function saveAttendanceSettings(updates: {
        assignedPlatoons?: string[]
        discordPingEnabled?: boolean
        discordPingRoles?: string[]
        rsvpOpen?: boolean
        confirmationOpen?: boolean
        rsvpOpenAt?: string | null
        rsvpCloseOffsetMins?: number
        stage?: AttendanceStage
    }) {
        setAttendanceSaving(true)
        try {
            const res = await fetch(`/api/operations/${opID}/attendance/platoons`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assignedPlatoons: updates.assignedPlatoons ?? assignedPlatoons,
                    discordPingEnabled: updates.discordPingEnabled ?? discordPingEnabled,
                    discordPingRoles: updates.discordPingRoles ?? discordPingRoles,
                    reservistAssignments: [],
                    ...(updates.rsvpOpen !== undefined && { rsvpOpen: updates.rsvpOpen }),
                    ...(updates.confirmationOpen !== undefined && { confirmationOpen: updates.confirmationOpen }),
                    ...(updates.rsvpOpenAt !== undefined && { rsvpOpenAt: updates.rsvpOpenAt }),
                    ...(updates.rsvpCloseOffsetMins !== undefined && { rsvpCloseOffsetMins: updates.rsvpCloseOffsetMins }),
                    ...(updates.stage !== undefined && { stage: updates.stage }),
                }),
            })
            if (!res.ok) return
            const json = await res.json()
            // If the API resolved rsvpOpen server-side (e.g. past rsvpOpenAt), reflect that immediately
            if (json.rsvpOpen !== undefined) setRsvpOpen(json.rsvpOpen)
        } finally {
            setAttendanceSaving(false)
        }
    }

    async function confirmSchedule() {
        setScheduleSaving(true)
        try {
            // Save operation date if changed
            if (draftDate && draftDate.toISOString() !== date?.toISOString()) {
                metaHandleRef.current?.set('date', draftDate.toISOString())
                await fetch(`/api/operations/update?id=${opID}&date=${encodeURIComponent(draftDate.toISOString())}`)
                setDate(draftDate)
            }
            // Save automation settings if changed
            const attUpdates: Parameters<typeof saveAttendanceSettings>[0] = {}
            if (draftRsvpOpenAt !== rsvpOpenAt) attUpdates.rsvpOpenAt = draftRsvpOpenAt
            if (draftRsvpCloseOffsetMins !== rsvpCloseOffsetMins) attUpdates.rsvpCloseOffsetMins = draftRsvpCloseOffsetMins
            if (Object.keys(attUpdates).length > 0) await saveAttendanceSettings(attUpdates)
            setRsvpOpenAt(draftRsvpOpenAt)
            setRsvpCloseOffsetMins(draftRsvpCloseOffsetMins)
        } finally {
            setScheduleSaving(false)
        }
    }

    async function applyStage(newStage: AttendanceStage) {
        const updates: Parameters<typeof saveAttendanceSettings>[0] = { stage: newStage }
        if (newStage === 'rsvp_open') {
            setRsvpOpen(true);        updates.rsvpOpen = true
        } else if (newStage === 'rsvp_closed') {
            setRsvpOpen(false);       updates.rsvpOpen = false
        } else if (newStage === 'op_running') {
            setRsvpOpen(false);       updates.rsvpOpen = false
            await fetch(`/api/operations/update?id=${opID}&status=Active`)
            setStatus('Active')
        } else if (newStage === 'confirmations_open') {
            setRsvpOpen(false);       updates.rsvpOpen = false
            setConfirmationOpen(true);updates.confirmationOpen = true
            await fetch(`/api/operations/update?id=${opID}&status=Completed`)
            setStatus('Completed')
        } else if (newStage === 'completed') {
            setConfirmationOpen(false);updates.confirmationOpen = false
        } else {
            // preparing
            setRsvpOpen(false);       updates.rsvpOpen = false
        }
        setAttStage(newStage)
        await saveAttendanceSettings(updates)
    }

    const PLATOON_OPTS = [
        { id: 'companyHQ', label: '1-0 HQ',            color: 'rgba(185,0,24,0.7)' },
        { id: 'platoon11', label: '1-1 Platoon',         color: 'rgba(194,120,0,0.7)' },
        { id: 'platoon12', label: '1-2 Platoon',         color: 'rgba(12,155,100,0.7)' },
        { id: 'support',   label: '1-3 Support Platoon', color: 'rgba(42,95,185,0.7)' },
    ]

    const { r, g, b } = hexToRgb(themeColor)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`

    // Derive the displayed stage from live state so it stays in sync with cron/DB changes.
    // attStage (DB-stored) is only used to distinguish 'preparing' vs 'rsvp_closed',
    // since both have rsvpOpen=false and status=Upcoming.
    const displayStage: AttendanceStage = (() => {
        if (status === 'Completed') {
            if (confirmationOpen) return 'confirmations_open'
            return 'completed'
        }
        if (status === 'Active') return 'op_running'
        if (rsvpOpen)            return 'rsvp_open'
        return attStage === 'rsvp_closed' ? 'rsvp_closed' : 'preparing'
    })()

    const STATUS_COLORS: Record<string, string> = {
        'Active':         'rgba(0,200,80,0.9)',
        'Upcoming':       'rgba(219,160,0,0.9)',
        'Completed':      'rgba(100,150,237,0.8)',
        'In Development': 'rgba(219,0,29,0.75)',
    }
    const currentStatusColor = STATUS_COLORS[status] || 'rgba(237,237,237,0.5)'

    const statusColor = saveStatus === 'saved' ? 'rgba(100,220,100,0.65)' : saveStatus === 'saving' ? 'rgba(219,0,29,0.65)' : 'rgba(237,200,0,0.65)'
    const statusLabel = saveStatus === 'saved' ? '● Saved' : saveStatus === 'saving' ? '● Saving…' : '● Unsaved'

    if (!loaded) return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            minHeight: '80vh', gap: 20,
        }}>
            <style>{`
                @keyframes edit-spin { to { transform: rotate(360deg) } }
                @keyframes edit-fade { 0%,100%{opacity:.3} 50%{opacity:.85} }
            `}</style>
            {/* Spinner */}
            <div style={{
                width: 36, height: 36,
                border: `2px solid rgba(219,0,29,0.12)`,
                borderTop: `2px solid rgba(219,0,29,0.75)`,
                borderRadius: '50%',
                animation: 'edit-spin 0.8s linear infinite',
            }} />
            <span style={{
                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.28em',
                textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)',
                animation: 'edit-fade 1.8s ease-in-out infinite',
            }}>
                Loading Operation…
            </span>
        </div>
    )

    return (
        <div className='w-full' style={{
            paddingRight: previewOpen ? 'clamp(360px, 40vw, 700px)' : activityOpen ? 'clamp(280px, 30vw, 460px)' : 0,
            transition: 'padding-right 0.25s ease',
        }}>

            {/* Edit column — natural flow, body scrolls */}
            <div style={{
                width: '100%',
                maxWidth: 1220,
                margin: '0 auto',
                flexShrink: 0,
                padding: 'clamp(1.5rem, 2.5vw, 2.5rem)',
            }}>

            <ConfirmDialog
                open={confirmDelete}
                title='Delete Mission'
                message={`"${title || 'This mission'}" will be permanently deleted. This cannot be undone.`}
                confirmLabel='Delete'
                danger
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete(false)}
            />

            {/* Page header */}
            <div className='flex items-center justify-between gap-4' style={{ marginBottom: 20 }}>
                <div className='flex items-center gap-4'>
                    <Link
                        href={fromJ2 ? '/dashboard/j2' : '/operations'}
                        style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', textDecoration: 'none' }}
                    >
                        {fromJ2 ? '← J2 Operations' : '← Back'}
                    </Link>
                    <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>
                        Mission Edit
                    </span>
                    {opID && (
                        <>
                            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />
                            <Link
                                href={`/operations/${opID}`}
                                style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c(0.55), textDecoration: 'none' }}
                            >
                                View →
                            </Link>
                        </>
                    )}
                    {opID && (
                        <>
                            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />
                            <Link
                                href={`/operations/${opID}/map`}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '2px 0',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.14em',
                                    textTransform: 'uppercase',
                                    color: 'rgba(237,237,237,0.3)',
                                    textDecoration: 'none',
                                    borderBottom: '2px solid transparent',
                                }}
                            >
                                Map ↗
                            </Link>
                        </>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: statusColor }}>
                        {statusLabel}
                    </span>
                    {/* Publish button — visible when In Development */}
                    {opID && isHQ && status === 'In Development' && (
                        publishConfirmOpen ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: 'rgba(0,200,80,0.07)', border: '1px solid rgba(0,200,80,0.3)', borderRadius: 2 }}>
                                <span style={{ fontSize: '0.6rem', color: 'rgba(0,200,80,0.75)', fontWeight: 700, letterSpacing: '0.1em' }}>Publish "{title || 'this op'}"?</span>
                                <button type='button' disabled={publishSaving} onClick={async () => {
                                    setPublishSaving(true)
                                    try {
                                        const res = await fetch(`/api/operations/${opID}/publish`, { method: 'POST' })
                                        if (res.ok) {
                                            setStatus('Upcoming')
                                            setPublishConfirmOpen(false)
                                        } else {
                                            const d = await res.json()
                                            alert(d.error ?? 'Publish failed')
                                        }
                                    } finally {
                                        setPublishSaving(false)
                                    }
                                }}
                                    style={{ padding: '4px 10px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', background: 'rgba(0,200,80,0.2)', border: '1px solid rgba(0,200,80,0.5)', color: 'rgba(0,200,80,0.95)', cursor: 'pointer' }}
                                >{publishSaving ? 'Publishing…' : '✓ Confirm'}</button>
                                <button type='button' onClick={() => setPublishConfirmOpen(false)}
                                    style={{ padding: '4px 8px', fontSize: '0.6rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}
                                >Cancel</button>
                            </div>
                        ) : (
                            <button type='button' onClick={() => setPublishConfirmOpen(true)}
                                style={{
                                    padding: '6px 14px',
                                    background: 'rgba(0,200,80,0.08)',
                                    border: '1px solid rgba(0,200,80,0.35)',
                                    color: 'rgba(0,200,80,0.75)',
                                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { const el = e.currentTarget; el.style.background = 'rgba(0,200,80,0.18)'; el.style.color = 'rgba(0,200,80,1)'; el.style.borderColor = 'rgba(0,200,80,0.65)' }}
                                onMouseLeave={e => { const el = e.currentTarget; el.style.background = 'rgba(0,200,80,0.08)'; el.style.color = 'rgba(0,200,80,0.75)'; el.style.borderColor = 'rgba(0,200,80,0.35)' }}
                            >
                                ↑ Publish Operation
                            </button>
                        )
                    )}
                    {opID && (
                        <button
                            onClick={() => setConfirmDelete(true)}
                            style={{
                                padding: '6px 14px',
                                background: 'rgba(219,0,29,0.06)',
                                border: '1px solid rgba(219,0,29,0.3)',
                                color: 'rgba(219,0,29,0.65)',
                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                                cursor: 'pointer', transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                            }}
                            onMouseEnter={e => { const el = e.currentTarget; el.style.background = 'rgba(219,0,29,0.14)'; el.style.color = 'rgba(219,0,29,1)'; el.style.borderColor = 'rgba(219,0,29,0.6)' }}
                            onMouseLeave={e => { const el = e.currentTarget; el.style.background = 'rgba(219,0,29,0.06)'; el.style.color = 'rgba(219,0,29,0.65)'; el.style.borderColor = 'rgba(219,0,29,0.3)' }}
                        >
                            Delete Mission
                        </button>
                    )}
                    {opID && (
                        <button
                            className='hidden md:block'
                            onClick={() => setActivityOpen(o => !o)}
                            style={{
                                padding: '6px 14px',
                                background: activityOpen ? 'rgba(237,237,237,0.07)' : 'rgba(237,237,237,0.03)',
                                border: `1px solid ${activityOpen ? 'rgba(237,237,237,0.25)' : 'rgba(255,255,255,0.1)'}`,
                                color: activityOpen ? 'rgba(237,237,237,0.8)' : 'rgba(237,237,237,0.35)',
                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                                cursor: 'pointer', transition: 'all 0.15s',
                            }}
                        >
                            Activity
                        </button>
                    )}
                    {opID && (
                        <button
                            className='hidden md:block'
                            onClick={() => setPreviewOpen(o => !o)}
                            style={{
                                padding: '6px 14px',
                                background: previewOpen ? 'rgba(237,237,237,0.07)' : 'rgba(237,237,237,0.03)',
                                border: `1px solid ${previewOpen ? 'rgba(237,237,237,0.25)' : 'rgba(255,255,255,0.1)'}`,
                                color: previewOpen ? 'rgba(237,237,237,0.8)' : 'rgba(237,237,237,0.35)',
                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                                cursor: 'pointer', transition: 'all 0.15s',
                            }}
                        >
                            {previewOpen ? '⊠ Preview' : '⊡ Preview'}
                        </button>
                    )}
                </div>
            </div>

            {/* Mission Development */}
            {opID && (() => {
                const baseDate = isCampaignOp && campaignStartDate
                    ? new Date(campaignStartDate)
                    : date?.toDate() ?? null
                if (!baseDate) return null

                const weeksList = isCampaignOp ? [16, 12, 10, 8, 6, 4] : [12, 10, 8, 6, 4]
                const now = new Date()
                const checks = weeksList.map(weeks => {
                    const dueDate = new Date(baseDate.getTime() - weeks * 7 * 24 * 3600000)
                    const completion = missionDev?.completions?.[`w${weeks}`]
                    return {
                        id: `w${weeks}`,
                        label: `${weeks}W`,
                        weeks,
                        dueDate,
                        isOverdue: now > dueDate && !completion,
                        isCompleted: !!completion,
                        completion,
                    }
                })
                const allDone = checks.every(ch => ch.isCompleted)

                const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })

                async function saveCompletion(checkId: string) {
                    setMissionDevSaving(true)
                    try {
                        const res = await fetch(`/api/operations/${opID}/mission-development`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                checkId,
                                reviewerName: completionReviewerName.trim() || undefined,
                                comments: completionComments.trim() || undefined,
                                outcome: completionOutcome.trim() || undefined,
                            }),
                        })
                        const data = await res.json()
                        if (data.ok) {
                            setMissionDev(prev => ({
                                completions: { ...(prev?.completions ?? {}), [checkId]: data.completion },
                                lastUpdatedAt: new Date().toISOString(),
                            }))
                            setCompletingCheckId(null)
                            setCompletionReviewerName('')
                            setCompletionComments('')
                            setCompletionOutcome('')
                        }
                    } finally {
                        setMissionDevSaving(false)
                    }
                }

                async function removeCompletion(checkId: string) {
                    setMissionDevSaving(true)
                    try {
                        await fetch(`/api/operations/${opID}/mission-development?checkId=${checkId}`, { method: 'DELETE' })
                        setMissionDev(prev => {
                            if (!prev) return prev
                            const next = { ...prev, completions: { ...prev.completions } }
                            delete next.completions[checkId]
                            return next
                        })
                    } finally {
                        setMissionDevSaving(false)
                    }
                }

                return (
                    <>
                        <div style={{ border: `1px solid ${c(0.15)}`, borderTop: `2px solid ${allDone ? 'rgba(0,200,80,0.6)' : c(0.5)}`, background: 'rgba(255,255,255,0.01)', marginBottom: 20 }}>
                            <button type='button' onClick={() => setMissionDevOpen(v => !v)}
                                className='flex items-center justify-between px-4 py-3'
                                style={{ borderBottom: missionDevOpen ? '1px solid rgba(255,255,255,0.05)' : 'none', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: allDone ? 'rgba(0,200,80,0.6)' : 'rgba(237,237,237,0.3)' }}>
                                        Mission Development
                                    </span>
                                    {allDone && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(0,200,80,0.8)', letterSpacing: '0.1em' }}>✓ All Checks Complete</span>}
                                    {!allDone && checks.some(ch => ch.isOverdue) && (
                                        <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,100,0,0.85)', border: '1px solid rgba(219,100,0,0.35)', padding: '2px 8px' }}>
                                            {checks.filter(ch => ch.isOverdue).length} Overdue
                                        </span>
                                    )}
                                    {missionDevSaving && <span style={{ fontSize: '0.6rem', color: 'rgba(219,0,29,0.65)', fontWeight: 700 }}>Saving…</span>}
                                </div>
                                <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', fontFamily: 'monospace' }}>{missionDevOpen ? '[−]' : '[+]'}</span>
                            </button>

                            {missionDevOpen && (
                                <div style={{ padding: '20px 16px 16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 16 }}>
                                        {checks.map((ch, i) => {
                                            const nodeColor = ch.isCompleted ? 'rgba(0,200,80,0.7)'
                                                : ch.isOverdue ? 'rgba(219,80,0,0.55)'
                                                : 'rgba(255,255,255,0.1)'
                                            const borderClr = ch.isCompleted ? 'rgba(0,200,80,0.6)'
                                                : ch.isOverdue ? 'rgba(219,80,0,0.55)'
                                                : 'rgba(255,255,255,0.15)'
                                            const labelClr = ch.isCompleted ? 'rgba(0,200,80,0.8)'
                                                : ch.isOverdue ? 'rgba(219,100,0,0.85)'
                                                : 'rgba(237,237,237,0.35)'
                                            const connectorColor = ch.isCompleted && checks[i + 1]?.isCompleted
                                                ? 'rgba(0,200,80,0.35)'
                                                : 'rgba(255,255,255,0.08)'
                                            return (
                                                <div key={ch.id} style={{ display: 'flex', alignItems: 'flex-start', flex: i < checks.length - 1 ? 1 : undefined }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 52 }}>
                                                        <button
                                                            type='button'
                                                            disabled={!isJ2Lead || missionDevSaving}
                                                            onClick={() => {
                                                                if (!isJ2Lead) return
                                                                if (ch.isCompleted) {
                                                                    if (confirm(`Remove completion for ${ch.label} check?`)) removeCompletion(ch.id)
                                                                } else {
                                                                    setCompletingCheckId(ch.id)
                                                                    setCompletionReviewerName('')
                                                                    setCompletionComments('')
                                                                    setCompletionOutcome('')
                                                                }
                                                            }}
                                                            title={isJ2Lead ? (ch.isCompleted ? 'Click to remove completion' : 'Click to complete this check') : 'J2 leads only'}
                                                            style={{
                                                                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                                                background: nodeColor, border: `2px solid ${borderClr}`,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                cursor: isJ2Lead ? 'pointer' : 'default',
                                                                padding: 0, transition: 'all 0.2s',
                                                            }}
                                                        >
                                                            {ch.isCompleted && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.9)', lineHeight: 1 }}>✓</span>}
                                                            {ch.isOverdue && !ch.isCompleted && <span style={{ fontSize: 9, color: 'rgba(219,120,0,0.9)', lineHeight: 1 }}>!</span>}
                                                        </button>
                                                        <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
                                                            <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: labelClr }}>{ch.label}</div>
                                                            <div style={{ fontSize: '0.48rem', color: 'rgba(237,237,237,0.22)', letterSpacing: '0.04em' }}>{fmtDate(ch.dueDate)}</div>
                                                        </div>
                                                        {ch.completion && (
                                                            <div style={{ fontSize: '0.44rem', color: 'rgba(0,200,80,0.55)', textAlign: 'center', lineHeight: 1.3, maxWidth: 50 }}>
                                                                {ch.completion.reviewerName}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {i < checks.length - 1 && (
                                                        <div style={{ flex: 1, height: 2, marginTop: 10, background: connectorColor }} />
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/* Legend */}
                                    <div style={{ display: 'flex', gap: 16, fontSize: '0.55rem', color: 'rgba(237,237,237,0.25)' }}>
                                        <span><span style={{ color: 'rgba(0,200,80,0.7)' }}>●</span> Completed</span>
                                        <span><span style={{ color: 'rgba(219,80,0,0.7)' }}>●</span> Overdue</span>
                                        <span><span style={{ color: 'rgba(255,255,255,0.2)' }}>●</span> Pending</span>
                                        {!isJ2Lead && <span style={{ color: 'rgba(237,237,237,0.18)', fontStyle: 'italic' }}>J2 leads can complete checks</span>}
                                        <span style={{ marginLeft: 'auto', color: 'rgba(237,237,237,0.18)' }}>
                                            {isCampaignOp ? 'Campaign — 6 checks from campaign start' : 'Single mission — 5 checks from op date'}
                                        </span>
                                    </div>

                                    {/* Per-check detail rows for completed checks */}
                                    {checks.filter(ch => ch.completion).length > 0 && (
                                        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {checks.filter(ch => ch.completion).map(ch => (
                                                <div key={ch.id} style={{ padding: '8px 12px', background: 'rgba(0,200,80,0.04)', border: '1px solid rgba(0,200,80,0.12)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(0,200,80,0.75)', letterSpacing: '0.08em' }}>{ch.label}</span>
                                                        <span style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.35)' }}>Reviewed by {ch.completion!.reviewerName}</span>
                                                        <span style={{ fontSize: '0.55rem', color: 'rgba(237,237,237,0.22)', marginLeft: 'auto' }}>
                                                            {new Date(ch.completion!.completedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    {ch.completion!.comments && (
                                                        <div style={{ fontSize: '0.58rem', color: 'rgba(237,237,237,0.4)', paddingLeft: 2 }}>{ch.completion!.comments}</div>
                                                    )}
                                                    {ch.completion!.outcome && (
                                                        <div style={{ fontSize: '0.58rem', color: 'rgba(237,200,0,0.5)', paddingLeft: 2 }}>Outcome: {ch.completion!.outcome}</div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Orders Check Request */}
                                    <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 14 }}>
                                        {ordersCheckTask ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'rgba(100,150,237,0.06)', border: '1px solid rgba(100,150,237,0.18)' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(100,150,237,0.7)', marginBottom: 3 }}>
                                                            Orders Check {ordersCheckTask.ordersCheckStatus === 'confirmed' ? '✓ Confirmed' : ordersCheckTask.ordersCheckStatus === 'proposed' ? '— Alternative Proposed' : '— Requested'}
                                                        </div>
                                                        {ordersCheckTask.ordersCheckAt && (
                                                            <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.5)' }}>
                                                                Requested: {new Date(ordersCheckTask.ordersCheckAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                                                            </div>
                                                        )}
                                                        {ordersCheckTask.ordersCheckStatus === 'proposed' && ordersCheckTask.ordersCheckProposedAt && (
                                                            <div style={{ fontSize: '0.65rem', color: 'rgba(219,160,0,0.75)', marginTop: 2 }}>
                                                                Alternative by {ordersCheckTask.ordersCheckProposedBy}: {new Date(ordersCheckTask.ordersCheckProposedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* Cancel button */}
                                                    {ordersCheckTask.ordersCheckStatus !== 'confirmed' && ordersCheckTask._id && (
                                                        <button
                                                            type='button'
                                                            disabled={ordersCheckCancelling}
                                                            onClick={async () => {
                                                                if (!confirm('Cancel this orders check request?')) return
                                                                setOrdersCheckCancelling(true)
                                                                try {
                                                                    const res = await fetch(`/api/operations/${opID}/orders-check?taskId=${ordersCheckTask._id}`, { method: 'DELETE' })
                                                                    if (res.ok) {
                                                                        setOrdersCheckTask(null)
                                                                        setOrdersCheckReminderSet(false)
                                                                    } else {
                                                                        const d = await res.json()
                                                                        alert(d.error ?? 'Failed to cancel.')
                                                                    }
                                                                } finally {
                                                                    setOrdersCheckCancelling(false)
                                                                }
                                                            }}
                                                            style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', background: 'none', border: '1px solid rgba(219,0,29,0.3)', color: 'rgba(219,0,29,0.6)', cursor: 'pointer', flexShrink: 0 }}
                                                        >
                                                            {ordersCheckCancelling ? '…' : 'Cancel Request'}
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Reminder — shown after confirmation */}
                                                {ordersCheckTask.ordersCheckStatus === 'confirmed' && ordersCheckTask._id && (
                                                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', flexShrink: 0 }}>Remind me:</span>
                                                            <DateTimePicker
                                                                value={ordersCheckReminderAt}
                                                                onChange={v => setOrdersCheckReminderAt(v)}
                                                                slotProps={{
                                                                    textField: { size: 'small', sx: { '& .MuiInputBase-root': { background: 'rgba(0,0,0,0.3)', borderRadius: 0, fontSize: '0.75rem' }, '& .MuiOutlinedInput-notchedOutline': { border: '1px solid rgba(255,255,255,0.08)' }, '& .MuiInputBase-input': { color: 'rgba(237,237,237,0.75)', padding: '4px 8px' }, '& .MuiSvgIcon-root': { color: 'rgba(237,237,237,0.3)', fontSize: 16 } } },
                                                                    popper: { sx: { zIndex: 19999 } },
                                                                }}
                                                            />
                                                            <button
                                                                type='button'
                                                                disabled={!ordersCheckReminderAt || ordersCheckReminderSaving}
                                                                onClick={async () => {
                                                                    if (!ordersCheckReminderAt) return
                                                                    setOrdersCheckReminderSaving(true)
                                                                    try {
                                                                        const res = await fetch(`/api/operations/${opID}/orders-check`, {
                                                                            method: 'PATCH',
                                                                            headers: { 'Content-Type': 'application/json' },
                                                                            body: JSON.stringify({ taskId: ordersCheckTask._id, action: 'set_reminder', proposedAt: ordersCheckReminderAt.toISOString() }),
                                                                        })
                                                                        if (res.ok) { setOrdersCheckReminderSet(true) }
                                                                        else { const d = await res.json(); alert(d.error ?? 'Failed.') }
                                                                    } finally {
                                                                        setOrdersCheckReminderSaving(false)
                                                                    }
                                                                }}
                                                                style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', background: ordersCheckReminderSet ? 'rgba(76,175,80,0.15)' : 'rgba(100,150,237,0.15)', border: `1px solid ${ordersCheckReminderSet ? 'rgba(76,175,80,0.3)' : 'rgba(100,150,237,0.3)'}`, color: ordersCheckReminderSet ? 'rgba(76,175,80,0.8)' : 'rgba(100,150,237,0.8)', cursor: 'pointer', flexShrink: 0 }}
                                                            >
                                                                {ordersCheckReminderSet ? '✓ Set' : 'Set Reminder'}
                                                            </button>
                                                        </div>
                                                    </LocalizationProvider>
                                                )}
                                            </div>
                                        ) : (
                                            <button type='button' onClick={() => setOrdersCheckModal(true)}
                                                style={{
                                                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                                                    padding: '7px 16px', background: 'rgba(100,150,237,0.1)', border: '1px solid rgba(100,150,237,0.3)',
                                                    color: 'rgba(100,150,237,0.85)', cursor: 'pointer',
                                                }}
                                            >
                                                + Request Orders Check
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Completion modal */}
                        {completingCheckId && (() => {
                            const ch = checks.find(c => c.id === completingCheckId)
                            if (!ch) return null
                            return (
                                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onClick={e => { if (e.target === e.currentTarget) setCompletingCheckId(null) }}
                                >
                                    <div style={{ background: '#0f0f10', border: `1px solid ${c(0.35)}`, borderTop: `2px solid rgba(0,200,80,0.7)`, padding: '24px 28px', maxWidth: 420, width: '90%', display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(0,200,80,0.5)', fontFamily: 'monospace' }}>
                                            {'// COMPLETE CHECK'}
                                        </div>
                                        <div style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                                            {ch.label} Development Check
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)' }}>
                                            Due: {ch.dueDate.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })}
                                            {ch.isOverdue && <span style={{ color: 'rgba(219,80,0,0.85)', marginLeft: 8 }}>● Overdue</span>}
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            <div>
                                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: c(0.55), marginBottom: 6 }}>Reviewer Name</div>
                                                <input
                                                    value={completionReviewerName}
                                                    onChange={e => setCompletionReviewerName(e.target.value)}
                                                    placeholder='Your name or assigned reviewer…'
                                                    style={{ width: '100%', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.85)', fontSize: '0.8rem', padding: '8px 10px', outline: 'none', boxSizing: 'border-box' }}
                                                />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: c(0.55), marginBottom: 6 }}>Comments</div>
                                                <textarea
                                                    value={completionComments}
                                                    onChange={e => setCompletionComments(e.target.value)}
                                                    placeholder='Review notes, observations…'
                                                    rows={3}
                                                    style={{ width: '100%', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.85)', fontSize: '0.78rem', padding: '8px 10px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                                                />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: c(0.55), marginBottom: 6 }}>Outcome / Notes</div>
                                                <textarea
                                                    value={completionOutcome}
                                                    onChange={e => setCompletionOutcome(e.target.value)}
                                                    placeholder='Outcome, decisions made, action items…'
                                                    rows={2}
                                                    style={{ width: '100%', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.85)', fontSize: '0.78rem', padding: '8px 10px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                                            <button type='button' onClick={() => setCompletingCheckId(null)}
                                                style={{ padding: '7px 18px', fontSize: '0.7rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}
                                            >CANCEL</button>
                                            <button type='button' disabled={missionDevSaving} onClick={() => saveCompletion(completingCheckId)}
                                                style={{ padding: '7px 18px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(0,200,80,0.18)', border: '1px solid rgba(0,200,80,0.45)', color: 'rgba(0,200,80,0.9)', cursor: 'pointer' }}
                                            >{missionDevSaving ? 'Saving…' : '✓ Mark Complete'}</button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })()}

                        {/* Orders Check modal */}
                        {ordersCheckModal && (
                            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                onClick={e => { if (e.target === e.currentTarget) setOrdersCheckModal(false) }}
                            >
                                <LocalizationProvider dateAdapter={AdapterDayjs}>
                                    <div style={{ background: '#0f0f10', border: `1px solid rgba(100,150,237,0.35)`, borderTop: `2px solid rgba(100,150,237,0.8)`, padding: '24px 28px', maxWidth: 440, width: '90%', display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(100,150,237,0.5)', fontFamily: 'monospace' }}>
                                            {'// REQUEST ORDERS CHECK'}
                                        </div>
                                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)' }}>
                                            {title || 'This Operation'}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.45)', lineHeight: 1.5 }}>
                                            Select a preferred date and time for your orders check. A task will be created for J2 leads to review and confirm.
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            <div>
                                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 8 }}>
                                                    Preferred Date &amp; Time
                                                </div>
                                                <DateTimePicker
                                                    value={ordersCheckPreferredAt}
                                                    onChange={v => setOrdersCheckPreferredAt(v)}
                                                    slotProps={{
                                                        textField: {
                                                            size: 'small',
                                                            fullWidth: true,
                                                            sx: {
                                                                '& .MuiInputBase-root': { background: 'rgba(0,0,0,0.35)', borderRadius: 0, fontSize: '0.82rem' },
                                                                '& .MuiOutlinedInput-notchedOutline': { border: '1px solid rgba(255,255,255,0.1)' },
                                                                '& .MuiInputBase-input': { color: 'rgba(237,237,237,0.85)' },
                                                                '& .MuiSvgIcon-root': { color: 'rgba(237,237,237,0.4)' },
                                                            },
                                                        },
                                                        popper: { sx: { zIndex: 19999 } },
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 8 }}>
                                                    Comments (optional)
                                                </div>
                                                <textarea
                                                    value={ordersCheckComments}
                                                    onChange={e => setOrdersCheckComments(e.target.value)}
                                                    placeholder='Any notes or context for J2 leads…'
                                                    rows={3}
                                                    style={{ width: '100%', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.85)', fontSize: '0.78rem', padding: '8px 10px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                                            <button type='button' onClick={() => setOrdersCheckModal(false)}
                                                style={{ padding: '7px 18px', fontSize: '0.7rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}
                                            >CANCEL</button>
                                            <button type='button'
                                                disabled={!ordersCheckPreferredAt || ordersCheckSaving}
                                                onClick={async () => {
                                                    if (!ordersCheckPreferredAt) return
                                                    setOrdersCheckSaving(true)
                                                    try {
                                                        const res = await fetch(`/api/operations/${opID}/orders-check`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                                preferredAt: ordersCheckPreferredAt.toISOString(),
                                                                comments: ordersCheckComments.trim() || undefined,
                                                            }),
                                                        })
                                                        if (res.ok) {
                                                            setOrdersCheckTask({ status: 'pending', ordersCheckAt: ordersCheckPreferredAt.toISOString(), ordersCheckStatus: 'pending' })
                                                            setOrdersCheckModal(false)
                                                            setOrdersCheckComments('')
                                                            setOrdersCheckPreferredAt(null)
                                                        } else {
                                                            const d = await res.json()
                                                            alert(d.error ?? 'Failed to submit orders check request.')
                                                        }
                                                    } finally {
                                                        setOrdersCheckSaving(false)
                                                    }
                                                }}
                                                style={{ padding: '7px 18px', fontSize: '0.7rem', fontWeight: 700, background: ordersCheckPreferredAt && !ordersCheckSaving ? 'rgba(100,150,237,0.2)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(100,150,237,0.4)', color: ordersCheckPreferredAt && !ordersCheckSaving ? 'rgba(100,150,237,0.9)' : 'rgba(237,237,237,0.3)', cursor: ordersCheckPreferredAt ? 'pointer' : 'not-allowed' }}
                                            >{ordersCheckSaving ? 'Submitting…' : 'Submit Request'}</button>
                                        </div>
                                    </div>
                                </LocalizationProvider>
                            </div>
                        )}
                    </>
                )
            })()}

            {/* Metadata card */}
            <div style={{ border: `1px solid ${c(0.15)}`, borderTop: `2px solid ${c(1)}`, background: 'rgba(255,255,255,0.01)', marginBottom: 20 }}>
                <div className='flex items-center px-4 py-3' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                        Operation Details
                    </span>
                </div>
                <div className='flex flex-col gap-4 p-4'>
                    {/* Title */}
                    <input
                        value={title}
                        placeholder='Operation Name'
                        onChange={e => { setTitle(e.target.value); metaHandleRef.current?.set('title', e.target.value); scheduleSave({ title: e.target.value }) }}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(237,237,237,0.9)',
                            fontSize: '1.5rem',
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            outline: 'none',
                            width: '100%',
                            padding: '4px 0',
                        }}
                    />
                    {/* Owner row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.68rem' }}>
                        <span style={{ fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: c(0.55), flexShrink: 0 }}>Mission Owner</span>
                        {ownerPickerOpen && (isJ2Lead || isJ4Admin) ? (
                            <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                                <select
                                    defaultValue={ownedBy}
                                    onChange={async e => {
                                        const sel = j2Members.find(m => m.id === e.target.value)
                                        if (!sel) return
                                        setOwnedBy(sel.id)
                                        setOwnedByName(sel.displayName)
                                        setOwnerPickerOpen(false)
                                        await fetch(`/api/operations/update?id=${opID}&ownedBy=${encodeURIComponent(sel.id)}&ownedByName=${encodeURIComponent(sel.displayName)}`)
                                    }}
                                    style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: `1px solid ${c(0.3)}`, color: 'rgba(237,237,237,0.8)', fontSize: '0.75rem', padding: '5px 8px', outline: 'none' }}
                                >
                                    <option value=''>— Select member —</option>
                                    {j2Members.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                                </select>
                                <button type='button' onClick={() => setOwnerPickerOpen(false)} style={{ fontSize: '0.6rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.35)', padding: '3px 8px', cursor: 'pointer' }}>Cancel</button>
                            </div>
                        ) : (
                            <>
                                <span style={{ color: ownedByName ? 'rgba(237,237,237,0.7)' : 'rgba(237,237,237,0.25)', fontStyle: ownedByName ? 'normal' : 'italic' }}>
                                    {ownedByName || 'Unassigned'}
                                </span>
                                {(isJ2Lead || isJ4Admin) && (
                                    <button type='button' onClick={async () => {
                                        if (j2Members.length === 0) {
                                            const res = await fetch('/api/admin/members?department=j2')
                                            const data = await res.json()
                                            setJ2Members((data.members ?? []).map((m: any) => ({ id: m.discordId ?? m._id, displayName: m.displayName ?? m.name ?? 'Unknown' })))
                                        }
                                        setOwnerPickerOpen(true)
                                    }}
                                        style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', background: 'none', border: `1px solid ${c(0.25)}`, color: c(0.6), padding: '2px 8px', cursor: 'pointer' }}
                                    >Change</button>
                                )}
                            </>
                        )}
                    </div>

                    {/* Billet points — J2 leads + J4 admin only */}
                    {(isJ2Lead || isJ4Admin) && opID && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.68rem' }}>
                            <span style={{ fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: c(0.55), flexShrink: 0 }}>Billet Points</span>
                            <input
                                type='number'
                                min={0}
                                step={1}
                                value={billetPoints}
                                onChange={e => setBilletPoints(Math.max(0, parseInt(e.target.value) || 0))}
                                onBlur={async () => {
                                    await fetch(`/api/operations/update?id=${opID}&billetPoints=${billetPoints}`)
                                }}
                                style={{ width: 52, background: 'rgba(0,0,0,0.4)', border: `1px solid ${c(0.25)}`, color: 'rgba(237,237,237,0.8)', fontSize: '0.75rem', padding: '3px 6px', outline: 'none', textAlign: 'center' }}
                            />
                            <span style={{ color: c(0.35), fontStyle: 'italic' }}>awarded to owner on completion</span>
                        </div>
                    )}

                    {/* Acknowledgements panel — shown for Upcoming ops */}
                    {status === 'Upcoming' && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: ackExpanded ? 10 : 0 }}>
                                <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: c(0.55) }}>Orders Acknowledged</span>
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: ackCount > 0 ? 'rgba(0,200,80,0.8)' : 'rgba(237,237,237,0.3)' }}>{ackCount} staff</span>
                                <button type='button' onClick={() => setAckExpanded(v => !v)} style={{ fontSize: '0.58rem', background: 'none', border: 'none', color: 'rgba(237,237,237,0.3)', cursor: 'pointer', padding: '0 4px' }}>{ackExpanded ? '▲ Hide' : '▼ Show'}</button>
                                <button type='button' disabled={remindSaving} onClick={async () => {
                                    setRemindSaving(true)
                                    try {
                                        const res = await fetch(`/api/operations/${opID}/remind`, { method: 'POST' })
                                        if (res.ok) { const d = await res.json(); setRemindSent(d.sent ?? 0) }
                                    } finally { setRemindSaving(false) }
                                }}
                                    style={{ marginLeft: 'auto', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', padding: '3px 10px', background: remindSaving ? 'rgba(255,255,255,0.03)' : 'rgba(100,150,237,0.1)', border: '1px solid rgba(100,150,237,0.3)', color: remindSaving ? 'rgba(237,237,237,0.25)' : 'rgba(100,150,237,0.75)', cursor: remindSaving ? 'not-allowed' : 'pointer' }}
                                >
                                    {remindSaving ? 'Sending…' : remindSent !== null ? `Sent (${remindSent})` : 'Remind Unacknowledged'}
                                </button>
                            </div>
                            {ackExpanded && ackList.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {ackList.map(a => (
                                        <div key={a.userId} style={{ fontSize: '0.58rem', padding: '3px 8px', background: 'rgba(0,200,80,0.06)', border: '1px solid rgba(0,200,80,0.18)', color: 'rgba(0,200,80,0.7)' }}>
                                            {a.userName} <span style={{ opacity: 0.5 }}>{new Date(a.acknowledgedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {ackExpanded && ackList.length === 0 && (
                                <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No staff have acknowledged yet.</div>
                            )}
                        </div>
                    )}

                    {/* Sub-fields row 1 */}
                    <div className='flex flex-wrap gap-4'>
                        <input
                            value={department}
                            placeholder='Department'
                            onChange={e => { setDepartment(e.target.value); metaHandleRef.current?.set('department', e.target.value); scheduleSave({ department: e.target.value }) }}
                            style={{
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: 'rgba(237,237,237,0.75)',
                                fontSize: '0.8rem',
                                letterSpacing: '0.06em',
                                outline: 'none',
                                padding: '8px 12px',
                                flex: 1,
                                minWidth: 160,
                            }}
                        />
                        {/* Status */}
                        <select
                            value={status}
                            onChange={e => { setStatus(e.target.value); scheduleSave({ status: e.target.value }) }}
                            style={{
                                background: 'rgba(0,0,0,0.4)',
                                border: `1px solid ${currentStatusColor}`,
                                color: currentStatusColor,
                                fontSize: '0.8rem',
                                letterSpacing: '0.06em',
                                outline: 'none',
                                padding: '8px 12px',
                                minWidth: 160,
                                cursor: 'pointer',
                                fontWeight: 700,
                            }}
                        >
                            <option value='Upcoming' style={{ background: 'rgb(18,18,18)', color: 'rgba(219,160,0,0.9)' }}>Upcoming</option>
                            <option value='Active' style={{ background: 'rgb(18,18,18)', color: 'rgba(0,200,80,0.9)' }}>Active</option>
                            <option value='Completed' style={{ background: 'rgb(18,18,18)', color: 'rgba(100,150,237,0.8)' }}>Completed</option>
                            {isHQ && <option value='In Development' style={{ background: 'rgb(18,18,18)', color: 'rgba(219,0,29,0.75)' }}>In Development</option>}
                        </select>
                        {/* Complete Mission button — visible when op is Active */}
                        {isHQ && status === 'Active' && (
                            <button
                                onClick={() => applyStage('confirmations_open')}
                                style={{
                                    background: 'rgba(219,0,29,0.15)',
                                    border: '1px solid rgba(219,0,29,0.6)',
                                    color: 'rgba(219,0,29,0.9)',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.1em',
                                    textTransform: 'uppercase',
                                    padding: '8px 16px',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                Complete Mission
                            </button>
                        )}
                        {/* Theme color picker */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(255,255,255,0.1)', padding: '6px 12px', cursor: 'pointer', userSelect: 'none' }}>
                            <input
                                type='color'
                                value={themeColor}
                                onChange={e => { setThemeColor(e.target.value); scheduleSave({ themeColor: e.target.value }) }}
                                style={{ width: 22, height: 22, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.75rem', letterSpacing: '0.06em', color: 'rgba(237,237,237,0.55)', whiteSpace: 'nowrap' }}>Theme Color</span>
                        </label>
                        {/* ERA / Page Theme */}
                        <select
                            value={pageTheme ?? 'modern'}
                            onChange={e => {
                                setPageTheme(e.target.value)
                                scheduleSave({ pageTheme: e.target.value })
                            }}
                            style={{
                                background: 'rgba(0,0,0,0.4)',
                                border: `1px solid ${c(0.35)}`,
                                color: c(0.8),
                                fontSize: '0.8rem',
                                letterSpacing: '0.06em',
                                outline: 'none',
                                padding: '8px 12px',
                                minWidth: 150,
                                cursor: 'pointer',
                                fontWeight: 700,
                            }}
                        >
                            {eraOptions.length > 0
                                ? eraOptions.map(opt => (
                                    <option key={opt.value} value={opt.value} style={{ background: 'rgb(18,18,18)', color: 'rgba(237,237,237,0.8)' }}>
                                        {opt.name}
                                    </option>
                                ))
                                : (
                                    <>
                                        <option value='modern'  style={{ background: 'rgb(18,18,18)', color: 'rgba(237,237,237,0.8)' }}>Modern</option>
                                        <option value='wwii'    style={{ background: 'rgb(18,18,18)', color: 'rgba(237,237,237,0.8)' }}>WWII</option>
                                        <option value='vietnam' style={{ background: 'rgb(18,18,18)', color: 'rgba(237,237,237,0.8)' }}>Vietnam</option>
                                        <option value='coldwar' style={{ background: 'rgb(18,18,18)', color: 'rgba(237,237,237,0.8)' }}>Cold War</option>
                                        <option value='fantasy' style={{ background: 'rgb(18,18,18)', color: 'rgba(237,237,237,0.8)' }}>Fantasy</option>
                                        <option value='scifi'   style={{ background: 'rgb(18,18,18)', color: 'rgba(237,237,237,0.8)' }}>Sci-Fi</option>
                                    </>
                                )
                            }
                        </select>
                        {/* Map World */}
                        <MapWorldPicker
                            value={mapWorld}
                            worlds={availableWorlds}
                            onChange={w => { setMapWorld(w); scheduleSave({ mapWorld: w }) }}
                            themeColor={themeColor}
                        />
                    </div>
                    {/* In-Game date/time — datetime picker */}
                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                        <DateTimePicker
                            label='In-Game Date & Time'
                            value={loreDateDayjs}
                            format='DD/MM/YYYY HH:mm'
                            onChange={v => {
                                setLoreDateDayjs(v)
                                const str = v?.isValid() ? v.format('DD/MM/YYYY HH:mm') : ''
                                setLoreDate(str)
                                metaHandleRef.current?.set('loreDate', str)
                                scheduleSave({ loreDate: str })
                            }}
                            slotProps={{ textField: { size: 'small', sx: { width: '100%' } } }}
                        />
                    </LocalizationProvider>

                    {/* Cover image */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {coverImage ? (
                            <>
                                <div style={{ position: 'relative', width: 140, height: 52, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                    <img src={coverImage} alt='cover' style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                </div>
                                <button
                                    onClick={removeCover}
                                    style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: c(0.6), background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                >
                                    Remove Cover
                                </button>
                                <label style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', cursor: 'pointer' }}>
                                    Replace
                                    <input type='file' accept='image/*' style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadCover(f) }} />
                                </label>
                            </>
                        ) : (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px dashed rgba(255,255,255,0.12)', padding: '10px 18px', cursor: 'pointer' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: coverUploading ? 'rgba(237,237,237,0.3)' : 'rgba(237,237,237,0.4)' }}>
                                    {coverUploading ? 'Uploading…' : '+ Cover Photo'}
                                </span>
                                <input type='file' accept='image/*' style={{ display: 'none' }} disabled={coverUploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadCover(f) }} />
                            </label>
                        )}
                    </div>
                </div>
            </div>

            {/* Schedule & Automation panel — HQ only */}
            {isHQ && opID && (() => {
                function fmtCountdown(target: Date): string | null {
                    const diffMs = target.getTime() - tickNow.getTime()
                    if (diffMs <= 0) return null
                    const s = Math.floor(diffMs / 1000) % 60
                    const m = Math.floor(diffMs / 60000) % 60
                    const h = Math.floor(diffMs / 3600000) % 24
                    const d = Math.floor(diffMs / 86400000)
                    if (d > 0) return `${d}d ${h}h ${m}m`
                    if (h > 0) return `${h}h ${m}m ${s}s`
                    return `${m}m ${s}s`
                }

                const inDev = status === 'In Development'
                const opDate        = draftDate?.toDate() ?? null
                // inDev only suppresses cron/triggers — editing is always allowed
                const rsvpCloseDate = opDate ? new Date(opDate.getTime() - draftRsvpCloseOffsetMins * 60000) : null
                const confirmCloseDate = confirmationOpenedAt ? new Date(confirmationOpenedAt.getTime() + 24 * 3600000) : null

                const scheduleDirty = (
                    draftDate?.toISOString() !== date?.toISOString() ||
                    draftRsvpOpenAt !== rsvpOpenAt ||
                    draftRsvpCloseOffsetMins !== rsvpCloseOffsetMins
                )

                const RELATIVE_OPTS = [
                    { label: '1 day before',   mins: 1440 },
                    { label: '3 days before',  mins: 4320 },
                    { label: '1 week before',  mins: 10080 },
                    { label: '2 weeks before', mins: 20160 },
                ]

                const CLOSE_OPTS = [
                    { label: '30 min before',   mins: 30 },
                    { label: '1 hour before',   mins: 60 },
                    { label: '1.5 hours before', mins: 90 },
                    { label: '2 hours before',  mins: 120 },
                    { label: '3 hours before',  mins: 180 },
                    { label: '6 hours before',  mins: 360 },
                    { label: '12 hours before', mins: 720 },
                    { label: '1 day before',    mins: 1440 },
                ]

                const inputSx: React.CSSProperties = {
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(237,237,237,0.75)',
                    fontSize: '0.78rem',
                    letterSpacing: '0.04em',
                    outline: 'none',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    width: '100%',
                }

                const isPreset = CLOSE_OPTS.some(o => o.mins === draftRsvpCloseOffsetMins)
                const effectiveCloseMode = draftRsvpCloseMode === 'custom' || !isPreset ? 'custom' : 'preset'

                return (
                    <div style={{
                        border: `1px solid ${c(0.15)}`,
                        borderTop: `2px solid ${c(0.5)}`,
                        background: 'rgba(255,255,255,0.01)',
                        marginBottom: 20,
                    }}>
                        <button type='button' onClick={() => setScheduleOpen(v => !v)}
                            className='flex items-center justify-between px-4 py-3'
                            style={{ borderBottom: scheduleOpen ? '1px solid rgba(255,255,255,0.05)' : 'none', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                                    Schedule &amp; Automation
                                </span>
                                {inDev && (
                                    <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,160,0,0.7)', border: '1px solid rgba(237,160,0,0.3)', padding: '2px 8px' }}>
                                        Automation paused — In Development
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {scheduleSaving && (
                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)' }}>Saving…</span>
                                )}
                                <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', fontFamily: 'monospace' }}>{scheduleOpen ? '[−]' : '[+]'}</span>
                            </div>
                        </button>

                        {scheduleOpen && <div className='flex flex-wrap gap-6 p-4'>
                            {/* ── Settings column ── */}
                            <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                                {/* Operation Date */}
                                <div>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: c(0.6), marginBottom: 10, fontFamily: 'monospace' }}>
                                        {'// OPERATION DATE'}
                                    </div>
                                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                                        <DateTimePicker
                                            label='Operation Date'
                                            value={draftDate}
                                            format='DD/MM/YYYY HH:mm'
                                            onChange={v => setDraftDate(v)}
                                            slotProps={{ textField: { size: 'small', sx: { width: '100%' } } }}
                                        />
                                    </LocalizationProvider>
                                </div>

                                {/* RSVP Open */}
                                <div>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: c(0.6), marginBottom: 10, fontFamily: 'monospace' }}>
                                        {'// RSVP OPEN'}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                                        <button
                                            onClick={() => setDraftRsvpOpenAt(null)}
                                            style={{
                                                padding: '5px 14px', borderRadius: 999,
                                                border: '1px solid rgba(219,0,29,0.25)',
                                                background: !draftRsvpOpenAt ? 'rgba(219,0,29,0.3)' : 'rgba(255,255,255,0.05)',
                                                color: !draftRsvpOpenAt ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.45)',
                                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em',
                                                textTransform: 'uppercase', cursor: 'pointer',
                                            }}
                                        >Manual</button>
                                        <button
                                            onClick={() => {
                                                if (!draftRsvpOpenAt && draftDate) {
                                                    setDraftRsvpOpenAt(new Date(draftDate.toDate().getTime() - 3 * 24 * 3600000).toISOString())
                                                }
                                            }}
                                            style={{
                                                padding: '5px 14px', borderRadius: 999,
                                                border: '1px solid rgba(219,0,29,0.25)',
                                                background: draftRsvpOpenAt ? 'rgba(219,0,29,0.3)' : 'rgba(255,255,255,0.05)',
                                                color: draftRsvpOpenAt ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.45)',
                                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em',
                                                textTransform: 'uppercase', cursor: 'pointer',
                                            }}
                                        >Scheduled</button>
                                    </div>

                                    {draftRsvpOpenAt && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            <LocalizationProvider dateAdapter={AdapterDayjs}>
                                                <DateTimePicker
                                                    label='RSVP Opens At'
                                                    value={dayjs(draftRsvpOpenAt)}
                                                    format='DD/MM/YYYY HH:mm'
                                                    onChange={v => { if (v) setDraftRsvpOpenAt(v.toISOString()) }}
                                                    slotProps={{ textField: { size: 'small', sx: { width: '100%' } } }}
                                                />
                                            </LocalizationProvider>
                                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>
                                                Quick set
                                            </div>
                                            <select
                                                defaultValue=''
                                                onChange={e => {
                                                    const mins = parseInt(e.target.value)
                                                    if (!mins || !draftDate) return
                                                    setDraftRsvpOpenAt(new Date(draftDate.toDate().getTime() - mins * 60000).toISOString())
                                                    e.target.value = ''
                                                }}
                                                style={inputSx}
                                            >
                                                <option value='' disabled>Relative to op date…</option>
                                                {RELATIVE_OPTS.map(o => (
                                                    <option key={o.mins} value={o.mins}>{o.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {/* RSVP Close */}
                                <div>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: c(0.6), marginBottom: 10, fontFamily: 'monospace' }}>
                                        {'// RSVP CLOSE'}
                                    </div>
                                    <select
                                        value={effectiveCloseMode === 'custom' ? 'custom' : draftRsvpCloseOffsetMins}
                                        onChange={e => {
                                            if (e.target.value === 'custom') {
                                                setDraftRsvpCloseMode('custom')
                                                if (!draftRsvpCloseAt && draftDate) {
                                                    setDraftRsvpCloseAt(new Date(draftDate.toDate().getTime() - draftRsvpCloseOffsetMins * 60000).toISOString())
                                                }
                                            } else {
                                                setDraftRsvpCloseMode('preset')
                                                setDraftRsvpCloseAt(null)
                                                setDraftRsvpCloseOffsetMins(parseInt(e.target.value))
                                            }
                                        }}
                                        style={inputSx}
                                    >
                                        {CLOSE_OPTS.map(o => (
                                            <option key={o.mins} value={o.mins}>{o.label}</option>
                                        ))}
                                        <option value='custom'>Custom…</option>
                                    </select>
                                    {effectiveCloseMode === 'custom' && (
                                        <div style={{ marginTop: 8 }}>
                                            <LocalizationProvider dateAdapter={AdapterDayjs}>
                                                <DateTimePicker
                                                    label='RSVP Closes At'
                                                    value={draftRsvpCloseAt ? dayjs(draftRsvpCloseAt) : null}
                                                    format='DD/MM/YYYY HH:mm'
                                                    onChange={v => {
                                                        if (!v) return
                                                        setDraftRsvpCloseAt(v.toISOString())
                                                        if (draftDate) {
                                                            const offsetMins = Math.round((draftDate.toDate().getTime() - v.toDate().getTime()) / 60000)
                                                            setDraftRsvpCloseOffsetMins(Math.max(0, offsetMins))
                                                        }
                                                    }}
                                                    slotProps={{ textField: { size: 'small', sx: { width: '100%' } } }}
                                                />
                                            </LocalizationProvider>
                                            {!draftDate && (
                                                <div style={{ fontSize: '0.6rem', color: 'rgba(237,160,0,0.7)', marginTop: 5 }}>
                                                    Set an operation date first to compute offset.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Confirm button */}
                                <button
                                    disabled={!scheduleDirty || scheduleSaving}
                                    onClick={confirmSchedule}
                                    style={{
                                        padding: '9px 20px',
                                        background: scheduleDirty ? c(0.18) : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${scheduleDirty ? c(0.6) : 'rgba(255,255,255,0.1)'}`,
                                        color: scheduleDirty ? c(0.9) : 'rgba(237,237,237,0.2)',
                                        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em',
                                        textTransform: 'uppercase', cursor: scheduleDirty ? 'pointer' : 'not-allowed',
                                        transition: 'all 0.15s', alignSelf: 'flex-start',
                                    }}
                                >
                                    {scheduleSaving ? 'Saving…' : scheduleDirty ? '⬆ Confirm Schedule' : '✓ Schedule Confirmed'}
                                </button>
                            </div>

                            {/* ── Status column ── */}
                            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 0 }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', marginBottom: 14, fontFamily: 'monospace' }}>
                                    {'// STATUS'}
                                </div>
                                {([
                                    {
                                        label: 'RSVP Opens',
                                        color: rsvpOpen || ['rsvp_closed','op_running','confirmations_open','completed'].includes(displayStage) ? 'rgba(0,210,90,0.8)'
                                            : rsvpOpenAt && !fmtCountdown(new Date(rsvpOpenAt)) ? 'rgba(219,160,0,0.9)'
                                            : rsvpOpenAt ? 'rgba(219,160,0,0.8)'
                                            : 'rgba(237,237,237,0.2)',
                                        detail: rsvpOpen ? '✓ Open'
                                            : ['rsvp_closed','op_running','confirmations_open','completed'].includes(displayStage) ? '✓ Opened'
                                            : rsvpOpenAt ? (fmtCountdown(new Date(rsvpOpenAt)) ?? 'Pending cron…')
                                            : 'Manual',
                                    },
                                    {
                                        label: 'RSVP Closes',
                                        color: !rsvpOpen && rsvpCloseDate && rsvpCloseDate <= tickNow ? 'rgba(0,210,90,0.8)'
                                            : rsvpOpen && rsvpCloseDate ? 'rgba(219,160,0,0.8)'
                                            : 'rgba(237,237,237,0.2)',
                                        detail: !rsvpOpen && rsvpCloseDate && rsvpCloseDate <= tickNow ? '✓ Closed'
                                            : rsvpCloseDate ? (fmtCountdown(rsvpCloseDate) ?? 'Firing…')
                                            : '—',
                                    },
                                    {
                                        label: 'Mission Active',
                                        color: status === 'Active' || status === 'Completed' ? 'rgba(0,210,90,0.8)'
                                            : opDate && fmtCountdown(opDate) ? 'rgba(219,160,0,0.8)'
                                            : 'rgba(237,237,237,0.2)',
                                        detail: status === 'Completed' ? '✓ Completed'
                                            : status === 'Active' ? '✓ Active'
                                            : opDate ? (fmtCountdown(opDate) ?? 'Firing…') : '—',
                                    },
                                    {
                                        label: 'Confirmations',
                                        color: confirmationOpen ? 'rgba(219,160,0,0.8)'
                                            : confirmationOpenedAt && !confirmationOpen ? 'rgba(0,210,90,0.8)'
                                            : status === 'Completed' ? 'rgba(219,160,0,0.6)'
                                            : 'rgba(237,237,237,0.2)',
                                        detail: confirmationOpen ? `Open · closes ${confirmCloseDate ? (fmtCountdown(confirmCloseDate) ?? 'soon') : '—'}`
                                            : confirmationOpenedAt && !confirmationOpen ? '✓ Closed'
                                            : status === 'Completed' ? 'Pending cron…'
                                            : 'When mission ends',
                                    },
                                ].map((row, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: row.color, flexShrink: 0, marginTop: 4 }} />
                                        <div>
                                            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 1 }}>{row.label}</div>
                                            <div style={{ fontSize: '0.72rem', color: row.color, fontWeight: row.color.includes('160') ? 700 : 400, fontFamily: 'monospace', letterSpacing: '0.03em' }}>{row.detail}</div>
                                        </div>
                                    </div>
                                )))}
                            </div>
                        </div>}
                    </div>
                )
            })()}

            {/* Attendance settings — HQ only */}
            {isHQ && opID && (
                <div style={{ border: `1px solid ${c(0.15)}`, borderTop: `2px solid ${c(0.5)}`, background: 'rgba(255,255,255,0.01)', marginBottom: 20 }}>
                    <button type='button' onClick={() => setAttendanceOpen(v => !v)}
                        className='flex items-center justify-between px-4 py-3'
                        style={{ borderBottom: attendanceOpen ? '1px solid rgba(255,255,255,0.05)' : 'none', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    >
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                            Attendance Settings
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {attendanceSaving && (
                                <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)' }}>Saving…</span>
                            )}
                            <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', fontFamily: 'monospace' }}>{attendanceOpen ? '[−]' : '[+]'}</span>
                        </div>
                    </button>
                    {attendanceOpen && <div className='flex flex-col gap-4 p-4'>
                        {/* Platoon checkboxes */}
                        <div>
                            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: c(0.6), marginBottom: 10 }}>
                                Assigned Platoons
                            </div>
                            <div className='flex flex-wrap gap-3'>
                                {PLATOON_OPTS.map(opt => {
                                    const checked = assignedPlatoons.includes(opt.id)
                                    return (
                                        <button
                                            key={opt.id}
                                            onClick={() => {
                                                const updated = checked
                                                    ? assignedPlatoons.filter(p => p !== opt.id)
                                                    : [...assignedPlatoons, opt.id]
                                                setAssignedPlatoons(updated)
                                                saveAttendanceSettings({ assignedPlatoons: updated })
                                            }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                padding: '6px 12px',
                                                border: checked ? `2px solid ${opt.color}` : '1px solid rgba(255,255,255,0.1)',
                                                background: checked ? opt.color.replace(/[\d.]+\)$/, '0.1)') : 'rgba(255,255,255,0.02)',
                                                color: checked ? opt.color.replace(/[\d.]+\)$/, '1)') : 'rgba(237,237,237,0.35)',
                                                fontSize: '0.75rem', fontWeight: 700,
                                                letterSpacing: '0.07em', textTransform: 'uppercase',
                                                cursor: 'pointer', userSelect: 'none',
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            {checked && (
                                                <svg width='11' height='11' viewBox='0 0 12 12' fill='none'>
                                                    <path d='M2 6l3 3 5-5' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
                                                </svg>
                                            )}
                                            {opt.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Discord Ping Roles */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: c(0.6) }}>
                                    Discord Ping Roles
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginLeft: 'auto' }}>
                                    <span style={{ fontSize: '0.62rem', color: discordPingEnabled ? '#10b981' : 'rgba(237,237,237,0.3)' }}>
                                        {discordPingEnabled ? 'Enabled' : 'Disabled'}
                                    </span>
                                    <div
                                        onClick={() => {
                                            const next = !discordPingEnabled
                                            setDiscordPingEnabled(next)
                                            saveAttendanceSettings({ discordPingEnabled: next })
                                        }}
                                        style={{
                                            width: 32, height: 18, borderRadius: 9, cursor: 'pointer',
                                            background: discordPingEnabled ? 'rgba(16,185,129,0.7)' : 'rgba(255,255,255,0.12)',
                                            position: 'relative', transition: 'background 0.15s',
                                        }}
                                    >
                                        <div style={{
                                            position: 'absolute', top: 3, left: discordPingEnabled ? 17 : 3,
                                            width: 12, height: 12, borderRadius: '50%', background: '#fff',
                                            transition: 'left 0.15s',
                                        }} />
                                    </div>
                                </label>
                            </div>
                            {discordPingEnabled && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {[
                                        { id: '@everyone', label: '@everyone', color: 'rgba(139,92,246,0.65)' },
                                        { id: '@here', label: '@here', color: 'rgba(59,130,246,0.65)' },
                                        { id: '@friend of unit', label: '@friend of unit', color: 'rgba(16,185,129,0.65)' },
                                        { id: '@veteran member', label: '@veteran member', color: 'rgba(245,158,11,0.65)' },
                                    ].map(role => {
                                        const checked = discordPingRoles.includes(role.id)
                                        return (
                                            <button
                                                key={role.id}
                                                onClick={() => {
                                                    const updated = checked
                                                        ? discordPingRoles.filter(r => r !== role.id)
                                                        : [...discordPingRoles, role.id]
                                                    setDiscordPingRoles(updated)
                                                    saveAttendanceSettings({ discordPingRoles: updated })
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                    padding: '6px 12px',
                                                    border: checked ? `1px solid ${role.color}` : '1px solid rgba(255,255,255,0.12)',
                                                    background: checked ? role.color.replace('0.65)', '0.14)') : 'rgba(255,255,255,0.03)',
                                                    color: checked ? role.color.replace('0.65)', '1)') : 'rgba(237,237,237,0.35)',
                                                    fontSize: '0.75rem', fontWeight: 700,
                                                    letterSpacing: '0.07em',
                                                    cursor: 'pointer', userSelect: 'none',
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                {checked && (
                                                    <svg width='11' height='11' viewBox='0 0 12 12' fill='none'>
                                                        <path d='M2 6l3 3 5-5' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
                                                    </svg>
                                                )}
                                                {role.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Mission Stage bar */}
                        {(() => {
                            const currentIdx = STAGE_DEFS.findIndex(s => s.id === displayStage)
                            const NEEDS_CONFIRM = new Set<AttendanceStage>(['op_running', 'confirmations_open', 'completed'])
                            const CONFIRM_MSGS: Record<string, string> = {
                                op_running:          'Mark the operation as Active? This sets it to "Op Running".',
                                confirmations_open:  `End "${title || 'this mission'}"? This marks it Completed and opens attendance confirmation.`,
                                completed:           'Close attendance confirmation? Squad leaders will no longer be able to confirm.',
                            }
                            return (
                                <div>
                                    <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: c(0.55), marginBottom: 16 }}>
                                        Mission Stage
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                                        {STAGE_DEFS.map((s, i) => {
                                            const isPast    = i < currentIdx
                                            const isCurrent = i === currentIdx
                                            const nodeColor = isCurrent ? c(1) : isPast ? 'rgba(0,200,80,0.6)' : 'rgba(255,255,255,0.1)'
                                            const borderClr = isCurrent ? c(0.9) : isPast ? 'rgba(0,200,80,0.5)' : 'rgba(255,255,255,0.15)'
                                            const labelClr  = isCurrent ? 'rgba(237,237,237,0.95)' : isPast ? 'rgba(0,200,80,0.7)' : 'rgba(237,237,237,0.2)'
                                            return (
                                                <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', flex: i < STAGE_DEFS.length - 1 ? 1 : undefined }}>
                                                    {/* Node + label */}
                                                    <div
                                                        onClick={isHQ ? () => {
                                                            if (i === currentIdx) return
                                                            if (NEEDS_CONFIRM.has(s.id)) { setConfirmStage(s.id); return }
                                                            applyStage(s.id)
                                                        } : undefined}
                                                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, cursor: isHQ && i !== currentIdx ? 'pointer' : 'default', minWidth: 44 }}
                                                    >
                                                        <div style={{
                                                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                                            background: nodeColor, border: `2px solid ${borderClr}`,
                                                            boxShadow: isCurrent ? `0 0 10px ${c(0.45)}` : 'none',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            transition: 'all 0.2s',
                                                        }}>
                                                            {isPast && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.9)', lineHeight: 1 }}>✓</span>}
                                                        </div>
                                                        <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
                                                            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: labelClr }}>{s.label}</div>
                                                            {s.sub && <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: labelClr }}>{s.sub}</div>}
                                                        </div>
                                                    </div>
                                                    {/* Connector */}
                                                    {i < STAGE_DEFS.length - 1 && (
                                                        <div style={{ flex: 1, height: 2, marginTop: 9, background: isPast ? 'rgba(0,200,80,0.35)' : 'rgba(255,255,255,0.08)' }} />
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                    {/* Confirm dialog for impactful stage changes */}
                                    <ConfirmDialog
                                        open={confirmStage !== null}
                                        title='Change Stage'
                                        message={confirmStage ? (CONFIRM_MSGS[confirmStage] ?? `Move to "${confirmStage}"?`) : ''}
                                        confirmLabel='Confirm'
                                        danger
                                        onConfirm={() => { const s = confirmStage!; setConfirmStage(null); applyStage(s) }}
                                        onCancel={() => setConfirmStage(null)}
                                    />
                                </div>
                            )
                        })()}
                    </div>}
                </div>
            )}

            {/* Custom Attendance Units — HQ only */}
            {isHQ && opID && (
                <div style={{
                    border: `1px solid ${c(0.12)}`,
                    borderTop: `2px solid rgba(251,191,36,0.35)`,
                    marginBottom: 20,
                    background: 'rgba(0,0,0,0.22)',
                }}>
                    {/* Header */}
                    <div
                        onClick={() => setCustomUnitsOpen(o => !o)}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 16px', cursor: 'pointer',
                            background: 'rgba(0,0,0,0.28)',
                            borderBottom: customUnitsOpen ? `1px solid ${c(0.08)}` : 'none',
                            userSelect: 'none',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 6, height: 6, background: 'rgba(251,191,36,0.6)', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: c(0.85) }}>
                                Custom Attendance Units
                            </span>
                            {customUnits.length > 0 && (
                                <span style={{
                                    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em',
                                    padding: '1px 7px', background: 'rgba(251,191,36,0.14)',
                                    border: '1px solid rgba(251,191,36,0.3)', color: 'rgba(251,191,36,0.9)',
                                }}>
                                    {customUnits.length}
                                </span>
                            )}
                        </div>
                        <svg width='14' height='14' viewBox='0 0 14 14' fill='none' style={{ transition: 'transform 0.18s', transform: customUnitsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            <path d='M3 5l4 4 4-4' stroke={c(0.5)} strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' />
                        </svg>
                    </div>

                    {customUnitsOpen && (
                        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {/* Existing units list */}
                            {customUnits.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {customUnits.map(unit => (
                                        <div key={unit.id} style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '7px 12px',
                                            background: 'rgba(255,255,255,0.04)',
                                            border: '1px solid rgba(255,255,255,0.07)',
                                        }}>
                                            {unit.color && (
                                                <div style={{
                                                    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                                                    background: unit.color,
                                                    border: '1px solid rgba(255,255,255,0.2)',
                                                }} />
                                            )}
                                            <span style={{ fontSize: '0.78rem', color: c(0.9), flex: 1 }}>{unit.name}</span>
                                            <button
                                                onClick={async () => {
                                                    setCustomUnitsSaving(true)
                                                    try {
                                                        await fetch(`/api/operations/${opID}/attendance/custom-units?unitId=${unit.id}`, { method: 'DELETE' })
                                                        setCustomUnits(prev => prev.filter(u => u.id !== unit.id))
                                                    } finally {
                                                        setCustomUnitsSaving(false)
                                                    }
                                                }}
                                                disabled={customUnitsSaving}
                                                style={{
                                                    padding: '3px 8px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em',
                                                    border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)',
                                                    color: 'rgba(239,68,68,0.7)', cursor: 'pointer',
                                                    opacity: customUnitsSaving ? 0.5 : 1,
                                                }}
                                            >
                                                REMOVE
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {customUnits.length === 0 && (
                                <div style={{ fontSize: '0.72rem', color: c(0.35), fontStyle: 'italic', textAlign: 'center', padding: '8px 0' }}>
                                    No custom units defined. Add one below.
                                </div>
                            )}

                            {/* Add new unit form */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 4, borderTop: `1px solid ${c(0.07)}` }}>
                                <input
                                    value={newUnitName}
                                    onChange={e => setNewUnitName(e.target.value)}
                                    placeholder='Unit name…'
                                    maxLength={40}
                                    style={{
                                        flex: 1, padding: '7px 10px', fontSize: '0.78rem',
                                        background: 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${c(0.15)}`, color: c(0.9),
                                        outline: 'none',
                                    }}
                                />
                                <input
                                    type='color'
                                    value={newUnitColor || '#888888'}
                                    onChange={e => setNewUnitColor(e.target.value)}
                                    title='Unit colour'
                                    style={{
                                        width: 34, height: 34, padding: 2, cursor: 'pointer',
                                        background: 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${c(0.15)}`,
                                    }}
                                />
                                <button
                                    disabled={!newUnitName.trim() || customUnitsSaving}
                                    onClick={async () => {
                                        if (!newUnitName.trim()) return
                                        setCustomUnitsSaving(true)
                                        try {
                                            const res = await fetch(`/api/operations/${opID}/attendance/custom-units`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ name: newUnitName.trim(), color: newUnitColor || undefined }),
                                            })
                                            const data = await res.json()
                                            if (data.unit) {
                                                setCustomUnits(prev => [...prev, data.unit])
                                                setNewUnitName('')
                                                setNewUnitColor('')
                                            }
                                        } finally {
                                            setCustomUnitsSaving(false)
                                        }
                                    }}
                                    style={{
                                        padding: '7px 14px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em',
                                        border: '1px solid rgba(251,191,36,0.35)', background: 'rgba(251,191,36,0.1)',
                                        color: 'rgba(251,191,36,0.9)', cursor: 'pointer',
                                        opacity: (!newUnitName.trim() || customUnitsSaving) ? 0.4 : 1,
                                        transition: 'opacity 0.15s',
                                    }}
                                >
                                    + ADD
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Document sections */}
            {loaded ? (
                <OperationEditor
                    documentId={opID}
                    uploadUrl='/api/operations/upload'
                    defaultSectionTitle='Situation'
                    initialContent={initialContent}
                    themeColor={themeColor}
                    initialMeta={{ title, department, date: date?.toISOString() ?? '', loreDate: loreDate ?? '' }}
                    onMetaChange={fields => {
                        if (fields.title !== undefined) setTitle(fields.title)
                        if (fields.department !== undefined) setDepartment(fields.department)
                        if (fields.date !== undefined) setDate(fields.date ? dayjs(fields.date) : null)
                        if (fields.loreDate !== undefined) setLoreDate(fields.loreDate ?? '')
                    }}
                    metaHandleRef={metaHandleRef}
                    onSaveStatusChange={setSaveStatus}
                />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <style>{`@keyframes op-pulse{0%,100%{opacity:.35}50%{opacity:.75}}.op-pulse{animation:op-pulse 1.8s ease-in-out infinite}`}</style>
                    {[1, 0.6].map((opacity, i) => (
                        <div key={i} style={{ border: `1px solid ${c(0.1)}`, borderTop: `2px solid ${c(0.25)}`, opacity }}>
                            <div style={{ background: 'rgba(0,0,0,0.35)', padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div className='op-pulse' style={{ width: 6, height: 6, background: c(0.35), flexShrink: 0 }} />
                                    <div className='op-pulse' style={{ height: 7, width: 110 + i * 30, background: c(0.18), borderRadius: 2 }} />
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {[28, 28, 28, 28, 28].map((w, j) => (
                                        <div key={j} className='op-pulse' style={{ width: w, height: 24, background: 'rgba(255,255,255,0.04)', borderRadius: 2 }} />
                                    ))}
                                </div>
                            </div>
                            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 11 }}>
                                {[88, 72, 80, 52].map((w, j) => (
                                    <div key={j} className='op-pulse' style={{ height: 8, width: `${w}%`, background: 'rgba(237,237,237,0.055)', borderRadius: 2, animationDelay: `${j * 0.12}s` }} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            </div>{/* end edit column */}

            {/* Activity log drawer — fixed overlay from right */}
            {opID && (
                <div style={{
                    position: 'fixed',
                    top: 64,
                    right: 0,
                    bottom: 0,
                    width: 'clamp(280px, 30vw, 460px)',
                    transform: activityOpen ? 'translateX(0)' : 'translateX(100%)',
                    transition: 'transform 0.25s ease',
                    zIndex: 50,
                    borderLeft: '1px solid rgba(255,255,255,0.09)',
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    <ActivityLog operationId={opID} onClose={() => setActivityOpen(false)} />
                </div>
            )}

            {/* Preview drawer — fixed overlay from right */}
            {opID && (
                <div style={{
                    position: 'fixed',
                    top: 64,
                    right: 0,
                    bottom: 0,
                    width: 'clamp(360px, 40vw, 700px)',
                    transform: previewOpen ? 'translateX(0)' : 'translateX(100%)',
                    transition: 'transform 0.25s ease',
                    zIndex: 50,
                    borderLeft: '1px solid rgba(255,255,255,0.09)',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'rgba(8,8,8,0.97)',
                }}>
                    {/* Panel header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 16px',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        background: 'rgba(0,0,0,0.3)',
                        flexShrink: 0,
                    }}>
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>
                            Live Preview
                        </span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button
                                onClick={() => {
                                    if (previewIframeRef.current)
                                        previewIframeRef.current.src = `/operations/${opID}?_t=${Date.now()}`
                                }}
                                style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', background: 'none', border: '1px solid rgba(255,255,255,0.08)', padding: '3px 10px', cursor: 'pointer' }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.7)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(237,237,237,0.3)')}
                            >
                                Refresh
                            </button>
                            <button
                                onClick={() => setPreviewOpen(false)}
                                style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: c(0.5), background: 'none', border: `1px solid ${c(0.2)}`, padding: '3px 10px', cursor: 'pointer' }}
                                onMouseEnter={e => (e.currentTarget.style.color = c(0.9))}
                                onMouseLeave={e => (e.currentTarget.style.color = c(0.5))}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                    <iframe
                        ref={previewIframeRef}
                        src={`/operations/${opID}`}
                        onLoad={e => {
                            try {
                                const doc = (e.target as HTMLIFrameElement).contentDocument
                                if (!doc) return
                                const style = doc.createElement('style')
                                style.textContent = '#site-navbar, #site-footer { display: none !important; }'
                                doc.head.appendChild(style)
                            } catch {}
                        }}
                        style={{ flex: 1, border: 'none', width: '100%', display: 'block' }}
                    />
                </div>
            )}

        </div>
    )
}

// ─── Popular Arma 3 maps (shown when not in maps system) ─────────────────────

const POPULAR_MAPS: { name: string; displayName: string }[] = [
    { name: 'altis', displayName: 'Altis' },
    { name: 'stratis', displayName: 'Stratis' },
    { name: 'tanoa', displayName: 'Tanoa' },
    { name: 'malden', displayName: 'Malden' },
    { name: 'livonia', displayName: 'Livonia' },
    { name: 'chernarus', displayName: 'Chernarus' },
    { name: 'takistan', displayName: 'Takistan' },
    { name: 'sahrani', displayName: 'Sahrani' },
    { name: 'panthera', displayName: 'Panthera' },
    { name: 'lingor', displayName: 'Lingor' },
    { name: 'namalsk', displayName: 'Namalsk' },
    { name: 'fallujah', displayName: 'Fallujah' },
    { name: 'clafghan', displayName: 'Clafghan' },
    { name: 'porto', displayName: 'Porto' },
    { name: 'utes', displayName: 'Utes' },
    { name: 'zargabad', displayName: 'Zargabad' },
    { name: 'desert_e', displayName: 'Desert (IRL)' },
]

// ─── Map World Picker ─────────────────────────────────────────────────────────

function MapWorldPicker({
    value,
    worlds,
    onChange,
    themeColor,
}: {
    value: string
    worlds: { name: string; displayName: string; hasPreview: boolean }[]
    onChange: (name: string) => void
    themeColor: string
}) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [customValue, setCustomValue] = useState('')
    const [showCustom, setShowCustom] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const searchRef = useRef<HTMLInputElement>(null)

    const selected = worlds.find(w => w.name === value)
        ?? POPULAR_MAPS.find(m => m.name === value)
        ?? (value ? { name: value, displayName: value } : null)

    useEffect(() => {
        if (!open) { setSearch(''); setShowCustom(false) }
        else setTimeout(() => searchRef.current?.focus(), 50)
    }, [open])

    useEffect(() => {
        if (!open) return
        const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [open])

    // Merge maps-system worlds with popular maps (deduplicate by name)
    const systemNames = new Set(worlds.map(w => w.name))
    const popularFiltered = POPULAR_MAPS.filter(m => !systemNames.has(m.name))

    const allMaps: { name: string; displayName: string; hasPreview: boolean; isSystem?: boolean }[] = [
        ...worlds.map(w => ({ ...w, isSystem: true })),
        ...popularFiltered.map(m => ({ ...m, hasPreview: false, isSystem: false })),
    ]

    const q = search.toLowerCase()
    const filtered = q
        ? allMaps.filter(m => m.displayName.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
        : allMaps

    const systemMaps = filtered.filter(m => m.isSystem)
    const popularMaps = filtered.filter(m => !m.isSystem)

    function MapItem({ w }: { w: typeof allMaps[number] }) {
        const isActive = w.name === value
        return (
            <div
                className='mwp-item'
                onClick={() => { onChange(w.name); setOpen(false) }}
                style={{
                    position: 'relative',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 12px', cursor: 'pointer',
                    background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                    borderLeft: isActive ? `2px solid ${themeColor}` : '2px solid transparent',
                    fontSize: '0.78rem', color: isActive ? 'rgba(237,237,237,0.95)' : 'rgba(237,237,237,0.6)',
                }}
            >
                {!isActive && <div className='mwp-hover' style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.04)', opacity: 0, transition: 'opacity 0.1s ease', pointerEvents: 'none', willChange: 'opacity' }} />}
                {w.hasPreview ? (
                    <img src={`/map-assets/${w.name}/preview.jpg`} alt='' loading='lazy' style={{ width: 40, height: 28, objectFit: 'cover', flexShrink: 0, border: `1px solid ${isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}` }} />
                ) : (
                    <div style={{ width: 40, height: 28, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)' }}>MAP</span>
                    </div>
                )}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.displayName}</span>
                {w.isSystem && <span style={{ fontSize: '0.55rem', color: 'rgba(34,197,94,0.6)', flexShrink: 0, letterSpacing: '0.08em' }}>SYSTEM</span>}
            </div>
        )
    }

    return (
        <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
            <button
                type='button'
                onClick={() => setOpen(v => !v)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'rgba(0,0,0,0.4)',
                    border: `1px solid ${open ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'}`,
                    color: selected ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.3)',
                    fontSize: '0.8rem', letterSpacing: '0.06em',
                    padding: '6px 10px', cursor: 'pointer', minWidth: 160,
                    transition: 'border-color 0.15s',
                }}
            >
                {selected && worlds.find(w => w.name === value)?.hasPreview && (
                    <img src={`/map-assets/${value}/preview.jpg`} alt='' style={{ width: 28, height: 20, objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }} />
                )}
                <span style={{ flex: 1, textAlign: 'left' }}>{selected?.displayName ?? 'No Map'}</span>
                <span style={{ fontSize: '0.6rem', opacity: 0.4 }}>▾</span>
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 400,
                    background: 'rgb(14,14,14)', border: '1px solid rgba(255,255,255,0.12)',
                    minWidth: 260, maxHeight: 380,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
                    display: 'flex', flexDirection: 'column',
                }}>
                    <style>{`.mwp-item:hover .mwp-hover{opacity:1!important}`}</style>

                    {/* Search */}
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder='Search maps…'
                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem', padding: '5px 8px', outline: 'none', fontFamily: 'inherit' }}
                        />
                    </div>

                    {/* Custom map option */}
                    {!showCustom ? (
                        <button
                            type='button'
                            onClick={() => setShowCustom(true)}
                            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'rgba(219,0,29,0.05)', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', color: 'rgba(219,0,29,0.7)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textAlign: 'left' }}
                        >
                            + Custom Map…
                        </button>
                    ) : (
                        <div style={{ flexShrink: 0, display: 'flex', gap: 4, padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <input
                                autoFocus
                                value={customValue}
                                onChange={e => setCustomValue(e.target.value)}
                                placeholder='Enter map name…'
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && customValue.trim()) { onChange(customValue.trim()); setOpen(false) }
                                    if (e.key === 'Escape') setShowCustom(false)
                                }}
                                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(219,0,29,0.3)', color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem', padding: '4px 8px', outline: 'none', fontFamily: 'inherit' }}
                            />
                            <button type='button' onClick={() => { if (customValue.trim()) { onChange(customValue.trim()); setOpen(false) } }} style={{ background: 'rgba(219,0,29,0.15)', border: '1px solid rgba(219,0,29,0.35)', color: 'rgba(219,0,29,0.8)', fontSize: '0.68rem', fontWeight: 700, padding: '4px 10px', cursor: 'pointer' }}>OK</button>
                        </div>
                    )}

                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {/* No map option */}
                        <div className='mwp-item' onClick={() => { onChange(''); setOpen(false) }}
                            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', cursor: 'pointer', background: !value ? 'rgba(255,255,255,0.06)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.78rem', color: 'rgba(237,237,237,0.35)' }}>
                            <div className='mwp-hover' style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.04)', opacity: 0, transition: 'opacity 0.1s ease', pointerEvents: 'none', willChange: 'opacity' }} />
                            <div style={{ width: 40, height: 28, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>—</span>
                            </div>
                            No Map
                        </div>

                        {/* Maps system maps */}
                        {systemMaps.length > 0 && (
                            <>
                                <div style={{ padding: '5px 12px 3px', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(34,197,94,0.5)' }}>Maps System</div>
                                {systemMaps.map(w => <MapItem key={w.name} w={w} />)}
                            </>
                        )}

                        {/* Popular Arma 3 maps */}
                        {popularMaps.length > 0 && (
                            <>
                                <div style={{ padding: '5px 12px 3px', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>Arma 3 Maps</div>
                                {popularMaps.map(w => <MapItem key={w.name} w={w} />)}
                            </>
                        )}

                        {filtered.length === 0 && q && (
                            <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.72rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No maps matching "{search}"</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
