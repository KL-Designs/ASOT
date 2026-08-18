'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { NavStatus } from '@/app/api/nav/status/route'
import { formatCountdown, formatOpTime } from './useNavStatus'
import CursorToggle from './CursorToggle'
import s from '@/styles/navbar.module.css'

/**
 * The 28px rail above the bar — unit identity on the left, next operation in
 * the middle, live presence on the right.
 *
 * Every segment is conditional on its own data. The mockup's fixed "142 ACTIVE
 * / SERVER LIVE" pair is here the filled-ORBAT-slot count and the TeamSpeak
 * online count, because those are the two numbers this site can actually stand
 * behind; a segment whose data is missing is dropped rather than faked.
 *
 * Collapses to zero height on scroll (see `stripHidden`) so the bar gives the
 * space back once you're reading the page.
 */
export default function StatusRail({ status, hidden }: { status: NavStatus | null, hidden: boolean }) {

    // Re-derived on a timer so the countdown doesn't freeze on a page that
    // stays open. Minute resolution, so 30s is comfortably enough.
    const [, setTick] = useState(0)
    useEffect(() => {
        if (!status?.nextOp) return
        const id = setInterval(() => setTick(t => t + 1), 30_000)
        return () => clearInterval(id)
    }, [status?.nextOp])

    const op = status?.nextOp
    const online = status?.teamspeakOnline

    return (
        <div className={`${s.strip} ${hidden ? s.stripHidden : ''}`}>
            <span className={s.hi}>1 Platoon · Infantry</span>
            <span className={s.sep} />

            {op ? (
                <>
                    <span>Next Op</span>
                    <Link href={`/operations/${op.id}` as any} className={s.amb}>
                        {op.title} · {formatOpTime(op.date)}
                    </Link>
                    <span className={s.sep} />
                    <span className={s.amb}>{formatCountdown(op.date)}</span>
                </>
            ) : (
                <span>No operation scheduled</span>
            )}

            <span className={s.right}>
                {status?.roster != null && (
                    <span className={s.rosterCount}>{status.roster} Active</span>
                )}
                {online != null && (
                    <span className={s.presence}>
                        <span className={`${s.pulse} ${online > 0 ? '' : s.pulseIdle}`}><i /><b /></span>
                        {online} on TeamSpeak
                    </span>
                )}
                <CursorToggle />
            </span>
        </div>
    )
}
