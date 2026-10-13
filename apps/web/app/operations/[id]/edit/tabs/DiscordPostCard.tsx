'use client'

import { useCallback, useEffect, useState } from 'react'
import { TIMING_LABELS, type PostDetails, type PostKind, type PostTimings, type ResolvedDetails } from '@/lib/attendance/discord-post'

interface Payload {
    own: PostDetails
    resolved: ResolvedDetails
    channelConfigured: boolean
    refreshMinutes: number
    posted: { at: string; closed: boolean } | null
}

const label: React.CSSProperties = { fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--ink-3)' }
const field: React.CSSProperties = {
    padding: '6px 8px', background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 'var(--r)',
    color: 'var(--ink)', fontFamily: 'inherit', fontSize: 12.5, minWidth: 0, width: '100%',
}

/**
 * The Discord attendance post for this operation: what it will say, and the
 * few things an operation can change about it.
 *
 * Every field is optional. Left empty it shows the default as its placeholder
 * — the usual timings for a main mission or a mid-week, and the site's server
 * details — and that default is what gets posted. Timings are minutes from the
 * operation's start: -60 is an hour before.
 *
 * The post itself is made by the server when sign-ups open, and only if a
 * channel has been configured for this kind of operation. This card says which
 * of those is the case rather than leaving a missing post to be a mystery.
 */
export default function DiscordPostCard({ opID }: { opID: string }) {
    const [data, setData] = useState<Payload | null>(null)
    const [draft, setDraft] = useState<PostDetails>({})
    const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')

    const load = useCallback(() => {
        fetch(`/api/operations/${opID}/attendance/post`)
            .then(r => (r.ok ? r.json() : null))
            .then((d: Payload | null) => { if (d) { setData(d); setDraft(d.own ?? {}) } })
            .catch(() => { })
    }, [opID])
    useEffect(() => { load() }, [load])

    if (!data) return null

    const set = (patch: Partial<PostDetails>) => { setDraft(prev => ({ ...prev, ...patch })); setState('idle') }
    const setTiming = (key: keyof PostTimings, raw: string) => {
        const timings = { ...(draft.timings ?? {}) }
        if (raw.trim() === '' || Number.isNaN(Number(raw))) delete timings[key]
        else timings[key] = Number(raw)
        set({ timings })
    }

    const save = async () => {
        setState('saving')
        const res = await fetch(`/api/operations/${opID}/attendance/post`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
        }).catch(() => null)
        if (!res?.ok) { setState('failed'); return }
        const next: Payload = await res.json()
        setData(next)
        setDraft(next.own ?? {})
        setState('saved')
    }

    // The defaults to show as placeholders follow the kind being chosen.
    const kind: PostKind = draft.kind ?? data.resolved.kind

    return (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: data.channelConfigured ? 'var(--ink-3)' : 'var(--warn)' }}>
                {data.posted
                    ? (data.posted.closed
                        ? 'The post is up and closed: sign-ups have shut.'
                        : `The post is up. Its roster picture is redrawn at most every ${data.refreshMinutes} minutes, when the roster has changed.`)
                    : data.channelConfigured
                        ? 'The bot posts this in Discord when sign-ups open, with buttons to sign up and a picture of the roster.'
                        : `No Discord channel is set for ${data.resolved.kind === 'main' ? 'main missions' : 'mid-weeks'} yet, so nothing will be posted for this operation.`}
            </p>

            <div>
                <div style={{ ...label, marginBottom: 6 }}>Kind</div>
                <select aria-label='Kind of operation' style={{ ...field, maxWidth: 260 }} value={draft.kind ?? ''} onChange={e => set({ kind: (e.target.value || undefined) as PostKind | undefined })}>
                    <option value=''>By day: {data.resolved.kind === 'main' && !draft.kind ? 'main mission' : draft.kind ? 'automatic' : 'mid-week'}</option>
                    <option value='main'>Main mission</option>
                    <option value='midweek'>Mid-week</option>
                </select>
            </div>

            <div>
                <div style={{ ...label, marginBottom: 6 }}>Timings, in minutes from the start</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                    {TIMING_LABELS.map(t => (
                        <label key={t.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: 'var(--ink-2)' }}>
                            {t.label}
                            <input
                                type='number'
                                style={field}
                                placeholder={String(kind === data.resolved.kind ? data.resolved.timings[t.key] : '')}
                                value={draft.timings?.[t.key] ?? ''}
                                onChange={e => setTiming(t.key, e.target.value)}
                            />
                        </label>
                    ))}
                </div>
            </div>

            <div>
                <div style={{ ...label, marginBottom: 6 }}>Server and modlist, if different for this operation</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
                    <input aria-label='Server address' style={field} placeholder={data.resolved.serverAddress || 'Server address'} value={draft.serverAddress ?? ''} onChange={e => set({ serverAddress: e.target.value })} />
                    <input aria-label='Server port' style={field} placeholder={data.resolved.serverPort || 'Port'} value={draft.serverPort ?? ''} onChange={e => set({ serverPort: e.target.value })} />
                    <input aria-label='Server password' style={field} placeholder={data.resolved.serverPassword ? 'Site default password' : 'Password'} value={draft.serverPassword ?? ''} onChange={e => set({ serverPassword: e.target.value })} />
                    <input aria-label='Modlist link' style={field} placeholder={data.resolved.modlistUrl || 'Modlist link (https://…)'} value={draft.modlistUrl ?? ''} onChange={e => set({ modlistUrl: e.target.value })} />
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                    type='button'
                    onClick={save}
                    disabled={state === 'saving'}
                    style={{
                        padding: '7px 16px', border: '1px solid var(--acc)', borderRadius: 'var(--r)', background: 'rgba(var(--acc-rgb), 0.14)',
                        color: 'var(--ink)', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
                    }}
                >
                    {state === 'saving' ? 'Saving…' : 'Save post details'}
                </button>
                <span style={{ fontSize: 11.5, color: state === 'failed' ? 'var(--crit)' : 'var(--ink-3)' }}>
                    {state === 'saved' ? 'Saved' : state === 'failed' ? 'Not saved. Try again.' : ''}
                </span>
            </div>
        </div>
    )
}
