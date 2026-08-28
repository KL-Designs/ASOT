'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import ConfirmDialog from '@/components/confirm-dialog'
import dayjs, { Dayjs } from 'dayjs'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import PERMISSIONS from '@/lib/permissions'
import { hexToRgb } from '@/lib/colour'
import ActivityLog from './activity-log'
import FullscreenPage from '@/components/FullscreenPage'
import EditorShell, { useEditorTab } from './EditorShell'
import Header from './Header'
import StatusBar from './StatusBar'
import { useOperationStatus } from './hooks/useOperationStatus'
import { usePresence } from './hooks/usePresence'
import { useDocStats } from './hooks/useDocStats'
import MissionDeck from './deck/MissionDeck'
import CountdownStrip from './deck/CountdownStrip'
import DetailsCard from './deck/DetailsCard'
import BriefTab from './tabs/BriefTab'
import MapTab from './tabs/MapTab'
import ScheduleTab from './tabs/schedule/ScheduleTab'
import AttendanceTab from './tabs/AttendanceTab'
import type { MapWorld } from '@/components/operations/map/types'

interface MetaFields { title: string; department: string; date: string; loreDate: string }

type AttendanceStage = 'preparing' | 'rsvp_open' | 'rsvp_closed' | 'op_running' | 'confirmations_open' | 'completed'

// Header row height (Header.tsx) — back crumb, title, status pill, section
// tabs and the save/Publish/overflow cluster all in one merged row now, no
// separate tab bar underneath. The drawers below dock under the shell's own
// chrome now that FullscreenPage has dropped the site navbar this route used
// to sit under (that's where the old `top: 64` came from).
const EDITOR_CHROME_HEIGHT = 52

