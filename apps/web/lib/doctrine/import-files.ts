import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import mammoth from 'mammoth'
import Db from '@/lib/mongo'
import { sniffImageMime } from '@/lib/uploads/image'

/**
 * Row 334: files for "Import Enemy Doctrine". Photos are stored like any
 * upload (served by /api/upload/image, so whoever can read the doctrine can
 * see them) and also put in the site image library, so they can be picked
 * later with Add image → From library. A Word document is read to text in
 * the "Question: answer" shape the importer reads, with each picture in it
 * left as an `[[image:url]]` line where it sat, for the importer to attach
 * to the question above it.
 */

const DOCS_DIR = path.join(process.cwd(), '..', '..', 'storage', 'uploads', 'documents')
const LIBRARY_DIR = path.join(process.cwd(), '..', '..', 'storage', 'uploads', 'ai-images')
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }

export async function storePhoto(buffer: Buffer, me: { id: string; name: string }): Promise<string | null> {
    const mime = sniffImageMime(buffer)
    const ext = mime ? EXT[mime] : undefined
    if (!ext || buffer.length > 15 * 1024 * 1024) return null
    const id = crypto.randomUUID()
    await fs.mkdir(DOCS_DIR, { recursive: true })
    await fs.writeFile(path.join(DOCS_DIR, `${id}.${ext}`), buffer)

    // A copy in the image library. Losing it never loses the picture on the doctrine.
    try {
        await fs.mkdir(path.join(LIBRARY_DIR, me.id), { recursive: true })
        await fs.writeFile(path.join(LIBRARY_DIR, me.id, `${id}.${ext}`), buffer)
        const now = new Date()
        await Db.aiGeneratedImages.insertOne({
            userId: me.id, userName: me.name, feature: 'intel.image_generate', provider: 'anthropic', model: 'upload',
            prompt: 'Uploaded with an Enemy Doctrine import', sceneDescription: '', cameraStyle: 'dslr', pose: 'keep', quality: 'upload',
            hadSourceImage: false, imagePath: `${me.id}/${id}.${ext}`, overlayStyle: 'dslr', aspectRatio: 'landscape',
            generationCostUsd: 0, status: 'used', createdAt: now, usedAt: now,
        } as AiGeneratedImage)
    } catch (err) {
        console.error('[doctrine import] library copy failed', err)
    }
    return `/api/upload/image?id=${id}&ext=${ext}`
}

const decode = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

/** A .docx as importer text. Two-cell table rows read as "left: right". */
export async function documentToText(buffer: Buffer, me: { id: string; name: string }): Promise<{ text: string; images: number }> {
    let images = 0
    const { value: html } = await mammoth.convertToHtml({ buffer }, {
        convertImage: mammoth.images.imgElement(async image => {
            const url = await storePhoto(Buffer.from(await image.readAsBase64String(), 'base64'), me)
            if (url) images++
            return { src: url ?? '' }
        }),
    })
    const lines: string[] = []
    const tokens = html.match(/<tr\b[\s\S]*?<\/tr>|<(p|h[1-6]|li)\b[\s\S]*?<\/\1>|<img\b[^>]*>/gi) ?? []
    for (const t of tokens) {
        // Pictures inside a paragraph or row come out after its text.
        const imgs = [...t.matchAll(/<img\b[^>]*src="([^"]+)"/gi)].map(m => m[1]).filter(Boolean)
        if (/^<tr/i.test(t)) {
            const cells = [...t.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => decode(m[1]))
            const filled = cells.filter(Boolean)
            if (filled.length === 2) lines.push(`${filled[0].replace(/:\s*$/, '')}: ${filled[1]}`)
            else if (filled.length) lines.push(filled.join(' '))
        } else if (!/^<img/i.test(t)) {
            const text = decode(t)
            if (text) lines.push(text)
        }
        for (const src of imgs) lines.push(`[[image:${src}]]`)
    }
    return { text: lines.join('\n'), images }
}
