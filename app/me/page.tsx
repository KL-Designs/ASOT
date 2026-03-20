import client from '@/lib/discord'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Typography } from '@mui/material'
import { Api, Tune, CalendarToday, ManageAccounts } from '@mui/icons-material'

import ConvertColor from '@/lib/discord/color'
import { fetchORBAT, findOrbatEntry } from '@/lib/orbat'
import { BioSections } from './bio'
import Avatar from '@/components/member/avatar'



export default async function Page() {

    await connection()

    const me = await client.fetchMe()
    if (!me) return redirect('/login')

    const isHQ = client.hasRoles(me, ['HQ Staff'])
    const isJ5 = client.hasRoles(me, ['J5-Media'])

    const [allMembers, orbat] = await Promise.all([client.fetchAllMembers(), fetchORBAT()])
    const lookup = client.buildOrbatLookup(allMembers)
    const orbatEntry = findOrbatEntry(orbat, lookup, me.id)

    const bioDisplayName = me.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim() || me.globalName || me.username
    const bioRank = me.bio?.rank || null
    const bioCallsign = me.bio?.callsign || null
    const bioRole = orbatEntry?.role || null

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-5 max-w-[1000px] mx-auto'>

            {/* Profile Card — full width */}
            <div
                className='flex flex-col'
                style={{
                    border: '1px solid rgba(219,0,29,0.15)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.02)',
                }}
            >
                <div
                    className='flex items-center px-4 py-3'
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                    <Typography fontWeight={600} fontSize='0.8rem' letterSpacing={2} style={{ textTransform: 'uppercase', flex: 1 }}>
                        Member Profile
                    </Typography>
                </div>

                <div className='p-5'>
                    <div className='flex flex-wrap gap-5'>
                        <div className='relative h-[90px] min-w-[90px]'>
                            <Avatar user={me} />
                        </div>

                        <div
                            className='self-stretch hidden sm:block'
                            style={{ width: 1, background: 'rgba(255,255,255,0.06)' }}
                        />

                        <div className='flex flex-col justify-center gap-2 flex-grow min-w-0'>
                            {bioRank && (
                                <Typography fontSize='0.65rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)' }}>
                                    {bioRank}
                                </Typography>
                            )}
                            <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>
                                {bioDisplayName}
                            </Typography>
                            <div className='flex flex-wrap gap-3'>
                                {bioRole && (
                                    <Typography fontSize='0.68rem' fontWeight={600} letterSpacing={2} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.45)' }}>
                                        {bioRole}
                                    </Typography>
                                )}
                                {bioCallsign && (
                                    <Typography fontSize='0.68rem' fontWeight={600} letterSpacing={2} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                                        {bioCallsign}
                                    </Typography>
                                )}
                            </div>
                            <div
                                className='flex items-center gap-2'
                                style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.72rem', letterSpacing: '0.06em' }}
                            >
                                <CalendarToday style={{ fontSize: 11 }} />
                                JOINED {new Date(me.guild.joinedTimestamp).toDateString().toUpperCase()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom area: left column + Roles */}
            <div className='flex gap-5 items-start'>

                {/* Left column */}
                <div className='flex flex-col gap-5 flex-grow min-w-0'>
                    {isHQ && <BioSections />}

                    {/* Navigation cards */}
                    <div className='flex flex-wrap gap-4'>
                        <Link href='/operations' className='flex-1 min-w-[160px]'>
                            <div
                                className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] cursor-pointer transition-colors duration-200 bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(219,0,29,0.08)]'
                                style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)' }}
                            >
                                <Api sx={{ fontSize: 44, color: 'var(--red)', opacity: 0.7 }} />
                                <Typography fontWeight={700} fontSize='0.78rem' letterSpacing={3} textAlign='center' style={{ textTransform: 'uppercase' }}>
                                    Operations
                                </Typography>
                            </div>
                        </Link>

                        <Link href='/optionals' className='flex-1 min-w-[160px]'>
                            <div
                                className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] cursor-pointer transition-colors duration-200 bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(219,0,29,0.08)]'
                                style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)' }}
                            >
                                <Tune sx={{ fontSize: 44, color: 'var(--red)', opacity: 0.7 }} />
                                <Typography fontWeight={700} fontSize='0.78rem' letterSpacing={3} textAlign='center' style={{ textTransform: 'uppercase' }}>
                                    Configure<br />Optionals
                                </Typography>
                            </div>
                        </Link>

                        {isJ5 && (
                            <Link href='/members' className='flex-1 min-w-[160px]'>
                                <div
                                    className='flex flex-col justify-center items-center gap-4 p-6 h-[160px] cursor-pointer transition-colors duration-200 bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(219,0,29,0.08)]'
                                    style={{ border: '1px solid rgba(219,0,29,0.15)', borderTop: '2px solid var(--red)' }}
                                >
                                    <ManageAccounts sx={{ fontSize: 44, color: 'var(--red)', opacity: 0.7 }} />
                                    <Typography fontWeight={700} fontSize='0.78rem' letterSpacing={3} textAlign='center' style={{ textTransform: 'uppercase' }}>
                                        Member<br />Management
                                    </Typography>
                                </div>
                            </Link>
                        )}
                    </div>
                </div>

                {/* Roles — stretches to match left column height */}
                <div
                    className='flex flex-col w-[220px] shrink-0 self-stretch'
                    style={{
                        border: '1px solid rgba(219,0,29,0.15)',
                        borderTop: '2px solid var(--red)',
                        background: 'rgba(255,255,255,0.02)',
                    }}
                >
                    <div
                        className='flex items-center gap-2 px-4 py-3'
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                    >
                        <Typography fontWeight={600} fontSize='0.8rem' letterSpacing={2} style={{ textTransform: 'uppercase', flex: 1 }}>
                            Roles
                        </Typography>
                        <span
                            style={{
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                letterSpacing: '0.06em',
                                color: 'rgba(219,0,29,0.7)',
                                background: 'rgba(219,0,29,0.08)',
                                border: '1px solid rgba(219,0,29,0.2)',
                                padding: '2px 8px',
                            }}
                        >
                            {me.roles.length}
                        </span>
                    </div>
                    <div className='flex flex-col px-4 py-2'>
                        {me.roles.map(role => (
                            <div
                                key={role.id}
                                className='flex items-center gap-2 py-[5px]'
                                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                            >
                                <div
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        background: role.color !== 0 ? ConvertColor(role.color) : 'rgba(237,237,237,0.2)',
                                        flexShrink: 0,
                                    }}
                                />
                                <Typography
                                    fontSize='0.8rem'
                                    style={{
                                        color: role.color !== 0 ? ConvertColor(role.color) : 'rgba(237,237,237,0.45)',
                                        letterSpacing: '0.02em',
                                    }}
                                >
                                    {role.name}
                                </Typography>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

        </div>
    )
}
