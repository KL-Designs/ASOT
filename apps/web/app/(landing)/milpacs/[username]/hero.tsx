import Link from 'next/link'
import Image from 'next/image'
import Avatar from '@/components/member/avatar'
import Banner from '@/public/images/home/Droneteam7.png'
import { type MemberStatus, type StatusKey } from '@/lib/military/milpac-status'
import s from './profile.module.css'

/**
 * The personnel-file hero: top bar, banner, identity block and stat strip.
 *
 * Everything is passed in already resolved — the page owns the data and the
 * render side effects, this owns the presentation.
 */

// ── Member status ────────────────────────────────────────────────────────────

/** Status is derived in lib/military/milpac-status (and tested there); only the
 *  mapping to a pill colour lives here, so the derivation stays a pure function
 *  that needs no stylesheet. */
const STATUS_CLASS: Record<StatusKey, string> = {
    active: s.pActive,
    reservistActive: s.pReservist,
    reservistInactive: s.pInactive,
    discharged: s.pDischarged,
}

// ── Link chips ───────────────────────────────────────────────────────────────

function DiscordIcon() {
    return (
        <svg viewBox='0 0 24 24' aria-hidden='true'>
            <path d='M20.32 4.37A19.8 19.8 0 0 0 15.45 3l-.23.27a13.4 13.4 0 0 1 4.3 2.19 17.6 17.6 0 0 0-15.04 0A13.4 13.4 0 0 1 8.8 3.27L8.55 3a19.8 19.8 0 0 0-4.87 1.37C.6 8.98-.24 13.53.18 18.02a19.9 19.9 0 0 0 6.02 3.04l.36-.5a13 13 0 0 1-2.02-.97l.16-.12a14.2 14.2 0 0 0 10.6 0l.16.12c-.64.38-1.32.7-2.03.97l.36.5a19.9 19.9 0 0 0 6.03-3.04c.5-5.2-.85-9.71-3.5-13.65ZM8.02 15.33c-1.18 0-2.15-1.08-2.15-2.4 0-1.34.95-2.42 2.15-2.42 1.2 0 2.17 1.09 2.15 2.41 0 1.33-.95 2.41-2.15 2.41Zm7.96 0c-1.18 0-2.15-1.08-2.15-2.4 0-1.34.95-2.42 2.15-2.42 1.2 0 2.17 1.09 2.15 2.41 0 1.33-.95 2.41-2.15 2.41Z' />
        </svg>
    )
}

function SteamIcon() {
    return (
        <svg viewBox='0 0 24 24' aria-hidden='true'>
            <path d='M11.98 2a10 10 0 0 0-9.96 9.02l5.36 2.2a2.83 2.83 0 0 1 1.6-.5h.14l2.38-3.45v-.05a3.78 3.78 0 1 1 3.78 3.78h-.09l-3.4 2.42v.11a2.84 2.84 0 0 1-5.61.6L2.3 14.6A10 10 0 1 0 11.98 2Zm-4.4 15.16.86.35a2.13 2.13 0 0 0 2.77-1.15 2.12 2.12 0 0 0-1.16-2.77l-1-.42a2.5 2.5 0 0 1 .96 3.44l-.8.1-1.63.45Zm10.2-5.85a2.52 2.52 0 1 0-5.04 0 2.52 2.52 0 0 0 5.04 0Zm-4.4 0a1.89 1.89 0 1 1 3.78 0 1.89 1.89 0 0 1-3.78 0Z' />
        </svg>
    )
}

// ── Hero ─────────────────────────────────────────────────────────────────────

export type HeroStat = { value: string; unit?: string; label: string }

