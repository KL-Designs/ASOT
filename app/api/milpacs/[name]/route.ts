import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
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
			'Cache-Control': 'no-cache',
		},
	})
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
	const me = await client.fetchMe().catch(() => null)
	if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	if (!client.hasRoles(me, ['J4-Administration'])) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

	const { name } = await params
	const formData = await req.formData()
	const file = formData.get('file') as File | null
	if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

	if (!fs.existsSync('./milpacs')) fs.mkdirSync('./milpacs')
	const buffer = Buffer.from(await file.arrayBuffer())
	fs.writeFileSync(`./milpacs/${name}.png`, buffer)

	return NextResponse.json({ success: true })
}
