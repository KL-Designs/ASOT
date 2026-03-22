'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import dayjs, { Dayjs } from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import dynamic from 'next/dynamic'
import { type MetaFields } from './editor'
const OperationEditor = dynamic(() => import('./editor'), { ssr: false })


export default function Page() {

    const [opID, setOpID] = useState('')
    const [title, setTitle] = useState('')
    const [date, setDate] = useState<Dayjs | null>(null)
    const [loreDate, setLoreDate] = useState<Dayjs | null>(null)
    const [department, setDepartment] = useState('')
    const [themeColor, setThemeColor] = useState('#db001d')
    const [coverImage, setCoverImage] = useState<string | null>(null)
    const [coverUploading, setCoverUploading] = useState(false)
    const [initialContent, setInitialContent] = useState<any>(undefined)
    const [loaded, setLoaded] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')

    const metaSaveTimer = useRef<ReturnType<typeof setTimeout>>()
    const metaHandleRef = useRef<{ set: (key: keyof MetaFields, value: string) => void } | null>(null)

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const id = params.get('op') || ''
        setOpID(id)


        if (!id) return

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
                setCoverImage(op.coverImage || null)
                setInitialContent(op.content ?? null)
                setLoaded(true)
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

    async function removeCover() {
        setCoverImage(null)
        const params = new URLSearchParams(window.location.search)
        const id = params.get('op') || ''
        await fetch(`/api/operations/update?id=${id}&coverImage=`)
    }

    const statusColor = saveStatus === 'saved' ? 'rgba(100,220,100,0.65)' : saveStatus === 'saving' ? 'rgba(219,0,29,0.65)' : 'rgba(237,200,0,0.65)'
    const statusLabel = saveStatus === 'saved' ? '● Saved' : saveStatus === 'saving' ? '● Saving…' : '● Unsaved'

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-5 max-w-[1000px] mx-auto'>

            {/* Page header */}
            <div className='flex items-center justify-between gap-4'>
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
                                style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.55)', textDecoration: 'none' }}
                            >
                                View →
                            </Link>
                        </>
                    )}
                </div>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: statusColor }}>
                    {statusLabel}
                </span>
            </div>

            {/* Metadata card */}
            <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.01)' }}>
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
                                    style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
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

            {/* Document editor card */}
            <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.01)', display: 'flex', flexDirection: 'column' }}>
                <div className='flex items-center px-4 py-3' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                        Document Body
                    </span>
                </div>
                {loaded ? (
                    <OperationEditor
                        operationId={opID}
                        initialContent={initialContent}
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
                    <div style={{ padding: '48px 0', textAlign: 'center', color: 'rgba(237,237,237,0.15)', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                        Loading…
                    </div>
                )}
            </div>

        </div>
    )
}
