'use client'

import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import ConfirmDialog from '@/components/confirm-dialog'
import dayjs, { Dayjs } from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import dynamic from 'next/dynamic'
import PERMISSIONS from '@/lib/permissions'
import ActivityLog from './activity-log'
import FullscreenPage from '@/components/FullscreenPage'
import EditorShell, { useEditorTab } from './EditorShell'
import Header from './Header'
import StatusBar from './StatusBar'
import { useOperationStatus } from './hooks/useOperationStatus'
import MissionDeck from './deck/MissionDeck'
import CountdownStrip from './deck/CountdownStrip'
import ScheduleCard from './deck/ScheduleCard'
import StageCard from './deck/StageCard'
import DetailsCard from './deck/DetailsCard'
import AttendanceCard from './deck/AttendanceCard'
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

const CHECK_CONTENT: Record<'campaign' | 'single', Record<string, string[]>> = {
    campaign: {
        w16: ['Mission concept/idea submitted to J2', 'Initial discussion completed with team leads'],
        w12: ['Confirmed mission development has started', 'Initial planning document created', 'First mission scenario and orders started', 'J2 lead briefed on mission concept'],
        w10: ['Core framework and fundamentals established', 'First mission scenario and orders complete', 'Second and third missions started'],
        w8: ['Second and third missions complete', 'All subsequent missions started', 'All mission orders finalised'],
        w6: ['Final checks and revisions completed', 'Bug fixing pass completed', 'Server loadout and mission tested', 'Weekly Monday reminder sent (if any items incomplete)'],
        w4: ['Final development check completed', 'Arsenal and loadout updates confirmed'],
    },
    single: {
        w12: ['Mission concept/idea submitted to J2'],
        w10: ['Confirmed mission development has started', 'Mission scenario and orders started', 'J2 lead briefed on mission concept'],
        w8: ['Mission scenario and orders complete', 'Replacement mission arranged if not complete'],
        w6: ['Final checks and bug fixing completed', 'Server mission tested', 'Weekly Monday reminder sent (if any items incomplete)'],
        w4: ['Final development check completed', 'Arsenal and loadout updates confirmed'],
    },
}

// Header (48px) + tab bar (36px) from shell.module.css — the drawers below dock
// under the shell's own chrome now that FullscreenPage has dropped the site
// navbar this route used to sit under (that's where the old `top: 64` came from).
const EDITOR_CHROME_HEIGHT = 84

// Mixing the `border` shorthand with a per-side longhand (`borderTop`, `borderBottom`)
// in one style object makes React warn whenever either value updates on rerender.
// These build the all-longhand equivalent instead.
const sideBorders = (all: string, top: string): CSSProperties =>
    ({ borderTop: top, borderRight: all, borderBottom: all, borderLeft: all })

const bottomBorder = (bottom: string): CSSProperties =>
    ({ borderTop: 'none', borderRight: 'none', borderBottom: bottom, borderLeft: 'none' })

