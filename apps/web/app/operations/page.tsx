import client from '@/lib/discord'
import { connection } from 'next/server'
import PERMISSIONS from '@/lib/permissions'

import OperationsBoard from './board/OperationsBoard'
import MissionMakingButton from './MissionMakingButton'

/**
 * The public operations board.
 *
 * The page itself is deliberately thin: everything on it is per-viewer (your
 * RSVP, the operations you were on, whether you can see the staff line) and
 * paged, so it is all resolved client-side from `/api/operations/board` rather
 * than rendered here and then contradicted a moment later.
 *
 * `editAccess` still gates the Mission Making button, which is a link to
 * somewhere else and has nothing to fetch.
 */
export default async function Page() {

    await connection()
    let editAccess = false

    try {
        const me = await client.fetchMe()
        if (await client.hasRoles(me, PERMISSIONS.pages.operationsEdit)) editAccess = true
    } catch { }

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-6' style={{ maxWidth: 1700, margin: '0 auto' }}>

            <div className='flex flex-col gap-3 md:flex-row md:items-center md:gap-4'>
                <div className='flex flex-col gap-1' style={{ flexShrink: 0 }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.55)' }}>
                        Australian Special Operations Taskforce
                    </span>
                    <h1 style={{ fontSize: '1.35rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)', margin: 0 }}>
                        Operations
                    </h1>
                </div>
                <div style={{ flex: 1 }} />
                {editAccess && <MissionMakingButton />}
            </div>

            <OperationsBoard />

        </div>
    )
}
