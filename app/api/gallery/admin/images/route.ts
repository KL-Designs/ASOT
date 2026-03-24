import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'


const CONTENT_BASE = path.resolve('./gallery/content')
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

function resolveSafe(year: string, operation: string, stage: string): string {
    for (const part of [year, operation, stage]) {
        if (!part || part.includes('/') || part.includes('\\') || part.includes('\x00') || part === '..' || part === '.') {
            throw new Error('Invalid path component')
        }
    }
    const resolved = path.resolve(CONTENT_BASE, year, operation, stage)
    if (!resolved.startsWith(CONTENT_BASE + path.sep)) throw new Error('Path escapes content directory')
    return resolved
}

async function checkAuth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return false
    return client.hasRoles(me, PERMISSIONS.gallery.manage)
}


/** POST — upload images into a stage directory (multipart/form-data) */
export async function POST(request: NextRequest) {
    if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const year = formData.get('year') as string
    const operation = formData.get('operation') as string
    const stage = formData.get('stage') as string
    const files = formData.getAll('files') as File[]

    if (!year || !operation || !stage) return NextResponse.json({ error: 'year, operation and stage are required' }, { status: 400 })
    if (!files.length) return NextResponse.json({ error: 'No files provided' }, { status: 400 })

    let targetDir: string
    try { targetDir = resolveSafe(year, operation, stage) }
    catch { return NextResponse.json({ error: 'Invalid path' }, { status: 400 }) }

    if (!fs.existsSync(targetDir)) return NextResponse.json({ error: 'Target stage does not exist' }, { status: 404 })

    const saved: string[] = []
    for (const file of files) {
        if (!ALLOWED_MIME.has(file.type)) continue
        // Keep the original filename; strip any path components
        const safeName = path.basename(file.name).replace(/[^\w.\-() ]/g, '_')
        if (!safeName) continue
        const dest = path.join(targetDir, safeName)
        // Extra check: dest must still be inside targetDir
        if (!dest.startsWith(targetDir + path.sep) && dest !== targetDir) continue
        fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()))
        saved.push(safeName)
    }

    return NextResponse.json({ success: true, saved })
}


/** DELETE — remove specific images from a stage directory */
export async function DELETE(request: NextRequest) {
    if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { year, operation, stage, images } = await request.json() as {
        year: string; operation: string; stage: string; images: string[]
    }

    if (!year || !operation || !stage || !images?.length)
        return NextResponse.json({ error: 'year, operation, stage and images are required' }, { status: 400 })

    let targetDir: string
    try { targetDir = resolveSafe(year, operation, stage) }
    catch { return NextResponse.json({ error: 'Invalid path' }, { status: 400 }) }

    for (const img of images) {
        const safeName = path.basename(img)
        const filePath = path.join(targetDir, safeName)
        if (!filePath.startsWith(targetDir + path.sep)) continue
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }

    return NextResponse.json({ success: true })
}
