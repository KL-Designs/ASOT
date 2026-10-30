'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    ADVANCED_MODULES, COMPOSITION, COMPOSITION_DETAIL_FIELDS, EMPTY_VALUES, FORCE_LAYERS, PROFICIENCY, RELIABILITY, SECTIONS, TRIGGER_EVENTS,
    compositionKey, fieldApplies, fieldComplete, presentCategories, sectionComplete,
    type CompositionCategory, type DoctrineCustomOption, type DoctrineField, type DoctrineValues, type ForceLayer, type Indicator, type Trigger,
} from '@/lib/doctrine/schema'
import { LEVEL_LABEL, type DoctrineChange, type DoctrineLevel } from '@/lib/doctrine/values'
import { parseDoctrineText, type ImportResult } from '@/lib/doctrine/import'
import ImageLibraryModal from '@/components/editor/ImageLibraryModal'
import DoctrineViews from './DoctrineViews'
import s from './doctrine.module.css'

/**
 * Rows 334 and 335: the guided Enemy Doctrine Builder.
 *
 * Twelve sections, each question with collapsed Additional Notes, a Not
 * applicable tick and pictures; advanced modules collapsed so a basic
 * doctrine takes minutes. A question turns green once it is answered or
 * ticked Not applicable, and a section once every question in it is. Import
 * reads a pasted doctrine into the builder (`lib/doctrine/import.ts`). The builder edits the
 * effective doctrine and the server keeps only what this level changes.
 * Preview opens both Zeus views over the builder from the unsaved values.
 * Publishing a significant change asks for a reason and goes to the J2 Lead;
 * the current version stays live until it is approved.
 */

interface Payload {
    doctrine: {
        id: string; level: DoctrineLevel; name: string; publishedVersion: number
        draftUpdatedAt: string | null; draftByName: string | null
        pending: { reason: string; reasons: string[]; changes: DoctrineChange[]; proposedByName: string; proposedAt: string } | null
    }
    standing: { canView: boolean; canEdit: boolean; canApprove: boolean }
    chain: { id: string; level: DoctrineLevel; name: string; version: number | null }[]
    published: { values: DoctrineValues }
    draft: { values: DoctrineValues } | null
    versions: { version: number; publishedAt: string; publishedByName: string; reason: string; approvedByName: string | null; significant: boolean }[]
    options: { global: Record<string, string[]>; custom: DoctrineCustomOption[] }
}

async function json(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    const b = await res.json().catch(() => ({}))
    return { ok: res.ok, body: b }
}

