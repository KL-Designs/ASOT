import Link from 'next/link'
import Avatar from '@/components/member/avatar'
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

/**
 * The mockup's own banner: a dusk ridgeline with a low sun, drawn rather than
 * photographed. It replaces the shared unit photo that every member without a
 * cover used to get — a drawn scene reads as the file's own furniture, where a
 * repeated photograph reads as a missing upload.
 *
 * `slice` rather than `meet` so it fills the banner at any aspect ratio, and
 * inline so it costs no request and inherits nothing to load.
 */
function BannerScene() {
    return (
        <svg className={s.scene} viewBox='0 0 1600 420' preserveAspectRatio='xMidYMid slice' aria-hidden='true'>
            <defs>
                <linearGradient id='milpac-sky' x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0%' stopColor='#1b2028' />
                    <stop offset='52%' stopColor='#2b2b28' />
                    <stop offset='78%' stopColor='#3a2f22' />
                    <stop offset='100%' stopColor='#12130f' />
                </linearGradient>
                <radialGradient id='milpac-sun' cx='72%' cy='74%' r='34%'>
                    <stop offset='0%' stopColor='#e0a94e' stopOpacity='.55' />
                    <stop offset='60%' stopColor='#c07a35' stopOpacity='.13' />
                    <stop offset='100%' stopColor='#000' stopOpacity='0' />
                </radialGradient>
            </defs>
            <rect width='1600' height='420' fill='url(#milpac-sky)' />
            <rect width='1600' height='420' fill='url(#milpac-sun)' />
            <circle cx='1152' cy='311' r='26' fill='#e8b45c' opacity='.5' />
            <path d='M0 300 L180 246 L330 292 L470 232 L620 288 L780 244 L930 296 L1090 250 L1250 300 L1420 258 L1600 302 V420 H0 Z' fill='#20242a' opacity='.85' />
            <path d='M0 330 L150 300 L300 340 L450 296 L600 342 L760 306 L920 346 L1080 302 L1240 344 L1400 308 L1600 348 V420 H0 Z' fill='#161a1f' />
            <path d='M0 372 L200 352 L400 382 L600 356 L800 386 L1000 358 L1200 388 L1400 360 L1600 386 V420 H0 Z' fill='#0d1013' />
            <g fill='#0a0c0e'>
                <path d='M300 372 l7 -22 l7 22 z' />
                <path d='M1180 380 l6 -18 l6 18 z' />
                <path d='M640 378 l5 -15 l5 15 z' />
            </g>
            <g opacity='.55' fill='none' stroke='#0a0c0e' strokeWidth='3'>
                <path d='M1320 120 h60 M1350 120 v14 M1338 134 h24' />
                <path d='M1300 116 q50 -14 100 0' />
            </g>
        </svg>
    )
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
                    {!hasCover && <BannerScene />}
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
