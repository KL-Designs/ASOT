import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import Avatar from '@/components/member/avatar'
import { ensureVisible, hexToRgbTriplet } from '@/lib/discord/color'
import { resolveMilpacProfile } from '@/lib/military/milpac-profile'
import { buildSlugIndex, canonicalSegment, toSlugCandidate } from '@/lib/military/milpac-slug'
import { parseLoadout } from '@/lib/loadout/parse'
import { summariseLoadout, type KitSummary } from '@/lib/loadout/summary'
import { resolveItemName } from '@/lib/loadout/names'
import { iconFor } from '@/lib/loadout/classify'
import { LoadoutIcon } from '@/components/loadout/icons'
import { KitIcon, UiIcon } from '@/components/loadout/kit-icons'
import { kitIcon } from '@/lib/loadout/kit-icons'
import type { KitIconKey } from '@/lib/loadout/kit-icons'
import { CopyKitButton } from './copy-kit'

import s from '../../milpacs/[username]/profile.module.css'
import k from './kits.module.css'

/**
 * Every kit the unit has shared, on one shelf.
 *
 * A server component for the same reason the milpac's kit panel is one:
 * `resolveItemName` reads a ~2.7MB dictionary that must never reach the
 * browser. Only the resolved strings are sent — plus each kit's `raw` export,
 * which is the point of the page and is only ever loaded for kits their owner
 * switched sharing on for.
 *
 * The page borrows the milpac's design system wholesale (`profile.module.css`)
 * rather than restating it; see `kits.module.css` for what is new here.
 */

export const metadata: Metadata = {
    title: 'Kits | Australian Special Operations Taskforce',
    description: 'Loadouts shared by members of the Australian Special Operations Taskforce — copy one straight into ACE arsenal.',
}

/** The unit red, for the page chrome. Each card overrides it with its owner's. */
const UNIT_ACCENT = '#db001d'

type Card = {
    id: string
    name: string
    description: string
    icon: KitIconKey
    raw: string
    updatedAt: Date
    summary: KitSummary
    owner: { id: string; avatarURL: string; label: string; path: Route; accent: string }
}

