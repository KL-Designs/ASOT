import client from '@/lib/discord'
import { connection } from 'next/server'

import { CreateButton, OperationsBoard } from './list'


export default async function Page() {

    await connection()
    let editAccess = false

    try {
        const me = await client.fetchMe()
        if (await client.hasRoles(me, ['HQ Staff'])) editAccess = true
    } catch { }

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-6' style={{ maxWidth: 1400, margin: '0 auto' }}>

            {/* Header */}
            <div className='flex items-center justify-between gap-4'>
                <div className='flex flex-col gap-1'>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.55)' }}>
                        Australian Special Operations Taskforce
                    </span>
                    <h1 style={{ fontSize: '1.35rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)', margin: 0 }}>
                        Operations Board
                    </h1>
                </div>
                {editAccess && <CreateButton />}
            </div>

            {/* 3-column board */}
            <OperationsBoard editAccess={editAccess} />

        </div>
    )
}