export default function DoctrineBuilder({ doctrineId, onClose, onPublished }: { doctrineId: string; onClose?: () => void; onPublished?: () => void }) {
    const [data, setData] = useState<Payload | null>(null)
    const [values, setValues] = useState<DoctrineValues>(EMPTY_VALUES)
    const [dirty, setDirty] = useState(false)
    const [status, setStatus] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [preview, setPreview] = useState(false)
    const [reasonFor, setReasonFor] = useState<string[] | null>(null)
    const [reason, setReason] = useState('')
    const [reviewNote, setReviewNote] = useState('')
    const [busy, setBusy] = useState(false)
    const [importOpen, setImportOpen] = useState(false)

    const base = `/api/doctrines/${doctrineId}`

    const load = useCallback(async () => {
        const { ok, body } = await json(base, 'GET')
        if (!ok) { setError(body.error ?? 'Could not load the doctrine'); return }
        setData(body)
        // Doctrines saved before Not applicable and pictures existed have neither.
        setValues({ ...EMPTY_VALUES, ...(body.draft?.values ?? body.published.values) })
        setDirty(false)
    }, [base])

    useEffect(() => { load() }, [load])

    // Unsaved edits survive a reload attempt only if the member confirms leaving.
    useEffect(() => {
        if (!dirty) return
        const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [dirty])

    if (error && !data) return <div className={s.root}><p className={s.error}>{error}</p></div>
    if (!data) return <div className={s.root}><p className={s.muted}>Loading the doctrine…</p></div>

    const readOnly = !data.standing.canEdit
    const update = (fn: (v: DoctrineValues) => DoctrineValues) => { setValues(fn); setDirty(true); setStatus(null) }
    const options = (key: string, schema: string[] = []) => [...new Set([
        ...schema, ...(data.options.global[key] ?? []),
        ...data.options.custom.filter(o => o.fieldKey === key && o.status !== 'rejected').map(o => o.label),
    ])]
    const pendingLabel = (key: string, label: string) => data.options.custom.some(o => o.fieldKey === key && o.label === label && o.status === 'pending')

    async function addCustom(fieldKey: string, label: string, description: string) {
        const { ok, body } = await json(`${base}/options`, 'POST', { fieldKey, label, description })
        if (!ok) { setError(body.error ?? 'Could not add the option'); return false }
        if (body.option) setData(d => d && { ...d, options: { ...d.options, custom: [...d.options.custom, body.option] } })
        return true
    }

    async function save() {
        setBusy(true)
        const { ok, body } = await json(base, 'PUT', { values })
        setBusy(false)
        if (!ok) { setError(body.error ?? 'Could not save'); return false }
        setDirty(false)
        setStatus('Draft saved.')
        return true
    }

    async function doPublish(withReason: string) {
        if (dirty && !(await save())) return
        setBusy(true)
        const { ok, body } = await json(`${base}/publish`, 'POST', { reason: withReason })
        setBusy(false)
        if (!ok) { setError(body.error ?? 'Could not publish'); return }
        if (body.status === 'needs-reason') { setReasonFor(body.reasons); return }
        setReasonFor(null)
        setReason('')
        setStatus(body.status === 'pending'
            ? 'Sent to the J2 Lead for approval. The current version stays live until then.'
            : `Published as version ${body.version}.`)
        await load()
        onPublished?.()
    }

    async function review(decision: 'approve' | 'reject' | 'revise') {
        setBusy(true)
        const { ok, body } = await json(`${base}/review`, 'POST', { decision, note: reviewNote })
        setBusy(false)
        if (!ok) { setError(body.error ?? 'Could not record the decision'); return }
        setReviewNote('')
        setStatus(decision === 'approve' ? `Approved as version ${body.version}.` : 'The proposed change was sent back.')
        await load()
        onPublished?.()
    }

    const present = presentCategories(values)

    return (
        <div className={s.root}>
            <div className={s.toolbar}>
                <div>
                    <div className={s.kicker}>{LEVEL_LABEL[data.doctrine.level]} doctrine · {data.doctrine.publishedVersion ? `v${data.doctrine.publishedVersion} live` : 'not published'}</div>
                    <div className={s.title}>{data.doctrine.name}</div>
                    {data.chain.length > 1 && (
                        <div className={s.muted}>Inherits {data.chain.slice(0, -1).map(c => `${LEVEL_LABEL[c.level]}: ${c.name}${c.version ? ` v${c.version}` : ''}`).join(' → ')}</div>
                    )}
                </div>
                <div className={s.flex} />
                {dirty && <span className={s.unsaved}>Unsaved changes</span>}
                {!readOnly && <button type='button' className={s.ghost} onClick={() => setImportOpen(true)}>Import Enemy Doctrine</button>}
                <button type='button' className={s.ghost} onClick={() => setPreview(true)}>Preview Doctrine</button>
                {!readOnly && <button type='button' className={s.ghost} disabled={busy || !dirty} onClick={save}>Save draft</button>}
                {!readOnly && <button type='button' className={s.primary} disabled={busy} onClick={() => doPublish('')}>Publish</button>}
                {onClose && <button type='button' className={s.ghost} onClick={() => { if (!dirty || window.confirm('Close without saving?')) onClose() }}>Close</button>}
            </div>

            {readOnly && <p className={s.muted}>Read only: you can preview this doctrine but not change it.</p>}
            {error && <p className={s.error}>{error}</p>}
            {status && <p className={s.notice}>{status}</p>}

            {data.doctrine.pending && (
                <div className={s.pending}>
                    <div className={s.label}>Waiting for J2 Lead approval · proposed by {data.doctrine.pending.proposedByName}</div>
                    <div>Reason: {data.doctrine.pending.reason}</div>
                    {data.doctrine.pending.reasons.map(r => <div key={r} className={s.muted}>{r}</div>)}
                    <details>
                        <summary>{data.doctrine.pending.changes.length} change(s) against the approved version</summary>
                        {data.doctrine.pending.changes.map(c => (
                            <div key={c.key} className={s.kv}><span>{c.significant ? '● ' : ''}{c.label}</span><span>{c.before || '—'} → {c.after || '—'}</span></div>
                        ))}
                    </details>
                    {data.standing.canApprove && (
                        <div className={s.row}>
                            <input className={s.input} placeholder='Note for the mission maker (optional)' value={reviewNote} onChange={e => setReviewNote(e.target.value)} />
                            <button type='button' className={s.primary} disabled={busy} onClick={() => review('approve')}>Approve</button>
                            <button type='button' className={s.ghost} disabled={busy} onClick={() => review('revise')}>Request revision</button>
                            <button type='button' className={s.ghost} disabled={busy} onClick={() => review('reject')}>Reject</button>
                        </div>
                    )}
                </div>
            )}

            {reasonFor && (
                <div className={s.pending}>
                    <div className={s.label}>This is a significant change and needs J2 Lead approval</div>
                    {reasonFor.map(r => <div key={r} className={s.muted}>{r}</div>)}
                    <textarea className={s.textarea} rows={3} placeholder='Why is the doctrine changing?' value={reason} onChange={e => setReason(e.target.value)} />
                    <div className={s.row}>
                        <button type='button' className={s.primary} disabled={busy || !reason.trim()} onClick={() => doPublish(reason)}>Send for approval</button>
                        <button type='button' className={s.ghost} onClick={() => setReasonFor(null)}>Cancel</button>
                    </div>
                </div>
            )}

            <fieldset className={s.fieldset} disabled={readOnly}>
                {SECTIONS.map(sec => (
                    <details key={sec.key} className={`${s.section} ${sectionComplete(values, sec, present) ? s.sectionDone : ''}`} open={sec.number <= 1}>
                        <summary className={s.sectionSummary}>{sec.number}. {sec.title}{sectionComplete(values, sec, present) && <span className={s.doneMark}> ✓</span>}</summary>
                        <div className={s.sectionBody}>
                            {sec.kind === 'composition' ? (
                                <CompositionEditor values={values} update={update} options={options} pendingLabel={pendingLabel} addCustom={addCustom} />
                            ) : sec.kind === 'indicators' ? (
                                <>
                                <ListEditor<Indicator>
                                    rows={values.indicators}
                                    empty={{ observed: '', interpretation: '', capability: '', reliability: '', notes: '' }}
                                    onChange={rows => update(v => ({ ...v, indicators: rows }))}
                                    addLabel='Add indicator'
                                    columns={[
                                        { key: 'observed', label: 'Observed equipment / unit / behaviour' },
                                        { key: 'interpretation', label: 'Possible interpretation' },
                                        { key: 'capability', label: 'Associated capability / tendency' },
                                        { key: 'reliability', label: 'Reliability', options: RELIABILITY },
                                        { key: 'notes', label: 'Notes' },
                                    ]}
                                />
                                <BoxExtras k='indicators' values={values} update={update} notes={false} />
                                </>
                            ) : sec.fields.filter(f => fieldApplies(f, present)).map(f => (
                                <FieldInput key={f.key} field={f} values={values} update={update} options={options(f.key, f.options)} pendingLabel={pendingLabel} addCustom={addCustom} />
                            ))}
                            {sec.kind === 'composition' && <BoxExtras k='composition' values={values} update={update} />}
                            {sec.key === 'support' && !present.size && <p className={s.muted}>Vehicle, aviation and fire support questions appear once Section 4 lists those assets.</p>}
                        </div>
                    </details>
                ))}

                <div className={s.label} style={{ marginTop: 12 }}>Optional advanced modules</div>
                {ADVANCED_MODULES.map(m => (
                    <details key={m.key} className={s.section}>
                        <summary className={s.sectionSummary}>{m.title}</summary>
                        <div className={s.sectionBody}>
                            <p className={s.muted}>{m.hint}</p>
                            {m.kind === 'text' && (
                                <textarea className={s.textarea} rows={4} value={values.modules[m.key] ?? ''}
                                    onChange={e => update(v => ({ ...v, modules: { ...v.modules, [m.key]: e.target.value } }))} />
                            )}
                            {m.kind === 'layers' && (
                                <ListEditor<ForceLayer>
                                    rows={values.layers}
                                    empty={{ layer: '', units: '', strength: '', role: '', area: '', activation: '', notes: '' }}
                                    onChange={rows => update(v => ({ ...v, layers: rows }))}
                                    addLabel='Add force layer'
                                    columns={[
                                        { key: 'layer', label: 'Layer', options: FORCE_LAYERS },
                                        { key: 'units', label: 'Assigned units' },
                                        { key: 'strength', label: 'Approximate strength' },
                                        { key: 'role', label: 'Battlefield role' },
                                        { key: 'area', label: 'General deployment area' },
                                        { key: 'activation', label: 'Activation conditions' },
                                        { key: 'notes', label: 'Notes' },
                                    ]}
                                />
                            )}
                            {m.kind === 'triggers' && (
                                <ListEditor<Trigger>
                                    rows={values.triggers}
                                    empty={{ event: '', response: '' }}
                                    onChange={rows => update(v => ({ ...v, triggers: rows }))}
                                    addLabel='Add trigger'
                                    columns={[{ key: 'event', label: 'Event', options: TRIGGER_EVENTS }, { key: 'response', label: 'Intended response' }]}
                                />
                            )}
                        </div>
                    </details>
                ))}
            </fieldset>

            {data.versions.length > 0 && (
                <details className={s.section}>
                    <summary className={s.sectionSummary}>Version history</summary>
                    <div className={s.sectionBody}>
                        {data.versions.map(v => (
                            <div key={v.version} className={s.kv}>
                                <span>v{v.version} · {new Date(v.publishedAt).toLocaleDateString('en-AU')}</span>
                                <span>{v.publishedByName}{v.approvedByName ? `, approved by ${v.approvedByName}` : ''}{v.reason ? ` — ${v.reason}` : ''}</span>
                            </div>
                        ))}
                    </div>
                </details>
            )}

            {importOpen && (
                <ImportDialog base={base} values={values} onClose={() => setImportOpen(false)}
                    onApply={next => { update(() => next); setImportOpen(false); setStatus('Imported into the builder. Check it, then save the draft.') }} />
            )}

            {preview && (
                <div className={s.modalBackdrop} onClick={() => setPreview(false)}>
                    <div className={s.modal} onClick={e => e.stopPropagation()} role='dialog' aria-label='Preview doctrine'>
                        <div className={s.row}>
                            <div className={s.label}>Preview{dirty ? ' · includes unsaved changes' : ''} · not published</div>
                            <div className={s.flex} />
                            <button type='button' className={s.ghost} onClick={() => setPreview(false)}>Close</button>
                        </div>
                        <DoctrineViews values={values} title={data.doctrine.name} />
                    </div>
                </div>
            )}
        </div>
    )
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

type Update = (fn: (v: DoctrineValues) => DoctrineValues) => void
type AddCustom = (fieldKey: string, label: string, description: string) => Promise<boolean>

async function uploadImage(file: File): Promise<string> {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.url) throw new Error(body.error ?? 'Upload failed')
    return body.url
}

/** Under every question: Additional Notes, Not applicable, and pictures (uploaded or from the site library). */
function BoxExtras({ k, values, update, notes = true }: { k: string; values: DoctrineValues; update: Update; notes?: boolean }) {
    const [open, setOpen] = useState(!!values.notes[k])
    const [library, setLibrary] = useState(false)
    const [menu, setMenu] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const images = values.images?.[k] ?? []
    const na = !!values.na?.[k]
    const setImages = (list: string[]) => update(v => {
        const next = { ...(v.images ?? {}) }
        if (list.length) next[k] = list
        else delete next[k]
        return { ...v, images: next }
    })
    const addImage = (url: string) => update(v => ({ ...v, images: { ...(v.images ?? {}), [k]: [...new Set([...(v.images?.[k] ?? []), url])] } }))

    async function upload(files: FileList | null) {
        if (!files?.length) return
        setUploading(true)
        setError(null)
        try {
            for (const f of Array.from(files)) addImage(await uploadImage(f))
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Upload failed')
        } finally {
            setUploading(false)
        }
    }

    return (
        <>
            <div className={s.extras}>
                {notes && !open && <button type='button' className={s.notesToggle} onClick={() => setOpen(true)}>+ Additional Notes</button>}
                <label className={s.naLabel}>
                    <input type='checkbox' checked={na} onChange={() => update(v => {
                        const next = { ...(v.na ?? {}) }
                        if (na) delete next[k]
                        else next[k] = true
                        return { ...v, na: next }
                    })} />
                    Not applicable
                </label>
                <span className={s.menuWrap}>
                    <button type='button' className={s.notesToggle} onClick={() => setMenu(m => !m)}>{uploading ? 'Uploading…' : '+ Add image'}</button>
                    {menu && (
                        <span className={s.menu} onMouseLeave={() => setMenu(false)}>
                            <label className={s.menuItem}>
                                Upload a picture
                                <input type='file' accept='image/*' multiple hidden disabled={uploading} onChange={e => { setMenu(false); upload(e.target.files); e.target.value = '' }} />
                            </label>
                            <button type='button' className={s.menuItem} onClick={() => { setMenu(false); setLibrary(true) }}>From the library</button>
                        </span>
                    )}
                </span>
                {error && <span className={s.error}>{error}</span>}
            </div>
            {notes && open && (
                <textarea className={s.textarea} rows={2} placeholder='Additional Notes' value={values.notes[k] ?? ''}
                    onChange={e => update(v => ({ ...v, notes: { ...v.notes, [k]: e.target.value } }))} />
            )}
            {images.length > 0 && (
                <div className={s.thumbs}>
                    {images.map(url => (
                        <div key={url} className={s.thumb}>
                            <a href={url} target='_blank' rel='noreferrer'><img src={url} alt='' /></a>
                            <button type='button' className={s.thumbRemove} title='Remove picture' onClick={() => setImages(images.filter(x => x !== url))}>×</button>
                        </div>
                    ))}
                </div>
            )}
            {library && <ImageLibraryModal onSelect={url => { addImage(url); setLibrary(false) }} onClose={() => setLibrary(false)} />}
        </>
    )
}

/**
 * Import Enemy Doctrine: paste text, drop photos (they go to the image
 * library), or drop a Word document (its text comes in for checking and its
 * pictures attach to the questions they sat under). Check, then merge it into
 * the builder. Nothing is saved until the draft is.
 */
function ImportDialog({ base, values, onClose, onApply }: { base: string; values: DoctrineValues; onClose: () => void; onApply: (next: DoctrineValues) => void }) {
    const [text, setText] = useState('')
    const [result, setResult] = useState<ImportResult | null>(null)
    const [photos, setPhotos] = useState<string[]>([])
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [over, setOver] = useState(false)

    async function take(files: FileList | File[] | null) {
        const list = Array.from(files ?? [])
        if (!list.length) return
        const docs = list.filter(f => /\.docx$/i.test(f.name))
        const images = list.filter(f => f.type.startsWith('image/'))
        const other = list.filter(f => !docs.includes(f) && !images.includes(f))
        setError(other.length ? `Left out ${other.map(f => f.name).join(', ')}: import a Word document (.docx) or pictures. For a PDF, copy its text in instead.` : null)
        if (!docs.length && !images.length) return
        setBusy(true); setNote(null)
        try {
            const form = new FormData()
            images.forEach(f => form.append('photos', f))
            if (docs[0]) form.append('document', docs[0])
            const res = await fetch(`${base}/import`, { method: 'POST', body: form })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) { setError(d.error ?? 'The import failed.'); return }
            if (d.photos?.length) setPhotos(p => [...p, ...d.photos])
            if (d.text) { setText(t => t.trim() ? `${t}\n\n${d.text}` : d.text); setResult(null) }
            setNote([
                docs[0] ? `Read ${docs[0].name}${d.documentImages ? ` with ${d.documentImages} picture(s)` : ''}. Check the text below, then press Check.` : '',
                d.photos?.length ? `${d.photos.length} photo(s) added to the image library: use Add image → From the library on any question.` : '',
            ].filter(Boolean).join(' '))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className={s.modalBackdrop} onClick={onClose}>
            <div className={s.modal} onClick={e => e.stopPropagation()} role='dialog' aria-label='Import Enemy Doctrine'>
                <div className={s.row}>
                    <div className={s.label}>Import Enemy Doctrine</div>
                    <div className={s.flex} />
                    <button type='button' className={s.ghost} onClick={onClose}>Close</button>
                </div>
                <div
                    className={`${s.dropZone} ${over ? s.dropZoneOver : ''}`}
                    onDragOver={e => { e.preventDefault(); setOver(true) }}
                    onDragLeave={() => setOver(false)}
                    onDrop={e => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) }}
                >
                    <div>{busy ? 'Importing…' : 'Drag a Word document (.docx) or photos here'}</div>
                    <div className={s.row} style={{ justifyContent: 'center' }}>
                        <label className={s.ghost}>Import document<input type='file' accept='.docx' hidden onChange={e => { take(e.target.files); e.target.value = '' }} /></label>
                        <label className={s.ghost}>Add photos<input type='file' accept='image/*' multiple hidden onChange={e => { take(e.target.files); e.target.value = '' }} /></label>
                    </div>
                </div>
                {note && <p className={s.notice}>{note}</p>}
                {error && <p className={s.error}>{error}</p>}
                {photos.length > 0 && (
                    <div className={s.thumbs}>
                        {photos.map(u => <div key={u} className={s.thumb}><img src={u} alt='' /></div>)}
                    </div>
                )}
                <p className={s.muted}>
                    Or paste the text. Write it as &quot;Question: answer&quot; lines, for example &quot;Command structure: Centralised&quot;. Numbered section headings
                    (&quot;6. Contact and Engagement&quot;) help where questions share a name. &quot;N/A&quot; ticks Not applicable, &quot;Additional notes:&quot; adds notes
                    to the question above, and &quot;Infantry: Rifle squads, Snipers&quot; adds force composition. In a document, a table with the question in one
                    column and the answer in the next reads the same way. Answers already in the builder are kept unless the import answers them again.
                </p>
                <textarea className={s.textarea} rows={14} value={text} onChange={e => { setText(e.target.value); setResult(null) }} placeholder={'1. Faction Identity\nFaction name: …\nPrimary combat style: …'} />
                <div className={s.row}>
                    <button type='button' className={s.ghost} disabled={!text.trim() || busy} onClick={() => setResult(parseDoctrineText(text, values))}>Check</button>
                    <button type='button' className={s.primary} disabled={!result || (!result.matched.length && !result.pictures)} onClick={() => result && onApply(result.values)}>Add to doctrine</button>
                </div>
                {result && (
                    <>
                        <div className={s.notice}>
                            {result.matched.length} question(s) matched{result.matched.length ? `: ${result.matched.join(', ')}` : ''}.
                            {result.pictures ? ` ${result.pictures} picture(s) placed with their questions.` : ''}
                        </div>
                        {result.unplaced.length > 0 && <div className={s.muted}>{result.unplaced.length} picture(s) came before any question; they are in the image library to add by hand.</div>}
                        {result.unmatched.length > 0 && (
                            <details open>
                                <summary className={s.error}>{result.unmatched.length} line(s) matched no question and will be left out</summary>
                                {result.unmatched.map((l, i) => <div key={i} className={s.muted}>{l}</div>)}
                            </details>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

function CustomOption({ fieldKey, addCustom, onAdded }: { fieldKey: string; addCustom: AddCustom; onAdded: (label: string) => void }) {
    const [open, setOpen] = useState(false)
    const [label, setLabel] = useState('')
    const [description, setDescription] = useState('')
    if (!open) return <button type='button' className={s.notesToggle} onClick={() => setOpen(true)}>+ Add Custom Option</button>
    return (
        <div className={s.row}>
            <input className={s.input} placeholder='Custom option' value={label} onChange={e => setLabel(e.target.value)} />
            <input className={s.input} placeholder='Description (optional)' value={description} onChange={e => setDescription(e.target.value)} />
            <button type='button' className={s.ghost} disabled={!label.trim()} onClick={async () => {
                if (await addCustom(fieldKey, label.trim(), description.trim())) { onAdded(label.trim()); setLabel(''); setDescription(''); setOpen(false) }
            }}>Add</button>
            <span className={s.muted}>Usable now; pending global review.</span>
        </div>
    )
}

function FieldInput({ field: f, values, update, options, pendingLabel, addCustom }: {
    field: DoctrineField; values: DoctrineValues; update: Update; options: string[]; pendingLabel: (k: string, l: string) => boolean; addCustom: AddCustom
}) {
    const v = values.fields[f.key]
    const set = (val: string | string[]) => update(x => ({ ...x, fields: { ...x.fields, [f.key]: val } }))
    return (
        <div className={`${s.field} ${s.box} ${fieldComplete(values, f.key) ? s.boxDone : ''} ${values.na?.[f.key] ? s.boxNa : ''}`}>
            <label className={s.fieldLabel}>{f.label}{f.significant && <span className={s.sig} title='Changing this mid-campaign needs J2 Lead approval'>●</span>}</label>
            {f.type === 'text' && <input className={s.input} value={(v as string) ?? ''} onChange={e => set(e.target.value)} />}
            {f.type === 'textarea' && <textarea className={s.textarea} rows={3} value={(v as string) ?? ''} onChange={e => set(e.target.value)} />}
            {f.type === 'select' && (
                <>
                    <select className={s.input} value={(v as string) ?? ''} onChange={e => set(e.target.value)}>
                        <option value=''>—</option>
                        {options.map(o => <option key={o} value={o}>{o}{pendingLabel(f.key, o) ? ' (pending review)' : ''}</option>)}
                        {typeof v === 'string' && v && !options.includes(v) && <option value={v}>{v}</option>}
                    </select>
                    <CustomOption fieldKey={f.key} addCustom={addCustom} onAdded={set} />
                </>
            )}
            {f.type === 'multi' && (
                <>
                    <div className={s.chips}>
                        {[...new Set([...options, ...((v as string[]) ?? [])])].map(o => {
                            const on = ((v as string[]) ?? []).includes(o)
                            return (
                                <label key={o} className={`${s.chip} ${on ? s.chipOn : ''}`}>
                                    <input type='checkbox' checked={on} hidden
                                        onChange={() => set(on ? ((v as string[]) ?? []).filter(x => x !== o) : [...((v as string[]) ?? []), o])} />
                                    {o}{pendingLabel(f.key, o) ? ' *' : ''}
                                </label>
                            )
                        })}
                    </div>
                    <CustomOption fieldKey={f.key} addCustom={addCustom} onAdded={label => set([...((v as string[]) ?? []), label])} />
                </>
            )}
            <BoxExtras k={f.key} values={values} update={update} />
        </div>
    )
}

function CompositionEditor({ values, update, options, pendingLabel, addCustom }: {
    values: DoctrineValues; update: Update; options: (k: string, schema?: string[]) => string[]; pendingLabel: (k: string, l: string) => boolean; addCustom: AddCustom
}) {
    return (
        <div className={s.composition}>
            <p className={s.muted}>Primary category → subcategory → specific unit or equipment. Select any number; open one to add details.</p>
            {COMPOSITION.map(cat => <CategoryEditor key={cat.key} cat={cat} values={values} update={update} subtypes={options(`composition.${cat.key}`, cat.subtypes)} pendingLabel={pendingLabel} addCustom={addCustom} />)}
        </div>
    )
}

function CategoryEditor({ cat, values, update, subtypes, pendingLabel, addCustom }: {
    cat: CompositionCategory; values: DoctrineValues; update: Update; subtypes: string[]; pendingLabel: (k: string, l: string) => boolean; addCustom: AddCustom
}) {
    const selected = Object.keys(values.composition).filter(k => k.startsWith(`${cat.key}.`)).map(k => k.slice(cat.key.length + 1))
    const all = [...new Set([...subtypes, ...selected])]
    const toggle = (sub: string) => update(v => {
        const key = compositionKey(cat.key, sub)
        const composition = { ...v.composition }
        if (key in composition) delete composition[key]
        else composition[key] = {}
        return { ...v, composition }
    })
    return (
        <details className={s.category} open={selected.length > 0}>
            <summary>{cat.label}{selected.length ? ` (${selected.length})` : ''}</summary>
            <div className={s.chips}>
                {all.map(sub => {
                    const on = selected.includes(sub)
                    return (
                        <label key={sub} className={`${s.chip} ${on ? s.chipOn : ''}`}>
                            <input type='checkbox' checked={on} hidden onChange={() => toggle(sub)} />
                            {sub}{pendingLabel(`composition.${cat.key}`, sub) ? ' *' : ''}
                        </label>
                    )
                })}
            </div>
            <CustomOption fieldKey={`composition.${cat.key}`} addCustom={addCustom} onAdded={label => { if (!selected.includes(label)) toggle(label) }} />
            {selected.map(sub => {
                const key = compositionKey(cat.key, sub)
                const d = values.composition[key] ?? {}
                return (
                    <details key={key} className={s.unitEdit}>
                        <summary>{sub}{d.name ? ` — ${d.name}` : ''}</summary>
                        <div className={s.grid2}>
                            {COMPOSITION_DETAIL_FIELDS.map(df => (
                                <label key={df.key} className={s.field}>
                                    <span className={s.fieldLabel}>{df.label}</span>
                                    {df.key === 'proficiency' ? (
                                        <select className={s.input} value={d.proficiency ?? ''} onChange={e => update(v => ({ ...v, composition: { ...v.composition, [key]: { ...d, proficiency: e.target.value } } }))}>
                                            <option value=''>—</option>
                                            {PROFICIENCY.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    ) : (
                                        <input className={s.input} value={d[df.key] ?? ''} onChange={e => update(v => ({ ...v, composition: { ...v.composition, [key]: { ...d, [df.key]: e.target.value } } }))} />
                                    )}
                                </label>
                            ))}
                        </div>
                    </details>
                )
            })}
        </details>
    )
}

function ListEditor<T extends object>({ rows, empty, onChange, columns, addLabel }: {
    rows: T[]; empty: T; onChange: (rows: T[]) => void; addLabel: string
    columns: { key: keyof T & string; label: string; options?: string[] }[]
}) {
    const set = (i: number, key: keyof T, val: string) => onChange(rows.map((r, j) => j === i ? { ...r, [key]: val } : r))
    return (
        <div className={s.list}>
            {rows.map((r, i) => (
                <div key={i} className={s.listRow}>
                    <div className={s.grid2}>
                        {columns.map(c => (
                            <label key={c.key} className={s.field}>
                                <span className={s.fieldLabel}>{c.label}</span>
                                {c.options ? (
                                    <select className={s.input} value={String(r[c.key] ?? '')} onChange={e => set(i, c.key, e.target.value)}>
                                        <option value=''>—</option>
                                        {c.options.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                ) : (
                                    <input className={s.input} value={String(r[c.key] ?? '')} onChange={e => set(i, c.key, e.target.value)} />
                                )}
                            </label>
                        ))}
                    </div>
                    <button type='button' className={s.ghost} onClick={() => onChange(rows.filter((_, j) => j !== i))}>Remove</button>
                </div>
            ))}
            <button type='button' className={s.ghost} onClick={() => onChange([...rows, { ...empty }])}>{addLabel}</button>
        </div>
    )
}
