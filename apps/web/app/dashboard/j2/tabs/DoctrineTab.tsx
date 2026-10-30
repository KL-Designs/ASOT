'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import DoctrineBuilder from '@/components/doctrine/DoctrineBuilder'
import type { DoctrineCustomOption } from '@/lib/doctrine/schema'
import type { DoctrineChange } from '@/lib/doctrine/values'
import s from '@/components/doctrine/doctrine.module.css'

/**
 * Rows 334 and 335: J2's Enemy Doctrine tab. The faction library (the
 * reusable base every campaign and mission inherits from), and for the J2
 * Lead everything waiting on them: significant changes and custom options.
 * `?doctrine=` opens one straight into the builder, which is where the
 * review tasks link.
 */

interface Faction { id: string; name: string; publishedVersion: number; hasDraft: boolean; pending: boolean; pendingOptions: number }
interface Waiting {
    id: string; name: string; level: string; operationId: string | null
    change: { reason: string; reasons: string[]; proposedByName: string; proposedAt: string; changes: DoctrineChange[] } | null
    options: DoctrineCustomOption[]
}

export default function DoctrineTab() {
    const params = useSearchParams()
    const [open, setOpen] = useState<string | null>(params.get('doctrine'))
    const [factions, setFactions] = useState<Faction[]>([])
    const [pending, setPending] = useState<Waiting[]>([])
    const [standing, setStanding] = useState({ canView: false, canEdit: false, canApprove: false })
    const [name, setName] = useState('')
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        const res = await fetch('/api/doctrines?pending=1')
        const body = await res.json().catch(() => ({}))
        if (!res.ok) { setError(body.error ?? 'Could not load doctrines'); return }
        setFactions(body.factions ?? [])
        setPending(body.pending ?? [])
        setStanding(body.standing)
    }, [])

    useEffect(() => { load() }, [load])

    async function create() {
        const res = await fetch('/api/doctrines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) { setError(body.error ?? 'Could not create'); return }
        setName('')
        setOpen(body.id)
    }

    async function reviewOption(doctrineId: string, optionId: string, action: string, extra: Record<string, string> = {}) {
        const res = await fetch(`/api/doctrines/${doctrineId}/options`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optionId, action, ...extra }) })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) setError(body.error ?? 'Could not save the review')
        load()
    }

    if (open) {
        return (
            <div className='p-6'>
                <DoctrineBuilder doctrineId={open} onClose={() => { setOpen(null); load() }} onPublished={load} />
            </div>
        )
    }

    return (
        <div className='p-6'>
            <div className={s.root}>
                <div className={s.title}>Enemy Doctrine</div>
                <p className={s.muted}>
                    Faction doctrines are the reusable base. A campaign changes them for its missions, and each mission can change them again,
                    from that operation&apos;s Enemy Doctrine page. Significant mid-campaign changes and custom options come to the J2 Lead here.
                </p>
                {error && <p className={s.error}>{error}</p>}

                {standing.canApprove && pending.length > 0 && (
                    <div className={s.pending}>
                        <div className={s.label}>Waiting for you</div>
                        {pending.map(w => (
                            <div key={w.id} className={s.listRow}>
                                <div className={s.row}>
                                    <strong>{w.name}</strong><span className={s.muted}>{w.level}</span>
                                    <div className={s.flex} />
                                    <button type='button' className={s.ghost} onClick={() => setOpen(w.id)}>Open</button>
                                </div>
                                {w.change && <div className={s.muted}>Change from {w.change.proposedByName}: {w.change.reason} ({w.change.reasons.join('; ')})</div>}
                                {w.options.map(o => <OptionReview key={o.id} option={o} onAction={(action, extra) => reviewOption(w.id, o.id, action, extra)} />)}
                            </div>
                        ))}
                    </div>
                )}

                {standing.canEdit && (
                    <div className={s.row}>
                        <input className={s.input} placeholder='New faction doctrine, e.g. Takistani Army' value={name} onChange={e => setName(e.target.value)} />
                        <button type='button' className={s.primary} disabled={!name.trim()} onClick={create}>Create</button>
                    </div>
                )}

                {!factions.length ? <p className={s.muted}>No faction doctrines yet.</p> : factions.map(f => (
                    <div key={f.id} className={s.listRow}>
                        <div className={s.row}>
                            <strong>{f.name}</strong>
                            <span className={s.muted}>{f.publishedVersion ? `v${f.publishedVersion}` : 'not published'}{f.hasDraft ? ' · draft' : ''}{f.pending ? ' · change awaiting approval' : ''}{f.pendingOptions ? ` · ${f.pendingOptions} custom option(s) to review` : ''}</span>
                            <div className={s.flex} />
                            <button type='button' className={s.ghost} onClick={() => setOpen(f.id)}>{standing.canEdit ? 'Open builder' : 'View'}</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function OptionReview({ option, onAction }: { option: DoctrineCustomOption; onAction: (action: string, extra?: Record<string, string>) => void }) {
    const [label, setLabel] = useState(option.label)
    const [note, setNote] = useState('')
    const [merge, setMerge] = useState('')
    return (
        <div className={s.row}>
            <span className={s.muted}>{option.fieldKey}</span>
            <input className={s.input} value={label} onChange={e => setLabel(e.target.value)} title='Edit wording or spelling before approving' />
            <input className={s.input} placeholder='Comment' value={note} onChange={e => setNote(e.target.value)} />
            <button type='button' className={s.primary} onClick={() => onAction('approve', { label, note })}>Approve</button>
            <input className={s.input} style={{ maxWidth: 180 }} placeholder='Merge into…' value={merge} onChange={e => setMerge(e.target.value)} />
            <button type='button' className={s.ghost} disabled={!merge.trim()} onClick={() => onAction('merge', { mergeInto: merge, note })}>Merge</button>
            <button type='button' className={s.ghost} onClick={() => onAction('reject', { note })}>Reject</button>
        </div>
    )
}
