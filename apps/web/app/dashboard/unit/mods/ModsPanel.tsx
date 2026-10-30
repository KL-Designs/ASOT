'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    MOD_STATUSES, MOD_STATUS_COLOUR, MOD_STATUS_LABEL, MOD_LIMITS, matchesModSearch, type ModStatus,
} from '@/lib/mods/mod-database'
import type { ModView } from '@/lib/mods/access'

const input: React.CSSProperties = {
    padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line-2)', color: 'inherit',
    fontSize: '0.82rem', fontFamily: 'inherit', minWidth: 0,
}
const label: React.CSSProperties = { fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--txt-3)' }
const btn = (primary = false): React.CSSProperties => ({
    padding: '7px 14px', cursor: 'pointer', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    background: primary ? 'rgba(219,0,29,0.14)' : 'transparent',
    border: `1px solid ${primary ? 'var(--red)' : 'var(--line-2)'}`, color: primary ? '#ededed' : 'var(--txt-2)',
})

type Draft = { id: string | null; name: string; workshopUrl: string; status: ModStatus; notes: string; testedByName: string; testedOn: string }

const blank = (): Draft => ({ id: null, name: '', workshopUrl: '', status: 'testing', notes: '', testedByName: '', testedOn: '' })

/**
 * The Mod Database.
 *
 * A list first, because that is what nearly everybody is here for: "is this
 * mod approved, and does it have problems". The whole list is loaded and
 * filtered in the browser as you type — it is a few hundred short rows — and
 * the form to add or edit an entry only exists for J2 and J7.
 */