// Shared style for the collapsible section header buttons.
const sectionToggleStyle = (open: boolean): CSSProperties => ({
    ...bottomBorder(open ? '1px solid rgba(255,255,255,0.05)' : 'none'),
    width: '100%',
    background: 'none',
    cursor: 'pointer',
    textAlign: 'left',
})

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
    // Timestamp of the last successful scheduleSave — status-bar display only,
    // does not participate in the save path itself (see scheduleSave below).
    const [savedAt, setSavedAt] = useState<Date | null>(null)
    const [tab, setTab] = useEditorTab()

    // Mission deck (Task 8) — days-until-op countdown for the deck's strip.
    // Task 9 also consumes the timeline it builds, for the Timeline card.
    const { timeline, daysUntil, refresh } = useOperationStatus(opID)

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

    const [attendanceOpen, setAttendanceOpen] = useState(true)

    const [attStage, setAttStage] = useState<AttendanceStage>('preparing')
    const [confirmStage, setConfirmStage] = useState<AttendanceStage | null>(null)
    const [stageAdvancing, setStageAdvancing] = useState(false)
    // StageCard's own confirm target — kept separate from confirmStage
    // (the old Attendance Settings stepper's confirm state, untouched below)
    // so the two flows don't share dialog state while both remain live.
    const [stageCardConfirmTarget, setStageCardConfirmTarget] = useState<AttendanceStage | null>(null)

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
    // Debounce timers for the Timeline card's two free-text pickers (Task 9 fix) —
    // same idea as metaSaveTimer, just per-field, so dragging through a picker's
    // month/day/hour/minute sections doesn't fire a save per completed section.
    const rsvpOpenAtSaveTimer = useRef<ReturnType<typeof setTimeout>>()
    const rsvpCloseAtSaveTimer = useRef<ReturnType<typeof setTimeout>>()

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

        fetch('/api/me/permission?key=departmentLeads.j2')
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

                // Acknowledgements (pageId='main' for the primary doc)
                fetch(`/api/operations/${id}/acknowledge?pageId=main`)
                    .then(r => r.ok ? r.json() : null)
                    .then(d => { if (d) { setAckCount((d.acks ?? []).length); setAckList(d.acks ?? []) } })
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
                setSavedAt(new Date())
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

    // Publish flow — lifted unchanged from the old inline header buttons; only
    // the JSX moved (into Header.tsx), the fetch/state logic did not.
    async function confirmPublish() {
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

    // DetailsCard handlers (Task 11) — lifted verbatim out of the old
    // "Operation Details" panel's inline onChange/onBlur closures. Same
    // scheduleSave keys, same endpoints, same metaHandleRef mirroring; only
    // the JSX moved.
    function handleTitleChange(v: string) {
        setTitle(v)
        metaHandleRef.current?.set('title', v)
        scheduleSave({ title: v })
    }

    function handleDepartmentChange(v: string) {
        setDepartment(v)
        metaHandleRef.current?.set('department', v)
        scheduleSave({ department: v })
    }

    function handleStatusChange(v: string) {
        setStatus(v)
        scheduleSave({ status: v })
    }

    function handleThemeColorChange(v: string) {
        setThemeColor(v)
        scheduleSave({ themeColor: v })
    }

    function handlePageThemeChange(v: string) {
        setPageTheme(v)
        scheduleSave({ pageTheme: v })
    }

    function handleMapWorldChange(w: string) {
        setMapWorld(w)
        scheduleSave({ mapWorld: w })
    }

    function handleLoreDateChange(v: Dayjs | null) {
        setLoreDateDayjs(v)
        const str = v?.isValid() ? v.format('DD/MM/YYYY HH:mm') : ''
        setLoreDate(str)
        metaHandleRef.current?.set('loreDate', str)
        scheduleSave({ loreDate: str })
    }

    function handleBilletPointsChange(v: number) {
        setBilletPoints(v)
    }

    // billetPoints is read from render-time closure, same as the old inline
    // onBlur handler — fine since this is recreated every render.
    async function handleBilletPointsBlur() {
        await fetch(`/api/operations/update?id=${opID}&billetPoints=${billetPoints}`)
    }

    async function handleOpenOwnerPicker() {
        if (j2Members.length === 0) {
            const res = await fetch('/api/admin/members?department=j2')
            const data = await res.json()
            setJ2Members((data.members ?? []).map((m: any) => ({ id: m.discordId ?? m._id, displayName: m.displayName ?? m.name ?? 'Unknown' })))
        }
        setOwnerPickerOpen(true)
    }

    function handleCloseOwnerPicker() {
        setOwnerPickerOpen(false)
    }

    async function handleSelectOwner(id: string, displayName: string) {
        setOwnedBy(id)
        setOwnedByName(displayName)
        setOwnerPickerOpen(false)
        await fetch(`/api/operations/update?id=${opID}&ownedBy=${encodeURIComponent(id)}&ownedByName=${encodeURIComponent(displayName)}`)
    }

    // Complete Mission (Task 11, ruling 1) — restores the old panel's button,
    // which called `applyStage('confirmations_open')` directly with no
    // confirmation step. That call writes the operation's `status` (via
    // `fetch('/api/operations/update?...status=Completed')` + `setStatus`)
    // and, as the same side effect it always had, the attendance `stage` —
    // two different fields on two different documents that happen to share
    // the word "completed". Routed through commitStageChange rather than a
    // bare applyStage call so it picks up the same double-click guard and
    // refresh() every other stage-changing control already has; that's an
    // additive safety net, not a behaviour change, since the underlying
    // write is identical either way.
    function handleCompleteMission() {
        commitStageChange('confirmations_open')
    }

    // AttendanceCard handlers (Task 11) — same saveAttendanceSettings path
    // (with its `?? current` sibling-field fallbacks) the old Attendance
    // Settings panel's platoon checkboxes and ping toggle already used.
    function handleTogglePlatoon(id: string) {
        const updated = assignedPlatoons.includes(id)
            ? assignedPlatoons.filter(p => p !== id)
            : [...assignedPlatoons, id]
        setAssignedPlatoons(updated)
        saveAttendanceSettings({ assignedPlatoons: updated })
    }

    function handleTogglePing() {
        const next = !discordPingEnabled
        setDiscordPingEnabled(next)
        saveAttendanceSettings({ discordPingEnabled: next })
    }

    // Custom-unit add/remove for AttendanceCard's "+ Custom Unit" chip — same
    // endpoint the (untouched) Custom Attendance Units panel below uses, kept
    // as separate functions rather than reusing that panel's inline handlers
    // so this task doesn't touch code a later task owns.
    async function addCustomUnit(name: string, color?: string) {
        setCustomUnitsSaving(true)
        try {
            const res = await fetch(`/api/operations/${opID}/attendance/custom-units`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, color }),
            })
            const data = await res.json()
            if (data.unit) setCustomUnits(prev => [...prev, data.unit])
        } finally {
            setCustomUnitsSaving(false)
        }
    }

    async function removeCustomUnit(id: string) {
        setCustomUnitsSaving(true)
        try {
            await fetch(`/api/operations/${opID}/attendance/custom-units?unitId=${id}`, { method: 'DELETE' })
            setCustomUnits(prev => prev.filter(u => u.id !== id))
        } finally {
            setCustomUnitsSaving(false)
        }
    }

    // Timeline card handlers (Task 9, fixed up per review) — direct-acting
    // controls, one per row.
    //
    // The operation date now goes through the same debounced scheduleSave
    // path every other meta field uses (title/department/status/... — see
    // scheduleSave above), instead of a raw per-keystroke fetch: it debounces
    // at 1s and drives the StatusBar's saved indicator like everything else.
    //
    // The five RSVP fields still go through saveAttendanceSettings (same
    // POST /api/operations/${opID}/attendance/platoons as before). Each of
    // the six RSVP handlers below calls refresh() (from useOperationStatus)
    // once its save lands, so the timeline's server-derived bits — detail
    // text, current/pending dot state — catch up immediately instead of
    // waiting for the next 30s poll. The picker/pill *values* don't need
    // that round trip: they're driven off local rsvpOpenAt/rsvpCloseOffsetMins
    // state (passed into ScheduleCard as props), the same way date and
    // closeOffsetMins already were, not off the polled timeline.
    function handleChangeDate(v: Dayjs | null) {
        if (!v) return
        const iso = v.toISOString()
        metaHandleRef.current?.set('date', iso)
        setDate(v)
        scheduleSave({ date: iso })
    }

    // "Manual" pill — matches the old panel's Manual button (always clears it).
    async function handleSetRsvpOpenManual() {
        if (!rsvpOpenAt) return
        setRsvpOpenAt(null)
        await saveAttendanceSettings({ rsvpOpenAt: null })
        refresh()
    }

    // "Scheduled" pill — matches the old panel's Scheduled button: only
    // defaults (3 days before the op date) if nothing's set yet and there's
    // an op date to default from; otherwise a no-op, same as before.
    async function handleSetRsvpOpenScheduled() {
        if (rsvpOpenAt || !date) return
        const openAt = new Date(date.toDate().getTime() - 3 * 24 * 3600000).toISOString()
        setRsvpOpenAt(openAt)
        await saveAttendanceSettings({ rsvpOpenAt: openAt })
        refresh()
    }

    // Exact RSVP-open instant picked directly off the DateTimePicker. Debounced —
    // dragging through the picker's date/time sections fires onChange per section.
    function handleChangeRsvpOpenAt(v: Dayjs | null) {
        if (!v) return
        const iso = v.toISOString()
        setRsvpOpenAt(iso)
        clearTimeout(rsvpOpenAtSaveTimer.current)
        rsvpOpenAtSaveTimer.current = setTimeout(async () => {
            await saveAttendanceSettings({ rsvpOpenAt: iso })
            refresh()
        }, 1000)
    }

    // RSVP-open quick-set relative to the op date (1 day/3 days/1 week/2 weeks before).
    async function handleQuickSetRsvpOpen(mins: number) {
        if (!date) return
        const iso = new Date(date.toDate().getTime() - mins * 60000).toISOString()
        setRsvpOpenAt(iso)
        await saveAttendanceSettings({ rsvpOpenAt: iso })
        refresh()
    }

    async function handleChangeCloseOffset(mins: number) {
        setRsvpCloseOffsetMins(mins)
        await saveAttendanceSettings({ rsvpCloseOffsetMins: mins })
        refresh()
    }

    // Custom RSVP-close instant — same as the old panel's "Custom…" picker:
    // it only ever persists as the derived minutes-before-op-date, and does
    // nothing without an op date to derive that offset from. Debounced for
    // the same reason as handleChangeRsvpOpenAt.
    function handleChangeRsvpCloseAt(v: Dayjs | null) {
        if (!v || !date) return
        const mins = Math.max(0, Math.round((date.toDate().getTime() - v.toDate().getTime()) / 60000))
        setRsvpCloseOffsetMins(mins)
        clearTimeout(rsvpCloseAtSaveTimer.current)
        rsvpCloseAtSaveTimer.current = setTimeout(async () => {
            await saveAttendanceSettings({ rsvpCloseOffsetMins: mins })
            refresh()
        }, 1000)
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

    // StageCard's write path (Task 10, extended) — reuses applyStage, the
    // same handler the Attendance Settings stepper's node clicks call, so it
    // saves through the exact same endpoint (POST .../attendance/platoons)
    // and payload regardless of whether the change came from the Advance
    // button or a progress-segment click. Guards against a double-click (or
    // a segment click while a write is already in flight) firing two writes,
    // and calls refresh() so the deck's timeline (and StatusBar) pick up the
    // change immediately instead of waiting on the next 30s poll.
    async function commitStageChange(to: AttendanceStage) {
        if (stageAdvancing) return
        setStageAdvancing(true)
        try {
            await applyStage(to)
            refresh()
        } finally {
            setStageAdvancing(false)
        }
    }

    // Same three stages the Attendance Settings stepper's own NEEDS_CONFIRM
    // guards (~line 1712 below, in the untouched old stepper block) — going
    // Active, opening attendance confirmation (billet points), and closing
    // it. Duplicated here rather than shared so that block doesn't need
    // touching; both flows write through the same applyStage/commitStageChange
    // path regardless.
    const STAGE_CARD_CONFIRM_MSGS: Partial<Record<AttendanceStage, string>> = {
        op_running:          'Mark the operation as Active? This sets it to "Op Running".',
        confirmations_open:  `End "${title || 'this mission'}"? This marks it Completed and opens attendance confirmation.`,
        completed:            'Close attendance confirmation? Squad leaders will no longer be able to confirm.',
    }

    // Entry point for both StageCard controls (Advance button and segment
    // clicks). Pauses for confirmation on the three impactful stages above;
    // everything else commits immediately.
    function requestStageChange(to: AttendanceStage) {
        if (stageAdvancing) return
        if (STAGE_CARD_CONFIRM_MSGS[to]) {
            setStageCardConfirmTarget(to)
            return
        }
        commitStageChange(to)
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
                ...sideBorders(`2px solid rgba(219,0,29,0.12)`, `2px solid rgba(219,0,29,0.75)`),
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

    // Mission-development check counts for the deck's countdown strip.
    // Mirrors the exact same week list / completion check the Mission
    // Development panel below computes for its own `checks`/`allDone` — kept
    // as a separate computation (rather than hoisting that panel's IIFE)
    // because the panel's version also needs `dueDate`/`isOverdue` per check
    // and its own save/remove handlers, which the strip doesn't.
    const devCheckBaseDate = isCampaignOp && campaignStartDate
        ? new Date(campaignStartDate)
        : date?.toDate() ?? null
    const devCheckWeeks = isCampaignOp ? [16, 12, 10, 8, 6, 4] : [12, 10, 8, 6, 4]
    const checksTotal = opID && devCheckBaseDate ? devCheckWeeks.length : 0
    const checksDone = opID && devCheckBaseDate
        ? devCheckWeeks.filter(weeks => !!missionDev?.completions?.[`w${weeks}`]).length
        : 0

    return (
        <>
            {/* Drops the global site navbar/footer (styles/globals.css:31-34) — same
                pattern as /operations/[id]/map and /maps/[name]. The shell's own back
                crumb replaces the site nav. */}
            <FullscreenPage />

            <ConfirmDialog
                open={confirmDelete}
                title='Delete Mission'
                message={`"${title || 'This mission'}" will be permanently deleted. This cannot be undone.`}
                confirmLabel='Delete'
                danger
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete(false)}
            />

            {/* StageCard's confirm gate (Advance button + segment clicks) — same
                three impactful stages, same messages, as the old Attendance
                Settings stepper's own dialog further down. */}
            <ConfirmDialog
                open={stageCardConfirmTarget !== null}
                title='Change Stage'
                message={stageCardConfirmTarget ? (STAGE_CARD_CONFIRM_MSGS[stageCardConfirmTarget] ?? `Move to "${stageCardConfirmTarget}"?`) : ''}
                confirmLabel='Confirm'
                danger
                onConfirm={() => { const s = stageCardConfirmTarget!; setStageCardConfirmTarget(null); commitStageChange(s) }}
                onCancel={() => setStageCardConfirmTarget(null)}
            />

            <EditorShell
                operationId={opID}
                themeColor={themeColor}
                isHQ={isHQ}
                tab={tab}
                onTabChange={setTab}
                header={
                    <Header
                        operationId={opID}
                        fromJ2={fromJ2}
                        title={title}
                        status={status}
                        saveStatus={saveStatus}
                        isHQ={isHQ}
                        onDelete={() => setConfirmDelete(true)}
                        activityOpen={activityOpen}
                        onToggleActivity={() => setActivityOpen(o => !o)}
                        onOpenPreview={() => window.open(`/operations/${opID}`, '_blank')}
                        publishConfirmOpen={publishConfirmOpen}
                        publishSaving={publishSaving}
                        onPublishClick={() => setPublishConfirmOpen(true)}
                        onPublishConfirm={confirmPublish}
                        onPublishCancel={() => setPublishConfirmOpen(false)}
                    />
                }
                statusBar={
                    <StatusBar
                        // null, not true — no Hocuspocus provider is reachable from this
                        // page (CollabEditor doesn't expose it), so the socket state is
                        // genuinely unmeasured here, not "known connected".
                        connected={null}
                        activeDocTitle={title || 'Untitled'}
                        words={0}
                        sections={0}
                        savedAt={savedAt}
                        editorCount={1}
                        department={department}
                    />
                }
                deck={
                    <MissionDeck
                        strip={<CountdownStrip daysUntil={daysUntil} checksDone={checksDone} checksTotal={checksTotal} />}
                    >
                        {opID && (
                            <DetailsCard
                                title={title}
                                onTitleChange={handleTitleChange}
                                ownedBy={ownedBy}
                                ownedByName={ownedByName}
                                canPickOwner={isJ2Lead || isJ4Admin}
                                ownerPickerOpen={ownerPickerOpen}
                                j2Members={j2Members}
                                onOpenOwnerPicker={handleOpenOwnerPicker}
                                onCloseOwnerPicker={handleCloseOwnerPicker}
                                onSelectOwner={handleSelectOwner}
                                canSeeBilletPoints={isJ2Lead || isJ4Admin}
                                billetPoints={billetPoints}
                                onBilletPointsChange={handleBilletPointsChange}
                                onBilletPointsBlur={handleBilletPointsBlur}
                                department={department}
                                onDepartmentChange={handleDepartmentChange}
                                status={status}
                                isHQ={isHQ}
                                onStatusChange={handleStatusChange}
                                themeColor={themeColor}
                                onThemeColorChange={handleThemeColorChange}
                                pageTheme={pageTheme}
                                eraOptions={eraOptions}
                                onPageThemeChange={handlePageThemeChange}
                                mapWorld={mapWorld}
                                availableWorlds={availableWorlds}
                                onMapWorldChange={handleMapWorldChange}
                                loreDateDayjs={loreDateDayjs}
                                onLoreDateChange={handleLoreDateChange}
                                onCompleteMission={handleCompleteMission}
                                completingMission={stageAdvancing}
                                coverImage={coverImage}
                                coverUploading={coverUploading}
                                onUploadCover={uploadCover}
                                onRemoveCover={removeCover}
                            />
                        )}
                        {isHQ && opID && (
                            <ScheduleCard
                                timeline={timeline}
                                date={date}
                                onChangeDate={handleChangeDate}
                                rsvpOpenAt={rsvpOpenAt}
                                onSetRsvpOpenManual={handleSetRsvpOpenManual}
                                onSetRsvpOpenScheduled={handleSetRsvpOpenScheduled}
                                onChangeRsvpOpenAt={handleChangeRsvpOpenAt}
                                onQuickSetRsvpOpen={handleQuickSetRsvpOpen}
                                closeOffsetMins={rsvpCloseOffsetMins}
                                onChangeCloseOffset={handleChangeCloseOffset}
                                onChangeRsvpCloseAt={handleChangeRsvpCloseAt}
                                automationPaused={status === 'In Development'}
                            />
                        )}
                        {isHQ && opID && (
                            <StageCard
                                stage={displayStage}
                                onAdvance={requestStageChange}
                                onSelect={requestStageChange}
                                advancing={stageAdvancing}
                            />
                        )}
                        {/* Gated by not rendering at all (spec §1) — not by disabling. */}
                        {isHQ && opID && (
                            <AttendanceCard
                                platoons={PLATOON_OPTS}
                                selected={assignedPlatoons}
                                onToggle={handleTogglePlatoon}
                                customUnits={customUnits}
                                onAddCustomUnit={addCustomUnit}
                                onRemoveCustomUnit={removeCustomUnit}
                                customUnitsSaving={customUnitsSaving}
                                pingEnabled={discordPingEnabled}
                                onTogglePing={handleTogglePing}
                            />
                        )}
                        {/* Later tasks add more deck cards here. */}
                    </MissionDeck>
                }
            >
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
                        <div style={{ ...sideBorders(`1px solid ${c(0.15)}`, `2px solid ${allDone ? 'rgba(0,200,80,0.6)' : c(0.5)}`), background: 'rgba(255,255,255,0.01)', marginBottom: 20 }}>
                            <button type='button' onClick={() => setMissionDevOpen(v => !v)}
                                className='flex items-center justify-between px-4 py-3'
                                style={sectionToggleStyle(missionDevOpen)}
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
                                    <div style={{ background: '#0f0f10', ...sideBorders(`1px solid ${c(0.35)}`, `2px solid rgba(0,200,80,0.7)`), padding: '24px 28px', maxWidth: 500, width: '90%', display: 'flex', flexDirection: 'column', gap: 16 }}>
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

                                        {(() => {
                                            const items = CHECK_CONTENT[isCampaignOp ? 'campaign' : 'single'][ch.id] ?? []
                                            if (!items.length) return null
                                            return (
                                                <div style={{ background: 'rgba(0,200,80,0.04)', border: '1px solid rgba(0,200,80,0.12)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(0,200,80,0.45)', marginBottom: 4, fontFamily: 'monospace' }}>
                                                        Stage Checklist
                                                    </div>
                                                    {items.map((item, i) => (
                                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                                            <span style={{ fontSize: '0.6rem', color: 'rgba(0,200,80,0.5)', marginTop: 1, flexShrink: 0 }}>◻</span>
                                                            <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.45 }}>{item}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )
                                        })()}

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
                                    <div style={{ background: '#0f0f10', ...sideBorders(`1px solid rgba(100,150,237,0.35)`, `2px solid rgba(100,150,237,0.8)`), padding: '24px 28px', maxWidth: 440, width: '90%', display: 'flex', flexDirection: 'column', gap: 16 }}>
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

            {/* Acknowledgements — owned by Task 12, not this one. Its proper
                home is the Attendance tab Task 12 builds; left mounted here,
                functionally unchanged from the old "Operation Details" panel,
                so it isn't lost in the meantime. Do not restyle, move, or
                delete it as part of any other task — see task-11-report.md
                for the ruling. Everything else that old panel held (title,
                owner, billet points, department, status, theme colour, era,
                map, in-game date, cover photo) now lives in the deck's
                DetailsCard. */}
            <div style={{ marginBottom: 20 }}>
                {status === 'Upcoming' && (
                    <div style={{ ...sideBorders(`1px solid ${c(0.15)}`, `2px solid ${c(0.5)}`), background: 'rgba(255,255,255,0.01)', padding: '12px 16px' }}>
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
            </div>

            {/* Attendance settings — HQ only */}
            {isHQ && opID && (
                <div style={{ ...sideBorders(`1px solid ${c(0.15)}`, `2px solid ${c(0.5)}`), background: 'rgba(255,255,255,0.01)', marginBottom: 20 }}>
                    <button type='button' onClick={() => setAttendanceOpen(v => !v)}
                        className='flex items-center justify-between px-4 py-3'
                        style={sectionToggleStyle(attendanceOpen)}
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
                    ...sideBorders(`1px solid ${c(0.12)}`, `2px solid rgba(251,191,36,0.35)`),
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
                        <div key={i} style={{ ...sideBorders(`1px solid ${c(0.1)}`, `2px solid ${c(0.25)}`), opacity }}>
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
        </div>
            </EditorShell>

            {/* Activity log drawer — fixed overlay from right */}
            {opID && (
                <div style={{
                    position: 'fixed',
                    top: EDITOR_CHROME_HEIGHT,
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
                    top: EDITOR_CHROME_HEIGHT,
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
        </>
    )
}
