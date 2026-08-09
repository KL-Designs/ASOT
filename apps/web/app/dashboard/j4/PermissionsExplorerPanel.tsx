'use client'

import { useState, useEffect, useRef } from 'react'
import {
    Dialog, DialogTitle, DialogContent, Divider, TextField, IconButton,
    Typography, Box, InputAdornment, CircularProgress, Autocomplete,
} from '@mui/material'
import { Close, Search, ExpandMore, ChevronRight } from '@mui/icons-material'
import convertColorToHex from '@/lib/discord/color'

interface DiscordRoleChip { id: string; name: string; color: number; resolved: boolean }
interface OrbatRoleChip { id: string; name: string }
interface PermissionNode { key: string; discordRoles: DiscordRoleChip[]; orbatRoles: OrbatRoleChip[]; memberCount: number }
interface PermissionCategory { key: string; label: string; permissions: PermissionNode[] }
interface PermissionGrant { granted: boolean; viaDiscordRoles: string[]; viaOrbatRole: string | null; viaGlobalOverride: boolean }
interface MemberOption { id: string; displayName: string }

interface Props {
    open: boolean
    onClose: () => void
}

type Mode = 'system' | 'member'

const searchFieldSx = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
}

const modeBtnSx = (active: boolean): React.CSSProperties => ({
    fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    padding: '5px 14px', background: active ? 'rgba(219,0,29,0.35)' : 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(219,0,29,0.25)', color: active ? '#ededed' : 'rgba(237,237,237,0.55)',
    cursor: 'pointer', borderRadius: 999,
})

function roleDotColor(chip: DiscordRoleChip): string {
    if (!chip.resolved) return 'rgba(255,255,255,0.15)'
    if (!chip.color) return 'rgba(255,255,255,0.3)'
    return convertColorToHex(chip.color)
}

function matchesSearch(node: PermissionNode, term: string): boolean {
    if (!term) return true
    const t = term.toLowerCase()
    if (node.key.toLowerCase().includes(t)) return true
    if (node.discordRoles.some(r => r.name.toLowerCase().includes(t))) return true
    if (node.orbatRoles.some(r => r.name.toLowerCase().includes(t))) return true
    return false
}

function DiscordChip({ chip, matched }: { chip: DiscordRoleChip; matched?: boolean }) {
    return (
        <span
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: '0.66rem', padding: '2px 8px', borderRadius: 999,
                background: matched ? 'rgba(0,195,100,0.12)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${matched ? 'rgb(0,195,100)' : chip.resolved ? 'rgba(255,255,255,0.12)' : 'rgba(255,180,0,0.35)'}`,
                color: matched ? 'rgb(0,195,100)' : chip.resolved ? 'rgba(237,237,237,0.75)' : 'rgba(255,180,0,0.75)',
            }}
            title={chip.resolved ? undefined : 'Role no longer found in the guild — stale reference in permissions.ts'}
        >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: roleDotColor(chip), flexShrink: 0 }} />
            {chip.name}
        </span>
    )
}

function OrbatChip({ chip, matched }: { chip: OrbatRoleChip; matched?: boolean }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', fontSize: '0.66rem', padding: '2px 8px', borderRadius: 999,
            background: matched ? 'rgba(0,195,100,0.12)' : 'rgba(219,0,29,0.08)',
            border: `1px solid ${matched ? 'rgb(0,195,100)' : 'rgba(219,0,29,0.35)'}`,
            color: matched ? 'rgb(0,195,100)' : 'rgba(255,150,160,0.85)',
        }}>
            {chip.name}
        </span>
    )
}

