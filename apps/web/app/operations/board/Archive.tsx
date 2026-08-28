'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import {
    countOperations, groupOperations, monthKey,
    type BoardGroup, type BoardMission, type BoardOperation,
} from '@/lib/operations/board'
import { platoonShortLabel } from '@/lib/orbat/constants'
import type { BoardData } from './useBoard'
import s from './board.module.css'

interface Props {
    data: BoardData
    paging: boolean
    onLoadMore: () => void
}

/**
 * Everything we have flown, grouped the way we actually ran it.
 *
 * A campaign is a bracket and its numbered missions are the rows, each with its
 * Saturday and Sunday as two slots. That is a straight halving of the row count
 * for a campaign — "Lost Army" was eight rows repeating its own name eight
 * times — and it is the only view that can show a night that *didn't* run.
 *
 * Grouping happens over everything loaded so far rather than per page, so a
 * campaign straddling a page boundary is still one bracket.
 */
export default function Archive({ data, paging, onLoadMore }: Props) {
    const months = useMemo(() => {
        const groups = groupOperations(data.past, data.campaigns, data.missions)

        // Month headings come from the group's earliest operation, so a campaign
        // sits under the month it started rather than being cut in half to make
        // the headings tidy.
        const out: { key: string; groups: BoardGroup[]; count: number }[] = []
        for (const group of groups) {
            const key = monthKey(group.kind === 'solo' ? group.operation.date : group.from)
            const last = out[out.length - 1]
            if (last && last.key === key) {
                last.groups.push(group)
                last.count += countOperations(group)
            } else {
                out.push({ key, groups: [group], count: countOperations(group) })
            }
        }
        return out
    }, [data.past, data.campaigns, data.missions])

    const remaining = data.total - data.past.length

    if (data.past.length === 0) {
        return (
            <div className={s.empty}>
                <b>Nothing matches</b>
                <span>No operation fits these filters. Try clearing one.</span>
            </div>
        )
    }

    return (
        <>
            {months.map(month => (
                <div key={month.key}>
                    <h3 className={s.month}>
                        {monthHeading(month.key)}
                        <em>· {month.count} {month.count === 1 ? 'operation' : 'operations'}</em>
                    </h3>
                    {month.groups.map(group => (
                        group.kind === 'campaign'
                            ? <Campaign key={group.id + month.key} group={group} />
                            : <Solo key={group.operation.id} op={group.operation} />
                    ))}
                </div>
            ))}

            {remaining > 0 && (
                <button type='button' className={s.more} disabled={paging} onClick={onLoadMore}>
                    {paging ? 'Loading…' : `Load ${Math.min(data.pageSize, remaining)} more · ${remaining} remaining`}
                </button>
            )}
        </>
    )
}

function Campaign({ group }: { group: BoardGroup & { kind: 'campaign' } }) {
    const nights = group.missions.reduce(
        (n, m) => n + (m.saturday ? 1 : 0) + (m.sunday ? 1 : 0) + m.other.length, 0)

    return (
        <div>
            <div className={s.campHead}>
                <span className={`${s.badge} ${s.bCamp}`}>Campaign</span>
                <b>{group.name}</b>
                <span className={s.label}>
                    {dayMonth(group.from)} → {dayMonth(group.to)} · {group.missions.length} missions · {nights} nights
                </span>
            </div>
            <div className={s.missions}>
                {group.missions.map(m => <Mission key={m.key} mission={m} />)}
            </div>
        </div>
    )
}

function Mission({ mission }: { mission: BoardMission }) {
    const nights = [mission.saturday, mission.sunday, ...mission.other].filter(Boolean) as BoardOperation[]
    const wasOn = nights.filter(n => n.mine?.confirmed).length

    return (
        <div className={s.mission}>
            <span className={s.seq}>{mission.label}</span>
            <span className={s.missionName} title={mission.name}>{mission.name}</span>

            <Slot op={mission.saturday} day='Sat' />
            <Slot op={mission.sunday} day='Sun' />

            {wasOn > 0 ? (
                <span className={`${s.badge} ${s.bGood}`}>
                    {wasOn === nights.length && nights.length > 1 ? 'You were on both' : 'You were there'}
                </span>
            ) : (
                <span className={`${s.badge} ${s.bDone}`}>Complete</span>
            )}
        </div>
    )
}

/**
 * One night. An empty slot is drawn rather than skipped: a mission that ran on
 * Sunday only is a fact about the campaign, and a flat list can only express it
 * by saying nothing at all.
 */
function Slot({ op, day }: { op: BoardOperation | null; day: 'Sat' | 'Sun' }) {
    if (!op) {
        return (
            <span className={`${s.slot} ${s.slotEmpty}`}>
                <b>No {day === 'Sat' ? 'Saturday' : 'Sunday'}</b>
            </span>
        )
    }
    return (
        <Link href={`/operations/${op.id}`} className={s.slot}>
            <b>{weekday(op.date)} {dayMonth(op.date)}</b>
            <span className={`${s.turn} ${op.mine?.confirmed ? s.wasThere : ''}`}>{op.turnout || '—'}</span>
        </Link>
    )
}

function Solo({ op }: { op: BoardOperation }) {
    return (
        <Link href={`/operations/${op.id}`} className={s.solo}>
            <span className={`${s.badge} ${op.mine?.confirmed ? s.bGood : s.bDone}`}>
                {op.mine?.confirmed ? 'You were there' : 'Complete'}
            </span>
            <b>{op.title}</b>
            <span className={s.when}>
                {weekday(op.date)} {dayMonth(op.date)}
                {op.terrain ? ` · ${op.terrain}` : ''}
                {op.turnout ? ` · ${op.turnout} turned out` : ''}
            </span>
            <span className={s.right}>
                {op.units.map(u => <span key={u} className={s.unit}>{platoonShortLabel(u)}</span>)}
            </span>
        </Link>
    )
}

// ── Dates ─────────────────────────────────────────────────────────────────────

const weekday = (d: string) => new Date(d).toLocaleString('en-AU', { weekday: 'short' })
const dayMonth = (d: string) => new Date(d).toLocaleString('en-AU', { day: '2-digit', month: 'short' })

function monthHeading(key: string): string {
    const [y, m] = key.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
