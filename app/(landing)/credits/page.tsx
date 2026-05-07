import { connection } from 'next/server'
import type { Metadata } from 'next'
import Image from 'next/image'
import { Typography } from '@mui/material'

import Container from '@/components/container'
import Db from '@/lib/mongo'
import { getOrbatEntriesForUsers } from '@/lib/orbat'
import { resolveMilpacProfile } from '@/lib/military/milpac-profile'

import BannerImg from '@/public/images/home/3DMA_Final2.png'


export const metadata: Metadata = {
    title: 'Credits | ASOT',
    description: 'The people who built the ASOT platform.',
}


const CONTRIBUTOR_ORDER = ['240786290600181761', '224086573560365057', '683343114865606686']

const CONTRIBUTIONS: Record<string, { title: string; description: string }> = {
    '240786290600181761': {
        title: 'Website Developer',
        description: 'Designed and built the underlying systems and architecture of the ASOT platform - from the operations management tools and ORBAT editor to the collaborative briefing system, milpac pipeline, and the overall site design.',
    },
    '224086573560365057': {
        title: 'Founder & Departments Developer',
        description: 'Creator and owner of ASOT, and the driving force behind the unit itself. Also built the departments dashboard and most of its core functionality, giving leadership the tools they need to effectively manage unit administration.',
    },
    '683343114865606686': {
        title: 'MILPAC Systems Architect',
        description: 'Original creator of the MILPAC system, designing and building the uniform generator, promotion certificates, and award certificates used by the unit.',
    },
}


