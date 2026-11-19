/**
 * lib/operations/import/image-extractor.ts
 *
 * Saves images extracted from imported documents to disk under
 * storage/uploads/operations/{uuid}.{ext} and returns their storage IDs.
 */

import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import type { ExtractedImage } from './parse-docx'

export interface SavedImage {
    tempId: string
    storageId: string
    ext: string
    url: string
}

function getStorageDir(): string {
    // Go up from apps/web to repo root, then into storage/uploads/operations
    return path.resolve(process.cwd(), '..', '..', 'storage', 'uploads', 'operations')
}

export async function saveExtractedImages(images: ExtractedImage[]): Promise<SavedImage[]> {
    if (images.length === 0) return []

    const storageDir = getStorageDir()
    await mkdir(storageDir, { recursive: true })

    const results: SavedImage[] = []

    for (const img of images) {
        const storageId = randomUUID()
        const filename = `${storageId}.${img.ext}`
        const filePath = path.join(storageDir, filename)

        await writeFile(filePath, img.buffer)

        results.push({
            tempId: img.tempId,
            storageId,
            ext: img.ext,
            url: `/api/operations/image?id=${storageId}&ext=${img.ext}`,
        })
    }

    return results
}

export async function saveOriginalFile(buffer: Buffer, filename: string): Promise<string> {
    const importsDir = path.resolve(process.cwd(), '..', '..', 'storage', 'uploads', 'operations', 'imports')
    await mkdir(importsDir, { recursive: true })

    // Sanitise filename to prevent path traversal
    const safe = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_')
    const dest = path.join(importsDir, safe)

    await writeFile(dest, buffer)
    return `storage/uploads/operations/imports/${safe}`
}