export default async function Page() {
    await connection()

    const [shared, members] = await Promise.all([
        Db.loadouts.find({ shared: true }).sort({ updatedAt: -1 }).toArray(),
        client.fetchAllMembers(),
    ])

    // Built once for the whole page — a name slug can only be judged a claim
    // against the full roster, never against one member in isolation.
    const slugIndex = buildSlugIndex(members.map(toSlugCandidate))
    const byId = new Map(members.map(m => [m.id, m]))

    const cards: Card[] = []
    for (const doc of shared) {
        const member = byId.get(doc.userId)
        // An orphan kit (owner left the roster, or a skeleton import) has no
        // profile to link to and no name to sign it with.
        if (!member) continue

        // One unparseable row must not take down everyone else's shelf.
        let summary: KitSummary
        try {
            summary = summariseLoadout(parseLoadout(doc.raw))
        } catch (err) {
            console.error('[kits] skipping unparseable shared loadout', doc._id, err)
            continue
        }

        const { name, rankAbbr, accent } = resolveMilpacProfile(member, null)
        cards.push({
            id: String(doc._id),
            name: doc.name,
            description: doc.description ?? '',
            icon: kitIcon(doc.icon),
            raw: doc.raw,
            updatedAt: doc.updatedAt,
            summary,
            owner: {
                id: member.id,
                avatarURL: member.avatarURL,
                label: [rankAbbr, name].filter(Boolean).join(' '),
                path: `/milpacs/${canonicalSegment(member, slugIndex)}` as Route,
                accent: ensureVisible(accent),
            },
        })
    }

    return (
        <div
            className={s.shell}
            style={{
                ['--acc' as string]: UNIT_ACCENT,
                ['--acc-rgb' as string]: hexToRgbTriplet(UNIT_ACCENT),
            }}
        >
            <div className={s.topbar}>
                <Link href='/milpacs' className={s.btn}>← Milpacs</Link>
                <span className={s.crumb}>COMMUNITY / KITS</span>
            </div>

            <header className={k.head}>
                <h1 className={k.headTitle}>Shared Kits</h1>
                <div className={k.headRule} />
                <p className={k.headNote}>
                    Kits members have chosen to share with the unit. Copy one and paste it into
                    ACE arsenal&apos;s <strong>Import</strong> box to load it in game. Your own kits
                    live on your milpac — import them there, then switch sharing on for any you want
                    to appear here.
                </p>
            </header>

            {cards.length === 0
                ? (
                    <p className={k.none}>
                        <strong>Nothing shared yet</strong>
                        No member has switched sharing on for a kit.<br />
                        Import one on your milpac and share it to start the shelf.
                    </p>
                )
                : (
                    <div className={k.grid}>
                        {cards.map((card, i) => (
                            <article
                                key={card.id}
                                // Capped at eight so the last card in a long shelf is not
                                // still waiting to appear seconds after the first.
                                className={`${s.panel} ${s.rise} ${k.card}`}
                                style={{
                                    animationDelay: `${Math.min(i, 8) * 0.045}s`,
                                    ['--acc' as string]: card.owner.accent,
                                    ['--acc-rgb' as string]: hexToRgbTriplet(card.owner.accent),
                                }}
                            >
                                <header className={k.cardHead}>
                                    <div className={k.cardAvatar}>
                                        <Avatar user={{ id: card.owner.id, avatarURL: card.owner.avatarURL }} />
                                    </div>
                                    <div className={k.cardWho}>
                                        {/* The whole card is not one link: the footer holds a
                                            copy button, and a button inside a link is invalid. */}
                                        <Link
                                            href={`${card.owner.path}?tab=kits&kit=${card.id}` as Route}
                                            className={k.cardName}
                                        >
                                            <KitIcon icon={card.icon} size={15} />
                                            {card.name}
                                        </Link>
                                        <span className={k.cardOwner}>{card.owner.label}</span>
                                    </div>
                                </header>

                                <div className={k.cardMain}>
                                    {/* The owner's own line on the kit, when they wrote
                                        one — it says what a list of item names cannot. */}
                                    {card.description && <p className={k.cardBlurb}>{card.description}</p>}

                                    {card.summary.primary
                                        ? (
                                            <div>
                                                <div className={k.cardWeapon}>
                                                    <LoadoutIcon icon={iconFor(card.summary.primary.className, 'primary')} size={18} />
                                                    <span className={k.cardWeaponName}>
                                                        {resolveItemName(card.summary.primary.className)}
                                                    </span>
                                                </div>
                                                {card.summary.primary.attachments.length > 0 && (
                                                    <div className={k.cardAtt} style={{ marginTop: 8 }}>
                                                        {card.summary.primary.attachments.map(a => (
                                                            <span key={a} className={k.cardAttItem}>
                                                                <LoadoutIcon icon={iconFor(a)} size={12} />
                                                                {resolveItemName(a)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                        : <div className={s.empty}>No primary weapon</div>}

                                    <ul className={k.gear}>
                                        <Gear label='Head' slot='headgear' cls={card.summary.headgear} />
                                        <Gear label='Uniform' slot='uniform' cls={card.summary.uniform} />
                                        <Gear label='Vest' slot='vest' cls={card.summary.vest} />
                                        <Gear label='Pack' slot='backpack' cls={card.summary.backpack} />
                                    </ul>
                                </div>

                                <footer className={k.cardFoot}>
                                    <span className={k.cardCount}>{card.summary.itemCount} items</span>
                                    <Link
                                        href={`${card.owner.path}?tab=kits&kit=${card.id}` as Route}
                                        className={s.btn}
                                    >
                                        <UiIcon icon='open' />View
                                    </Link>
                                    <CopyKitButton raw={card.raw} name={card.name} />
                                </footer>
                            </article>
                        ))}
                    </div>
                )}

            <div className={s.foot}>
                <span>Unclassified // For unit use only</span>
                <span>{cards.length} shared</span>
            </div>
        </div>
    )
}

/** One worn/carried line. Empty slots still render — what a member chose not to
 *  take is part of the shape of a kit, and a missing row would misalign the grid. */
function Gear({ label, slot, cls }: { label: string; slot: Parameters<typeof iconFor>[1]; cls: string | null }) {
    return (
        <li className={k.gearRow}>
            <LoadoutIcon icon={iconFor(cls ?? '', slot)} size={15} />
            <span className={k.gearLabel}>{label}</span>
            <span className={k.gearName}>{cls ? resolveItemName(cls) : '—'}</span>
        </li>
    )
}
