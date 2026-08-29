import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { can } from '@/lib/operations/permissions'
import { aarOpen } from '@/lib/operations/aar'
import AarBoard from './AarBoard'

/**
 * `/operations/{id}/aar` — the After Action Report.
 *
 * A sibling of `/edit` like the other tabs, and the only one that does not
 * exist for most of an operation's life: it appears when the operation finishes
 * and stays from then on.
 *
 * Two gates, and they are different in kind. `aar.view` is a permission —
 * whether this member may read AARs at all. `aarOpen()` is a fact about the
 * operation — whether there is anything to read yet. A viewer who fails the
 * first is sent to the public page; a viewer who fails the second is told the
 * operation has not run, because that is a "come back later", not a refusal.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    await connection()

    let operationId: ObjectId
    try {
        operationId = new ObjectId(id)
    } catch {
        redirect('/operations')
    }

    const me = await client.fetchMe().catch(() => null)
    if (!(await can(me, 'aar.view'))) redirect(`/operations/${id}`)

    const [operation, attendance] = await Promise.all([
        Db.operations.findOne(
            { _id: operationId },
            { projection: { title: 1, status: 1, themeColor: 1, date: 1 } },
        ).catch(() => null),
        Db.operationAttendance.findOne(
            { operationId },
            { projection: { stage: 1 } },
        ).catch(() => null),
    ])
    if (!operation) redirect('/operations')

    return (
        <AarBoard
            operationId={id}
            title={operation.title}
            status={operation.status}
            themeColor={operation.themeColor}
            date={operation.date ? new Date(operation.date).toISOString() : null}
            open={aarOpen(attendance?.stage ?? null)}
        />
    )
}
