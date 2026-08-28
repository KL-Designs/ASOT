'use client'

import s from './board.module.css'

/**
 * What the board looks like before its data arrives.
 *
 * Four grey rectangles told you a page was loading; they did not tell you
 * *which* page, and when the board landed the whole layout jumped. This is the
 * board's own skeleton instead — the same bars, the same gutters, the same
 * one-third / one-third / two-thirds platoon columns and the same docked pool
 * rail — so the shape on screen at 200ms is the shape at 800ms and only the
 * content changes.
 *
 * The row counts are fixed and roughly ORBAT-sized rather than random: a
 * skeleton that reshuffles on every mount draws attention to itself, which is
 * the opposite of the job.
 */

/** Positions per section card, per column. Sized like a real ORBAT so the
 * skeleton occupies about the height the board will. */
const TOP_ROW = [5, 6]
const COLUMNS: number[][][] = [
    [[4, 8, 8, 8]],              // 1-1 Platoon — one stack
    [[4, 8, 8, 8]],              // 1-2 Platoon — one stack
    [[4, 12, 9], [10, 8, 6]],    // 1-3 Support — the wide column, two stacks
]

/** Staggered so the shimmer reads as one wave crossing the board rather than
 * every box pulsing in lockstep. Reduced motion drops the animation entirely
 * (see `.skel` in board.module.css), which makes this a no-op there. */
function bar(width: number | string, height: number, delay = 0, radius?: number | string) {
    return (
        <i
            className={s.skel}
            style={{
                display: 'block', width, height, flexShrink: 0,
                borderRadius: radius, animationDelay: `${delay}ms`,
            }}
        />
    )
}

function Card({ rows, delay }: { rows: number; delay: number }) {
    return (
        <div className={s.sec}>
            <div className={s.secHead}>
                {bar(18, 18, delay, 3)}
                {bar('42%', 9, delay)}
                <span style={{ marginLeft: 'auto' }}>{bar(26, 8, delay)}</span>
            </div>
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className={s.slot} style={{ paddingLeft: 10 }}>
                    {/* Role, then the occupant — the order and the widths the
                        real row uses, so nothing shifts sideways on arrival. */}
                    {bar('var(--role-w, 168px)', 8, delay + i * 45)}
                    {bar(18, 18, delay + i * 45, '50%')}
                    {bar(`${34 + ((i * 17) % 30)}%`, 8, delay + i * 45)}
                </div>
            ))}
        </div>
    )
}

function Category({ stacks, delay, wide }: { stacks: number[][]; delay: number; wide?: boolean }) {
    let n = 0
    const stack = (rows: number[], key: number) => (
        <div key={key} className={s.stack}>
            {rows.map(r => <Card key={n} rows={r} delay={delay + (n++) * 90} />)}
        </div>
    )

    return (
        <div className={`${s.category} ${wide ? s.categoryWide : ''}`}>
            <div className={s.catHead}>
                {bar(22, 22, delay, 3)}
                {bar(140, 10, delay)}
                <span style={{ marginLeft: 'auto' }}>{bar(56, 9, delay)}</span>
            </div>
            {wide
                ? <div className={s.split}>{stacks.map(stack)}</div>
                : stacks.map(stack)}
        </div>
    )
}

export default function BoardSkeleton({ canManage }: { canManage: boolean }) {
    return (
        <div className={s.root} aria-busy='true' aria-label='Loading the attendance board'>
            <div className={s.top}>
                <div className={s.opName}>
                    {bar(210, 13, 0)}
                    {bar(150, 9, 60)}
                </div>
                {bar(88, 22, 120, 3)}
                {bar(70, 22, 180, 3)}
            </div>

            <div className={s.stats}>
                {[0, 1, 2, 3].map(i => (
                    <div key={i} className={s.stat}>
                        {bar(26, 15, i * 70)}
                        {bar(52, 9, i * 70)}
                    </div>
                ))}
                <div className={s.fillbar}><i className={s.skel} style={{ width: '100%' }} /></div>
            </div>

            {canManage && (
                <div className={s.toolbar}>
                    {bar(104, 22, 0, 3)}
                    {bar(148, 22, 60, 3)}
                </div>
            )}

            <div className={s.board}>
                <div className={s.sections}>
                    <div className={s.topRow}>
                        {TOP_ROW.map((rows, i) => (
                            <Category key={i} stacks={[[rows]]} delay={i * 110} />
                        ))}
                    </div>

                    <div className={s.columns}>
                        {COLUMNS.map((stacks, i) => (
                            <Category
                                key={i}
                                stacks={stacks}
                                delay={220 + i * 110}
                                wide={stacks.length > 1}
                            />
                        ))}
                    </div>
                </div>

                <div className={s.rail} style={{ borderLeft: '1px solid var(--line)' }}>
                    <div className={s.railHead}>
                        <div className={s.railTitle}>{bar(120, 11, 0)}</div>
                        {bar('80%', 8, 60)}
                    </div>
                    <div className={s.pool}>
                        {[0, 1, 2, 3, 4].map(i => (
                            <div key={i} className={s.card}>
                                <div className={s.cardTop}>
                                    {bar(22, 22, i * 80, '50%')}
                                    {bar(`${52 + ((i * 13) % 26)}%`, 9, i * 80)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
