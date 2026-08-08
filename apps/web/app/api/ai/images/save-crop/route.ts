import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { ObjectId } from 'mongodb'
import path from 'path'
import fs from 'fs/promises'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

const UPLOADS_DIR = path.join(process.cwd(), '..', '..', 'storage', 'uploads', 'ai-images')

async function ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true })
}

export async function POST(req: Request) {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!client.hasRoles(me, PERMISSIONS.intel.generateImages)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const body = await req.json() as { parentId: string; imageBase64: string }
        if (!body.parentId || !body.imageBase64) {
            return NextResponse.json({ error: 'parentId and imageBase64 are required' }, { status: 400 })
        }

        const parent = await Db.aiGeneratedImages.findOne({ _id: new ObjectId(body.parentId) })
        if (!parent) return NextResponse.json({ error: 'Parent image not found' }, { status: 404 })
        if (parent.userId !== me.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const imageId  = randomUUID()
        const userDir  = path.join(UPLOADS_DIR, me.id)
        await ensureDir(userDir)

        const imageBase64 = body.imageBase64.trim()
        if (!imageBase64) return NextResponse.json({ error: 'Empty image data' }, { status: 400 })

        await fs.writeFile(path.join(userDir, `${imageId}.png`), Buffer.from(imageBase64, 'base64'))

        const doc: Omit<AiGeneratedImage, '_id'> = {
            userId:              me.id,
            userName:            parent.userName,
            departmentId:        parent.departmentId,
            feature:             parent.feature,
            provider:            parent.provider,
            model:               parent.model,
            prompt:              parent.prompt,
            sceneDescription:    parent.sceneDescription,
            cameraStyle:         parent.cameraStyle,
            environment:         parent.environment,
            timeOfDay:           parent.timeOfDay,
            weather:             parent.weather,
            mood:                parent.mood,
            pose:                parent.pose,
            poseDescription:     parent.poseDescription,
            framingDistance:     parent.framingDistance,
            extraInstructions:   parent.extraInstructions,
            quality:             parent.quality,
            hadSourceImage:      parent.hadSourceImage,
            imagePath:           `${me.id}/${imageId}.png`,
            overlayStyle:        parent.overlayStyle,
            aspectRatio:         parent.aspectRatio,
            generationCostUsd:   0,
            linkedOperationId:   parent.linkedOperationId,
            linkedIntelPackageId: parent.linkedIntelPackageId,
            status:              'used',
            createdAt:           new Date(),
            usedAt:              new Date(),
        }

        const result = await Db.aiGeneratedImages.insertOne(doc as AiGeneratedImage)
        const saved  = { ...doc, _id: result.insertedId }

        return NextResponse.json({ image: saved })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[api/ai/images/save-crop POST]', err)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
