'use client'

import { useState } from 'react'
import s from './profile.module.css'

/**
 * Owner controls and the loadout switcher.
 *
 * The import box states plainly that importing publishes the kit. That wording
 * is a requirement, not a nicety: the share toggle governs one-click copying,
 * not confidentiality, and a member who reads it as privacy has been misled.
 *
 * Renders a fragment, not a wrapping div — `LoadoutPanel` already supplies the
 * `.kitActions` row this content lives in.
 */

type Summary = { id: string; name: string; isDefault: boolean; shared: boolean; raw: string }

/**
 * Mirrors copy-link.tsx: prefer the Clipboard API in a secure context, and fall
 * back to an off-screen-textarea `execCommand('copy')` for a dev server reached
 * over a LAN IP (not a secure context) or a browser without the API.
 */
async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text)
            return true
        }
    } catch {
        // Fall through to the legacy path below on a rejected clipboard write.
    }
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.top = '-1000px'
    document.body.appendChild(field)
    field.select()
    try { return document.execCommand('copy') } catch { return false } finally { document.body.removeChild(field) }
}

export function LoadoutManager({ loadouts, isOwn, activeId }: {
    loadouts: Summary[]
    isOwn: boolean
    activeId: string | null
}) {
    const [importing, setImporting] = useState(false)
    const [raw, setRaw] = useState('')
    const [name, setName] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [copied, setCopied] = useState(false)

    const active = loadouts.find(l => l.id === activeId) ?? null

    const submit = async () => {
        setBusy(true); setError(null)
        const res = await fetch('/api/loadouts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw, name }),
        })
        const json = await res.json().catch(() => ({}))
        setBusy(false)
        if (!res.ok) { setError(json.error ?? 'That import failed.'); return }
        window.location.reload()
    }

    const patch = async (id: string, body: Record<string, unknown>) => {
        setBusy(true); setError(null)
        try {
            const res = await fetch(`/api/loadouts/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (!res.ok) {
                const json = await res.json().catch(() => ({}))
                setError(json.error ?? 'That change could not be saved.')
                setBusy(false)
                return
            }
            window.location.reload()
        } catch {
            // A thrown fetch would otherwise leave busy set and every control dead.
            setError('Could not reach the server. Try again.')
            setBusy(false)
        }
    }

    const remove = async (id: string) => {
        if (!confirm('Delete this loadout?')) return
        setBusy(true); setError(null)
        try {
            const res = await fetch(`/api/loadouts/${id}`, { method: 'DELETE' })
            if (!res.ok) {
                const json = await res.json().catch(() => ({}))
                setError(json.error ?? 'That loadout could not be deleted.')
                setBusy(false)
                return
            }
            window.location.reload()
        } catch {
            setError('Could not reach the server. Try again.')
            setBusy(false)
        }
    }

    return (
        <>
            {loadouts.length > 1 && (
                <select
                    className={s.btn}
                    value={activeId ?? ''}
                    onChange={e => patch(e.target.value, { isDefault: true })}
                    aria-label='Choose a loadout'
                >
                    {loadouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
            )}

            {active?.shared && (
                <button
                    type='button'
                    className={s.btn}
                    onClick={async () => { setCopied(await copyText(active.raw)); setTimeout(() => setCopied(false), 1800) }}
                >
                    {copied ? 'Copied' : 'Copy loadout'}
                </button>
            )}

            {isOwn && active && (
                <>
                    <button type='button' className={s.btn} disabled={busy}
                        onClick={() => patch(active.id, { shared: !active.shared })}>
                        {active.shared ? 'Sharing on' : 'Sharing off'}
                    </button>
                    <button type='button' className={`${s.btn} ${s.btnDanger}`} disabled={busy}
                        onClick={() => remove(active.id)}>Delete</button>
                </>
            )}

            {isOwn && (
                <button type='button' className={s.btn} onClick={() => setImporting(v => !v)}>
                    {importing ? 'Cancel' : 'Import loadout'}
                </button>
            )}

            {error && !importing && <p className={s.kitImportError}>{error}</p>}

            {isOwn && importing && (
                <div className={s.kitImport}>
                    <p className={s.kitImportHelp}>
                        In game, open ACE arsenal, load the kit you want to record, then click
                        <strong> Export </strong> at the bottom of the arsenal screen and paste it here.
                        Anyone who visits your milpac can see every item in an imported loadout.
                    </p>
                    <input
                        className={s.kitImportName}
                        placeholder='Name (e.g. Medic)'
                        maxLength={40}
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />
                    <textarea
                        className={s.kitImportBox}
                        rows={5}
                        placeholder='Paste your ACE arsenal export'
                        value={raw}
                        onChange={e => setRaw(e.target.value)}
                    />
                    {error && <p className={s.kitImportError}>{error}</p>}
                    <button type='button' className={`${s.btn} ${s.btnAcc}`} disabled={busy || !raw.trim()} onClick={submit}>
                        {busy ? 'Importing' : 'Import'}
                    </button>
                </div>
            )}
        </>
    )
}
