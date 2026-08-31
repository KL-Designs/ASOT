import { NextResponse } from 'next/server'
import fs from 'fs'

import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'

/**
 * The folder tree, for J5's folder administration — not the public gallery.
 *
 * `GET /api/gallery` used to walk storage/gallery/content with readdirSync and
 * return this same tree, back when the public gallery page was the tree. Once
 * the gallery moved to reading `gallery_media`, that stopped being true: the
 * public route answers "what should the gallery show", which is an index
 * question, while `GalleryOperationsTab` answers "what folders exist and what
 * do I do to them" — create one, delete one, drop files into one — which is a
 * filesystem question. A folder this tab just created holds nothing in the
 * index yet, so the index cannot answer it. These were the same question only
 * while the gallery had no database; they are not the same question now, and
 * the public route staying an index-only, unauthenticated, cheap read is worth
 * more than the two staying merged.
 *
 * Gated with gallery.manage, like its sibling admin routes
 * (app/api/gallery/admin/images, folder, featured) — unlike the public
 * gallery, this walks the entire content tree on every call, and that is only
 * acceptable for the staff tool that already pays for a full page of J5
 * tooling, not for an endpoint anyone can hit.
 */

type GalleryTreeAPI = {
    info: string
    updated: string
    featured: string[]
    years: {
        year: string
        operations: {
            operation: string
            stages: { stage: string, media: string[] }[]
        }[]
    }[]
}

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !await hasPermission(me, 'gallery.manage')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const json: GalleryTreeAPI = {
        info: 'Gallery folder tree (admin)',
        updated: new Date().toISOString(),
        featured: [],
        years: [],
    }

    try {
        json.featured = fs.readdirSync('../../storage/gallery/featured')
    } catch {
        // An absent featured folder is a normal state on a fresh checkout.
    }

    const years = fs.readdirSync('../../storage/gallery/content')

    for (const year of years) {
        const operations = fs.readdirSync(`../../storage/gallery/content/${year}`)

        const yearData = {
            year,
            operations: [] as GalleryTreeAPI['years'][0]['operations'],
        }

        for (const operation of operations) {
            const stages = fs.readdirSync(`../../storage/gallery/content/${year}/${operation}`)

            const operationData = {
                operation,
                stages: [] as GalleryTreeAPI['years'][0]['operations'][0]['stages'],
            }

            for (const stage of stages) {
                const stageData = { stage, media: [] as string[] }

                try {
                    stageData.media = fs.readdirSync(`../../storage/gallery/content/${year}/${operation}/${stage}`)
                } catch (error) {
                    console.error(`Error processing ${year} - ${operation} - ${stage}:`, error)
                }

                operationData.stages.push(stageData)
            }

            yearData.operations.push(operationData)
        }

        json.years.push(yearData)
    }

    return NextResponse.json(json)
}
