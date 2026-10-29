'use client'

import { useRef, useState } from 'react'
import s from './intel-report.module.css'

/**
 * Rows 331 and 332: the form an intel entry is written in, shared by the
 * report's Add tab, editing an entry, and the AAR's Intelligence block.
 *
 * Images upload through `/api/upload` (drag and drop, paste, or pick);
 * video and anything else go in as links (Q9: real video, audio and file
 * upload are a follow-up). Each piece of evidence carries a caption.
 */

export interface IntelFormValue {
    title: string
    description: string
    grid: string
    evidence: IntelEvidence[]
    hiddenUntil: string
    starting: boolean
    callSign: string
}

export const EMPTY_INTEL_FORM: IntelFormValue = { title: '', description: '', grid: '', evidence: [], hiddenUntil: '', starting: false, callSign: '' }

interface Props {
    initial?: Partial<IntelFormValue>
    /** Assessors may hold intel back, enter starting intel and file it under another call sign. */
    canAssess?: boolean
    /** Hide the starting-intel and call-sign controls (editing, the AAR block). */
    simple?: boolean
    sequence?: number
    submitLabel?: string
    onSubmit: (v: IntelFormValue) => Promise<string | null>
    onCancel?: () => void
}

async function uploadImage(file: File): Promise<string> {
    const form = new FormData()
    // Pasted images arrive as "image.png"; give them a usable extension either way.
    const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    form.append('file', file, /\.[a-z0-9]+$/i.test(file.name) ? file.name : `pasted.${ext}`)
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.url) throw new Error(body.error ?? 'Upload failed')
    return body.url
}

export function looksLikeVideo(url: string) {
    return /youtube\.com|youtu\.be|vimeo\.com|streamable\.com|medal\.tv|twitch\.tv|\.(mp4|webm|mov)(\?|$)/i.test(url)
}

export default function IntelEntryForm({ initial, canAssess, simple, sequence, submitLabel = 'Submit intel', onSubmit, onCancel }: Props) {
    const [v, setV] = useState<IntelFormValue>({ ...EMPTY_INTEL_FORM, ...initial })
    const [link, setLink] = useState('')
    const [busy, setBusy] = useState(false)
    const [uploading, setUploading] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const [dragging, setDragging] = useState(false)
    const fileInput = useRef<HTMLInputElement>(null)

    const set = <K extends keyof IntelFormValue>(k: K, val: IntelFormValue[K]) => setV(p => ({ ...p, [k]: val }))

    async function addFiles(files: File[]) {
        const images = files.filter(f => f.type.startsWith('image/'))
        if (files.length && !images.length) { setError('Only images can be uploaded for now. Add video and other files as links.'); return }
        setError(null)
        setUploading(n => n + images.length)
        for (const f of images) {
            try {
                const url = await uploadImage(f)
                setV(p => ({ ...p, evidence: [...p.evidence, { kind: 'image', url, caption: '' }] }))
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Upload failed')
            } finally {
                setUploading(n => n - 1)
            }
        }
    }

    function addLink() {
        const url = link.trim()
        if (!/^https?:\/\//i.test(url)) { setError('Links must start with http:// or https://'); return }
        setError(null)
        setV(p => ({ ...p, evidence: [...p.evidence, { kind: looksLikeVideo(url) ? 'video' : 'link', url, caption: '' }] }))
        setLink('')
    }

    async function submit() {
        setBusy(true)
        setError(null)
        const err = await onSubmit(v)
        setBusy(false)
        if (err) setError(err)
        else if (!initial) setV({ ...EMPTY_INTEL_FORM })
    }

    return (
        <div
            className={`${s.form} ${dragging ? s.dragging : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); addFiles([...e.dataTransfer.files]) }}
            onPaste={e => {
                const files = [...e.clipboardData.files]
                if (files.length) { e.preventDefault(); addFiles(files) }
            }}
        >
            <input className={s.input} placeholder='Title (what was seen)' value={v.title} maxLength={160} onChange={e => set('title', e.target.value)} />
            <textarea className={s.textarea} placeholder='Description: what, where, when, how many. Paste or drop images anywhere on this card.' rows={4}
                value={v.description} maxLength={8000} onChange={e => set('description', e.target.value)} />
            <div className={s.row}>
                <input className={s.input} style={{ maxWidth: 200 }} placeholder='Grid (e.g. 034 127)' value={v.grid} maxLength={40} onChange={e => set('grid', e.target.value)} />
                {canAssess && !simple && (
                    <>
                        <input className={s.input} style={{ maxWidth: 200 }} placeholder='Call sign (optional)' value={v.callSign} maxLength={60}
                            disabled={v.starting} onChange={e => set('callSign', e.target.value)} />
                        <label className={s.check}>
                            <input type='checkbox' checked={v.starting} onChange={e => set('starting', e.target.checked)} /> Starting intel
                        </label>
                    </>
                )}
                {canAssess && (
                    <label className={s.check} title='Players will not see this entry until the campaign reaches that mission.'>
                        Hidden until mission
                        <input className={s.input} style={{ width: 70 }} type='number' min={(v.starting ? 0 : sequence ?? 0) + 1}
                            value={v.hiddenUntil} onChange={e => set('hiddenUntil', e.target.value)} />
                    </label>
                )}
            </div>

            {v.evidence.length > 0 && (
                <div className={s.evidenceList}>
                    {v.evidence.map((ev, i) => (
                        <div key={i} className={s.evidenceEdit}>
                            {ev.kind === 'image'
                                 
                                ? <img src={ev.url} alt='' className={s.thumb} />
                                : <span className={s.kind}>{ev.kind === 'video' ? 'Video' : 'Link'}</span>}
                            <div className={s.evidenceFields}>
                                {ev.kind !== 'image' && <a href={ev.url} target='_blank' rel='noreferrer' className={s.url}>{ev.url}</a>}
                                <input className={s.input} placeholder='Caption' value={ev.caption} maxLength={300}
                                    onChange={e => setV(p => ({ ...p, evidence: p.evidence.map((x, j) => j === i ? { ...x, caption: e.target.value } : x) }))} />
                            </div>
                            <button type='button' className={s.ghost} onClick={() => setV(p => ({ ...p, evidence: p.evidence.filter((_, j) => j !== i) }))}>Remove</button>
                        </div>
                    ))}
                </div>
            )}

            <div className={s.row}>
                <button type='button' className={s.ghost} onClick={() => fileInput.current?.click()}>Add images</button>
                <input ref={fileInput} type='file' accept='image/png,image/jpeg,image/gif,image/webp' multiple hidden
                    onChange={e => { addFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
                <input className={s.input} placeholder='Video or link URL' value={link} onChange={e => setLink(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }} />
                <button type='button' className={s.ghost} onClick={addLink} disabled={!link.trim()}>Add link</button>
                {uploading > 0 && <span className={s.muted}>Uploading {uploading}…</span>}
            </div>

            {error && <div className={s.error}>{error}</div>}

            <div className={s.row}>
                <button type='button' className={s.primary} disabled={busy || uploading > 0} onClick={submit}>{busy ? 'Saving…' : submitLabel}</button>
                {onCancel && <button type='button' className={s.ghost} onClick={onCancel}>Cancel</button>}
            </div>
        </div>
    )
}

/** The shape the API takes, from the form. */
export function formToBody(v: IntelFormValue) {
    return {
        title: v.title,
        description: v.description,
        grid: v.grid,
        evidence: v.evidence,
        hiddenUntil: v.hiddenUntil,
        starting: v.starting,
        callSign: v.callSign,
    }
}
