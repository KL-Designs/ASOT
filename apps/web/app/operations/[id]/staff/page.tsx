import { redirect } from 'next/navigation'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import StaffView from './StaffView'
import { hasPermission } from '@/lib/orbat/hasPermission'

export default async function StaffPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        redirect('/login')
    }

    if (!(await hasPermission(me, 'pages.member'))) redirect('/login')

    type OpProjection = { title: string; date?: Date; department?: string; status?: string; themeColor?: string; coverImage?: string }
    let operation: OpProjection | null = null
    try {
        operation = await Db.operations.findOne(
            { _id: new ObjectId(id), deletedAt: { $exists: false } },
            { projection: { title: 1, date: 1, department: 1, status: 1, themeColor: 1, coverImage: 1 } }
        ) as OpProjection | null
    } catch {
        // invalid ID format or not found
    }

    if (!operation) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'rgba(237,237,237,0.4)', fontSize: '0.85rem' }}>
                Operation not found.
            </div>
        )
    }

    return (
        <StaffView
            opId={id}
            title={operation.title}
            date={operation.date?.toISOString()}
            department={operation.department}
            status={operation.status}
            themeColor={operation.themeColor ?? '#db001d'}
            coverImage={operation.coverImage}
        />
    )
}
