import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export async function GET() {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!client.hasRoles(me, PERMISSIONS.ai.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const budgets = await Db.aiBudgets.find({}).sort({ scopeType: 1, scopeLabel: 1 }).toArray()
        return NextResponse.json({ budgets })
    } catch (err) {
        console.error('[api/ai/budgets GET]', err)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!client.hasRoles(me, PERMISSIONS.ai.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const body = await req.json() as Partial<AiBudgetConfig> & { _id?: string }

        if (!body.scopeType || !body.scopeKey || !body.scopeLabel) {
            return NextResponse.json({ error: 'scopeType, scopeKey, and scopeLabel are required' }, { status: 400 })
        }

        const now = new Date()
        const doc: Omit<AiBudgetConfig, '_id'> = {
            scopeType:             body.scopeType,
            scopeKey:              body.scopeKey,
            scopeLabel:            body.scopeLabel,
            monthlyLimitUsd:       body.monthlyLimitUsd,
            textTokenMonthlyLimit: body.textTokenMonthlyLimit,
            imageMonthlyLimit:     body.imageMonthlyLimit,
            allowedModels:         body.allowedModels,
            allowedImageQualities: body.allowedImageQualities,
            warningThresholds:     body.warningThresholds ?? [0.75, 0.90, 1.0],
            hardStop:              body.hardStop ?? true,
            enabled:               body.enabled ?? true,
            createdAt:             now,
            updatedAt:             now,
            updatedById:           me.id,
            updatedByName:         me.name ?? me.globalName ?? me.id,
        }

        if (body._id) {
            // Update existing
            const result = await Db.aiBudgets.findOneAndUpdate(
                { _id: new ObjectId(body._id) },
                { $set: { ...doc, createdAt: undefined } },
                { returnDocument: 'after' }
            )
            if (!result) return NextResponse.json({ error: 'Budget not found' }, { status: 404 })
            return NextResponse.json({ budget: result })
        } else {
            const result = await Db.aiBudgets.insertOne(doc as AiBudgetConfig)
            return NextResponse.json({ budget: { ...doc, _id: result.insertedId } })
        }
    } catch (err) {
        console.error('[api/ai/budgets POST]', err)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function DELETE(req: Request) {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!client.hasRoles(me, PERMISSIONS.ai.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')
        if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

        await Db.aiBudgets.deleteOne({ _id: new ObjectId(id) })
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[api/ai/budgets DELETE]', err)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
