'use client'

import { useState } from 'react'
import {
    ADVANCED_MODULES, COMPOSITION, COMPOSITION_DETAIL_FIELDS, SECTIONS, fieldApplies, presentCategories, splitCompositionKey,
    type DoctrineValues,
} from '@/lib/doctrine/schema'
import { displayValue, hasContent, LEVEL_LABEL, type DoctrineLevel } from '@/lib/doctrine/values'
import s from './doctrine.module.css'

/**
 * Rows 334 and 335: the two Zeus views, both generated from the same
 * values so there is never a second document to keep in step. Quick
 * Reference is for the live mission: short and actionable. Full Doctrine is
 * everything, with notes, units, layers and triggers, under collapsible
 * headings. The builder's Preview renders exactly these.
 */

export type Sources = { fields: Record<string, DoctrineLevel>; composition: Record<string, DoctrineLevel> }

function Source({ level }: { level?: DoctrineLevel }) {
    if (!level || level === 'faction') return null
    return <span className={s.source}>{LEVEL_LABEL[level]}</span>
}

export function QuickReference({ values, sources }: { values: DoctrineValues; sources?: Sources }) {
    if (!hasContent(values)) return <p className={s.muted}>Nothing has been written for this doctrine yet.</p>
    const present = presentCategories(values)
    const byCat = new Map<string, string[]>()
    for (const [key, d] of Object.entries(values.composition)) {
        const { category, subtype } = splitCompositionKey(key)
        if (!category) continue
        const list = byCat.get(category.label) ?? []
        list.push([subtype, d.name, d.strength || d.count].filter(Boolean).join(' · '))
        byCat.set(category.label, list)
    }
    return (
        <div className={s.quick}>
            {SECTIONS.filter(sec => sec.quick).map(sec => {
                if (sec.kind === 'composition') {
                    if (!byCat.size) return null
                    return (
                        <div key={sec.key} className={s.quickBlock}>
                            <div className={s.quickTitle}>{sec.title}</div>
                            {[...byCat.entries()].map(([cat, list]) => (
                                <div key={cat} className={s.quickLine}><span className={s.quickLabel}>{cat}</span><span>{list.join('; ')}</span></div>
                            ))}
                        </div>
                    )
                }
                const lines = sec.fields.filter(f => f.quick && fieldApplies(f, present) && values.fields[f.key])
                if (!lines.length) return null
                return (
                    <div key={sec.key} className={s.quickBlock}>
                        <div className={s.quickTitle}>{sec.title}</div>
                        {lines.map(f => (
                            <div key={f.key} className={s.quickLine}>
                                <span className={s.quickLabel}>{f.label}</span>
                                <span>{displayValue(values.fields[f.key])} <Source level={sources?.fields[f.key]} /></span>
                            </div>
                        ))}
                    </div>
                )
            })}
            {values.triggers.length > 0 && (
                <div className={s.quickBlock}>
                    <div className={s.quickTitle}>Critical instructions</div>
                    {values.triggers.map((t, i) => (
                        <div key={i} className={s.quickLine}><span className={s.quickLabel}>{t.event || 'When'}</span><span>{t.response}</span></div>
                    ))}
                </div>
            )}
        </div>
    )
}

