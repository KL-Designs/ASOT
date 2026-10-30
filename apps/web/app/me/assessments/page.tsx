import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import client from '@/lib/discord'
import MyAssessments from '@/components/orders-assessment/MyAssessments'

export const metadata = { title: 'My Assessments' }

/** Row 373: a trainee's orders-writing assessments. Under /me so a trainee without dashboard access can still reach them. */
export default async function Page() {
    await connection()
    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    return <MyAssessments />
}
