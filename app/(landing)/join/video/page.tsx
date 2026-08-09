import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Db from '@/lib/mongo'
import VideoPageClient from './VideoPageClient'

export const metadata: Metadata = {
    title: 'Join ASOT | Australian Special Operations Taskforce',
}

export default async function JoinVideoPage() {
    const config = await Db.recruitVideoConfig.findOne({ _id: 'main' }).catch(() => null)
    if (!config?.enabled || !config?.videoUrl) redirect('/join')
    return (
        <VideoPageClient
            videoUrl={config.videoUrl}
            startDelay={config.startDelay ?? 2}
            showInfoPage={config.showInfoPage ?? true}
        />
    )
}
