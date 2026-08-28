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
import Legend from './Legend'
import type { PickableRole } from './AddRole'
import { Avatar } from './parts'
import s from './board.module.css'

interface Props {
    operationId: string
    operationName: string
    /** Formatted date line under the operation name. */
    operationWhen: string
    myUserId: string | null
    canManage: boolean
    /**
     * Bumped by an outside control that changed the roster (the Assigned Units
     * panel's re-snapshot). The board reloads rather than waiting on its poll.
     */
    reloadKey?: number
}

/**
 * The board's shape, which mirrors the unit's rather than the data's.
 *
 * Command elements sit across the top because they are small, fixed and shared;
 * the fighting platoons run as columns beneath because that is how they are
 * read — down a platoon, not across all of them. Laying every category out as a
 * full-width band instead put 1-1 Alpha beside 1-1 Bravo beside 1-1 Charlie and
 * pushed 1-2 an entire screen down, which is the opposite of how anyone looks
 * for a section.
 */
const TOP_CATEGORIES = ['companyHQ', 'gamemaster']
const COLUMN_CATEGORIES = ['platoon11', 'platoon12', 'support']

/**
 * Categories that earn a double-width column with their sections in two.
 * 1-3 Support is six sections and sixty-odd positions against an infantry
 * platoon's four and twenty-eight — an equal split cramps it and wastes the
 * space next to the others.
 */
const WIDE_CATEGORIES = ['support']

/**
 * Split sections across `count` columns so the columns come out roughly level.
 *
 * A CSS grid cannot do this: its rows align, so a fourteen-row section beside an
 * eight-row one pins the short one's neighbour a whole card lower and leaves the
 * gap you can see under it. Packing by content instead means each column is
 * filled to its own depth.
 *
 * Greedy, in ORBAT order — each section joins whichever column is currently
 * shortest — so sections keep their relative order within a column instead of
 * being sorted into an order nobody recognises. Position count stands in for
 * height, which it is: every row is the same height.
 */
