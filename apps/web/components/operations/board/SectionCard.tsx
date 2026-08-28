'use client'

import { useDroppable } from '@dnd-kit/core'
import { AnimatePresence, motion } from 'motion/react'
import type { SlotView } from '@/lib/attendance/roster'
import type { BoardMember } from './useAttendanceBoard'
import SlotRow from './SlotRow'
import AddRole, { type PickableRole } from './AddRole'
import s from './board.module.css'

interface Props {
    title: string
    /** ORBAT category, for scoping the add-role list. */
    category: string
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
    roles: PickableRole[]
    busy: boolean
    onAddRole: (roleId: string) => void
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
    title, category, color, slots, members, nameOf, myUserId, canManage, canClaim,
    onClaim, onMenu, pinged, roles, busy, onAddRole,
}: Props) {
    const { setNodeRef, isOver } = useDroppable({
        id: `section:${title}`,
        data: { sectionTitle: title },
    })

    // Deliberately the same definition as the stats bar: actually playing, not
    // merely pencilled in. Counting occupants here produced "5 / 5 filled" on a
    // section where nobody had replied, on the same screen as a stat bar
    // reading 1 filled overall.
    const filled = slots.filter(x => x.state === 'held' || x.state === 'backfilled').length

    return (
        <div ref={setNodeRef} className={`${s.sec} ${isOver ? s.secOver : ''}`}>
            <div className={s.secHead}>
                {color && <i className={s.secDot} style={{ background: color }} />}
                <b title={title}>{title}</b>
                <span className={s.cnt}>{filled} / {slots.length}</span>
                {canManage && (
                    <AddRole category={category} roles={roles} busy={busy} onPick={onAddRole} />
                )}
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
