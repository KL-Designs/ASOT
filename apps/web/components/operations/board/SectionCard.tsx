'use client'

import { useDroppable } from '@dnd-kit/core'
import { AnimatePresence, motion } from 'motion/react'
import type { SlotView } from '@/lib/attendance/roster'
import type { BoardMember } from './useAttendanceBoard'
import SlotRow from './SlotRow'
import s from './board.module.css'

interface Props {
    title: string
    color?: string
    slots: SlotView[]
    members: Record<string, BoardMember>
    nameOf: (userId: string) => string
    myUserId: string | null
    canManage: boolean
    canClaim: boolean
    onClaim: (slotId: string) => void
    onMenu: (slotId: string, e: React.MouseEvent) => void
    pinged: Set<string>
}

/**
 * One section and its positions.
 *
 * The section itself is a drop target as well as each row, so staff can aim at
 * a section and let it find the first free position rather than having to hit
 * a 30px row. The count in the header is filled-over-total, which is the number
 * a section leader actually wants.
 */
export default function SectionCard({
    title, color, slots, members, nameOf, myUserId, canManage, canClaim, onClaim, onMenu, pinged,
}: Props) {
    const { setNodeRef, isOver } = useDroppable({
        id: `section:${title}`,
        data: { sectionTitle: title },
    })

    const filled = slots.filter(x => x.occupantUserId).length

    return (
        <div ref={setNodeRef} className={`${s.sec} ${isOver ? s.secOver : ''}`}>
            <div className={s.secHead}>
                {color && <i className={s.secDot} style={{ background: color }} />}
                <b title={title}>{title}</b>
                <span className={s.cnt}>{filled} / {slots.length}</span>
            </div>

            <AnimatePresence initial={false}>
                {slots.map(slot => (
                    <motion.div
                        key={slot.id}
                        layout='position'
                        initial={false}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ type: 'spring', stiffness: 460, damping: 38 }}
                    >
                        <SlotRow
                            slot={slot}
                            member={slot.occupantUserId ? members[slot.occupantUserId] : undefined}
                            nameOf={nameOf}
                            isMe={!!myUserId && slot.occupantUserId === myUserId}
                            canManage={canManage}
                            canClaim={canClaim && slot.available}
                            onClaim={() => onClaim(slot.id)}
                            onMenu={e => onMenu(slot.id, e)}
                            pinged={pinged.has(slot.id)}
                        />
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    )
}
