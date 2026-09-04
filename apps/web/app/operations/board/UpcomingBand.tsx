'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { groupOperations, type BoardOperation } from '@/lib/operations/board'
import { platoonShortLabel } from '@/lib/orbat/constants'
import type { CampaignRef, MissionRef } from '@/lib/operations/board'
import s from './board.module.css'

interface Props {
    upcoming: BoardOperation[]
    campaigns: CampaignRef[]
    missions: MissionRef[]
    lastFlown: { title: string; date: string } | null
    signedIn: boolean
    staff: { inDevelopment: number } | null
}

/**
 * What you can turn out for.
 *
 * Everything here has a date and an answer you can give it. Operations still in
 * development are deliberately absent — nobody can RSVP to one, and a card
 * without an action on it is the thing that made the old board's left column
 * read as decoration. Staff reach them through the one line at the bottom.
 *
 * A grid that wraps rather than a featured card: more than one operation
 * upcoming is the normal case, and a layout that promotes the first is wrong
 * every time there are two.
 */
export default function UpcomingBand({ upcoming, campaigns, missions, lastFlown, signedIn, staff }: Props) {
    /**
     * One card per *mission*, not per campaign.
     *
     * A mission's Saturday and Sunday belong on one card: they are one decision,
     * and answering them separately is an artefact of how they are stored. A
     * campaign with two missions still to run is two cards — showing only the
     * next one would quietly drop an operation people can already sign up for.
     */
    const cards = useMemo<CardEntry[]>(() => {
        const out: CardEntry[] = []
        for (const group of groupOperations(upcoming, campaigns, missions)) {
            if (group.kind === 'solo') {
                out.push({ key: group.operation.id, nights: [group.operation] })
                continue
            }
            for (const mission of group.missions) {
                const nights = [mission.saturday, mission.sunday, ...mission.other]
                    .filter(Boolean) as BoardOperation[]
                if (nights.length === 0) continue
                out.push({
                    key: `${group.id}-${mission.key}`,
                    nights,
                    campaign: group.name,
                    label: mission.label,
                    title: mission.name,
                })
            }
        }
        // Soonest first: this half of the page is about what is coming, and the
        // grouping returns newest-first for the archive underneath.
        return out.sort((a, b) => new Date(a.nights[0].date).getTime() - new Date(b.nights[0].date).getTime())
    }, [upcoming, campaigns, missions])

    return (
        <section>
            <div className={s.rule}>
                <span className={s.label}>Turning out</span>
                <hr />
                <span className={s.label}>
                    {upcoming.length === 0
                        ? 'Nothing scheduled'
                        : `${upcoming.length} scheduled · next ${untilLabel(upcoming[0].date)}`}
                </span>
            </div>

            {cards.length === 0 ? (
                <div className={s.standby}>
                    <b>Standing by</b>
                    <span>
                        No operation on the calendar.
                        {lastFlown && ` The last was ${lastFlown.title}, ${dayMonth(lastFlown.date)}.`}
                    </span>
                </div>
            ) : (
                <div className={s.next}>
                    {cards.map(card => <Card key={card.key} card={card} signedIn={signedIn} />)}
                </div>
            )}

            {staff && (
                <div className={s.staff}>
                    <span>Staff</span>
                    <span><b>{staff.inDevelopment}</b> {staff.inDevelopment === 1 ? 'mission' : 'missions'} in development</span>
                    <Link href='/dashboard/j2'>Open in J2 dashboard →</Link>
                </div>
            )}
        </section>
    )
}

/** A card is a mission's nights, with the campaign it belongs to if it has one. */
interface CardEntry {
    key: string
    nights: BoardOperation[]
    campaign?: string
    label?: string
    title?: string
}

function Card({ card, signedIn }: { card: CardEntry; signedIn: boolean }) {
    const { nights } = card
    // One night reads better as a plain card than as a pair with an empty half.
    if (nights.length === 1) {
        return <SoloCard op={nights[0]} signedIn={signedIn} campaign={card.campaign} />
    }

    const first = nights[0]
    const live = nights.some(n => n.status === 'Active')

    const cover = nights.find(n => n.coverImage)?.coverImage

    return (
        <article className={`${s.card} ${live ? s.cardLive : ''} ${cover ? s.hasCover : ''}`}>
            <Cover src={cover} />
            <div className={s.cardTop}>
                {card.campaign && (
                    <span className={`${s.badge} ${s.bCamp}`}>{card.campaign} · {card.label}</span>
                )}
                <StateBadge op={first} signedIn={signedIn} />
                <span className={s.count}>{untilLabel(first.date)}</span>
            </div>

            <div className={s.cardBody}>
                <h3>{card.title ?? first.title}</h3>
                <div className={s.pair}>
                    {nights.map(night => (
                        <Link key={night.id} href={`/operations/${night.id}`} className={s.leg}>
                            <span className={s.label}>{weekday(night.date)}</span>
                            <b>{dayMonth(night.date)} · {time(night.date)}</b>
                            <span>{night.units.map(platoonShortLabel).join(' · ') || '—'}</span>
                        </Link>
                    ))}
                </div>
            </div>

            <Foot op={first} signedIn={signedIn} nights={nights} />
        </article>
    )
}

