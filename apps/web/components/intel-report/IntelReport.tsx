'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import IntelEntryForm, { formToBody, type IntelFormValue } from './IntelEntryForm'
import s from './intel-report.module.css'
import type { ClientIntelEntry, IntelStanding, IntelView } from '@/lib/intel/report'
import type { DoctrineValues } from '@/lib/doctrine/schema'
import type { DoctrineLevel } from '@/lib/doctrine/values'
import { compareIntel, levelName } from '@/lib/doctrine/compare'

type DoctrineInForce = { values: DoctrineValues; sources: { fields: Record<string, DoctrineLevel>; composition: Record<string, DoctrineLevel> } }

/**
 * Rows 331 and 332: the Intelligence Report document page (`pageType:
 * 'intel_report'`). Backed by Mongo, not the Y.js document, the same as the
 * OCAP page: entries persist across the campaign and are shared by every
 * mission in it, which a per-operation document cannot do.
 *
 * Four tabs: Active (what players see, grouped by mission then call sign),
 * Add, Review (pending, hidden, unassessed and withheld) and Deleted (the
 * Recycle Bin). A player only ever has Active, and the server sends them
 * nothing else.
 */

const VIEW_LABEL: Record<IntelView, string> = { active: 'Active', add: 'Add', review: 'Review', deleted: 'Deleted' }
const ASSESSMENT_LABEL: Record<IntelAssessmentStatus, string> = { confirmed: 'Confirmed', partial: 'Partially Confirmed', declined: 'Declined', unassessed: 'Unassessed' }
const SETTING_LABEL: Record<keyof IntelReportSettings, string> = {
    sharing: 'Players can read the report',
    carryForward: 'Carry intel forward to later missions',
    importFromAars: 'Staff AARs carry an Intelligence block',
    requireApproval: 'New intel needs approval before players see it',
}

interface Payload {
    standing: IntelStanding
    views: IntelView[]
    view?: IntelView
    settings: IntelReportSettings
    sequence: number
    campaignName: string | null
    sharedOff?: boolean
    missionNames: Record<number, string>
    entries: ClientIntelEntry[]
}

function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return `${parseInt(h.slice(0, 2), 16) || 219},${parseInt(h.slice(2, 4), 16) || 0},${parseInt(h.slice(4, 6), 16) || 29}`
}

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (res.ok) return null
    const b = await res.json().catch(() => ({}))
    return b.error ?? 'Something went wrong'
}

