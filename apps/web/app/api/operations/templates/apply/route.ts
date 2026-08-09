import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

/** POST — create a new operation pre-populated with a template's sections/pages */
export async function POST(request: NextRequest) {
    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.operations.write))
            return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

        const { templateId } = await request.json()
        if (!templateId) return NextResponse.json({ error: 'Template ID required' }, { status: 400 })

        const template = await Db.operationTemplates.findOne({ _id: new ObjectId(templateId) })
        if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

        const rawDate = new Date()
        const day = String(rawDate.getDate()).padStart(2, '0')
        const month = String(rawDate.getMonth() + 1).padStart(2, '0')
        const year = rawDate.getFullYear()

        const newOp = await Db.operations.insertOne({
            _id: new ObjectId(),
            title: `New Mission ${day}/${month}/${year}`,
            department: '1-0 HQ',
            date: new Date(),
            loreDate: new Date(),
            status: 'In Development' as const,
            sections: template.sections,
            pages: template.pages,
            extraPageSections: template.extraPageSections,
        })

        return NextResponse.json({ id: newOp.insertedId })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
