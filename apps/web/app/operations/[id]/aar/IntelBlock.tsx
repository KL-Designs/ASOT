'use client'

import { useCallback, useEffect, useState } from 'react'
import IntelEntryForm, { formToBody, type IntelFormValue } from '@/components/intel-report/IntelEntryForm'
import type { ClientIntelEntry, IntelStanding } from '@/lib/intel/report'
import s from './aar.module.css'

/**
 * Row 331: the Intelligence block on a staff member's AAR. Each observation
 * is written straight into the campaign's Intelligence Report as its own
 * entry, linked back to this AAR; nothing is copied later. Shown only to
 * staff on the night (or with an intel grant), and only while the campaign
 * takes intel from AARs.
 */
interface Payload {
    standing: IntelStanding
    settings: IntelReportSettings
    sequence: number
    myCallSign: string
    entries: ClientIntelEntry[]
}

export default function IntelBlock({ operationId }: { operationId: string }) {
    const [data, setData] = useState<Payload | null>(null)
    const [notice, setNotice] = useState<string | null>(null)

    const load = useCallback(async () => {
        const res = await fetch(`/api/operations/${operationId}/intel?source=aar`)
        if (res.ok) setData(await res.json())
    }, [operationId])

    useEffect(() => { load() }, [load])

    if (!data || !data.standing.canAdd || !data.settings.importFromAars) return null

    async function submit(v: IntelFormValue) {
        const res = await fetch(`/api/operations/${operationId}/intel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...formToBody(v), starting: false, fromAar: true }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) return body.error ?? 'Could not save'
        setNotice(body.publication === 'pending' ? 'Sent to the Intelligence Report. It will show once an assessor approves it.' : 'Added to the Intelligence Report.')
        load()
        return null
    }

    return (
        <section className={s.card}>
            <div className={s.cardHead}>
                <h2 className={s.cardTitle}>Intelligence</h2>
                <span className={s.cardNote}>Filed under {data.myCallSign}</span>
            </div>
            <div className={s.cardBody}>
                <span className={s.fieldHint}>
                    One entry per observation: what was seen, where, and any evidence. Each goes straight into the
                    Intelligence Report and carries through the campaign.
                </span>
                <IntelEntryForm simple canAssess={data.standing.canAssess} sequence={data.sequence} onSubmit={submit} submitLabel='Add to the report' />
                {notice && <span className={s.cardNote}>{notice}</span>}
                {data.entries.length > 0 && (
                    <div className={s.field}>
                        <span className={s.fieldLabel}>Your intel from this operation</span>
                        {data.entries.map(e => (
                            <span key={e.id} className={s.fieldHint}>
                                {e.title}{e.grid ? ` · ${e.grid}` : ''}{e.publication === 'pending' ? ' · awaiting approval' : ''}
                                {e.hiddenUntilSequence ? ` · hidden until mission ${e.hiddenUntilSequence}` : ''}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </section>
    )
}
