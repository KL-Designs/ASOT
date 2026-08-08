import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { syncInstanceStats } from '@/lib/training/sync-instance-stats'
import { logAction } from '@/lib/logAction'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const candidates = await Db.courseCandidates.find({ courseInstanceId: id }).sort({ candidateNumber: 1 }).toArray()
    return NextResponse.json({ candidates })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const instance = await Db.courseInstances.findOne({ _id: oid, deletedAt: { $exists: false } })
    if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    const { userId, displayName, discordUsername } = body
    if (!displayName) return NextResponse.json({ error: 'displayName required' }, { status: 400 })

    if (userId) {
        const exists = await Db.courseCandidates.findOne({ courseInstanceId: id, userId })
        if (exists) return NextResponse.json({ error: 'Candidate already in course' }, { status: 409 })
    }

    // Atomic permanent candidate number — never reused globally
    const counter = await Db.permanentCandidateCounters.findOneAndUpdate(
        { _id: 'global' },
        { $inc: { seq: 1 } } as Parameters<typeof Db.permanentCandidateCounters.findOneAndUpdate>[1],
        { upsert: true, returnDocument: 'after' },
    )
    const candidateNumber = counter?.seq ?? 1

    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const now = new Date()

    const doc = {
        courseInstanceId: id,
        candidateNumber,
        status: 'active' as CandidateStatus,
        displayName,
        addedById: me.id,
        addedByName: name,
        joinedAt: now,
        updatedAt: now,
        ...(userId ? { userId } : {}),
        ...(discordUsername ? { discordUsername } : {}),
    }

    const result = await Db.courseCandidates.insertOne(doc as CourseCandidate)

    await logAction({
        action: 'candidate.add',
        category: 'J3',
        performedBy: me.id,
        performedByName: name,
        department: 'J3',
        entityType: 'course_candidate',
        entityId: String(result.insertedId),
        after: { candidateNumber, displayName, courseInstanceId: id, instanceRef: instance.instanceRef },
    })

    syncInstanceStats(id, oid).catch(() => {})

    return NextResponse.json({ ...doc, _id: result.insertedId }, { status: 201 })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { candidateId, status, notes } = body
    if (!candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400 })

    let candOid: ObjectId
    try { candOid = new ObjectId(candidateId) } catch { return NextResponse.json({ error: 'Invalid candidateId' }, { status: 400 }) }

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (status !== undefined) updates.status = status
    if (notes !== undefined) updates.notes = notes

    const result = await Db.courseCandidates.findOneAndUpdate(
        { _id: candOid, courseInstanceId: id },
        { $set: updates },
        { returnDocument: 'after' },
    )
    if (!result) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })

    syncInstanceStats(id, oid).catch(() => {})

    return NextResponse.json({ candidate: result })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.training.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { candidateId } = body
    if (!candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400 })

    let candOid: ObjectId
    try { candOid = new ObjectId(candidateId) } catch { return NextResponse.json({ error: 'Invalid candidateId' }, { status: 400 }) }

    let oid: ObjectId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid ID' }, { status: 400 }) }

    const candidateToDelete = await Db.courseCandidates.findOne({ _id: candOid, courseInstanceId: id })

    await Db.courseCandidates.deleteOne({ _id: candOid, courseInstanceId: id })

    const removeName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    await logAction({
        action: 'candidate.remove',
        category: 'J3',
        performedBy: me.id,
        performedByName: removeName,
        department: 'J3',
        entityType: 'course_candidate',
        entityId: candidateId,
        after: {
            courseInstanceId: id,
            ...(candidateToDelete ? { candidateNumber: candidateToDelete.candidateNumber, displayName: candidateToDelete.displayName } : {}),
        },
    })

    syncInstanceStats(id, oid).catch(() => {})

    return NextResponse.json({ ok: true })
}
