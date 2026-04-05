'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Avatar from '@/components/member/avatar'
import { rankNameFromAbbr } from '@/lib/ranks'
import MilpacEditor from '@/app/members/[username]/MilpacEditor'

const PAGE_SIZE = 25

type OrbatEntry = { role: string; section: string } | null

type MemberRow = {
    id: string
    username: string
    name?: string | null
    globalName?: string | null
    guild?: { nickname?: string | null; displayName?: string | null } | null
    milpac?: { currentRank?: string | null } | null
    avatar?: string | null
    avatarDecoration?: string | null
    hexAccentColor?: string | null
    teamLeadDepts: string[]
    orbatEntry: OrbatEntry
}

type ConfirmedOp = { operationId: string; name: string; date?: string | null; confirmedAt: string | null }

function getDisplayName(m: MemberRow) {
    return m.name || m.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim() || m.globalName || m.username || ''
}

export default function AllMembersPanel({
    canEditRestricted,
    canEditStandard,
    canImpersonate,
}: {
    canEditRestricted: boolean
    canEditStandard: boolean
    canImpersonate: boolean
}) {
    const [members, setMembers] = useState<MemberRow[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(0)
    const [search, setSearch] = useState('')
    const [loadingList, setLoadingList] = useState(true)

    const [selectedUsername, setSelectedUsername] = useState<string | null>(null)
    const [memberData, setMemberData] = useState<User | null>(null)
    const [confirmedOps, setConfirmedOps] = useState<ConfirmedOp[]>([])
    const [loadingMember, setLoadingMember] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [dirty, setDirty] = useState(false)

    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const totalPages = Math.ceil(total / PAGE_SIZE)

    // Fetch the current page of members
    const fetchMembers = useCallback(async (p: number, q: string) => {
        setLoadingList(true)
        try {
            const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) })
            if (q) params.set('search', q)
            const res = await fetch(`/api/admin/members?${params}`)
            const data = await res.json()
            setMembers(data.members ?? [])
            setTotal(data.total ?? 0)
        } finally {
            setLoadingList(false)
        }
    }, [])

    // Initial load
    useEffect(() => { fetchMembers(0, '') }, [fetchMembers])

    // Debounce search — reset to page 0 when query changes
    function handleSearchChange(value: string) {
        setSearch(value)
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = setTimeout(() => {
            setPage(0)
            fetchMembers(0, value)
        }, 300)
    }

    function handlePageChange(next: number) {
        setPage(next)
        fetchMembers(next, search)
    }

    const selectMember = useCallback(async (username: string) => {
        if (username === selectedUsername) return
        if (dirty) {
            if (!window.confirm('You have unsaved changes. Discard them and switch member?')) return
        }
        setSelectedUsername(username)
        setMemberData(null)
        setConfirmedOps([])
        setLoadError(null)
        setLoadingMember(true)
        setDirty(false)
        try {
            const [memberRes, opsRes] = await Promise.all([
                fetch(`/api/members/${username}`),
                fetch(`/api/members/${username}/confirmed-ops`),
            ])
            if (!memberRes.ok) throw new Error('Failed to load member')
            const [member, ops] = await Promise.all([memberRes.json(), opsRes.json()])
            setMemberData(member)
            setConfirmedOps(Array.isArray(ops) ? ops : [])
        } catch (e: any) {
            setLoadError(e.message || 'Failed to load member')
        } finally {
            setLoadingMember(false)
        }
    }, [selectedUsername, dirty])

    const start = page * PAGE_SIZE + 1
    const end   = Math.min((page + 1) * PAGE_SIZE, total)

    return (
        <div className='flex h-full w-full' style={{ minHeight: 0 }}>

            {/* ── Left: member list ── */}
            <div
                className='flex flex-col flex-shrink-0'
                style={{
                    width: 300,
                    borderRight: '1px solid rgba(219,0,29,0.15)',
                    background: 'rgba(0,0,0,0.15)',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div
                    className='px-4 py-3 flex-shrink-0'
                    style={{ borderBottom: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)' }}
                >
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 2 }}>
                        Personnel
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}>
                        Members
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>
                        {total > 0 ? `${total} member${total !== 1 ? 's' : ''}` : loadingList ? 'Loading…' : '0 members'}
                    </div>
                </div>

                {/* Search */}
                <div className='px-3 py-2 flex-shrink-0' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <input
                        type='text'
                        value={search}
                        onChange={e => handleSearchChange(e.target.value)}
                        placeholder='Search…'
                        style={{
                            width: '100%',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(237,237,237,0.9)',
                            padding: '6px 10px',
                            fontSize: '0.8rem',
                            outline: 'none',
                        }}
                    />
                </div>

                {/* Page navigation */}
                {total > PAGE_SIZE && (
                    <div
                        className='flex-shrink-0 flex items-center justify-between px-3 py-1'
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', gap: 6 }}
                    >
                        <button
                            onClick={() => handlePageChange(page - 1)}
                            disabled={page === 0 || loadingList}
                            style={{
                                background: 'none',
                                border: '1px solid rgba(219,0,29,0.25)',
                                color: page === 0 ? 'rgba(237,237,237,0.15)' : 'rgba(237,237,237,0.45)',
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                padding: '2px 8px',
                                cursor: page === 0 ? 'default' : 'pointer',
                            }}
                        >
                            Prev
                        </button>
                        <span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.3)', whiteSpace: 'nowrap' }}>
                            {loadingList ? '…' : `${start}–${end} of ${total}`}
                        </span>
                        <button
                            onClick={() => handlePageChange(page + 1)}
                            disabled={page >= totalPages - 1 || loadingList}
                            style={{
                                background: 'none',
                                border: '1px solid rgba(219,0,29,0.25)',
                                color: page >= totalPages - 1 ? 'rgba(237,237,237,0.15)' : 'rgba(237,237,237,0.45)',
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                padding: '2px 8px',
                                cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                            }}
                        >
                            Next
                        </button>
                    </div>
                )}

                {/* List */}
                <div className='flex flex-col overflow-y-auto flex-1'>
                    {loadingList ? (
                        <div className='px-4 py-6' style={{ textAlign: 'center', fontSize: '0.75rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>
                            Loading…
                        </div>
                    ) : members.length === 0 ? (
                        <div className='px-4 py-6' style={{ textAlign: 'center', fontSize: '0.75rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>
                            No members found.
                        </div>
                    ) : members.map(m => {
                        const display = getDisplayName(m)
                        const rank = m.milpac?.currentRank ? rankNameFromAbbr(m.milpac.currentRank) : null
                        const isSelected = m.username === selectedUsername

                        return (
                            <button
                                key={m.id}
                                onClick={() => selectMember(m.username)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 12px',
                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    background: isSelected ? 'rgba(219,0,29,0.08)' : 'transparent',
                                    borderLeft: isSelected ? '2px solid var(--red)' : '2px solid transparent',
                                    cursor: 'pointer', textAlign: 'left', width: '100%',
                                    transition: 'background 0.1s',
                                }}
                            >
                                <div style={{ position: 'relative', width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.05)' }}>
                                    <Avatar user={m as unknown as User} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {rank && (
                                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', lineHeight: 1.2 }}>
                                            {rank}
                                        </div>
                                    )}
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: isSelected ? 'rgba(237,237,237,0.95)' : 'rgba(237,237,237,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {display}
                                    </div>
                                    {m.orbatEntry && (
                                        <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {m.orbatEntry.role}
                                        </div>
                                    )}
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* ── Right: milpac editor ── */}
            <div className='flex-1 min-w-0 overflow-y-auto'>
                {!selectedUsername && (
                    <div className='flex items-center justify-center h-full' style={{ color: 'rgba(237,237,237,0.18)', fontSize: '0.82rem', fontStyle: 'italic' }}>
                        Select a member to edit their milpac
                    </div>
                )}

                {selectedUsername && loadingMember && (
                    <div className='flex items-center justify-center h-full' style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.82rem' }}>
                        Loading…
                    </div>
                )}

                {selectedUsername && loadError && (
                    <div className='flex items-center justify-center h-full' style={{ color: 'rgba(219,0,29,0.7)', fontSize: '0.82rem' }}>
                        {loadError}
                    </div>
                )}

                {memberData && !loadingMember && (
                    <MilpacEditor
                        key={memberData.username}
                        member={memberData}
                        confirmedOps={confirmedOps}
                        canEditRestricted={canEditRestricted}
                        canEditStandard={canEditStandard}
                        canImpersonate={canImpersonate}
                        onDirtyChange={setDirty}
                    />
                )}
            </div>
        </div>
    )
}