export default function IntelReport({ operationId, themeColor = '#db001d' }: { operationId: string; themeColor?: string }) {
    const [view, setView] = useState<IntelView>('active')
    const [data, setData] = useState<Payload | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [showSettings, setShowSettings] = useState(false)
    const [notice, setNotice] = useState<string | null>(null)

    const base = `/api/operations/${operationId}/intel`

    const load = useCallback(async () => {
        try {
            const res = await fetch(`${base}?view=${view === 'add' ? 'active' : view}`)
            const body = await res.json()
            if (!res.ok) throw new Error(body.error ?? 'Could not load the report')
            setData(body)
            setError(null)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load the report')
        }
    }, [base, view])

    useEffect(() => { load() }, [load])

    // Rows 334, 335: the doctrine in force, for the advisory comparison. Staff only; quietly absent otherwise.
    const [doctrine, setDoctrine] = useState<DoctrineInForce | null>(null)
    const isStaff = !!data && (data.standing.canAdd || data.standing.canAssess || data.standing.canManage)
    useEffect(() => {
        if (!isStaff) return
        fetch(`/api/operations/${operationId}/doctrine`).then(r => r.ok ? r.json() : null).then(b => {
            if (b?.values) setDoctrine({ values: b.values, sources: b.sources })
        }).catch(() => {})
    }, [isStaff, operationId])

    const style = { '--intel-rgb': hexToRgb(themeColor) } as CSSProperties

    if (error && !data) return <div className={s.root} style={style}><div className={s.error}>{error}</div></div>
    if (!data) return <div className={s.root} style={style}><div className={s.muted}>Loading the Intelligence Report…</div></div>

    const { standing } = data
    const staff = standing.canAdd || standing.canAssess || standing.canManage
    const mission = (seq: number) => data.missionNames[seq] ?? `Mission ${seq}`

    async function add(v: IntelFormValue) {
        const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formToBody(v)) })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) return body.error ?? 'Could not save'
        setNotice(body.publication === 'pending' ? 'Submitted. It will show once an assessor approves it.' : 'Added to the report.')
        return null
    }

    async function saveSettings(next: IntelReportSettings) {
        const err = await send(`${base}/settings`, 'PUT', next)
        if (err) setError(err)
        else load()
    }

    const groups = groupEntries(data.entries)

    return (
        <div className={s.root} style={style}>
            <div className={s.header}>
                <div>
                    <div className={s.kicker}>{data.campaignName ? `${data.campaignName} · ${mission(data.sequence)}` : 'Intelligence'}</div>
                    <div className={s.title}>Intelligence Report</div>
                </div>
                <div className={s.flex} />
                {standing.canManage && <button type='button' className={s.ghost} onClick={() => setShowSettings(v => !v)}>Settings</button>}
            </div>

            {showSettings && standing.canManage && (
                <div className={s.card}>
                    <div className={s.label}>{data.campaignName ? 'Settings for the whole campaign' : 'Settings for this operation'}</div>
                    {(Object.keys(SETTING_LABEL) as (keyof IntelReportSettings)[]).map(k => (
                        <label key={k} className={s.check}>
                            <input type='checkbox' checked={data.settings[k]} onChange={e => saveSettings({ ...data.settings, [k]: e.target.checked })} />
                            {SETTING_LABEL[k]}
                        </label>
                    ))}
                </div>
            )}

            {data.views.length > 1 && (
                <div className={s.tabs}>
                    {data.views.map(v => (
                        <button key={v} type='button' className={`${s.tab} ${view === v ? s.tabActive : ''}`} onClick={() => { setView(v); setNotice(null) }}>
                            {VIEW_LABEL[v]}
                        </button>
                    ))}
                </div>
            )}

            {error && <div className={s.error}>{error}</div>}
            {notice && <div className={s.notice}>{notice}</div>}
            {staff && !data.settings.sharing && view === 'active' && <div className={s.muted}>Sharing is off: players cannot read this report.</div>}

            {view === 'add' ? (
                <IntelEntryForm canAssess={standing.canAssess} sequence={data.sequence} onSubmit={add} />
            ) : data.sharedOff ? (
                <div className={s.muted}>The Intelligence Report is not shared with players for this {data.campaignName ? 'campaign' : 'operation'}.</div>
            ) : !data.entries.length ? (
                <div className={s.muted}>{view === 'deleted' ? 'The Recycle Bin is empty.' : view === 'review' ? 'Nothing waiting for review.' : 'No intelligence reported yet.'}</div>
            ) : (
                groups.map(g => (
                    <section key={g.sequence} className={s.mission}>
                        <div className={s.missionTitle}>{mission(g.sequence)}</div>
                        {g.callSigns.map(c => (
                            <div key={c.callSign} className={s.callSign}>
                                <div className={s.label}>{c.callSign}</div>
                                {c.entries.map(e => (
                                    <EntryCard key={e.id} entry={e} view={view} standing={standing} base={base} sequence={data.sequence} onChanged={load} doctrine={doctrine} />
                                ))}
                            </div>
                        ))}
                    </section>
                ))
            )}
        </div>
    )
}

/** What a visitor who is not signed in sees in place of the report. */
export function IntelReportSignIn() {
    return <div className={s.root}><div className={s.muted}>Sign in to read the Intelligence Report.</div></div>
}

function groupEntries(entries: ClientIntelEntry[]) {
    const missions = new Map<number, Map<string, ClientIntelEntry[]>>()
    for (const e of entries) {
        if (!missions.has(e.sourceSequence)) missions.set(e.sourceSequence, new Map())
        const m = missions.get(e.sourceSequence)!
        if (!m.has(e.callSign)) m.set(e.callSign, [])
        m.get(e.callSign)!.push(e)
    }
    return [...missions.entries()].sort((a, b) => a[0] - b[0]).map(([sequence, m]) => ({
        sequence,
        callSigns: [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([callSign, list]) => ({ callSign, entries: list })),
    }))
}

/* ── One entry ──────────────────────────────────────────────────────────── */

interface Detail {
    versions: (IntelVersion & { at: string })[]
    comments: { id: string; authorId: string; authorName: string; body: string; createdAt: string }[]
    canEdit: boolean
}

