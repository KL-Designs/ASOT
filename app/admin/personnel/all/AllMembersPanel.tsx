'use client'

import { useState, useCallback } from 'react'
import Avatar from '@/components/member/avatar'
import { rankNameFromAbbr } from '@/lib/ranks'
import MilpacEditor from '@/app/members/[username]/MilpacEditor'

type OrbatEntry = { role: string; section: string } | null

type MemberRow = {
    id: string
    username: string
    name?: string | null
    globalName?: string | null
    guild?: { nickname?: string | null } | null
    milpac?: { currentRank?: string | null } | null
    avatar?: string | null
    avatarDecoration?: string | null
    hexAccentColor?: string | null
}

type ConfirmedOp = { operationId: string; name: string; date?: string | null; confirmedAt: string | null }

function getDisplayName(m: MemberRow) {
    return m.name || m.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim() || m.globalName || m.username || ''
}

export default function AllMembersPanel({
    members,
    orbatMap,
    canEditRestricted,
    canEditStandard,
    canImpersonate,
}: {
    members: MemberRow[]
    orbatMap: Record<string, OrbatEntry>
    canEditRestricted: boolean
    canEditStandard: boolean
    canImpersonate: boolean
}) {
    const [query, setQuery] = useState('')
    const [selectedUsername, setSelectedUsername] = useState<string | null>(null)
    const [memberData, setMemberData] = useState<User | null>(null)
    const [confirmedOps, setConfirmedOps] = useState<ConfirmedOp[]>([])
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [dirty, setDirty] = useState(false)

    const filtered = members.filter(m => {
        if (!query.trim()) return true
        const display = getDisplayName(m)
        const q = query.trim().toLowerCase()
        return display.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)
    })

    const selectMember = useCallback(async (username: string) => {
        if (username === selectedUsername) return
        if (dirty) {
            if (!window.confirm('You have unsaved changes. Discard them and switch member?')) return
        }
        setSelectedUsername(username)
        setMemberData(null)
        setConfirmedOps([])
        setLoadError(null)
        setLoading(true)
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
            setLoading(false)
        }
    }, [selectedUsername, dirty])

    const selectedMemberRow = selectedUsername ? members.find(m => m.username === selectedUsername) ?? null : null

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
                        All Members
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>
                        {members.length} member{members.length !== 1 ? 's' : ''}
                    </div>
                </div>

                {/* Search */}
                <div className='px-3 py-2 flex-shrink-0' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <input
                        type='text'
                        value={query}
                        onChange={e => setQuery(e.target.value)}
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

                {/* List */}
                <div className='flex flex-col overflow-y-auto flex-1'>
                    {filtered.length === 0 ? (
                        <div className='px-4 py-6' style={{ textAlign: 'center', fontSize: '0.75rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>
                            No members found.
                        </div>
                    ) : filtered.map(m => {
                        const display = getDisplayName(m)
                        const rank = m.milpac?.currentRank ? rankNameFromAbbr(m.milpac.currentRank) : null
                        const orbatEntry = orbatMap[m.id] ?? null
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
                                    <Avatar user={m as User} />
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
                                    {orbatEntry && (
                                        <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {orbatEntry.role}
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

                {selectedUsername && loading && (
                    <div className='flex items-center justify-center h-full' style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.82rem' }}>
                        Loading…
                    </div>
                )}

                {selectedUsername && loadError && (
                    <div className='flex items-center justify-center h-full' style={{ color: 'rgba(219,0,29,0.7)', fontSize: '0.82rem' }}>
                        {loadError}
                    </div>
                )}

                {memberData && !loading && (
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