function balanceColumns<T>(items: { item: T; weight: number }[], count: number): T[][] {
    const columns: T[][] = Array.from({ length: count }, () => [])
    const heights = new Array(count).fill(0)

    for (const { item, weight } of items) {
        let shortest = 0
        for (let i = 1; i < count; i++) if (heights[i] < heights[shortest]) shortest = i
        columns[shortest].push(item)
        // The card's own header costs a row's worth on top of its positions.
        heights[shortest] += weight + 2
    }
    return columns
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
    operationId, operationName, operationWhen, myUserId, canManage, reloadKey = 0,
}: Props) {
    const { data, loading, connected, peers, fromPeer, error, act, reload } = useAttendanceBoard(operationId)
    const reduced = useReducedMotion()

    const [menu, setMenu] = useState<MenuState | null>(null)
    const [dragging, setDragging] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [pinged, setPinged] = useState<Set<string>>(new Set())
    const [busy, setBusy] = useState(false)
    const [roles, setRoles] = useState<PickableRole[]>([])

    const rsvpOpen = data?.stage === 'rsvp_open'
    const frozen = !!data && data.stage !== 'preparing' && !rsvpOpen

    // Fetched once for the whole board rather than per section: a full ORBAT
    // has ~15 sections and every add-role picker wants the same list. The
    // endpoint is a deliberately narrow projection — it never returns the grant
    // configuration the Roles Manager's own endpoint does.
    useEffect(() => {
        if (!canManage) return
        fetch(`/api/operations/${operationId}/attendance/roles`)
            .then(r => r.json())
            .then(d => { if (Array.isArray(d.roles)) setRoles(d.roles) })
            .catch(() => {})
    }, [operationId, canManage])

    // A roster change made outside this component does not bump the Y.js
    // revision — only `act` does — so it is reloaded explicitly here. Other
    // viewers pick it up on their 30s poll, which is the right trade for an
    // action taken a handful of times per operation.
    const firstReload = useRef(true)
    useEffect(() => {
        if (firstReload.current) { firstReload.current = false; return }
        reload()
    }, [reloadKey])   // eslint-disable-line react-hooks/exhaustive-deps

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

    /**
     * A section's own patch and colour, falling back to its platoon's.
     *
     * Meta rows are keyed on (category, sectionTitle) with a null title meaning
     * the platoon itself, and this was matching on category alone — so every
     * section in 1-1 rendered 1-1's colour and none of them could ever have
     * shown their own. Section first, platoon second, nothing if neither.
     */
    const metaFor = useCallback((category: string, sectionTitle: string | null) => {
        const meta = data?.sectionMeta ?? []
        const own = sectionTitle ? meta.find(m => m.category === category && m.sectionTitle === sectionTitle) : undefined
        const platoon = meta.find(m => m.category === category && !m.sectionTitle)
        const source = own?.patch ? own : platoon?.patch ? platoon : own ?? platoon

        return {
            color: own?.color ?? platoon?.color,
            // `v` busts the cache when a patch is replaced — the route serves by
            // category/section, not by filename, so the URL is otherwise stable.
            patchUrl: source?.patch
                ? `/api/orbat/patch?category=${encodeURIComponent(source.category)}`
                    + `&section=${encodeURIComponent(source.sectionTitle ?? '')}`
                    + `&v=${encodeURIComponent(source.patch)}`
                : undefined,
        }
    }, [data])

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

    // Split the categories into the two rows the board is built from. Anything
    // unrecognised (a category added to the ORBAT later) becomes another column
    // rather than disappearing.
    const topCats = TOP_CATEGORIES.filter(c => grouped.has(c))
    const columnCats = [
        ...COLUMN_CATEGORIES.filter(c => grouped.has(c)),
        ...[...grouped.keys()].filter(c => !TOP_CATEGORIES.includes(c) && !COLUMN_CATEGORIES.includes(c)),
    ]

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

    /**
     * A category and its sections, stacked. The same block serves the top row
     * and the platoon columns — only the grid around it differs, which is what
     * keeps the two rows visually identical rather than two similar layouts
     * that drift apart.
     */
    function renderCategory(category: string) {
        const sections = grouped.get(category)
        if (!sections) return null
        const catSlots = [...sections.values()].flat()
        const filled = catSlots.filter(x => x.state === 'held' || x.state === 'backfilled').length
        const wide = WIDE_CATEGORIES.includes(category)

        return (
            <div key={category} className={`${s.category} ${wide ? s.categoryWide : ''}`}>
                <div className={s.catHead}>
                    {(() => {
                        const { patchUrl } = metaFor(category, null)
                            return patchUrl ? <img className={s.catPatch} src={patchUrl} alt='' /> : null
                    })()}
                    <h4>{CATEGORY_LABELS[category] ?? category}</h4>
                    <em>{filled} / {catSlots.length} filled</em>
                </div>

                {wide ? (
                    <div className={s.split}>
                        {balanceColumns(
                            [...sections.entries()].map(([title, secSlots]) => ({
                                item: [title, secSlots] as const,
                                weight: secSlots.length,
                            })),
                            2,
                        ).map((column, i) => (
                            <div key={i} className={s.stack}>
                                {column.map(([title, secSlots]) => card(category, title, secSlots))}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={s.stack}>
                        {[...sections.entries()].map(([title, secSlots]) => card(category, title, secSlots))}
                    </div>
                )}
            </div>
        )
    }

    /** One section card. Shared by the stacked and split layouts. */
    function card(category: string, title: string, secSlots: SlotView[]) {
        return (
                        <SectionCard
                            key={title}
                            title={title}
                            category={category}
                            {...metaFor(category, title)}
                            slots={secSlots}
                            members={data!.members}
                            nameOf={nameOf}
                            myUserId={myUserId}
                            canManage={canManage}
                            canClaim={rsvpOpen && !!myUserId}
                            onClaim={slotId => run({ action: 'claim', slotId })}
                            onMenu={openMenu}
                            pinged={pinged}
                            roles={roles}
                            busy={busy}
                            onAddRole={roleId => run({
                                action: 'addSlot',
                                sectionTitle: title,
                                category,
                                roleId,
                            })}
                        />
        )
    }

    return (
        <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
        <LayoutGroup>
            <div className={s.root}>
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
                        <i style={{ width: `${(stats.filled / stats.total) * 100}%`, background: 'var(--good)' }} />
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

                <Legend />

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDragCancel={() => setDragging(null)}
                >
                    <div className={s.board}>
                        <div className={s.sections}>
                            {topCats.length > 0 && (
                                <div className={s.topRow}>
                                    {topCats.map(category => renderCategory(category))}
                                </div>
                            )}

                            {columnCats.length > 0 && (
                                <div className={s.columns}>
                                    {columnCats.map(category => renderCategory(category))}
                                </div>
                            )}
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
