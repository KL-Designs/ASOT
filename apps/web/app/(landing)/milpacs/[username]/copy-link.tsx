'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import s from './profile.module.css'

/**
 * Copies the profile's canonical URL — the name-slug form when the member holds
 * one, so what gets pasted into Discord is `/milpacs/koda` rather than whatever
 * address the reader happened to arrive by.
 *
 * The path comes from the server rather than `window.location`, so the button is
 * correct even on a URL that has not been redirected yet.
 */

/**
 * Pre-`navigator.clipboard` copy, for browsers without it or a page served over
 * plain HTTP. The Clipboard API requires a secure context: localhost qualifies,
 * but a dev server reached over a LAN IP does not, and the promise rejects.
 */
function legacyCopy(text: string): boolean {
    const field = document.createElement('textarea')
    field.value = text
    // Off-screen rather than hidden: display:none and visibility:hidden are both
    // unselectable, and execCommand('copy') copies the selection.
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.top = '-1000px'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    try {
        return document.execCommand('copy')
    } catch {
        return false
    } finally {
        document.body.removeChild(field)
    }
}

export function CopyLinkButton({ path }: { path: string }) {
    const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // A click immediately before unmount would otherwise set state on a gone component.
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

    const copy = useCallback(async () => {
        const url = `${window.location.origin}${path}`

        let ok = false
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(url)
                ok = true
            } else {
                ok = legacyCopy(url)
            }
        } catch {
            // A rejected clipboard write (permission, insecure context) is still
            // worth one attempt at the old path before admitting failure.
            ok = legacyCopy(url)
        }

        setState(ok ? 'copied' : 'failed')
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setState('idle'), 1800)
    }, [path])

    return (
        <button
            type='button'
            onClick={copy}
            className={s.btn}
            title='Copy a link to this milpac'
            // The label changes on click, so the accessible name must too, and
            // the live region is what makes the change audible at all.
            aria-live='polite'
        >
            {state === 'idle' && (
                <svg width={11} height={11} viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
                    <path d='M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z' />
                </svg>
            )}
            {state === 'idle' ? 'Copy link' : state === 'copied' ? 'Copied' : 'Press Ctrl+C'}
        </button>
    )
}
