'use client'

import { useDraggable, useDroppable } from '@dnd-kit/core'
import { AnimatePresence, motion } from 'motion/react'
import type { PoolEntry } from '@/lib/attendance/roster'
import type { BoardMember } from './useAttendanceBoard'
import { Avatar } from './parts'
import s from './board.module.css'

interface Props {
    pool: PoolEntry[]
    members: Record<string, BoardMember>
    /** slotId → "1-1 Alpha · Section Commander", for the released line. */
    describeSlot: (slotId: string) => string
    myUserId: string | null
    canManage: boolean
    /** Members can no longer place themselves — changes what the rail says. */
    frozen: boolean
}

function PoolCard({
    entry, member, describeSlot, isMe, draggable, frozen,
}: {
    entry: PoolEntry
    member: BoardMember | undefined
    describeSlot: (slotId: string) => string
    isMe: boolean
    draggable: boolean
    frozen: boolean
}) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `pool:${entry.userId}`,
        disabled: !draggable,
        data: { userId: entry.userId, fromSlotId: null },
    })

    const preference = entry.preferredSection && entry.preferredRole
        ? <>Prefers <b>{entry.preferredRole}</b> in <b>{entry.preferredSection}</b></>
        : entry.preferredRole
            ? <>Prefers role <b>{entry.preferredRole}</b></>
            : entry.preferredSection
                ? <>Prefers <b>{entry.preferredSection}</b></>
                : <>Any section, any role</>

    return (
        <div
            ref={setNodeRef}
            className={[
                s.card,
                isMe ? s.cardMine : '',
                frozen ? s.cardLocked : '',
                isDragging ? s.dragging : '',
            ].filter(Boolean).join(' ')}
        >
            <div className={s.cardTop}>
                <motion.span
                    layoutId={`member-${entry.userId}`}
                    layout='position'
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1 }}
                >
                    <Avatar member={member} />
                    <span style={{
                        fontSize: 12, color: 'var(--ink)', minWidth: 0,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{member?.displayName ?? entry.userId}</span>
                </motion.span>
                {draggable && (
                    <span className={s.grip} aria-label='Move member' {...listeners} {...attributes}>⣿</span>
                )}
            </div>

            <div className={s.pref}>{preference}</div>

            {/*
                The dual-identity case, made explicit: a full-timer sitting in
                the pool for another section still owns a position somewhere,
                and their absence is why that section is short. The card names
                what they gave up so nobody has to go looking for it.
            */}
            {entry.releasedSlotId && (
                <div className={s.home}>↗ Released <u>{describeSlot(entry.releasedSlotId)}</u></div>
            )}
        </div>
    )
}

export default function PoolRail({
    pool, members, describeSlot, myUserId, canManage, frozen,
}: Props) {
    const { setNodeRef, isOver } = useDroppable({ id: 'pool', data: { pool: true } })

    return (
        <div className={s.rail} style={{ borderLeft: '1px solid var(--line)' }}>
            <div className={s.railHead}>
                <div className={s.railTitle}>
                    {/* "Pool" is somewhere people opt into; once RSVP shuts it is
                        simply who is left, and the name should stop implying a
                        choice they no longer have. */}
                    <b>{frozen ? 'Available' : 'Reservist Pool'}</b>
                    <span className={s.n}>{pool.length}</span>
                </div>
                <p>
                    {frozen
                        ? 'These members can no longer place themselves. Drag them in, or use auto-fill.'
                        : 'Unplaced members. Drag onto any open position, or let them claim one themselves.'}
                </p>
            </div>

            <div ref={setNodeRef} className={`${s.pool} ${isOver ? s.poolOver : ''}`}>
                <AnimatePresence initial={false}>
                    {pool.map(entry => (
                        <motion.div
                            key={entry.userId}
                            layout='position'
                            initial={false}
                            exit={{ opacity: 0, scale: 0.94 }}
                            transition={{ type: 'spring', stiffness: 460, damping: 38 }}
                        >
                            <PoolCard
                                entry={entry}
                                member={members[entry.userId]}
                                describeSlot={describeSlot}
                                isMe={entry.userId === myUserId}
                                draggable={canManage}
                                frozen={frozen}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>

                {pool.length === 0 && (
                    <p className={s.empty}>
                        {frozen ? 'Everyone available has been placed.' : 'Nobody is waiting for a position.'}
                    </p>
                )}
            </div>
        </div>
    )
}
