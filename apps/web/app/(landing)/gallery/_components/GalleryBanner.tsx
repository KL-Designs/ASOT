import React from 'react'
import Image from 'next/image'

import { StarIcon } from './icons'
import type { ArchiveStats } from '../gallery-data'
import s from '@/styles/gallery.module.css'
import Banner from '@/public/images/home/adf_peaking3.png'

/**
 * The page header.
 *
 * Half the height of the one it replaces, which was ~300px of screenshot with
 * the word GALLERY centred on it and nothing else. This one carries the
 * archive's own figures and promotes the screenshot of the month into the
 * header — a monthly winner buried below the fold is not being awarded much.
 */
export default function GalleryBanner({ stats, sotm, onOpenSotm }: {
    stats: ArchiveStats
    sotm: ScreenshotOfMonth | null
    onOpenSotm: () => void
}) {
    const month = sotm
        ? new Date(sotm.dateTaken).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
        : null

    return (
        <section className={s.banner}>
            <div className={s.bannerBg}>
                <Image src={Banner} alt='' fill placeholder='blur' priority style={{ objectFit: 'cover' }} />
            </div>
            <div className={s.bannerVeil} />

            <div className={`${s.bannerIn} ${sotm ? '' : s.bannerSolo}`}>
                <div>
                    <div className={s.crumb}><b>ASOT</b> / Gallery</div>
                    <h1 className={s.bTitle}>Gallery</h1>
                    <p className={s.bLede}>
                        Every operation the unit has run, as it was shot at the time. Filter by
                        year, operation or mission, or search across the lot.
                    </p>

                    {/* Counted from the archive itself rather than typed in, so
                        they cannot drift from what the page is showing. */}
                    <div className={s.bstats}>
                        <div>
                            <div className={s.n}>{stats.photographs.toLocaleString('en-AU')}</div>
                            <div className={s.l}>Photographs</div>
                        </div>
                        <div>
                            <div className={s.n}>{stats.operations.toLocaleString('en-AU')}</div>
                            <div className={s.l}>Operations</div>
                        </div>
                        <div>
                            <div className={s.n}>{stats.missions.toLocaleString('en-AU')}</div>
                            <div className={s.l}>Missions</div>
                        </div>
                        {stats.earliest && (
                            <div>
                                <div className={s.n}>{stats.earliest}</div>
                                <div className={s.l}>Earliest</div>
                            </div>
                        )}
                    </div>
                </div>

                {sotm && (
                    <aside className={s.sotm}>
                        <div className={s.sotmH}>
                            <StarIcon /> Screenshot of the month
                            {month && <span className={s.m}>{month}</span>}
                        </div>

                        <button type='button' className={s.sotmImg} onClick={onOpenSotm} aria-label='Open screenshot of the month'>
                            <img src='/api/gallery/sotm/image' alt='' />
                        </button>

                        <div className={s.sotmB}>
                            {/* Nothing stores a title for it, so the operation is
                                the heading when there is one and the credit
                                carries the rest. Inventing a caption here would
                                be putting words in the photographer's mouth. */}
                            <div className={s.sotmT}>{sotm.operationTitle || 'This month'}</div>
                            <div className={s.sotmBy}>By <b>{sotm.credit}</b></div>
                        </div>
                    </aside>
                )}
            </div>
        </section>
    )
}
