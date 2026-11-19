import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import ImportPanel from '../ImportPanel'

type Params = Promise<{ batchId: string }>

export default async function Page({ params }: { params: Params }) {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')

    const permitted =
        await hasPermission(me as unknown as User, 'operations.write') ||
        client.hasRoles(me, PERMISSIONS.pages.operationsEdit)
    if (!permitted) redirect('/dashboard/j2')

    const { batchId } = await params

    return <ImportPanel batchId={batchId} />
}
