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

    const templates = await Db.operationTemplates.find({}, { projection: { yjsState: 0 } }).sort({ createdAt: -1 }).toArray()
    // Whether this viewer may choose the default, so the tab can draw the
    // control only for the people PATCH will accept it from.
    return NextResponse.json({ templates, canSetDefault: client.hasRoles(me, PERMISSIONS.departmentLeads.j2) })
}

/**
 * PATCH — choose which template new missions start from.
 *
 * `{ id, kind, isDefault }`: `kind` is `'single'` (the default, for a
 * standalone mission) or `'campaign'` (a campaign's mission slots). `isDefault:
 * true` makes that template the default of that kind and clears it from every
 * other; `false` clears it, returning that kind of mission to starting empty.
 * J2 leads only: it changes what every mission maker in the department sees.
 */
export async function PATCH(request: NextRequest) {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
    if (!client.hasRoles(me, PERMISSIONS.departmentLeads.j2)) {
        return NextResponse.json({ error: 'Only J2 leads can set the default template.' }, { status: 403 })
    }

    const { id, isDefault, kind = 'single' } = await request.json().catch(() => ({}))
    if (typeof id !== 'string' || !ObjectId.isValid(id)) return NextResponse.json({ error: 'Template ID required' }, { status: 400 })
    if (kind !== 'single' && kind !== 'campaign') return NextResponse.json({ error: 'kind must be single or campaign' }, { status: 400 })
    const field = kind === 'campaign' ? 'isCampaignDefault' : 'isDefault'

    const template = await Db.operationTemplates.findOne({ _id: new ObjectId(id) }, { projection: { name: 1 } })
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

    // Clear first, then set: two defaults at once would make "the default"
    // whichever one the next query happened to return.
    await Db.operationTemplates.updateMany({ [field]: true }, { $unset: { [field]: '' } })
    if (isDefault) await Db.operationTemplates.updateOne({ _id: template._id }, { $set: { [field]: true } })

    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: isDefault ? 'operation.template.setDefault' : 'operation.template.clearDefault',
        category: 'operation',
        performedBy: me.id,
        performedByName: name,
        target: template.name,
        details: { templateId: id, kind },
    })

    return NextResponse.json({ success: true })
}

/**
 * PUT — refresh a template from the mission it was saved from.
 *
 * The Templates tab opens that mission for editing; this copies what it now
 * holds back into the template, so a template is edited by editing a mission
 * rather than through a second editor. Name, description and default flags
 * are the template's own and stay as they are.
 */
export async function PUT(request: NextRequest) {
    const me = await checkAuth()
    if (!me) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const { id } = await request.json().catch(() => ({}))
    if (typeof id !== 'string' || !ObjectId.isValid(id)) return NextResponse.json({ error: 'Template ID required' }, { status: 400 })

    const template = await Db.operationTemplates.findOne({ _id: new ObjectId(id) }, { projection: { name: 1, sourceOperationId: 1 } })
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    if (!template.sourceOperationId || !ObjectId.isValid(template.sourceOperationId)) {
        return NextResponse.json({ error: 'This template was saved before templates remembered their mission. Save it again from the mission instead.' }, { status: 409 })
    }

    const source = await Db.operations.findOne({ _id: new ObjectId(template.sourceOperationId), deletedAt: { $exists: false } })
    if (!source) return NextResponse.json({ error: 'The mission this template came from no longer exists.' }, { status: 404 })

    await Db.operationTemplates.updateOne({ _id: template._id }, {
        $set: {
            sections: source.sections,
            pages: source.pages,
            extraPageSections: source.extraPageSections,
            ...((source as { yjsState?: unknown }).yjsState ? { yjsState: (source as { yjsState?: unknown }).yjsState } : {}),
        },
    })

    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'operation.template.refresh',
        category: 'operation',
        performedBy: me.id,
        performedByName: name,
        target: template.name,
        details: { templateId: id, sourceOperationId: template.sourceOperationId },
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
        // The editor builds the document from this, not from the fields above,
        // and starts from defaults when it is missing; without it a template
        // carried the outline but none of the writing.
        ...((source as { yjsState?: unknown }).yjsState ? { yjsState: (source as { yjsState?: unknown }).yjsState } : {}),
        sourceOperationId,
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
