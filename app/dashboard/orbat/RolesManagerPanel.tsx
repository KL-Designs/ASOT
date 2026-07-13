'use client'

import { useState, useEffect, useCallback } from 'react'
import { Drawer, TextField, Button, IconButton, Checkbox, FormControlLabel, CircularProgress, Alert } from '@mui/material'
import { Close, Delete, Add } from '@mui/icons-material'
import { PLATOON_CATEGORIES } from '@/lib/orbat/constants'

interface GuildRole { id: string; name: string }

interface Props {
    open: boolean
    onClose: () => void
}

const inputSx = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem',
}

export default function RolesManagerPanel({ open, onClose }: Props) {
    const [roles, setRoles] = useState<OrbatRole[]>([])
    const [guildRoles, setGuildRoles] = useState<GuildRole[]>([])
    const [permissionKeys, setPermissionKeys] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [editingId, setEditingId] = useState<string | null>(null)   // '__new__' for the create form
    const [formName, setFormName] = useState('')
    const [formCategories, setFormCategories] = useState<string[]>([])
    const [formDiscordRoleIds, setFormDiscordRoleIds] = useState<string[]>([])
    const [formPermissions, setFormPermissions] = useState<string[]>([])

    const load = useCallback(async () => {
        setLoading(true)
        const [rolesRes, guildRolesRes, permKeysRes] = await Promise.all([
            fetch('/api/admin/orbat/roles').then(r => r.json()),
            fetch('/api/admin/orbat/discord-roles').then(r => r.json()),
            fetch('/api/admin/orbat/permission-keys').then(r => r.json()),
        ])
        setRoles(rolesRes.roles ?? [])
        setGuildRoles(guildRolesRes.roles ?? [])
        setPermissionKeys(permKeysRes.keys ?? [])
        setLoading(false)
    }, [])

    useEffect(() => { if (open) load() }, [open, load])

    function startCreate() {
        setEditingId('__new__')
        setFormName('')
        setFormCategories([])
        setFormDiscordRoleIds([])
        setFormPermissions([])
        setError(null)
    }

    function startEdit(role: OrbatRole) {
        setEditingId(String(role._id))
        setFormName(role.name)
        setFormCategories(role.categories)
        setFormDiscordRoleIds(role.discordRoleIds)
        setFormPermissions(role.permissions)
        setError(null)
    }

    async function save() {
        if (!formName.trim()) { setError('Name is required'); return }
        setError(null)
        const body = { name: formName.trim(), categories: formCategories, discordRoleIds: formDiscordRoleIds, permissions: formPermissions }

        const res = editingId === '__new__'
            ? await fetch('/api/admin/orbat/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            : await fetch(`/api/admin/orbat/roles/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setError(data.error ?? 'Save failed')
            return
        }
        setEditingId(null)
        await load()
    }

    async function remove(role: OrbatRole) {
        setError(null)
        const res = await fetch(`/api/admin/orbat/roles/${role._id}`, { method: 'DELETE' })
        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setError(data.inUseCount ? `In use by ${data.inUseCount} position(s) — reassign them first` : (data.error ?? 'Delete failed'))
            return
        }
        await load()
    }

    function toggleIn(arr: string[], setArr: (v: string[]) => void, value: string) {
        setArr(arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value])
    }

    return (
        <Drawer anchor='right' open={open} onClose={onClose} PaperProps={{ sx: { width: 420, background: '#0c0c0c', borderLeft: '1px solid rgba(219,0,29,0.3)' } }}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, height: '100%', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                        ORBAT Roles
                    </span>
                    <IconButton size='small' onClick={onClose}><Close sx={{ fontSize: 16, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
                </div>

                {error && <Alert severity='error' sx={{ fontSize: '0.72rem' }}>{error}</Alert>}

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><CircularProgress size={22} /></div>
                ) : editingId ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <TextField size='small' label='Name' value={formName} onChange={e => setFormName(e.target.value)} sx={inputSx} />

                        <div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>Categories (none = all)</div>
                            {PLATOON_CATEGORIES.map(c => (
                                <FormControlLabel key={c._id} sx={{ display: 'block', ml: 0 }}
                                    control={<Checkbox size='small' checked={formCategories.includes(c._id)} onChange={() => toggleIn(formCategories, setFormCategories, c._id)} />}
                                    label={<span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>{c.label}</span>}
                                />
                            ))}
                        </div>

                        <div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>Discord roles granted</div>
                            <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
                                {guildRoles.map(r => (
                                    <FormControlLabel key={r.id} sx={{ display: 'block', ml: 0, px: 1 }}
                                        control={<Checkbox size='small' checked={formDiscordRoleIds.includes(r.id)} onChange={() => toggleIn(formDiscordRoleIds, setFormDiscordRoleIds, r.id)} />}
                                        label={<span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>{r.name}</span>}
                                    />
                                ))}
                            </div>
                        </div>

                        <div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>Permissions granted</div>
                            <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
                                {permissionKeys.map(k => (
                                    <FormControlLabel key={k} sx={{ display: 'block', ml: 0, px: 1 }}
                                        control={<Checkbox size='small' checked={formPermissions.includes(k)} onChange={() => toggleIn(formPermissions, setFormPermissions, k)} />}
                                        label={<span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.6)', fontFamily: 'monospace' }}>{k}</span>}
                                    />
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <Button size='small' variant='outlined' onClick={save}>Save</Button>
                            <Button size='small' onClick={() => setEditingId(null)} sx={{ color: 'rgba(237,237,237,0.4)' }}>Cancel</Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <Button size='small' startIcon={<Add sx={{ fontSize: 14 }} />} onClick={startCreate} sx={{ alignSelf: 'flex-start', fontSize: '0.7rem' }}>
                            New Role
                        </Button>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {roles.map(role => (
                                <div key={String(role._id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <button onClick={() => startEdit(role)} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.75rem', color: 'rgba(237,237,237,0.85)' }}>
                                        {role.name}
                                    </button>
                                    <IconButton size='small' onClick={() => remove(role)}>
                                        <Delete sx={{ fontSize: 14, color: 'rgba(219,0,29,0.6)' }} />
                                    </IconButton>
                                </div>
                            ))}
                            {roles.length === 0 && <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>No Roles defined yet.</div>}
                        </div>
                    </>
                )}
            </div>
        </Drawer>
    )
}
