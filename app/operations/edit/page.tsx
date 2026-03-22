'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import dayjs, { Dayjs } from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import OperationEditor from './editor'


export default function Page() {

    const [opID, setOpID] = useState('')
    const [title, setTitle] = useState('')
    const [date, setDate] = useState<Dayjs | null>(null)
    const [loreDate, setLoreDate] = useState<Dayjs | null>(null)
    const [department, setDepartment] = useState('')
    const [initialContent, setInitialContent] = useState<any>(undefined)
    const [loaded, setLoaded] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')

    const metaSaveTimer = useRef<ReturnType<typeof setTimeout>>()

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
                        onChange={e => { setTitle(e.target.value); scheduleSave({ title: e.target.value }) }}
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
                    {/* Sub-fields */}
                    <div className='flex flex-wrap gap-4'>
                        <input
                            value={department}
                            placeholder='Department'
                            onChange={e => { setDepartment(e.target.value); scheduleSave({ department: e.target.value }) }}
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
                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                            <DateTimePicker
                                label='Operation Date'
                                value={date}
                                format='DD/MM/YYYY HH:mm'
                                onChange={v => { setDate(v); if (v) scheduleSave({ date: v.toISOString() }) }}
                                slotProps={{ textField: { size: 'small', sx: { flex: 1, minWidth: 190 } } }}
                            />
                            <DateTimePicker
                                label='In-Game Date'
                                value={loreDate}
                                format='DD/MM/YYYY HH:mm'
                                onChange={v => { setLoreDate(v); if (v) scheduleSave({ loreDate: v.toISOString() }) }}
                                slotProps={{ textField: { size: 'small', sx: { flex: 1, minWidth: 190 } } }}
                            />
                        </LocalizationProvider>
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
