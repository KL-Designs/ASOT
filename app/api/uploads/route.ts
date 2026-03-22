import { NextRequest, NextResponse } from "next/server"

import fs from 'fs'


export async function GET(request: NextRequest) {

    // const { searchParams } = new URL(request.url)

    // const year = searchParams.get('year')
    // const operation = searchParams.get('operation')
    // const stage = searchParams.get('stage')
    // const img = searchParams.get('img')

    // if (!fs.existsSync(`./gallery/content/${year}/${operation}/${stage}/${img}`)) return NextResponse.json('Media does not exist', { status: 404 })
    // const path = `./gallery/content/${year}/${operation}/${stage}/${img}`
    // const ext = path.split('.').pop()?.toString().toLowerCase()
    // const output = fs.readFileSync(path)

    // let contentType: string
    // switch (ext) {
    //     case 'jpg':
    //     case 'jpeg': contentType = 'image/jpeg'; break
    //     case 'png': contentType = 'image/png'; break
    //     default: contentType = 'image/jpeg';
    // }

    // return new NextResponse(output as BodyInit, {
    //     status: 200,
    //     headers: {
    //         "Content-Type": contentType,
    //         "Cache-Control": "public, max-age=31536000, immutable"
    //     }
    // })
}