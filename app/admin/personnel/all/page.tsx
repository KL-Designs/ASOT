import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { getOrbatEntriesForUsers } from '@/lib/orbat'
import MemberList from '@/app/members/MemberList'
import { Typography } from '@mui/material'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.pages.members)) redirect('/admin')

    const allMembers = await client.fetchAllMembers()

    const sorted = [...allMembers].sort((a, b) => {
        const nameA = a.name || a.guild?.nickname || a.globalName || a.username || ''
        const nameB = b.name || b.guild?.nickname || b.globalName || b.username || ''
        return nameA.localeCompare(nameB)
    })

    const orbatMap = await getOrbatEntriesForUsers(sorted.map(m => m.id))
    const isAdmin = client.hasRoles(me, PERMISSIONS.admin.impersonate)

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-6 max-w-[1000px]'>
            <div
                className='flex flex-col px-5 py-4'
                style={{
                    border: '1px solid rgba(219,0,29,0.15)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.02)',
                }}
            >
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    Personnel
                </Typography>
                <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                    All Members
                </Typography>
                <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.35)', marginTop: 4 }}>
                    {sorted.length} member{sorted.length !== 1 ? 's' : ''}
                </Typography>
            </div>
            <MemberList members={sorted} orbatMap={orbatMap} isAdmin={isAdmin} />
        </div>
    )
}
