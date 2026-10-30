import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import client from '@/lib/discord'
import TraineeAssessment from '@/components/orders-assessment/TraineeAssessment'

export const metadata = { title: 'Orders Assessment' }

/** Row 373: one assessment, from the trainee's side. The similarity check is never sent here. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    await connection()
    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    const { id } = await params
    return <TraineeAssessment id={id} />
}