function EntryCard({ entry, view, standing, base, sequence, onChanged, doctrine }: {
    entry: ClientIntelEntry; view: IntelView; standing: IntelStanding; base: string; sequence: number; onChanged: () => void
    doctrine: DoctrineInForce | null
}) {
    const staff = standing.canAdd || standing.canAssess || standing.canManage
    const url = `${base}/${entry.id}`
    const [votes, setVotes] = useState(entry.votes)
    const [open, setOpen] = useState(false)
    const [detail, setDetail] = useState<Detail | null>(null)
    const [editing, setEditing] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [assess, setAssess] = useState({ status: entry.assessment?.status ?? 'unassessed', comment: entry.assessment?.comment ?? '', released: entry.assessment?.released ?? false })
    const [comment, setComment] = useState('')

    useEffect(() => { setVotes(entry.votes) }, [entry.votes])

    async function loadDetail() {
        const res = await fetch(url)
        if (res.ok) setDetail(await res.json())
    }

    async function vote(value: 1 | -1) {
        const next = votes.mine === value ? 0 : value
        const res = await fetch(`${url}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: next }) })
        if (res.ok) setVotes((await res.json()).votes)
    }

    async function act(body: Record<string, unknown>) {
        const e = await send(url, 'PATCH', body)
        setErr(e)
        if (!e) { onChanged(); if (open) loadDetail() }
    }

    async function remove() {
        const reason = window.prompt('Why is this being deleted? (optional)') ?? null
        if (reason === null) return
        const e = await send(url, 'DELETE', { reason })
        setErr(e)
        if (!e) onChanged()
    }

    async function addComment() {
        if (!comment.trim()) return
        const e = await send(`${url}/comments`, 'POST', { body: comment })
        setErr(e)
        if (!e) { setComment(''); loadDetail() }
    }

    async function deleteComment(id: string) {
        const e = await send(`${url}/comments?commentId=${id}`, 'DELETE')
        setErr(e)
        if (!e) loadDetail()
    }

    const a = entry.assessment
    const chips: string[] = []
    if (entry.publication === 'pending') chips.push('Awaiting approval')
    if (entry.hiddenUntilSequence != null && entry.hiddenUntilSequence > sequence) chips.push(`Hidden until mission ${entry.hiddenUntilSequence}`)
    if (staff && a && a.status !== 'unassessed' && !a.released) chips.push('Assessment withheld')

    if (editing) {
        return (
            <div className={s.card}>
                <IntelEntryForm
                    simple
                    initial={{ title: entry.title, description: entry.description, grid: entry.grid, evidence: entry.evidence }}
                    submitLabel='Save changes'
                    onCancel={() => setEditing(false)}
                    onSubmit={async v => {
                        const e = await send(url, 'PATCH', { action: 'edit', ...formToBody(v) })
                        if (!e) { setEditing(false); onChanged() }
                        return e
                    }}
                />
            </div>
        )
    }

    return (
        <article className={s.card}>
            <div className={s.row}>
                <div className={s.entryTitle}>{entry.title}</div>
                {a && <span className={`${s.badge} ${s[`b_${a.status}`]}`}>{ASSESSMENT_LABEL[a.status]}</span>}
                {chips.map(c => <span key={c} className={s.chip}>{c}</span>)}
                <div className={s.flex} />
                {entry.grid && <span className={s.grid}>GRID {entry.grid}</span>}
            </div>
            {entry.description && <div className={s.body}>{entry.description}</div>}

            {entry.evidence.length > 0 && (
                <div className={s.evidence}>
                    {entry.evidence.map((ev, i) => (
                        <figure key={i} className={s.figure}>
                            {ev.kind === 'image'
                                ? <a href={ev.url} target='_blank' rel='noreferrer'>{ }<img src={ev.url} alt={ev.caption} className={s.image} /></a>
                                : <a href={ev.url} target='_blank' rel='noreferrer' className={s.linkEvidence}>{ev.kind === 'video' ? '▶ Video' : '↗ Link'}<span className={s.url}>{ev.url}</span></a>}
                            {ev.caption && <figcaption className={s.caption}>{ev.caption}</figcaption>}
                        </figure>
                    ))}
                </div>
            )}

            {a && a.comment && (a.released || staff) && <div className={s.assessComment}><span className={s.label}>Assessment</span> {a.comment}</div>}
            {entry.deleted && (
                <div className={s.muted}>Deleted by {entry.deleted.byName ?? 'unknown'} on {new Date(entry.deleted.at).toLocaleDateString('en-AU')}{entry.deleted.reason ? `: ${entry.deleted.reason}` : ''}</div>
            )}

            <div className={s.row}>
                <span className={s.muted}>{entry.submittedByName} · {new Date(entry.createdAt).toLocaleDateString('en-AU')}{entry.versionCount ? ` · edited ${entry.versionCount}×` : ''}</span>
                <div className={s.flex} />
                {view !== 'deleted' && (
                    <>
                        <button type='button' className={`${s.vote} ${votes.mine === 1 ? s.voted : ''}`} onClick={() => vote(1)} title='Useful'>▲ {votes.up}</button>
                        <button type='button' className={`${s.vote} ${votes.mine === -1 ? s.voted : ''}`} onClick={() => vote(-1)} title='Not useful'>▼ {votes.down}</button>
                    </>
                )}
                {staff && <button type='button' className={s.ghost} onClick={() => { setOpen(o => !o); if (!open) loadDetail() }}>{open ? 'Close' : 'Details'}</button>}
            </div>

            {err && <div className={s.error}>{err}</div>}

            {open && staff && (
                <div className={s.detail}>
                    <div className={s.row}>
                        {view === 'deleted' ? (
                            standing.canManage && <button type='button' className={s.primary} onClick={() => act({ action: 'restore' })}>Restore</button>
                        ) : (
                            <>
                                {detail?.canEdit && <button type='button' className={s.ghost} onClick={() => setEditing(true)}>Edit</button>}
                                {detail?.canEdit && <button type='button' className={s.ghost} onClick={remove}>Delete</button>}
                                {standing.canAssess && entry.publication === 'pending' && <button type='button' className={s.primary} onClick={() => act({ action: 'approve' })}>Approve</button>}
                                {standing.canAssess && entry.hiddenUntilSequence != null && <button type='button' className={s.ghost} onClick={() => act({ action: 'release' })}>Release now</button>}
                                {standing.canAssess && entry.hiddenUntilSequence == null && (
                                    <button type='button' className={s.ghost} onClick={() => {
                                        const n = window.prompt('Hide from players until which mission number?')
                                        if (n) act({ action: 'hide', hiddenUntil: n })
                                    }}>Hide until…</button>
                                )}
                            </>
                        )}
                    </div>

                    {standing.canAssess && view !== 'deleted' && (
                        <div className={s.assess}>
                            <div className={s.label}>Official assessment</div>
                            <div className={s.row}>
                                <select className={s.input} style={{ maxWidth: 220 }} value={assess.status} onChange={e => setAssess(p => ({ ...p, status: e.target.value as IntelAssessmentStatus }))}>
                                    {(Object.keys(ASSESSMENT_LABEL) as IntelAssessmentStatus[]).map(k => <option key={k} value={k}>{ASSESSMENT_LABEL[k]}</option>)}
                                </select>
                                <label className={s.check}>
                                    <input type='checkbox' checked={assess.released} onChange={e => setAssess(p => ({ ...p, released: e.target.checked }))} /> Released to players
                                </label>
                            </div>
                            <textarea className={s.textarea} rows={2} placeholder='Assessment comment' value={assess.comment} onChange={e => setAssess(p => ({ ...p, comment: e.target.value }))} />
                            <div><button type='button' className={s.primary} onClick={() => act({ action: 'assess', ...assess })}>Save assessment</button></div>
                        </div>
                    )}

                    <div className={s.label}>Staff comments</div>
                    {detail?.comments.length ? detail.comments.map(c => (
                        <div key={c.id} className={s.comment}>
                            <span className={s.muted}>{c.authorName} · {new Date(c.createdAt).toLocaleString('en-AU')}</span>
                            <div className={s.body}>{c.body}</div>
                            {(standing.canManage) && <button type='button' className={s.ghost} onClick={() => deleteComment(c.id)}>Remove</button>}
                        </div>
                    )) : <div className={s.muted}>No comments.</div>}
                    {view !== 'deleted' && (
                        <div className={s.row}>
                            <input className={s.input} placeholder='Add a staff comment' value={comment} onChange={e => setComment(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') addComment() }} />
                            <button type='button' className={s.ghost} onClick={addComment} disabled={!comment.trim()}>Post</button>
                        </div>
                    )}

                    {doctrine && <DoctrineCompare entry={entry} doctrine={doctrine} />}

                    {detail && detail.versions.length > 0 && (
                        <>
                            <div className={s.label}>Version history</div>
                            {detail.versions.map((v, i) => (
                                <details key={i} className={s.version}>
                                    <summary>{new Date(v.at).toLocaleString('en-AU')} · replaced by {v.byName}</summary>
                                    <div className={s.entryTitle}>{v.title}</div>
                                    {v.grid && <div className={s.grid}>GRID {v.grid}</div>}
                                    <div className={s.body}>{v.description}</div>
                                    {v.evidence.length > 0 && <div className={s.muted}>{v.evidence.length} piece(s) of evidence</div>}
                                </details>
                            ))}
                        </>
                    )}
                </div>
            )}
        </article>
    )
}

/** Rows 334, 335 with 331: advisory only. It never says whether the intel is true. */
function DoctrineCompare({ entry, doctrine }: { entry: ClientIntelEntry; doctrine: DoctrineInForce }) {
    const r = compareIntel(entry, doctrine.values, doctrine.sources)
    if (!r.matches.length && !r.notListed.length) return null
    return (
        <div className={s.assess}>
            <div className={s.label}>Compared with the doctrine in force (advisory)</div>
            {r.matches.map((m, i) => (
                <div key={`m${i}`} className={s.muted}>Mentions <strong>{m.term}</strong>: consistent with {levelName(m.level)} · {m.doctrine}</div>
            ))}
            {r.notListed.map((n, i) => (
                <div key={`n${i}`} className={s.muted}>Mentions <strong>{n.term}</strong>: the doctrine lists no {n.doctrine}</div>
            ))}
            <div className={s.muted}>A faction having a capability does not prove it was there. The assessment is yours.</div>
        </div>
    )
}
