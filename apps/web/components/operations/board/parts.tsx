'use client'

import type { SlotState, SlotView } from '@/lib/attendance/roster'
import type { BoardMember } from './useAttendanceBoard'
import s from './board.module.css'

/** Deterministic avatar tint, so a member without a picture is still recognisable. */
const TINTS = ['#7fae5c', '#4f8ca8', '#d4a03a', '#a8b0ba', '#c05a48', '#8d7fae', '#5cae9e']

export function tintFor(userId: string): string {
    let h = 0
    for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
    return TINTS[h % TINTS.length]
}

export function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '??'
    // Names arrive as "CPL Hollis" — the rank is not the identifying half.
    const useful = parts.length > 1 ? parts.slice(1) : parts
    return useful.map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

export function Avatar({ member, className }: { member: BoardMember | undefined; className?: string }) {
    const name = member?.displayName ?? 'Unknown'
    return (
        <span
            className={className ?? s.av}
            style={{ background: member ? tintFor(member.id) : 'var(--line-2)' }}
            aria-hidden
        >
            {member?.avatarURL
                ? <img src={member.avatarURL} alt='' loading='lazy' />
                : initials(name)}
        </span>
    )
}

/**
 * What a slot's badge says, and in which semantic colour.
 *
 * `declined`, `released` and `lapsed` all leave an empty position, and all
 * three name the member who is not in it — that name is the whole reason they
 * are separate states. A section leader chasing people up needs to know
 * whether somebody is not coming at all, is playing elsewhere, or simply never
 * answered, and "Open" for all three throws that away.
 */
export function slotTag(
    slot: SlotView,
    nameOf: (userId: string) => string,
): { label: string; className: string } | null {
    const who = slot.vacatedBy ? nameOf(slot.vacatedBy) : ''
    switch (slot.state) {
        case 'held':       return null
        case 'backfilled': return { label: 'Ressy', className: s.tagGood }
        case 'awaiting':   return { label: 'Awaiting', className: s.tagWarn }
        case 'lapsed':     return { label: who ? `No response · ${who}` : 'No response', className: s.tagWarn }
        case 'declined':   return { label: who ? `Declined · ${who}` : 'Declined', className: s.tagCrit }
        case 'released':   return { label: who ? `Released · ${who}` : 'Released', className: s.tagCrit }
        case 'open':       return null
    }
}

export const STATE_CLASS: Record<SlotState, string> = {
    held: s.held,
    awaiting: s.awaiting,
    lapsed: s.lapsed,
    backfilled: s.backfilled,
    declined: s.declined,
    released: s.released,
    open: s.open,
}

/** Surname only — section cards are narrow and the rank is already implied. */
export function shortName(name: string): string {
    const parts = name.trim().split(/\s+/)
    return parts.length > 1 ? parts.slice(1).join(' ') : name
}
