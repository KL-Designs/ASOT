'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/material'
import { Person, Close } from '@mui/icons-material'

interface Member { id: string; displayName: string; isJ4?: boolean }

interface Props {
    value: { id: string; name: string } | null
    onChange: (v: { id: string; name: string } | null) => void
    department?: MeetingDepartment
    allMembers?: boolean   // when true, fetch all ASOT members (ignores department + J4 logic)
    placeholder?: string
}

const row: React.CSSProperties = {
    all: 'unset', display: 'flex', alignItems: 'center', gap: 6,
    width: '100%', padding: '7px 10px', cursor: 'pointer',
    fontSize: '0.73rem', color: 'rgba(237,237,237,0.75)',
    boxSizing: 'border-box',
}

export default function MemberPicker({ value, onChange, department, allMembers = false, placeholder = 'Search member…' }: Props) {
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

    // Reset loaded state when mode/department changes so list re-fetches
    useEffect(() => { setLoaded(false); setMembers([]) }, [department, allMembers])

    const load = useCallback(async () => {
        if (loaded) return
        setLoading(true)
        try {
            if (allMembers) {
                // All ASOT members (community endpoint — no role check)
                const res = await fetch('/api/community/members?limit=500')
                const data = await res.json()
                setMembers((data.members ?? []).map((m: Member) => ({ ...m, isJ4: false })))
            } else if (department) {
                // Dept members + J4
                const [deptRes, j4Res] = await Promise.all([
                    fetch(`/api/admin/members?department=${department}&limit=200`),
                    department !== 'j4' ? fetch('/api/admin/members?department=j4&limit=200') : Promise.resolve(null),
                ])
                const deptData = await deptRes.json()
                const deptMembers: Member[] = (deptData.members ?? []).map((m: Member) => ({ ...m, isJ4: false }))
                const seen = new Set(deptMembers.map(m => m.id))

                let j4Members: Member[] = []
                if (j4Res) {
                    const j4Data = await j4Res.json()
                    j4Members = (j4Data.members ?? [])
                        .filter((m: Member) => !seen.has(m.id))
                        .map((m: Member) => ({ ...m, isJ4: true }))
                }
                setMembers([...deptMembers, ...j4Members])
            } else {
                // No department specified — community-wide search
                const res = await fetch('/api/community/members?limit=500')
                const data = await res.json()
                setMembers((data.members ?? []).map((m: Member) => ({ ...m, isJ4: false })))
            }
            setLoaded(true)
        } catch { /* ignore */ }
        setLoading(false)
    }, [loaded, department, allMembers])

    const q = query.toLowerCase()
    const deptFiltered = members.filter(m => !m.isJ4 && m.displayName.toLowerCase().includes(q))
    const j4Filtered   = members.filter(m => m.isJ4  && m.displayName.toLowerCase().includes(q))
    const hasJ4Section = !allMembers && j4Filtered.length > 0

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
            {open && loaded && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'rgb(13,13,13)', border: '1px solid rgba(255,255,255,0.12)', borderTop: 'none', maxHeight: 240, overflowY: 'auto' }} onWheel={e => e.stopPropagation()}>
                    {members.length === 0 ? (
                        <div style={{ padding: '8px 10px', fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)' }}>No members found</div>
                    ) : (
                        <>
                            {deptFiltered.slice(0, 25).map(m => (
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
                            {hasJ4Section && (
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
