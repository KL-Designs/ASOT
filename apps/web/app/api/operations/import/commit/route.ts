/**
 * POST /api/operations/import/commit
 *
 * Finalises an import review and creates the Operation document.
 * Enforces isPublic: false on Execution, Admin & Log, and Command & Sig.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'

const ALWAYS_PRIVATE_TITLES = ['execution', 'admin & log', 'admin and log', 'command & sig', 'command and sig']

function enforceVisibility(sections: OperationSection[]): OperationSection[] {
    return sections.map(s => {
        const lower = s.title.toLowerCase().trim()
        const mustBePrivate =
            ALWAYS_PRIVATE_TITLES.includes(lower) ||
            lower.includes('execution') ||
            (lower.includes('admin') && lower.includes('log')) ||
            (lower.includes('command') && (lower.includes('sig') || lower.includes('signal')))
        if (mustBePrivate && s.isPublic) {
            return { ...s, isPublic: false }
        }
        return s
    })
}

export async function POST(request: NextRequest) {
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

    let body: {
        importId?: string
        campaignId?: string
        campaignMissionId?: string
        daySlot?: 'saturday' | 'sunday' | null
        sections?: OperationSection[]
        operationTitle?: string
    }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { importId, campaignId, campaignMissionId, daySlot, sections, operationTitle } = body

    if (!importId) return NextResponse.json({ error: 'importId required' }, { status: 400 })
    if (!sections?.length) return NextResponse.json({ error: 'sections required' }, { status: 400 })
    if (!operationTitle?.trim()) return NextResponse.json({ error: 'operationTitle required' }, { status: 400 })

    let importOid: ObjectId
    try {
        importOid = new ObjectId(importId)
    } catch {
        return NextResponse.json({ error: 'Invalid importId' }, { status: 400 })
    }

    const importRecord = await Db.operationImports.findOne({ _id: importOid })
    if (!importRecord) return NextResponse.json({ error: 'Import record not found' }, { status: 404 })

    if (importRecord.status !== 'needs_review' && importRecord.status !== 'processing') {
        return NextResponse.json(
            { error: `Import has status '${importRecord.status}' — cannot commit` },
            { status: 409 }
        )
    }

    // Duplicate check by file hash
    const existingByHash = await Db.operationImports.findOne({
        fileHash: importRecord.fileHash,
        status: 'imported',
        _id: { $ne: importOid },
    })
    if (existingByHash) {
        return NextResponse.json(
            {
                error: 'duplicate',
                existingImportId: existingByHash._id.toString(),
                existingOperationId: existingByHash.operationId,
            },
            { status: 409 }
        )
    }

    // Enforce visibility rules
    const safeSections = enforceVisibility(sections)

    const displayName: string = (me as any).displayName ?? (me as any).global_name ?? (me as any).username ?? me.id

    const operationOid = new ObjectId()
    const now = new Date()

    const importMetadata: OperationImportMetadata = {
        importId: importId,
        sourceFile: importRecord.sourceFile,
        sourceType: importRecord.sourceType,
        importedAt: importRecord.importedAt,
        importedBy: importRecord.importedBy,
        importedByName: displayName,
        isHistorical: true,
    }

    await Db.operations.insertOne({
        _id: operationOid,
        title: operationTitle.trim(),
        department: 'J2',
        date: now,
        loreDate: '',
        status: 'Completed' as const,
        sections: safeSections,
        pages: [{ id: 'main', title: 'Orders', isMain: true }],
        ...(campaignId ? { campaignId: new ObjectId(campaignId) } : {}),
        ...(campaignMissionId ? { campaignMissionId } : {}),
        ...(daySlot ? { daySlot } : {}),
        importMetadata,
    })

    await Db.operationImports.updateOne(
        { _id: importOid },
        { $set: { status: 'imported', operationId: operationOid.toString() } }
    )

    logAction({
        action: 'operation.import.commit',
        category: 'operation',
        performedBy: me.id,
        performedByName: displayName,
        department: 'J2',
        entityType: 'operation',
        entityId: operationOid.toString(),
        target: operationTitle.trim(),
        details: { importId, sourceFile: importRecord.sourceFile, campaignId, campaignMissionId },
    })

    return NextResponse.json({ operationId: operationOid.toString() })
}
