import { redirect } from 'next/navigation'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import EditorPage from '../edit/EditorPage'

/**
 * `/operations/{id}/attendance` — the editor's Attendance tab.
 *
 * A sibling of `/edit` rather than a child of it: the four tabs are four views
 * of one operation, and burying three of them a level deeper than the fourth
 * made the URLs read as if Brief were the operation and the rest were
 * sub-pages of the editor.
 *
 * Switching tabs never actually navigates here — `useEditorTab` rewrites the
 * URL with `replaceState` so the Hocuspocus socket and Y.Doc survive. This file
 * exists to answer a cold load or a refresh.
 *
 * `/edit` has a layout that gates it; these routes sit outside that layout, so
 * each carries its own check. A member without edit rights is sent to the
 * operation's public page rather than bounced to the operations list — they
 * asked for *this* operation, and the public page is the version of it they can
 * actually see.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.pages.operationsEdit)) redirect(`/operations/${id}`)
    return <EditorPage />
}