function PermissionLeaf({ node, grant }: { node: PermissionNode; grant?: PermissionGrant }) {
    const shortLabel = node.key.split('.').slice(1).join('.')
    const granted = grant?.granted ?? false
    const dimmed = grant ? !grant.granted : false

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)',
            background: granted ? 'rgba(0,195,100,0.05)' : 'transparent',
            opacity: dimmed ? 0.35 : 1,
        }}>
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.85)' }}>{shortLabel}</div>
                <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.35)', marginBottom: 4 }}>{node.key}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                    {node.discordRoles.map(r => (
                        <DiscordChip key={r.id} chip={r} matched={grant?.viaDiscordRoles.includes(r.name) ?? false} />
                    ))}
                    {node.orbatRoles.map(r => (
                        <OrbatChip key={r.id} chip={r} matched={grant?.viaOrbatRole === r.name} />
                    ))}
                    {node.discordRoles.length === 0 && node.orbatRoles.length === 0 && (
                        <span style={{ fontSize: '0.66rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No roles granted</span>
                    )}
                    {grant?.viaGlobalOverride && (
                        <span style={{
                            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                            padding: '2px 7px', borderRadius: 999, background: 'rgba(0,195,100,0.15)',
                            border: '1px solid rgba(0,195,100,0.4)', color: 'rgb(0,195,100)',
                        }}>
                            Override
                        </span>
                    )}
                </div>
            </div>
            <div style={{
                flexShrink: 0, fontSize: '0.72rem', fontWeight: 700, color: 'rgba(237,237,237,0.6)',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 999, padding: '3px 10px', minWidth: 28, textAlign: 'center',
            }}>
                {node.memberCount}
            </div>
        </div>
    )
}

function CategorySection({ category, search, collapsed, onToggle, grants }: {
    category: PermissionCategory
    search: string
    collapsed: boolean
    onToggle: () => void
    grants?: Record<string, PermissionGrant>
}) {
    const visibleNodes = category.permissions.filter(n => matchesSearch(n, search))
    if (search && visibleNodes.length === 0) return null
    const expanded = search ? true : !collapsed

    return (
        <div style={{ marginBottom: 4 }}>
            <button
                onClick={onToggle}
                style={{
                    all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    padding: '8px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                }}
            >
                {expanded
                    ? <ExpandMore sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} />
                    : <ChevronRight sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} />}
                <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.7)' }}>
                    {category.label}
                </span>
                <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)' }}>({visibleNodes.length})</span>
            </button>
            {expanded && (
                <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderTop: 'none' }}>
                    {visibleNodes.map(node => <PermissionLeaf key={node.key} node={node} grant={grants?.[node.key]} />)}
                </div>
            )}
        </div>
    )
}

