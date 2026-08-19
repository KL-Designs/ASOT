import type { Metadata } from 'next'
import { sampleCasualties } from './casualties'
import AceClient from './ace-client'

/* ============================================================================
   /ace — HZN-MED.

   A parody of ARMA's ACE + KAT medical interface, and the only thing on the
   site that is a game. It began as an easter egg inside one member's milpac
   and outgrew being a modal; the milpac still carries the only link to it,
   which is how you are expected to find it.

   Unlisted rather than gated: nothing here reads or writes anything about the
   member looking at it. The one thing it touches is the ORBAT, and only to
   borrow names — see ./casualties.ts.
   ========================================================================== */

export const metadata: Metadata = {
    title: 'HZN-MED',
    description: 'Field medical trainer.',
    robots: { index: false, follow: false },
}

export default async function AcePage() {
    return <AceClient roster={await sampleCasualties()} />
}