export type HeroProps = {
    memberId: string
    username: string
    name: string
    /** Matches User.avatarURL, which is a required string on the document. */
    avatarURL: string
    rankAbbr?: string
    fullRank: string
    role?: string
    section?: string
    platoon: string | null
    timezone?: string
    status: MemberStatus
    hasCover: boolean
    discordId: string
    steamId64?: string
    stats: HeroStat[]
    /** Rendered into the top bar — the page owns which links a viewer may see. */
    topbarActions?: React.ReactNode
    /** Rendered over the banner, e.g. the owner's cover upload control. */
    bannerActions?: React.ReactNode
    /** Rendered beside the link chips, e.g. Request Award. */
    identActions?: React.ReactNode
}

export function Hero(props: HeroProps) {
    const {
        memberId, username, name, avatarURL, rankAbbr, fullRank, role, section,
        platoon, timezone, status, hasCover, discordId, steamId64, stats,
        topbarActions, bannerActions, identActions,
    } = props

    // The strapline the mockup fills with "2-44 IN · TASK FORCE RAVEN": the real
    // equivalent is the member's platoon and section, which is genuinely their
    // place in the unit rather than invented flavour.
    const unitLine = [platoon, section].filter(Boolean).join(' · ')

    return (
        <>
            <div className={s.topbar}>
                <Link href='/milpacs' className={s.btn}>← Milpacs</Link>
                {unitLine && <span className={s.topbarUnit}>{unitLine}</span>}
                {topbarActions}
                <span className={s.crumb}>PERSONNEL / {username.toUpperCase()}</span>
            </div>

            <div className={s.hero}>
                <div
                    className={s.banner}
                    style={hasCover
                        // Cache-busted so a fresh upload shows immediately; the
                        // cover route serves whatever is on disk.
                        ? { backgroundImage: `url(/api/uploads/cover?id=${memberId}&t=${Date.now()})` }
                        : undefined}
                >
                    {!hasCover && (
                        <Image src={Banner} alt='' fill priority style={{ objectFit: 'cover', objectPosition: 'center' }} />
                    )}
                    <div className={s.vig} />
                    <div className={s.bannerbadge}>
                        <span className={`${s.pill} ${STATUS_CLASS[status.key]}`}>{status.label}</span>
                        {bannerActions}
                    </div>
                </div>

                <div className={s.ident}>
                    <div className={s.avatar}>
                        {/* Square, not the site's usual circle — the dossier
                            framing is the point, and Avatar fills this box. */}
                        <Avatar user={{ id: discordId, avatarURL }} borderRadius='var(--r)' />
                        <div className={s.ring} />
                        {rankAbbr && <div className={s.rankchip}>{rankAbbr}</div>}
                    </div>

                    <div className={s.idtext}>
                        <div className={s.rk}>{fullRank}</div>
                        <h1>{name}</h1>
                        <div className={s.meta}>
                            {section && <span className={s.metaAcc}>{section}</span>}
                            {section && role && <span className={s.dot} />}
                            {role && <span>{role}</span>}
                            {timezone && <><span className={s.dot} /><span>{timezone}</span></>}
                        </div>
                    </div>

                    <div className={s.links}>
                        <a
                            className={s.lnk}
                            href={`https://discord.com/users/${discordId}`}
                            target='_blank'
                            rel='noreferrer noopener'
                        >
                            <DiscordIcon />Discord
                        </a>
                        {/* The SteamID64 itself is never rendered as text — it is a
                            stable cross-site identifier and this page is public. */}
                        {steamId64
                            ? (
                                <a
                                    className={s.lnk}
                                    href={`https://steamcommunity.com/profiles/${steamId64}`}
                                    target='_blank'
                                    rel='noreferrer noopener'
                                >
                                    <SteamIcon />Steam
                                </a>
                            )
                            : <span className={`${s.lnk} ${s.lnkOff}`} aria-hidden='true'><SteamIcon />Steam</span>}
                        {identActions}
                    </div>
                </div>

                <div className={s.strip}>
                    {stats.map(stat => (
                        <div key={stat.label} className={s.cell}>
                            <div className={s.cellV}>
                                {stat.value}
                                {stat.unit && <small>{stat.unit}</small>}
                            </div>
                            <div className={`${s.lbl} ${s.cellK}`}>{stat.label}</div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    )
}
