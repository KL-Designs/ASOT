'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Avatar from '@/components/member/avatar'
import { rankNameFromAbbr } from '@/lib/ranks'

type OrbatEntry = { role: string; section: string } | null

type MemberRow = {
    id: string
    username: string
    globalName?: string | null
    guild?: { nickname?: string | null } | null
    bio?: { rank?: string | null } | null
    avatar?: string | null
    avatarDecoration?: string | null
    hexAccentColor?: string | null
}

export default function MemberList({
    members,
    orbatMap,
}: {
    members: MemberRow[]
    orbatMap: Record<string, OrbatEntry>
}) {
    const [query, setQuery] = useState('')
    const [filterOpen, setFilterOpen] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const filterRef = useRef<HTMLDivElement>(null)

    const roles = Array.from(
        new Set(Object.values(orbatMap).map(e => e?.role).filter(Boolean) as string[])
    ).sort()

    useEffect(() => {
        if (!filterOpen) return
        function onDown(e: MouseEvent) {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [filterOpen])

    function toggle(key: string) {
        setSelected(prev => {
            const next = new Set(prev)
            next.has(key) ? next.delete(key) : next.add(key)
            return next
        })
    }

    const filtered = members.filter(m => {
        if (selected.size > 0) {
            if (selected.has('active') && !orbatMap[m.id]) return false
            if (!selected.has('active') && !selected.has(orbatMap[m.id]?.role ?? '')) return false
        }
        if (!query.trim()) return true
        const nick = m.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim() || ''
        const display = nick || m.globalName || m.username
        const q = query.trim().toLowerCase()
        return display.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)
    })

    const filterLabel = selected.size === 0 ? 'Filter by role'
        : selected.has('active') && selected.size === 1 ? 'Active'
        : `${selected.size} role${selected.size > 1 ? 's' : ''} selected`

    return (
        <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.02)' }}>
            {/* Header */}
            <div className='flex items-center justify-between px-4 py-3' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    All Members
                </span>
                <span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(219,0,29,0.7)', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.2)', padding: '2px 8px' }}>
                    {members.length}
                </span>
            </div>

            {/* Search */}
            <div className='px-4 py-3' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <input
                    type='text'
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder='Search by name or username…'
                    style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(237,237,237,0.9)',
                        padding: '7px 12px',
                        fontSize: '0.82rem',
                        outline: 'none',
                    }}
                />
            </div>

            {/* Role filter */}
            {roles.length > 0 && (
                <div className='px-4 py-3' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'relative' }} ref={filterRef}>
                    <button
                        onClick={() => setFilterOpen(o => !o)}
                        style={{
                            width: '100%', textAlign: 'left', cursor: 'pointer', padding: '6px 10px',
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                            color: selected.size > 0 ? 'rgba(219,0,29,0.85)' : 'rgba(237,237,237,0.4)',
                            fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}
                    >
                        <span>{filterLabel}</span>
                        <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>{filterOpen ? '▲' : '▼'}</span>
                    </button>

                    {filterOpen && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 16, right: 16, zIndex: 50,
                            background: 'rgb(18,18,18)', border: '1px solid rgba(255,255,255,0.1)',
                            maxHeight: 260, overflowY: 'auto',
                        }}>
                            {/* Active option */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                <input type='checkbox' checked={selected.has('active')} onChange={() => toggle('active')}
                                    style={{ accentColor: 'rgb(219,0,29)', cursor: 'pointer' }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(237,237,237,0.75)' }}>
                                    Active <span style={{ fontWeight: 400, color: 'rgba(237,237,237,0.35)' }}>(any ORBAT role)</span>
                                </span>
                            </label>

                            {roles.map(role => (
                                <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <input type='checkbox' checked={selected.has(role)} onChange={() => toggle(role)}
                                        style={{ accentColor: 'rgb(219,0,29)', cursor: 'pointer' }} />
                                    <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.6)' }}>{role}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* List */}
            <div className='flex flex-col'>
                {filtered.length === 0 ? (
                    <div className='px-4 py-6' style={{ textAlign: 'center', fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>
                        No members found.
                    </div>
                ) : (
                    filtered.map(member => {
                        const displayName = member.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim() || member.globalName || member.username
                        const rank = member.bio?.rank ? rankNameFromAbbr(member.bio.rank) : null
                        const orbatEntry = orbatMap[member.id] ?? null

                        return (
                            <div
                                key={member.id}
                                className='flex items-center gap-4 px-4 py-3'
                                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                            >
                                <div style={{ position: 'relative', width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.05)' }}>
                                    <Avatar user={member as User} />
                                </div>

                                <div className='flex flex-col gap-[2px] flex-1 min-w-0'>
                                    {rank && (
                                        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)' }}>
                                            {rank}
                                        </span>
                                    )}
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {displayName}
                                    </span>
                                    <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.04em' }}>
                                        @{member.username}
                                    </span>
                                </div>

                                {orbatEntry && (
                                    <span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', flexShrink: 0, textAlign: 'right' }}>
                                        {orbatEntry.role}
                                    </span>
                                )}

                                <Link
                                    href={`/milpacs/${member.username}`}
                                    style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)', flexShrink: 0, textDecoration: 'none' }}
                                >
                                    View
                                </Link>
                                <Link
                                    href={`/members/${member.username}`}
                                    style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', flexShrink: 0, textDecoration: 'none' }}
                                >
                                    Edit →
                                </Link>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
