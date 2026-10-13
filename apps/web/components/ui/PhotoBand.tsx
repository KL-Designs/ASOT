import React from 'react'
import Image, { type StaticImageData } from 'next/image'
import s from '@/styles/shell.module.css'

const LAYOUT = { 1: s.band1, 2: s.band2, 3: s.band3 } as const

/**
 * A band of photographs between two sections of a text page.
 *
 * The About pages and Support are long runs of cards, and a page that is
 * nothing but cards reads as a form. This is the break: one to three
 * photographs across the content width, the first given the most room.
 *
 * The photographs are decoration — they illustrate the unit, not the paragraph
 * beside them — so they carry empty alt text unless a caller says otherwise,
 * rather than a description invented to fill the attribute.
 *
 * Below the tablet breakpoint only the first is shown: three photographs
 * stacked would push the next section a full screen further down the page.
 */
export default function PhotoBand({ images, alt = '' }: {
    images: [StaticImageData] | [StaticImageData, StaticImageData] | [StaticImageData, StaticImageData, StaticImageData]
    alt?: string
}) {
    return (
        <div className={`${s.band} ${LAYOUT[images.length]}`} aria-hidden={alt ? undefined : true}>
            {images.map((image, i) => (
                <figure key={i} className={s.bandCell}>
                    <Image
                        src={image}
                        alt={i === 0 ? alt : ''}
                        fill
                        placeholder='blur'
                        // The widest cell is two thirds of a ~1200px column.
                        sizes='(max-width: 760px) 100vw, 800px'
                        className={s.bandImg}
                    />
                </figure>
            ))}
        </div>
    )
}
