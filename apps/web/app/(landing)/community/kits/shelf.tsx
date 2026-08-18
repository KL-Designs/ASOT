'use client'

import { useMemo, useState } from 'react'
import { KIT_TAG_LABELS, type KitTag } from '@/lib/loadout/tags'
import {
    SHELF_SORTS, matchesQuery, matchesTags,
    pageCount, paginate, sortCards, tagCounts, type ShelfSort,
} from '@/lib/loadout/shelf'
import { UiIcon } from '@/components/loadout/kit-icons'
import { KitCard, type CardData } from './kit-card'

import s from '../../milpacs/[username]/profile.module.css'
import k from './kits.module.css'

/**
 * The shelf's controls and grid.
 *
 * Filtering happens here rather than on the server because the page already
 * ships every card — searching over what is in memory costs a keystroke, and
 * searching over the network costs a round-trip per keystroke. Every rule it
 * applies lives in `lib/loadout/shelf.ts`, which is where they are tested;
 * this file is state and markup.
 *
 * That state is not mirrored into the URL, so a filtered shelf is not
 * linkable and `/community/kits` always opens unfiltered. The alternative
 * makes every keystroke a navigation.
 */
export function Shelf({ cards }: { cards: CardData[] }) {
    const [query, setQuery] = useState('')
    const [tags, setTags] = useState<KitTag[]>([])
    const [sort, setSort] = useState<ShelfSort>('newest')
    const [page, setPage] = useState(1)

    // Counted over every card, not the filtered set, so a chip's number does
    // not change as you type — it says how many kits carry the tag, always.
    const chips = useMemo(() => tagCounts(cards), [cards])

    const filtered = useMemo(
        () => sortCards(cards.filter(c => matchesQuery(c, query) && matchesTags(c, tags)), sort),
        [cards, query, tags, sort],
    )

    const pages = pageCount(filtered.length)
    const shown = paginate(filtered, page)

    // Any change to what is being shown returns to the first page — staying on
    // page 4 of a search that now has one page shows an empty shelf.
    const change = <T,>(set: (v: T) => void) => (value: T) => { set(value); setPage(1) }

    const toggleTag = change<KitTag>(tag =>
        setTags(list => list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag]))

    return (
        <>
            <div className={k.controls}>
                <div className={k.search}>
                    <UiIcon icon='search' size={13} />
                    <input
                        type='search'
                        className={k.searchInput}
                        placeholder='Search kits, members, weapons…'
                        aria-label='Search kits'
                        value={query}
                        onChange={e => change(setQuery)(e.target.value)}
                    />
                </div>

                <div className={k.sorts} role='group' aria-label='Sort kits'>
                    {SHELF_SORTS.map(option => (
                        <button
                            key={option.key}
                            type='button'
                            aria-pressed={sort === option.key}
                            className={sort === option.key ? `${k.sort} ${k.sortOn}` : k.sort}
                            onClick={() => change(setSort)(option.key)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            {chips.length > 0 && (
                <div className={k.filters} role='group' aria-label='Filter by tag'>
                    {chips.map(({ tag, count }) => {
                        const on = tags.includes(tag)
                        return (
                            <button
                                key={tag}
                                type='button'
                                aria-pressed={on}
                                className={on ? `${k.filter} ${k.filterOn}` : k.filter}
                                onClick={() => toggleTag(tag)}
                            >
                                {KIT_TAG_LABELS[tag]}<span className={k.filterCount}>{count}</span>
                            </button>
                        )
                    })}
                    {tags.length > 0 && (
                        <button type='button' className={k.filterClear} onClick={() => change(setTags)([])}>
                            <UiIcon icon='close' size={11} />Clear
                        </button>
                    )}
                </div>
            )}

            {shown.length === 0
                ? (
                    <p className={k.none}>
                        <strong>No kits match</strong>
                        Nothing on the shelf fits that search.<br />
                        Try fewer words, or clear the tag filters.
                    </p>
                )
                : (
                    <div className={k.grid}>
                        {shown.map((card, i) => (
                            <KitCard
                                key={card.id}
                                card={card}
                                // Capped at eight so the last card on a full page is not
                                // still waiting to appear seconds after the first.
                                delay={`${Math.min(i, 8) * 0.045}s`}
                            />
                        ))}
                    </div>
                )}

            {pages > 1 && (
                <nav className={k.pager} aria-label='Kit pages'>
                    <button type='button' className={k.pageBtn} disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}>
                        <UiIcon icon='prev' size={11} />Prev
                    </button>
                    {Array.from({ length: pages }, (_, i) => i + 1).map(n => (
                        <button
                            key={n}
                            type='button'
                            aria-current={n === page ? 'page' : undefined}
                            className={n === page ? `${k.pageBtn} ${k.pageBtnOn}` : k.pageBtn}
                            onClick={() => setPage(n)}
                        >
                            {n}
                        </button>
                    ))}
                    <button type='button' className={k.pageBtn} disabled={page >= pages}
                        onClick={() => setPage(p => p + 1)}>
                        Next<UiIcon icon='next' size={11} />
                    </button>
                </nav>
            )}

            <div className={s.foot}>
                <span>Unclassified // For unit use only</span>
                <span>
                    {filtered.length === cards.length
                        ? `${cards.length} shared`
                        : `${filtered.length} of ${cards.length} shared`}
                    {pages > 1 && ` · page ${Math.min(page, pages)} of ${pages}`}
                </span>
            </div>
        </>
    )
}
