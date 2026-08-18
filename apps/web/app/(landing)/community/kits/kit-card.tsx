'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import Avatar from '@/components/member/avatar'
import { LoadoutIcon } from '@/components/loadout/icons'
import { KitIcon, UiIcon } from '@/components/loadout/kit-icons'
import { TagChips } from '@/components/loadout/tag-chips'
import { Stars } from '@/components/loadout/stars'
import type { IconKey } from '@/lib/loadout/classify'
import type { KitIconKey } from '@/lib/loadout/kit-icons'
import type { ShelfCard } from '@/lib/loadout/shelf'
import { CopyKitButton } from './copy-kit'

import s from '../../milpacs/[username]/profile.module.css'
import k from './kits.module.css'

/**
 * One kit on the shelf.
 *
 * A client component, but every string in it was resolved on the server:
 * `resolveItemName` reads a ~2.7MB dictionary that must never reach the
 * browser, so `page.tsx` resolves names and icon keys and this renders them.
 * `CardData` is therefore all plain, serialisable values — no `Date`, no
 * `ObjectId`.
 */
export type CardData = ShelfCard & {
    description: string
    icon: KitIconKey
    raw: string
    itemCount: number
    primary: { name: string; icon: IconKey; attachments: { name: string; icon: IconKey }[] } | null
    gear: { label: string; icon: IconKey; name: string }[]
    owner: { id: string; avatarURL: string; label: string; path: string; accent: string; accentRgb: string }
}

export function KitCard({ card, delay }: { card: CardData; delay: string }) {
    const href = `${card.owner.path}/kits/${card.id}` as Route
    // Held here rather than inside the button so the footer's number and the
    // button that moves it stay one fact. Seeded from the server and corrected
    // by the copy endpoint's own answer.
    const [copies, setCopies] = useState(card.copyCount)
    return (
        <article
            className={`${s.panel} ${s.rise} ${k.card}`}
            style={{
                animationDelay: delay,
                ['--acc' as string]: card.owner.accent,
                ['--acc-rgb' as string]: card.owner.accentRgb,
            }}
        >
            <header className={k.cardHead}>
                <div className={k.cardAvatar}>
                    <Avatar user={{ id: card.owner.id, avatarURL: card.owner.avatarURL }} />
                </div>
                <div className={k.cardWho}>
                    {/* The whole card is not one link: the footer holds a
                        copy button, and a button inside a link is invalid. */}
                    <Link href={href} className={k.cardName}>
                        <KitIcon icon={card.icon} size={15} />
                        {card.name}
                    </Link>
                    <span className={k.cardOwner}>{card.owner.label}</span>
                </div>
            </header>

            <div className={k.cardMain}>
                <TagChips tags={card.tags} />
                {/* The owner's own line on the kit, when they wrote
                    one — it says what a list of item names cannot. */}
                {card.description && <p className={k.cardBlurb}>{card.description}</p>}

                {card.primary
                    ? (
                        <div>
                            <div className={k.cardWeapon}>
                                <LoadoutIcon icon={card.primary.icon} size={18} />
                                <span className={k.cardWeaponName}>{card.primary.name}</span>
                            </div>
                            {card.primary.attachments.length > 0 && (
                                <div className={k.cardAtt} style={{ marginTop: 8 }}>
                                    {card.primary.attachments.map(a => (
                                        <span key={a.name} className={k.cardAttItem}>
                                            <LoadoutIcon icon={a.icon} size={12} />
                                            {a.name}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                    : <div className={s.empty}>No primary weapon</div>}

                <ul className={k.gear}>
                    {card.gear.map(row => (
                        <li key={row.label} className={k.gearRow}>
                            <LoadoutIcon icon={row.icon} size={15} />
                            <span className={k.gearLabel}>{row.label}</span>
                            <span className={k.gearName}>{row.name}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <div className={k.cardRating}>
                <Stars avg={card.ratingAvg} count={card.ratingCount} />
            </div>

            <footer className={k.cardFoot}>
                {/* One wrapper, not two `.cardCount` spans: that class already
                    carries `margin-right: auto`, and a second one would fight
                    the first for the footer's free space. */}
                <span className={k.cardCount}>
                    {card.itemCount} items
                    <span className={k.cardCopies}>
                        {copies} {copies === 1 ? 'copy' : 'copies'}
                    </span>
                </span>
                <Link href={href} className={s.btn}><UiIcon icon='open' />View</Link>
                <CopyKitButton
                    raw={card.raw}
                    name={card.name}
                    loadoutId={card.id}
                    onCopied={setCopies}
                />
            </footer>
        </article>
    )
}
