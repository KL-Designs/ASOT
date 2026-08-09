'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    Dialog, DialogTitle, DialogContent, Divider, TextField, Button, IconButton,
    Checkbox, FormControlLabel, CircularProgress, Alert, Typography, Box, InputAdornment,
} from '@mui/material'
import { Close, Delete, Add, Search } from '@mui/icons-material'
import { PLATOON_CATEGORIES } from '@/lib/orbat/constants'
import ChainOfCommandPanel from './ChainOfCommandPanel'

interface GuildRole { id: string; name: string; color: number }

interface Props {
    open: boolean
    onClose: () => void
}

const inputSx = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem',
}

const searchFieldSx = {
    ...inputSx,
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
}

// Discord role colors are stored as decimal ints (0 = "no color" / default grey pill)
function discordColorHex(color: number): string | null {
    if (!color) return null
    return '#' + color.toString(16).padStart(6, '0')
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

    const [roleSearch, setRoleSearch] = useState('')
    const [discordSearch, setDiscordSearch] = useState('')
    const [permSearch, setPermSearch] = useState('')
    const [chainOpen, setChainOpen] = useState(false)

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
    useEffect(() => { if (!open) { setEditingId(null); setRoleSearch('') } }, [open])

    function startCreate() {
        setEditingId('__new__')
        setFormName('')
        setFormCategories([])
        setFormDiscordRoleIds([])
        setFormPermissions([])
        setDiscordSearch('')
        setPermSearch('')
        setError(null)
    }

    function startEdit(role: OrbatRole) {
        setEditingId(String(role._id))
        setFormName(role.name)
        setFormCategories(role.categories)
        setFormDiscordRoleIds(role.discordRoleIds)
        setFormPermissions(role.permissions)
        setDiscordSearch('')
        setPermSearch('')
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
        if (editingId === String(role._id)) setEditingId(null)
        await load()
    }

    function toggleIn(arr: string[], setArr: (v: string[]) => void, value: string) {
        setArr(arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value])
    }

    const filteredRoles = useMemo(
        () => roles.filter(r => r.name.toLowerCase().includes(roleSearch.trim().toLowerCase())),
        [roles, roleSearch],
    )
    const filteredGuildRoles = useMemo(
        () => guildRoles.filter(r => r.name.toLowerCase().includes(discordSearch.trim().toLowerCase())),
        [guildRoles, discordSearch],
    )
    const filteredPermissionKeys = useMemo(
        () => permissionKeys.filter(k => k.toLowerCase().includes(permSearch.trim().toLowerCase())),
        [permissionKeys, permSearch],
    )
    // Keys are already alphabetically sorted dot-paths (e.g. "admin.manageOrbat"), so same-prefix
    // keys are contiguous — a single pass is enough to mark where each group's header goes.
    const permissionRows = useMemo(() => {
        let lastGroup = ''
        return filteredPermissionKeys.map(key => {
            const group = key.split('.')[0]
            const showHeader = group !== lastGroup
            lastGroup = group
            return { key, group, showHeader }
        })
    }, [filteredPermissionKeys])

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth='lg'
            fullWidth
            PaperProps={{
                style: {
                    background: 'var(--background, #0a0a0a)',
                    border: '1px solid rgba(219,0,29,0.32)',
                    borderTop: '2px solid var(--red)',
                    height: '85vh',
                },
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                <div>
                    <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} sx={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', mb: 0.5 }}>
                        ORBAT Administration
                    </Typography>
                    <Typography fontWeight={700} fontSize='0.95rem' letterSpacing={3} sx={{ textTransform: 'uppercase' }}>
                        Roles Manager
                    </Typography>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Button size='small' variant='outlined' onClick={() => setChainOpen(true)}
                        sx={{ fontSize: '0.65rem', letterSpacing: 1, borderColor: 'rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.85)' }}>
                        Chain of Command
                    </Button>
                    <IconButton size='small' onClick={onClose}><Close sx={{ fontSize: 18, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
                </div>
            </DialogTitle>

            <Divider sx={{ borderColor: 'rgba(219,0,29,0.42)' }} />

            {error && <Alert severity='error' sx={{ fontSize: '0.72rem', borderRadius: 0 }}>{error}</Alert>}

            <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden', flex: 1 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                        <CircularProgress size={26} />
                    </Box>
                ) : (
                    <>
                        {/* Left: role list */}
                        <Box sx={{ width: 300, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column' }}>
                            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                <Button size='small' variant='outlined' startIcon={<Add sx={{ fontSize: 14 }} />} onClick={startCreate}
                                    sx={{ fontSize: '0.7rem', letterSpacing: 1, borderColor: 'rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.85)' }}>
                                    New Role
                                </Button>
                                <TextField
                                    size='small' placeholder='Search roles…' value={roleSearch} onChange={e => setRoleSearch(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                    sx={searchFieldSx}
                                />
                            </Box>
                            <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 1 }}>
                                {filteredRoles.map(role => {
                                    const selected = editingId === String(role._id)
                                    return (
                                        <Box key={String(role._id)} onClick={() => startEdit(role)} sx={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '8px 10px', mb: 0.5, cursor: 'pointer',
                                            background: selected ? 'rgba(219,0,29,0.12)' : 'transparent',
                                            border: selected ? '1px solid rgba(219,0,29,0.4)' : '1px solid transparent',
                                            '&:hover': { background: selected ? 'rgba(219,0,29,0.12)' : 'rgba(255,255,255,0.04)' },
                                        }}>
                                            <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.85)' }}>{role.name}</span>
                                            <IconButton size='small' onClick={e => { e.stopPropagation(); remove(role) }}>
                                                <Delete sx={{ fontSize: 14, color: 'rgba(219,0,29,0.6)' }} />
                                            </IconButton>
                                        </Box>
                                    )
                                })}
                                {filteredRoles.length === 0 && (
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', padding: '8px 10px' }}>
                                        {roles.length === 0 ? 'No roles defined yet.' : 'No roles match your search.'}
                                    </div>
                                )}
                            </Box>
                        </Box>

                        {/* Right: editor */}
                        <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
                            {!editingId ? (
                                <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Typography sx={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic' }}>
                                        Select a role to edit, or create a new one.
                                    </Typography>
                                </Box>
                            ) : (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 640 }}>
                                    <TextField size='small' label='Name' value={formName} onChange={e => setFormName(e.target.value)} sx={inputSx} />

                                    <div>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>
                                            Categories (none = all)
                                        </div>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                                            {PLATOON_CATEGORIES.map(c => (
                                                <FormControlLabel key={c._id} sx={{ width: '48%', ml: 0 }}
                                                    control={<Checkbox size='small' checked={formCategories.includes(c._id)} onChange={() => toggleIn(formCategories, setFormCategories, c._id)} />}
                                                    label={<span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>{c.label}</span>}
                                                />
                                            ))}
                                        </Box>
                                    </div>

                                    <div>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>
                                            Discord roles granted {formDiscordRoleIds.length > 0 && `(${formDiscordRoleIds.length} selected)`}
                                        </div>
                                        <TextField
                                            size='small' fullWidth placeholder='Search discord roles…' value={discordSearch} onChange={e => setDiscordSearch(e.target.value)}
                                            InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                            sx={{ ...searchFieldSx, mb: 1 }}
                                        />
                                        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
                                            {filteredGuildRoles.map(r => {
                                                const hex = discordColorHex(r.color)
                                                return (
                                                    <FormControlLabel key={r.id} sx={{ display: 'flex', ml: 0, px: 1 }}
                                                        control={<Checkbox size='small' checked={formDiscordRoleIds.includes(r.id)} onChange={() => toggleIn(formDiscordRoleIds, setFormDiscordRoleIds, r.id)} />}
                                                        label={
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>
                                                                <span style={{
                                                                    width: 9, height: 9, borderRadius: '50%', marginRight: 7, flexShrink: 0,
                                                                    background: hex ?? 'rgba(255,255,255,0.2)',
                                                                    border: hex ? 'none' : '1px solid rgba(255,255,255,0.3)',
                                                                }} />
                                                                {r.name}
                                                            </span>
                                                        }
                                                    />
                                                )
                                            })}
                                            {filteredGuildRoles.length === 0 && (
                                                <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', padding: '8px' }}>No matching Discord roles.</div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 6 }}>
                                            Permissions granted {formPermissions.length > 0 && `(${formPermissions.length} selected)`}
                                        </div>
                                        <TextField
                                            size='small' fullWidth placeholder='Search permissions…' value={permSearch} onChange={e => setPermSearch(e.target.value)}
                                            InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                            sx={{ ...searchFieldSx, mb: 1 }}
                                        />
                                        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
                                            {permissionRows.map(({ key, group, showHeader }) => (
                                                <div key={key}>
                                                    {showHeader && (
                                                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', padding: '6px 8px 2px' }}>
                                                            {group}
                                                        </div>
                                                    )}
                                                    <FormControlLabel sx={{ display: 'block', ml: 0, px: 1 }}
                                                        control={<Checkbox size='small' checked={formPermissions.includes(key)} onChange={() => toggleIn(formPermissions, setFormPermissions, key)} />}
                                                        label={<span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.6)', fontFamily: 'monospace' }}>{key}</span>}
                                                    />
                                                </div>
                                            ))}
                                            {permissionRows.length === 0 && (
                                                <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', padding: '8px' }}>No matching permissions.</div>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <Button size='small' variant='outlined' onClick={save}
                                            sx={{ borderColor: 'rgba(219,0,29,0.5)', color: 'rgba(237,237,237,0.9)' }}>
                                            Save
                                        </Button>
                                        <Button size='small' onClick={() => setEditingId(null)} sx={{ color: 'rgba(237,237,237,0.4)' }}>Cancel</Button>
                                    </div>
                                </Box>
                            )}
                        </Box>
                    </>
                )}
            </DialogContent>

            <ChainOfCommandPanel open={chainOpen} onClose={() => setChainOpen(false)} />
        </Dialog>
    )
}
