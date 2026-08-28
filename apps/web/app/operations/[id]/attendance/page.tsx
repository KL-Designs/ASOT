import { redirect } from 'next/navigation'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import EditorPage from '../edit/EditorPage'
import MemberBoard from './MemberBoard'

/**
 * `/operations/{id}/attendance` -- the Attendance tab.
 *
 * A sibling of `/edit` rather than a child of it: the four tabs are four views
 * of one operation, and burying three of them a level deeper than the fourth
 * made the URLs read as if Brief were the operation and the rest were
 * sub-pages of the editor.
 *
 * Two audiences from one path. Staff get the editor shell, where switching tabs
 * never actually navigates -- `useEditorTab` rewrites the URL with
 * `replaceState` so the Hocuspocus socket and Y.Doc survive, and this file
 * answers only a cold load or a refresh. A signed-in member gets the board on
 * its own: the same roster in read-and-claim mode, with none of the authoring
 * chrome around it.
 *
 * Members reach it because the board is how they RSVP and take a position. It
 * used to sit at the bottom of the orders page, and the Modern rebuild replaced
 * it there with a single call to action pointing here -- a button to a door
 * that closed in their face would have been worse than the panel it replaced.
 *
 * A logged-out visitor still goes back to the operation's public page. They
 * asked for *this* operation, and that is the version of it they can see.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect(`/operations/${id}`)

    if (client.hasRoles(me, PERMISSIONS.pages.operationsEdit)) return <EditorPage />

    const operation = await Db.operations.findOne(
        { _id: new ObjectId(id) },
        { projection: { title: 1, status: 1, themeColor: 1, date: 1 } },
    ).catch(() => null)
    if (!operation) redirect(`/operations/${id}`)

    return (
        <MemberBoard
            operationId={id}
            title={operation.title}
            status={operation.status}
            themeColor={operation.themeColor}
            date={operation.date ?? null}
            myUserId={me.id}
        />
    )
}
