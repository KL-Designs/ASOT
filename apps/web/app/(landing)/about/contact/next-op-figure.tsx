'use client'

import { useEffect, useState } from 'react'
import { formatUntil } from '@/lib/contact/countdown'

/**
 * The countdown tile's figure.
 *
 * The server renders one value and hands it over as `initial`, which is also
 * this component's first state — so the server HTML and the first client render
 * are identical and there is no hydration mismatch to dodge. `Countdown` in
 * components/ui solves the same problem by rendering an empty box until it
 * mounts, which is right for a four-cell clock and wrong for the largest number
 * on the panel: it would pop in.
 *
 * Thirty seconds, matching the navbar rail. The figure loses its minutes past
 * the first day anyway, so a faster tick would repaint the same string.
 */
export default function NextOpFigure({ target, initial }: {
    target: string
    initial: string
}) {
    const [figure, setFigure] = useState(initial)

    useEffect(() => {
        const tick = () => setFigure(formatUntil(target, Date.now()) ?? initial)
        tick()
        const id = setInterval(tick, 30_000)
        return () => clearInterval(id)
    }, [target, initial])

    return <>{figure}</>
}
