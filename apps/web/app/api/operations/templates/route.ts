import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { logAction } from '@/lib/logs'

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
    // Whether this viewer may choose the default, so the tab can draw the
    // control only for the people PATCH will accept it from.
    return NextResponse.json({ templates, canSetDefault: client.hasRoles(me, PERMISSIONS.departmentLeads.j2) })
}

/**
 * PATCH — choose which template new missions start from.
 *
 * `{ id, isDefault: true }` makes that template the default and clears it from
 * every other; `{ id, isDefault: false }` clears it, returning new missions to
 * starting empty. J2 leads only: it changes what every mission maker in the
 * department sees when they press New Mission.
 */
export async function PATCH(request: NextRequest) {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j2)) {
        return NextResponse.json({ error: 'Only J2 leads can set the default template.' }, { status: 403 })
    }

    const { id, isDefault } = await request.json().catch(() => ({}))
    if (typeof id !== 'string' || !ObjectId.isValid(id)) return NextResponse.json({ error: 'Template ID required' }, { status: 400 })

    const template = await Db.operationTemplates.findOne({ _id: new ObjectId(id) }, { projection: { name: 1 } })
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

    // Clear first, then set: two defaults at once would make "the default"
    // whichever one the next query happened to return.
    await Db.operationTemplates.updateMany({ isDefault: true }, { $unset: { isDefault: '' } })
    if (isDefault) await Db.operationTemplates.updateOne({ _id: template._id }, { $set: { isDefault: true } })

    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: isDefault ? 'operation.template.setDefault' : 'operation.template.clearDefault',
        category: 'operation',
        performedBy: me.id,
        performedByName: name,
        target: template.name,
        details: { templateId: id },
    })

    return NextResponse.json({ success: true })
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
