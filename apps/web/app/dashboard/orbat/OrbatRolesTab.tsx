'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    TextField, Button, IconButton,
    Checkbox, FormControlLabel, CircularProgress, Alert, Typography, Box, InputAdornment, Tooltip,
} from '@mui/material'
import { ContentCopy, ContentPaste, Delete, Add, Search } from '@mui/icons-material'
import { PLATOON_CATEGORIES } from '@/lib/orbat/constants'

interface GuildRole { id: string; name: string; color: number }
interface TsGroup { id: number; name: string }

const inputSx = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem',
}

const searchFieldSx = {
    ...inputSx,
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
}

const closeButtonSx = { '&:hover': { background: 'rgba(255,255,255,0.08)' } }

const sectionHeaderSx = { fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' } as const

// Discord role colors are stored as decimal ints (0 = "no color" / default grey pill)
function discordColorHex(color: number): string | null {
    if (!color) return null
    return '#' + color.toString(16).padStart(6, '0')
}

// Order-independent — toggling checkboxes can append/remove without preserving
// the original array's order, so a strict equality check would false-positive as dirty.
function sameMembers<T>(a: T[], b: T[]): boolean {
    return a.length === b.length && a.every(x => b.includes(x))
}

function CopyPasteButtons({ onCopy, onPaste, canPaste, label }: { onCopy: () => void; onPaste: () => void; canPaste: boolean; label: string }) {
    return (
        <span style={{ display: 'inline-flex', gap: 2 }}>
            <Tooltip title={`Copy ${label}`}>
                <IconButton size='small' onClick={onCopy} sx={{ p: 0.4, ...closeButtonSx }}>
                    <ContentCopy sx={{ fontSize: 13, color: 'rgba(237,237,237,0.4)' }} />
                </IconButton>
            </Tooltip>
            <Tooltip title={canPaste ? `Paste ${label}` : `Copy ${label} from another role first`}>
                <span>
                    <IconButton size='small' onClick={onPaste} disabled={!canPaste} sx={{ p: 0.4, ...closeButtonSx }}>
                        <ContentPaste sx={{ fontSize: 13, color: canPaste ? 'rgba(100,180,255,0.75)' : 'rgba(237,237,237,0.15)' }} />
                    </IconButton>
                </span>
            </Tooltip>
        </span>
    )
}

export default function OrbatRolesTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const [roles, setRoles] = useState<OrbatRole[]>([])
    const [guildRoles, setGuildRoles] = useState<GuildRole[]>([])
    const [tsGroups, setTsGroups] = useState<TsGroup[]>([])
    const [permissionKeys, setPermissionKeys] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [editingId, setEditingId] = useState<string | null>(null)   // '__new__' for the create form
    const [formName, setFormName] = useState('')
    const [formCategories, setFormCategories] = useState<string[]>([])
    const [formDiscordRoleIds, setFormDiscordRoleIds] = useState<string[]>([])
    const [formTsGroupIds, setFormTsGroupIds] = useState<number[]>([])
    const [formPermissions, setFormPermissions] = useState<string[]>([])
    const [formTag, setFormTag] = useState('')
    const [confirmingDelete, setConfirmingDelete] = useState(false)

    const [roleSearch, setRoleSearch] = useState('')
    const [discordSearch, setDiscordSearch] = useState('')
    const [tsSearch, setTsSearch] = useState('')
    const [permSearch, setPermSearch] = useState('')

    const [categoriesClipboard, setCategoriesClipboard] = useState<string[] | null>(null)
    const [discordRoleIdsClipboard, setDiscordRoleIdsClipboard] = useState<string[] | null>(null)
    const [tsGroupIdsClipboard, setTsGroupIdsClipboard] = useState<number[] | null>(null)
    const [permissionsClipboard, setPermissionsClipboard] = useState<string[] | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const [rolesRes, guildRolesRes, tsGroupsRes, permKeysRes] = await Promise.all([
            fetch('/api/admin/orbat/roles').then(r => r.json()),
            fetch('/api/admin/orbat/discord-roles').then(r => r.json()),
            fetch('/api/teamspeak/groups').then(r => r.json()).catch(() => ({})),
            fetch('/api/admin/orbat/permission-keys').then(r => r.json()),
        ])
        setRoles(rolesRes.roles ?? [])
        setGuildRoles(guildRolesRes.roles ?? [])
        setTsGroups(tsGroupsRes.groups ?? [])
        setPermissionKeys(permKeysRes.keys ?? [])
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    const dirty = useMemo(() => {
        if (!editingId) return false
        if (editingId === '__new__') {
            return formName.trim() !== '' || formTag.trim() !== '' || formCategories.length > 0 || formDiscordRoleIds.length > 0 || formTsGroupIds.length > 0 || formPermissions.length > 0
        }
        const original = roles.find(r => String(r._id) === editingId)
        if (!original) return false
        return formName.trim() !== original.name
            || formTag.trim() !== (original.tag ?? '')
            || !sameMembers(formCategories, original.categories)
            || !sameMembers(formDiscordRoleIds, original.discordRoleIds)
            || !sameMembers(formTsGroupIds, original.tsGroupIds ?? [])
            || !sameMembers(formPermissions, original.permissions)
    }, [editingId, formName, formTag, formCategories, formDiscordRoleIds, formTsGroupIds, formPermissions, roles])

    useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])

    function confirmDiscardIfDirty(message: string): boolean {
        return !dirty || window.confirm(message)
    }

    function startCreate() {
        if (editingId === '__new__') return
        if (!confirmDiscardIfDirty('You have unsaved changes. Discard them and create a new role?')) return
        setEditingId('__new__')
        setFormName('')
        setFormCategories([])
        setFormDiscordRoleIds([])
        setFormTsGroupIds([])
        setFormPermissions([])
        setFormTag('')
        setDiscordSearch('')
        setTsSearch('')
        setPermSearch('')
        setError(null)
        setConfirmingDelete(false)
    }

    function startEdit(role: OrbatRole) {
        if (editingId === String(role._id)) return
        if (!confirmDiscardIfDirty('You have unsaved changes. Discard them and switch role?')) return
        setEditingId(String(role._id))
        setFormName(role.name)
        setFormCategories(role.categories)
        setFormDiscordRoleIds(role.discordRoleIds)
        setFormTsGroupIds(role.tsGroupIds ?? [])
        setFormPermissions(role.permissions)
        setFormTag(role.tag ?? '')
        setDiscordSearch('')
        setTsSearch('')
        setPermSearch('')
        setError(null)
        setConfirmingDelete(false)
    }

    function discard() {
        setEditingId(null)
        setError(null)
        setConfirmingDelete(false)
    }

    function copyCategories() { setCategoriesClipboard(formCategories) }
    function pasteCategories() { if (categoriesClipboard) setFormCategories(categoriesClipboard) }
    function copyDiscordRoleIds() { setDiscordRoleIdsClipboard(formDiscordRoleIds) }
    function pasteDiscordRoleIds() { if (discordRoleIdsClipboard) setFormDiscordRoleIds(discordRoleIdsClipboard) }
    function copyTsGroupIds() { setTsGroupIdsClipboard(formTsGroupIds) }
    function pasteTsGroupIds() { if (tsGroupIdsClipboard) setFormTsGroupIds(tsGroupIdsClipboard) }
    function copyPermissions() { setPermissionsClipboard(formPermissions) }
    function pastePermissions() { if (permissionsClipboard) setFormPermissions(permissionsClipboard) }

    function copySettings() {
        copyCategories()
        copyDiscordRoleIds()
        copyTsGroupIds()
        copyPermissions()
    }
    function pasteSettings() {
        pasteCategories()
        pasteDiscordRoleIds()
        pasteTsGroupIds()
        pastePermissions()
    }
    const hasClipboard = categoriesClipboard !== null || discordRoleIdsClipboard !== null || tsGroupIdsClipboard !== null || permissionsClipboard !== null

    async function save() {
        if (!formName.trim()) { setError('Name is required'); return }
        setError(null)
        const body = { name: formName.trim(), categories: formCategories, discordRoleIds: formDiscordRoleIds, tsGroupIds: formTsGroupIds, permissions: formPermissions, tag: formTag }

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

    function toggleIn<T>(arr: T[], setArr: (v: T[]) => void, value: T) {
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
    const filteredTsGroups = useMemo(
        () => tsGroups.filter(g => g.name.toLowerCase().includes(tsSearch.trim().toLowerCase())),
        [tsGroups, tsSearch],
    )
    const filteredPermissionKeys = useMemo(
        () => permissionKeys.filter(k => k.toLowerCase().includes(permSearch.trim().toLowerCase())),
        [permissionKeys, permSearch],
    )
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
        <>
            {error && <Alert severity='error' sx={{ fontSize: '0.72rem', borderRadius: 0 }}>{error}</Alert>}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                    <CircularProgress size={26} />
                </Box>
            ) : (
                <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
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
                                        display: 'flex', alignItems: 'center',
                                        padding: '8px 10px', mb: 0.5, cursor: 'pointer',
                                        background: selected ? 'rgba(219,0,29,0.12)' : 'transparent',
                                        border: selected ? '1px solid rgba(219,0,29,0.4)' : '1px solid transparent',
                                        '&:hover': { background: selected ? 'rgba(219,0,29,0.12)' : 'rgba(255,255,255,0.04)' },
                                    }}>
                                        <span style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.85)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{role.name}</span>
                                            {role.tag && (
                                                <span style={{ flexShrink: 0, fontSize: '0.55rem', fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'rgba(219,0,29,0.14)', color: 'rgba(219,0,29,0.85)' }}>
                                                    {role.tag}
                                                </span>
                                            )}
                                        </span>
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
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {!editingId ? (
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Typography sx={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic' }}>
                                    Select a role to edit, or create a new one.
                                </Typography>
                            </Box>
                        ) : (
                            <>
                                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 3 }}>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 1400, flex: 1, minHeight: 0 }}>
                                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', flexShrink: 0 }}>
                                            <TextField size='small' label='Name' value={formName} onChange={e => setFormName(e.target.value)} sx={{ ...inputSx, flex: '1 1 260px' }} />
                                            <div>
                                                <TextField
                                                    size='small' label='Tag (optional)' value={formTag} onChange={e => setFormTag(e.target.value)}
                                                    inputProps={{ maxLength: 12 }} sx={{ ...inputSx, width: 200 }}
                                                />
                                                <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.35)', marginTop: 4 }}>
                                                    Distinguishes roles sharing this name — never shown publicly.
                                                </div>
                                            </div>
                                        </Box>

                                        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                                            <Button size='small' variant='outlined' startIcon={<ContentCopy sx={{ fontSize: 14 }} />} onClick={copySettings}
                                                sx={{ fontSize: '0.65rem', letterSpacing: 0.5, borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.7)' }}>
                                                Copy Settings
                                            </Button>
                                            <Button size='small' variant='outlined' startIcon={<ContentPaste sx={{ fontSize: 14 }} />} onClick={pasteSettings} disabled={!hasClipboard}
                                                sx={{ fontSize: '0.65rem', letterSpacing: 0.5, borderColor: 'rgba(100,180,255,0.4)', color: 'rgba(100,180,255,0.85)' }}>
                                                Paste Settings
                                            </Button>
                                        </Box>

                                        <Box sx={{ display: 'flex', gap: 3, flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
                                            <div style={{ flex: '0 0 240px', minWidth: 240, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <div style={sectionHeaderSx}>Categories (none = all)</div>
                                                    <CopyPasteButtons onCopy={copyCategories} onPaste={pasteCategories} canPaste={categoriesClipboard !== null} label='categories' />
                                                </div>
                                                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                    {PLATOON_CATEGORIES.map(c => (
                                                        <FormControlLabel key={c._id} sx={{ ml: 0, whiteSpace: 'nowrap' }}
                                                            control={<Checkbox size='small' checked={formCategories.includes(c._id)} onChange={() => toggleIn(formCategories, setFormCategories, c._id)} />}
                                                            label={<span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>{c.label}</span>}
                                                        />
                                                    ))}
                                                </Box>
                                            </div>

                                            <div style={{ flex: '1 0 260px', minWidth: 260, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <div style={sectionHeaderSx}>Discord roles granted {formDiscordRoleIds.length > 0 && `(${formDiscordRoleIds.length} selected)`}</div>
                                                    <CopyPasteButtons onCopy={copyDiscordRoleIds} onPaste={pasteDiscordRoleIds} canPaste={discordRoleIdsClipboard !== null} label='Discord roles' />
                                                </div>
                                                <TextField
                                                    size='small' fullWidth placeholder='Search discord roles…' value={discordSearch} onChange={e => setDiscordSearch(e.target.value)}
                                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                                    sx={{ ...searchFieldSx, mb: 1, flexShrink: 0 }}
                                                />
                                                <div style={{ flex: 1, minHeight: 120, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
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

                                            <div style={{ flex: '1 0 260px', minWidth: 260, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <div style={sectionHeaderSx}>TeamSpeak roles granted {formTsGroupIds.length > 0 && `(${formTsGroupIds.length} selected)`}</div>
                                                    <CopyPasteButtons onCopy={copyTsGroupIds} onPaste={pasteTsGroupIds} canPaste={tsGroupIdsClipboard !== null} label='TeamSpeak roles' />
                                                </div>
                                                <TextField
                                                    size='small' fullWidth placeholder='Search TeamSpeak roles…' value={tsSearch} onChange={e => setTsSearch(e.target.value)}
                                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                                    sx={{ ...searchFieldSx, mb: 1, flexShrink: 0 }}
                                                />
                                                <div style={{ flex: 1, minHeight: 120, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
                                                    {filteredTsGroups.map(g => (
                                                        <FormControlLabel key={g.id} sx={{ display: 'flex', ml: 0, px: 1 }}
                                                            control={<Checkbox size='small' checked={formTsGroupIds.includes(g.id)} onChange={() => toggleIn(formTsGroupIds, setFormTsGroupIds, g.id)} />}
                                                            label={<span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.7)' }}>{g.name}</span>}
                                                        />
                                                    ))}
                                                    {filteredTsGroups.length === 0 && (
                                                        <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', fontStyle: 'italic', padding: '8px' }}>No matching TeamSpeak roles.</div>
                                                    )}
                                                </div>
                                            </div>

                                            <div style={{ flex: '1 0 260px', minWidth: 260, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <div style={sectionHeaderSx}>Permissions granted {formPermissions.length > 0 && `(${formPermissions.length} selected)`}</div>
                                                    <CopyPasteButtons onCopy={copyPermissions} onPaste={pastePermissions} canPaste={permissionsClipboard !== null} label='permissions' />
                                                </div>
                                                <TextField
                                                    size='small' fullWidth placeholder='Search permissions…' value={permSearch} onChange={e => setPermSearch(e.target.value)}
                                                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                                                    sx={{ ...searchFieldSx, mb: 1, flexShrink: 0 }}
                                                />
                                                <div style={{ flex: 1, minHeight: 120, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}>
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
                                        </Box>
                                    </Box>
                                </Box>

                                <Box sx={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(15,15,15,0.98)', p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Button variant='contained' onClick={save}
                                        sx={{ background: 'var(--red)', fontWeight: 700, letterSpacing: 1, fontSize: '0.75rem', '&:hover': { background: 'rgba(219,0,29,0.85)' } }}>
                                        Save
                                    </Button>
                                    <Button variant='outlined' onClick={discard}
                                        sx={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(237,237,237,0.6)' }}>
                                        Discard
                                    </Button>
                                    {dirty && (
                                        <Typography sx={{ fontSize: '0.68rem', color: 'rgba(255,180,80,0.85)', fontStyle: 'italic' }}>
                                            Unsaved changes
                                        </Typography>
                                    )}

                                    {editingId !== '__new__' && (
                                        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                                            {confirmingDelete ? (
                                                <>
                                                    <Typography sx={{ fontSize: '0.68rem', color: 'rgba(219,0,29,0.85)' }}>
                                                        Delete this role permanently?
                                                    </Typography>
                                                    <Button
                                                        size='small' variant='contained'
                                                        onClick={() => { const role = roles.find(r => String(r._id) === editingId); if (role) remove(role) }}
                                                        sx={{ background: 'var(--red)', fontSize: '0.68rem', '&:hover': { background: 'rgba(219,0,29,0.85)' } }}
                                                    >
                                                        Confirm Delete
                                                    </Button>
                                                    <Button size='small' onClick={() => setConfirmingDelete(false)} sx={{ color: 'rgba(237,237,237,0.5)' }}>
                                                        Cancel
                                                    </Button>
                                                </>
                                            ) : (
                                                <Button
                                                    size='small' variant='outlined' startIcon={<Delete sx={{ fontSize: 14 }} />} onClick={() => setConfirmingDelete(true)}
                                                    sx={{ fontSize: '0.68rem', borderColor: 'rgba(219,0,29,0.35)', color: 'rgba(219,0,29,0.7)' }}
                                                >
                                                    Delete Role
                                                </Button>
                                            )}
                                        </Box>
                                    )}
                                </Box>
                            </>
                        )}
                    </Box>
                </Box>
            )}
        </>
    )
}
