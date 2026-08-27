'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    DndContext, DragOverlay, PointerSensor, KeyboardSensor,
    useSensor, useSensors, closestCenter,
    type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { LayoutGroup, MotionConfig, useReducedMotion } from 'motion/react'
import { derivePool, viewRoster, type PoolEntry, type SlotView } from '@/lib/attendance/roster'
import { useAttendanceBoard } from './useAttendanceBoard'
import SectionCard from './SectionCard'
import PoolRail from './PoolRail'
import MemberBar from './MemberBar'
import { Avatar } from './parts'
import s from './board.module.css'

interface Props {
    operationId: string
    operationName: string
    /** Formatted date line under the operation name. */
    operationWhen: string
    myUserId: string | null
    canManage: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
    companyHQ: 'India 1-0 HQ',
    platoon11: 'India 1-1 Platoon',
    platoon12: 'India 1-2 Platoon',
    support: 'India 1-3 Support',
    gamemaster: 'Game Masters',
}

interface MenuState { slotId: string; x: number; y: number }

export default function AttendanceBoard({
    operationId, operationName, operationWhen, myUserId, canManage,
}: Props) {
    const { data, loading, connected, peers, fromPeer, error, act } = useAttendanceBoard(operationId)
    const reduced = useReducedMotion()

    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
    const [menu, setMenu] = useState<MenuState | null>(null)
    const [dragging, setDragging] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [pinged, setPinged] = useState<Set<string>>(new Set())
    const [busy, setBusy] = useState(false)

    const rsvpOpen = data?.stage === 'rsvp_open'
    const frozen = !!data && data.stage !== 'preparing' && !rsvpOpen

    // ── Derivation ────────────────────────────────────────────────────────────

    const slots: SlotView[] = useMemo(() => {
        if (!data) return []
        return viewRoster(data.roster, {
            rsvp: Object.fromEntries(Object.values(data.members).map(m => [m.id, m.rsvp])),
            rsvpClosed: frozen,
        })
    }, [data, frozen])

    const pool: PoolEntry[] = useMemo(() => {
        if (!data) return []
        const eligible = Object.values(data.members)
            .filter(m => m.rsvp === 'attending')
            .map(m => ({
                userId: m.id,
                preferredSection: m.preferredSection,
                preferredRole: m.preferredRole,
            }))
        return derivePool(data.roster, eligible)
    }, [data])

    /** category → section → slots, in roster order throughout. */
    const grouped = useMemo(() => {
        const byCat = new Map<string, Map<string, SlotView[]>>()
        for (const slot of slots) {
            if (!byCat.has(slot.category)) byCat.set(slot.category, new Map())
            const sections = byCat.get(slot.category)!
            if (!sections.has(slot.sectionTitle)) sections.set(slot.sectionTitle, [])
            sections.get(slot.sectionTitle)!.push(slot)
        }
        return byCat
    }, [slots])

    const nameOf = useCallback(
        (userId: string) => data?.members[userId]?.displayName ?? 'Unknown',
        [data],
    )

    const describeSlot = useCallback((slotId: string) => {
        const slot = data?.roster.find(x => x.id === slotId)
        return slot ? `${slot.sectionTitle} · ${slot.role}` : 'a position'
    }, [data])

    const sectionColor = useCallback((category: string) =>
        data?.sectionMeta.find(m => m.category === category)?.color, [data])

    const mySlot = useMemo(
        () => (myUserId ? slots.find(x => x.occupantUserId === myUserId) : undefined),
        [slots, myUserId],
    )

    const sectionNames = useMemo(() => [...new Set(slots.map(x => x.sectionTitle))], [slots])
    const roleNames = useMemo(() => [...new Set(slots.map(x => x.role))].sort(), [slots])

    const stats = useMemo(() => {
        const filled = slots.filter(x => x.state === 'held' || x.state === 'backfilled').length
        const awaiting = slots.filter(x => x.state === 'awaiting').length
        const open = slots.length - filled - awaiting
        return { filled, awaiting, open, total: slots.length }
    }, [slots])

    // Collapse everything except the category the viewer is in — a full ORBAT
    // is ~70 positions and does not fit on a screen. Runs once per operation.
    const initialised = useRef(false)
    useEffect(() => {
        if (initialised.current || !data || slots.length === 0) return
        initialised.current = true
        const mine = myUserId
            ? slots.find(x => x.occupantUserId === myUserId || x.homeUserId === myUserId)?.category
            : undefined
        const next: Record<string, boolean> = {}
        for (const cat of grouped.keys()) next[cat] = mine ? cat !== mine : false
        setCollapsed(next)
    }, [data, slots, grouped, myUserId])

    // ── Animating other people's changes ──────────────────────────────────────
    //
    // You already know where you just moved somebody; replaying it reads as lag.
    // Only a revision that arrived from another viewer produces the ping, and
    // only on the rows whose occupant actually changed.

    const prevOccupants = useRef<Map<string, string | null>>(new Map())
    useEffect(() => {
        if (!data) return
        const now = new Map(data.roster.map(x => [x.id, x.occupantUserId]))
        if (prevOccupants.current.size > 0 && fromPeer) {
            const changed = new Set<string>()
            for (const [id, occupant] of now) {
                if (prevOccupants.current.get(id) !== occupant) changed.add(id)
            }
            if (changed.size > 0 && !reduced) {
                setPinged(changed)
                const t = setTimeout(() => setPinged(new Set()), 950)
                prevOccupants.current = now
                return () => clearTimeout(t)
            }
        }
        prevOccupants.current = now
    }, [data, fromPeer, reduced])

    // ── Writing ───────────────────────────────────────────────────────────────

    const run = useCallback(async (action: Parameters<typeof act>[0]) => {
        setBusy(true)
        const err = await act(action)
        setBusy(false)
        setNotice(err)
        if (err) setTimeout(() => setNotice(null), 6000)
    }, [act])

    // ── Drag ──────────────────────────────────────────────────────────────────

    const sensors = useSensors(
        // A small distance threshold keeps a click on the grip from registering
        // as a zero-length drag, which would swallow the context menu.
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor),
    )

    function onDragStart(e: DragStartEvent) {
        setDragging((e.active.data.current?.userId as string) ?? null)
    }

    function onDragEnd(e: DragEndEvent) {
        setDragging(null)
        const userId = e.active.data.current?.userId as string | undefined
        const fromSlotId = e.active.data.current?.fromSlotId as string | null | undefined
        if (!userId || !e.over) return

        const overId = String(e.over.id)

        if (overId === 'pool') {
            if (fromSlotId) run({ action: 'assign', slotId: fromSlotId, userId: null })
            return
        }

        if (overId.startsWith('slot:')) {
            run({ action: 'assign', slotId: overId.slice(5), userId })
            return
        }

        if (overId.startsWith('section:')) {
            // Aiming at a section rather than a row: land in its first free
            // position, so staff can throw someone at a section and move on.
            const title = overId.slice(8)
            const target = slots.find(x => x.sectionTitle === title && x.available)
            if (target) run({ action: 'assign', slotId: target.id, userId })
            else setNotice(`${title} has no free positions.`)
        }
    }

    // ── Menu ──────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!menu) return
        const close = () => setMenu(null)
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
        window.addEventListener('click', close)
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('click', close)
            window.removeEventListener('keydown', onKey)
        }
    }, [menu])

    function openMenu(slotId: string, e: React.MouseEvent) {
        e.preventDefault()
        e.stopPropagation()
        setMenu({ slotId, x: e.clientX, y: e.clientY })
    }

    // ── Render ────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[46, 30, 120, 120].map((h, i) => (
                    <div key={i} className={s.skel} style={{ height: h }} />
                ))}
            </div>
        )
    }

    if (error) {
        return <div className={`${s.banner} ${s.bannerErr}`}>{error}</div>
    }

    if (!data || data.roster.length === 0) {
        return (
            <div className={s.banner}>
                The roster is cut from the ORBAT when RSVP opens. Nothing to show yet.
            </div>
        )
    }

    const menuSlot = menu ? slots.find(x => x.id === menu.slotId) : null

    return (
        <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
        <LayoutGroup>
            <div>
                {/* Header */}
                <div className={s.top}>
                    <div className={s.opName}>
                        <b>{operationName}</b>
                        <span>{operationWhen}</span>
                    </div>

                    {rsvpOpen && <span className={`${s.pill} ${s.pillAcc}`}><i />RSVP Open</span>}
                    {frozen && <span className={`${s.pill} ${s.pillWarn}`}><i />RSVP Closed</span>}
                    {connected
                        ? <span className={`${s.pill} ${s.pillGood}`}><i />Live</span>
                        : <span className={s.pill}><i />Reconnecting</span>}

                    {peers.length > 0 && (
                        <div className={s.presence}>
                            <div className={s.faces}>
                                {peers.slice(0, 5).map((p, i) => (
                                    <span key={i} style={{ background: p.color }} title={p.name}>
                                        {p.avatar
                                            ? <img src={p.avatar} alt='' />
                                            : p.name.slice(0, 2).toUpperCase()}
                                    </span>
                                ))}
                                {peers.length > 5 && (
                                    <span style={{ background: 'var(--line-2)', color: 'var(--ink-2)' }}>
                                        +{peers.length - 5}
                                    </span>
                                )}
                            </div>
                            <span className={s.pill}>{peers.length + 1} watching</span>
                        </div>
                    )}
                </div>

                {/* Stats */}
                <div className={s.stats}>
                    <div className={`${s.stat} ${s.statAcc}`}><u>{stats.filled}</u><span>Filled</span></div>
                    {!frozen && <div className={`${s.stat} ${s.statWarn}`}><u>{stats.awaiting}</u><span>Awaiting</span></div>}
                    <div className={`${s.stat} ${frozen ? s.statCrit : ''}`}><u>{stats.open}</u><span>{frozen ? 'Unfilled' : 'Open'}</span></div>
                    <div className={`${s.stat} ${s.statGood}`}><u>{pool.length}</u><span>{frozen ? 'Available' : 'In pool'}</span></div>
                    <div className={s.fillbar}>
                        <i style={{ width: `${(stats.filled / stats.total) * 100}%`, background: 'var(--acc)' }} />
                        <i style={{ width: `${(stats.awaiting / stats.total) * 100}%`, background: 'rgba(212,160,58,0.65)' }} />
                        <i style={{ width: `${(stats.open / stats.total) * 100}%`, background: frozen ? 'rgba(192,90,72,0.35)' : 'var(--s3)' }} />
                    </div>
                </div>

                {canManage && (
                    <div className={s.toolbar}>
                        <span className={`${s.pill} ${s.pillAcc}`}><i />Manage mode</span>
                        <button
                            type='button'
                            className={`${s.btn} ${s.btnPrimary}`}
                            disabled={busy || pool.length === 0}
                            onClick={() => run({ action: 'autofill' })}
                        >Auto-fill from pool</button>
                    </div>
                )}

                {myUserId && (
                    <MemberBar
                        me={data.members[myUserId]}
                        mySlot={mySlot}
                        sections={sectionNames}
                        roles={roleNames}
                        rsvpOpen={rsvpOpen}
                        busy={busy}
                        run={run}
                    />
                )}

                {frozen && (
                    <div className={`${s.banner} ${s.bannerFrozen}`}>
                        <span className={`${s.pill} ${s.pillWarn}`}><i />RSVP Closed</span>
                        <span>
                            <b>Members can no longer join, change or leave a position.</b>{' '}
                            Staff placement only from here.
                        </span>
                    </div>
                )}

                {notice && <div className={`${s.banner} ${s.bannerErr}`}>{notice}</div>}

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDragCancel={() => setDragging(null)}
                >
                    <div className={s.board}>
                        <div className={s.sections}>
                            {[...grouped.entries()].map(([category, sections]) => {
                                const catSlots = [...sections.values()].flat()
                                const filled = catSlots.filter(x => x.occupantUserId).length
                                const isCollapsed = collapsed[category]
                                return (
                                    <div key={category}>
                                        <button
                                            type='button'
                                            className={s.catHead}
                                            aria-expanded={!isCollapsed}
                                            onClick={() => setCollapsed(p => ({ ...p, [category]: !p[category] }))}
                                        >
                                            <span className={`${s.chevron} ${isCollapsed ? '' : s.chevronOpen}`}>▸</span>
                                            <h4>{CATEGORY_LABELS[category] ?? category}</h4>
                                            <em>{filled} / {catSlots.length} filled</em>
                                        </button>

                                        {!isCollapsed && (
                                            <div className={s.grid}>
                                                {[...sections.entries()].map(([title, secSlots]) => (
                                                    <SectionCard
                                                        key={title}
                                                        title={title}
                                                        color={sectionColor(category)}
                                                        slots={secSlots}
                                                        members={data.members}
                                                        nameOf={nameOf}
                                                        myUserId={myUserId}
                                                        canManage={canManage}
                                                        canClaim={rsvpOpen && !!myUserId}
                                                        onClaim={slotId => run({ action: 'claim', slotId })}
                                                        onMenu={openMenu}
                                                        pinged={pinged}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        <PoolRail
                            pool={pool}
                            members={data.members}
                            describeSlot={describeSlot}
                            myUserId={myUserId}
                            canManage={canManage}
                            frozen={frozen}
                        />
                    </div>

                    <DragOverlay dropAnimation={null}>
                        {dragging && (
                            <div className={s.overlay}>
                                <Avatar member={data.members[dragging]} />
                                {data.members[dragging]?.displayName ?? 'Member'}
                            </div>
                        )}
                    </DragOverlay>
                </DndContext>

                {menu && menuSlot && (
                    <div
                        className={s.ctx}
                        style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 220) }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className={s.ctxHead}>
                            {menuSlot.occupantUserId ? nameOf(menuSlot.occupantUserId) : menuSlot.role}
                        </div>
                        {menuSlot.occupantUserId && (
                            <button type='button' onClick={() => { setMenu(null); run({ action: 'assign', slotId: menuSlot.id, userId: null }) }}>
                                Return to pool
                            </button>
                        )}
                        {pool.length > 0 && !menuSlot.occupantUserId && (
                            <>
                                <div className={s.ctxHead}>Place from pool</div>
                                {pool.slice(0, 8).map(p => (
                                    <button
                                        key={p.userId}
                                        type='button'
                                        onClick={() => { setMenu(null); run({ action: 'assign', slotId: menuSlot.id, userId: p.userId }) }}
                                    >{nameOf(p.userId)}</button>
                                ))}
                            </>
                        )}
                        <hr />
                        <button
                            type='button'
                            className={s.danger}
                            onClick={() => { setMenu(null); run({ action: 'removeSlot', slotId: menuSlot.id }) }}
                        >Remove this position</button>
                    </div>
                )}
            </div>
        </LayoutGroup>
        </MotionConfig>
    )
}
