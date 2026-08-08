import { NextRequest, NextResponse } from "next/server"

import fs from 'fs'


export async function GET(request: NextRequest) {

    const json: GalleryAPI = {
        info: 'Gallery API',
        updated: new Date().toISOString(),
        featured: [],
        years: []
    }

    json.featured = fs.readdirSync('./gallery/featured')
    
    const years = fs.readdirSync('./gallery/content')

    for (const year of years) {
        const operations = fs.readdirSync(`./gallery/content/${year}`)

        const yearData = {
            year,
            operations: [] as GalleryAPI['years'][0]['operations']
        }

        for (const operation of operations) {
            const stages = fs.readdirSync(`./gallery/content/${year}/${operation}`)

            const operationData = {
                operation,
                stages: [] as GalleryAPI['years'][0]['operations'][0]['stages']
            }

            for (const stage of stages) {
                const stageData = {
                    stage,
                    media: [] as string[]
                }

                try {
                    const media = fs.readdirSync(`./gallery/content/${year}/${operation}/${stage}`)
                    stageData.media = media
                    console.log(`Processed ${year} - ${operation} - ${stage} with ${media.length} media files`)
                }

                catch (error) {
                    console.error(`Error processing ${year} - ${operation} - ${stage}:`, error)
                }

                operationData.stages.push(stageData)
            }

            yearData.operations.push(operationData)
        }

        json.years.push(yearData)
    }


    return NextResponse.json(json, { status: 200 })

}