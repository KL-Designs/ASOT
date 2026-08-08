import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotificationForRole } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

function parseOid(id: string) {
    try { return new ObjectId(id) } catch { return null }
}

function callerName(me: Awaited<ReturnType<typeof client.fetchMe>>) {
    return me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
}

export async function GET(_req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const progress = await Db.trainingVideoProgress.findOne({ userId: me.id, videoId: id })
    return NextResponse.json({ progress: progress ?? null })
}

export async function PUT(req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let body: {
        trainingTypeId?: string
        lastPositionSeconds?: number
        checkpointResult?: {
            checkpointId: string
            passed: boolean
        }
        completed?: boolean
    }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    const now = new Date()
    const existing = await Db.trainingVideoProgress.findOne({ userId: me.id, videoId: id })

    if (!existing) {
        const oid = parseOid(id)
        const video = oid ? await Db.trainingTypeVideos.findOne({ _id: oid }) : null
        const trainingTypeId = body.trainingTypeId ?? video?.trainingTypeId ?? ''

        await Db.trainingVideoProgress.insertOne({
            userId: me.id,
            videoId: id,
            trainingTypeId,
            lastPositionSeconds: body.lastPositionSeconds ?? 0,
            checkpoints: [],
            completed: false,
            startedAt: now,
            updatedAt: now,
        } as TrainingVideoProgress)

        return NextResponse.json({ ok: true })
    }

    const update: Record<string, unknown> = { updatedAt: now }

    if (body.lastPositionSeconds !== undefined) update.lastPositionSeconds = body.lastPositionSeconds
    if (body.completed) { update.completed = true; update.completedAt = now }

    let notifyLead = false
    let notifyCheckpointQuestion = ''

    if (body.checkpointResult) {
        const { checkpointId, passed } = body.checkpointResult
        const cpList: TrainingVideoCheckpointProgress[] = [...(existing.checkpoints ?? [])]
        const idx = cpList.findIndex(c => c.checkpointId === checkpointId)

        if (idx === -1) {
            cpList.push({ checkpointId, passed, attempts: 1, lastAttemptAt: now })
        } else {
            const cp = { ...cpList[idx] }
            cp.attempts = (cp.attempts ?? 0) + 1
            cp.passed = passed
            cp.lastAttemptAt = now

            // 3rd fail — notify J3 lead (once only)
            if (!passed && cp.attempts >= 3 && !cp.notifiedLeadAt) {
                cp.notifiedLeadAt = now
                notifyLead = true

                const oid = parseOid(id)
                const video = oid ? await Db.trainingTypeVideos.findOne({ _id: oid }) : null
                const checkpoint = video?.checkpoints.find(c => c.id === checkpointId)
                notifyCheckpointQuestion = checkpoint?.question ?? 'a checkpoint'
            }

            cpList[idx] = cp
        }

        update.checkpoints = cpList
    }

    await Db.trainingVideoProgress.updateOne({ userId: me.id, videoId: id }, { $set: update })

    if (notifyLead) {
        const name = callerName(me)
        for (const leadRole of PERMISSIONS.departmentLeads.j3) {
            await createNotificationForRole(leadRole, {
                type: 'training_video_checkpoint_fail',
                title: 'Checkpoint Assistance Required',
                body: `${name} has failed the same checkpoint 3 times: "${notifyCheckpointQuestion}". Please allocate a trainer to assist.`,
                actionUrl: '/dashboard/j3',
                relatedId: id,
            }).catch(console.error)
        }
    }

    return NextResponse.json({ ok: true })
}

/** J3 lead allocates a trainer to a member for a specific checkpoint */
export async function PATCH(req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j3)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let body: { userId: string; checkpointId: string; trainerId: string; trainerName: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    const now = new Date()

    await Db.trainingVideoProgress.updateOne(
        { userId: body.userId, videoId: id, 'checkpoints.checkpointId': body.checkpointId },
        {
            $set: {
                'checkpoints.$.allocatedTrainerId':   body.trainerId,
                'checkpoints.$.allocatedTrainerName': body.trainerName,
                'checkpoints.$.allocatedAt':          now,
                updatedAt: now,
            },
        },
    )

    return NextResponse.json({ ok: true })
}