export default function EditorPage() {
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
    const [availableWorlds, setAvailableWorlds] = useState<MapWorld[]>([])
    const [isHQ, setIsHQ] = useState(false)
    const [isJ2Lead, setIsJ2Lead] = useState(false)
    // `operations.overrideLifecycle` — gates the Schedule tab's status
    // override. Deliberately not implied by operations.write: setting an
    // operation back to In Development suspends every automation.
    const [canOverrideLifecycle, setCanOverrideLifecycle] = useState(false)
    // `attendance.manage` — gates the live board's manage mode. Separate from
    // operations.write because running an operation and deciding who plays in
    // it are different jobs held by different people.
    const [canManageAttendance, setCanManageAttendance] = useState(false)
    /** Own Discord id, so the board can tell the viewer's own row apart. */
    const [myUserId, setMyUserId] = useState<string | null>(null)
    const [isJ4Admin, setIsJ4Admin] = useState(false)
    const [initialContent, setInitialContent] = useState<any>(undefined)
    const [loaded, setLoaded] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
    // Timestamp of the last successful scheduleSave — status-bar display only,
    // does not participate in the save path itself (see scheduleSave below).
    const [savedAt, setSavedAt] = useState<Date | null>(null)
    const [tab, setTab] = useEditorTab()

    // Status bar (Task 12) — the Hocuspocus provider CollabEditor creates,
    // reached via the one prop it's allowed to gain (`onProviderReady`).
    // `usePresence`/`useDocStats` are the same hooks StatusBar's own doc
    // already names as its two data sources; wired here because page.tsx is
    // where the provider first becomes reachable.
    const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
    const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected' | null>(null)
    useEffect(() => {
        if (!provider) { setWsStatus(null); return }
        const onStatus = ({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) => setWsStatus(status)
        provider.on('status', onStatus)
        return () => { provider.off('status', onStatus) }
    }, [provider])
    const presenceCount = usePresence(provider)
    const docStats = useDocStats(provider?.document ?? null, 'main')
    // null (not measured) while connecting — see StatusBar's own doc on why
    // that must not collapse to a fabricated true/false.
    const connected = wsStatus === 'connected' ? true : wsStatus === 'disconnected' ? false : null

    // Mission deck (Task 8) — days-until-op countdown for the deck's strip.
    // The `timeline` this hook also builds is no longer read here: the Schedule
    // tab derives its own from lib/operations/phases, off local state rather
    // than this hook's 30s poll, so the controls can't lag their own writes.
    const { daysUntil, refresh } = useOperationStatus(opID)

    // Mission Development — the gate timeline's own UI-local state
    // (completion-modal form fields) now lives in PreProductionInspector;
    // `missionDev` stays lifted because the deck's CountdownStrip reads it too.
    const [missionDev, setMissionDev] = useState<MissionDevelopment | null>(null)
    const [isCampaignOp, setIsCampaignOp] = useState(false)
    const [campaignStartDate, setCampaignStartDate] = useState<string | null>(null)

    // Publish flow
    const [publishSaving, setPublishSaving] = useState(false)
    const [publishConfirmOpen, setPublishConfirmOpen] = useState(false)

    // Ownership
    const [ownedBy, setOwnedBy] = useState('')
    const [ownedByName, setOwnedByName] = useState('')
    const [billetPoints, setBilletPoints] = useState(2)
    const [j2Members, setJ2Members] = useState<{ id: string; displayName: string }[]>([])
    const [ownerPickerOpen, setOwnerPickerOpen] = useState(false)

    // Acknowledgements — `ackExpanded`/remind-button state is now local to
    // AttendanceTab; `ackCount`/`ackList` stay lifted since they're populated
    // by the same load effect as everything else below.
    const [ackCount, setAckCount] = useState(0)
    const [ackList, setAckList] = useState<{ userId: string; userName: string; acknowledgedAt: string }[]>([])

    // Orders Check Request — the request/reminder form's own UI-local state
    // now lives in PreProductionInspector; `ordersCheckTask` stays lifted because
    // it's populated by the load effect below.
    const [ordersCheckTask, setOrdersCheckTask]             = useState<null | { _id?: string; status: string; ordersCheckAt?: string; ordersCheckStatus?: string; ordersCheckProposedAt?: string; ordersCheckProposedBy?: string }>(null)

    const [assignedPlatoons, setAssignedPlatoons] = useState<string[]>([])
    const [discordPingEnabled, setDiscordPingEnabled] = useState(false)
    const [discordPingRoles, setDiscordPingRoles] = useState<string[]>([])
    const [rsvpOpen, setRsvpOpen] = useState(false)
    const [confirmationOpen, setConfirmationOpen] = useState(false)
    const [confirmationOpenedAt, setConfirmationOpenedAt] = useState<Date | null>(null)
    // Both ends of the RSVP window are lead times in minutes before the op
    // date. null on the open end means no automatic open is scheduled — RSVP
    // then only opens when someone advances the stage.
    const [rsvpOpenOffsetMins, setRsvpOpenOffsetMins] = useState<number | null>(null)
    const [rsvpCloseOffsetMins, setRsvpCloseOffsetMins] = useState(90)
    const [attendanceSaving, setAttendanceSaving] = useState(false)

    const [attStage, setAttStage] = useState<AttendanceStage>('preparing')
    const [stageAdvancing, setStageAdvancing] = useState(false)
    // StageCard's confirm target — the six-step stepper this used to share
    // this concern with (the old Attendance Settings panel) is retired
    // outright (Task 12), superseded by StageCard since Task 10.
    const [stageCardConfirmTarget, setStageCardConfirmTarget] = useState<AttendanceStage | null>(null)

    const [confirmDelete, setConfirmDelete] = useState(false)
    const [activityOpen, setActivityOpen] = useState(false)
    const router = useRouter()

    // Custom attendance units — the standalone Custom Attendance Units panel
    // that owned `customUnitsOpen`/`newUnitName`/`newUnitColor` is retired
    // (Task 12): fully superseded by the "+ Custom Unit" chip, which lives in
    // AttendanceTab. `customUnits`/`customUnitsSaving` stay lifted — that tab
    // reads and writes them via addCustomUnit/removeCustomUnit below.
    const [customUnits, setCustomUnits] = useState<{ id: string; name: string; color?: string }[]>([])
    const [customUnitsSaving, setCustomUnitsSaving] = useState(false)

    const metaSaveTimer = useRef<ReturnType<typeof setTimeout>>()
    const metaHandleRef = useRef<{ set: (key: string, value: string) => void } | null>(null)
    // Debounce timers for the Timeline card's two free-text pickers (Task 9 fix) —
    // same idea as metaSaveTimer, just per-field, so dragging through a picker's
    // month/day/hour/minute sections doesn't fire a save per completed section.
    const rsvpOpenAtSaveTimer = useRef<ReturnType<typeof setTimeout>>()
    const rsvpCloseAtSaveTimer = useRef<ReturnType<typeof setTimeout>>()

    // Client-side auto-open/close/activate: fire the moment the scheduled time crosses zero
    // so we don't wait up to 5 minutes for the next cron tick.
    const autoOpenFiredRef       = useRef<string | null>(null)
    const autoCloseFiredRef      = useRef<string | null>(null)
    const autoActivateFiredRef   = useRef<string | null>(null)
    const autoConfirmFiredRef    = useRef<string | null>(null)

    /**
     * The one-second clock these checks need used to be `tickNow` state, which
     * re-rendered this whole component — and therefore the Attendance tab's
     * board, ~100 rows inside a motion LayoutGroup that re-measures on every
     * commit — once a second, for a ~240ms task each time. Nothing renders the
     * clock; only these checks read it. So it ticks a ref instead and the tree
     * re-renders only when a transition actually fires.
     */
    const autoTransitions = useRef<() => void>(() => {})
    useEffect(() => {
        autoTransitions.current = () => {
            const tickNow = new Date()
            if (!isHQ || !opID) return

            // Auto-open (skip if still In Development). The instant is derived from
            // the stored lead time rather than read directly, so moving the op date
            // moves this with it without any second write.
            const openAt = rsvpOpenOffsetMins !== null && date
                ? new Date(date.toDate().getTime() - rsvpOpenOffsetMins * 60_000).toISOString()
                : null
            if (openAt && !rsvpOpen && status !== 'In Development') {
                if (autoOpenFiredRef.current !== openAt && new Date(openAt) <= tickNow) {
                    autoOpenFiredRef.current = openAt
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
                    if (openAt) autoOpenFiredRef.current = openAt
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
                    // The stage write carries the status with it now — the server
                    // derives Active from op_running (statusForStage), so this no
                    // longer needs its own gated `update?status=` call.
                    setStatus('Active')
                    setAttStage('op_running')
                    saveAttendanceSettings({ stage: 'op_running' })
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
        }
    })

    useEffect(() => {
        const id = setInterval(() => autoTransitions.current(), 1000)
        return () => clearInterval(id)
    }, [])

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

        // Mirrors the server's two-armed check in /api/operations/update: the
        // dynamic grant, OR the legacy role array. Without the second fetch the
        // control would render read-only for people the API would actually let
        // through, since `hasPermission` has no Discord-role fallback.
        Promise.all([
            fetch('/api/me/permission?key=operations.overrideLifecycle').then(r => r.json()),
            fetch(`/api/me/roles?has=${PERMISSIONS.operations.overrideLifecycle.join(',')}`).then(r => r.json()),
        ]).then(([byGrant, byRole]) => {
            setCanOverrideLifecycle(Boolean(byGrant?.access) || Boolean(byRole?.access))
        }).catch(() => {})

        Promise.all([
            fetch('/api/me/permission?key=attendance.manage').then(r => r.json()),
            fetch(`/api/me/roles?has=${PERMISSIONS.attendance.manage.join(',')}`).then(r => r.json()),
        ]).then(([byGrant, byRole]) => {
            setCanManageAttendance(Boolean(byGrant?.access) || Boolean(byRole?.access))
        }).catch(() => {})

        fetch('/api/me')
            .then(r => r.json())
            .then(me => { if (me?.id) setMyUserId(me.id) })
            .catch(() => {})

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
                // The route derives this from a legacy absolute rsvpOpenAt when
                // the offset field is absent, so the editor never has to wait
                // for the operation document to land before it can subtract.
                const openAt = json.rsvpOpenAt ? new Date(json.rsvpOpenAt) : null
                setRsvpOpenOffsetMins(json.rsvpOpenOffsetMins ?? null)
                setRsvpCloseOffsetMins(json.rsvpCloseOffsetMins ?? 90)
                setAttStage(json.stage ?? 'preparing')
                // If RSVP is already open when we load, mark the auto-open as already fired
                // so the close→re-open bounce can't happen.
                if (json.rsvpOpen && openAt) autoOpenFiredRef.current = openAt.toISOString()
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
        rsvpOpenOffsetMins?: number | null
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
                    ...(updates.rsvpOpenOffsetMins !== undefined && { rsvpOpenOffsetMins: updates.rsvpOpenOffsetMins }),
                    ...(updates.rsvpCloseOffsetMins !== undefined && { rsvpCloseOffsetMins: updates.rsvpCloseOffsetMins }),
                    ...(updates.stage !== undefined && { stage: updates.stage }),
                }),
            })
            if (!res.ok) return
            const json = await res.json()
            // If the API resolved rsvpOpen server-side (the derived open instant
            // is already past), reflect that immediately
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

    // AttendanceTab's unit assignment and ping toggle — same
    // saveAttendanceSettings path (with its `?? current` sibling-field
    // fallbacks) the old Attendance Settings panel's platoon checkboxes and
    // ping toggle already used.
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

    // AttendanceTab's per-role ping targets (Task 12) — the old Attendance
    // Settings panel's @everyone/@here/@friend of unit/@veteran member chips,
    // rehomed. Same saveAttendanceSettings path as every other attendance
    // write.
    function handleChangeDiscordPingRoles(roles: string[]) {
        setDiscordPingRoles(roles)
        saveAttendanceSettings({ discordPingRoles: roles })
    }

    // Custom-unit add/remove for AttendanceTab's "+ Custom Unit" chip — same
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
    // that round trip: they're driven off the local open/close offsets
    // state (passed into RsvpWindowInspector as props), the same way date and
    // closeOffsetMins already were, not off the polled timeline.
    function handleChangeDate(v: Dayjs | null) {
        if (!v) return
        const iso = v.toISOString()
        metaHandleRef.current?.set('date', iso)
        setDate(v)
        scheduleSave({ date: iso })
    }

    // The open end, as a lead time in minutes before the op date. null clears
    // the automatic open entirely — the same shape as the close end, which is
    // the point of the change: both follow the operation if its date moves.
    async function handleChangeOpenOffset(mins: number | null) {
        setRsvpOpenOffsetMins(mins)
        await saveAttendanceSettings({ rsvpOpenOffsetMins: mins })
        refresh()
    }

    // "Custom…" open — an exact instant off the picker, converted straight back
    // to minutes-before so only ever the offset is stored. Debounced for the
    // same reason the close picker is: dragging through the picker's sections
    // fires onChange once per section.
    function handleChangeRsvpOpenAt(v: Dayjs | null) {
        if (!v || !date) return
        const mins = Math.round((date.toDate().getTime() - v.toDate().getTime()) / 60_000)
        setRsvpOpenOffsetMins(mins)
        clearTimeout(rsvpOpenAtSaveTimer.current)
        rsvpOpenAtSaveTimer.current = setTimeout(async () => {
            await saveAttendanceSettings({ rsvpOpenOffsetMins: mins })
            refresh()
        }, 1000)
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
            // setStatus here is optimistic only. The authoritative write is the
            // stage itself: POST attendance/platoons derives Active from
            // op_running server-side, which is what lets `update?status=` be
            // gated as a lifecycle override without blocking Advance.
            setRsvpOpen(false);       updates.rsvpOpen = false
            setStatus('Active')
        } else if (newStage === 'confirmations_open') {
            setRsvpOpen(false);       updates.rsvpOpen = false
            setConfirmationOpen(true);updates.confirmationOpen = true
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

    // Same three stages the old Attendance Settings stepper's own
    // NEEDS_CONFIRM guards used to gate (that stepper is retired — Task 12)
    // — going Active, opening attendance confirmation (billet points), and
    // closing it.
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

    // MapTab (Task 12) — same resolution the standalone /operations/[id]/map
    // route does server-side: find the stored `mapWorld` name in the fetched
    // worlds list, or null if unset/not found.
    const resolvedMapWorld = availableWorlds.find(w => w.name === mapWorld) ?? null

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
                borderTop: '2px solid rgba(219,0,29,0.75)',
                borderRight: '2px solid rgba(219,0,29,0.12)',
                borderBottom: '2px solid rgba(219,0,29,0.12)',
                borderLeft: '2px solid rgba(219,0,29,0.12)',
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
                three impactful stages, same messages, the old Attendance
                Settings stepper's own dialog used before it was retired
                (Task 12), superseded by StageCard since Task 10. */}
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
                        publishConfirmOpen={publishConfirmOpen}
                        publishSaving={publishSaving}
                        onPublishClick={() => setPublishConfirmOpen(true)}
                        onPublishConfirm={confirmPublish}
                        onPublishCancel={() => setPublishConfirmOpen(false)}
                        tab={tab}
                        onTabChange={setTab}
                        // Orders is only ever the active tab inside the shell
                        // when we are on `/edit` — that is the one route where
                        // the orders are open for editing rather than reading.
                        editing={tab === 'orders'}
                    />
                }
                statusBar={
                    <StatusBar
                        connected={connected}
                        activeDocTitle={title || 'Untitled'}
                        words={docStats.words}
                        sections={docStats.sections}
                        savedAt={savedAt}
                        editorCount={presenceCount}
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
                                coverImage={coverImage}
                                coverUploading={coverUploading}
                                onUploadCover={uploadCover}
                                onRemoveCover={removeCover}
                            />
                        )}
                        {/* No attendance card here — unit assignment and the Discord
                            ping toggle now live in the Attendance tab alongside the
                            ping roles and acknowledgements they belong with. */}
                    </MissionDeck>
                }
                brief={
                    <BriefTab
                        opID={opID}
                        initialContent={initialContent}
                        themeColor={themeColor}
                        title={title}
                        department={department}
                        date={date?.toISOString() ?? ''}
                        loreDate={loreDate ?? ''}
                        onMetaChange={fields => {
                            if (fields.title !== undefined) setTitle(fields.title)
                            if (fields.department !== undefined) setDepartment(fields.department)
                            if (fields.date !== undefined) setDate(fields.date ? dayjs(fields.date) : null)
                            if (fields.loreDate !== undefined) setLoreDate(fields.loreDate ?? '')
                        }}
                        metaHandleRef={metaHandleRef}
                        onSaveStatusChange={setSaveStatus}
                        onProviderReady={setProvider}
                    />
                }
                map={
                    <MapTab operationId={opID} canEdit={isHQ} world={resolvedMapWorld} />
                }
                schedule={
                    opID ? (
                        <ScheduleTab
                            opID={opID}
                            isHQ={isHQ}
                            isJ2Lead={isJ2Lead}
                            title={title}
                            date={date}
                            isCampaignOp={isCampaignOp}
                            campaignStartDate={campaignStartDate}
                            missionDev={missionDev}
                            setMissionDev={setMissionDev}
                            ordersCheckTask={ordersCheckTask}
                            setOrdersCheckTask={setOrdersCheckTask}
                            onChangeDate={handleChangeDate}
                            openOffsetMins={rsvpOpenOffsetMins}
                            onChangeOpenOffset={handleChangeOpenOffset}
                            onChangeRsvpOpenAt={handleChangeRsvpOpenAt}
                            closeOffsetMins={rsvpCloseOffsetMins}
                            onChangeCloseOffset={handleChangeCloseOffset}
                            onChangeRsvpCloseAt={handleChangeRsvpCloseAt}
                            automationPaused={status === 'In Development'}
                            status={status}
                            canOverrideLifecycle={canOverrideLifecycle}
                            onChangeStatus={handleStatusChange}
                            onCompleteMission={handleCompleteMission}
                            completingMission={stageAdvancing}
                            stage={displayStage}
                            onAdvance={requestStageChange}
                            onSelect={requestStageChange}
                            advancing={stageAdvancing}
                        />
                    ) : null
                }
                attendance={
                    isHQ && opID ? (
                        <AttendanceTab
                            opID={opID}
                            status={status}
                            platoons={PLATOON_OPTS}
                            selected={assignedPlatoons}
                            onToggle={handleTogglePlatoon}
                            customUnits={customUnits}
                            onAddCustomUnit={addCustomUnit}
                            onRemoveCustomUnit={removeCustomUnit}
                            customUnitsSaving={customUnitsSaving}
                            discordPingEnabled={discordPingEnabled}
                            onTogglePing={handleTogglePing}
                            discordPingRoles={discordPingRoles}
                            onChangeDiscordPingRoles={handleChangeDiscordPingRoles}
                            ackCount={ackCount}
                            ackList={ackList}
                            operationName={title || 'Untitled operation'}
                            operationWhen={date ? date.format('ddd D MMM · HH:mm') : 'No date set'}
                            myUserId={myUserId}
                            canManageAttendance={canManageAttendance}
                        />
                    ) : null
                }
                contentPaddingRight={activityOpen ? 'clamp(280px, 30vw, 460px)' : 0}
            />

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

        </>
    )
}
