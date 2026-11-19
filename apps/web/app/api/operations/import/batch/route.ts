/**
 * POST /api/operations/import/batch
 *
 * Accepts multipart/form-data with multiple files OR a single zip file.
 * Creates a batch record, stubs one import per file, then processes them
 * in the background (non-blocking) via setImmediate.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import Db from '@/lib/mongo'
import { parseDocx } from '@/lib/operations/import/parse-docx'
import { parsePdf } from '@/lib/operations/import/parse-pdf'
import { saveExtractedImages, saveOriginalFile } from '@/lib/operations/import/image-extractor'
import { intermediateToSections } from '@/lib/operations/import/doc-to-prosemirror'
import { matchCampaignMission } from '@/lib/operations/import/campaign-matcher'
import { analyseImportedDocument } from '@/lib/ai/prompts/import-analysis'

interface FileEntry {
    filename: string
    buffer: Buffer
    ext: 'pdf' | 'docx'
}

async function extractFiles(formData: FormData): Promise<FileEntry[]> {
    const entries: FileEntry[] = []

    for (const [, value] of formData.entries()) {
        if (!(value instanceof File)) continue

        const fname = value.name
        const ext = fname.split('.').pop()?.toLowerCase()
        const buffer = Buffer.from(await value.arrayBuffer())

        if (ext === 'zip') {
            // Extract from zip
            const zipFiles = await extractFromZip(buffer)
            entries.push(...zipFiles)
        } else if (ext === 'docx' || ext === 'pdf') {
            entries.push({ filename: fname, buffer, ext })
        }
    }

    return entries
}

async function extractFromZip(buffer: Buffer): Promise<FileEntry[]> {
    const unzipper = await import('unzipper')
    const entries: FileEntry[] = []

    const directory = await unzipper.Open.buffer(buffer)
    for (const entry of directory.files) {
        if (entry.type !== 'File') continue
        const name = entry.path.split('/').pop() ?? entry.path
        const ext = name.split('.').pop()?.toLowerCase()
        if (ext !== 'docx' && ext !== 'pdf') continue
        const fileBuffer = await entry.buffer()
        entries.push({ filename: name, buffer: fileBuffer, ext: ext as 'pdf' | 'docx' })
    }

    return entries
}

async function processImport(
    file: FileEntry,
    importOid: ObjectId,
    batchId: string,
    userId: string,
    userName: string
): Promise<void> {
    try {
        const originalStoragePath = await saveOriginalFile(file.buffer, file.filename)

        const doc = file.ext === 'docx'
            ? await parseDocx(file.buffer, file.filename)
            : await parsePdf(file.buffer, file.filename)

        const savedImages = await saveExtractedImages(doc.extractedImages)
        const imageUrlMap = new Map(savedImages.map(s => [s.tempId, s.url]))

        const proposedSections = intermediateToSections(doc)
        for (const section of proposedSections) {
            patchImageSrcs(section.content, imageUrlMap)
        }

        const aiCtx = {
            userId,
            userName,
            departmentId: 'J2',
            feature: 'operations.import' as const,
            relatedId: importOid.toString(),
        }
        const analysis = await analyseImportedDocument(doc, aiCtx)

        const [campaigns, missions] = await Promise.all([
            Db.operationCampaigns.find({ isDeleted: { $ne: true } }).toArray(),
            Db.campaignMissions.find({ isDeleted: { $ne: true } }).toArray(),
        ])
        const campaignMatches = await matchCampaignMission(
            analysis.campaignHint ?? doc.title,
            campaigns as unknown as OperationCampaign[],
            missions as unknown as CampaignMission[]
        )

        const sections: ImportSectionDetection[] = proposedSections.map(s => ({
            smeacLabel: normaliseSmeacLabel(s.title),
            detectedTitle: s.title,
            confidence: 0.8,
            isPublic: s.isPublic,
        }))

        const images: ImportExtractedImage[] = savedImages.map(si => {
            const orig = doc.extractedImages.find(e => e.tempId === si.tempId)
            return {
                tempId: si.tempId,
                storageId: si.storageId,
                storageExt: si.ext,
                mimeType: orig?.mimeType ?? 'image/jpeg',
                captionText: orig?.captionText,
                positionHint: orig?.positionIndex,
            }
        })

        const preview: ImportPreviewSnapshot = {
            detectedTitle: analysis.detectedTitle || doc.title,
            detectedDate: analysis.detectedDate,
            sections,
            images,
            campaignMatches: campaignMatches.map(m => ({
                campaignId: m.campaignId,
                campaignName: m.campaignName,
                missionId: m.missionId,
                missionName: m.missionName,
                confidence: m.confidence,
                reason: m.reason,
            })),
            warnings: [...doc.warnings, ...analysis.warnings],
            proposedSections,
        }

        const topMatch = campaignMatches[0]

        await Db.operationImports.updateOne(
            { _id: importOid },
            {
                $set: {
                    status: 'needs_review',
                    detectedTitle: preview.detectedTitle,
                    originalStoragePath,
                    campaignId: topMatch?.campaignId,
                    campaignMissionId: topMatch?.missionId,
                    campaignConfidence: topMatch?.confidence,
                    matchReason: topMatch?.reason,
                    detectedSections: proposedSections.map(s => s.title),
                    warnings: preview.warnings,
                    preview,
                },
            }
        )
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[import/batch] Failed to process ${file.filename}:`, err)
        await Db.operationImports.updateOne(
            { _id: importOid },
            { $set: { status: 'failed', failureReason: message } }
        )
        throw err
    }
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

    let formData: FormData
    try {
        formData = await request.formData()
    } catch {
        return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const files = await extractFiles(formData)
    if (files.length === 0) {
        return NextResponse.json({ error: 'No valid .pdf or .docx files found' }, { status: 400 })
    }

    const displayName: string = (me as any).displayName ?? (me as any).global_name ?? (me as any).username ?? me.id
    const batchOid = new ObjectId()
    const batchId = batchOid.toString()
    const now = new Date()

    // Create batch record
    await Db.operationImportBatches.insertOne({
        _id: batchOid,
        createdBy: me.id,
        createdAt: now,
        status: 'pending',
        totalFiles: files.length,
        processedCount: 0,
        importedCount: 0,
        needsReviewCount: 0,
        failedCount: 0,
        skippedCount: 0,
        duplicateCount: 0,
    })

    // Create stub import records
    const importStubs = files.map(file => {
        const fileHash = createHash('sha256').update(file.buffer).digest('hex')
        return {
            _id: new ObjectId(),
            batchId,
            sourceFile: file.filename,
            sourceType: file.ext as OperationImportSourceType,
            fileHash,
            importedBy: me.id,
            importedAt: now,
            status: 'processing' as OperationImportStatus,
        }
    })

    await Db.operationImports.insertMany(importStubs)

    // Update batch to processing
    await Db.operationImportBatches.updateOne({ _id: batchOid }, { $set: { status: 'processing' } })

    // Background processing — non-blocking
    setImmediate(async () => {
        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            const stub = importStubs[i]

            // Check if batch is paused
            const batch = await Db.operationImportBatches.findOne({ _id: batchOid })
            if (batch?.status === 'paused') {
                // Stop processing; will resume when PATCH resumes
                break
            }

            await Db.operationImportBatches.updateOne(
                { _id: batchOid },
                { $set: { currentFile: file.filename, currentFileIndex: i } }
            )

            // Check for duplicate
            const duplicate = await Db.operationImports.findOne({
                fileHash: stub.fileHash,
                status: 'imported',
                _id: { $ne: stub._id },
            })

            if (duplicate) {
                await Db.operationImports.updateOne(
                    { _id: stub._id },
                    { $set: { status: 'duplicate' } }
                )
                await Db.operationImportBatches.updateOne(
                    { _id: batchOid },
                    { $inc: { processedCount: 1, duplicateCount: 1 } }
                )
                continue
            }

            let failed = false
            try {
                await processImport(file, stub._id, batchId, me.id, displayName)
            } catch {
                failed = true
            }

            await Db.operationImportBatches.updateOne(
                { _id: batchOid },
                {
                    $inc: {
                        processedCount: 1,
                        ...(failed ? { failedCount: 1 } : { needsReviewCount: 1 }),
                    },
                }
            )
        }

        // Mark batch completed (unless paused partway through)
        const finalBatch = await Db.operationImportBatches.findOne({ _id: batchOid })
        if (finalBatch?.status !== 'paused') {
            await Db.operationImportBatches.updateOne(
                { _id: batchOid },
                { $set: { status: 'completed', completedAt: new Date() } }
            )
        }
    })

    return NextResponse.json({ batchId })
}

function normaliseSmeacLabel(title: string): ImportSectionDetection['smeacLabel'] {
    const lower = title.toLowerCase()
    if (lower.includes('situation')) return 'situation'
    if (lower.includes('mission')) return 'mission'
    if (lower.includes('execution')) return 'execution'
    if (lower.includes('admin') || lower.includes('logistics')) return 'admin_log'
    if (lower.includes('command') || lower.includes('signal') || lower.includes('comms')) return 'command_sig'
    return 'other'
}

function patchImageSrcs(doc: PMDoc | undefined, urlMap: Map<string, string>): void {
    if (!doc?.content) return
    for (const block of doc.content) {
        patchNode(block, urlMap)
    }
}

function patchNode(node: PMBlockNode | PMInlineNode, urlMap: Map<string, string>): void {
    if (node.type === 'image') {
        const img = node as PMImageNode
        if (img.attrs.src === '' || img.attrs.src.startsWith('img_')) {
            const url = urlMap.get(img.attrs.src)
            if (url) img.attrs.src = url
        }
    }
    if ('content' in node && Array.isArray((node as any).content)) {
        for (const child of (node as any).content) {
            patchNode(child, urlMap)
        }
    }
}
