'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Group { id: number; name: string }

interface TsClient {
    cldbid: number
    clid: string | null
    nickname: string
    uid: string
    online: boolean
    lastSeen: number | null
    groups: Group[]
}

interface SnapshotMeta {
    _id: string
    name: string
    auto: boolean
    createdAt: number
    createdBy: string
    sizeBytes: number
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const S = {
    panel: {
        border: '1px solid rgba(255,255,255,0.07)',
        borderTop: '2px solid rgba(0,130,220,0.5)',
        background: 'rgba(255,255,255,0.02)',
    } as React.CSSProperties,
    divider: { borderBottom: '1px solid rgba(255,255,255,0.05)' } as React.CSSProperties,
    input: {
        width: '100%',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(237,237,237,0.9)',
        padding: '6px 10px',
        fontSize: '0.8rem',
        outline: 'none',
    } as React.CSSProperties,
    label: {
        fontSize: '0.65rem',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase' as const,
        color: 'rgba(237,237,237,0.3)',
    },
    badge: (color: string): React.CSSProperties => ({
        fontSize: '0.6rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        color,
        background: `${color}18`,
        border: `1px solid ${color}35`,
        padding: '1px 7px',
    }),
    btn: (variant: 'blue' | 'red' | 'green' | 'amber'): React.CSSProperties => {
        const c = { blue: '0,130,220', red: '219,0,29', green: '0,195,100', amber: '255,180,0' }[variant]
        return {
            background: `rgba(${c},0.12)`,
            border: `1px solid rgba(${c},0.3)`,
            color: `rgba(${c},0.9)`,
            padding: '4px 12px',
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            cursor: 'pointer',
        }
    },
    ghostBtn: {
        background: 'none',
        border: '1px solid rgba(255,255,255,0.12)',
        color: 'rgba(237,237,237,0.5)',
        padding: '4px 12px',
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        cursor: 'pointer',
    } as React.CSSProperties,
}

function fmtBytes(b: number): string {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / 1024 / 1024).toFixed(2)} MB`
}

function fmtAge(ts: number): string {
    const mins = Math.round((Date.now() - ts) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m ago`
}

// ── Action form ───────────────────────────────────────────────────────────────

type ActionType = 'kick' | 'poke' | 'ban' | null

function ActionForm({
    action,
    client: selected,
    onClose,
    onDone,
}: {
    action: ActionType
    client: TsClient
    onClose: () => void
    onDone: () => void
}) {
    const [reason, setReason] = useState('')
    const [duration, setDuration] = useState(0)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    async function submit() {
        if (!action) return
        setBusy(true)
        setErr(null)
        try {
            let url = `/api/teamspeak/clients/${selected.cldbid}/${action}`
            let body: Record<string, unknown>
            if (action === 'kick') body = { clid: selected.clid, reason: reason.trim() || undefined }
            else if (action === 'poke') body = { clid: selected.clid, message: reason.trim() }
            else body = { uid: selected.uid, duration, reason: reason.trim() || undefined }

            if (action === 'poke' && !reason.trim()) { setErr('Message is required'); setBusy(false); return }

            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (!r.ok) { setErr((await r.json()).error || 'Failed'); setBusy(false); return }
            onDone()
        } catch {
            setErr('Network error')
            setBusy(false)
        }
    }

    const title = action === 'kick' ? 'Kick Client' : action === 'poke' ? 'Poke Client' : 'Ban Client'
    const label = action === 'poke' ? 'Message *' : 'Reason (optional)'

    return (
        <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', margin: '0 0 1px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 10 }}>
                {title} — {selected.nickname}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                    style={S.input}
                    placeholder={label}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    autoFocus
                />
                {action === 'ban' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={S.label}>Duration (seconds, 0 = permanent)</span>
                        <input
                            type='number'
                            min={0}
                            value={duration}
                            onChange={e => setDuration(Number(e.target.value))}
                            style={{ ...S.input, width: 100 }}
                        />
                    </div>
                )}
                {err && <div style={{ fontSize: '0.72rem', color: 'rgba(219,80,80,0.9)' }}>{err}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        style={S.btn(action === 'ban' ? 'red' : action === 'poke' ? 'blue' : 'amber')}
                        onClick={submit}
                        disabled={busy}
                    >
                        {busy ? 'Working…' : title}
                    </button>
                    <button style={S.ghostBtn} onClick={onClose}>Cancel</button>
                </div>
            </div>
        </div>
    )
}

// ── Snapshot section ──────────────────────────────────────────────────────────

