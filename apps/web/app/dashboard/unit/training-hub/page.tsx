import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import TrainingHub from '../training-docs/TrainingHub'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) redirect('/me')

    const isJ3Lead = client.hasRoles(me, PERMISSIONS.training.manage)
    const isTrainer = client.hasRoles(me, PERMISSIONS.training.create)
    const isJ3Trainer = client.hasRoles(me, PERMISSIONS.training.trainer)
    const canApproveGuides = client.hasRoles(me, PERMISSIONS.trainingGuides.approve)

    return (
        <TrainingHub
            isJ3Lead={isJ3Lead}
            isTrainer={isTrainer}
            isJ3Trainer={isJ3Trainer}
            myId={me.id}
            isJ3Context={false}
            canApproveGuides={canApproveGuides}
        />
    )
}
