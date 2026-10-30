'use client'

import { useCallback, useEffect, useState } from 'react'
import { RATING_ASPECTS, RATING_SCALE } from '@/lib/operations/aar'
import { VEHICLE_STATUSES } from '@/lib/operations/aar-access'
import { useMissionAarLive } from './useMissionAarLive'
import s from './aar.module.css'

/**
 * Row 328's consolidated view, below the member's own forms once they are in.
 * Staff order: Mission AAR (when switched on), Call Sign AAR points (only the
 * sections this viewer may read), Mission Feedback, Commendations (row 330).
 */

type Vehicle = { name: string; status: string; note: string }

interface Block {
    section: string
    canEdit: boolean
    situation: string
    missingCaptured: string
    vehicles: Vehicle[]
    updatedAt: string | null
    updatedByName: string | null
}

interface Data {
    missionAar: Block[] | null
    callSigns: { section: string; entries: { userId: string; name: string; fix: string; improve: string; sustain: string; writtenByName: string | null }[] }[]
    feedback: { responses: number; averages: Record<string, number | null>; comments: string[] | null }
    commendations: { id: string; authorName: string; authorSection: string; targetType: 'member' | 'callsign'; targetName: string; wording: string; createdAt: string; mine: boolean }[]
    canDeleteAnyCommendation: boolean
}

export interface ConsolidatedProps {
    operationId: string
    missionAar: { enabled: boolean; canToggle: boolean; scope: 'campaign' | 'operation' }
    canCommend: boolean
    sections: string[]
    onToggled: () => void
}

function labelFor(avg: number | null): string {
    if (avg === null) return 'No answers'
    const step = RATING_SCALE.reduce((best, st) => Math.abs(st.value - avg) < Math.abs(best.value - avg) ? st : best)
    return `${avg.toFixed(1)} · ${step.label}`
}

export default function Consolidated({ operationId, missionAar, canCommend, sections, onToggled }: ConsolidatedProps) {
    const [data, setData] = useState<Data | null>(null)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(() => {
        fetch(`/api/operations/${operationId}/aar/consolidated`)
            .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error)))
            .then(setData)
            .catch(e => setError(typeof e === 'string' ? e : 'The consolidated view did not load.'))
    }, [operationId])
    useEffect(load, [load])

    const live = useMissionAarLive(operationId, missionAar.enabled, load)

    async function toggle(enabled: boolean) {
        const res = await fetch(`/api/operations/${operationId}/aar/settings`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ missionAar: enabled }),
        })
        if (res.ok) { onToggled(); load() }
    }

    if (error) return <div className={s.notice}><p className={s.noticeBody}>{error}</p></div>
    if (!data) return <p className={s.loading}>Loading the Mission AAR…</p>

    return (
        <>
            <p className={s.divider}>Mission After Action Report</p>

            {missionAar.canToggle && (
                <section className={s.card}>
                    <div className={s.cardBody}>
                        <label className={s.toggle}>
                            <input type='checkbox' checked={missionAar.enabled} onChange={e => toggle(e.target.checked)} />
                            <span>
                                Shared Mission AAR block for each call sign (Situation, MIA / Captured, Vehicle Status)
                                {missionAar.scope === 'campaign' ? ', for every mission in this campaign' : ''}
                            </span>
                        </label>
                    </div>
                </section>
            )}

            {data.missionAar && data.missionAar.length > 0 && (
                <>
                    {live.peers.length > 0 && (
                        <div className={s.peers}>
                            <span>Also here:</span>
                            {live.peers.map((p, i) => (
                                <span key={i} className={s.peer} style={{ borderColor: p.color }}>{p.name}{p.section ? ` · ${p.section}` : ''}</span>
                            ))}
                        </div>
                    )}
                    {data.missionAar.map(block => (
                        <MissionBlock key={`${block.section}-${block.updatedAt ?? ''}`} operationId={operationId} block={block}
                            onFocus={live.focus} onSaved={() => { live.saved(block.section); load() }} />
                    ))}
                </>
            )}

            {data.callSigns.length > 0 && (
                <section className={s.card}>
                    <div className={s.cardHead}>
                        <h2 className={s.cardTitle}>Call Sign AAR Points</h2>
                        <span className={s.cardNote}>Only the sections you are responsible for</span>
                    </div>
                    <div className={s.cardBody}>
                        {data.callSigns.map(cs => <CallSignPoints key={cs.section} {...cs} />)}
                    </div>
                </section>
            )}

            <section className={s.card}>
                <div className={s.cardHead}>
                    <h2 className={s.cardTitle}>Mission Feedback</h2>
                    <span className={s.cardNote}>{data.feedback.responses} response{data.feedback.responses === 1 ? '' : 's'} · compared to a normal night</span>
                </div>
                <div className={s.cardBody}>
                    {RATING_ASPECTS.map(a => (
                        <div key={a.key} className={s.average}>
                            <span>{a.label}</span>
                            <span>{labelFor(data.feedback.averages[a.key] ?? null)}</span>
                        </div>
                    ))}
                    {data.feedback.comments && data.feedback.comments.length > 0 && (
                        <div className={s.field} style={{ marginTop: 14 }}>
                            <span className={s.fieldLabel}>Comments</span>
                            {data.feedback.comments.map((c, i) => <p key={i} className={s.fieldHint} style={{ whiteSpace: 'pre-wrap' }}>{c}</p>)}
                        </div>
                    )}
                </div>
            </section>

            <Commendations operationId={operationId} items={data.commendations} canCommend={canCommend} sections={sections}
                canDeleteAny={data.canDeleteAnyCommendation} onChange={load} />
        </>
    )
}

