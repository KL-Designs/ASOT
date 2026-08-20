import React from 'react'
import Image, { StaticImageData } from 'next/image'

import Topo from '@/components/ui/Topo'
import { bannerHeightValue, type BannerHeight } from '@/lib/shell/masthead'
import s from '@/styles/shell.module.css'

/**
 * The public page masthead: a photo band carrying the landing hero's two-pass
 * veil and drifting topo, with the title, kicker and lede in the left column
 * and an optional aside in the right.
 *
 * It replaces a 60vh centred banner that put a photograph and one word above
 * the fold on six of the ten pages that share this shell.
 */
export default function Masthead({
    title,
    kicker,
    lede,
    background,
    backgroundUrl,
    bannerHeight,
    aside,
}: {
    title: string
    kicker?: string
    lede?: string
    background?: StaticImageData
    backgroundUrl?: string
    bannerHeight?: BannerHeight
    aside?: React.ReactNode
}) {
    // Long titles wrap to two lines at the full display size and swamp the
    // band. The threshold is where "Rules & Expectations" (20) sits.
    const isLongTitle = title.length > 18

    return (
        <header
            className={s.band}
            style={{ '--band-h': bannerHeightValue(bannerHeight) } as React.CSSProperties}
        >
            <div className={s.bandImg}>
                {backgroundUrl
                    ? <img src={backgroundUrl} alt='' aria-hidden='true' />
                    : background
                        ? <Image src={background} alt='' fill priority placeholder='blur' style={{ objectFit: 'cover' }} />
                        : null}
            </div>

            {/* The topo's mask shares its stops with the veil's vignette. */}
            <Topo opacity={0.05} driftSeconds={900} mask='edges' />
            <div className={s.veil} />

            <div className={`${s.bandIn} ${aside ? '' : s.bandInSolo}`}>
                <div>
                    {kicker && <div className={s.kick}>{kicker}</div>}
                    <h1 className={`${s.title} ${isLongTitle ? s.titleLong : ''}`}>{title}</h1>
                    {lede && <p className={s.lede}>{lede}</p>}
                </div>
                {aside}
            </div>
        </header>
    )
}
