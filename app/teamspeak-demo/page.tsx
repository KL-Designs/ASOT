'use client'

import { useEffect, useState, useMemo } from 'react'

interface Group { id: number; name: string }
interface Client {
    clid: string | null
    cldbid: number
    nickname: string
    uid: string
    online: boolean
    lastSeen: number | null
    groups: Group[]
}

const S = {
    panel: {
        border: '1px solid rgba(255,255,255,0.07)',
        borderTop: '2px solid rgba(0,130,220,0.6)',
        background: 'rgba(255,255,255,0.02)',
    } as React.CSSProperties,
    divider: { borderBottom: '1px solid rgba(255,255,255,0.05)' } as React.CSSProperties,
    input: {
        width: '100%',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(237,237,237,0.9)',
        padding: '7px 12px',
        fontSize: '0.82rem',
        outline: 'none',
    } as React.CSSProperties,
    label: {
        fontSize: '0.68rem',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase' as const,
        color: 'rgba(237,237,237,0.3)',
    },
    count: {
        fontSize: '0.68rem',
        fontWeight: 600,
        letterSpacing: '0.06em',
        color: 'rgba(0,130,220,0.8)',
        background: 'rgba(0,130,220,0.08)',
        border: '1px solid rgba(0,130,220,0.2)',
        padding: '2px 8px',
    } as React.CSSProperties,
}