function SoloCard({ op, signedIn, campaign }: { op: BoardOperation; signedIn: boolean; campaign?: string }) {
    const live = op.status === 'Active'
    return (
        <article className={`${s.card} ${live ? s.cardLive : ''} ${op.coverImage ? s.hasCover : ''}`}>
            <Cover src={op.coverImage} />
            <div className={s.cardTop}>
                {campaign && <span className={`${s.badge} ${s.bCamp}`}>{campaign}</span>}
                <StateBadge op={op} signedIn={signedIn} />
                <span className={s.count}>{untilLabel(op.date)}</span>
            </div>

            <div className={s.cardBody}>
                <h3>{op.title}</h3>
                <p className={s.when}>
                    {weekday(op.date)} {dayMonth(op.date)} · {time(op.date)}
                    {op.terrain ? ` · ${op.terrain}` : ''}
                </p>
                <div className={s.units}>
                    {op.units.map(u => <span key={u} className={s.unit}>{platoonShortLabel(u)}</span>)}
                </div>
            </div>

            <Foot op={op} signedIn={signedIn} nights={[op]} />
        </article>
    )
}

/**
 * The operation's banner, behind the card.
 *
 * A background rather than an `<img>`: it is the card's surface, not content —
 * it has no caption, it carries nothing a screen reader wants, and an empty alt
 * on a decorative image is the same statement with more markup. The scrim over
 * it lives in CSS, because type has to stay readable over art nobody vetted.
 *
 * Cards without one keep the hatched placeholder they had; plenty of older
 * operations have no cover, and a card that suddenly loses its background is
 * worse than one that never had a photograph on it.
 */
function Cover({ src }: { src?: string }) {
    if (!src) return null
    return <div className={s.cover} style={{ backgroundImage: `url(${JSON.stringify(src)})` }} aria-hidden='true' />
}

function StateBadge({ op, signedIn }: { op: BoardOperation; signedIn: boolean }) {
    if (op.status === 'Active') return <span className={`${s.badge} ${s.bLive}`}>Running now</span>
    if (!signedIn || !op.mine?.rsvp) return <span className={`${s.badge} ${s.bUp}`}>Upcoming</span>
    return op.mine.rsvp === 'attending'
        ? <span className={`${s.badge} ${s.bGood}`}>You’re attending</span>
        : <span className={`${s.badge} ${s.bOut}`}>You’re not attending</span>
}

/**
 * The turnout bar and the call to action.
 *
 * The bar is deliberately unlabelled beyond the count: the useful signal before
 * an operation is roughly how full it is, and an exact percentage of a roster
 * that is still being cut would be false precision.
 */
function Foot({ op, signedIn, nights }: { op: BoardOperation; signedIn: boolean; nights: BoardOperation[] }) {
    const attending = Math.max(...nights.map(n => n.attending ?? 0))
    const answered = signedIn && !!op.mine?.rsvp
    const attendingHere = op.mine?.rsvp === 'attending'

    return (
        <div className={s.cardFoot}>
            <span className={s.turnout}>
                <span className={s.bar}>
                    <i style={{ width: `${Math.min(100, attending * 1.4)}%`, background: 'var(--good)' }} />
                </span>
                {attending} in
            </span>
            <Link
                href={`/operations/${op.id}`}
                className={`${s.cta} ${answered ? (attendingHere ? s.ctaIn : s.ctaOut) : ''}`}
            >
                {!signedIn ? 'View' : answered ? (attendingHere ? 'Your slot' : 'Change') : 'Sign Up'}
            </Link>
        </div>
    )
}

// ── Dates ─────────────────────────────────────────────────────────────────────

const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(d).toLocaleString('en-AU', opts)

const weekday = (d: string) => fmt(d, { weekday: 'long' })
const dayMonth = (d: string) => fmt(d, { day: '2-digit', month: 'short' })
const time = (d: string) => fmt(d, { hour: '2-digit', minute: '2-digit', hour12: false })

/** "In 13 days" — the thing you act on. The date itself is underneath. */
function untilLabel(date: string): string {
    const ms = new Date(date).getTime() - Date.now()
    if (ms < 0) return 'Under way'
    const hours = Math.round(ms / 3_600_000)
    if (hours < 1) return 'Within the hour'
    if (hours < 24) return `In ${hours} ${hours === 1 ? 'hour' : 'hours'}`
    const days = Math.round(hours / 24)
    return `In ${days} ${days === 1 ? 'day' : 'days'}`
}
