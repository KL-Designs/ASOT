'use client'

import { useEffect, useState } from 'react'
import s from '@/styles/navbar.module.css'

/**
 * Turns the site's custom cursor on and off from the status rail.
 *
 * The glyph is the cursor itself in miniature: a dot alone when off, and the
 * dot inside a ring when on — the same two parts `components/cursor.tsx` draws
 * at 4px and 30px, so the control looks like the thing it controls.
 *
 * The preference lives in `localStorage['cursor-disabled']` and is broadcast as
 * a `cursor-toggle` CustomEvent, which is the contract `CustomCursor` already
 * listens on. `/preferences` has a switch over the same preference, and this
 * button listens for that event as well as dispatching it — otherwise toggling
 * on the preferences page (which renders under this very navbar) would leave
 * the rail showing a stale state.
 */
export default function CursorToggle() {
    // Undefined until the stored preference is read. Rendering a definite state
    // during SSR would flash the wrong one on hydration for anyone who has
    // turned the cursor off.
    const [enabled, setEnabled] = useState<boolean | undefined>(undefined)

    useEffect(() => {
        setEnabled(localStorage.getItem('cursor-disabled') !== 'true')

        const onExternalToggle = (e: Event) => {
            setEnabled(!(e as CustomEvent<{ disabled: boolean }>).detail.disabled)
        }
        window.addEventListener('cursor-toggle', onExternalToggle)
        return () => window.removeEventListener('cursor-toggle', onExternalToggle)
    }, [])

    const on = enabled ?? true

    function toggle() {
        const next = !on
        setEnabled(next)
        localStorage.setItem('cursor-disabled', next ? 'false' : 'true')
        window.dispatchEvent(new CustomEvent('cursor-toggle', { detail: { disabled: !next } }))
    }

    return (
        <button
            type='button'
            onClick={toggle}
            role='switch'
            aria-checked={on}
            aria-label='Custom cursor'
            title={on ? 'Disable custom cursor' : 'Enable custom cursor'}
            className={`${s.cursorToggle} ${on ? s.on : ''}`}
        >
            <span className={s.ring} />
            <span className={s.dot} />
        </button>
    )
}
