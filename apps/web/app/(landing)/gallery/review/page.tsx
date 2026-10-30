import { redirect } from 'next/navigation'

import client from '@/lib/discord'
import { canReviewAnything } from '@/lib/gallery/callsign'
import { reviewScope } from '@/lib/gallery/review-scope'
import SubmissionsTab from '@/app/dashboard/j5/tabs/submissions/SubmissionsTab'

export const metadata = { title: 'Review gallery submissions' }

/**
 * The review queue, for a section's staff.
 *
 * J5 review from their dashboard tab; this is the same queue for somebody who
 * is not in J5 but staffs a section, mounted where they can reach it. It is
 * the same component over the same routes — and those routes only ever return
 * what the viewer may review, so a section's staff see what was filed under
 * their own callsign and nothing else.
 */
export default async function Page() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')

    const scope = await reviewScope(me)
    if (!canReviewAnything(scope)) redirect('/gallery')

    return (
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '96px 24px 64px' }}>
            <p style={{ fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.55, margin: 0 }}>
                Gallery
            </p>
            <h1 style={{ fontSize: '1.6rem', margin: '4px 0 6px' }}>Submissions awaiting review</h1>
            <p style={{ opacity: 0.7, margin: '0 0 24px', maxWidth: 640, lineHeight: 1.5 }}>
                {scope.all
                    ? 'Everything waiting to be published.'
                    : `Media filed under ${scope.callsigns.join(' and ')}. Nothing here is public until you or J5 accept it.`}
            </p>
            <SubmissionsTab />
        </main>
    )
}
