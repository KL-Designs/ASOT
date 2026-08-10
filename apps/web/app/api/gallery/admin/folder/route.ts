import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'


const GALLERY_BASE = path.resolve('../../storage/gallery/content')

/** Resolve a path made up of untrusted parts, rejecting any traversal attempts. */
function resolveSafe(...parts: string[]): string {
    let current = GALLERY_BASE
    for (const part of parts) {
        if (!part || part.includes('/') || part.includes('\\') || part.includes('\x00') || part === '.' || part === '..') {
            throw new Error('Invalid path component')
        }
        current = path.resolve(current, part)
    }
    if (!current.startsWith(GALLERY_BASE + path.sep) && current !== GALLERY_BASE) {
        throw new Error('Path escapes gallery directory')
    }
    return current
}

async function checkAuth() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return null
    if (!(await hasPermission(me, 'gallery.manage'))) return null
    return me
}


/** POST — create a year, operation, or stage folder */
export async function POST(request: NextRequest) {
    if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { type, year, operation, name } = await request.json() as Record<string, string>
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    let folderPath: string
    try {
        if (type === 'year') {
            folderPath = resolveSafe(name.trim())
        } else if (type === 'operation') {
            if (!year) return NextResponse.json({ error: 'Year is required' }, { status: 400 })
            folderPath = resolveSafe(year, name.trim())
        } else if (type === 'stage') {
            if (!year || !operation) return NextResponse.json({ error: 'Year and operation are required' }, { status: 400 })
            folderPath = resolveSafe(year, operation, name.trim())
        } else {
            return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
        }
    } catch {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    if (fs.existsSync(folderPath)) return NextResponse.json({ error: 'Already exists' }, { status: 409 })
    fs.mkdirSync(folderPath, { recursive: true })
    return NextResponse.json({ success: true })
}


/** DELETE — remove a year, operation, or stage folder (recursive) */
export async function DELETE(request: NextRequest) {
    if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { type, year, operation, stage } = await request.json() as Record<string, string>

    let folderPath: string
    try {
        if (type === 'year') {
            if (!year) return NextResponse.json({ error: 'Year is required' }, { status: 400 })
            folderPath = resolveSafe(year)
        } else if (type === 'operation') {
            if (!year || !operation) return NextResponse.json({ error: 'Year and operation are required' }, { status: 400 })
            folderPath = resolveSafe(year, operation)
        } else if (type === 'stage') {
            if (!year || !operation || !stage) return NextResponse.json({ error: 'Year, operation, and stage are required' }, { status: 400 })
            folderPath = resolveSafe(year, operation, stage)
        } else {
            return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
        }
    } catch {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    if (!fs.existsSync(folderPath)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    fs.rmSync(folderPath, { recursive: true, force: true })
    return NextResponse.json({ success: true })
}
