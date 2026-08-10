import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import GuideEditorPage from './GuideEditorPage'
import { hasPermission } from '@/lib/orbat/hasPermission'

export default async function Page({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ from?: string }>
}) {
    await connection()

    const { id } = await params
    const { from } = await searchParams

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!(await hasPermission(me, 'pages.member'))) redirect('/me')

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { redirect('/dashboard/unit/training-hub') }

    const isJ3 = client.hasRoles(me, PERMISSIONS.departments.j3)
    const isEditable = client.hasRoles(me, PERMISSIONS.trainingGuides.write)
    const canApprove = client.hasRoles(me, PERMISSIONS.trainingGuides.approve)
    const canDelete = client.hasRoles(me, PERMISSIONS.trainingGuides.delete)

    const guide = await Db.trainingGuides.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!guide) redirect('/dashboard/unit/training-hub')
    if (guide.status !== 'approved' && !isJ3) redirect('/dashboard/unit/training-hub')

    const backUrl = from === 'hub' ? '/dashboard/unit/training-hub' : '/dashboard/j3?tab=0'

    return (
        <GuideEditorPage
            guide={JSON.parse(JSON.stringify(guide))}
            guideId={id}
            isEditable={isEditable}
            canApprove={canApprove}
            canDelete={canDelete}
            backUrl={backUrl}
        />
    )
}
