import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'
import { assessmentStanding } from '@/lib/training/orders-assessment-db'
import AssessmentManager from '@/components/orders-assessment/AssessmentManager'

export const metadata = { title: 'Assessment Orders' }

/**
 * Rows 372 and 373: a Leadership course's Assessment Orders. Training staff
 * and guide writers manage it; a trainer who is neither still reaches the
 * assessments assigned to them.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ typeId: string }>; searchParams: Promise<{ review?: string; session?: string; from?: string }> }) {
    await connection()
    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!(await hasDashboardAccess(me))) redirect('/me')
    const { typeId } = await params
    const { review, session, from } = await searchParams
    const standing = await assessmentStanding(me)
    const isTrainer = !!(await Db.ordersAssessments.findOne({ trainingTypeId: typeId, trainerId: me.id }, { projection: { _id: 1 } }))
    if (!standing.isTrainingStaff && !standing.canEditConfig && !isTrainer) redirect('/dashboard/unit/training-hub')
    return <AssessmentManager typeId={typeId} myId={me.id} initialReview={review ?? null} initialSession={session ?? ''} backUrl={from === 'records' ? '/dashboard/j3?tab=4' : '/dashboard/unit/training-hub'} />
}
