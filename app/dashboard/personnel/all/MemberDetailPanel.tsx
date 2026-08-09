'use client'

import { useState, useEffect, useCallback } from 'react'
import MilpacEditor from '@/app/members/[username]/MilpacEditor'

type ConfirmedOp = { operationId: string; name: string; date?: string | null; confirmedAt: string | null }
type DiscordRole = { id: string; name: string; color: number; position: number }
type DiscordRolesData = { memberRoleIds: string[]; allRoles: DiscordRole[] }

function roleColor(color: number) {
    return color ? `#${color.toString(16).padStart(6, '0')}` : 'rgba(237,237,237,0.45)'
}

interface Props {
    username: string
    isJ4: boolean
    canEditRestricted: boolean
    canEditStandard: boolean
    canImpersonate?: boolean
    onMemberDeleted?: () => void
    onDirtyChange?: (dirty: boolean) => void
}

export default function MemberDetailPanel({
    username,
    isJ4,
    canEditRestricted,
    canEditStandard,
    canImpersonate = false,
    onMemberDeleted,
    onDirtyChange,
}: Props) {
    const [memberData, setMemberData] = useState<User | null>(null)
    const [confirmedOps, setConfirmedOps] = useState<ConfirmedOp[]>([])
    const [loadingMember, setLoadingMember] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)

    // Discharge
    const [dischargeStage, setDischargeStage] = useState<'idle' | 'form'>('idle')
    const [dischargeType, setDischargeType] = useState<'honorable' | 'general' | 'dishonorable' | ''>('')
    const [dischargeReason, setDischargeReason] = useState('')
    const [dischargeNotes, setDischargeNotes] = useState('')
    const [dischargeSubmitting, setDischargeSubmitting] = useState(false)
    const [dischargeError, setDischargeError] = useState<string | null>(null)
    const [dischargeSuccess, setDischargeSuccess] = useState<string | null>(null)

    // J4 — panel collapse
    const [j4Open, setJ4Open] = useState(false)

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

    useEffect(() => {
        setMemberData(null)
        setConfirmedOps([])
        setLoadError(null)
        setLoadingMember(true)
        setJ4Open(false)
        setDeleteStage('idle')
        setDeleteConfirmInput('')
        setDischargeStage('idle')
        setDischargeType('')
        setDischargeReason('')
        setDischargeNotes('')
        setDischargeError(null)
        setDischargeSuccess(null)
        setNameEditMode(false)
        setNameEditValue('')
        setNameEditError(null)
        setDiscordRoles(null)
        setRolesError(null)
        setRoleSearchQuery('')

        Promise.all([
            fetch(`/api/members/${username}`),
            fetch(`/api/members/${username}/confirmed-ops`),
        ]).then(async ([memberRes, opsRes]) => {
            if (!memberRes.ok) throw new Error('Failed to load member')
            const [member, ops] = await Promise.all([memberRes.json(), opsRes.json()])
            setMemberData(member)
            setConfirmedOps(Array.isArray(ops) ? ops : [])
        }).catch(e => {
            setLoadError(e.message || 'Failed to load member')
        }).finally(() => {
            setLoadingMember(false)
        })
    }, [username])

    const loadDiscordRoles = useCallback(async (userId: string) => {
        setRolesLoading(true)
        setRolesError(null)
        setDiscordRoles(null)
        try {
            const res = await fetch(`/api/admin/members/${userId}/discord-roles`)
            if (!res.ok) throw new Error('Failed to load Discord roles')
            setDiscordRoles(await res.json())
        } catch (e: any) {
            setRolesError(e.message || 'Failed to load roles')
        } finally {
            setRolesLoading(false)
        }
    }, [])

    useEffect(() => {
        if (!isJ4 || !memberData?.id) return
        loadDiscordRoles(memberData.id)
    }, [memberData?.id, isJ4, loadDiscordRoles])

    async function handleDischargeMember() {
        if (!memberData || !dischargeType || !dischargeReason.trim()) {
            setDischargeError('Please select a discharge type and provide a reason.')
            return
        }
        setDischargeSubmitting(true)
        setDischargeError(null)
        const targetDisplayName = memberData.name || memberData.guild?.nickname || memberData.globalName || memberData.username || memberData.id
        try {
            const res = await fetch('/api/admin/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'j4-discharge',
                    targetUserId: memberData.id,
                    targetUserName: targetDisplayName,
                    dischargeType,
                    dischargeReason: dischargeReason.trim(),
                    notes: dischargeNotes.trim() || undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                setDischargeError(data.error ?? 'Submission failed.')
            } else {
                setDischargeSuccess('Discharge request submitted — awaiting J4 approval.')
                setDischargeStage('idle')
                setDischargeType('')
                setDischargeReason('')
                setDischargeNotes('')
            }
        } catch {
            setDischargeError('Network error. Please try again.')
        } finally {
            setDischargeSubmitting(false)
        }
    }

    async function handleDeleteMember() {
        if (!memberData) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/admin/members/${memberData.id}`, { method: 'DELETE' })
            if (!res.ok) throw new Error('Delete failed')
            onMemberDeleted?.()
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

    const displayName = memberData?.name || memberData?.guild?.nickname || memberData?.globalName || memberData?.username || username

    if (loadingMember) {
        return (
            <div className='flex items-center justify-center h-full' style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.82rem' }}>
                Loading…
            </div>
        )
    }

    if (loadError) {
        return (
            <div className='flex items-center justify-center h-full' style={{ color: 'rgba(219,0,29,0.7)', fontSize: '0.82rem' }}>
                {loadError}
            </div>
        )
    }

    if (!memberData) return null

    return (
        <>
            {/* MilPac editor — fills remaining space and scrolls internally */}
            <div className='flex-1 overflow-y-auto min-h-0'>
                <MilpacEditor
                    key={memberData.username}
                    member={memberData}
                    confirmedOps={confirmedOps}
                    canEditRestricted={canEditRestricted}
                    canEditStandard={canEditStandard}
                    canImpersonate={canImpersonate}
                    nameReadOnly={isJ4}
                    onDirtyChange={onDirtyChange}
                />
            </div>

            {/* J4 administration panel — collapsed behind a toggle bar so it doesn't eat screen space by default */}
            {isJ4 && (
                <div style={{ flexShrink: 0, borderTop: '2px solid rgba(219,0,29,0.2)' }}>

                    <button
                        onClick={() => setJ4Open(o => !o)}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
                            padding: '7px 24px', background: j4Open ? 'rgba(219,0,29,0.1)' : 'rgba(219,0,29,0.04)',
                            border: 'none', cursor: 'pointer',
                        }}
                    >
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)' }}>
                            J4 Administration
                        </span>
                        <span style={{ fontSize: '0.65rem', color: 'rgba(219,0,29,0.8)', lineHeight: 1, transform: j4Open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                            ▲
                        </span>
                    </button>

                    {j4Open && (
                    <div style={{ maxHeight: 420, overflowY: 'auto' }}>

                    {/* Display Name */}
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

                    {/* Chaplain */}
                    <div style={{ padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 8 }}>
                            Chaplain
                        </div>
                        <button
                            onClick={handleChaplainToggle}
                            disabled={chaplainSaving}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: chaplainSaving ? 'not-allowed' : 'pointer', padding: 0, opacity: chaplainSaving ? 0.5 : 1 }}
                        >
                            <div style={{ width: 32, height: 18, borderRadius: 9, background: memberData.isChaplain ? 'rgba(147,197,253,0.6)' : 'rgba(255,255,255,0.1)', border: memberData.isChaplain ? '1px solid rgba(147,197,253,0.4)' : '1px solid rgba(255,255,255,0.15)', position: 'relative', transition: 'background 0.15s', flexShrink: 0 }}>
                                <div style={{ position: 'absolute', top: 2, left: memberData.isChaplain ? 16 : 2, width: 12, height: 12, borderRadius: '50%', background: memberData.isChaplain ? 'rgba(219,234,254,0.95)' : 'rgba(237,237,237,0.4)', transition: 'left 0.15s' }} />
                            </div>
                            <span style={{ fontSize: '0.75rem', color: memberData.isChaplain ? 'rgba(147,197,253,0.9)' : 'rgba(237,237,237,0.4)' }}>
                                {memberData.isChaplain ? 'Chaplain [✞]' : 'Not a chaplain'}
                            </span>
                        </button>
                        <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.2)', marginTop: 6 }}>
                            Grants ASOT Chaplain role · adds [✞] to Discord nickname
                        </div>
                    </div>

                    {/* Departments */}
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
                                            padding: '3px 10px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                                            cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.4 : 1,
                                            border: isMember ? (isLead ? '1px solid rgba(234,179,8,0.5)' : '1px solid rgba(59,130,246,0.5)') : '1px solid rgba(255,255,255,0.1)',
                                            background: isMember ? (isLead ? 'rgba(234,179,8,0.12)' : 'rgba(59,130,246,0.12)') : 'rgba(255,255,255,0.03)',
                                            color: isMember ? (isLead ? 'rgba(253,224,71,0.9)' : 'rgba(147,197,253,0.9)') : 'rgba(237,237,237,0.25)',
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

                    {/* Discord Roles */}
                    <div style={{ padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)', marginBottom: 8 }}>
                            Discord Roles
                        </div>
                        {rolesLoading && <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>Loading…</div>}
                        {rolesError && <div style={{ fontSize: '0.72rem', color: 'rgba(219,0,29,0.7)' }}>{rolesError}</div>}
                        {discordRoles && (
                            <>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                                    {discordRoles.memberRoleIds.length === 0 && (
                                        <span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No roles assigned</span>
                                    )}
                                    {discordRoles.allRoles
                                        .filter(r => discordRoles.memberRoleIds.includes(r.id) && r.name !== '@everyone')
                                        .map(role => {
                                            const color = roleColor(role.color)
                                            return (
                                                <span key={role.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px 2px 6px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}44`, borderRadius: 2, fontSize: '0.68rem', color }}>
                                                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                                    {role.name}
                                                    <button
                                                        onClick={() => handleRoleToggle(role.id, 'remove')}
                                                        disabled={roleToggling === role.id}
                                                        style={{ background: 'none', border: 'none', cursor: roleToggling === role.id ? 'not-allowed' : 'pointer', color: 'rgba(237,237,237,0.35)', padding: 0, lineHeight: 1, marginLeft: 2, fontSize: '0.8rem', opacity: roleToggling === role.id ? 0.3 : 1 }}
                                                    >×</button>
                                                </span>
                                            )
                                        })}
                                </div>
                                <input
                                    value={roleSearchQuery}
                                    onChange={e => setRoleSearchQuery(e.target.value)}
                                    placeholder='Search roles to add…'
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.9)', padding: '5px 8px', fontSize: '0.75rem', outline: 'none', width: '100%', maxWidth: 260 }}
                                />
                                {roleSearchQuery.trim() && (
                                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 160, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        {discordRoles.allRoles
                                            .filter(r => !discordRoles.memberRoleIds.includes(r.id) && r.name !== '@everyone' && r.name.toLowerCase().includes(roleSearchQuery.toLowerCase()))
                                            .slice(0, 12)
                                            .map(role => {
                                                const color = roleColor(role.color)
                                                return (
                                                    <button key={role.id} onClick={() => handleRoleToggle(role.id, 'add')} disabled={roleToggling === role.id}
                                                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: roleToggling === role.id ? 'not-allowed' : 'pointer', textAlign: 'left', color, fontSize: '0.72rem', opacity: roleToggling === role.id ? 0.4 : 1 }}
                                                    >
                                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                                        {role.name}
                                                    </button>
                                                )
                                            })}
                                        {discordRoles.allRoles.filter(r => !discordRoles.memberRoleIds.includes(r.id) && r.name !== '@everyone' && r.name.toLowerCase().includes(roleSearchQuery.toLowerCase())).length === 0 && (
                                            <div style={{ padding: '6px 10px', fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No roles match</div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Danger Zone */}
                    <div style={{ padding: '12px 24px' }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(239,68,68,0.4)', marginBottom: 12 }}>
                            Danger Zone
                        </div>

                        {/* Discharge Member */}
                        {dischargeSuccess ? (
                            <div style={{ fontSize: '0.75rem', color: 'rgba(100,220,100,0.85)', marginBottom: 14 }}>{dischargeSuccess}</div>
                        ) : dischargeStage === 'idle' ? (
                            <button
                                onClick={() => setDischargeStage('form')}
                                style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(239,68,68,0.5)', background: 'none', border: '1px solid rgba(239,68,68,0.2)', padding: '5px 14px', cursor: 'pointer', marginBottom: 10, display: 'block' }}
                            >
                                Discharge Member
                            </button>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420, marginBottom: 16 }}>
                                <div style={{ fontSize: '0.72rem', color: 'rgba(239,68,68,0.8)', fontWeight: 700 }}>
                                    Initiate Discharge — Requires J4 Approval
                                </div>
                                <select
                                    value={dischargeType}
                                    onChange={e => setDischargeType(e.target.value as typeof dischargeType)}
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(239,68,68,0.25)', color: dischargeType ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.35)', padding: '6px 10px', fontSize: '0.8rem', outline: 'none', width: '100%' }}
                                >
                                    <option value=''>Select discharge type…</option>
                                    <option value='honorable'>Honorable Discharge</option>
                                    <option value='general'>General Discharge</option>
                                    <option value='dishonorable'>Dishonorable Discharge</option>
                                </select>
                                <textarea
                                    value={dischargeReason}
                                    onChange={e => setDischargeReason(e.target.value)}
                                    placeholder='Reason for discharge (required)'
                                    rows={3}
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(239,68,68,0.25)', color: 'rgba(237,237,237,0.9)', padding: '6px 10px', fontSize: '0.8rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', width: '100%' }}
                                />
                                <textarea
                                    value={dischargeNotes}
                                    onChange={e => setDischargeNotes(e.target.value)}
                                    placeholder='Additional notes (optional)'
                                    rows={2}
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(237,237,237,0.1)', color: 'rgba(237,237,237,0.9)', padding: '6px 10px', fontSize: '0.8rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', width: '100%' }}
                                />
                                {dischargeError && (
                                    <div style={{ fontSize: '0.72rem', color: '#ff4444' }}>{dischargeError}</div>
                                )}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        onClick={handleDischargeMember}
                                        disabled={dischargeSubmitting || !dischargeType || !dischargeReason.trim()}
                                        style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 16px', cursor: (dischargeSubmitting || !dischargeType || !dischargeReason.trim()) ? 'default' : 'pointer', background: (dischargeType && dischargeReason.trim()) ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.35)', color: (dischargeType && dischargeReason.trim()) ? '#ef4444' : 'rgba(239,68,68,0.3)', transition: 'all 0.15s' }}
                                    >
                                        {dischargeSubmitting ? 'Submitting…' : 'Submit Discharge Request'}
                                    </button>
                                    <button
                                        onClick={() => { setDischargeStage('idle'); setDischargeType(''); setDischargeReason(''); setDischargeNotes(''); setDischargeError(null) }}
                                        style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px' }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Delete Account */}
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
                                    ⚠ This will permanently delete {displayName}&apos;s account from the database. This cannot be undone.
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
                </div>
            )}
        </>
    )
}
