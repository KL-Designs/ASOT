'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { Casualty } from './model'

/* ============================================================================
   Easter egg — the HZN-MED medical menu.

   Renders for exactly one member (see MEDICAL_MENU_MEMBER in milpac-file.tsx)
   at the foot of their overview, as a dim caduceus that only resolves into a
   label on hover. Meant to be found rather than advertised.

   The menu itself is a separate chunk: ~700 lines of UI that one person will
   ever open has no business in the bundle every other milpac downloads.
   ========================================================================== */

const MedicalMenu = dynamic(() => import('./MedicalMenu'), { ssr: false })

export function MedicalMenuEgg({ roster }: {
    /** Candidate casualties from the ORBAT — see ./casualties.ts. */
    roster: Casualty[]
}) {
    const [open, setOpen] = useState(false)
    const [hover, setHover] = useState(false)

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px 2px 2px',
        }}>
            <button
                type='button'
                onClick={() => setOpen(true)}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                title='HZN-MED · Medical Menu'
                aria-label='Open the HZN-MED medical menu'
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 9,
                    background: 'none',
                    border: 'none',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontFamily: 'var(--mono)',
                    fontSize: '0.72rem',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: hover ? 'var(--acc)' : 'var(--ink-3)',
                    opacity: hover ? 1 : 0.4,
                    transition: 'opacity .18s, color .18s',
                }}
            >
                <span style={{ fontSize: '1.2rem', lineHeight: 1 }} aria-hidden>⚕</span>
                <span style={{
                    maxWidth: hover ? 130 : 0,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    transition: 'max-width .22s ease',
                }}>
                    HZN-MED
                </span>
            </button>

            {open && <MedicalMenu roster={roster} onClose={() => setOpen(false)} />}
        </div>
    )
}

export default MedicalMenuEgg
