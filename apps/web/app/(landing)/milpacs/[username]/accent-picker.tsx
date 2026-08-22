'use client'

import { useState } from 'react'
import s from './profile.module.css'

/**
 * The member's own accent colour, set from their own file.
 *
 * Rendered into the banner's badge row beside the cover controls — this is the
 * other thing on the page that only its owner can change, and the two belong
 * together.
 *
 * Saves on `change`, not `input`: a native colour input fires `input`
 * continuously while the pointer moves around the picker, which would be one
 * write per pixel dragged. `change` fires once, when the choice is committed.
 */
export function AccentPicker({ accent, isCustom: initialIsCustom }: {
    /** The colour currently in effect, whatever it was resolved from. */
    accent: string
    /** Whether that colour is the member's own pick rather than a fallback. */
    isCustom: boolean
}) {
    const [colour, setColour] = useState(accent)
    const [isCustom, setIsCustom] = useState(initialIsCustom)
    const [busy, setBusy] = useState(false)

    const save = async (value: string) => {
        setBusy(true)
        // Optimistic: the swatch is the control's own feedback, and a colour
        // that lags behind the picker reads as a control that didn't work.
        setColour(value)
        const res = await fetch('/api/me/accent', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accent: value }),
        })
        const json = await res.json().catch(() => ({ error: 'Could not save that colour' }))
        if (json.error) {
            alert(json.error)
            setColour(accent)
            setBusy(false)
            return
        }
        setIsCustom(true)
        // The accent is painted by the server into `--acc` on the page shell and
        // into every other surface that shows this member, so a reload is what
        // makes the whole file agree rather than just this control.
        window.location.reload()
    }

    const reset = async () => {
        setBusy(true)
        const res = await fetch('/api/me/accent', { method: 'DELETE' })
        const json = await res.json().catch(() => ({ error: 'Could not reset your colour' }))
        if (json.error) {
            alert(json.error)
            setBusy(false)
            return
        }
        setIsCustom(false)
        window.location.reload()
    }

    return (
        <>
            <label
                title='Set the accent colour used across your milpac and the roster'
                className={`${s.btn} ${s.btnOnImage} ${busy ? s.btnBusy : ''}`}
            >
                <span
                    aria-hidden='true'
                    style={{
                        width: 12,
                        height: 12,
                        flex: 'none',
                        background: colour,
                        border: '1px solid rgba(255,255,255,.35)',
                    }}
                />
                {isCustom ? 'Accent' : 'Set accent'}
                <input
                    type='color'
                    hidden
                    value={colour}
                    disabled={busy}
                    onChange={e => save(e.target.value)}
                />
            </label>

            {isCustom && (
                <button
                    type='button'
                    title='Go back to your Discord accent, or the unit red if you have none'
                    onClick={reset}
                    disabled={busy}
                    className={`${s.btn} ${s.btnOnImage} ${busy ? s.btnBusy : ''}`}
                >
                    Reset
                </button>
            )}
        </>
    )
}
