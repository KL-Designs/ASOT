'use client'

import { useCallback, useEffect, useState } from 'react'
import { NCO_LEAD_DAYS, NCO_OUTCOME_LABEL, NCO_STATUS_LABEL, type NcoOutcome } from '@/lib/training/nco-assessment'
import type { NcoAssessmentView } from '@/lib/training/nco-actor'

interface Night { operationId: string; title: string; date: string; tooSoon: boolean; taken: boolean; mine: boolean }

interface Payload {
    myId: string
    isJ3Lead: boolean
    assessments: NcoAssessmentView[]
    nights: Night[]
    assessors: { id: string; name: string }[]
}

const panel: React.CSSProperties = { border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: '14px 16px' }
const label: React.CSSProperties = { fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' }
const input: React.CSSProperties = {
    padding: '7px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', color: '#ededed',
    fontSize: '0.8rem', fontFamily: 'inherit', minWidth: 0,
}
const btn = (tone: 'red' | 'green' | 'plain' = 'plain'): React.CSSProperties => ({
    padding: '5px 12px', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    background: tone === 'red' ? 'rgba(219,0,29,0.12)' : tone === 'green' ? 'rgba(80,200,120,0.1)' : 'transparent',
    border: `1px solid ${tone === 'red' ? 'rgba(219,0,29,0.35)' : tone === 'green' ? 'rgba(80,200,120,0.3)' : 'rgba(255,255,255,0.14)'}`,
    color: tone === 'red' ? 'rgba(255,120,120,0.9)' : tone === 'green' ? 'rgba(120,220,150,0.9)' : 'rgba(237,237,237,0.6)',
})

const when = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })

/**
 * NCO assessments: ask for one, and run one.
 *
 * One screen for everybody involved, because it is one thread of work: the
 * candidate asks, J3 assign, the assessor confirms and writes it up, the
 * section's staff answer a shadow request. Each card shows only the steps the
 * viewer may take — the server sends that with the assessment (`can`), and
 * checks it again when a step is taken.
 */
export default function AssessmentsTab() {
    const [data, setData] = useState<Payload | null>(null)
    const [failed, setFailed] = useState(false)
    const [night, setNight] = useState('')
    const [notes, setNotes] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(() => {
        fetch('/api/nco-assessments')
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then(setData)
            .catch(() => setFailed(true))
    }, [])
    useEffect(() => { load() }, [load])

    const send = async (url: string, method: 'POST' | 'PATCH', body: unknown): Promise<boolean> => {
        setBusy(true)
        setError(null)
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
        setBusy(false)
        if (!res?.ok) {
            const info = await res?.json().catch(() => null)
            setError(info?.error ?? 'That did not save. Try again.')
            return false
        }
        load()
        return true
    }

    if (failed) return <p style={{ padding: 24, color: 'rgba(237,237,237,0.4)' }}>Assessments did not load. Reload to try again.</p>
    if (!data) return <p style={{ padding: 24, color: 'rgba(237,237,237,0.4)' }}>Loading…</p>

    const open = data.nights.filter(n => !n.tooSoon && !n.taken && !n.mine)

    return (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 980 }}>
            {error && <div role='alert' style={{ ...panel, borderColor: 'rgba(219,0,29,0.35)', color: 'rgba(255,170,150,0.9)', fontSize: '0.78rem' }}>{error}</div>}

            <section style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={label}>Request an NCO assessment</span>
                <p style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.55, color: 'rgba(237,237,237,0.55)' }}>
                    Pick the mission night you want to be assessed on. It has to be at least {NCO_LEAD_DAYS} days away, and a
                    night that already has an assessment booked cannot be picked. J3 will assign an assessor.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select aria-label='Mission night' style={{ ...input, flex: '1 1 260px' }} value={night} onChange={e => setNight(e.target.value)}>
                        <option value=''>{open.length ? 'Choose a mission night' : 'No mission nights are open to request'}</option>
                        {data.nights.map(n => (
                            <option key={n.operationId} value={n.operationId} disabled={n.tooSoon || n.taken || n.mine}>
                                {when(n.date)} · {n.title}
                                {n.mine ? ' (already requested)' : n.taken ? ' (assessment booked)' : n.tooSoon ? ' (less than a week away)' : ''}
                            </option>
                        ))}
                    </select>
                    <input
                        aria-label='Anything the assessor should know'
                        style={{ ...input, flex: '2 1 300px' }}
                        placeholder='Anything the assessor should know (optional)'
                        maxLength={1500}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                    />
                    <button
                        type='button'
                        style={{ ...btn('red'), opacity: !night || busy ? 0.45 : 1 }}
                        disabled={!night || busy}
                        onClick={async () => {
                            if (await send('/api/nco-assessments', 'POST', { operationId: night, notes })) { setNight(''); setNotes('') }
                        }}
                    >
                        Request
                    </button>
                </div>
            </section>

            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={label}>{data.isJ3Lead ? 'All assessments' : 'Assessments you are part of'}</span>
                {data.assessments.length === 0 && (
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(237,237,237,0.3)' }}>Nothing here yet.</p>
                )}
                {data.assessments.map(a => (
                    <AssessmentCard
                        key={a.id}
                        a={a}
                        assessors={data.assessors}
                        busy={busy}
                        onStep={body => send(`/api/nco-assessments/${a.id}`, 'PATCH', body)}
                    />
                ))}
            </section>
        </div>
    )
}