function CallSignPoints({ section, entries }: Data['callSigns'][number]) {
    const [open, setOpen] = useState(false)
    return (
        <div style={{ marginBottom: 8 }}>
            <button type='button' className={s.writeup} onClick={() => setOpen(v => !v)}>
                {open ? '▾' : '▸'} {section} · {entries.length} report{entries.length === 1 ? '' : 's'}
            </button>
            {open && (entries.length === 0
                ? <p className={s.fieldHint}>No reports yet.</p>
                : entries.map(e => (
                    <div key={e.userId}>
                        <p className={s.byline}>{e.name}{e.writtenByName ? ` (written by ${e.writtenByName})` : ''}</p>
                        <div className={s.points}>
                            <div><strong>Fix</strong><br />{e.fix || '—'}</div>
                            <div><strong>Improve</strong><br />{e.improve || '—'}</div>
                            <div><strong>Sustain</strong><br />{e.sustain || '—'}</div>
                        </div>
                    </div>
                )))}
        </div>
    )
}

function MissionBlock({ operationId, block, onFocus, onSaved }: {
    operationId: string
    block: Block
    onFocus: (section: string | null) => void
    onSaved: () => void
}) {
    const [value, setValue] = useState({ situation: block.situation, missingCaptured: block.missingCaptured, vehicles: block.vehicles })
    const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
    const ro = !block.canEdit

    async function save() {
        setState('saving')
        const res = await fetch(`/api/operations/${operationId}/aar/mission`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: block.section, ...value }),
        }).catch(() => null)
        if (res?.ok) { setState('saved'); onSaved() } else setState('failed')
    }

    const setVehicle = (i: number, patch: Partial<Vehicle>) => setValue(v => ({ ...v, vehicles: v.vehicles.map((x, j) => j === i ? { ...x, ...patch } : x) }))

    return (
        <section className={s.card} onFocus={() => onFocus(block.section)} onBlur={() => onFocus(null)}>
            <div className={s.cardHead}>
                <h2 className={s.cardTitle}>Mission AAR · {block.section}</h2>
                {block.updatedByName && <span className={s.cardNote}>Last saved by {block.updatedByName}</span>}
            </div>
            <div className={s.cardBody}>
                <div className={s.field}>
                    <span className={s.fieldLabel}>Situation</span>
                    <span className={s.fieldHint}>Where the call sign finished and what state it was in.</span>
                    <textarea className={s.textarea} readOnly={ro} value={value.situation} onChange={e => setValue(v => ({ ...v, situation: e.target.value }))} />
                </div>
                <div className={s.field}>
                    <span className={s.fieldLabel}>MIA / Captured</span>
                    <textarea className={s.textarea} readOnly={ro} value={value.missingCaptured} onChange={e => setValue(v => ({ ...v, missingCaptured: e.target.value }))} />
                </div>
                <div className={s.field}>
                    <span className={s.fieldLabel}>Vehicle Status</span>
                    {value.vehicles.map((v, i) => (
                        <div key={i} className={s.vehicleRow}>
                            <input className={s.input} placeholder='Vehicle' value={v.name} readOnly={ro} onChange={e => setVehicle(i, { name: e.target.value })} />
                            <select className={s.select} value={v.status} disabled={ro} onChange={e => setVehicle(i, { status: e.target.value })}>
                                <option value=''>Status…</option>
                                {VEHICLE_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                            </select>
                            <input className={s.input} placeholder='Note' value={v.note} readOnly={ro} onChange={e => setVehicle(i, { note: e.target.value })} />
                            {!ro && <button type='button' className={s.writeup} onClick={() => setValue(x => ({ ...x, vehicles: x.vehicles.filter((_, j) => j !== i) }))}>Remove</button>}
                        </div>
                    ))}
                    {!ro && (
                        <button type='button' className={s.writeup} style={{ alignSelf: 'flex-start' }}
                            onClick={() => setValue(x => ({ ...x, vehicles: [...x.vehicles, { name: '', status: '', note: '' }] }))}>
                            Add vehicle
                        </button>
                    )}
                </div>
                {!ro && (
                    <div className={s.actions}>
                        <button type='button' className={s.save} disabled={state === 'saving'} onClick={save}>{state === 'saving' ? 'Saving…' : 'Save Mission AAR'}</button>
                        {state === 'saved' && <span className={`${s.state} ${s.stateOk}`}>Saved</span>}
                        {state === 'failed' && <span className={`${s.state} ${s.stateBad}`}>Not saved — try again</span>}
                    </div>
                )}
            </div>
        </section>
    )
}

