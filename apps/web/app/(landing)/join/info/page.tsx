import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Db from '@/lib/mongo'
import InfoPageClient from './InfoPageClient'
import { DEFAULT_RECRUITMENT_INFO, type RecruitmentInfoContent } from '@/lib/recruitment-defaults'
import { sanitizeRecruitmentInfo } from '@/lib/sanitizeRecruitmentInfo'

export const metadata: Metadata = {
    title: 'Before You Apply | Australian Special Operations Taskforce',
}

export const dynamic = 'force-dynamic'

export default async function JoinInfoPage() {
    const config = await Db.recruitVideoConfig.findOne({ _id: 'main' }).catch(() => null)
    // If the info page is disabled, skip straight to the application
    if (config && config.showInfoPage === false) redirect('/join')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info: RecruitmentInfoContent = (config as any)?.recruitmentInfo ?? DEFAULT_RECRUITMENT_INFO

    return <InfoPageClient info={sanitizeRecruitmentInfo(info)} />
}
