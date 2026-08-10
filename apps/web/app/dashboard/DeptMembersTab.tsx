'use client'

import { useState, useEffect, useCallback } from 'react'
import { Autocomplete, TextField, Typography } from '@mui/material'
import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import { rankNameFromAbbr } from '@/lib/military/ranks'
import { DEPT_LEADERSHIP_POSITIONS } from '@/lib/discord/dept-codes'

type MemberOption = {
    id: string
    displayName: string
    currentRank: string | null
    teamLeadDepts: string[]
    dept2icRoles: string[]
    dept3icRoles: string[]
    departmentRoleIds: string[]
}

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.82rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.32)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.27)' },
        '&.Mui-focused fieldset': { borderColor: 'var(--red)' },
    },
    '& .MuiInputLabel-root': { fontSize: '0.82rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--red)' },
}

const cardStyle = {
    border: '1px solid rgba(219,0,29,0.12)',
    background: 'rgba(255,255,255,0.015)',
    padding: '20px 24px',
}

const labelStyle = {
    fontSize: '0.6rem',
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: 'rgba(219,0,29,0.7)',
    marginBottom: 12,
}

const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '6px 12px',
    fontSize: '0.6rem',
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(237,237,237,0.35)',
}

const tdStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: '0.8rem',
    color: 'rgba(237,237,237,0.75)',
}

