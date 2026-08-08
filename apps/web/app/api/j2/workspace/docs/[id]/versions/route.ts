import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { ObjectId } from 'mongodb'
import * as Y from 'yjs'
import { yDocToProsemirrorJSON } from 'y-prosemirror'

async function requireJ2() {
    let me: User
    try { me = await client.fetchMe() } catch { return null }
    const ok = client.hasRoles(me, PERMISSIONS.departments.j2)
        || client.hasRoles(me, PERMISSIONS.departmentLeads.j2)
        || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!ok) return null
    return me
}

// Mirrors extractPlainText from server.mjs — converts Prosemirror JSON to readable text
function extractPlainText(node: { type?: string; text?: string; content?: unknown[] } | null): string {
    if (!node) return ''
    if (node.type === 'text') return node.text || ''
    if (!Array.isArray(node.content)) return ''
    const blockTypes = new Set(['paragraph', 'heading', 'blockquote', 'codeBlock', 'bulletList', 'orderedList', 'listItem'])
    const sep = node.type && blockTypes.has(node.type) ? '\n' : ''
    return node.content.map(c => extractPlainText(c as { type?: string; text?: string; content?: unknown[] })).join(sep)
}

// Extract plaintext from a Y.Doc using the CollabEditor section structure
function yjsToPlainText(yjsState: { buffer?: ArrayBuffer; _bsontype?: string } | Uint8Array | null): string {
    if (!yjsState) return ''
    try {
        const ydoc = new Y.Doc()
        // MongoDB Binary has a .buffer ArrayBuffer; Uint8Array works directly; raw Buffer is Buffer
        let uint8: Uint8Array
        if (yjsState instanceof Uint8Array) {
            uint8 = yjsState
        } else {
            const ab = (yjsState as { buffer?: ArrayBuffer }).buffer
            uint8 = ab ? new Uint8Array(ab) : new Uint8Array(0)
        }
        Y.applyUpdate(ydoc, uint8)

        const pageOrder = ydoc.getArray('pageOrder').toArray() as string[]
        const sections = pageOrder.length > 0
            ? pageOrder.flatMap(pageId => {
                const key = pageId === 'main' ? 'sectionOrder' : `sectionOrder-${pageId}`
                return (ydoc.getArray(key).toArray() as string[]).map(sid => {
                    const cKey = pageId === 'main' ? `scontent-${sid}` : `scontent-${pageId}-${sid}`
                    return cKey
                })
            })
            : (ydoc.getArray('sectionOrder').toArray() as string[]).map(sid => `scontent-${sid}`)

        const parts: string[] = []
        for (const cKey of sections) {
            try {
                const json = yDocToProsemirrorJSON(ydoc, cKey)
                const text = extractPlainText(json as { type?: string; text?: string; content?: unknown[] }).trim()
                if (text) parts.push(text)
            } catch { /* empty section — skip */ }
        }
        return parts.join('\n\n')
    } catch {
        return ''
    }
}

// GET /api/j2/workspace/docs/[id]/versions — list version history
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await requireJ2()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    let oid
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }

    const doc = await Db.workspaceDocs.findOne({ _id: oid, deleted: { $ne: true } })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const versions = await Db.workspaceVersions
        .find({ docId: id }, { projection: { yjsDiff: 0 } })
        .sort({ savedAt: -1 })
        .toArray()

    return NextResponse.json({
        versions: versions.map((v: { _id: { toString(): string } }) => ({ ...v, _id: v._id.toString() })),
    })
}

// POST /api/j2/workspace/docs/[id]/versions — save a named version snapshot
// Body: { label?: string }
// Content is extracted server-side from the stored Yjs binary.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await requireJ2()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    let oid
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }

    const doc = await Db.workspaceDocs.findOne({ _id: oid, deleted: { $ne: true } })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const label: string = (body.label as string | undefined)?.trim() ?? ''

    // Extract plaintext from the live Yjs state stored by Hocuspocus
    const contentSnapshot = yjsToPlainText(doc.yjsState as { buffer?: ArrayBuffer } | null)

    const displayName = me.guild?.displayName || me.globalName || me.username || me.id

    const version = {
        docId: id,
        docTitle: doc.title as string,
        contentSnapshot,
        savedBy: me.id,
        savedByName: displayName,
        savedAt: new Date(),
        label: label || null,
    }

    const result = await Db.workspaceVersions.insertOne(version)

    logAction({
        action: 'workspace.version.save',
        category: 'system',
        performedBy: me.id,
        performedByName: displayName,
        department: 'j2',
        entityId: id,
        target: `${doc.title as string}${label ? ` — "${label}"` : ''}`,
        details: { memberId: doc.memberId, memberName: doc.memberName, versionId: result.insertedId.toString() },
    }).catch(() => {})

    return NextResponse.json({ ok: true, id: result.insertedId.toString() })
}
