import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { ensureVisible, hexToRgbTriplet } from '@/lib/discord/color'
import { resolveMilpacProfile } from '@/lib/military/milpac-profile'
import { buildSlugIndex, canonicalSegment, toSlugCandidate } from '@/lib/military/milpac-slug'
import { parseLoadout } from '@/lib/loadout/parse'
import { summariseLoadout, type KitSummary } from '@/lib/loadout/summary'
import { resolveItemName } from '@/lib/loadout/names'
import { iconFor } from '@/lib/loadout/classify'
import { kitIcon } from '@/lib/loadout/kit-icons'
import { normaliseTags, KIT_TAG_LABELS } from '@/lib/loadout/tags'
import { weightedScore } from '@/lib/loadout/rating'
import { Shelf } from './shelf'
import type { CardData } from './kit-card'

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

    const cards: CardData[] = []
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
        const ownerAccent = ensureVisible(accent)
        const ownerLabel = [rankAbbr, name].filter(Boolean).join(' ')
        const tags = normaliseTags(doc.tags)
        const ratingAvg = doc.ratingAvg ?? 0
        const ratingCount = doc.ratingCount ?? 0

        const primary = summary.primary
            ? {
                name: resolveItemName(summary.primary.className),
                icon: iconFor(summary.primary.className, 'primary'),
                attachments: summary.primary.attachments.map(a => ({
                    name: resolveItemName(a), icon: iconFor(a),
                })),
            }
            : null

        const gear = ([
            ['Head', 'headgear', summary.headgear],
            ['Uniform', 'uniform', summary.uniform],
            ['Vest', 'vest', summary.vest],
            ['Pack', 'backpack', summary.backpack],
        ] as const).map(([label, slot, cls]) => ({
            label,
            icon: iconFor(cls ?? '', slot),
            // Empty slots still render: what a member chose not to take is part
            // of the shape of a kit, and a missing row would misalign the grid.
            name: cls ? resolveItemName(cls) : '—',
        }))

        cards.push({
            id: String(doc._id),
            name: doc.name,
            description: doc.description ?? '',
            icon: kitIcon(doc.icon),
            raw: doc.raw,
            tags,
            // Epoch ms, not a Date — this crosses into a client component.
            updatedAt: doc.updatedAt.getTime(),
            ratingAvg,
            ratingCount,
            ratingScore: weightedScore(ratingAvg, ratingCount),
            copyCount: doc.copyCount ?? 0,
            itemCount: summary.itemCount,
            primary,
            gear,
            owner: {
                id: member.id,
                avatarURL: member.avatarURL,
                label: ownerLabel,
                path: `/milpacs/${canonicalSegment(member, slugIndex)}`,
                accent: ownerAccent,
                accentRgb: hexToRgbTriplet(ownerAccent),
            },
            // Built here because the dictionary that resolves these names must
            // not reach the browser. Lowercased once so the search does not
            // lowercase every card on every keystroke.
            haystack: [
                doc.name,
                doc.description ?? '',
                ownerLabel,
                ...tags.map(t => KIT_TAG_LABELS[t]),
                primary?.name ?? '',
            ].join('|').toLowerCase(),
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
                : <Shelf cards={cards} />}
        </div>
    )
}