export default function ModsPanel() {
    const [mods, setMods] = useState<ModView[] | null>(null)
    const [canEdit, setCanEdit] = useState(false)
    const [failed, setFailed] = useState(false)
    const [query, setQuery] = useState('')
    const [status, setStatus] = useState<ModStatus | 'all'>('all')
    const [draft, setDraft] = useState<Draft | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(() => {
        fetch('/api/mods')
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then(d => { setMods(d.mods ?? []); setCanEdit(!!d.canEdit) })
            .catch(() => setFailed(true))
    }, [])
    useEffect(() => { load() }, [load])

    const shown = useMemo(
        () => (mods ?? []).filter(m => (status === 'all' || m.status === status) && matchesModSearch(m, query)),
        [mods, status, query],
    )

    const save = async () => {
        if (!draft) return
        setBusy(true)
        setError(null)
        const { id, ...fields } = draft
        const res = await fetch(id ? `/api/mods/${id}` : '/api/mods', {
            method: id ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields),
        }).catch(() => null)
        setBusy(false)
        if (!res?.ok) {
            const info = await res?.json().catch(() => null)
            setError(info?.error ?? 'That did not save. Try again.')
            return
        }
        setDraft(null)
        load()
    }

    const remove = async (mod: ModView) => {
        if (!window.confirm(`Remove ${mod.name} from the mod database?`)) return
        setBusy(true)
        await fetch(`/api/mods/${mod.id}`, { method: 'DELETE' }).catch(() => null)
        setBusy(false)
        setDraft(null)
        load()
    }

    if (failed) return <p style={{ padding: 24, color: 'var(--txt-3)' }}>The mod database did not load. Reload to try again.</p>
    if (!mods) return <p style={{ padding: 24, color: 'var(--txt-3)' }}>Loading…</p>

    return (
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
            <header>
                <h1 style={{ margin: 0, fontSize: '1.3rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Mod Database</h1>
                <p style={{ margin: '6px 0 0', color: 'var(--txt-2)', fontSize: '0.85rem', lineHeight: 1.55, maxWidth: 760 }}>
                    Every mod the unit has looked at: whether it is approved, still being tested or rejected, and any problems we know about.
                </p>
            </header>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    aria-label='Search mods'
                    style={{ ...input, flex: '1 1 260px' }}
                    placeholder='Search by name, issue or tester'
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
                <select aria-label='Filter by status' style={input} value={status} onChange={e => setStatus(e.target.value as ModStatus | 'all')}>
                    <option value='all'>Every status</option>
                    {MOD_STATUSES.map(s => <option key={s} value={s}>{MOD_STATUS_LABEL[s]}</option>)}
                </select>
                {canEdit && !draft && <button type='button' style={btn(true)} onClick={() => { setError(null); setDraft(blank()) }}>Add a mod</button>}
            </div>

            {draft && (
                <section style={{ border: '1px solid var(--line-2)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={label}>{draft.id ? 'Edit mod' : 'New mod'}</span>
                    {error && <div role='alert' style={{ color: '#ff8a80', fontSize: '0.8rem' }}>{error}</div>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input aria-label='Mod name' style={{ ...input, flex: '2 1 240px' }} placeholder='Mod name' maxLength={MOD_LIMITS.name}
                            value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                        <select aria-label='Status' style={input} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as ModStatus })}>
                            {MOD_STATUSES.map(s => <option key={s} value={s}>{MOD_STATUS_LABEL[s]}</option>)}
                        </select>
                    </div>
                    <input aria-label='Workshop link' style={input} placeholder='Workshop link (https://…)' maxLength={MOD_LIMITS.url}
                        value={draft.workshopUrl} onChange={e => setDraft({ ...draft, workshopUrl: e.target.value })} />
                    <textarea aria-label='Notes and known issues' style={{ ...input, minHeight: 90, resize: 'vertical' }}
                        placeholder='Known issues, test notes, or why it was rejected' maxLength={MOD_LIMITS.notes}
                        value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input aria-label='Tested by' style={{ ...input, flex: '1 1 200px' }} placeholder='Tested by' maxLength={MOD_LIMITS.testedByName}
                            value={draft.testedByName} onChange={e => setDraft({ ...draft, testedByName: e.target.value })} />
                        <input aria-label='Tested on' type='date' style={input}
                            value={draft.testedOn} onChange={e => setDraft({ ...draft, testedOn: e.target.value })} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type='button' style={btn(true)} disabled={busy || !draft.name.trim()} onClick={save}>{draft.id ? 'Save changes' : 'Add to database'}</button>
                        <button type='button' style={btn()} disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
                    </div>
                </section>
            )}

            <p style={{ ...label, margin: 0 }}>{shown.length} of {mods.length} mod{mods.length === 1 ? '' : 's'}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shown.length === 0 && (
                    <p style={{ margin: 0, color: 'var(--txt-3)', fontSize: '0.85rem' }}>
                        {mods.length === 0 ? 'Nothing has been added yet.' : 'No mods match that search.'}
                    </p>
                )}
                {shown.map(mod => (
                    <article key={mod.id} style={{ border: '1px solid var(--line-2)', borderLeft: `3px solid ${MOD_STATUS_COLOUR[mod.status]}`, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.95rem' }}>{mod.name}</strong>
                            <span style={{ ...label, color: MOD_STATUS_COLOUR[mod.status] }}>{MOD_STATUS_LABEL[mod.status]}</span>
                            {mod.workshopUrl && (
                                <a href={mod.workshopUrl} target='_blank' rel='noopener noreferrer' style={{ fontSize: '0.75rem', color: 'rgba(160,190,235,0.9)' }}>
                                    Workshop page
                                </a>
                            )}
                            {mod.sourceTicketId && (
                                <a href={`/tickets/${mod.sourceTicketId}`} style={{ fontSize: '0.75rem', color: 'var(--txt-3)' }}>From a mod request</a>
                            )}
                            {canEdit && (
                                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                    <button type='button' style={btn()} onClick={() => {
                                        setError(null)
                                        setDraft({
                                            id: mod.id, name: mod.name, workshopUrl: mod.workshopUrl ?? '', status: mod.status,
                                            notes: mod.notes, testedByName: mod.testedByName, testedOn: mod.testedOn,
                                        })
                                        window.scrollTo({ top: 0, behavior: 'smooth' })
                                    }}>Edit</button>
                                    <button type='button' style={btn()} disabled={busy} onClick={() => remove(mod)}>Remove</button>
                                </span>
                            )}
                        </div>
                        {mod.notes && <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.55, color: 'var(--txt-2)', whiteSpace: 'pre-wrap' }}>{mod.notes}</p>}
                        <span style={{ fontSize: '0.72rem', color: 'var(--txt-3)' }}>
                            {mod.testedByName || mod.testedOn
                                ? `Tested${mod.testedByName ? ` by ${mod.testedByName}` : ''}${mod.testedOn ? ` on ${new Date(`${mod.testedOn}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`
                                : 'No test recorded'}
                        </span>
                    </article>
                ))}
            </div>
        </div>
    )
}