export default function TeamSpeakDemoPage() {
    const [clients, setClients] = useState<Client[]>([])
    const [allRoles, setAllRoles] = useState<Group[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<Client | null>(null)
    const [busy, setBusy] = useState(false)
    const [roleSearch, setRoleSearch] = useState('')

    function load() {
        setLoading(true)
        setError(null)
        fetch('/api/teamspeak/clients')
            .then(r => r.json())
            .then(data => {
                if (data.error) throw new Error(data.error)
                setClients(data.clients)
                setAllRoles(data.roles)
                // keep selected client in sync after refresh
                setSelected(prev => prev ? (data.clients.find((c: Client) => c.cldbid === prev.cldbid) ?? null) : null)
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    const filtered = useMemo(() =>
        clients.filter(c => (c.nickname ?? '').toLowerCase().includes(search.toLowerCase())),
        [clients, search]
    )

    const assignedIds = useMemo(() => new Set(selected?.groups.map(g => g.id) ?? []), [selected])

    const availableRoles = useMemo(() =>
        allRoles.filter(r =>
            !assignedIds.has(r.id) &&
            r.name.toLowerCase().includes(roleSearch.toLowerCase())
        ),
        [allRoles, assignedIds, roleSearch]
    )

    async function addGroup(sgid: number) {
        if (!selected || busy) return
        setBusy(true)
        try {
            const r = await fetch(`/api/teamspeak/clients/${selected.cldbid}/groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sgid }),
            })
            if (!r.ok) throw new Error((await r.json()).error)
            load()
        } finally {
            setBusy(false)
        }
    }

    async function removeGroup(sgid: number) {
        if (!selected || busy) return
        setBusy(true)
        try {
            const r = await fetch(`/api/teamspeak/clients/${selected.cldbid}/groups?sgid=${sgid}`, {
                method: 'DELETE',
            })
            if (!r.ok) throw new Error((await r.json()).error)
            load()
        } finally {
            setBusy(false)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'rgb(12,12,14)', color: 'rgba(237,237,237,0.85)' }}>
            {/* Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,130,220,0.7)' }}>
                        TeamSpeak
                    </span>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.04em', marginTop: 2 }}>
                        Role Manager
                    </div>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    style={{
                        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: loading ? 'rgba(237,237,237,0.2)' : 'rgba(0,130,220,0.7)',
                        background: 'none', border: '1px solid currentColor', padding: '5px 14px', cursor: loading ? 'default' : 'pointer',
                    }}
                >
                    {loading ? 'Loading…' : 'Refresh'}
                </button>
            </div>

            {error && (
                <div style={{ margin: 16, padding: '10px 16px', background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.3)', color: 'rgba(219,80,80,0.9)', fontSize: '0.82rem' }}>
                    {error}
                </div>
            )}

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 16, padding: 16 }}>

                {/* Client list */}
                <div style={{ ...S.panel, width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ ...S.divider, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={S.label}>Clients</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <span style={{ ...S.count, color: 'rgba(0,200,100,0.8)', background: 'rgba(0,200,100,0.08)', border: '1px solid rgba(0,200,100,0.2)' }}>
                                {clients.filter(c => c.online).length} online
                            </span>
                            <span style={S.count}>{clients.length} total</span>
                        </div>
                    </div>
                    <div style={{ ...S.divider, padding: '8px 12px' }}>
                        <input
                            style={S.input}
                            placeholder="Search nickname…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {loading && !clients.length ? (
                            <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)' }}>
                                Connecting…
                            </div>
                        ) : filtered.length === 0 ? (
                            <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>
                                {search ? 'No match' : 'No clients online'}
                            </div>
                        ) : filtered.map(c => {
                            const isSelected = selected?.cldbid === c.cldbid
                            return (
                                <div
                                    key={c.cldbid}
                                    onClick={() => { setSelected(c); setRoleSearch('') }}
                                    style={{
                                        ...S.divider,
                                        padding: '10px 14px',
                                        cursor: 'pointer',
                                        background: isSelected ? 'rgba(0,130,220,0.08)' : 'transparent',
                                        borderLeft: isSelected ? '2px solid rgba(0,130,220,0.6)' : '2px solid transparent',
                                        transition: 'background 0.1s',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{
                                            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                            background: c.online ? 'rgb(0,200,100)' : 'rgba(255,255,255,0.15)',
                                        }} />
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isSelected ? 'rgba(120,190,255,0.95)' : 'rgba(237,237,237,0.85)' }}>
                                            {c.nickname}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 2, paddingLeft: 12 }}>
                                        {c.online
                                            ? 'Online now'
                                            : c.lastSeen
                                                ? `Last seen ${new Date(c.lastSeen * 1000).toLocaleDateString()}`
                                                : 'Never connected'
                                        }
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Role editor */}
                <div style={{ ...S.panel, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {!selected ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.15)' }}>
                                Select a client
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.1)' }}>
                                Choose a client from the left to manage their groups
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Selected client header */}
                            <div style={{ ...S.divider, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{
                                            width: 8, height: 8, borderRadius: '50%',
                                            background: selected.online ? 'rgb(0,200,100)' : 'rgba(255,255,255,0.15)',
                                            flexShrink: 0,
                                        }} />
                                        <span style={{ fontSize: '1rem', fontWeight: 700 }}>{selected.nickname}</span>
                                        <span style={{
                                            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                            color: selected.online ? 'rgba(0,200,100,0.8)' : 'rgba(255,255,255,0.25)',
                                        }}>
                                            {selected.online ? 'Online' : 'Offline'}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', marginTop: 2, fontFamily: 'monospace', paddingLeft: 16 }}>
                                        {selected.uid}
                                    </div>
                                </div>
                                {busy && (
                                    <span style={{ fontSize: '0.72rem', color: 'rgba(0,130,220,0.6)', letterSpacing: '0.08em' }}>Saving…</span>
                                )}
                            </div>

                            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                                {/* Current groups */}
                                <div style={{ width: '50%', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ ...S.divider, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={S.label}>Assigned Groups</span>
                                        <span style={S.count}>{selected.groups.length}</span>
                                    </div>
                                    <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
                                        {selected.groups.length === 0 ? (
                                            <div style={{ padding: '20px 16px', fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>
                                                No groups assigned
                                            </div>
                                        ) : selected.groups.map(g => (
                                            <div
                                                key={g.id}
                                                style={{ ...S.divider, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}
                                            >
                                                <span style={{ fontSize: '0.83rem' }}>{g.name}</span>
                                                <button
                                                    disabled={busy}
                                                    onClick={() => removeGroup(g.id)}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer',
                                                        fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em',
                                                        color: busy ? 'rgba(219,0,29,0.2)' : 'rgba(219,0,29,0.6)',
                                                        padding: '2px 8px',
                                                    }}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Available groups */}
                                <div style={{ width: '50%', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ ...S.divider, padding: '10px 16px' }}>
                                        <span style={S.label}>Available Groups</span>
                                    </div>
                                    <div style={{ ...S.divider, padding: '8px 12px' }}>
                                        <input
                                            style={S.input}
                                            placeholder="Filter roles…"
                                            value={roleSearch}
                                            onChange={e => setRoleSearch(e.target.value)}
                                        />
                                    </div>
                                    <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
                                        {availableRoles.length === 0 ? (
                                            <div style={{ padding: '20px 16px', fontSize: '0.78rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>
                                                {roleSearch ? 'No match' : 'All groups assigned'}
                                            </div>
                                        ) : availableRoles.map(r => (
                                            <div
                                                key={r.id}
                                                style={{ ...S.divider, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}
                                            >
                                                <span style={{ fontSize: '0.83rem', color: 'rgba(237,237,237,0.6)' }}>{r.name}</span>
                                                <button
                                                    disabled={busy}
                                                    onClick={() => addGroup(r.id)}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer',
                                                        fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em',
                                                        color: busy ? 'rgba(0,180,100,0.2)' : 'rgba(0,180,100,0.7)',
                                                        padding: '2px 8px',
                                                    }}
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
        </div>
    )
}
