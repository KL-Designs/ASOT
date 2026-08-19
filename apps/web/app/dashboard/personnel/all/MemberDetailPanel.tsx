'use client'

import { useState, useEffect, useCallback } from 'react'
import MilpacEditor from '@/app/members/[username]/MilpacEditor'
import { DEPT_CODES } from '@/lib/discord/dept-codes'
import {
    Badge, Button, Chip, ChipRow, ConfirmDialog, DashIcons,
    Field, Input, Panel, PanelBody, PanelHeader, SectionLabel, Select, Switch, Textarea,
} from '@/components/dashboard'
import s from '@/styles/dashboard.module.css'

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

    // J4 — delete. ConfirmDialog holds the typed word itself, so there is no
    // second copy of it to keep in step here.
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

    // J4 — department leader-role ids, keyed by department code (for the ★ badge)
    const [leaderRoleIdByDept, setLeaderRoleIdByDept] = useState<Record<string, string>>({})

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

    // J4 — resolve each department's linked leader role, once per mount, so the
    // ★ badge below reflects DepartmentRole holdings rather than the frozen
    // legacy teamLeadDepts array. Fetched per-department (rather than the
    // unfiltered, J4-only GET /api/admin/department-roles) since that's the
    // gate this per-department form of the endpoint honors more permissively
    // (J4, OR that department's lead, OR that department's plain member) —
    // this stays correct even though every current caller happens to pass
    // isJ4 for this whole admin panel.
    useEffect(() => {
        if (!isJ4) return
        let cancelled = false
        Promise.all(
            DEPT_CODES.map(dept =>
                fetch(`/api/admin/department-roles?department=${dept}`)
                    .then(res => res.ok ? res.json() : { roles: [] })
                    .then(data => ({ dept, roles: (data.roles ?? []) as DepartmentRole[] }))
                    .catch(() => ({ dept, roles: [] as DepartmentRole[] }))
            )
        ).then(results => {
            if (cancelled) return
            const map: Record<string, string> = {}
            for (const { dept, roles } of results) {
                const leaderRole = roles.find(r => r.linkedSlot === 'leader')
                if (leaderRole) map[dept] = String(leaderRole._id)
            }
            setLeaderRoleIdByDept(map)
        })
        return () => { cancelled = true }
    }, [isJ4])

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
                /*
                   Every card in this drawer was outlined in the same red, so
                   "edit display name" and "delete this account permanently"
                   carried identical weight. Section labels separate them and
                   only the last one keeps the colour.
                */
                <div className={s.dash} style={{ flexShrink: 0, borderTop: '1px solid var(--line-2)' }}>

                    <button
                        onClick={() => setJ4Open(o => !o)}
                        aria-expanded={j4Open}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
                            padding: '9px 24px', background: j4Open ? 'var(--ink-2)' : 'var(--ink-1)',
                            border: 'none', cursor: 'pointer',
                        }}
                    >
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--txt-3)' }}>
                            J4 Administration
                        </span>
                        <span style={{ display: 'inline-flex', color: 'var(--txt-4)', transform: j4Open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                            <DashIcons.ChevronDown />
                        </span>
                    </button>

                    {j4Open && (
                    <div style={{ maxHeight: 460, overflowY: 'auto', padding: '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>

                        {/* ---- Display name ---------------------------------- */}
                        <div className='flex flex-col gap-3'>
                            <SectionLabel>Display name</SectionLabel>
                            {!nameEditMode ? (
                                <div className='flex items-center gap-3 flex-wrap'>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px', color: memberData.name ? 'var(--txt-1)' : 'var(--txt-4)' }}>
                                        {memberData.name || 'not set — uses Discord nickname'}
                                    </span>
                                    <Button variant='subtle' size='sm' onClick={() => { setNameEditMode(true); setNameEditValue(memberData.name ?? '') }}>
                                        Edit
                                    </Button>
                                </div>
                            ) : (
                                <div className='flex flex-col gap-3' style={{ maxWidth: 380 }}>
                                    <Field
                                        hint={<>Discord nickname becomes <b>{memberData.milpac?.currentRank ? `${memberData.milpac.currentRank} ${nameEditValue.trim() || '…'}` : (nameEditValue.trim() || '…')}</b></>}
                                    >
                                        <Input
                                            value={nameEditValue}
                                            onChange={e => setNameEditValue(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') { setNameEditMode(false); setNameEditError(null) } }}
                                            autoFocus
                                        />
                                    </Field>
                                    {nameEditError && <Badge tone='alert' dot>{nameEditError}</Badge>}
                                    <div className='flex gap-2'>
                                        <Button variant='primary' size='sm' disabled={nameSaving || !nameEditValue.trim()} onClick={handleNameSave}>
                                            {nameSaving ? 'Saving…' : 'Save'}
                                        </Button>
                                        <Button variant='subtle' size='sm' onClick={() => { setNameEditMode(false); setNameEditError(null) }}>Cancel</Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ---- Chaplain -------------------------------------- */}
                        <div className='flex flex-col gap-3'>
                            <SectionLabel>Chaplain</SectionLabel>
                            <div className='flex items-center gap-3'>
                                <Switch
                                    on={!!memberData.isChaplain}
                                    onChange={() => { if (!chaplainSaving) handleChaplainToggle() }}
                                    label='Chaplain'
                                />
                                <span style={{ fontSize: 13, color: memberData.isChaplain ? 'var(--txt-1)' : 'var(--txt-3)' }}>
                                    {memberData.isChaplain ? 'Chaplain [✞]' : 'Not a chaplain'}
                                </span>
                            </div>
                            <span className={s.hint}>Grants the ASOT Chaplain role and adds [✞] to their Discord nickname.</span>
                        </div>

                        {/* ---- Departments ----------------------------------- */}
                        <div className='flex flex-col gap-3'>
                            <SectionLabel>Departments</SectionLabel>
                            <ChipRow>
                                {DEPT_CODES.map(dept => {
                                    const isMember = (memberData.departments ?? []).includes(dept)
                                    const leaderRoleId = leaderRoleIdByDept[dept]
                                    const isLead = !!leaderRoleId && (memberData.departmentRoleIds ?? []).map(String).includes(leaderRoleId)
                                    return (
                                        <Chip
                                            key={dept}
                                            on={isMember}
                                            tone={isLead ? 'amber' : 'info'}
                                            disabled={deptToggling === dept}
                                            title={isMember ? `Remove from ${dept.toUpperCase()}` : `Add to ${dept.toUpperCase()}`}
                                            onClick={() => handleDeptToggle(dept, isMember ? 'remove' : 'add')}
                                        >
                                            {dept}{isLead ? ' ★' : ''}
                                        </Chip>
                                    )
                                })}
                            </ChipRow>
                            <span className={s.hint}>
                                Click to add or remove. ★ marks a department leader, set from the Department Leadership card on that department&apos;s settings page.
                            </span>
                        </div>

                        {/* ---- Discord roles --------------------------------- */}
                        <div className='flex flex-col gap-3'>
                            <SectionLabel>Discord roles</SectionLabel>
                            {rolesLoading && <span className={s.hint}>Loading…</span>}
                            {rolesError && <Badge tone='alert' dot>{rolesError}</Badge>}
                            {discordRoles && (
                                <>
                                    <ChipRow>
                                        {discordRoles.memberRoleIds.length === 0 && (
                                            <span className={s.hint}>No roles assigned</span>
                                        )}
                                        {discordRoles.allRoles
                                            .filter(r => discordRoles.memberRoleIds.includes(r.id) && r.name !== '@everyone')
                                            .map(role => {
                                                // Discord's own colour is the data here, so these
                                                // keep it rather than taking a kit tone.
                                                const color = roleColor(role.color)
                                                return (
                                                    <span
                                                        key={role.id}
                                                        className={s.chip}
                                                        style={{ borderColor: `${color}44`, color, textTransform: 'none', letterSpacing: '.04em', fontSize: '11px' }}
                                                    >
                                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                                        {role.name}
                                                        <button
                                                            onClick={() => handleRoleToggle(role.id, 'remove')}
                                                            disabled={roleToggling === role.id}
                                                            aria-label={`Remove ${role.name}`}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-4)', padding: 0, marginLeft: 2, display: 'inline-flex' }}
                                                        >
                                                            <DashIcons.Close />
                                                        </button>
                                                    </span>
                                                )
                                            })}
                                    </ChipRow>

                                    <Input
                                        value={roleSearchQuery}
                                        onChange={e => setRoleSearchQuery(e.target.value)}
                                        placeholder='Search roles to add…'
                                        style={{ maxWidth: 280 }}
                                    />
                                    {roleSearchQuery.trim() && (() => {
                                        const matches = discordRoles.allRoles.filter(r =>
                                            !discordRoles.memberRoleIds.includes(r.id)
                                            && r.name !== '@everyone'
                                            && r.name.toLowerCase().includes(roleSearchQuery.toLowerCase()))
                                        return (
                                            <div style={{ maxWidth: 280, maxHeight: 170, overflowY: 'auto', background: 'var(--ink-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--r)' }}>
                                                {matches.length === 0 && <div className={s.hint} style={{ padding: '8px 10px' }}>No roles match</div>}
                                                {matches.slice(0, 12).map(role => {
                                                    const color = roleColor(role.color)
                                                    return (
                                                        <button
                                                            key={role.id}
                                                            onClick={() => handleRoleToggle(role.id, 'add')}
                                                            disabled={roleToggling === role.id}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                                                padding: '6px 10px', background: 'none', border: 'none',
                                                                borderBottom: '1px solid var(--line-1)', textAlign: 'left',
                                                                color, fontSize: '12px',
                                                                cursor: roleToggling === role.id ? 'default' : 'pointer',
                                                                opacity: roleToggling === role.id ? 0.4 : 1,
                                                            }}
                                                        >
                                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                                            {role.name}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )
                                    })()}
                                </>
                            )}
                        </div>

                        {/* ---- Danger zone ----------------------------------- */}
                        <Panel tone='alert'>
                            <PanelHeader
                                title='Danger zone'
                                sub='Both actions change this member&rsquo;s standing. One of them is final.'
                            />
                            <PanelBody className='flex flex-col gap-4'>

                                {dischargeSuccess ? (
                                    <Badge tone='live' dot>{dischargeSuccess}</Badge>
                                ) : dischargeStage === 'idle' ? (
                                    <div className='flex items-center gap-3 flex-wrap'>
                                        <Button variant='danger' size='sm' onClick={() => setDischargeStage('form')}>Discharge member</Button>
                                        <span className={s.hint}>Files a request — a J4 has to approve it.</span>
                                    </div>
                                ) : (
                                    <div className='flex flex-col gap-3' style={{ maxWidth: 440 }}>
                                        <Field label='Discharge type'>
                                            <Select value={dischargeType} onChange={e => setDischargeType(e.target.value as typeof dischargeType)}>
                                                <option value=''>Select…</option>
                                                <option value='honorable'>Honorable discharge</option>
                                                <option value='general'>General discharge</option>
                                                <option value='dishonorable'>Dishonorable discharge</option>
                                            </Select>
                                        </Field>
                                        <Field label='Reason' hint='Required. Goes on the discharge ticket.'>
                                            <Textarea rows={3} value={dischargeReason} onChange={e => setDischargeReason(e.target.value)} />
                                        </Field>
                                        <Field label='Notes'>
                                            <Textarea rows={2} value={dischargeNotes} onChange={e => setDischargeNotes(e.target.value)} placeholder='Optional' />
                                        </Field>
                                        {dischargeError && <Badge tone='alert' dot>{dischargeError}</Badge>}
                                        <div className='flex gap-2'>
                                            <Button
                                                variant='danger'
                                                size='sm'
                                                disabled={dischargeSubmitting || !dischargeType || !dischargeReason.trim()}
                                                onClick={handleDischargeMember}
                                            >
                                                {dischargeSubmitting ? 'Submitting…' : 'Submit discharge request'}
                                            </Button>
                                            <Button
                                                variant='subtle'
                                                size='sm'
                                                onClick={() => { setDischargeStage('idle'); setDischargeType(''); setDischargeReason(''); setDischargeNotes(''); setDischargeError(null) }}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                <div className='flex items-center gap-3 flex-wrap'>
                                    <Button variant='danger' size='sm' onClick={() => setDeleteStage('confirm')}>Delete member account</Button>
                                    <span className={s.hint}>Removes the record outright. Discharge is what you want in almost every case.</span>
                                </div>

                            </PanelBody>
                        </Panel>

                    </div>
                    )}

                    <ConfirmDialog
                        open={deleteStage === 'confirm'}
                        title='Delete member account'
                        confirmWord={memberData.username}
                        confirmLabel={deleting ? 'Deleting…' : 'Delete account'}
                        warning={<>Everything on {displayName}&apos;s record goes with it — milpac, awards, attendance and promotion history. There is no recycle bin behind this.</>}
                        onConfirm={handleDeleteMember}
                        onCancel={() => setDeleteStage('idle')}
                    >
                        <p style={{ fontSize: 13, color: 'var(--txt-2)' }}>
                            Permanently delete <b>{displayName}</b> from the database.
                        </p>
                    </ConfirmDialog>
                </div>
            )}
        </>
    )
}
