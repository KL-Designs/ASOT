import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { doneSteps, inductionRecipient, inductionStatus } from '@/lib/recruitment/induction-pack'
import { loadInductionPack, sendInductionPack } from '@/lib/recruitment/induction-pack-db'

export const dynamic = 'force-dynamic'

/**
 * Row 213, Part A. GET: where this recruit is with the Induction Pack.
 * POST: send it, or send it again. Any J1 member, the same people who run
 * the recruit wizard; every send is logged.
 */

async function gate() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    return { me }
}

async function status(id: string) {
    const app = await Db.j1Applications.findOne({ _id: new ObjectId(id) }, { projection: { discordId: 1, linkedUserId: 1, inductionPack: 1 } })
    if (!app) return null
    const recipient = app.inductionPack?.recipientId || inductionRecipient(app)
    const [config, progress] = await Promise.all([
        loadInductionPack(),
        recipient ? Db.inductionProgress.findOne({ userId: recipient }) : null,
    ])
    return {
        sent: app.inductionPack ?? null,
        status: inductionStatus(app.inductionPack ? progress : null),
        stepsDone: doneSteps(config, progress).length,
        stepsTotal: config.steps.length,
        openedAt: progress?.openedAt ?? null,
        completedAt: progress?.completedAt ?? null,
        selectionInterest: progress?.selectionInterest ?? null,
    }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const g = await gate()
    if (g.error) return g.error
    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid application id.' }, { status: 400 })
    const s = await status(id)
    return s ? NextResponse.json(s) : NextResponse.json({ error: 'Application not found.' }, { status: 404 })
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const g = await gate()
    if (g.error) return g.error
    const { id } = await params
    const me = g.me
    const result = await sendInductionPack(id, { id: me._id, name: me.guild?.nickname || me.globalName || me.username || 'Unknown' })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(await status(id))
}
