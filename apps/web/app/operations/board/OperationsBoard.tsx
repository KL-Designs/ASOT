'use client'

import Archive from './Archive'
import ArchiveFilters from './ArchiveFilters'
import UpcomingBand from './UpcomingBand'
import { useBoard } from './useBoard'
import s from './board.module.css'

/**
 * The public operations board.
 *
 * Two halves with different jobs. The band answers "what am I turning out for",
 * which is what most arrivals want and what the old page buried in a column
 * beside a list. The archive answers "what have we done", and is built for the
 * three hundred-odd operations we have actually run rather than the twenty that
 * fit on a screen.
 *
 * Operations in development appear in neither: nobody can answer one, so it has
 * no business on the page whose job is answering. Staff get a count and a route
 * to the J2 dashboard, and only with the permission.
 */
export default function OperationsBoard() {
    const { filter, data, loading, paging, error, update, clear, loadMore } = useBoard()

    if (loading && !data) return <Skeleton />

    if (error || !data) {
        return (
            <div className={`command ${s.root}`}>
                <div className={s.empty}>
                    <b>Could not load the operations board</b>
                    <span>{error ?? 'Try again in a moment.'}</span>
                </div>
            </div>
        )
    }

    return (
        <div className={`command ${s.root}`}>
            <UpcomingBand
                upcoming={data.upcoming}
                campaigns={data.campaigns}
                missions={data.missions}
                lastFlown={data.lastFlown}
                signedIn={data.signedIn}
                staff={data.staff}
            />

            <section>
                <div className={s.rule}>
                    <span className={s.label}>Operations flown</span>
                    <hr />
                    <span className={s.label}>
                        {data.histogram.length > 0 ? `Since ${firstMonth(data.histogram[0].month)}` : ''}
                    </span>
                </div>

                <ArchiveFilters filter={filter} data={data} update={update} clear={clear} />
                <Archive data={data} paging={paging} onLoadMore={loadMore} />
            </section>
        </div>
    )
}

/**
 * The board's own shape while it loads — the band's cards and a few archive
 * rows, at the sizes they will be, so nothing jumps when the data lands.
 */
function Skeleton() {
    return (
        <div className={`command ${s.root}`} aria-busy='true' aria-label='Loading operations'>
            <section>
                <div className={s.rule}><span className={s.label}>Turning out</span><hr /></div>
                <div className={s.next}>
                    <div className={s.skel} style={{ height: 214 }} />
                    <div className={s.skel} style={{ height: 214 }} />
                </div>
            </section>
            <section>
                <div className={s.rule}><span className={s.label}>Operations flown</span><hr /></div>
                <div className={s.skel} style={{ height: 148, marginBottom: 18 }} />
                {[0, 1, 2].map(i => (
                    <div key={i} className={s.skel} style={{ height: 84, marginBottom: 8 }} />
                ))}
            </section>
        </div>
    )
}

function firstMonth(key: string): string {
    const [y, m] = key.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
