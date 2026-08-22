import React from 'react'
import Topo from '@/components/ui/Topo'
import s from '@/styles/landing.module.css'

/**
 * The four-up figure bar under the hero.
 *
 * Only the roster figure is live — the rest are facts about how the unit runs
 * rather than counts, so they are written rather than queried. `—` stands in if
 * the roster lookup fails, which is honest about not knowing.
 */
export default function StatReadout({ roster }: { roster: number | null }) {
    const stats: [React.ReactNode, React.ReactNode][] = [
        [<>50<em>+</em></>, <>Players<br />per operation</>],
        [<>6<em>+</em></>, <>Years<br />active</>],
        [<>2</>, <>Operations<br />per week</>],
        [roster != null ? <>{roster}</> : <>—</>, <>Active<br />members</>],
    ]

    return (
        <div className={s.readout}>
            <Topo opacity={0.045} driftSeconds={900} />
            <div className={s.readoutIn}>
                {stats.map(([n, l], i) => (
                    <div key={i}>
                        <span className={s.n}>{n}</span>
                        <span className={s.l}>{l}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
