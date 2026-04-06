'use client'

import { useState, useEffect, useCallback } from 'react'
import { Autocomplete, TextField, Typography } from '@mui/material'
import TacticalSkeleton from '@/app/admin/_components/TacticalSkeleton'
import { rankNameFromAbbr } from '@/lib/ranks'

type MemberOption = { id: string; displayName: string; currentRank: string | null; teamLeadDepts: string[] }

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.82rem',
        '& fieldset': { borderColor: 'rgba(219,0,29,0.2)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.4)' },
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
}: {
    department: string
    displayName: string
    userId: string
    canManage: boolean
}) {
    const [deptMembers, setDeptMembers] = useState<MemberOption[]>([])
    const [allMembers, setAllMembers] = useState<MemberOption[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingAll, setLoadingAll] = useState(false)

    const [selected, setSelected] = useState<MemberOption | null>(null)
    const [selectedLead, setSelectedLead] = useState<MemberOption | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [removingId, setRemovingId] = useState<string | null>(null)
    const [leadActionId, setLeadActionId] = useState<string | null>(null)
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

    const fetchDeptMembers = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/members?department=${department}`)
            const data = await res.json()
            setDeptMembers(data.members ?? [])
        } finally {
            setLoading(false)
        }
    }, [department])

    useEffect(() => {
        fetchDeptMembers()
        if (canManage) {
            setLoadingAll(true)
            fetch('/api/admin/members?limit=1000')
                .then(r => r.json())
                .then(d => setAllMembers(d.members ?? []))
                .finally(() => setLoadingAll(false))
        }
    }, [fetchDeptMembers, canManage])

    function showFeedback(type: 'success' | 'error', msg: string) {
        setFeedback({ type, msg })
        setTimeout(() => setFeedback(null), 5000)
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

    async function handleSetLead() {
        if (!selectedLead) return
        setLeadActionId(selectedLead.id)
        try {
            await postMemberAction(selectedLead.id, selectedLead.displayName, 'set-lead')
            showFeedback('success', `${selectedLead.displayName} set as team lead.`)
            setSelectedLead(null)
            fetchDeptMembers()
        } catch (e: unknown) {
            showFeedback('error', e instanceof Error ? e.message : 'Failed to set team lead')
        } finally {
            setLeadActionId(null)
        }
    }

    async function handleRemoveLead(member: MemberOption) {
        setLeadActionId(member.id)
        try {
            await postMemberAction(member.id, member.displayName, 'remove-lead')
            showFeedback('success', `${member.displayName} removed as team lead.`)
            fetchDeptMembers()
        } catch (e: unknown) {
            showFeedback('error', e instanceof Error ? e.message : 'Failed to remove team lead')
        } finally {
            setLeadActionId(null)
        }
    }

    const teamLeads = deptMembers.filter(m => m.teamLeadDepts?.includes(department))
    const deptMemberIds = new Set(deptMembers.map(m => m.id))
    const addOptions = allMembers.filter(m => !deptMemberIds.has(m.id))
    // Can set as lead: current dept members not already a lead
    const setLeadOptions = deptMembers.filter(m => !m.teamLeadDepts?.includes(department))

    return (
        <div className='p-6 flex flex-col gap-5'>

            {/* Team Lead */}
            <div style={cardStyle}>
                <Typography style={labelStyle}>Team Lead</Typography>

                {feedback && (
                    <div style={{
                        marginBottom: 12,
                        padding: '8px 12px',
                        fontSize: '0.78rem',
                        background: feedback.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(219,0,29,0.08)',
                        border: `1px solid ${feedback.type === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(219,0,29,0.25)'}`,
                        color: feedback.type === 'success' ? 'rgba(34,197,94,0.9)' : 'rgba(219,0,29,0.9)',
                    }}>
                        {feedback.msg}
                    </div>
                )}

                {loading ? (
                    <TacticalSkeleton rows={3} />
                ) : teamLeads.length === 0 ? (
                    <Typography style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.3)', padding: '8px 0' }}>
                        No team lead assigned.
                    </Typography>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(219,0,29,0.3)' }}>
                                    <th style={thStyle}>Name</th>
                                    <th style={thStyle}>Rank</th>
                                    {canManage && <th style={{ ...thStyle, textAlign: 'right' }} />}
                                </tr>
                            </thead>
                            <tbody>
                                {teamLeads.map(m => (
                                    <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={tdStyle}>
                                            <span style={{ color: 'rgba(251,191,36,0.9)', marginRight: 6, fontSize: '0.75rem' }}>★</span>
                                            {m.displayName}
                                        </td>
                                        <td style={{ ...tdStyle, color: 'rgba(219,0,29,0.7)', fontSize: '0.72rem' }}>
                                            {m.currentRank ? rankNameFromAbbr(m.currentRank) : '—'}
                                        </td>
                                        {canManage && (
                                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => handleRemoveLead(m)}
                                                    disabled={leadActionId === m.id}
                                                    style={{
                                                        fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em',
                                                        textTransform: 'uppercase', cursor: 'pointer',
                                                        color: leadActionId === m.id ? 'rgba(251,191,36,0.3)' : 'rgba(251,191,36,0.7)',
                                                        background: 'none', border: '1px solid rgba(251,191,36,0.25)',
                                                        padding: '3px 10px',
                                                    }}
                                                >
                                                    {leadActionId === m.id ? '…' : 'Remove Lead'}
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {canManage && !loading && (
                    <div className='flex items-center gap-3 mt-4'>
                        <Autocomplete
                            options={setLeadOptions}
                            getOptionLabel={m => m.displayName}
                            isOptionEqualToValue={(o, v) => o.id === v.id}
                            value={selectedLead}
                            onChange={(_, v) => setSelectedLead(v)}
                            sx={{ flex: 1, maxWidth: 360, ...inputSx }}
                            renderOption={(props, m) => <li {...props} key={m.id}>{m.displayName}</li>}
                            renderInput={params => (
                                <TextField {...params} label='Set team lead' size='small' sx={inputSx} />
                            )}
                            size='small'
                            noOptionsText={deptMembers.length === 0 ? 'No department members' : 'All members are already leads'}
                        />
                        <button
                            onClick={handleSetLead}
                            disabled={!selectedLead || leadActionId !== null}
                            style={{
                                fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                padding: '7px 20px', cursor: (!selectedLead || leadActionId !== null) ? 'not-allowed' : 'pointer',
                                background: (!selectedLead || leadActionId !== null) ? 'rgba(251,191,36,0.15)' : 'rgba(251,191,36,0.8)',
                                border: '1px solid rgba(251,191,36,0.5)', color: leadActionId !== null ? 'rgba(0,0,0,0.4)' : '#000',
                                transition: 'background 0.15s',
                                flexShrink: 0,
                            }}
                        >
                            {leadActionId !== null ? '…' : '★ Set Lead'}
                        </button>
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
                                <tr style={{ borderBottom: '1px solid rgba(219,0,29,0.3)' }}>
                                    <th style={thStyle}>Name</th>
                                    <th style={thStyle}>Rank</th>
                                    {canManage && <th style={{ ...thStyle, textAlign: 'right' }} />}
                                </tr>
                            </thead>
                            <tbody>
                                {deptMembers.map(m => {
                                    const isLead = m.teamLeadDepts?.includes(department)
                                    return (
                                        <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <td style={tdStyle}>
                                                {isLead && (
                                                    <span style={{ color: 'rgba(251,191,36,0.8)', marginRight: 6, fontSize: '0.72rem' }}>★</span>
                                                )}
                                                {m.displayName}
                                            </td>
                                            <td style={{ ...tdStyle, color: 'rgba(219,0,29,0.7)', fontSize: '0.72rem' }}>
                                                {m.currentRank ? rankNameFromAbbr(m.currentRank) : '—'}
                                            </td>
                                            {canManage && (
                                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                    <button
                                                        onClick={() => handleRemove(m)}
                                                        disabled={removingId === m.id}
                                                        style={{
                                                            fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em',
                                                            textTransform: 'uppercase', cursor: 'pointer',
                                                            color: removingId === m.id ? 'rgba(219,0,29,0.3)' : 'rgba(219,0,29,0.6)',
                                                            background: 'none', border: '1px solid rgba(219,0,29,0.2)',
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
