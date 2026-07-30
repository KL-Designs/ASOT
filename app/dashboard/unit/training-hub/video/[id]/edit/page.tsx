import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import VideoEditorClient from './VideoEditorClient'

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
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) redirect('/dashboard/j3')

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { redirect('/dashboard/j3') }

    const video = await Db.trainingTypeVideos.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!video) redirect('/dashboard/j3')

    return (
        <VideoEditorClient
            video={JSON.parse(JSON.stringify(video)) as TrainingTypeVideo & { _id: string }}
            from={from}
        />
    )
}