export function FullDoctrine({ values, sources }: { values: DoctrineValues; sources?: Sources }) {
    if (!hasContent(values)) return <p className={s.muted}>Nothing has been written for this doctrine yet.</p>
    const present = presentCategories(values)
    return (
        <div className={s.full}>
            {SECTIONS.map(sec => {
                if (sec.kind === 'composition') {
                    const entries = Object.entries(values.composition)
                    return (
                        <details key={sec.key} className={s.fullSection} open>
                            <summary>{sec.number}. {sec.title}</summary>
                            {!entries.length ? <p className={s.muted}>No force composition recorded.</p> : COMPOSITION.map(cat => {
                                const mine = entries.filter(([k]) => splitCompositionKey(k).category?.key === cat.key)
                                if (!mine.length) return null
                                return (
                                    <div key={cat.key} className={s.fullGroup}>
                                        <div className={s.fullGroupTitle}>{cat.label}</div>
                                        {mine.map(([k, d]) => (
                                            <div key={k} className={s.unit}>
                                                <div className={s.unitHead}>{splitCompositionKey(k).subtype}{d.name ? ` — ${d.name}` : ''} <Source level={sources?.composition[k]} /></div>
                                                {COMPOSITION_DETAIL_FIELDS.filter(f => f.key !== 'name' && d[f.key]).map(f => (
                                                    <div key={f.key} className={s.kv}><span>{f.label}</span><span>{d[f.key]}</span></div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                )
                            })}
                            {values.notes['composition'] && <div className={s.note}>{values.notes['composition']}</div>}
                        </details>
                    )
                }
                if (sec.kind === 'indicators') {
                    return (
                        <details key={sec.key} className={s.fullSection} open={values.indicators.length > 0}>
                            <summary>{sec.number}. {sec.title}</summary>
                            {!values.indicators.length ? <p className={s.muted}>No indicators recorded.</p> : (
                                <>
                                    <p className={s.muted}>Learning indicators for players and Zeus, not absolute rules.</p>
                                    {values.indicators.map((ind, i) => (
                                        <div key={i} className={s.unit}>
                                            <div className={s.unitHead}>{ind.observed}</div>
                                            {ind.interpretation && <div className={s.kv}><span>Possible interpretation</span><span>{ind.interpretation}</span></div>}
                                            {ind.capability && <div className={s.kv}><span>Capability / tendency</span><span>{ind.capability}</span></div>}
                                            {ind.reliability && <div className={s.kv}><span>Reliability</span><span>{ind.reliability}</span></div>}
                                            {ind.notes && <div className={s.note}>{ind.notes}</div>}
                                        </div>
                                    ))}
                                </>
                            )}
                        </details>
                    )
                }
                const fields = sec.fields.filter(f => fieldApplies(f, present) && (values.fields[f.key] || values.notes[f.key]))
                return (
                    <details key={sec.key} className={s.fullSection} open={fields.length > 0}>
                        <summary>{sec.number}. {sec.title}</summary>
                        {!fields.length ? <p className={s.muted}>Not specified.</p> : fields.map(f => (
                            <div key={f.key} className={s.field}>
                                <div className={s.kv}><span>{f.label}</span><span className={s.pre}>{displayValue(values.fields[f.key]) || '—'} <Source level={sources?.fields[f.key]} /></span></div>
                                {values.notes[f.key] && <div className={s.note}>{values.notes[f.key]}</div>}
                            </div>
                        ))}
                    </details>
                )
            })}
            {ADVANCED_MODULES.map(m => {
                const body = m.kind === 'text' ? values.modules[m.key] : null
                const rows = m.kind === 'layers' ? values.layers : m.kind === 'triggers' ? values.triggers : []
                if (!body && !rows.length) return null
                return (
                    <details key={m.key} className={s.fullSection}>
                        <summary>{m.title}</summary>
                        {body && <div className={s.pre}>{body}</div>}
                        {m.kind === 'layers' && values.layers.map((l, i) => (
                            <div key={i} className={s.unit}>
                                <div className={s.unitHead}>{l.layer || 'Layer'}{l.units ? ` — ${l.units}` : ''}</div>
                                {([['strength', 'Approximate strength'], ['role', 'Battlefield role'], ['area', 'Deployment area'], ['activation', 'Activation conditions'], ['notes', 'Notes']] as const)
                                    .filter(([k]) => l[k]).map(([k, label]) => <div key={k} className={s.kv}><span>{label}</span><span>{l[k]}</span></div>)}
                            </div>
                        ))}
                        {m.kind === 'triggers' && (
                            <>
                                <p className={s.muted}>Reference instructions for Zeus. They do not change Arma AI.</p>
                                {values.triggers.map((t, i) => <div key={i} className={s.kv}><span>{t.event}</span><span>{t.response}</span></div>)}
                            </>
                        )}
                    </details>
                )
            })}
        </div>
    )
}

/** Both views behind tabs, with copy and print. Used on the operation page and in the Preview modal. */
export default function DoctrineViews({ values, sources, title }: { values: DoctrineValues; sources?: Sources; title?: string }) {
    const [tab, setTab] = useState<'quick' | 'full'>('quick')
    const [copied, setCopied] = useState(false)

    function copy() {
        const el = document.getElementById('doctrine-view-body')
        if (!el) return
        navigator.clipboard.writeText(el.innerText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
    }

    return (
        <div className={s.views}>
            <div className={s.viewTabs}>
                <button type='button' className={`${s.viewTab} ${tab === 'quick' ? s.viewTabActive : ''}`} onClick={() => setTab('quick')}>Quick Reference</button>
                <button type='button' className={`${s.viewTab} ${tab === 'full' ? s.viewTabActive : ''}`} onClick={() => setTab('full')}>Full Doctrine</button>
                <div className={s.flex} />
                <button type='button' className={s.ghost} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
                <button type='button' className={s.ghost} onClick={() => window.print()}>Print</button>
            </div>
            <div id='doctrine-view-body' data-print-section>
                {title && <div className={s.viewTitle}>{title}</div>}
                {tab === 'quick' ? <QuickReference values={values} sources={sources} /> : <FullDoctrine values={values} sources={sources} />}
            </div>
        </div>
    )
}
