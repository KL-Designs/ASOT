'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Kind = 'rank' | 'award' | 'campaign' | 'certification'

interface Item {
    kind: Kind
    key: string
    via: 'link' | 'name' | null
    tsGroupId: number | null
    tsGroupName: string | null
}

interface Payload {
    tsAvailable: boolean
    groups: { id: number; name: string }[]
    items: Item[]
}

const KINDS: { key: Kind; label: string }[] = [
    { key: 'campaign', label: 'Campaigns' },
    { key: 'award', label: 'Awards' },
    { key: 'rank', label: 'Ranks' },
    { key: 'certification', label: 'Certifications' },
]

const cell: React.CSSProperties = { padding: '7px 12px', borderBottom: '1px solid var(--line-2)', fontSize: '0.8rem' }
const head: React.CSSProperties = {
    ...cell, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--txt-3)', textAlign: 'left',
}

/**
 * Which TeamSpeak group each rank, award, campaign and certification grants.
 *
 * Most rows are already matched by name and need nothing. The rows worth
 * looking at are the unmatched ones — a new campaign, or a group renamed on
 * the server — which is why they sort to the top and why Campaigns is the
 * first tab: it is the kind that keeps getting new entries.
 */
export default function TeamspeakLinks() {
    const [data, setData] = useState<Payload | null>(null)
    const [failed, setFailed] = useState(false)
    const [kind, setKind] = useState<Kind>('campaign')
    const [saving, setSaving] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(() => {
        fetch('/api/admin/teamspeak/links')
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then(setData)
            .catch(() => setFailed(true))
    }, [])
    useEffect(() => { load() }, [load])

    const rows = useMemo(() => {
        const list = (data?.items ?? []).filter(i => i.kind === kind)
        // Unmatched first: those are the ones that will not sync.
        return list.slice().sort((a, b) => Number(!!a.via) - Number(!!b.via))
    }, [data, kind])

    const save = async (item: Item, tsGroupId: number | null) => {
        const id = `${item.kind}:${item.key}`
        setSaving(id)
        setError(null)
        const res = await fetch('/api/admin/teamspeak/links', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: item.kind, key: item.key, tsGroupId }),
        }).catch(() => null)
        if (!res?.ok) {
            const body = await res?.json().catch(() => null)
            setError(body?.error ?? 'Could not save that link.')
        }
        setSaving(null)
        load()
    }

    if (failed) return <p style={{ color: 'var(--txt-3)' }}>The group links did not load. Reload to try again.</p>
    if (!data) return <p style={{ color: 'var(--txt-3)' }}>Loading…</p>

    const unmatched = (k: Kind) => data.items.filter(i => i.kind === k && !i.via).length

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, gap: 12 }}>
            <p style={{ margin: 0, color: 'var(--txt-2)', fontSize: '0.82rem', lineHeight: 1.55, maxWidth: 860 }}>
                What a member is given on TeamSpeak for what is on their MILPAC. A row matched by name needs nothing.
                Pick a group for anything unmatched, such as a new campaign. Rank groups are swapped when a rank changes;
                awards, campaigns and certifications are only ever added.
            </p>

            {!data.tsAvailable && (
                <p style={{ margin: 0, color: '#f59e0b', fontSize: '0.8rem' }}>
                    TeamSpeak is not reachable, so no groups can be listed or matched right now.
                </p>
            )}
            {error && <p style={{ margin: 0, color: '#ff8a80', fontSize: '0.8rem' }}>{error}</p>}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {KINDS.map(k => {
                    const n = unmatched(k.key)
                    const on = kind === k.key
                    return (
                        <button
                            key={k.key}
                            type='button'
                            onClick={() => setKind(k.key)}
                            style={{
                                padding: '5px 12px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                                cursor: 'pointer', background: on ? 'rgba(219,0,29,0.14)' : 'transparent',
                                border: `1px solid ${on ? 'var(--red)' : 'var(--line-2)'}`, color: on ? 'var(--txt-1, #ededed)' : 'var(--txt-2)',
                            }}
                        >
                            {k.label}{n > 0 ? ` · ${n} unmatched` : ''}
                        </button>
                    )
                })}
            </div>

            <div style={{ overflow: 'auto', border: '1px solid var(--line-2)', minHeight: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={head}>{KINDS.find(k => k.key === kind)?.label}</th>
                            <th style={head}>TeamSpeak group</th>
                            <th style={head}>Matched</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(item => {
                            const id = `${item.kind}:${item.key}`
                            return (
                                <tr key={id}>
                                    <td style={cell}>{item.key}</td>
                                    <td style={cell}>
                                        <select
                                            aria-label={`TeamSpeak group for ${item.key}`}
                                            disabled={saving === id || !data.tsAvailable}
                                            value={item.tsGroupId ?? ''}
                                            onChange={e => save(item, e.target.value ? Number(e.target.value) : null)}
                                            style={{
                                                width: '100%', maxWidth: 380, padding: '5px 8px', background: 'var(--s2, #14161a)',
                                                color: 'inherit', border: '1px solid var(--line-2)', fontSize: '0.8rem',
                                            }}
                                        >
                                            <option value=''>{item.via === 'link' ? 'Clear the link' : 'No group'}</option>
                                            {data.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                        </select>
                                    </td>
                                    <td style={{ ...cell, color: item.via ? 'var(--txt-2)' : '#f59e0b', whiteSpace: 'nowrap' }}>
                                        {item.via === 'link' ? 'Linked here' : item.via === 'name' ? 'By name' : 'Unmatched'}
                                    </td>
                                </tr>
                            )
                        })}
                        {rows.length === 0 && (
                            <tr><td style={{ ...cell, color: 'var(--txt-3)' }} colSpan={3}>Nothing here yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
