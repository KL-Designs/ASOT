'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/confirm-dialog'
import dayjs, { Dayjs } from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import dynamic from 'next/dynamic'
import PERMISSIONS from '@/lib/permissions'
import { type MetaFields } from './editor'
import ActivityLog from './activity-log'
const OperationEditor = dynamic(() => import('./editor'), { ssr: false })

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

    const [opID, setOpID] = useState('')
    const [title, setTitle] = useState('')
    const [date, setDate] = useState<Dayjs | null>(null)
    const [loreDate, setLoreDate] = useState<string>('')
    const [department, setDepartment] = useState('')
    const [themeColor, setThemeColor] = useState('#db001d')
    const [pageTheme, setPageTheme] = useState<'modern' | 'oldfashioned' | 'scifi'>('modern')
    const [status, setStatus] = useState<string>('Upcoming')
    const [coverImage, setCoverImage] = useState<string | null>(null)
    const [coverUploading, setCoverUploading] = useState(false)
    const [isHQ, setIsHQ] = useState(false)
    const [initialContent, setInitialContent] = useState<any>(undefined)
    const [loaded, setLoaded] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')

    const [assignedPlatoons, setAssignedPlatoons] = useState<string[]>([])
    const [rsvpOpen, setRsvpOpen] = useState(false)
    const [confirmationOpen, setConfirmationOpen] = useState(false)
    const [confirmationOpenedAt, setConfirmationOpenedAt] = useState<Date | null>(null)
    const [rsvpOpenAt, setRsvpOpenAt] = useState<string | null>(null)
    const [rsvpCloseOffsetMins, setRsvpCloseOffsetMins] = useState(60)
    const [attendanceSaving, setAttendanceSaving] = useState(false)
    const [tickNow, setTickNow] = useState(() => new Date())

    // Draft state for the schedule panel — only committed on "Confirm Schedule"
    const [draftDate, setDraftDate] = useState<Dayjs | null>(null)
    const [draftRsvpOpenAt, setDraftRsvpOpenAt] = useState<string | null>(null)
    const [draftRsvpCloseOffsetMins, setDraftRsvpCloseOffsetMins] = useState(60)
    const [scheduleSaving, setScheduleSaving] = useState(false)

    const [attStage, setAttStage] = useState<AttendanceStage>('preparing')
    const [confirmStage, setConfirmStage] = useState<AttendanceStage | null>(null)

    const [confirmDelete, setConfirmDelete] = useState(false)
    const [previewOpen, setPreviewOpen] = useState(false)
    const [activityOpen, setActivityOpen] = useState(false)
    const router = useRouter()

    const metaSaveTimer = useRef<ReturnType<typeof setTimeout>>()
    const metaHandleRef = useRef<{ set: (key: keyof MetaFields, value: string) => void } | null>(null)
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
        const params = new URLSearchParams(window.location.search)
        const id = params.get('op') || ''
        setOpID(id)


        if (!id) return

        fetch(`/api/me/roles?has=${PERMISSIONS.pages.operationsEdit.join(',')}`)
            .then(r => r.json())
            .then(json => { if (!json.error) setIsHQ(json.access) })

        fetch(`/api/operations?id=${id}`)
            .then(r => r.json())
            .then(json => {
                if (json.error) return
                const op: Operation = json.mission
                setTitle(op.title || '')
                const opDate = op.date ? dayjs(op.date) : null
                setDate(opDate)
                setDraftDate(opDate)
                setLoreDate(op.loreDate ?? '')
                setDepartment(op.department || '')
                setThemeColor(op.themeColor || '#db001d')
                setPageTheme((op.pageTheme as any) || 'modern')
                setStatus(op.status || 'Upcoming')
                setCoverImage(op.coverImage || null)
                setInitialContent(op.content ?? null)
                setLoaded(true)
            })

        fetch(`/api/operations/${id}/attendance`)
            .then(r => r.json())
            .then(json => {
                if (json.error) return
                setAssignedPlatoons(json.assignedPlatoons ?? [])
                setRsvpOpen(json.rsvpOpen ?? false)
                setConfirmationOpen(json.confirmationOpen ?? false)
                setConfirmationOpenedAt(json.confirmationOpenedAt ? new Date(json.confirmationOpenedAt) : null)
                const openAt = json.rsvpOpenAt ? new Date(json.rsvpOpenAt).toISOString() : null
                setRsvpOpenAt(openAt)
                setRsvpCloseOffsetMins(json.rsvpCloseOffsetMins ?? 60)
                setDraftRsvpOpenAt(openAt)
                setDraftRsvpCloseOffsetMins(json.rsvpCloseOffsetMins ?? 60)
                setAttStage(json.stage ?? 'preparing')
                // If RSVP is already open when we load, mark the auto-open as already fired
                // so the close→re-open bounce can't happen.
                if (json.rsvpOpen && openAt) autoOpenFiredRef.current = openAt
            })
    }, [])


    function scheduleSave(updates: Record<string, string>) {
        setSaveStatus('unsaved')
        clearTimeout(metaSaveTimer.current)
        metaSaveTimer.current = setTimeout(async () => {
            setSaveStatus('saving')
            const params = new URLSearchParams(window.location.search)
            const id = params.get('op') || ''
            const qs = Object.entries(updates).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
            try {
                await fetch(`/api/operations/update?id=${id}&${qs}`)
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
                const params = new URLSearchParams(window.location.search)
                const id = params.get('op') || ''
                await fetch(`/api/operations/update?id=${id}&coverImage=${encodeURIComponent(json.url)}`)
            }
        } finally {
            setCoverUploading(false)
        }
    }

    async function handleDelete() {
        const params = new URLSearchParams(window.location.search)
        const id = params.get('op') || ''
        const json = await fetch(`/api/operations/delete?id=${id}`).then(r => r.json())
        if (json.error) { alert(json.error); return }
        router.push('/operations')
    }

    async function removeCover() {
        setCoverImage(null)
        const params = new URLSearchParams(window.location.search)
        const id = params.get('op') || ''
        await fetch(`/api/operations/update?id=${id}&coverImage=`)
    }

    async function saveAttendanceSettings(updates: {
        assignedPlatoons?: string[]
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
        { id: 'companyHQ', label: '1-0 HQ' },
        { id: 'platoon11', label: '1-1 Platoon' },
        { id: 'platoon12', label: '1-2 Platoon' },
        { id: 'support',   label: '1-3 Support Platoon' },
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
                        href='/operations'
                        style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', textDecoration: 'none' }}
                    >
                        ← Back
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
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: statusColor }}>
                        {statusLabel}
                    </span>
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
                        {/* Page Theme */}
                        <select
                            value={pageTheme}
                            onChange={e => { setPageTheme(e.target.value as typeof pageTheme); scheduleSave({ pageTheme: e.target.value }) }}
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
                            <option value='modern' style={{ background: 'rgb(18,18,18)', color: 'rgba(237,237,237,0.8)' }}>Modern</option>
                            <option value='oldfashioned' style={{ background: 'rgb(18,18,18)', color: 'rgba(237,237,237,0.8)' }}>Old Fashioned</option>
                            <option value='scifi' style={{ background: 'rgb(18,18,18)', color: 'rgba(237,237,237,0.8)' }}>Sci-Fi</option>
                        </select>
                    </div>
                    {/* In-Game (lore) date — free text, auto-saves */}
                    <input
                        value={loreDate}
                        placeholder='In-Game Date (e.g. 14th of Secundus, 999.M41)'
                        onChange={e => {
                            setLoreDate(e.target.value)
                            metaHandleRef.current?.set('loreDate', e.target.value)
                            scheduleSave({ loreDate: e.target.value })
                        }}
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(237,237,237,0.75)',
                            fontSize: '0.8rem',
                            letterSpacing: '0.06em',
                            outline: 'none',
                            padding: '8px 12px',
                            width: '100%',
                        }}
                    />

                    {/* Cover image */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {coverImage ? (
                            <>
                                <div style={{ position: 'relative', width: 140, height: 52, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
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

            {/* Attendance settings — HQ only */}
            {isHQ && opID && (
                <div style={{ border: `1px solid ${c(0.15)}`, borderTop: `2px solid ${c(0.5)}`, background: 'rgba(255,255,255,0.01)', marginBottom: 20 }}>
                    <div className='flex items-center justify-between px-4 py-3' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                            Attendance Settings
                        </span>
                        {attendanceSaving && (
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)' }}>
                                Saving…
                            </span>
                        )}
                    </div>
                    <div className='flex flex-col gap-4 p-4'>
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
                                                border: checked ? `1px solid ${c(0.7)}` : '1px solid rgba(255,255,255,0.12)',
                                                background: checked ? c(0.12) : 'rgba(255,255,255,0.03)',
                                                color: checked ? c(0.95) : 'rgba(237,237,237,0.35)',
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
                    </div>
                </div>
            )}

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
                    { label: '30 min before', mins: 30 },
                    { label: '1 hour before', mins: 60 },
                    { label: '2 hours before', mins: 120 },
                    { label: '3 hours before', mins: 180 },
                    { label: '6 hours before', mins: 360 },
                    { label: '12 hours before', mins: 720 },
                    { label: '1 day before', mins: 1440 },
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

                return (
                    <div style={{
                        border: `1px solid ${c(0.15)}`,
                        borderTop: `2px solid ${c(0.5)}`,
                        background: 'rgba(255,255,255,0.01)',
                        marginBottom: 20,
                    }}>
                        <div className='flex items-center justify-between px-4 py-3' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
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
                            {scheduleSaving && (
                                <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)' }}>
                                    Saving…
                                </span>
                            )}
                        </div>

                        <div className='flex flex-wrap gap-6 p-4'>
                            {/* ── Settings column ── */}
                            <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                                {/* Operation Date */}
                                <div>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: c(0.6), marginBottom: 10, fontFamily: 'monospace' }}>
                                        // OPERATION DATE
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
                                        // RSVP OPEN
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
                                        // RSVP CLOSE
                                    </div>
                                    <select
                                        value={draftRsvpCloseOffsetMins}
                                        onChange={e => setDraftRsvpCloseOffsetMins(parseInt(e.target.value))}
                                        style={inputSx}
                                    >
                                        {CLOSE_OPTS.map(o => (
                                            <option key={o.mins} value={o.mins}>{o.label}</option>
                                        ))}
                                    </select>
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
                                    // STATUS
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
                        </div>
                    </div>
                )
            })()}

            {/* Document sections */}
            {loaded ? (
                <OperationEditor
                    operationId={opID}
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
                    top: 0,
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
                    top: 0,
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
