import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import { FIELD_BY_KEY, COMPOSITION } from '@/lib/doctrine/schema'
import { logDoctrine } from '@/lib/doctrine/db'
import { doctrineGate } from '../../gate'

/**
 * `/api/doctrines/{id}/options` — custom dropdown options.
 *
 * POST `{ fieldKey, label, description }` adds one to this doctrine: usable
 * at once, marked pending global review, never global by itself.
 * PATCH `{ optionId, action: 'approve' | 'edit' | 'merge' | 'reject', label?, mergeInto?, note? }`
 * is the J2 Lead's review. Approve (after any edit of wording) makes it a
 * global option, skipping a duplicate; merge points it at an existing one;
 * reject keeps it valid where it was used but never offers it elsewhere.
 */

/** Composition subtypes are options too: `composition.infantry` and the like. */
function validField(key: string) {
    if (FIELD_BY_KEY.has(key)) return true
    return key.startsWith('composition.') && COMPOSITION.some(c => `composition.${c.key}` === key)
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const gate = await doctrineGate(id)
    if ('error' in gate) return gate.error
    const { doctrine, standing, by } = gate
    if (!standing.canEdit) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await req.json().catch(() => null)
    const fieldKey = typeof body?.fieldKey === 'string' ? body.fieldKey : ''
    const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 120) : ''
    if (!validField(fieldKey) || !label) return NextResponse.json({ error: 'A custom option needs a field and a label' }, { status: 400 })
    if ((doctrine.customOptions ?? []).some(o => o.fieldKey === fieldKey && norm(o.label) === norm(label))) return NextResponse.json({ ok: true, duplicate: true })

    const option = {
        id: crypto.randomUUID(), fieldKey, label,
        description: typeof body?.description === 'string' ? body.description.trim().slice(0, 500) : '',
        status: 'pending' as const, addedById: by.id, addedByName: by.name, addedAt: new Date().toISOString(),
    }
    await Db.doctrines.updateOne({ _id: doctrine._id }, { $push: { customOptions: option } })
    await logDoctrine('option.add', doctrine, by, { fieldKey, label })
    return NextResponse.json({ ok: true, option })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const gate = await doctrineGate(id)
    if ('error' in gate) return gate.error
    const { doctrine, standing, by } = gate
    if (!standing.canApprove) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await req.json().catch(() => null)
    const option = (doctrine.customOptions ?? []).find(o => o.id === body?.optionId)
    if (!option) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : ''
    const action = body?.action as string

    const set: Record<string, unknown> = { 'customOptions.$.reviewNote': note }
    if (action === 'edit') {
        const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 120) : ''
        if (!label) return NextResponse.json({ error: 'A label is required' }, { status: 400 })
        set['customOptions.$.label'] = label
    } else if (action === 'approve') {
        const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 120) : option.label
        const existing = await Db.doctrineOptions.find({ fieldKey: option.fieldKey }).toArray()
        if (!existing.some(o => norm(o.label) === norm(label))) {
            await Db.doctrineOptions.insertOne({ fieldKey: option.fieldKey, label, description: option.description, approvedById: by.id, approvedByName: by.name, approvedAt: new Date(), sourceDoctrineId: id })
        }
        set['customOptions.$.label'] = label
        set['customOptions.$.status'] = 'approved'
    } else if (action === 'merge') {
        const into = typeof body?.mergeInto === 'string' ? body.mergeInto.trim().slice(0, 120) : ''
        if (!into) return NextResponse.json({ error: 'Pick the option to merge into' }, { status: 400 })
        set['customOptions.$.status'] = 'merged'
        set['customOptions.$.mergedInto'] = into
    } else if (action === 'reject') {
        set['customOptions.$.status'] = 'rejected'
    } else {
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    await Db.doctrines.updateOne({ _id: doctrine._id, 'customOptions.id': option.id }, { $set: set })

    // Close the review task once nothing is left pending.
    const fresh = await Db.doctrines.findOne({ _id: doctrine._id })
    if (fresh?.optionsTaskId && !(fresh.customOptions ?? []).some(o => o.status === 'pending')) {
        const { ObjectId } = await import('mongodb')
        if (ObjectId.isValid(fresh.optionsTaskId)) await Db.tasks.updateOne({ _id: new ObjectId(fresh.optionsTaskId) }, { $set: { status: 'completed', completedAt: new Date() } })
        await Db.doctrines.updateOne({ _id: doctrine._id }, { $set: { optionsTaskId: null } })
    }
    await logDoctrine(`option.${action}`, doctrine, by, { fieldKey: option.fieldKey, label: option.label, note, mergeInto: body?.mergeInto ?? null, newLabel: body?.label ?? null })
    return NextResponse.json({ ok: true })
}
