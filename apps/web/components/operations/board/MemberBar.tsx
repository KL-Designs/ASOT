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
 * The viewer's own controls: are you coming, and where do you want to be.
 *
 * Answering the RSVP is the single most common action anyone takes on this
 * board and the one most people will only ever do once, so it is two large
 * mutually-exclusive buttons that show which one is currently true — not a
 * link among links. It began as small neutral buttons beside everything else,
 * which buried the one decision the whole window exists to collect.
 *
 * Attending and choosing a position stay separate. Saying you will be there is
 * not a statement about which slot you want, and a member who already holds one
 * should not have it moved out from under them for confirming they are coming.
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

    if (!rsvpOpen) {
        return (
            <div className={s.memberBar}>
                <span className={s.pill}>Your position</span>
                <span className={s.memberStatus}>
                    {mySlot
                        ? <><b>{mySlot.sectionTitle} · {mySlot.role}</b> — RSVP has closed, so ask a staff member to change it.</>
                        : rsvp === 'not_attending'
                            ? <>You marked yourself <b>not attending</b>. RSVP has closed.</>
                            : <>You have no position for this operation, and RSVP has closed. Ask a staff member to add you.</>}
                </span>
            </div>
        )
    }

    return (
        <div className={s.memberBar}>
            <div className={s.rsvpGroup} role='group' aria-label='Your RSVP'>
                <button
                    type='button'
                    disabled={busy}
                    aria-pressed={rsvp === 'attending'}
                    className={`${s.rsvpBtn} ${rsvp === 'attending' ? s.rsvpYesOn : ''}`}
                    onClick={() => run({ action: 'attend' })}
                >
                    <svg width='11' height='11' viewBox='0 0 12 12' fill='none' aria-hidden>
                        <path d='M2 6l3 3 5-5' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
                    </svg>
                    Attending
                </button>
                <button
                    type='button'
                    disabled={busy}
                    aria-pressed={rsvp === 'not_attending'}
                    className={`${s.rsvpBtn} ${rsvp === 'not_attending' ? s.rsvpNoOn : ''}`}
                    onClick={() => run({ action: 'decline' })}
                >
                    <svg width='11' height='11' viewBox='0 0 12 12' fill='none' aria-hidden>
                        <path d='M3 3l6 6M9 3l-6 6' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
                    </svg>
                    Not attending
                </button>
            </div>

            <span className={s.memberStatus}>
                {rsvp === 'not_attending'
                    ? <>You are not down for this operation.</>
                    : mySlot
                        ? <>You are in <b>{mySlot.sectionTitle} · {mySlot.role}</b></>
                        : preferredSection || preferredRole
                            ? <>In the pool, hoping for <b>{[preferredRole, preferredSection].filter(Boolean).join(' in ')}</b></>
                            : rsvp === 'attending'
                                ? <>In the pool — claim a position below, or wait to be placed.</>
                                : <>Not answered yet. Claim a position below, or use the buttons.</>}
            </span>

            {mySlot && (
                <button type='button' className={s.btn} disabled={busy} onClick={() => run({ action: 'leave' })}>
                    Leave position
                </button>
            )}

            {!picking ? (
                <button
                    type='button'
                    className={`${s.btn} ${s.btnPrimary} ${s.prefBtn}`}
                    disabled={busy}
                    onClick={() => {
                        setSection(preferredSection ?? '')
                        setRole(preferredRole ?? '')
                        setPicking(true)
                    }}
                >
                    {preferredSection || preferredRole ? 'Change preference' : 'Set a preference'}
                </button>
            ) : (
                <div className={s.prefPicker}>
                    <select className={s.prefSelect} value={section} onChange={e => setSection(e.target.value)}>
                        <option value=''>Any section</option>
                        {sections.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                    <select className={s.prefSelect} value={role} onChange={e => setRole(e.target.value)}>
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
                    >Save</button>
                    <button type='button' className={s.btn} onClick={() => setPicking(false)}>Cancel</button>
                </div>
            )}
        </div>
    )
}
