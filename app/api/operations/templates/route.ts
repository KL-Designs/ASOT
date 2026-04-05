import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

async function checkAuth() {
    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.operations.write)) return null
        return me
    } catch {
        return null
    }
}

/** GET — list all templates */
export async function GET() {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const templates = await Db.operationTemplates.find({}).sort({ createdAt: -1 }).toArray()
    return NextResponse.json({ templates })
}

/** POST — create a template from an existing operation */
export async function POST(request: NextRequest) {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { name, description, sourceOperationId } = await request.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Template name required' }, { status: 400 })
    if (!sourceOperationId) return NextResponse.json({ error: 'Source operation ID required' }, { status: 400 })

    const source = await Db.operations.findOne({ _id: new ObjectId(sourceOperationId) })
    if (!source) return NextResponse.json({ error: 'Operation not found' }, { status: 404 })

    const template: Omit<OperationTemplate, '_id'> = {
        name: name.trim(),
        description: description?.trim() || undefined,
        sections: source.sections,
        pages: source.pages,
        extraPageSections: source.extraPageSections,
        createdBy: me.id,
        createdAt: new Date().toISOString(),
    }

    const result = await Db.operationTemplates.insertOne(template as OperationTemplate)
    return NextResponse.json({ id: result.insertedId })
}

/** DELETE — remove a template */
export async function DELETE(request: NextRequest) {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Template ID required' }, { status: 400 })

    await Db.operationTemplates.deleteOne({ _id: new ObjectId(id) })
    return NextResponse.json({ success: true })
}
