import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import TrainingDocsPanel from '../TrainingDocsPanel'
import { hasPermission } from '@/lib/orbat/hasPermission'

type Props = { params: Promise<{ id: string }> }

export default async function Page({ params }: Props) {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!(await hasPermission(me, 'pages.member'))) redirect('/me')

    const isJ3 = client.hasRoles(me, PERMISSIONS.trainingDocs.manage)
    const { id } = await params

    return <TrainingDocsPanel isJ3={isJ3} initialDocId={id} />
}
