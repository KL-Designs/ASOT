import { notFound, redirect } from 'next/navigation'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import Db from '@/lib/mongo'
import CourseWorkspaceClient from './CourseWorkspaceClient'

export const dynamic = 'force-dynamic'

export default async function CourseWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) redirect('/dashboard/unit/training')

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { notFound() }

    const instance = await Db.courseInstances.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!instance) notFound()

    const myName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const canManage = await hasPermission(me, 'departmentLeads.j3')

    const pendingProposalsCount = instance.isLocked
        ? await Db.changeProposals.countDocuments({ courseInstanceId: id, status: 'pending' })
        : 0

    return (
        <CourseWorkspaceClient
            instanceId={id}
            instanceRef={instance.instanceRef}
            courseType={instance.courseType}
            trainingTypeName={instance.trainingTypeName}
            status={instance.status}
            myId={me.id}
            myName={myName}
            session1Date={instance.session1Date?.toISOString()}
            startDate={instance.startDate?.toISOString()}
            endDate={instance.endDate?.toISOString()}
            leadInstructorName={instance.leadInstructorName}
            candidateCount={instance.candidateCount}
            canManage={canManage}
            isLocked={instance.isLocked ?? false}
            pendingProposalsCount={pendingProposalsCount}
        />
    )
}
