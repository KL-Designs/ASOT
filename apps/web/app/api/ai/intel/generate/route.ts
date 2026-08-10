import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

export const maxDuration = 300 // allow up to 5 min for image generation
import path from 'path'
import fs from 'fs/promises'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { callImageGenerate, callImageEdit } from '@/lib/ai/service'
import { buildIntelImagePrompt, getSizeForAspectRatio } from '@/lib/ai/prompts/intel-image'
import Db from '@/lib/mongo'

const UPLOADS_DIR = path.join(process.cwd(), '..', '..', 'storage', 'uploads', 'ai-images')

async function ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true })
}

export async function POST(req: Request) {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!(await hasPermission(me, 'intel.generateImages'))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const body = await req.json() as {
            sourceImageBase64?: string
            cameraStyle: AiCameraStyle
            sceneDescription: string
            pose: AiPoseOption
            poseDescription?: string
            environment?: string
            timeOfDay?: string
            weather?: string
            mood?: string
            extraInstructions?: string
            quality?: string
            aspectRatio?: 'portrait' | 'landscape' | 'square'
            linkedOperationId?: string
            equipmentLock?: boolean
            structureLock?: boolean
            framingDistance?: AiFramingDistance
        }

        if (!body.cameraStyle || !body.sceneDescription) {
            return NextResponse.json({ error: 'cameraStyle and sceneDescription are required' }, { status: 400 })
        }

        const aspectRatio = body.aspectRatio ?? 'landscape'
        const quality     = body.quality ?? 'medium'
        const size        = getSizeForAspectRatio(aspectRatio)

        const prompt = buildIntelImagePrompt({
            cameraStyle:       body.cameraStyle,
            sceneDescription:  body.sceneDescription,
            pose:              body.pose ?? 'keep',
            poseDescription:   body.poseDescription,
            environment:       body.environment,
            timeOfDay:         body.timeOfDay,
            weather:           body.weather,
            mood:              body.mood,
            extraInstructions: body.extraInstructions,
            hasSourceImage:    !!body.sourceImageBase64,
            equipmentLock:     body.equipmentLock ?? true,
            structureLock:     body.structureLock ?? false,
            framingDistance:   body.framingDistance,
        })

        const ctx = {
            userId:       me.id,
            userName:     me.name ?? me.globalName ?? me.id,
            departmentId: 'j2',
            roles:        me.guild?.roles ?? [],
            feature:      'intel.image_generate' as AiFeature,
            relatedId:    body.linkedOperationId,
        }

        // Use image edit when a source screenshot is provided (preserves character),
        // otherwise generate from scratch.
        const aiResult = body.sourceImageBase64
            ? await callImageEdit({ prompt, quality, size, imageBase64: body.sourceImageBase64 }, ctx)
            : await callImageGenerate({ prompt, quality, size }, ctx)

        // Save generated image to filesystem
        const userId   = me.id
        const imageId  = randomUUID()
        const userDir  = path.join(UPLOADS_DIR, userId)
        await ensureDir(userDir)

        // Decode base64 — trim whitespace defensively
        const imageBase64 = (aiResult.imageBase64 ?? '').trim()
        if (!imageBase64) {
            throw new Error('AI provider returned no image data. Check API key and model availability.')
        }

        const imageBuffer = Buffer.from(imageBase64, 'base64')
        const imagePath   = path.join(userDir, `${imageId}.png`)
        await fs.writeFile(imagePath, imageBuffer)

        // Optionally save source (ARMA) screenshot
        let sourceImagePath: string | undefined
        if (body.sourceImageBase64) {
            const srcPath = path.join(userDir, `${imageId}_src.png`)
            await fs.writeFile(srcPath, Buffer.from(body.sourceImageBase64, 'base64'))
            sourceImagePath = `${userId}/${imageId}_src.png`
        }

        // Save record to MongoDB
        const doc: Omit<AiGeneratedImage, '_id'> = {
            userId,
            userName:         me.name ?? me.globalName ?? me.id,
            departmentId:     'j2',
            feature:          'intel.image_generate',
            provider:         aiResult.provider,
            model:            aiResult.model,
            prompt,
            sceneDescription: body.sceneDescription,
            cameraStyle:      body.cameraStyle,
            environment:      body.environment,
            timeOfDay:        body.timeOfDay,
            weather:          body.weather,
            mood:             body.mood,
            pose:             body.pose ?? 'keep',
            poseDescription:  body.poseDescription,
            framingDistance:  body.framingDistance,
            extraInstructions: body.extraInstructions,
            quality,
            hadSourceImage:   !!body.sourceImageBase64,
            imagePath:        `${userId}/${imageId}.png`,
            sourceImagePath,
            overlayStyle:     body.cameraStyle,
            aspectRatio,
            generationCostUsd: aiResult.actualCostUsd,
            linkedOperationId: body.linkedOperationId,
            status:           'generated',
            createdAt:        new Date(),
        }

        const result = await Db.aiGeneratedImages.insertOne(doc as AiGeneratedImage)
        const saved  = { ...doc, _id: result.insertedId }

        return NextResponse.json({ image: saved })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[api/ai/intel/generate POST]', err)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
