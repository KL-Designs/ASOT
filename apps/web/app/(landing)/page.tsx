import React from 'react'

import {
    getFeaturedOp, getOperationsLog, getPlatoonStats,
    getRosterCount, getGalleryTiles, getScreenshotOfMonth,
} from '@/lib/landing'

import Hero from './_components/Hero'
import NextOpCard from './_components/NextOpCard'
import StatReadout from './_components/StatReadout'
import IntelBoard from './_components/IntelBoard'
import WhySection from './_components/WhySection'
import Platoons from './_components/Platoons'
import GalleryStrip from './_components/GalleryStrip'
import EnlistBand from './_components/EnlistBand'

import s from '@/styles/landing.module.css'

/**
 * The public home page.
 *
 * A server component: every figure on the page comes out of Mongo through
 * `lib/landing`, so it renders complete rather than filling in after mount.
 * Only the pieces that genuinely need the browser are client components — the
 * hero (which hosts the minigame) and the countdown inside the operation card.
 *
 * The page leads with what is happening next. The version it replaces was an
 * about page: it explained who we are four separate times and never told a
 * returning member anything actionable.
 */

// Operation status, sign-on counts and the roster all move between requests.
export const dynamic = 'force-dynamic'

export default async function Page() {
    const [sotm, featured, log, platoons, roster, tiles] = await Promise.all([
        getScreenshotOfMonth(),
        getFeaturedOp(),
        getOperationsLog(6),
        getPlatoonStats(),
        getRosterCount(),
        getGalleryTiles(6),
    ])

    return (
        <div className={s.page}>
            <Hero
                sotm={sotm}
                roster={roster}
                opCard={featured ? <NextOpCard op={featured} /> : null}
            />

            <StatReadout roster={roster} />

            <IntelBoard featured={featured} log={log} />
            <WhySection roster={roster} />
            <Platoons stats={platoons} />
            <GalleryStrip tiles={tiles} />
            <EnlistBand />
        </div>
    )
}
