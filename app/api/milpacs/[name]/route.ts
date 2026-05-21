import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import fs from 'fs'

const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+$/

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
	const { name } = await params
	if (!SAFE_NAME_RE.test(name)) return NextResponse.json('Bad request', { status: 400 })
	const type = request.nextUrl.searchParams.get('type')
	const filename = type === 'medals' ? `${name}-medals.png` : `${name}.png`
	const path = `./milpacs/${filename}`
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
	if (!client.hasRoles(me, PERMISSIONS.members.editStandard)) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

	const { name } = await params
	if (!SAFE_NAME_RE.test(name)) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
	const formData = await req.formData()
	const file = formData.get('file') as File | null
	const type = formData.get('type') as string | null
	if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

	if (!fs.existsSync('./milpacs')) fs.mkdirSync('./milpacs')
	const filename = type === 'medals' ? `${name}-medals.png` : `${name}.png`
	const buffer = Buffer.from(await file.arrayBuffer())
	fs.writeFileSync(`./milpacs/${filename}`, buffer)

	return NextResponse.json({ success: true })
}
