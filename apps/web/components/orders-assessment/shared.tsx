'use client'

import { STATUS_LABEL, type AssessmentStatus, type AssessmentTemplate, type SourceOrders } from '@/lib/training/orders-assessment'
import { levelOf, type SimilarityResult } from '@/lib/training/similarity'

/** Row 373: pieces shared by the trainer's management page and the trainee's page. */

export const panel: React.CSSProperties = { border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: '14px 16px' }
export const label: React.CSSProperties = { fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' }
export const input: React.CSSProperties = { width: '100%', padding: '7px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', color: '#ededed', fontSize: '0.78rem', fontFamily: 'inherit' }
export const button = (tone: 'red' | 'ghost' | 'green' | 'amber' = 'ghost'): React.CSSProperties => {
    const c = { red: '219,0,29', ghost: '237,237,237', green: '76,175,80', amber: '245,158,11' }[tone]
    return { padding: '6px 14px', background: `rgba(${c},${tone === 'ghost' ? 0.03 : 0.1})`, border: `1px solid rgba(${c},${tone === 'ghost' ? 0.15 : 0.4})`, color: tone === 'ghost' ? 'rgba(237,237,237,0.7)' : `rgb(${c})`, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }
}

const STATUS_TONE: Record<AssessmentStatus, string> = {
    assigned: '150,150,150', in_progress: '100,160,240', submitted: '245,158,11', resubmitted: '245,158,11',
    passed: '76,175,80', failed: '219,0,29', reassessment_required: '219,120,0',
}

export function StatusPill({ status }: { status: AssessmentStatus }) {
    const c = STATUS_TONE[status]
    return <span style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: `rgb(${c})`, border: `1px solid rgba(${c},0.35)`, padding: '2px 6px', whiteSpace: 'nowrap' }}>{STATUS_LABEL[status]}</span>
}

const LEVEL_TONE = { none: '150,150,150', low: '100,160,240', moderate: '245,158,11', high: '219,0,29' }

export function SimilarityPill({ sim }: { sim: { score: number; level: SimilarityResult['level'] } | null | undefined }) {
    if (!sim) return <span style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.3)' }}>—</span>
    const c = LEVEL_TONE[sim.level]
    return <span style={{ fontSize: '0.6rem', fontWeight: 700, color: `rgb(${c})` }}>{Math.round(sim.score * 100)}% {sim.level === 'none' ? '' : sim.level}</span>
}

export function Paragraphs({ text }: { text: string }) {
    return <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', lineHeight: 1.55, color: 'rgba(237,237,237,0.85)' }}>{text}</div>
}

export function OrdersBody({ orders }: { orders: SourceOrders }) {
    return (
        <div style={panel}>
            <div style={label}>Source orders{orders.level ? ` · ${orders.level}` : ''}</div>
            <div style={{ fontWeight: 700, margin: '4px 0 10px' }}>{orders.title}</div>
            {orders.operationId
                ? <a href={`/operations/${orders.operationId}`} target='_blank' rel='noreferrer' style={{ fontSize: '0.78rem', color: '#60a5fa' }}>{orders.operationTitle || 'Open the orders'} ↗</a>
                : orders.body ? <Paragraphs text={orders.body} /> : <div style={{ color: 'rgba(237,237,237,0.4)', fontSize: '0.75rem' }}>No orders written for this variant yet.</div>}
        </div>
    )
}

/** The template, filled or being filled. */
export function AnswerSheet({ template, answers, onChange }: { template: AssessmentTemplate; answers: Record<string, string>; onChange?: (id: string, v: string) => void }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{template.title}</div>
                {template.instructions && <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.55)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{template.instructions}</div>}
            </div>
            {template.fields.map(f => {
                if (f.kind === 'heading') return <div key={f.id} style={{ ...label, color: 'rgba(219,0,29,0.75)', marginTop: 8 }}>{f.label}</div>
                const v = answers[f.id] ?? ''
                return (
                    <div key={f.id}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, marginBottom: 4 }}>{f.label}</div>
                        {f.hint && <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.4)', marginBottom: 4 }}>{f.hint}</div>}
                        {onChange
                            ? f.kind === 'text'
                                ? <input value={v} onChange={e => onChange(f.id, e.target.value)} style={input} />
                                : <textarea value={v} onChange={e => onChange(f.id, e.target.value)} rows={5} style={{ ...input, resize: 'vertical' }} />
                            : v ? <Paragraphs text={v} /> : <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.3)' }}>Not answered.</div>}
                    </div>
                )
            })}
        </div>
    )
}

/** The trainer's side-by-side view of what matched. Advisory: it flags passages to look at, it does not decide. */
export function SimilarityPanel({ sim }: { sim: SimilarityResult | null | undefined }) {
    if (!sim) return <div style={{ ...panel, fontSize: '0.72rem', color: 'rgba(237,237,237,0.45)' }}>No similarity check has run yet.</div>
    return (
        <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <div style={label}>Similarity check</div>
                <SimilarityPill sim={sim} />
                <div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.35)' }}>against {sim.comparedWith} text{sim.comparedWith === 1 ? '' : 's'} · {new Date(sim.checkedAt).toLocaleString('en-AU')}</div>
            </div>
            <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.45)' }}>Template headings and common military phrasing are ignored. A match is something to look at, not proof of copying.</div>
            {!sim.matches.length && <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.55)' }}>No meaningful overlap with any other submission or the source orders.</div>}
            {sim.matches.map(m => (
                <details key={m.sourceId} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.72rem' }}>
                        <SimilarityPill sim={{ score: m.score, level: levelOf(m.score) }} />{' '}
                        {m.label}
                    </summary>
                    {m.passages.length ? m.passages.map((p, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                            <div style={{ fontSize: '0.7rem', padding: 8, background: 'rgba(219,0,29,0.05)', borderLeft: '2px solid rgba(219,0,29,0.4)', whiteSpace: 'pre-wrap' }}>{p.mine}</div>
                            <div style={{ fontSize: '0.7rem', padding: 8, background: 'rgba(255,255,255,0.03)', borderLeft: '2px solid rgba(255,255,255,0.2)', whiteSpace: 'pre-wrap' }}>{p.theirs}</div>
                        </div>
                    )) : <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)', marginTop: 6 }}>Overlap is spread thinly; no single passage stands out.</div>}
                </details>
            ))}
        </div>
    )
}
