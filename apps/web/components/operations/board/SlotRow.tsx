'use client'

import { memo } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { motion } from 'motion/react'
import type { SlotView } from '@/lib/attendance/roster'
import type { BoardMember } from './useAttendanceBoard'
import { Avatar, STATE_CLASS, slotTag } from './parts'
import s from './board.module.css'

interface Props {
    slot: SlotView
    member: BoardMember | undefined
    nameOf: (userId: string) => string
    isMe: boolean
    canManage: boolean
    /** Whether this viewer may take this position right now. */
    canClaim: boolean
    /** Takes the slot id rather than being pre-bound: a `() => onClaim(id)`
     * closure built per row per render would give this memoised component a new
     * prop identity every time and defeat the memo entirely. */
    onClaim: (slotId: string) => void
    onMenu: (slotId: string, e: React.MouseEvent) => void
    /** Somebody else changed this row — play the arrival effect once. */
    pinged: boolean
}

/**
 * Buttons sitting inside the drag surface must not start a drag — by pointer or
 * by keyboard. The row carries dnd-kit's KeyboardSensor listeners, so without
 * the keydown guard pressing Enter on Claim would both claim and pick the row up.
 */
const swallow = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
}

/**
 * One position on the board.
 *
 * **The whole row is the drag handle.** It began as a separate grip, which
 * meant aiming at a 12px target to move somebody — the single most common
 * action on this board. The row is the thing you are moving, so the row is what
 * you pick up; the buttons inside it swallow pointer-down so they still click.
 *
 * The occupant is wrapped in a `layoutId`-tagged element shared with the pool
 * card for the same member, which is what makes a member appear to travel from
 * the rail into the section rather than vanishing from one and appearing in the
 * other. Motion matches the two by id across the whole tree, so nothing here
 * has to know the pool exists.
 */
function SlotRow({
    slot, member, nameOf, isMe, canManage, canClaim, onClaim, onMenu, pinged,
}: Props) {
    const menu = (e: React.MouseEvent) => onMenu(slot.id, e)
    const { setNodeRef: dropRef, isOver } = useDroppable({
        id: `slot:${slot.id}`,
        data: { slotId: slot.id },
    })

    const draggable = canManage && !!slot.occupantUserId
    const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({
        id: `occupant:${slot.occupantUserId ?? slot.id}`,
        disabled: !draggable,
        data: { userId: slot.occupantUserId, fromSlotId: slot.id },
    })

    const occupied = !!slot.occupantUserId
    const tag = slotTag(slot, nameOf, occupied)

    return (
        <div
            ref={node => { dropRef(node); dragRef(node) }}
            className={[
                s.slot,
                STATE_CLASS[slot.state],
                isOver ? s.slotOver : '',
                isMe ? s.mine : '',
                isDragging ? s.dragging : '',
                draggable ? s.draggable : '',
                pinged ? s.ping : '',
            ].filter(Boolean).join(' ')}
            onContextMenu={canManage ? menu : undefined}
            {...(draggable ? listeners : {})}
            {...(draggable ? attributes : {})}
        >
            <span className={s.role} title={slot.role}>{slot.role}</span>

            {/*
              * The name column holds whoever is in the position — or, when it is
              * free and you may take it, the Claim button itself. "Open" is only
              * for a free position you cannot claim: with the button there, the
              * word was a second, quieter way of saying the same thing.
              */}
            <span className={s.who}>
                {member ? (
                    <motion.span
                        layoutId={`member-${member.id}`}
                        layout='position'
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        className={s.whoInner}
                    >
                        <Avatar member={member} />
                        <span className={s.name} title={member.displayName}>{member.displayName}</span>
                    </motion.span>
                ) : canClaim ? (
                    <button
                        type='button'
                        className={s.claim}
                        onClick={() => onClaim(slot.id)}
                        title={`Claim ${slot.role}`}
                        {...swallow}
                    >Claim</button>
                ) : (
                    <span className={s.openLabel}>Open</span>
                )}
            </span>

            {tag && (
                <span
                    className={`${s.tag} ${tag.className} ${occupied ? s.tagClip : ''}`}
                    // Focusable only when clipped: it is the sole way to read the
                    // full label without a pointer, and `title` alone is not
                    // reachable by keyboard.
                    tabIndex={occupied ? 0 : undefined}
                    title={occupied ? tag.label : undefined}
                    {...(occupied ? swallow : {})}
                >{tag.label}</span>
            )}

            {canManage && (
                <button
                    type='button'
                    className={s.rowMenu}
                    onClick={menu}
                    aria-label={`Options for ${slot.role}`}
                    {...swallow}
                >⋯</button>
            )}
        </div>
    )
}

/**
 * Memoised, and the reason is the board's size: ~100 of these, each carrying a
 * dnd-kit droppable, a dnd-kit draggable and a motion projection node. Without
 * this, anything that re-rendered the board at all — a peer joining, the live
 * pill flipping, a notice appearing — re-rendered and re-measured every one of
 * them, which is what the profiler showed as a repeating long task.
 */
export default memo(SlotRow)
