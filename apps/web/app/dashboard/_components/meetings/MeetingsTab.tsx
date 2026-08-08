'use client'

import { useState, useEffect, useCallback } from 'react'
import { CircularProgress, Typography } from '@mui/material'
import { Add, MeetingRoom, SwapHoriz } from '@mui/icons-material'
import MeetingListItem from './MeetingListItem'
import MeetingDetail from './MeetingDetail'
import CreateMeetingModal from './CreateMeetingModal'

type ImportFilter = 'all' | 'own' | 'imported'

interface MeetingsTabProps {
    department: MeetingDepartment
    userId: string
    isLead: boolean
}

export default function MeetingsTab({ department, userId, isLead }: MeetingsTabProps) {
    const [meetings, setMeetings]         = useState<Meeting[]>([])
    const [loading, setLoading]           = useState(true)
    const [selectedId, setSelectedId]     = useState<string | null>(null)
    const [creating, setCreating]         = useState(false)
    const [importFilter, setImportFilter] = useState<ImportFilter>('all')

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/meetings?department=${department}`)
            const data = await res.json()
            setMeetings(data.meetings ?? [])
        } finally { setLoading(false) }
    }, [department])

    useEffect(() => { load() }, [load])

    const filtered = meetings.filter(m => {
        if (importFilter === 'own')      return !m.isTransferred
        if (importFilter === 'imported') return !!m.isTransferred
        return true
    })

    const selected = meetings.find(m => m._id?.toString() === selectedId) ?? null
    const importedCount = meetings.filter(m => m.isTransferred).length

    function updateMeeting(updated: Meeting) {
        setMeetings(prev => prev.map(m => m._id?.toString() === updated._id?.toString() ? updated : m))
    }

    function removeMeeting(id: string) {
        setMeetings(prev => prev.filter(m => m._id?.toString() !== id))
        if (selectedId === id) setSelectedId(null)
    }

    const filterBtn = (f: ImportFilter, label: string) => (
        <button key={f} type='button' onClick={() => setImportFilter(f)}
            style={{ all: 'unset', cursor: 'pointer', padding: '2px 7px', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.06em', borderRadius: 999, border: `1px solid ${importFilter === f ? 'rgba(0,195,255,0.35)' : 'transparent'}`, background: importFilter === f ? 'rgba(0,195,255,0.12)' : 'transparent', color: importFilter === f ? 'rgba(0,195,255,0.9)' : 'rgba(237,237,237,0.3)' }}>
            {label}
        </button>
    )

    return (
        <div className='m-6 mt-4 flex flex-col gap-0' style={{ flex: 1, minHeight: 0 }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid rgba(219,0,29,0.22)', borderBottom: 'none', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', fontFamily: 'monospace' }}>
                        {'// MEETINGS'}
                    </span>
                    <div style={{ display: 'flex', gap: 2 }}>
                        {filterBtn('all', 'All')}
                        {filterBtn('own', 'Own')}
                        {filterBtn('imported', importedCount > 0 ? `Imported (${importedCount})` : 'Imported')}
                    </div>
                </div>
                <button onClick={() => setCreating(true)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.8)', padding: '4px 10px', border: '1px solid rgba(219,0,29,0.32)', background: 'rgba(219,0,29,0.06)' }}>
                    <Add sx={{ fontSize: 13 }} /> New Meeting
                </button>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, minHeight: 400, border: '1px solid rgba(219,0,29,0.22)', background: 'rgba(255,255,255,0.01)' }}>
                {/* List */}
                <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid rgba(219,0,29,0.15)', overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                            <CircularProgress size={20} style={{ color: 'rgba(219,0,29,0.5)' }} />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: 0.4 }}>
                            {importFilter === 'imported'
                                ? <SwapHoriz sx={{ fontSize: 28, color: 'rgba(0,195,255,0.4)' }} />
                                : <MeetingRoom sx={{ fontSize: 28, color: 'rgba(237,237,237,0.3)' }} />
                            }
                            <Typography fontSize='0.7rem' style={{ color: 'rgba(237,237,237,0.35)', textAlign: 'center' }}>
                                {importFilter === 'imported' ? 'No imported notes' : 'No meetings yet'}
                            </Typography>
                        </div>
                    ) : (
                        filtered.map(m => (
                            <MeetingListItem
                                key={m._id?.toString()}
                                meeting={m}
                                selected={m._id?.toString() === selectedId}
                                onClick={() => setSelectedId(m._id?.toString() ?? null)}
                            />
                        ))
                    )}
                </div>

                {/* Detail */}
                <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
                    {selected ? (
                        <MeetingDetail
                            key={selected._id?.toString()}
                            meeting={selected}
                            department={department}
                            userId={userId}
                            isLead={isLead}
                            onUpdate={updateMeeting}
                            onDelete={() => removeMeeting(selected._id!.toString())}
                        />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.3 }}>
                            <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.4)', letterSpacing: '0.1em' }}>Select a meeting</Typography>
                        </div>
                    )}
                </div>
            </div>

            {creating && (
                <CreateMeetingModal
                    department={department}
                    onClose={() => setCreating(false)}
                    onCreate={m => { setMeetings(prev => [m, ...prev]); setSelectedId(m._id!.toString()); setCreating(false) }}
                />
            )}
        </div>
    )
}