export default async function Page() {
    await connection()

    const users = await Db.users.find({ _id: { $in: CONTRIBUTOR_ORDER } }).toArray()
    const orbatEntries = await getOrbatEntriesForUsers(CONTRIBUTOR_ORDER)

    const sorted = CONTRIBUTOR_ORDER
        .map(id => users.find(u => u._id === id))
        .filter((u): u is NonNullable<typeof u> => !!u)

    return (
        <Container
            title='CREDITS'
            subtitle='The people who built this platform'
            background={BannerImg}
            sx={{ bannerHeight: 'sm', maxWidth: 'max-w-[1240px]', gap: 'gap-14', padding: '3rem 2rem' }}
        >

            {/* Intro */}
            <div className='flex flex-col items-center gap-5 text-center' style={{ maxWidth: 560, margin: '0 auto' }}>
                <div className='flex items-center gap-3 w-full'>
                    <div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.15)' }} />
                    <div style={{ width: 40, height: 2, background: 'var(--red)', flexShrink: 0 }} />
                    <div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.15)' }} />
                </div>
                <Typography style={{ fontSize: '0.82rem', lineHeight: 1.9, color: 'rgba(237,237,237,0.45)', letterSpacing: '0.05em' }}>
                    The ASOT platform was built by members of the community who volunteered their time,
                    skills, and expertise. These are the people who made it possible.
                </Typography>
                <div className='flex items-center gap-3 w-full'>
                    <div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.15)' }} />
                    <div style={{ width: 40, height: 2, background: 'var(--red)', flexShrink: 0 }} />
                    <div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.15)' }} />
                </div>
            </div>

            {/* Contributor cards */}
            <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                {sorted.map((user, index) => {
                    const orbatEntry = orbatEntries[user._id] ?? null
                    const { name, fullRank, rankAbbr, accent } = resolveMilpacProfile(user as unknown as User, orbatEntry)
                    const contrib = CONTRIBUTIONS[user._id]

                    const awardsCount  = user.milpac?.awards?.length ?? 0
                    const promoCount   = user.milpac?.promotions?.length ?? 0
                    const qualCount    = user.milpac?.qualifications?.length ?? 0
                    const hasStats     = awardsCount > 0 || promoCount > 0 || qualCount > 0

                    return (
                        <div
                            key={user._id}
                            className='flex flex-col overflow-hidden relative'
                            style={{
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderTop: `3px solid ${accent}`,
                                background: '#0c0c0c',
                            }}
                        >
                            {/* Faint index number watermark */}
                            <div
                                aria-hidden
                                style={{
                                    position: 'absolute',
                                    top: '50%',
                                    right: '-0.05em',
                                    transform: 'translateY(-50%)',
                                    fontSize: '14rem',
                                    fontWeight: 900,
                                    color: 'rgba(237,237,237,0.025)',
                                    lineHeight: 1,
                                    fontFamily: 'Montserrat, sans-serif',
                                    letterSpacing: '-0.05em',
                                    pointerEvents: 'none',
                                    userSelect: 'none',
                                    zIndex: 0,
                                }}
                            >
                                {String(index + 1).padStart(2, '0')}
                            </div>

                            {/* Top — avatar section */}
                            <div
                                className='relative z-10 flex flex-col items-center gap-4 px-6 pt-8 pb-6'
                                style={{
                                    background: `radial-gradient(ellipse at 50% 0%, ${accent}14 0%, transparent 65%)`,
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                }}
                            >
                                {/* Avatar */}
                                <div className='relative shrink-0' style={{ width: 96, height: 96 }}>
                                    <Image
                                        src={user.avatarURL || '/images/fallback_pfp.png'}
                                        alt={name}
                                        fill
                                        className='rounded-full object-cover'
                                        style={{
                                            outline: `3px solid ${accent}66`,
                                            outlineOffset: 4,
                                            boxShadow: `0 0 28px ${accent}28`,
                                        }}
                                    />
                                </div>

                                {/* Name block */}
                                <div className='flex flex-col items-center gap-1 text-center'>
                                    {rankAbbr && (
                                        <div style={{
                                            fontSize: '0.63rem',
                                            fontWeight: 700,
                                            letterSpacing: '0.24em',
                                            color: accent,
                                            textTransform: 'uppercase',
                                        }}>
                                            {rankAbbr}
                                        </div>
                                    )}
                                    <h3 style={{
                                        fontSize: 'clamp(1.3rem, 3vw, 1.6rem)',
                                        fontWeight: 800,
                                        letterSpacing: '0.06em',
                                        margin: 0,
                                        textTransform: 'uppercase',
                                        color: 'rgba(237,237,237,0.95)',
                                        lineHeight: 1.15,
                                    }}>
                                        {name}
                                    </h3>
                                    {fullRank && fullRank !== rankAbbr && (
                                        <div style={{
                                            fontSize: '0.66rem',
                                            letterSpacing: '0.14em',
                                            color: 'rgba(237,237,237,0.28)',
                                            textTransform: 'uppercase',
                                        }}>
                                            {fullRank}
                                        </div>
                                    )}
                                </div>

                                {/* ORBAT entry */}
                                {orbatEntry && (
                                    <div className='flex flex-col items-center gap-[5px] text-center w-full'>
                                        <div style={{ height: 1, width: 36, background: `${accent}50`, marginBottom: 2 }} />
                                        <div style={{
                                            fontSize: '0.63rem',
                                            fontWeight: 700,
                                            letterSpacing: '0.2em',
                                            color: `${accent}cc`,
                                            textTransform: 'uppercase',
                                        }}>
                                            {orbatEntry.role}
                                        </div>
                                        <div style={{
                                            fontSize: '0.6rem',
                                            letterSpacing: '0.12em',
                                            color: 'rgba(237,237,237,0.2)',
                                            textTransform: 'uppercase',
                                        }}>
                                            {orbatEntry.section}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Bottom — contribution */}
                            <div className='relative z-10 flex flex-col gap-3 p-5 flex-1'>
                                <div>
                                    <div style={{
                                        fontSize: '0.58rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.24em',
                                        color: 'rgba(219,0,29,0.6)',
                                        textTransform: 'uppercase',
                                        marginBottom: 4,
                                    }}>
                                        Contribution
                                    </div>
                                    <div style={{
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.14em',
                                        color: accent,
                                        textTransform: 'uppercase',
                                        marginBottom: 10,
                                    }}>
                                        {contrib?.title ?? '—'}
                                    </div>
                                    <p style={{
                                        fontSize: '0.78rem',
                                        lineHeight: 1.8,
                                        color: 'rgba(237,237,237,0.45)',
                                        margin: 0,
                                    }}>
                                        {contrib?.description ?? ''}
                                    </p>
                                </div>

                                {/* Milpac stats */}
                                {hasStats && (
                                    <div
                                        className='flex gap-5 mt-auto pt-4'
                                        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                                    >
                                        {promoCount > 0 && (
                                            <div className='flex flex-col gap-[2px]'>
                                                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'rgba(237,237,237,0.65)', lineHeight: 1 }}>
                                                    {promoCount}
                                                </span>
                                                <span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', color: 'rgba(237,237,237,0.22)', textTransform: 'uppercase' }}>
                                                    Promotions
                                                </span>
                                            </div>
                                        )}
                                        {awardsCount > 0 && (
                                            <div className='flex flex-col gap-[2px]'>
                                                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'rgba(237,237,237,0.65)', lineHeight: 1 }}>
                                                    {awardsCount}
                                                </span>
                                                <span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', color: 'rgba(237,237,237,0.22)', textTransform: 'uppercase' }}>
                                                    Awards
                                                </span>
                                            </div>
                                        )}
                                        {qualCount > 0 && (
                                            <div className='flex flex-col gap-[2px]'>
                                                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'rgba(237,237,237,0.65)', lineHeight: 1 }}>
                                                    {qualCount}
                                                </span>
                                                <span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', color: 'rgba(237,237,237,0.22)', textTransform: 'uppercase' }}>
                                                    Quals
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Built-with footer note */}
            <div className='flex flex-col items-center gap-3 text-center'>
                <div style={{ height: 1, width: 60, background: 'rgba(219,0,29,0.2)', margin: '0 auto' }} />
                <Typography style={{ fontSize: '0.65rem', letterSpacing: '0.18em', color: 'rgba(237,237,237,0.15)', textTransform: 'uppercase' }}>
                    Built with Next.js 15, MongoDB &amp; Discord OAuth
                </Typography>
            </div>

        </Container>
    )
}
