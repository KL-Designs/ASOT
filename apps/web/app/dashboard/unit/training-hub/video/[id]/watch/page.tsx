import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import VideoWatchClient from './VideoWatchClient'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'

export default async function Page({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ from?: string }>
}) {
    await connection()

    const { id } = await params
    const { from = 'courses' } = await searchParams

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!(await hasDashboardAccess(me))) redirect('/dashboard')

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { redirect('/dashboard/j3') }

    const video = await Db.trainingTypeVideos.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!video) redirect('/dashboard/j3')

    const progress = await Db.trainingVideoProgress.findOne({ userId: me.id, videoId: id }) ?? null

    return (
        <VideoWatchClient
            video={JSON.parse(JSON.stringify(video)) as TrainingTypeVideo & { _id: string }}
            initialProgress={progress ? (JSON.parse(JSON.stringify(progress)) as TrainingVideoProgress) : null}
            from={from}
        />
    )
}
