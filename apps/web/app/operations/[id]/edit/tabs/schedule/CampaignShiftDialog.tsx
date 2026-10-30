'use client'

import { useEffect, useState } from 'react'
import { btnTone, label } from './controls'

interface Plan {
    campaign: { name: string; startDate?: string; endDate?: string; newStartDate?: string; newEndDate?: string }
    missions: { id: string; title: string; date: string | null; newDate: string | null; moves: boolean; isThis: boolean }[]
}

interface Props {
    opID: string
    campaignId: string
    /** How far this mission just moved. */
    deltaMs: number
    /** `applied` carries the campaign's new start date when the rest moved. */
    onClose: (applied: { newStartDate?: string } | null) => void
}

const fmtDay = (iso?: string) => iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    : 'not set'
const fmtWhen = (iso: string | null) => iso
    ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    : 'no date'

function fmtDelta(ms: number) {
    const sign = ms < 0 ? 'earlier' : 'later'
    let mins = Math.round(Math.abs(ms) / 60_000)
    const days = Math.floor(mins / 1440); mins -= days * 1440
    const hours = Math.floor(mins / 60); mins -= hours * 60
    const parts = [days && `${days} day${days === 1 ? '' : 's'}`, hours && `${hours} h`, mins && `${mins} min`].filter(Boolean)
    return `${parts.join(' ')} ${sign}`
}

/**
 * Asked after the date of a mission that belongs to a campaign is changed:
 * should the rest of the campaign move with it? Shows the campaign's new start
 * and end and every mission's new date before anything is written. Missions
 * already completed are listed but stay put.
 */
export default function CampaignShiftDialog({ opID, campaignId, deltaMs, onClose }: Props) {
    const [plan, setPlan] = useState<Plan | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [applying, setApplying] = useState(false)

    useEffect(() => {
        fetch(`/api/operations/campaigns/${campaignId}/shift?opId=${opID}&deltaMs=${deltaMs}`)
            .then(async r => {
                const d = await r.json().catch(() => ({}))
                if (r.ok) setPlan(d)
                else setError(d.error ?? 'Could not load the campaign.')
            })
            .catch(() => setError('Could not load the campaign.'))
    }, [campaignId, opID, deltaMs])

    async function apply() {
        setApplying(true)
        try {
            const r = await fetch(`/api/operations/campaigns/${campaignId}/shift`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ opId: opID, deltaMs }),
            })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) { setError(d.error ?? 'Could not move the campaign.'); return }
            onClose({ newStartDate: d.campaign?.newStartDate })
        } finally {
            setApplying(false)
        }
    }

    const others = plan?.missions.filter(m => m.moves) ?? []
    const datesChange = !!plan && (plan.campaign.newStartDate !== plan.campaign.startDate || plan.campaign.newEndDate !== plan.campaign.endDate)

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={e => { if (e.target === e.currentTarget && !applying) onClose(null) }}
        >
            <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderTop: '2px solid var(--acc)', borderRadius: 'var(--r)', padding: '22px 26px', maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ ...label, color: 'var(--acc)', letterSpacing: '0.22em' }}>{'// MOVE THE CAMPAIGN?'}</div>
                <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>
                    This mission moved {fmtDelta(deltaMs)}. Move the rest of{' '}
                    <strong>{plan?.campaign.name ?? 'the campaign'}</strong> by the same amount?
                </div>

                {error && <div style={{ fontSize: 12.5, color: 'var(--crit)' }}>{error}</div>}
                {!plan && !error && <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Loading the campaign…</div>}

                {plan && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', fontSize: 12.5 }}>
                            <span style={label}>Campaign start</span>
                            <span style={{ color: 'var(--ink-2)' }}>
                                {datesChange ? <>{fmtDay(plan.campaign.startDate)} → <strong style={{ color: 'var(--ink)' }}>{fmtDay(plan.campaign.newStartDate)}</strong></> : fmtDay(plan.campaign.startDate)}
                            </span>
                            <span style={label}>Campaign end</span>
                            <span style={{ color: 'var(--ink-2)' }}>
                                {datesChange ? <>{fmtDay(plan.campaign.endDate)} → <strong style={{ color: 'var(--ink)' }}>{fmtDay(plan.campaign.newEndDate)}</strong></> : fmtDay(plan.campaign.endDate)}
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--line)' }}>
                            {plan.missions.map(m => (
                                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                                        {m.title}{m.isThis && <span style={{ ...label, marginLeft: 8 }}>this mission</span>}
                                    </span>
                                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                                        {m.moves
                                            ? <>{fmtWhen(m.date)} → <span style={{ color: 'var(--ink)' }}>{fmtWhen(m.newDate)}</span></>
                                            : m.isThis
                                                ? fmtWhen(m.newDate)
                                                : <>{fmtWhen(m.date)} · stays (already run or no date)</>}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button type="button" disabled={applying} onClick={() => onClose(null)} style={btnTone('ghost')}>
                        Only this mission
                    </button>
                    <button type="button" disabled={!plan || applying || (others.length === 0 && !datesChange)} onClick={apply} style={btnTone('acc')}>
                        {applying ? 'Moving…' : `Move ${others.length} other mission${others.length === 1 ? '' : 's'}`}
                    </button>
                </div>
            </div>
        </div>
    )
}
