import { redirect } from 'next/navigation'

import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import SubmitClient from './SubmitClient'

/**
 * Gated on `gallery.submit`, which has no Discord-role fallback and no legacy
 * arm — so until somebody grants it in the Roles Manager this redirects
 * everybody, including staff. That is the intended behaviour; see the key's
 * own comment in lib/permissions.ts.
 */
export default async function Page() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!await hasPermission(me, 'gallery.submit')) redirect('/gallery')

    return <SubmitClient authorName={me.guild?.displayName || me.globalName || me.username} />
}
