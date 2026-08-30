import React from 'react'
import Link from 'next/link'

import SectionHead from '@/components/ui/SectionHead'
import type { GalleryTile } from '@/lib/landing'
import s from '@/styles/landing.module.css'

/**
 * Six frames drawn at random from the gallery's featured rotation
 * (`lib/landing.ts`'s `getGalleryTiles`, reading `gallery_media` where
 * `featuredOrder` is set).
 *
 * Featured is the curated shelf — the J5 media team put images there
 * deliberately, through the console's Featured tab — so it is a better
 * source for the home page than the newest files in the content tree, which
 * are simply whatever was uploaded last. Re-shuffled per request, so the
 * strip is different on a return visit.
 *
 * The caption is the media's own caption, or its operation label when it has
 * no caption — `tile.caption` can still be an empty string for an item that
 * carries neither, which just renders as a blank label rather than inventing
 * one.
 */

/*
 * A 4-column mosaic that closes exactly on six tiles:
 *   row 1  [ ---- 0 ---- ][ -- 1 -- ]
 *   row 2  [ ---- 0 ---- ][ -- 2 -- ]
 *   row 3  [ 3 ][ 4 ][ ----- 5 ---- ]
 * Tile 0 is 2x2, tiles 1/2/5 are double-width, 3 and 4 are single. Drop any of
 * the spans and the last row leaves a hole.
 */
const SPANS = [s.g1, s.g2, s.g3, undefined, undefined, s.g6]

export default function GalleryStrip({ tiles }: { tiles: GalleryTile[] }) {
    if (tiles.length === 0) return null

    return (
        <section className={s.sec} id='gallery'>
            <div className={s.inner}>
                <SectionHead
                    kicker='Media team'
                    title='From the field'
                    more={{ href: '/gallery', label: 'Full gallery' }}
                />

                <div className={s.gal}>
                    {tiles.map((tile, i) => (
                        <Link key={tile.src} href='/gallery' className={SPANS[i] ?? ''}>
                            <img src={tile.src} alt='' loading='lazy' />
                            <span className={s.cap}>{tile.caption}</span>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    )
}
