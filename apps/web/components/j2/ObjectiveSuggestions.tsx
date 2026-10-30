'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { OBJECTIVE_FIELDS, matchesObjectiveSearch, type ObjectiveFields } from '@/lib/j2/objective-suggestions'
import type { ObjectiveView } from '@/lib/j2/objective-access'

const MIRROR_REFRESH_MS = 15_000

const input: React.CSSProperties = {
    padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line-2)', color: 'inherit',
    fontSize: '0.82rem', fontFamily: 'inherit', minWidth: 0, width: '100%',
}
const label: React.CSSProperties = { fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--txt-3)' }
const btn = (primary = false): React.CSSProperties => ({
    padding: '6px 13px', cursor: 'pointer', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    background: primary ? 'rgba(219,0,29,0.14)' : 'transparent',
    border: `1px solid ${primary ? 'var(--red)' : 'var(--line-2)'}`, color: primary ? '#ededed' : 'var(--txt-2)',
})

const blank = (): ObjectiveFields => ({ name: '', overview: '', intel: '', linkedIntel: '', comments: '' })

/**
 * Objective Suggestions, in both of the places it appears.
 *
 * On the J2 dashboard it is the working list: mission makers search it, edit
 * an entry, add one of their own. On the All Staff dashboard (`mirror`) it is
 * the same list, read-only, re-read every fifteen seconds so it follows J2's
 * edits without anybody reloading — one component over one route, so the
 * mirror cannot drift from what it mirrors.
 *
 * `mirror` only hides the controls. Whether an edit is allowed is the route's
 * decision; a staff member who is not in J2 could not save one anyway.
 */
