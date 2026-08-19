'use client'

import { useState, useEffect, useCallback } from 'react'
import { CircularProgress, Typography } from '@mui/material'
import { MeetingRoom, SwapHoriz } from '@mui/icons-material'
import MeetingListItem from '@/app/dashboard/_components/meetings/MeetingListItem'
import MeetingDetail from '@/app/dashboard/_components/meetings/MeetingDetail'

type DeptFilter = 'all' | MeetingDepartment
type ImportFilter = 'all' | 'own' | 'imported'

const DEPTS: MeetingDepartment[] = ['j1','j2','j3','j4','j5','j6','j7']
const DEPT_LABELS: Record<MeetingDepartment, string> = {
    j1: 'J1', j2: 'J2', j3: 'J3', j4: 'J4', j5: 'J5', j6: 'J6', j7: 'J7',
}

export default function J4MeetingsTab({ userId }: { userId: string }) {
    const [meetings, setMeetings]         = useState<Meeting[]>([])
    const [loading, setLoading]           = useState(true)
    const [selectedId, setSelectedId]     = useState<string | null>(null)
    const [deptFilter, setDeptFilter]     = useState<DeptFilter>('j4')
    const [importFilter, setImportFilter] = useState<ImportFilter>('all')

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (deptFilter !== 'all') params.set('department', deptFilter)
            if (importFilter === 'imported') params.set('imported', 'true')
            const res = await fetch(`/api/admin/meetings/all?${params}`)
            const data = await res.json()
            setMeetings(data.meetings ?? [])
        } finally { setLoading(false) }
    }, [deptFilter, importFilter])

    useEffect(() => { load() }, [load])

    const filtered = meetings.filter(m => {
        if (importFilter === 'own')      return !m.isTransferred
        if (importFilter === 'imported') return !!m.isTransferred
        return true
    })

    const selected = meetings.find(m => m._id?.toString() === selectedId) ?? null

    function updateMeeting(updated: Meeting) {
        setMeetings(prev => prev.map(m => m._id?.toString() === updated._id?.toString() ? updated : m))
    }
    function removeMeeting(id: string) {
        setMeetings(prev => prev.filter(m => m._id?.toString() !== id))
        if (selectedId === id) setSelectedId(null)
    }

    const filterBtn = (active: boolean, label: string, onClick: () => void, accent = 'rgba(219,0,29,') => (
        <button type='button' onClick={onClick} style={{ all: 'unset', cursor: 'pointer', padding: '2px 8px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', borderRadius: 999, border: `1px solid ${active ? `${accent}0.35)` : 'transparent'}`, background: active ? `${accent}0.12)` : 'transparent', color: active ? `${accent}0.9)` : 'rgba(237,237,237,0.35)' }}>
            {label}
        </button>
    )

    return (
        <div className='m-6 mt-4 flex flex-col gap-0' style={{ flex: 1, minHeight: 0 }}>
            {/* Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', border: '1px solid var(--line-2)', borderBottom: 'none', background: 'rgba(255,255,255,0.02)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--txt-3)', fontFamily: 'monospace' }}>
                    {'// ALL MEETINGS'}
                </span>

                {/* Dept filter */}
                <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {filterBtn(deptFilter === 'all', 'All Depts', () => setDeptFilter('all'))}
                    {DEPTS.map(d => filterBtn(deptFilter === d, DEPT_LABELS[d], () => setDeptFilter(d)))}
                </div>

                {/* Import filter */}
                <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                    {filterBtn(importFilter === 'all',      'All',      () => setImportFilter('all'),      'rgba(0,195,255,')}
                    {filterBtn(importFilter === 'own',      'Own',      () => setImportFilter('own'),      'rgba(0,195,255,')}
                    {filterBtn(importFilter === 'imported', 'Imported', () => setImportFilter('imported'), 'rgba(0,195,255,')}
                </div>
            </div>

            <div style={{ display: 'flex', flex: 1, minHeight: 400, border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.01)' }}>
                {/* List */}
                <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--line-2)', overflowY: 'auto' }}>
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
                                No meetings
                            </Typography>
                        </div>
                    ) : (
                        filtered.map(m => (
                            <div key={m._id?.toString()}>
                                {deptFilter === 'all' && (
                                    <div style={{ padding: '2px 8px', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(219,0,29,0.45)', background: 'rgba(219,0,29,0.04)', borderBottom: '1px solid rgba(219,0,29,0.08)', textTransform: 'uppercase', fontFamily: 'monospace' }}>
                                        {DEPT_LABELS[m.department as MeetingDepartment] ?? m.department}
                                    </div>
                                )}
                                <MeetingListItem
                                    meeting={m}
                                    selected={m._id?.toString() === selectedId}
                                    onClick={() => setSelectedId(m._id?.toString() ?? null)}
                                />
                            </div>
                        ))
                    )}
                </div>

                {/* Detail */}
                <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
                    {selected ? (
                        <MeetingDetail
                            key={selected._id?.toString()}
                            meeting={selected}
                            department={selected.department as MeetingDepartment}
                            userId={userId}
                            isLead={true}
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
        </div>
    )
}
