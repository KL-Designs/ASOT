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
    const [loreDate, setLoreDate] = useState<Dayjs | null>(null)
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
    const [attendanceSaving, setAttendanceSaving] = useState(false)

    const [confirmDelete, setConfirmDelete] = useState(false)
    const [previewOpen, setPreviewOpen] = useState(false)
    const [activityOpen, setActivityOpen] = useState(false)
    const router = useRouter()

    const metaSaveTimer = useRef<ReturnType<typeof setTimeout>>()
    const metaHandleRef = useRef<{ set: (key: keyof MetaFields, value: string) => void } | null>(null)
    const previewIframeRef = useRef<HTMLIFrameElement>(null)

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
                setDate(op.date ? dayjs(op.date) : null)
                setLoreDate(op.loreDate ? dayjs(op.loreDate) : null)
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

    async function saveAttendanceSettings(updates: { assignedPlatoons?: string[]; rsvpOpen?: boolean; confirmationOpen?: boolean }) {
        setAttendanceSaving(true)
        try {
            await fetch(`/api/operations/${opID}/attendance/platoons`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assignedPlatoons: updates.assignedPlatoons ?? assignedPlatoons,
                    reservistAssignments: [],
                    rsvpOpen: updates.rsvpOpen ?? rsvpOpen,
                    confirmationOpen: updates.confirmationOpen ?? confirmationOpen,
                }),
            })
        } finally {
            setAttendanceSaving(false)
        }
    }

    const PLATOON_OPTS = [
        { id: 'companyHQ', label: '1-0 HQ' },
        { id: 'platoon11', label: '1-1 Platoon' },
        { id: 'platoon12', label: '1-2 Platoon' },
        { id: 'support',   label: '1-3 Support Platoon' },
    ]

    const { r, g, b } = hexToRgb(themeColor)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`

    const STATUS_COLORS: Record<string, string> = {
        'Active':         'rgba(0,200,80,0.9)',
        'Upcoming':       'rgba(219,160,0,0.9)',
        'Completed':      'rgba(100,150,237,0.8)',
        'In Development': 'rgba(219,0,29,0.75)',
    }
    const currentStatusColor = STATUS_COLORS[status] || 'rgba(237,237,237,0.5)'

    const statusColor = saveStatus === 'saved' ? 'rgba(100,220,100,0.65)' : saveStatus === 'saving' ? 'rgba(219,0,29,0.65)' : 'rgba(237,200,0,0.65)'
    const statusLabel = saveStatus === 'saved' ? '● Saved' : saveStatus === 'saving' ? '● Saving…' : '● Unsaved'

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
                    {/* Dates row */}
                    <div className='flex flex-wrap gap-4'>
                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                            <DateTimePicker
                                label='Operation Date'
                                value={date}
                                format='DD/MM/YYYY HH:mm'
                                onChange={v => { setDate(v); if (v) { metaHandleRef.current?.set('date', v.toISOString()); scheduleSave({ date: v.toISOString() }) } }}
                                slotProps={{ textField: { size: 'small', sx: { flex: 1, minWidth: 190 } } }}
                            />
                            <DateTimePicker
                                label='In-Game Date'
                                value={loreDate}
                                format='DD/MM/YYYY HH:mm'
                                onChange={v => { setLoreDate(v); if (v) { metaHandleRef.current?.set('loreDate', v.toISOString()); scheduleSave({ loreDate: v.toISOString() }) } }}
                                slotProps={{ textField: { size: 'small', sx: { flex: 1, minWidth: 190 } } }}
                            />
                        </LocalizationProvider>
                    </div>

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
                                        <label
                                            key={opt.id}
                                            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <input
                                                type='checkbox'
                                                checked={checked}
                                                onChange={() => {
                                                    const updated = checked
                                                        ? assignedPlatoons.filter(p => p !== opt.id)
                                                        : [...assignedPlatoons, opt.id]
                                                    setAssignedPlatoons(updated)
                                                    saveAttendanceSettings({ assignedPlatoons: updated })
                                                }}
                                                style={{ accentColor: c(1), width: 14, height: 14, cursor: 'pointer' }}
                                            />
                                            <span style={{ fontSize: '0.78rem', letterSpacing: '0.06em', color: checked ? c(0.9) : 'rgba(237,237,237,0.45)' }}>
                                                {opt.label}
                                            </span>
                                        </label>
                                    )
                                })}
                            </div>
                        </div>

                        {/* RSVP / Confirmation toggles */}
                        <div className='flex flex-wrap gap-6'>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                                <div
                                    onClick={() => {
                                        setRsvpOpen(o => {
                                            saveAttendanceSettings({ rsvpOpen: !o })
                                            return !o
                                        })
                                    }}
                                    style={{
                                        width: 36, height: 20, borderRadius: 10, position: 'relative', cursor: 'pointer', flexShrink: 0,
                                        background: rsvpOpen ? c(0.75) : 'rgba(255,255,255,0.1)',
                                        transition: 'background 0.2s',
                                    }}
                                >
                                    <div style={{
                                        position: 'absolute', top: 3, left: rsvpOpen ? 18 : 3, width: 14, height: 14,
                                        borderRadius: '50%', background: 'white', transition: 'left 0.2s',
                                    }} />
                                </div>
                                <span style={{ fontSize: '0.78rem', letterSpacing: '0.06em', color: rsvpOpen ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.4)' }}>
                                    RSVP Open
                                </span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                                <div
                                    onClick={() => {
                                        setConfirmationOpen(o => {
                                            saveAttendanceSettings({ confirmationOpen: !o })
                                            return !o
                                        })
                                    }}
                                    style={{
                                        width: 36, height: 20, borderRadius: 10, position: 'relative', cursor: 'pointer', flexShrink: 0,
                                        background: confirmationOpen ? c(0.75) : 'rgba(255,255,255,0.1)',
                                        transition: 'background 0.2s',
                                    }}
                                >
                                    <div style={{
                                        position: 'absolute', top: 3, left: confirmationOpen ? 18 : 3, width: 14, height: 14,
                                        borderRadius: '50%', background: 'white', transition: 'left 0.2s',
                                    }} />
                                </div>
                                <span style={{ fontSize: '0.78rem', letterSpacing: '0.06em', color: confirmationOpen ? 'rgba(237,237,237,0.85)' : 'rgba(237,237,237,0.4)' }}>
                                    Confirmation Open
                                </span>
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* Document sections */}
            {loaded ? (
                <OperationEditor
                    operationId={opID}
                    initialContent={initialContent}
                    themeColor={themeColor}
                    initialMeta={{ title, department, date: date?.toISOString() ?? '', loreDate: loreDate?.toISOString() ?? '' }}
                    onMetaChange={fields => {
                        if (fields.title !== undefined) setTitle(fields.title)
                        if (fields.department !== undefined) setDepartment(fields.department)
                        if (fields.date !== undefined) setDate(fields.date ? dayjs(fields.date) : null)
                        if (fields.loreDate !== undefined) setLoreDate(fields.loreDate ? dayjs(fields.loreDate) : null)
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
