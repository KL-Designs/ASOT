import { ObjectId } from 'mongodb'

export { }

declare global {

    type OperationImportStatus =
        | 'processing'
        | 'imported'
        | 'needs_review'
        | 'failed'
        | 'skipped'
        | 'duplicate'

    type OperationImportBatchStatus =
        | 'pending'
        | 'processing'
        | 'paused'
        | 'completed'
        | 'failed'

    type OperationImportSourceType = 'pdf' | 'docx'

    /** One proposed campaign/mission match for an imported document */
    interface ImportCampaignMatch {
        campaignId: string
        campaignName: string
        missionId?: string
        missionName?: string
        confidence: number      // 0–1
        reason: string
    }

    /** Per-section detection result from AI analysis */
    interface ImportSectionDetection {
        smeacLabel: 'situation' | 'mission' | 'execution' | 'admin_log' | 'command_sig' | 'other'
        detectedTitle: string
        confidence: number
        isPublic: boolean       // server-enforced: execution/admin/commsig = false
    }

    /** An extracted image from the source document */
    interface ImportExtractedImage {
        tempId: string          // key used in intermediate content refs
        storageId?: string      // set after upload to /api/operations/image
        storageExt?: string
        mimeType: string
        captionText?: string    // only set when confident
        captionConfidence?: number
        positionHint?: number   // character offset in source text (approximate)
    }

    /** Snapshot stored on the import record for the review UI */
    interface ImportPreviewSnapshot {
        detectedTitle: string
        detectedDate?: string
        sections: ImportSectionDetection[]
        images: ImportExtractedImage[]
        campaignMatches: ImportCampaignMatch[]
        warnings: string[]
        proposedSections: OperationSection[]  // full ProseMirror sections ready to commit
    }

    /** A single document import record */
    interface OperationImport {
        _id: ObjectId
        batchId?: string
        sourceFile: string
        sourceType: OperationImportSourceType
        fileHash: string            // SHA-256 of file bytes — duplicate detection key
        importedBy: string          // Discord user ID
        importedAt: Date
        status: OperationImportStatus
        operationId?: string        // linked Operation._id once committed
        detectedTitle?: string
        campaignId?: string
        campaignMissionId?: string
        campaignConfidence?: number
        missionConfidence?: number
        matchReason?: string
        detectedSections?: string[]
        warnings?: string[]
        failureReason?: string
        manualCorrections?: Record<string, unknown>
        originalStoragePath?: string
        preview?: ImportPreviewSnapshot
    }

    /** Tracks progress of a bulk import batch */
    interface OperationImportBatch {
        _id: ObjectId
        createdBy: string
        createdAt: Date
        status: OperationImportBatchStatus
        totalFiles: number
        processedCount: number
        importedCount: number
        needsReviewCount: number
        failedCount: number
        skippedCount: number
        duplicateCount: number
        currentFile?: string
        currentFileIndex?: number
        completedAt?: Date
    }

    /** Metadata attached to an Operation that was created via import */
    interface OperationImportMetadata {
        importId: string
        sourceFile: string
        sourceType: OperationImportSourceType
        importedAt: Date
        importedBy: string
        importedByName: string
        isHistorical: boolean
    }

}
