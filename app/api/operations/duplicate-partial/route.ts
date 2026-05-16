import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

/**
 * Recursively walk a ProseMirror JSON node and replace all occurrences of
 * `from` text with `to` in text nodes.
 */
function replaceTextInNode(node: any, from: string, to: string): any {
    if (!node || typeof node !== 'object') return node
    if (node.type === 'text' && typeof node.text === 'string') {
        return { ...node, text: node.text.split(from).join(to) }
    }
    if (Array.isArray(node.content)) {
        return { ...node, content: node.content.map((child: any) => replaceTextInNode(child, from, to)) }
    }
    return node
}

/**
 * POST { sourceId, targetId, sections: string[], replacePlatoon11: boolean }
 * Copies the specified sections from source operation to target operation.
 * If replacePlatoon11 is true, replaces "1-1" with "1-2" in all text content.
 */
export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.operations.write)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { sourceId, targetId, sections: sectionIds, replacePlatoon11 } = await request.json()

    if (!sourceId || !targetId || !Array.isArray(sectionIds)) {
        return NextResponse.json({ error: 'sourceId, targetId, and sections[] are required' }, { status: 400 })
    }

    let srcId: ObjectId
    let tgtId: ObjectId
    try {
        srcId = new ObjectId(sourceId)
        tgtId = new ObjectId(targetId)
    } catch {
        return NextResponse.json({ error: 'Invalid operation IDs' }, { status: 400 })
    }

    const [source, target] = await Promise.all([
        Db.operations.findOne({ _id: srcId }),
        Db.operations.findOne({ _id: tgtId }),
    ])

    if (!source) return NextResponse.json({ error: 'Source operation not found' }, { status: 404 })
    if (!target) return NextResponse.json({ error: 'Target operation not found' }, { status: 404 })

    // Filter source sections to those requested
    const sourceSections = (source.sections ?? []).filter(s => sectionIds.includes(s.id))

    // Optionally replace "1-1" with "1-2"
    const processedSections: OperationSection[] = sourceSections.map(s => {
        if (!replacePlatoon11) return s
        return {
            ...s,
            content: s.content ? replaceTextInNode(s.content, '1-1', '1-2') : s.content,
        }
    })

    // Merge into target: append sections that don't already exist (by id), or replace existing
    const existingIds = new Set((target.sections ?? []).map(s => s.id))
    const newSections = processedSections.filter(s => !existingIds.has(s.id))
    const updatedSections = [
        ...(target.sections ?? []).map(s => {
            const replacement = processedSections.find(ps => ps.id === s.id)
            return replacement ?? s
        }),
        ...newSections,
    ]

    await Db.operations.updateOne(
        { _id: tgtId },
        { $set: { sections: updatedSections } }
    )

    return NextResponse.json({ ok: true, copiedCount: processedSections.length })
}
