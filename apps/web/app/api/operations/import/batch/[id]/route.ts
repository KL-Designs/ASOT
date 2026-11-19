/**
 * GET /api/operations/import/batch/[id]  — batch status + all its imports
 * PATCH /api/operations/import/batch/[id] — { action: 'pause' | 'resume' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import Db from '@/lib/mongo'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteParams) {
    let me: Awaited<ReturnType<typeof client.fetchMe>>
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const permitted =
        await hasPermission(me as unknown as User, 'operations.write') ||
        client.hasRoles(me, PERMISSIONS.pages.operationsEdit)
    if (!permitted) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { id } = await params
    let batchOid: ObjectId
    try {
        batchOid = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid batch ID' }, { status: 400 })
    }

    const [batch, imports] = await Promise.all([
        Db.operationImportBatches.findOne({ _id: batchOid }),
        Db.operationImports.find({ batchId: id }).sort({ importedAt: 1 }).toArray(),
    ])

    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })

    return NextResponse.json({ batch, imports })
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
    let me: Awaited<ReturnType<typeof client.fetchMe>>
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const permitted =
        await hasPermission(me as unknown as User, 'operations.write') ||
        client.hasRoles(me, PERMISSIONS.pages.operationsEdit)
    if (!permitted) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { id } = await params
    let batchOid: ObjectId
    try {
        batchOid = new ObjectId(id)
    } catch {
        return NextResponse.json({ error: 'Invalid batch ID' }, { status: 400 })
    }

    let body: { action?: string }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { action } = body
    if (action !== 'pause' && action !== 'resume') {
        return NextResponse.json({ error: 'action must be "pause" or "resume"' }, { status: 400 })
    }

    const batch = await Db.operationImportBatches.findOne({ _id: batchOid })
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })

    const newStatus: OperationImportBatchStatus = action === 'pause' ? 'paused' : 'processing'

    await Db.operationImportBatches.updateOne(
        { _id: batchOid },
        { $set: { status: newStatus } }
    )

    return NextResponse.json({ success: true, status: newStatus })
}
