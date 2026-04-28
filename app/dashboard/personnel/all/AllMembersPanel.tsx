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

type DiscordRole = { id: string; name: string; color: number; position: number }
type DiscordRolesData = { memberRoleIds: string[]; allRoles: DiscordRole[] }

function getDisplayName(m: MemberRow) {
    return m.name || m.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim() || m.globalName || m.username || ''
}

function roleColor(color: number) {
    return color ? `#${color.toString(16).padStart(6, '0')}` : 'rgba(237,237,237,0.45)'
}

export default function AllMembersPanel({
    canEditRestricted,
    canEditStandard,
    canImpersonate,
    isJ4,
}: {
    canEditRestricted: boolean
    canEditStandard: boolean
    canImpersonate: boolean
    isJ4: boolean
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

    // J4 — delete
    const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
    const [deleteStage, setDeleteStage] = useState<'idle' | 'confirm'>('idle')
    const [deleting, setDeleting] = useState(false)

    // J4 — name edit
    const [nameEditMode, setNameEditMode] = useState(false)
    const [nameEditValue, setNameEditValue] = useState('')
    const [nameEditError, setNameEditError] = useState<string | null>(null)
    const [nameSaving, setNameSaving] = useState(false)

    // J4 — chaplain toggle
    const [chaplainSaving, setChaplainSaving] = useState(false)

    // J4 — department toggles
    const [deptToggling, setDeptToggling] = useState<string | null>(null)

    // J4 — Discord roles
    const [discordRoles, setDiscordRoles] = useState<DiscordRolesData | null>(null)
    const [rolesLoading, setRolesLoading] = useState(false)
    const [rolesError, setRolesError] = useState<string | null>(null)
    const [roleSearchQuery, setRoleSearchQuery] = useState('')
    const [roleToggling, setRoleToggling] = useState<string | null>(null)

    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const totalPages = Math.ceil(total / PAGE_SIZE)

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

    useEffect(() => { fetchMembers(0, '') }, [fetchMembers])

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

    function resetJ4State() {
        setDeleteStage('idle')
        setDeleteConfirmInput('')
        setNameEditMode(false)
        setNameEditValue('')
        setNameEditError(null)
        setChaplainSaving(false)
        setDeptToggling(null)
        setDiscordRoles(null)
        setRolesError(null)
        setRoleSearchQuery('')
        setRoleToggling(null)
    }

    const loadDiscordRoles = useCallback(async (userId: string) => {
        setRolesLoading(true)
        setRolesError(null)
        setDiscordRoles(null)
        try {
            const res = await fetch(`/api/admin/members/${userId}/discord-roles`)
            if (!res.ok) throw new Error('Failed to load Discord roles')
            const data = await res.json()
            setDiscordRoles(data)
        } catch (e: any) {
            setRolesError(e.message || 'Failed to load roles')
        } finally {
            setRolesLoading(false)
        }
    }, [])

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
        resetJ4State()
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

    // Auto-load Discord roles when a member is selected and user is J4
    useEffect(() => {
        if (!isJ4 || !memberData?.id) return
        loadDiscordRoles(memberData.id)
    }, [memberData?.id, isJ4, loadDiscordRoles])

    async function handleDeleteMember() {
        if (!memberData) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/admin/members/${memberData.id}`, { method: 'DELETE' })
            if (!res.ok) throw new Error('Delete failed')
            setSelectedUsername(null)
            setMemberData(null)
            resetJ4State()
            fetchMembers(page, search)
        } finally {
            setDeleting(false)
        }
    }

    async function handleNameSave() {
        if (!memberData || !nameEditValue.trim()) return
        setNameSaving(true)
        setNameEditError(null)
        try {
            const res = await fetch(`/api/admin/members/${memberData.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nameEditValue.trim() }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || 'Failed to save name')
            setMemberData(prev => prev ? { ...prev, name: nameEditValue.trim() } : prev)
            setNameEditMode(false)
        } catch (e: any) {
            setNameEditError(e.message)
        } finally {
            setNameSaving(false)
        }
    }

    async function handleChaplainToggle() {
        if (!memberData) return
        const next = !memberData.isChaplain
        setChaplainSaving(true)
        try {
            const res = await fetch(`/api/admin/members/${memberData.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chaplain: next }),
            })
            if (!res.ok) throw new Error('Failed to update chaplain status')
            setMemberData(prev => prev ? { ...prev, isChaplain: next } : prev)
        } catch (e: any) {
            console.error(e)
        } finally {
            setChaplainSaving(false)
        }
    }

    async function handleDeptToggle(dept: string, action: 'add' | 'remove') {
        if (!memberData) return
        setDeptToggling(dept)
        try {
            const res = await fetch(`/api/admin/members/${memberData.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ department: dept, action }),
            })
            if (!res.ok) throw new Error('Failed to update department')
            setMemberData(prev => {
                if (!prev) return prev
                const current = prev.departments ?? []
                const next = action === 'add'
                    ? [...new Set([...current, dept])]
                    : current.filter(d => d !== dept)
                return { ...prev, departments: next }
            })
        } catch (e: any) {
            console.error(e)
        } finally {
            setDeptToggling(null)
        }
    }

    async function handleRoleToggle(roleId: string, action: 'add' | 'remove') {
        if (!memberData) return
        setRoleToggling(roleId)
        setRolesError(null)
        try {
            const res = await fetch(`/api/admin/members/${memberData.id}/discord-roles`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roleId, action }),
            })
            if (!res.ok) throw new Error('Failed to update role')
            setDiscordRoles(prev => {
                if (!prev) return prev
                if (action === 'add') return { ...prev, memberRoleIds: [...prev.memberRoleIds, roleId] }
                return { ...prev, memberRoleIds: prev.memberRoleIds.filter(id => id !== roleId) }
            })
            setRoleSearchQuery('')
        } catch (e: any) {
            setRolesError(e.message)
        } finally {
            setRoleToggling(null)
        }
    }

    const start = page * PAGE_SIZE + 1
    const end   = Math.min((page + 1) * PAGE_SIZE, total)

    return (
        <div className='flex h-full w-full' style={{ minHeight: 0 }}>

            {/* ── Left: member list ── */}
            <div
                className='flex flex-col flex-shrink-0'
                style={{
                    width: 300,
                    borderRight: '1px solid rgba(219,0,29,0.42)',
                    background: 'rgba(0,0,0,0.15)',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div
                    className='px-4 py-3 flex-shrink-0'
                    style={{ borderBottom: '1px solid rgba(219,0,29,0.42)', borderTop: '2px solid var(--red)' }}
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

            {/* ── Right: milpac editor + J4 panel ── */}
            <div className='flex-1 min-w-0 flex flex-col min-h-0'>
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
                    <>
                        {/* Editor fills remaining space and scrolls internally */}
                        <div className='flex-1 overflow-y-auto min-h-0'>
                            <MilpacEditor
                                key={memberData.username}
                                member={memberData}
                                confirmedOps={confirmedOps}
                                canEditRestricted={canEditRestricted}
                                canEditStandard={canEditStandard}
                                canImpersonate={canImpersonate}
                                nameReadOnly={isJ4}
                                onDirtyChange={setDirty}
                            />
                        </div>

                        {/* J4 administration panel */}
                        {isJ4 && (
                            <div style={{ flexShrink: 0, borderTop: '2px solid rgba(219,0,29,0.2)', maxHeight: 420, overflowY: 'auto' }}>

                                {/* Panel header */}
                                <div style={{ padding: '8px 24px 4px', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    J4 Administration
                                </div>

                                {/* ── Display Name ── */}
                                <div style={{ padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 8 }}>
                                        Display Name
                                    </div>
                                    {!nameEditMode ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ fontSize: '0.82rem', color: memberData.name ? 'rgba(237,237,237,0.8)' : 'rgba(237,237,237,0.28)', fontStyle: memberData.name ? 'normal' : 'italic', fontFamily: 'monospace' }}>
                                                {memberData.name || 'not set — uses Discord nickname'}
                                            </span>
                                            <button
                                                onClick={() => { setNameEditMode(true); setNameEditValue(memberData.name ?? '') }}
                                                style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', background: 'none', border: '1px solid rgba(255,255,255,0.12)', padding: '3px 10px', cursor: 'pointer' }}
                                            >
                                                Edit
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
                                            <input
                                                value={nameEditValue}
                                                onChange={e => setNameEditValue(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') { setNameEditMode(false); setNameEditError(null) } }}
                                                autoFocus
                                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.9)', padding: '6px 10px', fontSize: '0.82rem', outline: 'none' }}
                                            />
                                            {nameEditError && (
                                                <div style={{ fontSize: '0.68rem', color: 'rgba(219,0,29,0.8)' }}>{nameEditError}</div>
                                            )}
                                            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)' }}>
                                                Discord nickname will be set to:{' '}
                                                <strong style={{ color: 'rgba(237,237,237,0.5)', fontFamily: 'monospace' }}>
                                                    {memberData.milpac?.currentRank
                                                        ? `${memberData.milpac.currentRank} ${nameEditValue.trim() || '…'}`
                                                        : (nameEditValue.trim() || '…')}
                                                </strong>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button
                                                    onClick={handleNameSave}
                                                    disabled={nameSaving || !nameEditValue.trim()}
                                                    style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.8)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', padding: '5px 14px', cursor: (nameSaving || !nameEditValue.trim()) ? 'not-allowed' : 'pointer', opacity: (nameSaving || !nameEditValue.trim()) ? 0.4 : 1 }}
                                                >
                                                    {nameSaving ? 'Saving…' : 'Save'}
                                                </button>
                                                <button
                                                    onClick={() => { setNameEditMode(false); setNameEditError(null) }}
                                                    style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: '5px 10px' }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* ── Chaplain ── */}
                                <div style={{ padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 8 }}>
                                        Chaplain
                                    </div>
                                    <button
                                        onClick={handleChaplainToggle}
                                        disabled={chaplainSaving}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            background: 'none',
                                            border: 'none',
                                            cursor: chaplainSaving ? 'not-allowed' : 'pointer',
                                            padding: 0,
                                            opacity: chaplainSaving ? 0.5 : 1,
                                        }}
                                    >
                                        <div style={{
                                            width: 32,
                                            height: 18,
                                            borderRadius: 9,
                                            background: memberData.isChaplain ? 'rgba(147,197,253,0.6)' : 'rgba(255,255,255,0.1)',
                                            border: memberData.isChaplain ? '1px solid rgba(147,197,253,0.4)' : '1px solid rgba(255,255,255,0.15)',
                                            position: 'relative',
                                            transition: 'background 0.15s',
                                            flexShrink: 0,
                                        }}>
                                            <div style={{
                                                position: 'absolute',
                                                top: 2,
                                                left: memberData.isChaplain ? 16 : 2,
                                                width: 12,
                                                height: 12,
                                                borderRadius: '50%',
                                                background: memberData.isChaplain ? 'rgba(219,234,254,0.95)' : 'rgba(237,237,237,0.4)',
                                                transition: 'left 0.15s',
                                            }} />
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: memberData.isChaplain ? 'rgba(147,197,253,0.9)' : 'rgba(237,237,237,0.4)' }}>
                                            {memberData.isChaplain ? 'Chaplain [✞]' : 'Not a chaplain'}
                                        </span>
                                    </button>
                                    <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.2)', marginTop: 6 }}>
                                        Grants ASOT Chaplain role · adds [✞] to Discord nickname
                                    </div>
                                </div>

                                {/* ── Departments ── */}
                                <div style={{ padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 8 }}>
                                        Departments
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                        {(['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7'] as const).map(dept => {
                                            const isMember = (memberData.departments ?? []).includes(dept)
                                            const isLead = (memberData.teamLeadDepts ?? []).includes(dept)
                                            const isLoading = deptToggling === dept
                                            return (
                                                <button
                                                    key={dept}
                                                    onClick={() => handleDeptToggle(dept, isMember ? 'remove' : 'add')}
                                                    disabled={isLoading}
                                                    title={isMember ? `Remove from ${dept.toUpperCase()}` : `Add to ${dept.toUpperCase()}`}
                                                    style={{
                                                        padding: '3px 10px',
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700,
                                                        letterSpacing: '0.08em',
                                                        textTransform: 'uppercase',
                                                        cursor: isLoading ? 'not-allowed' : 'pointer',
                                                        opacity: isLoading ? 0.4 : 1,
                                                        border: isMember
                                                            ? (isLead ? '1px solid rgba(234,179,8,0.5)' : '1px solid rgba(59,130,246,0.5)')
                                                            : '1px solid rgba(255,255,255,0.1)',
                                                        background: isMember
                                                            ? (isLead ? 'rgba(234,179,8,0.12)' : 'rgba(59,130,246,0.12)')
                                                            : 'rgba(255,255,255,0.03)',
                                                        color: isMember
                                                            ? (isLead ? 'rgba(253,224,71,0.9)' : 'rgba(147,197,253,0.9)')
                                                            : 'rgba(237,237,237,0.25)',
                                                    }}
                                                >
                                                    {dept}{isLead ? ' ★' : ''}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.2)', marginTop: 6 }}>
                                        Click to add or remove. ★ = team lead (managed via tickets).
                                    </div>
                                </div>

                                {/* ── Discord Roles ── */}
                                <div style={{ padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 8 }}>
                                        Discord Roles
                                    </div>

                                    {rolesLoading && (
                                        <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>Loading…</div>
                                    )}
                                    {rolesError && (
                                        <div style={{ fontSize: '0.72rem', color: 'rgba(219,0,29,0.7)' }}>{rolesError}</div>
                                    )}

                                    {discordRoles && (
                                        <>
                                            {/* Current roles */}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                                                {discordRoles.memberRoleIds.length === 0 && (
                                                    <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No roles assigned</span>
                                                )}
                                                {discordRoles.allRoles
                                                    .filter(r => discordRoles.memberRoleIds.includes(r.id) && r.name !== '@everyone')
                                                    .map(role => {
                                                        const color = roleColor(role.color)
                                                        return (
                                                            <span
                                                                key={role.id}
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px 2px 6px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}44`, borderRadius: 2, fontSize: '0.68rem', color }}
                                                            >
                                                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                                                {role.name}
                                                                <button
                                                                    onClick={() => handleRoleToggle(role.id, 'remove')}
                                                                    disabled={roleToggling === role.id}
                                                                    title='Remove role'
                                                                    style={{ background: 'none', border: 'none', cursor: roleToggling === role.id ? 'not-allowed' : 'pointer', color: 'rgba(237,237,237,0.35)', padding: 0, lineHeight: 1, marginLeft: 2, fontSize: '0.8rem', opacity: roleToggling === role.id ? 0.3 : 1 }}
                                                                >
                                                                    ×
                                                                </button>
                                                            </span>
                                                        )
                                                    })}
                                            </div>

                                            {/* Add role search */}
                                            <input
                                                value={roleSearchQuery}
                                                onChange={e => setRoleSearchQuery(e.target.value)}
                                                placeholder='Search roles to add…'
                                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.9)', padding: '5px 8px', fontSize: '0.75rem', outline: 'none', width: '100%', maxWidth: 260 }}
                                            />

                                            {roleSearchQuery.trim() && (
                                                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 160, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                    {discordRoles.allRoles
                                                        .filter(r =>
                                                            !discordRoles.memberRoleIds.includes(r.id) &&
                                                            r.name !== '@everyone' &&
                                                            r.name.toLowerCase().includes(roleSearchQuery.toLowerCase())
                                                        )
                                                        .slice(0, 12)
                                                        .map(role => {
                                                            const color = roleColor(role.color)
                                                            return (
                                                                <button
                                                                    key={role.id}
                                                                    onClick={() => handleRoleToggle(role.id, 'add')}
                                                                    disabled={roleToggling === role.id}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: roleToggling === role.id ? 'not-allowed' : 'pointer', textAlign: 'left', color, fontSize: '0.72rem', opacity: roleToggling === role.id ? 0.4 : 1 }}
                                                                >
                                                                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                                                    {role.name}
                                                                </button>
                                                            )
                                                        })}
                                                    {discordRoles.allRoles.filter(r =>
                                                        !discordRoles.memberRoleIds.includes(r.id) &&
                                                        r.name !== '@everyone' &&
                                                        r.name.toLowerCase().includes(roleSearchQuery.toLowerCase())
                                                    ).length === 0 && (
                                                        <div style={{ padding: '6px 10px', fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No roles match</div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* ── Delete Account ── */}
                                <div style={{ padding: '12px 24px' }}>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(239,68,68,0.4)', marginBottom: 8 }}>
                                        Danger Zone
                                    </div>
                                    {deleteStage === 'idle' ? (
                                        <button
                                            onClick={() => setDeleteStage('confirm')}
                                            style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(239,68,68,0.5)', background: 'none', border: '1px solid rgba(239,68,68,0.2)', padding: '5px 14px', cursor: 'pointer' }}
                                        >
                                            Delete Member Account
                                        </button>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400 }}>
                                            <div style={{ fontSize: '0.72rem', color: 'rgba(239,68,68,0.8)', fontWeight: 700, letterSpacing: '0.05em' }}>
                                                ⚠ This will permanently delete {getDisplayName(memberData as unknown as MemberRow)}&apos;s account from the database. This cannot be undone.
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.4)' }}>
                                                Type <strong style={{ color: 'rgba(237,237,237,0.7)', fontFamily: 'monospace' }}>{memberData.username}</strong> to confirm:
                                            </div>
                                            <input
                                                type='text'
                                                value={deleteConfirmInput}
                                                onChange={e => setDeleteConfirmInput(e.target.value)}
                                                placeholder={memberData.username}
                                                autoFocus
                                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(239,68,68,0.35)', color: 'rgba(237,237,237,0.9)', padding: '6px 10px', fontSize: '0.82rem', outline: 'none', fontFamily: 'monospace', width: '100%' }}
                                            />
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button
                                                    onClick={handleDeleteMember}
                                                    disabled={deleteConfirmInput !== memberData.username || deleting}
                                                    style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 16px', cursor: deleteConfirmInput === memberData.username && !deleting ? 'pointer' : 'default', background: deleteConfirmInput === memberData.username ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.4)', color: deleteConfirmInput === memberData.username ? '#ef4444' : 'rgba(239,68,68,0.3)', transition: 'all 0.15s' }}
                                                >
                                                    {deleting ? 'Deleting…' : 'Confirm Delete'}
                                                </button>
                                                <button
                                                    onClick={() => { setDeleteStage('idle'); setDeleteConfirmInput('') }}
                                                    style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px' }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
