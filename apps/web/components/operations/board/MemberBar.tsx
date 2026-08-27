'use client'

import { useState } from 'react'
import type { BoardAction } from '@/lib/attendance/actions'
import type { SlotView } from '@/lib/attendance/roster'
import type { BoardMember } from './useAttendanceBoard'
import s from './board.module.css'

interface Props {
    /** Undefined until the viewer has done anything for this operation. */
    me: BoardMember | undefined
    /** The position the viewer currently occupies, if any. */
    mySlot: SlotView | undefined
    /** Every section on the board, for the preference picker. */
    sections: string[]
    /** Every distinct role on the board, likewise. */
    roles: string[]
    rsvpOpen: boolean
    busy: boolean
    run: (action: BoardAction) => void
}

/**
 * The viewer's own controls — where they stand and how to change it.
 *
 * Kept as one bar above the board rather than scattered through it because a
 * member has exactly one position and needs to find it without scanning
 * seventy rows. Claiming happens on the rows themselves, since that is
 * inherently a choice about a specific position; everything else about *your*
 * status belongs here.
 *
 * Once RSVP closes the bar stops offering anything and says why. The route
 * rejects these actions after the window regardless — this is the courtesy
 * half of that, not the enforcement.
 */
export default function MemberBar({ me, mySlot, sections, roles, rsvpOpen, busy, run }: Props) {
    const [picking, setPicking] = useState(false)
    const [section, setSection] = useState('')
    const [role, setRole] = useState('')

    // No record yet is the *normal* state for someone who has not replied —
    // and exactly the person this bar exists for. Absence means "not
    // responded", never "no bar".
    const rsvp = me?.rsvp ?? null
    const preferredSection = me?.preferredSection ?? null
    const preferredRole = me?.preferredRole ?? null

    const select = {
        background: 'var(--s1)',
        border: '1px solid var(--line-2)',
        borderRadius: 'var(--r)',
        color: 'var(--ink)',
        fontFamily: 'var(--mono)',
        fontSize: 10,
        padding: '4px 7px',
        outline: 'none',
        maxWidth: 170,
    } as const

    if (!rsvpOpen) {
        return (
            <div className={s.banner}>
                <span className={s.pill}>Your position</span>
                <span>
                    {mySlot
                        ? <><b>{mySlot.sectionTitle} · {mySlot.role}</b>. RSVP has closed — ask a staff member to change it.</>
                        : <>You have no position for this operation. RSVP has closed — ask a staff member to add you.</>}
                </span>
            </div>
        )
    }

    return (
        <div className={s.banner} style={{ background: 'var(--s1)' }}>
            <span className={s.pill}>Your position</span>

            <span style={{ marginRight: 'auto' }}>
                {mySlot
                    ? <><b>{mySlot.sectionTitle} · {mySlot.role}</b></>
                    : preferredSection || preferredRole
                        ? <>In the pool — prefers <b>{preferredRole || preferredSection}</b></>
                        : rsvp === 'attending'
                            ? <>In the pool, no preference</>
                            : <>Not responded. Claim a position below, or join the pool.</>}
            </span>

            {mySlot && (
                <button type='button' className={s.btn} disabled={busy} onClick={() => run({ action: 'leave' })}>
                    Leave position
                </button>
            )}

            {!picking && (
                <button type='button' className={s.btn} disabled={busy} onClick={() => setPicking(true)}>
                    {mySlot ? 'Move to pool instead' : 'Set a preference'}
                </button>
            )}

            {picking && (
                <>
                    <select style={select} value={section} onChange={e => setSection(e.target.value)}>
                        <option value=''>Any section</option>
                        {sections.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                    <select style={select} value={role} onChange={e => setRole(e.target.value)}>
                        <option value=''>Any role</option>
                        {roles.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                    <button
                        type='button'
                        className={`${s.btn} ${s.btnPrimary}`}
                        disabled={busy}
                        onClick={() => {
                            setPicking(false)
                            run({
                                action: 'prefer',
                                preferredSection: section || null,
                                preferredRole: role || null,
                            })
                        }}
                    >Join pool</button>
                    <button type='button' className={s.btn} onClick={() => setPicking(false)}>Cancel</button>
                </>
            )}
        </div>
    )
}
