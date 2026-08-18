'use client'

import { useState } from 'react'
import { copyText } from '@/lib/clipboard'
import { UiIcon } from '@/components/loadout/kit-icons'
import s from '../../milpacs/[username]/profile.module.css'

/**
 * Copies a shared kit's ACE arsenal export, for pasting straight back into the
 * arsenal's Import box.
 *
 * The whole export string is already in the page — every kit on this index is
 * one its owner switched sharing on for, and the page never sends `raw` for any
 * other. Handing it over on a click is the entire point of the shelf.
 */
export function CopyKitButton({ raw, name, loadoutId, onCopied }: {
    raw: string
    name: string
    /** Absent on the milpac's own copy button, which reports nothing. */
    loadoutId?: string
    /** Handed the endpoint's own count, so the footer never guesses. */
    onCopied?: (copyCount: number) => void
}) {
    const [copied, setCopied] = useState(false)

    return (
        <button
            type='button'
            className={`${s.btn} ${s.kitCopy}`}
            aria-label={`Copy the ${name} kit export`}
            aria-live='polite'
            onClick={async () => {
                // The clipboard write goes first and is never behind an await
                // on the network: the browser grants clipboard access on the
                // user's gesture, and a round-trip in between is what revokes
                // it. A failed count is invisible; a failed copy is the whole
                // feature not working.
                const ok = await copyText(raw)
                setCopied(ok)
                setTimeout(() => setCopied(false), 1800)

                // Fire-and-forget. `keepalive` so it still goes if the reader
                // navigates away in the same breath.
                if (!loadoutId) return
                fetch(`/api/loadouts/${loadoutId}/copy`, { method: 'POST', keepalive: true })
                    .then(res => res.ok ? res.json() : null)
                    .then(json => { if (json) onCopied?.(json.copyCount) })
                    .catch(() => {})
            }}
        >
            <UiIcon icon={copied ? 'check' : 'copy'} />
            {copied ? 'Copied' : 'Copy'}
        </button>
    )
}
