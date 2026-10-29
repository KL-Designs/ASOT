'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { DoctrineValues } from '@/lib/doctrine/schema'
import { LEVEL_LABEL, type DoctrineLevel } from '@/lib/doctrine/values'
import DoctrineBuilder from './DoctrineBuilder'
import DoctrineViews, { type Sources } from './DoctrineViews'
import s from './doctrine.module.css'

/**
 * Rows 334 and 335: an operation's Enemy Doctrine page (`pageType:
 * 'doctrine'`). Mongo-backed like OCAP and the Intelligence Report. Shows
 * the doctrine in force — pinned to the night once the operation has
 * happened — as Quick Reference and Full Doctrine, and opens the builder on
 * any level of its chain for whoever may edit it.
 */

interface Payload {
    standing: { canView: boolean; canEdit: boolean; canApprove: boolean }
    mission: { id: string; name: string; publishedVersion: number; pending: boolean } | null
    factions?: { id: string; name: string }[]
    pinnedAt?: string | null
    chain?: { id: string; level: DoctrineLevel; name: string; version: number | null }[]
    values?: DoctrineValues
    sources?: Sources
}

function rgb(hex: string) {
    const h = hex.replace('#', '')
    return `${parseInt(h.slice(0, 2), 16) || 219},${parseInt(h.slice(2, 4), 16) || 0},${parseInt(h.slice(4, 6), 16) || 29}`
}

export default function DoctrinePage({ operationId, themeColor = '#db001d' }: { operationId: string; themeColor?: string }) {
    const [data, setData] = useState<Payload | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [editing, setEditing] = useState<string | null>(null)
    const [faction, setFaction] = useState('')

    const load = useCallback(async () => {
        const res = await fetch(`/api/operations/${operationId}/doctrine`)
        const body = await res.json().catch(() => ({}))
        if (!res.ok) { setError(res.status === 403 ? 'Enemy Doctrine is for mission makers and Zeus.' : body.error ?? 'Could not load the doctrine'); return }
        setData(body)
        setError(null)
    }, [operationId])

    useEffect(() => { load() }, [load])

    const style = { '--doc-rgb': rgb(themeColor) } as CSSProperties
    if (error) return <div className={s.root} style={style}><p className={s.muted}>{error}</p></div>
    if (!data) return <div className={s.root} style={style}><p className={s.muted}>Loading the doctrine…</p></div>

    if (editing) {
        return <div style={style}><DoctrineBuilder doctrineId={editing} onClose={() => { setEditing(null); load() }} onPublished={load} /></div>
    }

    if (!data.mission) {
        return (
            <div className={s.root} style={style}>
                <div className={s.title}>Enemy Doctrine</div>
                {!data.standing.canEdit ? <p className={s.muted}>No doctrine has been set for this operation yet.</p>
                    : !data.factions?.length ? <p className={s.muted}>No faction doctrine has been published yet. J2 builds the faction library under J2 → Enemy Doctrine.</p>
                    : (
                        <div className={s.row}>
                            <select className={s.input} value={faction} onChange={e => setFaction(e.target.value)}>
                                <option value=''>Choose the enemy faction…</option>
                                {data.factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                            <button type='button' className={s.primary} disabled={!faction} onClick={async () => {
                                const res = await fetch(`/api/operations/${operationId}/doctrine`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ factionId: faction }) })
                                const body = await res.json().catch(() => ({}))
                                if (!res.ok) { setError(body.error ?? 'Could not set up the doctrine'); return }
                                await load()
                                setEditing(body.id)
                            }}>Use this faction</button>
                        </div>
                    )}
            </div>
        )
    }

    return (
        <div className={s.root} style={style}>
            <div className={s.toolbar}>
                <div>
                    <div className={s.kicker}>Enemy Doctrine{data.pinnedAt ? ` · as it stood on ${new Date(data.pinnedAt).toLocaleDateString('en-AU')}` : ''}</div>
                    <div className={s.title}>{data.mission.name}</div>
                    <div className={s.muted}>
                        {data.chain?.map(c => `${LEVEL_LABEL[c.level]}${c.version ? ` v${c.version}` : ' (unpublished)'}`).join(' → ')}
                        {data.mission.pending && ' · a change is waiting for J2 Lead approval'}
                    </div>
                </div>
                <div className={s.flex} />
                {data.standing.canEdit && data.chain?.slice().reverse().map(c => (
                    <button key={c.id} type='button' className={c.level === 'mission' ? s.primary : s.ghost} onClick={() => setEditing(c.id)}>
                        Edit {LEVEL_LABEL[c.level].toLowerCase()}
                    </button>
                ))}
            </div>
            {data.values && <DoctrineViews values={data.values} sources={data.sources} />}
        </div>
    )
}
