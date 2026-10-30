import { Metadata, Viewport } from "next"
import Db from '@/lib/mongo'
import { ObjectId } from "mongodb"
import dayjs from 'dayjs'
import { notFound } from 'next/navigation'
import client from '@/lib/discord'
import { privateCopyAccess } from '@/lib/training/orders-assessment-db'


type Props = {
	params: Promise<{ id: string }>
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
	const { id } = await params
	try {
		const operation = await Db.operations.findOne({ _id: new ObjectId(id) }, { projection: { themeColor: 1 } })
		return { themeColor: operation?.themeColor || '#db001d' }
	} catch {
		return { themeColor: '#db001d' }
	}
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params

	try {
		const operation = await Db.operations.findOne({ _id: new ObjectId(id) })
		if (!operation) return { title: 'Unknown Operation | ASOT' }
		// A trainee's private assessment copy (row 373): the name is theirs, not for a link preview.
		if (operation.assessment) return { title: 'Orders | ASOT' }

		const title = `${operation.title} | ASOT`
		const description = `${operation.department || 'Joint Operation'} — ${dayjs(operation.date).format('DD MMM YYYY')}`

		return {
			title,
			description,
			openGraph: {
				title,
				description,
				images: [],
			},
			twitter: {
				card: 'summary_large_image',
				title,
				description,
				images: [],
			},
		}
	} catch {
		return { title: 'Unknown Operation | ASOT' }
	}
}


/**
 * Row 373: a trainee's private copy of assessment orders is "not found" to
 * everyone but the trainee, their trainer, J3 training staff and J4. Every
 * page under /operations/[id] passes through here.
 */
export default async function Page({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ id: string }> }>) {
	const { id } = await params
	const me = await client.fetchMe().catch(() => null)
	if ((await privateCopyAccess(me, id)) === 'none') notFound()
	return (
		<div className="h-full">
			{children}
		</div>
	)
}