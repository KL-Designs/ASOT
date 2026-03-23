import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { Typography } from '@mui/material'
import { ManageAccounts } from '@mui/icons-material'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'



export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) redirect('/me')

    const canManageMembers = client.hasRoles(me, PERMISSIONS.admin.manageMembers)

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-6 max-w-[1000px] mx-auto'>

            {/* Header */}
            <div
                className='flex flex-col px-5 py-4'
                style={{
                    border: '1px solid rgba(219,0,29,0.15)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.02)',
                }}
            >
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                    Administration
                </Typography>
                <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                    Admin Panel
                </Typography>
                <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.35)', marginTop: 4, letterSpacing: '0.04em' }}>
                    Logged in as {me.guild?.nickname || me.globalName || me.username}
                </Typography>
            </div>

            {/* Dashboard tiles */}
            <div>
                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 12 }}>
                    Management
                </Typography>
                <div className='flex flex-wrap gap-4'>

                    {canManageMembers && (
                        <Link href='/members' className='flex-1 min-w-[160px] max-w-[220px]'>
                            <div
                                className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] cursor-pointer transition-colors duration-200 bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(219,0,29,0.08)]'
                                style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)' }}
                            >
                                <ManageAccounts sx={{ fontSize: 44, color: 'var(--red)', opacity: 0.7 }} />
                                <Typography fontWeight={700} fontSize='0.78rem' letterSpacing={3} textAlign='center' style={{ textTransform: 'uppercase' }}>
                                    User<br />Management
                                </Typography>
                            </div>
                        </Link>
                    )}

                </div>
            </div>

        </div>
    )
}