function Commendations({ operationId, items, canCommend, sections, canDeleteAny, onChange }: {
    operationId: string
    items: Data['commendations']
    canCommend: boolean
    sections: string[]
    canDeleteAny: boolean
    onChange: () => void
}) {
    const [targetType, setTargetType] = useState<'member' | 'callsign'>('member')
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<{ userId: string; name: string }[]>([])
    const [member, setMember] = useState<{ userId: string; name: string } | null>(null)
    const [callsign, setCallsign] = useState('')
    const [wording, setWording] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        const term = query.trim()
        if (term.length < 2 || member) return
        const t = setTimeout(() => {
            fetch(`/api/operations/${operationId}/aar/members?on=1&q=${encodeURIComponent(term)}`)
                .then(r => r.ok ? r.json() : { members: [] })
                .then(d => setResults(d.members ?? []))
                .catch(() => setResults([]))
        }, 250)
        return () => clearTimeout(t)
    }, [query, member, operationId])

    async function submit() {
        setBusy(true); setError(null)
        const body = targetType === 'member' ? { targetType, targetUserId: member?.userId, wording } : { targetType, targetName: callsign, wording }
        const res = await fetch(`/api/operations/${operationId}/aar/commendations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
        setBusy(false)
        if (!res?.ok) { const d = await res?.json().catch(() => ({})); setError(d?.error ?? 'Not saved — try again'); return }
        setWording(''); setMember(null); setQuery(''); setCallsign('')
        onChange()
    }

    async function remove(id: string) {
        const res = await fetch(`/api/operations/${operationId}/aar/commendations`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
        if (res.ok) onChange()
    }

    return (
        <section className={s.card}>
            <div className={s.cardHead}>
                <h2 className={s.cardTitle}>Commendations</h2>
                <span className={s.cardNote}>Rolled up to PHQ and CHQ for Monday&apos;s post</span>
            </div>
            <div className={s.cardBody}>
                {items.length === 0 && <p className={s.fieldHint}>None yet.</p>}
                {items.map(c => (
                    <div key={c.id} className={s.field}>
                        <span className={s.fieldLabel}>{c.targetName}{c.targetType === 'callsign' ? ' (call sign)' : ''}</span>
                        <span style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{c.wording}</span>
                        <span className={s.fieldHint}>
                            {c.authorName}{c.authorSection ? `, ${c.authorSection}` : ''}
                            {(c.mine || canDeleteAny) && <> · <button type='button' className={s.cleared} onClick={() => remove(c.id)}>Remove</button></>}
                        </span>
                    </div>
                ))}

                {canCommend && (
                    <div className={s.field} style={{ marginTop: 14 }}>
                        <span className={s.fieldLabel}>Add a commendation</span>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <select className={s.select} style={{ width: 160 }} value={targetType} onChange={e => setTargetType(e.target.value as 'member' | 'callsign')}>
                                <option value='member'>A member</option>
                                <option value='callsign'>A call sign</option>
                            </select>
                            {targetType === 'callsign' ? (
                                <select className={s.select} style={{ flex: 1 }} value={callsign} onChange={e => setCallsign(e.target.value)}>
                                    <option value=''>Choose…</option>
                                    {sections.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            ) : member ? (
                                <button type='button' className={s.writeup} onClick={() => { setMember(null); setQuery('') }}>{member.name} ✕</button>
                            ) : (
                                <input className={s.input} style={{ flex: 1 }} placeholder='Search for a member' value={query} onChange={e => setQuery(e.target.value)} />
                            )}
                        </div>
                        {targetType === 'member' && !member && query.trim().length >= 2 && results.map(r => (
                            <button key={r.userId} type='button' className={s.lateResult} onClick={() => { setMember(r); setResults([]) }}>{r.name}</button>
                        ))}
                        <textarea className={s.textarea} placeholder='What they did, and why it stood out' value={wording} onChange={e => setWording(e.target.value)} />
                        <div className={s.actions}>
                            <button type='button' className={s.save} disabled={busy || !wording.trim() || (targetType === 'member' ? !member : !callsign)} onClick={submit}>
                                {busy ? 'Saving…' : 'Add commendation'}
                            </button>
                            {error && <span className={`${s.state} ${s.stateBad}`}>{error}</span>}
                        </div>
                    </div>
                )}
            </div>
        </section>
    )
}
