import { NextRequest, NextResponse } from 'next/server'

import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { logAction } from '@/lib/logAction'
import { enqueue } from '@/lib/gallery/queue'
import { stageDirectUpload } from '@/lib/gallery/direct-upload'

/**
 * POST — J5 uploads one file straight into the archive (the Media tab's
 * Upload). Multipart: `file`, optional `operationId`, `caption`, `tags` (JSON
 * array of slugs) and `batchId`.
 *
 * One file per request, like the member submit route, so each file gets its
 * own progress bar and a failure costs only that file. The response returns
 * once the bytes are staged; the queue transcodes and then publishes the item
 * itself (lib/gallery/direct-upload.ts). The tab polls
 * /api/gallery/submissions/status with the batchId to see each one go live —
 * that route is scoped to the caller's own items, and the uploader is the
 * author here.
 *
 * gallery.manage, the same gate as every other write in the Media tab.
 */

// A 50MB body over a slow link needs longer than the platform default.
export const maxDuration = 300

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!await hasPermission(me, 'gallery.manage')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!form || !(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const text = (name: string): string | null => {
        const v = form.get(name)
        return typeof v === 'string' && v ? v : null
    }

    let tags: string[] = []
    try {
        const raw = JSON.parse(text('tags') ?? '[]')
        if (Array.isArray(raw)) tags = raw.filter((t): t is string => typeof t === 'string')
    } catch { /* an unparseable tag list is no tags */ }

    const uploaderName = me.guild?.displayName || me.globalName || me.username
    const result = await stageDirectUpload({
        file,
        uploader: { id: me.id, name: uploaderName },
        operationId: text('operationId'),
        caption: text('caption'),
        tags,
        batchId: text('batchId'),
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    enqueue(result.id)

    await logAction({
        action: 'gallery.media.upload',
        category: 'gallery',
        performedBy: me.id,
        performedByName: uploaderName,
        department: 'j5',
        entityType: 'gallery_media',
        entityId: result.id,
        actionUrl: '/dashboard/j5',
        target: file.name,
    })

    return NextResponse.json({ id: result.id, status: 'processing' })
}
