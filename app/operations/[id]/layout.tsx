import { Metadata } from "next"
import Db from '@/lib/mongo'
import { ObjectId } from "mongodb"
import dayjs from 'dayjs'


type Props = {
	params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params

	try {
		const operation = await Db.operations.findOne({ _id: new ObjectId(id) })
		if (!operation) return { title: 'Unknown Operation | ASOT' }

		const title = `${operation.title} | ASOT`
		const description = `${operation.department || 'Joint Operation'} — ${dayjs(operation.date).format('DD MMM YYYY')}`

		return {
			title,
			description,
			themeColor: operation.themeColor || '#db001d',
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


export default function Page({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<div className="h-full">
			{children}
		</div>
	)
}