export default function PermissionsExplorerPanel({ open, onClose }: Props) {
    const [mode, setMode] = useState<Mode>('system')

    const [categories, setCategories] = useState<PermissionCategory[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

    const [memberQuery, setMemberQuery] = useState('')
    const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
    const [memberOptionsLoading, setMemberOptionsLoading] = useState(false)
    const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
    const [memberGrants, setMemberGrants] = useState<Record<string, PermissionGrant> | null>(null)
    const [memberGrantsLoading, setMemberGrantsLoading] = useState(false)
    const [memberError, setMemberError] = useState<string | null>(null)
    const memberSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!open) return
        setLoading(true)
        setError(null)
        fetch('/api/admin/permissions/tree')
            .then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json() })
            .then(data => {
                const cats: PermissionCategory[] = data.categories ?? []
                setCategories(cats)
                setCollapsedCategories(new Set(cats.map(c => c.key)))
            })
            .catch(() => setError('Failed to load permissions tree'))
            .finally(() => setLoading(false))
    }, [open])

    useEffect(() => {
        if (!open) {
            setMode('system')
            setSelectedMember(null)
            setMemberGrants(null)
            setMemberError(null)
            setMemberQuery('')
        }
    }, [open])

    useEffect(() => {
        if (mode !== 'member') return
        if (memberSearchTimer.current) clearTimeout(memberSearchTimer.current)
        memberSearchTimer.current = setTimeout(() => {
            setMemberOptionsLoading(true)
            fetch(`/api/admin/members?search=${encodeURIComponent(memberQuery)}&limit=15`)
                .then(r => r.json())
                .then(data => {
                    const members = (data.members ?? []) as { id: string; displayName: string }[]
                    setMemberOptions(members.map(m => ({ id: m.id, displayName: m.displayName })))
                })
                .catch(() => setMemberOptions([]))
                .finally(() => setMemberOptionsLoading(false))
        }, 300)
        return () => { if (memberSearchTimer.current) clearTimeout(memberSearchTimer.current) }
    }, [memberQuery, mode])

    function toggleCategory(key: string) {
        setCollapsedCategories(prev => {
            const next = new Set(prev)
            next.has(key) ? next.delete(key) : next.add(key)
            return next
        })
    }

    function selectMember(m: MemberOption | null) {
        setSelectedMember(m)
        setMemberGrants(null)
        setMemberError(null)
        if (!m) return
        setMemberGrantsLoading(true)
        fetch(`/api/admin/permissions/member/${m.id}`)
            .then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json() })
            .then(data => {
                setMemberGrants(data.grants ?? null)
                setCollapsedCategories(new Set())   // expand everything so highlights are immediately visible
            })
            .catch(() => setMemberError("Failed to load this member's access"))
            .finally(() => setMemberGrantsLoading(false))
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth='md'
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
                        J4 Administration
                    </Typography>
                    <Typography fontWeight={700} fontSize='0.95rem' letterSpacing={3} sx={{ textTransform: 'uppercase' }}>
                        Permissions Explorer
                    </Typography>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button style={modeBtnSx(mode === 'system')} onClick={() => setMode('system')}>System Map</button>
                    <button style={modeBtnSx(mode === 'member')} onClick={() => setMode('member')}>Look Up Member</button>
                    <IconButton size='small' onClick={onClose}><Close sx={{ fontSize: 18, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
                </div>
            </DialogTitle>

            <Divider sx={{ borderColor: 'rgba(219,0,29,0.42)' }} />

            <DialogContent sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden' }}>
                {mode === 'member' && (
                    <Autocomplete
                        options={memberOptions}
                        getOptionLabel={o => o.displayName}
                        value={selectedMember}
                        onChange={(_, v) => selectMember(v)}
                        onInputChange={(_, v) => setMemberQuery(v)}
                        loading={memberOptionsLoading}
                        filterOptions={x => x}
                        noOptionsText={memberQuery ? 'No members found' : 'Type to search…'}
                        renderInput={params => (
                            <TextField
                                {...params}
                                size='small'
                                placeholder='Search for a member…'
                                sx={searchFieldSx}
                                InputProps={{
                                    ...params.InputProps,
                                    startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment>,
                                    endAdornment: (
                                        <>
                                            {memberOptionsLoading && <CircularProgress size={14} style={{ color: 'var(--red)' }} />}
                                            {params.InputProps.endAdornment}
                                        </>
                                    ),
                                }}
                            />
                        )}
                        ListboxProps={{ style: { background: '#1a1a1a', color: '#ededed' } }}
                    />
                )}

                <TextField
                    size='small'
                    placeholder='Search permission keys or role names…'
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                    sx={searchFieldSx}
                />

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    {mode === 'member' && !selectedMember && (
                        <Typography sx={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.35)', fontStyle: 'italic', p: 2 }}>
                            Select a member above to see what they can access.
                        </Typography>
                    )}
                    {mode === 'member' && selectedMember && memberGrantsLoading && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={24} /></Box>
                    )}
                    {mode === 'member' && memberError && (
                        <Typography sx={{ fontSize: '0.78rem', color: 'rgba(219,0,29,0.8)', p: 2 }}>{memberError}</Typography>
                    )}

                    {loading && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={24} /></Box>
                    )}
                    {error && <Typography sx={{ fontSize: '0.78rem', color: 'rgba(219,0,29,0.8)', p: 2 }}>{error}</Typography>}

                    {!loading && !error && (mode === 'system' || (mode === 'member' && selectedMember && !memberGrantsLoading && !memberError)) &&
                        categories.map(cat => (
                            <CategorySection
                                key={cat.key}
                                category={cat}
                                search={search}
                                collapsed={collapsedCategories.has(cat.key)}
                                onToggle={() => toggleCategory(cat.key)}
                                grants={mode === 'member' ? (memberGrants ?? undefined) : undefined}
                            />
                        ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}
