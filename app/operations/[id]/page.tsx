import Db from '@/lib/mongo'
import dayjs from 'dayjs'
import Link from 'next/link'
import { connection } from 'next/server'
import { ObjectId } from 'mongodb'
import DocBody from './doc-body'


export default async function Page({ params }: { params: { id: string } }) {
    const { id } = params
    await connection()

    const operation = await Db.operations.findOne({ _id: new ObjectId(id) })
    if (!operation) return (
        <div className='flex items-center justify-center h-full' style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Operation not found
        </div>
    )

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-6 max-w-[900px] mx-auto'>

            {/* Nav */}
            <div className='flex items-center gap-4'>
                <Link href='/operations' style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', textDecoration: 'none' }}>
                    ← Operations
                </Link>
            </div>

            {/* Operation header card */}
            <div style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)', background: 'rgba(255,255,255,0.01)' }}>
                <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5' style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className='flex flex-col gap-1'>
                        {operation.department && (
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)' }}>
                                {operation.department}
                            </span>
                        )}
                        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.95)', margin: 0 }}>
                            {operation.title}
                        </h1>
                    </div>
                    <div className='flex flex-col items-start sm:items-end gap-1 shrink-0'>
                        <span style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>
                            Operation Date
                        </span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(237,237,237,0.7)' }}>
                            {dayjs(operation.date).format('DD MMM YYYY — HH:mm').toUpperCase()}
                        </span>
                        {operation.loreDate && (
                            <>
                                <span style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)', marginTop: 4 }}>
                                    In-Game Date
                                </span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(219,0,29,0.6)' }}>
                                    {dayjs(operation.loreDate).format('DD HHmm MMM YY').toUpperCase()}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Document body */}
            <DocBody content={operation.content ?? null} />

        </div>
    )
}
