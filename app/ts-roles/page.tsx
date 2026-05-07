'use client'

import { useEffect, useState } from 'react'

interface Group {
    id: number
    name: string
    sortid: number
}

export default function TsRolesPage() {
    const [groups, setGroups] = useState<Group[]>([])
    const [loading, setLoading] = useState(true)
    const [err, setErr] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/teamspeak/roles-ordered')
            .then(r => r.json())
            .then(d => {
                if (d.error) throw new Error(d.error)
                setGroups(d.groups ?? [])
            })
            .catch(e => setErr(e.message))
            .finally(() => setLoading(false))
    }, [])

    return (
        <div style={{ minHeight: '100vh', background: '#0e0e0e', color: '#ededed', fontFamily: 'monospace', padding: '40px 48px' }}>
            <div style={{ maxWidth: 600 }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 6 }}>
                    TeamSpeak — Server Groups
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 32 }}>
                    Role List
                </div>

                {loading && (
                    <div style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.85rem' }}>Connecting to TeamSpeak…</div>
                )}

                {err && (
                    <div style={{ color: 'rgba(219,80,80,0.9)', fontSize: '0.85rem' }}>{err}</div>
                )}

                {!loading && !err && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {groups.map(g => (
                            <div key={g.id} style={{ fontSize: '0.88rem' }}>{g.name}</div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