export default function DeptMembersTab({
    department,
    displayName,
    userId,
    canManage,
    isJ4 = false,
}: {
    department: string
    displayName: string
    userId: string
    canManage: boolean
    isJ4?: boolean
}) {
    const [deptMembers, setDeptMembers] = useState<MemberOption[]>([])
    const [allMembers, setAllMembers] = useState<MemberOption[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingAll, setLoadingAll] = useState(false)
    const [deptRoles, setDeptRoles] = useState<DepartmentRole[]>([])
    const [roleActionId, setRoleActionId] = useState<string | null>(null)

    const [selected, setSelected] = useState<MemberOption | null>(null)
    // Which leadership slot is currently being assigned (null | 'leader' | '2ic' | '3ic')
    const [assigningSlot, setAssigningSlot] = useState<'leader' | '2ic' | '3ic' | null>(null)
    const [selectedForSlot, setSelectedForSlot] = useState<MemberOption | null>(null)

    const [submitting, setSubmitting] = useState(false)
    const [removingId, setRemovingId] = useState<string | null>(null)
    const [leadActionId, setLeadActionId] = useState<string | null>(null)
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
    const [syncing, setSyncing] = useState(false)
    const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)

    const fetchDeptMembers = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/members?department=${department}`)
            const data = await res.json()
            setDeptMembers((data.members ?? []).map((m: MemberOption) => ({
                ...m,
                dept2icRoles: m.dept2icRoles ?? [],
                dept3icRoles: m.dept3icRoles ?? [],
                departmentRoleIds: m.departmentRoleIds ?? [],
            })))
        } finally {
            setLoading(false)
        }
    }, [department])

    useEffect(() => {
        fetchDeptMembers()
        fetch(`/api/admin/department-roles?department=${department}`)
            .then(r => r.json())
            .then(d => setDeptRoles((d.roles ?? []).filter((r: DepartmentRole) => !r.isBase)))
            .catch(() => setDeptRoles([]))
        if (canManage) {
            setLoadingAll(true)
            fetch('/api/admin/members?limit=1000')
                .then(r => r.json())
                .then(d => setAllMembers((d.members ?? []).map((m: MemberOption) => ({
                    ...m,
                    dept2icRoles: m.dept2icRoles ?? [],
                    dept3icRoles: m.dept3icRoles ?? [],
                    departmentRoleIds: m.departmentRoleIds ?? [],
                }))))
                .finally(() => setLoadingAll(false))
        }
    }, [fetchDeptMembers, canManage, department])

    function showFeedback(type: 'success' | 'error', msg: string) {
        setFeedback({ type, msg })
        setTimeout(() => setFeedback(null), 5000)
    }

    async function handleSyncDiscord() {
        setSyncing(true)
        try {
            const res = await fetch('/api/admin/members/sync-dept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ department }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Sync failed')
            const msg = data.membersAdded === 0 && data.leadsAdded === 0
                ? `Sync complete — no new members found (${data.scanned} Discord members scanned).`
                : `Sync complete — added ${data.membersAdded} member(s), ${data.leadsAdded} lead(s) from Discord.`
            showFeedback('success', msg)
            if (data.membersAdded > 0 || data.leadsAdded > 0) fetchDeptMembers()
        } catch (e: unknown) {
            showFeedback('error', e instanceof Error ? e.message : 'Sync failed')
        } finally {
            setSyncing(false)
        }
    }

    async function postMemberAction(targetUserId: string, targetUserName: string, memberAction: string) {
        const res = await fetch('/api/admin/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'department-membership', targetUserId, targetUserName, deptCode: department, memberAction }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Request failed')
    }

    async function handleAdd() {
        if (!selected) return
        setSubmitting(true)
        try {
            await postMemberAction(selected.id, selected.displayName, 'add')
            showFeedback('success', `${selected.displayName} added to department.`)
            setSelected(null)
            fetchDeptMembers()
        } catch (e: unknown) {
            showFeedback('error', e instanceof Error ? e.message : 'Failed to add member')
        } finally {
            setSubmitting(false)
        }
    }

    async function handleRemove(member: MemberOption) {
        setRemovingId(member.id)
        try {
            await postMemberAction(member.id, member.displayName, 'remove')
            showFeedback('success', `${member.displayName} removed from department.`)
            fetchDeptMembers()
        } catch (e: unknown) {
            showFeedback('error', e instanceof Error ? e.message : 'Failed to remove member')
        } finally {
            setRemovingId(null)
        }
    }

    async function handleAssignSlot() {
        if (!selectedForSlot || !assigningSlot) return
        const actionMap = { leader: 'set-lead', '2ic': 'set-2ic', '3ic': 'set-3ic' }
        const action = actionMap[assigningSlot]
        const posNames = DEPT_LEADERSHIP_POSITIONS[department] ?? ['Department Leader', '2IC', '3IC']
        const posLabel = assigningSlot === 'leader' ? posNames[0] : assigningSlot === '2ic' ? posNames[1] : posNames[2]
        setLeadActionId(selectedForSlot.id)
        try {
            await postMemberAction(selectedForSlot.id, selectedForSlot.displayName, action)
            showFeedback('success', `${selectedForSlot.displayName} assigned as ${posLabel}.`)
            setAssigningSlot(null)
            setSelectedForSlot(null)
            fetchDeptMembers()
        } catch (e: unknown) {
            showFeedback('error', e instanceof Error ? e.message : 'Failed to assign position')
        } finally {
            setLeadActionId(null)
        }
    }

    async function handleRemoveFromSlot(member: MemberOption, slot: 'leader' | '2ic' | '3ic') {
        const actionMap = { leader: 'remove-lead', '2ic': 'remove-2ic', '3ic': 'remove-3ic' }
        const action = actionMap[slot]
        setLeadActionId(member.id)
        try {
            await postMemberAction(member.id, member.displayName, action)
            showFeedback('success', `${member.displayName} removed from position.`)
            fetchDeptMembers()
        } catch (e: unknown) {
            showFeedback('error', e instanceof Error ? e.message : 'Failed to remove from position')
        } finally {
            setLeadActionId(null)
        }
    }

    async function handleToggleRole(member: MemberOption, role: DepartmentRole) {
        const holds = member.departmentRoleIds.includes(String(role._id))
        setRoleActionId(member.id)
        try {
            const res = await fetch('/api/admin/department-roles/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUserId: member.id, roleId: String(role._id), action: holds ? 'remove' : 'add' }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Request failed')
            showFeedback('success', `${member.displayName} ${holds ? 'unassigned from' : 'assigned'} ${role.name}.`)
            fetchDeptMembers()
        } catch (e: unknown) {
            showFeedback('error', e instanceof Error ? e.message : 'Failed to update role')
        } finally {
            setRoleActionId(null)
        }
    }

    const posNames = DEPT_LEADERSHIP_POSITIONS[department] ?? ['Department Leader', '2IC', '3IC']

    const leaderHolder = deptMembers.find(m => m.teamLeadDepts?.includes(department)) ?? null
    const secondHolder = deptMembers.find(m => m.dept2icRoles?.includes(department)) ?? null
    const thirdHolder  = deptMembers.find(m => m.dept3icRoles?.includes(department)) ?? null

    const deptMemberIds = new Set(deptMembers.map(m => m.id))
    const addOptions = allMembers.filter(m => !deptMemberIds.has(m.id))

    return (
        <div className='p-6 flex flex-col gap-5'>

            {feedback && (
                <div style={{
                    position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 2000,
                    padding: '10px 20px', fontSize: '0.8rem', fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                    background: feedback.type === 'success' ? 'rgba(20,30,24,0.96)' : 'rgba(30,15,17,0.96)',
                    border: `1px solid ${feedback.type === 'success' ? 'rgba(34,197,94,0.4)' : 'rgba(219,0,29,0.4)'}`,
                    color: feedback.type === 'success' ? 'rgba(34,197,94,0.95)' : 'rgba(219,0,29,0.95)',
                }}>
                    {feedback.msg}
                </div>
            )}

            {/* Leadership Positions */}
            <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Typography style={{ ...labelStyle, marginBottom: 0 }}>Department Leadership</Typography>
                    {isJ4 && (
                        <button
                            onClick={handleSyncDiscord}
                            disabled={syncing}
                            style={{
                                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em',
                                textTransform: 'uppercase', padding: '4px 14px',
                                background: syncing ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.2)',
                                border: '1px solid rgba(59,130,246,0.4)',
                                color: syncing ? 'rgba(59,130,246,0.4)' : 'rgba(59,130,246,0.9)',
                                cursor: syncing ? 'not-allowed' : 'pointer',
                                flexShrink: 0,
                            }}
                        >
                            {syncing ? '⟳ Syncing…' : '⟳ Sync Discord'}
                        </button>
                    )}
                </div>

                {loading ? (
                    <TacticalSkeleton rows={3} />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {([
                            { slot: 'leader' as const, label: posNames[0], holder: leaderHolder, color: '#fbbf24' },
                            ...(posNames[1] ? [{ slot: '2ic' as const, label: posNames[1], holder: secondHolder, color: 'rgba(219,0,29,0.7)' }] : []),
                            ...(posNames[2] ? [{ slot: '3ic' as const, label: posNames[2], holder: thirdHolder,  color: 'rgba(237,237,237,0.5)' }] : []),
                        ]).map(({ slot, label, holder, color }) => (
                            <div key={slot} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '12px 0' }}>
                                {assigningSlot === slot ? (
                                    /* Inline assign row */
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color, minWidth: 150, flexShrink: 0 }}>{label}</span>
                                        <Autocomplete
                                            options={deptMembers.filter(m => m.id !== holder?.id)}
                                            getOptionLabel={m => m.displayName}
                                            isOptionEqualToValue={(o, v) => o.id === v.id}
                                            value={selectedForSlot}
                                            onChange={(_, v) => setSelectedForSlot(v)}
                                            sx={{ flex: 1, maxWidth: 280, ...inputSx }}
                                            renderOption={(props, m) => <li {...props} key={m.id}>{m.displayName}</li>}
                                            renderInput={params => <TextField {...params} label='Select member' size='small' sx={inputSx} />}
                                            size='small'
                                        />
                                        <button
                                            onClick={handleAssignSlot}
                                            disabled={!selectedForSlot || leadActionId !== null}
                                            style={{ padding: '6px 16px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', background: selectedForSlot ? `${color}33` : 'rgba(255,255,255,0.04)', border: `1px solid ${color}66`, color, cursor: selectedForSlot ? 'pointer' : 'default', flexShrink: 0 }}
                                        >
                                            {leadActionId !== null ? '…' : 'Assign'}
                                        </button>
                                        <button
                                            onClick={() => { setAssigningSlot(null); setSelectedForSlot(null) }}
                                            style={{ padding: '6px 12px', fontSize: '0.68rem', fontWeight: 700, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.35)', cursor: 'pointer', flexShrink: 0 }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    /* Display row */
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color, minWidth: 150, flexShrink: 0 }}>{label}</span>
                                        {holder ? (
                                            <>
                                                <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)' }}>
                                                    {holder.displayName}
                                                </span>
                                                {canManage && (
                                                    <button
                                                        onClick={() => handleRemoveFromSlot(holder, slot)}
                                                        disabled={leadActionId === holder.id}
                                                        style={{ padding: '3px 10px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.35)', cursor: 'pointer', flexShrink: 0 }}
                                                    >
                                                        {leadActionId === holder.id ? '…' : 'Remove'}
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <span style={{ flex: 1, fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>Not assigned</span>
                                                {canManage && (
                                                    <button
                                                        onClick={() => { setAssigningSlot(slot); setSelectedForSlot(null) }}
                                                        style={{ padding: '3px 10px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', background: `${color}18`, border: `1px solid ${color}44`, color, cursor: 'pointer', flexShrink: 0 }}
                                                    >
                                                        + Assign
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Department Members */}
            <div style={cardStyle}>
                <Typography style={labelStyle}>Department Members</Typography>

                {loading ? (
                    <TacticalSkeleton rows={5} />
                ) : deptMembers.length === 0 ? (
                    <Typography style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.3)', padding: '12px 0' }}>
                        No members in this department yet.
                    </Typography>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(219,0,29,0.42)' }}>
                                    <th style={thStyle}>Name</th>
                                    <th style={thStyle}>Rank</th>
                                    <th style={thStyle}>Position</th>
                                    {deptRoles.length > 0 && <th style={thStyle}>Roles</th>}
                                    {canManage && <th style={{ ...thStyle, textAlign: 'right' }} />}
                                </tr>
                            </thead>
                            <tbody>
                                {deptMembers.map(m => {
                                    const isLeader = m.teamLeadDepts?.includes(department)
                                    const is2ic    = m.dept2icRoles?.includes(department)
                                    const is3ic    = m.dept3icRoles?.includes(department)
                                    const position = isLeader ? posNames[0] : is2ic ? posNames[1] : is3ic ? posNames[2] : null
                                    return (
                                        <tr
                                            key={m.id}
                                            onMouseEnter={() => setHoveredRowId(m.id)}
                                            onMouseLeave={() => setHoveredRowId(prev => (prev === m.id ? null : prev))}
                                            style={{
                                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                background: hoveredRowId === m.id ? 'rgba(255,255,255,0.035)' : 'transparent',
                                                transition: 'background 0.1s',
                                            }}
                                        >
                                            <td style={tdStyle}>
                                                {isLeader && <span style={{ color: 'rgba(251,191,36,0.8)', marginRight: 6, fontSize: '0.72rem' }}>★</span>}
                                                {m.displayName}
                                            </td>
                                            <td style={{ ...tdStyle, color: 'rgba(219,0,29,0.7)', fontSize: '0.72rem' }}>
                                                {m.currentRank ? rankNameFromAbbr(m.currentRank) : '—'}
                                            </td>
                                            <td style={{ ...tdStyle, fontSize: '0.68rem', color: isLeader ? '#fbbf24' : 'rgba(219,0,29,0.55)' }}>
                                                {position ?? '—'}
                                            </td>
                                            {deptRoles.length > 0 && (
                                                <td style={tdStyle}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                        {deptRoles.map(role => {
                                                            const holds = m.departmentRoleIds.includes(String(role._id))
                                                            if (!holds && !canManage) return null
                                                            return (
                                                                <button
                                                                    key={String(role._id)}
                                                                    onClick={canManage ? () => handleToggleRole(m, role) : undefined}
                                                                    disabled={roleActionId === m.id}
                                                                    style={{
                                                                        fontSize: '0.6rem', fontWeight: 600, padding: '2px 8px',
                                                                        background: holds ? 'rgba(100,180,255,0.14)' : 'rgba(255,255,255,0.04)',
                                                                        border: `1px solid ${holds ? 'rgba(100,180,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                                                        color: holds ? 'rgba(100,180,255,0.9)' : 'rgba(237,237,237,0.3)',
                                                                        cursor: canManage ? 'pointer' : 'default',
                                                                        opacity: roleActionId === m.id ? 0.5 : 1,
                                                                    }}
                                                                >
                                                                    {role.name}
                                                                </button>
                                                            )
                                                        })}
                                                    </div>
                                                </td>
                                            )}
                                            {canManage && (
                                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                    <button
                                                        onClick={() => handleRemove(m)}
                                                        disabled={removingId === m.id}
                                                        style={{
                                                            fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em',
                                                            textTransform: 'uppercase', cursor: 'pointer',
                                                            color: removingId === m.id ? 'rgba(219,0,29,0.3)' : 'rgba(219,0,29,0.6)',
                                                            background: 'none', border: '1px solid rgba(219,0,29,0.32)',
                                                            padding: '3px 10px',
                                                        }}
                                                    >
                                                        {removingId === m.id ? '…' : 'Remove'}
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Add Member (leads only) */}
            {canManage && (
                <div style={cardStyle}>
                    <Typography style={labelStyle}>Add Member</Typography>
                    <div className='flex items-center gap-3'>
                        <Autocomplete
                            options={addOptions}
                            getOptionLabel={m => m.displayName}
                            isOptionEqualToValue={(o, v) => o.id === v.id}
                            value={selected}
                            onChange={(_, v) => setSelected(v)}
                            loading={loadingAll}
                            sx={{ flex: 1, maxWidth: 360, ...inputSx }}
                            renderOption={(props, m) => <li {...props} key={m.id}>{m.displayName}</li>}
                            renderInput={params => (
                                <TextField {...params} label='Search member' size='small' sx={inputSx} />
                            )}
                            size='small'
                        />
                        <button
                            onClick={handleAdd}
                            disabled={!selected || submitting}
                            style={{
                                fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                padding: '7px 20px', cursor: (!selected || submitting) ? 'not-allowed' : 'pointer',
                                background: (!selected || submitting) ? 'rgba(219,0,29,0.2)' : 'var(--red)',
                                border: '1px solid var(--red)', color: 'white',
                                transition: 'background 0.15s',
                                flexShrink: 0,
                            }}
                        >
                            {submitting ? '…' : '+ Add'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
