import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import Button from '@/components/ui/Button'
import Pulse from '@/components/ui/Pulse'
import { CrateIcon, DiscordIcon, SteamIcon, YouTubeIcon, MailIcon } from '@/components/ui/icons'
import Signature from '@/components/signature'
import CreditsModal from '@/components/credits-modal'

import { getFeaturedOp, getRosterCount } from '@/lib/landing'
import Logo from '@/public/logo.png'
import s from '@/styles/footer.module.css'

/**
 * The site footer — "Command".
 *
 * A server component so the status panel carries real figures. It reads the
 * same `lib/landing` loaders the home page does; both are behind
 * `force-dynamic` pages, so this is one extra query per request rather than a
 * second copy of the logic.
 *
 * `Support` and `Donate` used to be separate entries pointing at overlapping
 * ideas. They are distinct here: Support is the wellbeing and crisis-resources
 * page, Donate is money.
 */

const COLUMNS = [
    {
        heading: 'Unit',
        links: [
            { label: 'About us', href: '/about' },
            { label: 'ORBAT', href: '/community/orbat' },
            { label: 'Callsigns', href: '/about/callsigns' },
            { label: 'Biographies', href: '/community/bios' },
            { label: 'MILPACS', href: '/milpacs' },
        ],
    },
    {
        heading: 'Operations',
        links: [
            { label: 'All operations', href: '/operations' },
            { label: 'Interactive map', href: '/maps' },
            { label: 'Gallery', href: '/gallery' },
            { label: 'Kits', href: '/community/kits' },
            { label: 'Retired members', href: '/community/retired' },
        ],
    },
    {
        heading: 'Joining',
        links: [
            { label: 'Enlist', href: '/join' },
            { label: 'Rules', href: '/about/rules' },
            { label: 'Principles & values', href: '/about/values' },
            { label: 'FAQ', href: '/about/faq' },
            { label: 'Contact', href: '/about/contact' },
        ],
    },
]

const SOCIALS = [
    { label: 'Discord', href: 'https://discord.gg/asot', icon: <DiscordIcon /> },
    { label: 'Steam', href: 'https://steamcommunity.com/groups/asotmilsim', icon: <SteamIcon /> },
    { label: 'YouTube', href: 'https://www.youtube.com/@asotmilsim', icon: <YouTubeIcon /> },
    { label: 'Contact', href: '/about/contact', icon: <MailIcon /> },
]

export default async function Footer() {
    const [nextOp, roster] = await Promise.all([
        getFeaturedOp().catch(() => null),
        getRosterCount().catch(() => null),
    ])

    const opWhen = nextOp
        ? new Date(nextOp.date).toLocaleString('en-AU', {
            weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
        })
        : null

    return (
        <footer className={s.ft}>
            <div className={s.pattern} aria-hidden='true' />
            <div className={s.word} aria-hidden='true'>ASOT</div>

            <div className={s.in}>
                <div className={s.grid}>

                    <div className={s.brand}>
                        <div className={s.m}>
                            <Image src={Logo} alt='' width={44} height={44} quality={100} />
                            <div className={s.w}>
                                ASOT
                                <span>Australian Special Operations Taskforce</span>
                            </div>
                        </div>
                        <p>
                            An ArmA 3 milsim community built on teamwork, realism and a genuinely good
                            game experience. Oceania&apos;s largest, running since 2019.
                        </p>
                        <div className={s.socials}>
                            {SOCIALS.map(social => social.href.startsWith('http') ? (
                                <a key={social.label} href={social.href} aria-label={social.label}
                                    target='_blank' rel='noopener noreferrer'>
                                    {social.icon}
                                </a>
                            ) : (
                                <Link key={social.label} href={social.href as any} aria-label={social.label}>
                                    {social.icon}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {COLUMNS.map(col => (
                        <div key={col.heading} className={s.col}>
                            <h5>{col.heading}</h5>
                            {col.links.map(link => (
                                <Link key={link.href} href={link.href as any}>{link.label}</Link>
                            ))}
                        </div>
                    ))}

                    <div className={s.status}>
                        <h5>Unit status</h5>
                        <div className={s.r}>
                            <span>Next op</span>
                            <b className={opWhen ? s.a : undefined}>{opWhen ?? 'None scheduled'}</b>
                        </div>
                        <div className={s.r}>
                            <span>Sign-ons</span>
                            <b>{nextOp ? nextOp.attending : '—'}</b>
                        </div>
                        <div className={s.r}>
                            <span>Active</span>
                            <b>{roster ?? '—'}</b>
                        </div>
                        <div className={s.r}>
                            <span>Applications</span>
                            <b className={s.g}><Pulse />Open</b>
                        </div>
                        <Button variant='amber' size='sm' href='/donate' block>
                            <CrateIcon /> Support the unit
                        </Button>
                    </div>

                </div>

                <div className={s.bottom}>
                    <span className={s.c}>© {new Date().getFullYear()} Australian Special Operations Taskforce</span>

                    <CreditsModal />

                    <Link href='https://github.com/ItsKodas' target='_blank' rel='noopener noreferrer' className={s.sig}>
                        <span className={s.l}>Site by</span>
                        <Signature size='72px' color='var(--txt-1)' />
                    </Link>

                    <p className={s.legal}>
                        <b>ArmA 2™, ArmA 3™ and Bohemia Interactive™ are trademarks of Bohemia Interactive.</b>{' '}
                        ASOT is an ArmA 3 online gaming community and is not affiliated with, associated
                        with, or endorsed by the Australian Defence Force or the Australian Government.
                    </p>
                </div>
            </div>
        </footer>
    )
}
