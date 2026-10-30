'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Typography } from '@mui/material'
import { Delete, Edit, Refresh } from '@mui/icons-material'
import ConfirmDialog from '@/components/confirm-dialog'

/** Where the mission editor's back link returns to from here. */
export const TEMPLATES_FROM = 'j2-templates'

type Kind = 'single' | 'campaign'

const KIND_LABEL: Record<Kind, string> = {
    single: 'Single mission default',
    campaign: 'Campaign default',
}

/**
 * J2 → Templates. Mission templates, which used to be a folding panel at the
 * foot of the Operations tab.
 *
 * A template is edited by editing the mission it was saved from: Open takes
 * you into that mission (and the editor's back link, like the browser's, comes
 * back here), and Update copies what the mission now holds into the template.
 * J2 leads choose one default for new single missions and one for a
 * campaign's mission slots.
 */
export default function TemplatesTab() {
    const [templates, setTemplates] = useState<OperationTemplate[]>([])
    const [loading, setLoading] = useState(true)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
    // J2 leads only — the API says so, and enforces it again on PATCH.
    const [canSetDefault, setCanSetDefault] = useState(false)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [message, setMessage] = useState<{ id: string; text: string; ok: boolean } | null>(null)

    const load = useCallback(() => {
        setLoading(true)
        fetch('/api/operations/templates')
            .then(r => r.json())
            .then(data => { setTemplates(data.templates ?? []); setCanSetDefault(!!data.canSetDefault) })
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => { load() }, [load])

    async function setDefault(id: string, kind: Kind, isDefault: boolean) {
        const res = await fetch('/api/operations/templates', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, kind, isDefault }),
        })
        if (!res.ok) return
        const field = kind === 'campaign' ? 'isCampaignDefault' : 'isDefault'
        setTemplates(ts => ts.map(t => ({ ...t, [field]: isDefault && t._id.toString() === id })))
    }

    async function refreshFromMission(id: string) {
        setBusyId(id)
        setMessage(null)
        try {
            const res = await fetch('/api/operations/templates', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            })
            const data = await res.json().catch(() => ({}))
            setMessage(res.ok
                ? { id, text: 'Updated from the mission.', ok: true }
                : { id, text: data.error ?? 'Could not update the template.', ok: false })
            if (res.ok) load()
        } finally { setBusyId(null) }
    }

    async function deleteTemplate(id: string) {
        await fetch(`/api/operations/templates?id=${id}`, { method: 'DELETE' })
        setTemplates(ts => ts.filter(t => t._id.toString() !== id))
    }

    const chip = (active: boolean): React.CSSProperties => ({
        background: 'none', border: `1px solid ${active ? 'rgba(219,160,0,0.45)' : 'rgba(255,255,255,0.12)'}`,
        cursor: 'pointer', padding: '3px 9px', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em',
        color: active ? 'rgba(219,160,0,0.95)' : 'rgba(237,237,237,0.45)', whiteSpace: 'nowrap', textTransform: 'uppercase',
    })
    const iconBtn: React.CSSProperties = {
        background: 'none', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', padding: '3px 9px',
        fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.6)',
        display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', textTransform: 'uppercase', textDecoration: 'none',
    }

    return (
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Typography style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>
                Save a template with the bookmark icon on any mission row in Operations. To change a template, open its
                mission, edit it, then press Update here.
            </Typography>

            {loading && <Typography style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.3)' }}>Loading…</Typography>}
            {!loading && templates.length === 0 && (
                <Typography style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No templates yet.</Typography>
            )}

            {templates.map(t => {
                const tid = t._id.toString()
                const flags: Kind[] = [...(t.isDefault ? ['single' as const] : []), ...(t.isCampaignDefault ? ['campaign' as const] : [])]
                return (
                    <div key={tid} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
                        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.name}
                                {flags.map(k => (
                                    <span key={k} style={{ marginLeft: 8, fontSize: '0.56rem', fontWeight: 800, letterSpacing: '0.12em', padding: '1px 6px', color: 'rgba(219,160,0,0.95)', border: '1px solid rgba(219,160,0,0.45)', verticalAlign: 'middle', textTransform: 'uppercase' }}>
                                        {KIND_LABEL[k]}
                                    </span>
                                ))}
                            </div>
                            <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', marginTop: 2 }}>
                                {t.sections?.length ?? 0} section{(t.sections?.length ?? 0) !== 1 ? 's' : ''} · {new Date(t.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {!t.sourceOperationId && ' · saved before templates kept their mission'}
                            </div>
                            {message?.id === tid && (
                                <div style={{ fontSize: '0.64rem', marginTop: 4, color: message.ok ? 'rgba(16,185,129,0.85)' : 'rgba(219,0,29,0.85)' }}>{message.text}</div>
                            )}
                        </div>

                        {t.sourceOperationId && (
                            <>
                                <Link href={`/operations/${t.sourceOperationId}/edit?from=${TEMPLATES_FROM}`} style={iconBtn} title='Open the mission this template was saved from'>
                                    <Edit style={{ fontSize: 12 }} /> Open
                                </Link>
                                <button style={iconBtn} disabled={busyId === tid} onClick={() => refreshFromMission(tid)} title='Copy what the mission now holds into this template'>
                                    <Refresh style={{ fontSize: 12 }} /> {busyId === tid ? 'Updating…' : 'Update'}
                                </button>
                            </>
                        )}

                        {canSetDefault && (['single', 'campaign'] as const).map(kind => {
                            const active = kind === 'campaign' ? !!t.isCampaignDefault : !!t.isDefault
                            return (
                                <button key={kind} style={chip(active)} onClick={() => setDefault(tid, kind, !active)}
                                    title={active ? `Stop using this as the ${KIND_LABEL[kind].toLowerCase()}` : `Make this the ${KIND_LABEL[kind].toLowerCase()}`}>
                                    {active ? `Clear ${kind} default` : `Set ${kind} default`}
                                </button>
                            )
                        })}

                        <button onClick={() => setConfirmDeleteId(tid)} title='Delete template' style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(219,0,29,0.35)', display: 'flex' }}>
                            <Delete style={{ fontSize: 15 }} />
                        </button>
                    </div>
                )
            })}

            {confirmDeleteId && (
                <ConfirmDialog open title='Delete Template' message={`Delete template "${templates.find(t => t._id.toString() === confirmDeleteId)?.name}"?`}
                    onConfirm={() => { deleteTemplate(confirmDeleteId); setConfirmDeleteId(null) }}
                    onCancel={() => setConfirmDeleteId(null)} />
            )}
        </div>
    )
}
