import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { Typography } from '@mui/material'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.pages.members)) redirect('/dashboard')

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-6'>
            <div
                className='flex flex-col px-5 py-4'
                style={{
                    border: '1px solid var(--line-2)',
                    background: 'rgba(255,255,255,0.04)',
                }}
            >
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    Personnel
                </Typography>
                <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                    HQ Staff
                </Typography>
            </div>

            <div
                style={{
                    border: '1px solid rgba(255,255,255,0.07)',
                    background: 'rgba(255,255,255,0.04)',
                    padding: '48px 32px',
                    textAlign: 'center',
                }}
            >
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 12 }}>
                    Work in Progress
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 8 }}>
                    This section is under construction
                </div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.2)' }}>
                    Check back soon.
                </div>
            </div>
        </div>
    )
}