function SnapshotsSection() {
    const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [newName, setNewName] = useState('')
    const [showCreate, setShowCreate] = useState(false)
    const [restoreId, setRestoreId] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const [msg, setMsg] = useState<string | null>(null)

    function loadSnapshots() {
        setLoading(true)
        fetch('/api/teamspeak/snapshots')
            .then(r => r.json())
            .then(d => setSnapshots(d.snapshots ?? []))
            .catch(() => setErr('Failed to load snapshots'))
            .finally(() => setLoading(false))
    }

    useEffect(() => { loadSnapshots() }, [])

    async function createSnapshot() {
        if (!newName.trim()) return
        setCreating(true)
        setErr(null)
        setMsg(null)
        try {
            const r = await fetch('/api/teamspeak/snapshots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() }),
            })
            if (!r.ok) { setErr((await r.json()).error); return }
            setNewName('')
            setShowCreate(false)
            setMsg('Snapshot created')
            loadSnapshots()
        } catch {
            setErr('Network error')
        } finally {
            setCreating(false)
        }
    }

    async function deleteSnapshot(id: string) {
        setBusy(id)
        setErr(null)
        try {
            await fetch(`/api/teamspeak/snapshots/${id}`, { method: 'DELETE' })
            setSnapshots(prev => prev.filter(s => s._id !== id))
        } catch {
            setErr('Delete failed')
        } finally {
            setBusy(null)
        }
    }

    async function restoreSnapshot(id: string) {
        setBusy(id)
        setErr(null)
        setMsg(null)
        setRestoreId(null)
        try {
            const r = await fetch(`/api/teamspeak/snapshots/${id}/restore`, { method: 'POST' })
            if (!r.ok) { setErr((await r.json()).error); return }
            setMsg('Server restored. TeamSpeak server will reconnect momentarily.')
        } catch {
            setErr('Restore failed')
        } finally {
            setBusy(null)
        }
    }

    return (
        <div style={{ ...S.panel, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Header */}
            <div style={{ ...S.divider, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={S.label}>Server Snapshots</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={S.badge('rgba(0,130,220,0.8)')}>
                        {snapshots.length}/14
                    </span>
                    <button style={S.btn('blue')} onClick={() => { setShowCreate(v => !v); setErr(null); setMsg(null) }}>
                        {showCreate ? 'Cancel' : '+ Create'}
                    </button>
                </div>
            </div>

            {showCreate && (
                <div style={{ ...S.divider, padding: '10px 16px', display: 'flex', gap: 8, flexShrink: 0 }}>
                    <input
                        style={{ ...S.input }}
                        placeholder='Snapshot name…'
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && createSnapshot()}
                        autoFocus
                    />
                    <button style={S.btn('green')} onClick={createSnapshot} disabled={creating || !newName.trim()}>
                        {creating ? 'Creating…' : 'Save'}
                    </button>
                </div>
            )}

            {(err || msg) && (
                <div style={{
                    margin: '8px 16px 0',
                    padding: '6px 12px',
                    fontSize: '0.75rem',
                    background: err ? 'rgba(219,0,29,0.1)' : 'rgba(0,195,100,0.08)',
                    border: `1px solid ${err ? 'rgba(219,0,29,0.25)' : 'rgba(0,195,100,0.2)'}`,
                    color: err ? 'rgba(219,80,80,0.9)' : 'rgba(0,195,100,0.9)',
                    flexShrink: 0,
                }}>
                    {err ?? msg}
                </div>
            )}

            {/* Restore confirmation */}
            {restoreId && (
                <div style={{ margin: '8px 16px 0', padding: '10px 14px', background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.3)', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.85)', marginBottom: 8 }}>
                        This will reset the entire TeamSpeak server configuration. The server will disconnect and reconnect. Are you sure?
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button style={S.btn('red')} onClick={() => restoreSnapshot(restoreId)} disabled={!!busy}>Confirm Restore</button>
                        <button style={S.ghostBtn} onClick={() => setRestoreId(null)}>Cancel</button>
                    </div>
                </div>
            )}

            {/* List */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
                {loading ? (
                    <div style={{ padding: '20px 16px', fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', textAlign: 'center' }}>Loading…</div>
                ) : snapshots.length === 0 ? (
                    <div style={{ padding: '20px 16px', fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', textAlign: 'center', fontStyle: 'italic' }}>No snapshots yet</div>
                ) : snapshots.map(s => (
                    <div key={s._id} style={{ ...S.divider, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: '0.83rem', fontWeight: 600 }}>{s.name}</span>
                                {s.auto && (
                                    <span style={S.badge('rgba(0,130,220,0.7)')}>AUTO</span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>
                                {new Date(s.createdAt).toLocaleString()} · {fmtBytes(s.sizeBytes)}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button
                                style={S.btn('amber')}
                                disabled={!!busy || !!restoreId}
                                onClick={() => { setRestoreId(s._id); setErr(null); setMsg(null) }}
                            >
                                Restore
                            </button>
                            <button
                                style={S.btn('red')}
                                disabled={busy === s._id}
                                onClick={() => deleteSnapshot(s._id)}
                            >
                                {busy === s._id ? '…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function TeamspeakTab() {
    const [view, setView] = useState<'members' | 'snapshots'>('members')

    // Online clients
    const [onlineClients, setOnlineClients] = useState<TsClient[]>([])
    const [onlineRoles, setOnlineRoles] = useState<Group[]>([])
    const [onlineLoading, setOnlineLoading] = useState(true)
    const [onlineRefreshing, setOnlineRefreshing] = useState(false)
    const [onlineRefreshedAt, setOnlineRefreshedAt] = useState<number | null>(null)
    const [onlineErr, setOnlineErr] = useState<string | null>(null)

    // Offline clients (cached)
    const [offlineClients, setOfflineClients] = useState<TsClient[]>([])
    const [offlineRefreshedAt, setOfflineRefreshedAt] = useState<number | null>(null)
    const [offlineRefreshing, setOfflineRefreshing] = useState(false)
    const [offlineErr, setOfflineErr] = useState<string | null>(null)
    const [offlineLoaded, setOfflineLoaded] = useState(false)

    // UI state
    const [selected, setSelected] = useState<TsClient | null>(null)
    const [search, setSearch] = useState('')
    const [roleSearch, setRoleSearch] = useState('')
    const [action, setAction] = useState<'kick' | 'poke' | 'ban' | null>(null)
    const [groupBusy, setGroupBusy] = useState(false)

    function applyOnlineData(d: { clients: TsClient[]; roles: Group[]; refreshedAt: number | null; refreshing: boolean }) {
        setOnlineClients(d.clients ?? [])
        setOnlineRoles(d.roles ?? [])
        setOnlineRefreshedAt(d.refreshedAt ?? null)
        setOnlineRefreshing(d.refreshing ?? false)
        setSelected(prev => prev?.online
            ? (d.clients.find((c: TsClient) => c.cldbid === prev.cldbid) ?? null)
            : prev
        )
    }

    const loadOnline = useCallback(() => {
        setOnlineLoading(true)
        setOnlineErr(null)
        fetch('/api/teamspeak/clients?type=online')
            .then(r => r.json())
            .then(d => {
                if (d.error) throw new Error(d.error)
                applyOnlineData(d)
                setOnlineLoading(false)
                if (d.refreshing) {
                    const poll = setInterval(() => {
                        fetch('/api/teamspeak/clients?type=online')
                            .then(r => r.json())
                            .then(d2 => {
                                applyOnlineData(d2)
                                if (!d2.refreshing) clearInterval(poll)
                            })
                            .catch(() => clearInterval(poll))
                    }, 3000)
                }
            })
            .catch(e => { setOnlineErr(e.message); setOnlineLoading(false) })
    }, [])

    const loadOffline = useCallback(() => {
        fetch('/api/teamspeak/clients?type=offline')
            .then(r => r.json())
            .then(d => {
                if (d.error) throw new Error(d.error)
                setOfflineClients(d.clients ?? [])
                setOfflineRefreshedAt(d.refreshedAt ?? null)
                setOfflineRefreshing(d.refreshing ?? false)
                setOfflineLoaded(true)
                setSelected(prev => prev && !prev.online
                    ? (d.clients.find((c: TsClient) => c.cldbid === prev.cldbid) ?? null)
                    : prev
                )
            })
            .catch(e => setOfflineErr(e.message))
    }, [])

    function triggerOfflineRefresh() {
        setOfflineRefreshing(true)
        setOfflineErr(null)
        fetch('/api/teamspeak/clients', { method: 'POST' })
            .then(() => {
                // Poll every 5s until refreshing flag clears
                const poll = setInterval(() => {
                    fetch('/api/teamspeak/clients?type=offline')
                        .then(r => r.json())
                        .then(d => {
                            setOfflineClients(d.clients ?? [])
                            setOfflineRefreshedAt(d.refreshedAt ?? null)
                            setOfflineRefreshing(d.refreshing ?? false)
                            if (!d.refreshing) clearInterval(poll)
                        })
                        .catch(() => clearInterval(poll))
                }, 5000)
            })
            .catch(() => setOfflineRefreshing(false))
    }

    useEffect(() => {
        loadOnline()
        loadOffline()
    }, [loadOnline, loadOffline])

    const allGroups = onlineRoles

    const assignedIds = useMemo(() => new Set(selected?.groups.map(g => g.id) ?? []), [selected])
    const availableGroups = useMemo(() =>
        allGroups.filter(r => !assignedIds.has(r.id) && r.name.toLowerCase().includes(roleSearch.toLowerCase())),
        [allGroups, assignedIds, roleSearch]
    )

    const filteredOnline = useMemo(() =>
        onlineClients.filter(c => c.nickname.toLowerCase().includes(search.toLowerCase())),
        [onlineClients, search]
    )
    const filteredOffline = useMemo(() =>
        offlineClients.filter(c => c.nickname.toLowerCase().includes(search.toLowerCase())),
        [offlineClients, search]
    )

    const selectClient = useCallback((c: TsClient) => {
        setSelected(c)
        setRoleSearch('')
        setAction(null)
    }, [])

    async function addGroup(sgid: number) {
        if (!selected || groupBusy) return
        setGroupBusy(true)
        try {
            await fetch(`/api/teamspeak/clients/${selected.cldbid}/groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sgid }),
            })
            // Optimistic update
            const grp = allGroups.find(g => g.id === sgid)
            if (grp) {
                setSelected(prev => prev ? { ...prev, groups: [...prev.groups, grp].sort((a, b) => a.name.localeCompare(b.name)) } : prev)
                if (selected.online) {
                    setOnlineClients(prev => prev.map(c => c.cldbid === selected.cldbid ? { ...c, groups: [...c.groups, grp].sort((a, b) => a.name.localeCompare(b.name)) } : c))
                } else {
                    setOfflineClients(prev => prev.map(c => c.cldbid === selected.cldbid ? { ...c, groups: [...c.groups, grp].sort((a, b) => a.name.localeCompare(b.name)) } : c))
                }
            }
        } finally {
            setGroupBusy(false)
        }
    }

    async function removeGroup(sgid: number) {
        if (!selected || groupBusy) return
        setGroupBusy(true)
        try {
            await fetch(`/api/teamspeak/clients/${selected.cldbid}/groups?sgid=${sgid}`, { method: 'DELETE' })
            setSelected(prev => prev ? { ...prev, groups: prev.groups.filter(g => g.id !== sgid) } : prev)
            if (selected.online) {
                setOnlineClients(prev => prev.map(c => c.cldbid === selected.cldbid ? { ...c, groups: c.groups.filter(g => g.id !== sgid) } : c))
            } else {
                setOfflineClients(prev => prev.map(c => c.cldbid === selected.cldbid ? { ...c, groups: c.groups.filter(g => g.id !== sgid) } : c))
            }
        } finally {
            setGroupBusy(false)
        }
    }

    function onActionDone() {
        setAction(null)
        if (action === 'kick') {
            // Remove from online list
            setOnlineClients(prev => prev.filter(c => c.cldbid !== selected?.cldbid))
            setSelected(null)
        }
    }

    // ── View toggle ──────────────────────────────────────────────────────────

    const viewBtnStyle = (active: boolean): React.CSSProperties => ({
        fontSize: '0.65rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '4px 14px',
        background: active ? 'rgba(0,130,220,0.2)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(0,130,220,0.4)' : 'rgba(255,255,255,0.08)'}`,
        color: active ? 'rgba(120,190,255,0.9)' : 'rgba(237,237,237,0.4)',
        cursor: 'pointer',
    })

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0, padding: '16px 24px 24px' }}>

            {/* Sub-view toggle */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexShrink: 0 }}>
                <button style={viewBtnStyle(view === 'members')} onClick={() => setView('members')}>Members</button>
                <button style={viewBtnStyle(view === 'snapshots')} onClick={() => setView('snapshots')}>Snapshots</button>
            </div>

            {view === 'snapshots' && <SnapshotsSection />}

            {view === 'members' && (
                <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 14 }}>

                    {/* ── Client list ────────────────────────────────────────────── */}
                    <div style={{ ...S.panel, width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ ...S.divider, padding: '8px 12px', flexShrink: 0 }}>
                            <input style={S.input} placeholder='Search nickname…' value={search} onChange={e => setSearch(e.target.value)} />
                        </div>

                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {/* Online section */}
                            <div style={{ ...S.divider, padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={S.label}>Online</span>
                                    {onlineRefreshedAt && (
                                        <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.2)' }}>
                                            {fmtAge(onlineRefreshedAt)}
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <span style={S.badge('rgba(0,200,100,0.8)')}>
                                        {onlineClients.length}
                                    </span>
                                    <button
                                        onClick={loadOnline}
                                        disabled={onlineLoading || onlineRefreshing}
                                        title={onlineRefreshing ? 'Refreshing…' : 'Refresh online list'}
                                        style={{ background: 'none', border: 'none', fontSize: '0.65rem', fontWeight: 700, color: (onlineLoading || onlineRefreshing) ? 'rgba(255,255,255,0.15)' : 'rgba(0,130,220,0.6)', cursor: (onlineLoading || onlineRefreshing) ? 'default' : 'pointer', letterSpacing: '0.06em', padding: '1px 4px' }}
                                    >
                                        {(onlineLoading || onlineRefreshing) ? '…' : '↻'}
                                    </button>
                                </div>
                            </div>

                            {onlineErr && (
                                <div style={{ padding: '6px 12px', fontSize: '0.72rem', color: 'rgba(219,80,80,0.8)' }}>{onlineErr}</div>
                            )}

                            {filteredOnline.length === 0 && !onlineLoading && (
                                <div style={{ padding: '10px 12px', fontSize: '0.75rem', color: 'rgba(237,237,237,0.18)', fontStyle: 'italic' }}>
                                    {search ? 'No match' : 'No clients online'}
                                </div>
                            )}

                            {filteredOnline.map(c => {
                                const isSel = selected?.cldbid === c.cldbid
                                return (
                                    <div
                                        key={c.cldbid}
                                        onClick={() => selectClient(c)}
                                        style={{
                                            ...S.divider,
                                            padding: '8px 12px',
                                            cursor: 'pointer',
                                            background: isSel ? 'rgba(0,130,220,0.08)' : 'transparent',
                                            borderLeft: isSel ? '2px solid rgba(0,130,220,0.6)' : '2px solid transparent',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgb(0,200,100)', flexShrink: 0 }} />
                                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: isSel ? 'rgba(120,190,255,0.95)' : 'rgba(237,237,237,0.85)' }}>
                                                {c.nickname}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })}

                            {/* Offline section */}
                            <div style={{ ...S.divider, padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                                <span style={S.label}>Offline</span>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <span style={S.badge('rgba(255,255,255,0.3)')}>
                                        {offlineClients.length}
                                    </span>
                                    <button
                                        onClick={triggerOfflineRefresh}
                                        disabled={offlineRefreshing}
                                        style={{ background: 'none', border: 'none', fontSize: '0.65rem', fontWeight: 700, color: offlineRefreshing ? 'rgba(255,255,255,0.15)' : 'rgba(0,130,220,0.6)', cursor: offlineRefreshing ? 'default' : 'pointer', letterSpacing: '0.06em', padding: '1px 4px' }}
                                        title={offlineRefreshedAt ? `Cached ${fmtAge(offlineRefreshedAt)}` : 'Not cached yet'}
                                    >
                                        {offlineRefreshing ? '…' : '↻'}
                                    </button>
                                </div>
                            </div>

                            {offlineRefreshedAt && (
                                <div style={{ padding: '2px 12px 6px', fontSize: '0.62rem', color: 'rgba(237,237,237,0.2)' }}>
                                    Cached {fmtAge(offlineRefreshedAt)}
                                </div>
                            )}

                            {!offlineLoaded && (
                                <div style={{ padding: '6px 12px', fontSize: '0.72rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>Not cached yet — refresh to load</div>
                            )}

                            {offlineErr && (
                                <div style={{ padding: '6px 12px', fontSize: '0.72rem', color: 'rgba(219,80,80,0.8)' }}>{offlineErr}</div>
                            )}

                            {filteredOffline.map(c => {
                                const isSel = selected?.cldbid === c.cldbid
                                return (
                                    <div
                                        key={c.cldbid}
                                        onClick={() => selectClient(c)}
                                        style={{
                                            ...S.divider,
                                            padding: '8px 12px',
                                            cursor: 'pointer',
                                            background: isSel ? 'rgba(0,130,220,0.06)' : 'transparent',
                                            borderLeft: isSel ? '2px solid rgba(0,130,220,0.4)' : '2px solid transparent',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
                                            <span style={{ fontSize: '0.82rem', fontWeight: 500, color: isSel ? 'rgba(120,190,255,0.85)' : 'rgba(237,237,237,0.55)' }}>
                                                {c.nickname}
                                            </span>
                                        </div>
                                        {c.lastSeen && (
                                            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.22)', paddingLeft: 12 }}>
                                                {new Date(c.lastSeen * 1000).toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* ── Detail panel ───────────────────────────────────────────── */}
                    <div style={{ ...S.panel, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {!selected ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, flexDirection: 'column', gap: 6 }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.15)' }}>
                                    Select a client
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.1)' }}>
                                    Choose from the list to manage groups or take action
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Client header */}
                                <div style={{ ...S.divider, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: selected.online ? 'rgb(0,200,100)' : 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
                                            <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>{selected.nickname}</span>
                                            <span style={{ ...S.badge(selected.online ? 'rgba(0,200,100,0.8)' : 'rgba(255,255,255,0.3)') }}>
                                                {selected.online ? 'Online' : 'Offline'}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', marginTop: 2, fontFamily: 'monospace', paddingLeft: 16 }}>
                                            {selected.uid}
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {selected.online && (
                                            <>
                                                <button style={S.btn('amber')} onClick={() => setAction(a => a === 'kick' ? null : 'kick')}>Kick</button>
                                                <button style={S.btn('blue')} onClick={() => setAction(a => a === 'poke' ? null : 'poke')}>Poke</button>
                                            </>
                                        )}
                                        <button style={S.btn('red')} onClick={() => setAction(a => a === 'ban' ? null : 'ban')}>Ban</button>
                                    </div>
                                </div>

                                {/* Inline action form */}
                                {action && (
                                    <ActionForm
                                        action={action}
                                        client={selected}
                                        onClose={() => setAction(null)}
                                        onDone={onActionDone}
                                    />
                                )}

                                {/* Groups area */}
                                <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                                    {/* Assigned */}
                                    <div style={{ width: '50%', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ ...S.divider, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                                            <span style={S.label}>Assigned Groups</span>
                                            <span style={S.badge('rgba(0,130,220,0.7)')}>{selected.groups.length}</span>
                                        </div>
                                        <div style={{ overflowY: 'auto', flex: 1 }}>
                                            {selected.groups.length === 0 ? (
                                                <div style={{ padding: '16px 14px', fontSize: '0.75rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>No groups assigned</div>
                                            ) : selected.groups.map(g => (
                                                <div key={g.id} style={{ ...S.divider, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px' }}>
                                                    <span style={{ fontSize: '0.82rem' }}>{g.name}</span>
                                                    <button
                                                        disabled={groupBusy}
                                                        onClick={() => removeGroup(g.id)}
                                                        style={{ background: 'none', border: 'none', cursor: groupBusy ? 'default' : 'pointer', fontSize: '0.65rem', fontWeight: 700, color: groupBusy ? 'rgba(219,0,29,0.2)' : 'rgba(219,0,29,0.6)', letterSpacing: '0.06em' }}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Available */}
                                    <div style={{ width: '50%', display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ ...S.divider, padding: '8px 14px', flexShrink: 0 }}>
                                            <span style={S.label}>Available Groups</span>
                                        </div>
                                        <div style={{ ...S.divider, padding: '6px 10px', flexShrink: 0 }}>
                                            <input style={S.input} placeholder='Filter groups…' value={roleSearch} onChange={e => setRoleSearch(e.target.value)} />
                                        </div>
                                        <div style={{ overflowY: 'auto', flex: 1 }}>
                                            {availableGroups.length === 0 ? (
                                                <div style={{ padding: '16px 14px', fontSize: '0.75rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>
                                                    {roleSearch ? 'No match' : 'All groups assigned'}
                                                </div>
                                            ) : availableGroups.map(r => (
                                                <div key={r.id} style={{ ...S.divider, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px' }}>
                                                    <span style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.6)' }}>{r.name}</span>
                                                    <button
                                                        disabled={groupBusy}
                                                        onClick={() => addGroup(r.id)}
                                                        style={{ background: 'none', border: 'none', cursor: groupBusy ? 'default' : 'pointer', fontSize: '0.65rem', fontWeight: 700, color: groupBusy ? 'rgba(0,180,100,0.2)' : 'rgba(0,180,100,0.7)', letterSpacing: '0.06em' }}
                                                    >
                                                        + Add
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
