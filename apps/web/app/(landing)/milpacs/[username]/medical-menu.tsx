'use client'

import { useState } from 'react'

/* ============================================================================
   Easter egg — HZN-MED medical menu.

   A parody of the ARMA 3 ACE/KAT medical interface, for practising treatment
   without being under fire. It renders for exactly one member (see
   MEDICAL_MENU_MEMBER in milpac-file.tsx) and is meant to be found rather than
   advertised, so it sits at the foot of the overview as a dim caduceus that
   only resolves into a label on hover.

   The mockup itself is a self-contained HTML document under
   public/easter-eggs/. It is not a React component on purpose: it is ~1,000
   lines with its own reset, its own font stack and a `body` that owns the whole
   viewport, none of which survives being dropped into a page that already has
   all three. A popup window gives it the blank slate it was written against.
   ========================================================================== */

const HREF = '/easter-eggs/medical-menu.html'

export function MedicalMenuEgg() {
    const [hover, setHover] = useState(false)
    const [blocked, setBlocked] = useState(false)

    function open() {
        setBlocked(false)
        const w = window.open(
            HREF,
            'hzn-med',
            'popup=yes,width=1480,height=920,menubar=no,toolbar=no,location=no,status=no',
        )
        // A blocked popup returns null. Say so rather than appearing to do
        // nothing at all — there is no second way to open it that a blocker
        // would not also stop.
        if (!w) setBlocked(true)
        else w.focus()
    }

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '4px 2px 0',
        }}>
            {blocked && (
                <span style={{ fontSize: '0.62rem', letterSpacing: '0.06em', color: 'var(--ink-3)' }}>
                    Popup blocked — allow popups for this site.
                </span>
            )}
            <button
                type='button'
                onClick={open}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                title='HZN-MED · Medical Menu'
                aria-label='Open the HZN-MED medical menu'
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'none',
                    border: 'none',
                    padding: '2px 4px',
                    cursor: 'pointer',
                    fontFamily: 'var(--mono)',
                    fontSize: '0.6rem',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: hover ? 'var(--acc)' : 'var(--ink-3)',
                    opacity: hover ? 1 : 0.35,
                    transition: 'opacity .18s, color .18s',
                }}
            >
                <span style={{ fontSize: '0.85rem', lineHeight: 1 }} aria-hidden>⚕</span>
                <span style={{
                    maxWidth: hover ? 96 : 0,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    transition: 'max-width .22s ease',
                }}>
                    HZN-MED
                </span>
            </button>
        </div>
    )
}

export default MedicalMenuEgg