export default function ObjectiveSuggestions({ mirror = false }: { mirror?: boolean }) {
    const [items, setItems] = useState<ObjectiveView[] | null>(null)
    const [canEdit, setCanEdit] = useState(false)
    const [canConfirm, setCanConfirm] = useState(false)
    const [failed, setFailed] = useState(false)
    const [query, setQuery] = useState('')
    const [editing, setEditing] = useState<{ id: string | null; fields: ObjectiveFields } | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(() => {
        fetch('/api/j2/objective-suggestions', { cache: 'no-store' })
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then(d => { setItems(d.items ?? []); setCanEdit(!!d.canEdit); setCanConfirm(!!d.canConfirm); setFailed(false) })
            .catch(() => setFailed(true))
    }, [])

    useEffect(() => {
        load()
        if (!mirror) return
        const timer = setInterval(load, MIRROR_REFRESH_MS)
        return () => clearInterval(timer)
    }, [load, mirror])

    const editable = canEdit && !mirror
    const shown = useMemo(() => (items ?? []).filter(o => matchesObjectiveSearch(o, query)), [items, query])

    const save = async () => {
        if (!editing) return
        setBusy(true)
        setError(null)
        const res = await fetch(editing.id ? `/api/j2/objective-suggestions/${editing.id}` : '/api/j2/objective-suggestions', {
            method: editing.id ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(editing.fields),
        }).catch(() => null)
        setBusy(false)
        if (!res?.ok) {
            const info = await res?.json().catch(() => null)
            setError(info?.error ?? 'That did not save. Try again.')
            return
        }
        setEditing(null)
        load()
    }

    const remove = async (o: ObjectiveView) => {
        if (!window.confirm(`Remove "${o.name}" from Objective Suggestions?`)) return
        setBusy(true)
        await fetch(`/api/j2/objective-suggestions/${o.id}`, { method: 'DELETE' }).catch(() => null)
        setBusy(false)
        load()
    }

    if (failed && !items) return <p style={{ padding: 24, color: 'var(--txt-3)' }}>Objective suggestions did not load. Reload to try again.</p>
    if (!items) return <p style={{ padding: 24, color: 'var(--txt-3)' }}>Loading…</p>

    return (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1000 }}>
            <p style={{ margin: 0, color: 'var(--txt-2)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                Objective ideas confirmed by J2, for mission makers to draw on.
                {mirror
                    ? ' This is a live view of the J2 list: it updates as J2 change it, and is edited there.'
                    : ' Anybody can pitch one through a ticket (Mission / Campaign Ideas, then Objective Idea).'}
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input aria-label='Search objective suggestions' style={{ ...input, flex: '1 1 260px', width: 'auto' }}
                    placeholder='Search objectives' value={query} onChange={e => setQuery(e.target.value)} />
                {editable && !editing && (
                    <button type='button' style={btn(true)} onClick={() => { setError(null); setEditing({ id: null, fields: blank() }) }}>Add an objective</button>
                )}
            </div>

            {editing && (
                <section style={{ border: '1px solid var(--line-2)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={label}>{editing.id ? 'Edit objective' : 'New objective'}</span>
                    {error && <div role='alert' style={{ color: '#ff8a80', fontSize: '0.8rem' }}>{error}</div>}
                    {OBJECTIVE_FIELDS.map(f => (
                        <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={label}>{f.label}</span>
                            {f.long ? (
                                <textarea style={{ ...input, minHeight: 70, resize: 'vertical' }} placeholder={f.hint} maxLength={f.max}
                                    value={editing.fields[f.key]} onChange={e => setEditing({ ...editing, fields: { ...editing.fields, [f.key]: e.target.value } })} />
                            ) : (
                                <input style={input} placeholder={f.hint} maxLength={f.max}
                                    value={editing.fields[f.key]} onChange={e => setEditing({ ...editing, fields: { ...editing.fields, [f.key]: e.target.value } })} />
                            )}
                        </label>
                    ))}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type='button' style={btn(true)} disabled={busy || !editing.fields.name.trim() || !editing.fields.overview.trim()} onClick={save}>
                            {editing.id ? 'Save changes' : 'Add'}
                        </button>
                        <button type='button' style={btn()} disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                </section>
            )}

            <span style={label}>{shown.length} of {items.length} objective{items.length === 1 ? '' : 's'}</span>

            {shown.length === 0 && (
                <p style={{ margin: 0, color: 'var(--txt-3)', fontSize: '0.85rem' }}>
                    {items.length === 0 ? 'No objective ideas have been confirmed yet.' : 'Nothing matches that search.'}
                </p>
            )}

            {shown.map(o => (
                <article key={o.id} style={{ border: '1px solid var(--line-2)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.98rem' }}>{o.name}</strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--txt-3)' }}>
                            {o.suggestedByName ? `Suggested by ${o.suggestedByName}` : `Added by ${o.addedByName}`}
                        </span>
                        {o.sourceTicketId && <a href={`/tickets/${o.sourceTicketId}`} style={{ fontSize: '0.72rem', color: 'rgba(160,190,235,0.9)' }}>Original ticket</a>}
                        {editable && (
                            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                <button type='button' style={btn()} onClick={() => {
                                    setError(null)
                                    setEditing({ id: o.id, fields: { name: o.name, overview: o.overview, intel: o.intel, linkedIntel: o.linkedIntel, comments: o.comments } })
                                    window.scrollTo({ top: 0, behavior: 'smooth' })
                                }}>Edit</button>
                                {canConfirm && <button type='button' style={btn()} disabled={busy} onClick={() => remove(o)}>Remove</button>}
                            </span>
                        )}
                    </div>
                    {OBJECTIVE_FIELDS.filter(f => f.key !== 'name' && o[f.key]).map(f => (
                        <div key={f.key}>
                            <span style={label}>{f.label}</span>
                            <p style={{ margin: '3px 0 0', fontSize: '0.84rem', lineHeight: 1.6, color: 'var(--txt-2)', whiteSpace: 'pre-wrap' }}>{o[f.key]}</p>
                        </div>
                    ))}
                </article>
            ))}
        </div>
    )
}
