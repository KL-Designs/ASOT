/**
 * POST /api/operations/import/parse
 *
 * Accepts a multipart/form-data upload (file + filename).
 * Parses the document, saves images, runs AI analysis, builds ProseMirror sections,
 * matches campaigns, and creates an OperationImport record ready for review.
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

    const fileEntry = formData.get('file')
    const filenameEntry = formData.get('filename')

    if (!(fileEntry instanceof File)) {
        return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }

    const filename = typeof filenameEntry === 'string' ? filenameEntry : fileEntry.name
    const ext = filename.split('.').pop()?.toLowerCase()

    if (ext !== 'docx' && ext !== 'pdf') {
        return NextResponse.json({ error: 'Only .docx and .pdf files are supported' }, { status: 400 })
    }

    const buffer = Buffer.from(await fileEntry.arrayBuffer())
    const fileHash = createHash('sha256').update(buffer).digest('hex')

    // Check for existing duplicate
    const duplicate = await Db.operationImports.findOne({ fileHash, status: 'imported' })
    if (duplicate) {
        return NextResponse.json(
            { error: 'duplicate', importId: duplicate._id.toString(), operationId: duplicate.operationId },
            { status: 409 }
        )
    }

    // Create stub import record
    const importId = new ObjectId()
    const displayName: string = (me as any).displayName ?? (me as any).global_name ?? (me as any).username ?? me.id

    await Db.operationImports.insertOne({
        _id: importId,
        sourceFile: filename,
        sourceType: ext as OperationImportSourceType,
        fileHash,
        importedBy: me.id,
        importedAt: new Date(),
        status: 'processing',
    })

    try {
        // Save original file for audit trail
        const originalStoragePath = await saveOriginalFile(buffer, filename)

        // Parse document
        const doc = ext === 'docx'
            ? await parseDocx(buffer, filename)
            : await parsePdf(buffer, filename)

        // Save images
        const savedImages = await saveExtractedImages(doc.extractedImages)
        const imageUrlMap = new Map(savedImages.map(s => [s.tempId, s.url]))

        // Update image_ref elements in doc with real URLs (for preview rendering)
        // The intermediateToSections function uses the saved URLs map

        // Build ProseMirror sections
        const proposedSections = intermediateToSections(doc)

        // Patch image srcs in proposed sections using saved URLs
        for (const section of proposedSections) {
            patchImageSrcs(section.content, imageUrlMap)
        }

        // AI analysis
        const aiCtx = {
            userId: me.id,
            userName: displayName,
            departmentId: 'J2',
            feature: 'operations.import' as const,
            relatedId: importId.toString(),
        }
        const analysis = await analyseImportedDocument(doc, aiCtx)

        // Campaign matching
        const [campaigns, missions] = await Promise.all([
            Db.operationCampaigns.find({ isDeleted: { $ne: true } }).toArray(),
            Db.campaignMissions.find({ isDeleted: { $ne: true } }).toArray(),
        ])
        const campaignMatches = await matchCampaignMission(
            analysis.campaignHint ?? doc.title,
            campaigns as unknown as OperationCampaign[],
            missions as unknown as CampaignMission[]
        )

        // Build section detections for preview
        const sections: ImportSectionDetection[] = proposedSections.map(s => {
            const label = normaliseSmeacLabel(s.title)
            return {
                smeacLabel: label,
                detectedTitle: s.title,
                confidence: 0.8,
                isPublic: s.isPublic,
            }
        })

        // Build images list for preview
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
            { _id: importId },
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

        return NextResponse.json({ importId: importId.toString(), preview })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await Db.operationImports.updateOne(
            { _id: importId },
            { $set: { status: 'failed', failureReason: message } }
        )
        console.error('[import/parse] Error:', err)
        return NextResponse.json({ error: 'Import processing failed', detail: message }, { status: 500 })
    }
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
        patchBlockNode(block, urlMap)
    }
}

function patchBlockNode(node: PMBlockNode | PMInlineNode, urlMap: Map<string, string>): void {
    if (node.type === 'image') {
        const img = node as PMImageNode
        // tempId is not in the type but we stash the tempId as the src placeholder
        if (img.attrs.src === '' || img.attrs.src.startsWith('img_')) {
            const url = urlMap.get(img.attrs.src)
            if (url) img.attrs.src = url
        }
    }
    if ('content' in node && Array.isArray((node as any).content)) {
        for (const child of (node as any).content) {
            patchBlockNode(child, urlMap)
        }
    }
}