function AssessmentCard({ a, assessors, busy, onStep }: {
    a: NcoAssessmentView
    assessors: { id: string; name: string }[]
    busy: boolean
    onStep: (body: Record<string, unknown>) => Promise<boolean>
}) {
    const [assessorId, setAssessorId] = useState(a.assessorId ?? '')
    const [sheetUrl, setSheetUrl] = useState(a.sheetUrl ?? '')
    const [assessorNotes, setAssessorNotes] = useState(a.assessorNotes)
    const [outcome, setOutcome] = useState<NcoOutcome | ''>(a.outcome ?? '')
    const [recordingUrl, setRecordingUrl] = useState(a.recordingUrl ?? '')

    const done = a.status === 'completed' || a.status === 'cancelled'
    const tone = a.status === 'confirmed' || a.status === 'completed' ? 'rgba(120,220,150,0.85)'
        : a.status === 'cancelled' ? 'rgba(237,237,237,0.3)' : 'rgba(245,180,90,0.9)'

    return (
        <article style={{ ...panel, opacity: a.status === 'cancelled' ? 0.55 : 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <strong style={{ fontSize: '0.92rem' }}>{a.candidateName}</strong>
                <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)' }}>
                    {a.candidateSection ? `${a.candidateSection} · ` : ''}{when(a.operationDate)} · {a.operationTitle}
                </span>
                <span style={{ marginLeft: 'auto', ...label, color: tone }}>{NCO_STATUS_LABEL[a.status]}</span>
            </div>

            {a.notes && <p style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.5, color: 'rgba(237,237,237,0.6)' }}>{a.notes}</p>}

            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.75rem', color: 'rgba(237,237,237,0.6)' }}>
                <span>Assessor: <b style={{ color: '#ededed' }}>{a.assessorName ?? 'not assigned'}</b></span>
                {a.shadow && (
                    <span>
                        Shadowing {a.candidateSection}:{' '}
                        <b style={{ color: a.shadow.status === 'approved' ? 'rgba(120,220,150,0.9)' : a.shadow.status === 'declined' ? 'rgba(255,120,120,0.9)' : 'rgba(245,180,90,0.9)' }}>
                            {a.shadow.status === 'approved' ? 'Shadow approved' : a.shadow.status === 'declined' ? 'Shadow declined' : 'Waiting on section staff'}
                        </b>
                        {a.shadow.decidedByName ? ` by ${a.shadow.decidedByName}` : ''}
                    </span>
                )}
                {a.outcome && <span>Outcome: <b style={{ color: '#ededed' }}>{NCO_OUTCOME_LABEL[a.outcome]}</b></span>}
                {a.sheetUrl && <a href={a.sheetUrl} target='_blank' rel='noopener noreferrer' style={{ color: 'rgba(160,190,235,0.9)' }}>Assessment sheet</a>}
                {a.recordingUrl && <a href={a.recordingUrl} target='_blank' rel='noopener noreferrer' style={{ color: 'rgba(160,190,235,0.9)' }}>Recording</a>}
            </div>

            {a.can.assign && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select aria-label='Assessor' style={{ ...input, flex: '1 1 240px' }} value={assessorId} onChange={e => setAssessorId(e.target.value)}>
                        <option value=''>Choose an assessor</option>
                        {assessors.filter(x => x.id !== a.candidateId).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    <button type='button' style={btn('red')} disabled={busy || !assessorId || assessorId === a.assessorId} onClick={() => onStep({ action: 'assign', assessorId })}>
                        {a.assessorId ? 'Change assessor' : 'Assign'}
                    </button>
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {a.can.confirm && <button type='button' style={btn('green')} disabled={busy} onClick={() => onStep({ action: 'confirm' })}>Mark myself as assigned</button>}
                {a.can.requestShadow && (
                    <button type='button' style={btn()} disabled={busy || !a.candidateSection} onClick={() => onStep({ action: 'requestShadow' })}>
                        Ask to shadow {a.candidateSection ?? 'the section'}
                    </button>
                )}
                {a.can.decideShadow && (
                    <>
                        <button type='button' style={btn('green')} disabled={busy} onClick={() => onStep({ action: 'decideShadow', approve: true })}>Approve the shadow</button>
                        <button type='button' style={btn('red')} disabled={busy} onClick={() => onStep({ action: 'decideShadow', approve: false })}>Decline</button>
                    </>
                )}
                {a.can.cancel && <button type='button' style={btn()} disabled={busy} onClick={() => onStep({ action: 'cancel' })}>Cancel the assessment</button>}
            </div>

            {a.can.sheet && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={label}>Assessment sheet</span>
                    <input aria-label='Link to the assessment sheet' style={input} placeholder='Link to the NCO assessment sheet' value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} />
                    <textarea
                        aria-label='Assessor notes'
                        style={{ ...input, minHeight: 80, resize: 'vertical' }}
                        placeholder='Notes from the night'
                        maxLength={6000}
                        value={assessorNotes}
                        onChange={e => setAssessorNotes(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <select aria-label='Outcome' style={input} value={outcome} onChange={e => setOutcome(e.target.value as NcoOutcome | '')}>
                            <option value=''>No outcome yet</option>
                            {(Object.keys(NCO_OUTCOME_LABEL) as NcoOutcome[]).map(o => <option key={o} value={o}>{NCO_OUTCOME_LABEL[o]}</option>)}
                        </select>
                        <button type='button' style={btn('green')} disabled={busy} onClick={() => onStep({ action: 'sheet', sheetUrl, assessorNotes, outcome: outcome || null })}>
                            Save
                        </button>
                        {a.can.complete && !done && (
                            <button type='button' style={btn('red')} disabled={busy} onClick={() => onStep({ action: 'complete' })}>Mark completed</button>
                        )}
                    </div>
                </div>
            )}

            {a.can.recording && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input aria-label='Link to a recording' style={{ ...input, flex: '1 1 300px' }} placeholder='Link to a recording of the night' value={recordingUrl} onChange={e => setRecordingUrl(e.target.value)} />
                    <button type='button' style={btn()} disabled={busy} onClick={() => onStep({ action: 'recording', recordingUrl })}>Save recording</button>
                </div>
            )}
        </article>
    )
}
