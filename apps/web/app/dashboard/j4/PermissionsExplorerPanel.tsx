'use client'

import { useState, useEffect } from 'react'
import {
    Dialog, DialogTitle, DialogContent, Divider, TextField, IconButton,
    Typography, Box, InputAdornment, CircularProgress,
} from '@mui/material'
import { Close, Search, ExpandMore, ChevronRight } from '@mui/icons-material'
import convertColorToHex from '@/lib/discord/color'

interface DiscordRoleChip { id: string; name: string; color: number; resolved: boolean }
interface OrbatRoleChip { id: string; name: string }
interface PermissionNode { key: string; discordRoles: DiscordRoleChip[]; orbatRoles: OrbatRoleChip[]; memberCount: number }
interface PermissionCategory { key: string; label: string; permissions: PermissionNode[] }

interface Props {
    open: boolean
    onClose: () => void
}

const searchFieldSx = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(237,237,237,0.85)', fontSize: '0.75rem',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
}

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

function DiscordChip({ chip }: { chip: DiscordRoleChip }) {
    return (
        <span
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: '0.66rem', padding: '2px 8px', borderRadius: 999,
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${chip.resolved ? 'rgba(255,255,255,0.12)' : 'rgba(255,180,0,0.35)'}`,
                color: chip.resolved ? 'rgba(237,237,237,0.75)' : 'rgba(255,180,0,0.75)',
            }}
            title={chip.resolved ? undefined : 'Role no longer found in the guild — stale reference in permissions.ts'}
        >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: roleDotColor(chip), flexShrink: 0 }} />
            {chip.name}
        </span>
    )
}

function OrbatChip({ chip }: { chip: OrbatRoleChip }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', fontSize: '0.66rem', padding: '2px 8px', borderRadius: 999,
            background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.35)', color: 'rgba(255,150,160,0.85)',
        }}>
            {chip.name}
        </span>
    )
}

function PermissionLeaf({ node }: { node: PermissionNode }) {
    const shortLabel = node.key.split('.').slice(1).join('.')
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.85)' }}>{shortLabel}</div>
                <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'rgba(237,237,237,0.35)', marginBottom: 4 }}>{node.key}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {node.discordRoles.map(r => <DiscordChip key={r.id} chip={r} />)}
                    {node.orbatRoles.map(r => <OrbatChip key={r.id} chip={r} />)}
                    {node.discordRoles.length === 0 && node.orbatRoles.length === 0 && (
                        <span style={{ fontSize: '0.66rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No roles granted</span>
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

function CategorySection({ category, search, collapsed, onToggle }: {
    category: PermissionCategory
    search: string
    collapsed: boolean
    onToggle: () => void
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
                    {visibleNodes.map(node => <PermissionLeaf key={node.key} node={node} />)}
                </div>
            )}
        </div>
    )
}

export default function PermissionsExplorerPanel({ open, onClose }: Props) {
    const [categories, setCategories] = useState<PermissionCategory[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

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

    function toggleCategory(key: string) {
        setCollapsedCategories(prev => {
            const next = new Set(prev)
            next.has(key) ? next.delete(key) : next.add(key)
            return next
        })
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
                <IconButton size='small' onClick={onClose}><Close sx={{ fontSize: 18, color: 'rgba(237,237,237,0.5)' }} /></IconButton>
            </DialogTitle>

            <Divider sx={{ borderColor: 'rgba(219,0,29,0.42)' }} />

            <DialogContent sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden' }}>
                <TextField
                    size='small'
                    placeholder='Search permission keys or role names…'
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position='start'><Search sx={{ fontSize: 16, color: 'rgba(237,237,237,0.4)' }} /></InputAdornment> }}
                    sx={searchFieldSx}
                />

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    {loading && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={24} /></Box>
                    )}
                    {error && <Typography sx={{ fontSize: '0.78rem', color: 'rgba(219,0,29,0.8)', p: 2 }}>{error}</Typography>}
                    {!loading && !error && categories.map(cat => (
                        <CategorySection
                            key={cat.key}
                            category={cat}
                            search={search}
                            collapsed={collapsedCategories.has(cat.key)}
                            onToggle={() => toggleCategory(cat.key)}
                        />
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}
