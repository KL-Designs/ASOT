import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
	const { name } = await params
	const path = `./milpacs/${name}.png`
	if (!fs.existsSync(path)) return NextResponse.json('Not found', { status: 404 })
	const output = fs.readFileSync(path)
	return new NextResponse(output as BodyInit, {
		status: 200,
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	})
}
