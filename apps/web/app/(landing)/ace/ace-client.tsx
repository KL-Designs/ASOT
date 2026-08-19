'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import type { Casualty } from './model'

/* ============================================================================
   The page's thin client half.

   HZN-MED was a modal on one member's milpac and is a route now, but it is
   still the same full-screen overlay — so the page's job is only to hold it
   open and to answer its Close with a navigation instead of a state change.

   Loaded with `ssr: false` because the menu is entirely a client machine: an
   AudioContext, an animation frame and a 250 ms simulation loop, none of which
   mean anything on a server and none of which would survive hydration intact.
   ========================================================================== */

const MedicalMenu = dynamic(() => import('./MedicalMenu'), { ssr: false })

export default function AceClient({ roster }: {
    /** Candidate casualties from the ORBAT — see ./casualties.ts. */
    roster: Casualty[]
}) {
    const router = useRouter()

    // Back where they came from if there is a there; the milpac it used to live
    // on if they arrived by typing the URL.
    return <MedicalMenu roster={roster} onClose={() => router.push('/milpacs/res')} />
}
