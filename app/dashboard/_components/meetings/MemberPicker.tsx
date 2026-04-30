'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/material'
import { Person, Close } from '@mui/icons-material'

interface Member { id: string; displayName: string; isJ4?: boolean }

interface Props {
    value: { id: string; name: string } | null
    onChange: (v: { id: string; name: string } | null) => void
    department?: MeetingDepartment
    placeholder?: string
}

const row: React.CSSProperties = {
    all: 'unset', display: 'flex', alignItems: 'center', gap: 6,
    width: '100%', padding: '7px 10px', cursor: 'pointer',
    fontSize: '0.73rem', color: 'rgba(237,237,237,0.75)',
    boxSizing: 'border-box',
}

export default function MemberPicker({ value, onChange, department, placeholder = 'Search member…' }: Props) {
    const [query, setQuery] = useState('')
    const [members, setMembers] = useState<Member[]>([])
    const [loading, setLoading] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [open, setOpen] = useState(false)
    const wrapRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function h(e: MouseEvent) {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [])

    const load = useCallback(async () => {
        if (loaded) return
        setLoading(true)
        try {
            // Always fetch the relevant department members
            const url = department
                ? `/api/admin/members?department=${department}&limit=200`
                : '/api/community/members'
            const [deptRes] = await Promise.all([fetch(url)])
            const deptData = await deptRes.json()
            const deptMembers: Member[] = (deptData.members ?? []).map((m: Member) => ({ ...m, isJ4: false }))

            // Always also fetch J4 members (except when we're already fetching J4)
            let j4Members: Member[] = []
            if (department && department !== 'j4') {
                const j4Res = await fetch('/api/admin/members?department=j4&limit=200')
                const j4Data = await j4Res.json()
                j4Members = (j4Data.members ?? []).map((m: Member) => ({ ...m, isJ4: true }))
            }

            // Merge, deduplicating by id (dept member takes priority over j4 duplicate)
            const seen = new Set(deptMembers.map((m: Member) => m.id))
            const uniqueJ4 = j4Members.filter((m: Member) => !seen.has(m.id))

            setMembers([...deptMembers, ...uniqueJ4])
            setLoaded(true)
        } catch { /* ignore */ }
        setLoading(false)
    }, [loaded, department])

    const deptFiltered = members
        .filter(m => !m.isJ4 && m.displayName.toLowerCase().includes(query.toLowerCase()))
    const j4Filtered = members
        .filter(m => m.isJ4 && m.displayName.toLowerCase().includes(query.toLowerCase()))

    // Show dept members first, then J4 members with a label
    const hasJ4 = j4Filtered.length > 0
    const totalShown = Math.min(deptFiltered.length, 20) + Math.min(j4Filtered.length, 10)

    const inputSx: React.CSSProperties = {
        all: 'unset', display: 'block', width: '100%',
        fontSize: '0.75rem', color: 'var(--foreground)',
        background: 'rgba(255,255,255,0.04)', padding: '5px 8px',
        border: '1px solid rgba(255,255,255,0.1)', boxSizing: 'border-box',
    }

    if (value) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'rgba(219,0,29,0.07)', border: '1px solid rgba(219,0,29,0.25)' }}>
                <Person sx={{ fontSize: 12, color: 'rgba(219,0,29,0.5)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.73rem', color: 'rgba(237,237,237,0.8)' }}>{value.name}</span>
                <button type='button' onClick={() => onChange(null)} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(237,237,237,0.35)', display: 'flex' }}>
                    <Close sx={{ fontSize: 11 }} />
                </button>
            </div>
        )
    }

    return (
        <div ref={wrapRef} style={{ position: 'relative' }}>
            <div style={{ position: 'relative' }}>
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onFocus={() => { setOpen(true); load() }}
                    placeholder={placeholder}
                    style={inputSx}
                />
                {loading && (
                    <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}>
                        <CircularProgress size={12} style={{ color: 'rgba(237,237,237,0.3)' }} />
                    </div>
                )}
            </div>
            {open && loaded && (totalShown > 0 || members.length === 0) && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'rgb(13,13,13)', border: '1px solid rgba(255,255,255,0.12)', borderTop: 'none', maxHeight: 240, overflowY: 'auto' }} onWheel={e => e.stopPropagation()}>
                    {members.length === 0 ? (
                        <div style={{ padding: '8px 10px', fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)' }}>No members found</div>
                    ) : (
                        <>
                            {deptFiltered.slice(0, 20).map(m => (
                                <button key={m.id} type='button'
                                    onMouseDown={() => { onChange({ id: m.id, name: m.displayName }); setQuery(''); setOpen(false) }}
                                    style={row}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                                >
                                    <Person sx={{ fontSize: 12, color: 'rgba(219,0,29,0.45)' }} />
                                    {m.displayName}
                                </button>
                            ))}
                            {hasJ4 && (
                                <>
                                    <div style={{ padding: '4px 10px', fontSize: '0.54rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(219,0,29,0.45)', background: 'rgba(219,0,29,0.04)', borderTop: '1px solid rgba(219,0,29,0.1)', borderBottom: '1px solid rgba(219,0,29,0.1)' }}>
                                        J4 ADMINISTRATION
                                    </div>
                                    {j4Filtered.slice(0, 10).map(m => (
                                        <button key={m.id} type='button'
                                            onMouseDown={() => { onChange({ id: m.id, name: m.displayName }); setQuery(''); setOpen(false) }}
                                            style={row}
                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                                        >
                                            <Person sx={{ fontSize: 12, color: 'rgba(219,0,29,0.7)' }} />
                                            {m.displayName}
                                        </button>
                                    ))}
                                </>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
