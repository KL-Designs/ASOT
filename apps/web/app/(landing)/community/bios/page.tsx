import type { Metadata } from 'next'
import { connection } from 'next/server'
import Db from '@/lib/mongo'

export const metadata: Metadata = {
	title: "Member Bios | Australian Special Operations Taskforce",
	description: "Personnel bios and profiles for members of the Australian Special Operations Taskforce.",
}

import Image from 'next/image'

import Container from '@/components/container'
import BannerImg from '@/public/images/home/VicPose2.png'
import { getOrbatEntriesForUsers } from '@/lib/orbat'
import { resolveMilpacProfile } from '@/lib/military/milpac-profile'
import WipPage from '@/components/wip-page'


export default async function Page() {

    if (process.env.WIP_PAGES === 'true') return <WipPage />

    await connection()

    const users = await Db.users.find({ "guild.roles": { $in: ["745793767185055744", "1387622241654673498"] } }).toArray()
    const orbatEntries = await getOrbatEntriesForUsers(users.map(u => u._id))

    return (
        <Container
            title='UNIT LEADERSHIP'
            subtitle='Meet the leaders of ASOT'
            background={BannerImg}
            sx={{ bannerHeight: 'sm', maxWidth: 'max-w-[960px]', gap: 'gap-6' }}
        >
            {users.map(user => {

                if (!user.bio?.content) return null

                const orbatEntry = orbatEntries[user._id] ?? null
                const { name, fullRank, callsign } = resolveMilpacProfile(user as unknown as User, orbatEntry)

                return (
                    <div key={user.id} className='flex overflow-hidden' style={{
                        border: '1px solid rgba(219,0,29,0.2)',
                        borderTop: '2px solid var(--red)',
                        background: 'rgba(219,0,29,0.02)',
                    }}>

                        {/* Centre — Details */}
                        <div className='flex-1 flex flex-col gap-4 p-4 md:p-8'>

                            {/* Header row: avatar + name on left, callsign on right */}
                            <div className='flex flex-wrap justify-between items-center gap-3'>
                                <div className='flex items-center gap-4'>
                                    <div className='relative h-[64px] w-[64px] shrink-0'>
                                        <Image
                                            src={user.avatarURL}
                                            alt={user.username}
                                            fill
                                            className='rounded-full object-cover'
                                            style={{ outline: '2px solid rgba(219,0,29,0.35)', outlineOffset: 3 }}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.8)', textTransform: 'uppercase', marginBottom: 4 }}>
                                            {orbatEntry?.role ?? 'Member'}
                                        </div>
                                        <h3 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.08em', margin: 0, textTransform: 'uppercase', color: 'rgba(237,237,237,0.95)' }}>
                                            {name}
                                        </h3>
                                        <p style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.35)', textTransform: 'uppercase', margin: 0 }}>
                                            Joined {new Date(user.guild.joinedTimestamp).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>

                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.8)', textTransform: 'uppercase', marginBottom: 4 }}>
                                        Callsign
                                    </div>
                                    <h3 className='text-right' style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.08em', margin: 0, textTransform: 'uppercase', color: 'rgba(237,237,237,0.95)' }}>
                                        {callsign ?? '—'}
                                    </h3>
                                    <p className='text-right' style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.35)', textTransform: 'uppercase', margin: 0 }}>
                                        {fullRank ?? '—'}
                                    </p>
                                </div>
                            </div>

                            <div style={{ height: 2, width: 40, background: 'var(--red)' }} />

                            <div style={{ borderLeft: '2px solid var(--red)', paddingLeft: '1rem', paddingTop: '0.5rem', paddingBottom: '0.5rem', background: 'rgba(0,0,0,0.2)' }}>
                                <p style={{ fontSize: '0.83rem', lineHeight: 1.8, color: 'rgba(237,237,237,0.65)', margin: 0 }}>
                                    {user.bio?.content}
                                </p>
                            </div>
                        </div>

                        {/* Right — Bio photo (hidden on small screens) */}
                        <div className='relative hidden md:block' style={{ minWidth: 220, borderLeft: '1px solid rgba(219,0,29,0.15)' }}>
                            <Image
                                src={`/api/uploads/bio?id=${user.id}&time=${new Date().getTime()}`}
                                alt={name}
                                fill
                                className='object-cover object-top'
                            />
                            <div className='absolute inset-0' style={{ background: 'linear-gradient(to right, rgba(10,10,10,0.5) 0%, transparent 25%)' }} />
                        </div>

                    </div>
                )
            })}
        </Container>
    )
}
