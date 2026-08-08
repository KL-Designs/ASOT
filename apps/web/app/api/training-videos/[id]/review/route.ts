import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { callText } from '@/lib/ai/service'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

function callerName(me: Awaited<ReturnType<typeof client.fetchMe>>) {
    return me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
}

export async function POST(req: NextRequest, { params }: Params) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.member)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let body: { checkpointId: string; answer: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
    if (!body.checkpointId || !body.answer?.trim()) return NextResponse.json({ error: 'checkpointId and answer required' }, { status: 400 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const video = await Db.trainingTypeVideos.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const checkpoint = video.checkpoints.find(c => c.id === body.checkpointId)
    if (!checkpoint || checkpoint.type !== 'written') return NextResponse.json({ error: 'Checkpoint not found or not written type' }, { status: 400 })

    const prompt = `You are evaluating a trainee's written answer to a checkpoint question in a military simulation training video.

Question: ${checkpoint.question}

Evaluation rubric:
${checkpoint.rubric ?? 'The answer should demonstrate understanding of the topic.'}

Trainee's answer:
${body.answer.trim()}

Respond with a JSON object only (no markdown fences), with this exact structure:
{"passed": true/false, "feedback": "one or two sentence explanation"}`

    const name = callerName(me)
    const result = await callText(
        { messages: [{ role: 'user', content: prompt }] },
        { userId: me.id, userName: name, feature: 'training.answer_review', relatedId: id }
    )

    let parsed: { passed: boolean; feedback: string }
    try {
        parsed = JSON.parse(result.content)
    } catch {
        return NextResponse.json({ error: 'AI response parse error', raw: result.content }, { status: 500 })
    }

    return NextResponse.json({ passed: !!parsed.passed, feedback: parsed.feedback ?? '', cost: result.actualCostUsd })
}
