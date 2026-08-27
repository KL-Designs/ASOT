'use client'

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
    onClaim: () => void
    onMenu: (e: React.MouseEvent) => void
    /** Somebody else changed this row — play the arrival effect once. */
    pinged: boolean
}

/**
 * One position on the board.
 *
 * The occupant is wrapped in a `layoutId`-tagged element shared with the pool
 * card for the same member, which is what makes a member appear to travel from
 * the rail into the section rather than vanishing from one and appearing in
 * the other. Motion matches the two by id across the whole tree, so nothing
 * here has to know the pool exists.
 */
export default function SlotRow({
    slot, member, nameOf, isMe, canManage, canClaim, onClaim, onMenu, pinged,
}: Props) {
    const { setNodeRef: dropRef, isOver } = useDroppable({
        id: `slot:${slot.id}`,
        data: { slotId: slot.id },
    })

    const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({
        id: `occupant:${slot.occupantUserId ?? slot.id}`,
        disabled: !canManage || !slot.occupantUserId,
        data: { userId: slot.occupantUserId, fromSlotId: slot.id },
    })

    const tag = slotTag(slot, nameOf)

    return (
        <div
            ref={dropRef}
            className={[
                s.slot,
                STATE_CLASS[slot.state],
                isOver ? s.slotOver : '',
                isMe ? s.mine : '',
                isDragging ? s.dragging : '',
                pinged ? s.ping : '',
            ].filter(Boolean).join(' ')}
            onContextMenu={canManage ? onMenu : undefined}
        >
            {canManage && slot.occupantUserId && (
                <span
                    ref={dragRef}
                    className={s.grip}
                    aria-label={`Move ${member?.displayName ?? 'member'}`}
                    {...listeners}
                    {...attributes}
                >⣿</span>
            )}

            <span className={s.role} title={slot.role}>{slot.role}</span>

            <span className={s.who}>
                {member ? (
                    <motion.span
                        layoutId={`member-${member.id}`}
                        layout='position'
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}
                    >
                        <Avatar member={member} />
                        <span
                            style={{
                                fontSize: 12,
                                color: 'var(--ink)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >{member.displayName}</span>
                    </motion.span>
                ) : (
                    <span>Open</span>
                )}
            </span>

            {tag && <span className={`${s.tag} ${tag.className}`}>{tag.label}</span>}

            {canClaim && !slot.occupantUserId && (
                <button type='button' className={s.claim} onClick={onClaim}>Claim</button>
            )}

            {canManage && (
                <button
                    type='button'
                    className={s.claim}
                    style={{ opacity: undefined }}
                    onClick={onMenu}
                    aria-label={`Options for ${slot.role}`}
                >⋯</button>
            )}
        </div>
    )
}
