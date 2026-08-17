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
export function CopyKitButton({ raw, name }: { raw: string; name: string }) {
    const [copied, setCopied] = useState(false)

    return (
        <button
            type='button'
            className={`${s.btn} ${s.kitCopy}`}
            aria-label={`Copy the ${name} kit export`}
            aria-live='polite'
            onClick={async () => {
                setCopied(await copyText(raw))
                setTimeout(() => setCopied(false), 1800)
            }}
        >
            <UiIcon icon={copied ? 'check' : 'copy'} />
            {copied ? 'Copied' : 'Copy'}
        </button>
    )
}
