import Link from 'next/link'
import Avatar from '@/components/member/avatar'
import { CopyLinkButton } from './copy-link'
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
            <path d='M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.198.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z' />
        </svg>
    )
}

function SteamIcon() {
    return (
        <svg viewBox='0 0 24 24' aria-hidden='true'>
            <path d='M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z' />
        </svg>
    )
}

// ── Hero ─────────────────────────────────────────────────────────────────────

export type HeroStat = { value: string; unit?: string; label: string }

export type HeroProps = {
    memberId: string
    /** The Discord username — shown in the crumb, not necessarily the URL. */
    username: string
    /** The path this profile should be shared as, e.g. `/milpacs/koda`. */
    canonicalPath: string
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
    /** Centred in the top bar — the page owns which links a viewer may see.
     *  Pass null rather than an empty fragment when there are none, so the
     *  centring wrapper is not rendered empty. */
    topbarActions?: React.ReactNode
    /** Rendered over the banner, e.g. the owner's cover upload control. */
    bannerActions?: React.ReactNode
    /** Rendered beside the link chips, e.g. Request Award. */
    identActions?: React.ReactNode
}

export function Hero(props: HeroProps) {
    const {
        memberId, username, canonicalPath, name, avatarURL, rankAbbr, fullRank, role, section,
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
                {topbarActions && <div className={s.topbarActions}>{topbarActions}</div>}
                <span className={s.crumb}>PERSONNEL / {name.toUpperCase()}</span>
                <CopyLinkButton path={canonicalPath} />
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
