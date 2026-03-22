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

		return {
			title: `${operation.title} | ASOT`,
			description: `${operation.department || 'Joint Operation'} — ${dayjs(operation.date).format('DD MMM YYYY')}`,
			themeColor: operation.themeColor || '#db001d',
			openGraph: { images: [] },
			twitter: { images: [] },
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