'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
    DndContext, closestCenter, PointerSensor, useSensor, useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext, rectSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { useFavourites, type Favourite } from '@/hooks/useFavourites'
import type { PromotionProgress } from '@/app/api/me/promotion-progress/route'
import type { NavStatus } from '@/app/api/nav/status/route'
import DashboardQuickLinks from './_components/DashboardQuickLinks'
import type { DashboardPermissions } from './StaffDashboardShell'

import {
    Panel, PanelHeader, PanelBody, PanelFooter, SectionLabel, PageHead, Grid2, Stack,
    Button, Badge, Meter, Stats, Stat, ListRow, Rows, Thumb, EmptyState, DashIcons,
} from '@/components/dashboard'
import s from '@/styles/dashboard.module.css'

/* ============================================================================
   The dashboard landing page.

   What it replaces did not answer the question a member opens it to ask. The
   top of the page was a clock, an empty favourites block and two quick links;
   the useful things — is sign-on open, how close am I to promotion, what is
   assigned to me — were absent or below the fold.

   This leads with the next operation and its sign-on state, then tasks, then
   operations, with progression pinned to the right rail. Favourites drops below
   the fold and shrinks to its content.

   Every panel here is a hairline on the surface scale. Red is spent on the
   primary action and on alert states, nothing else — see components/dashboard.
   ========================================================================== */

// ── Local clock ────────────────────────────────────────────────────────────────

function LocalClock() {
    const [time, setTime] = useState('')
    const [tz, setTz] = useState('')

    useEffect(() => {
        setTz(Intl.DateTimeFormat().resolvedOptions().timeZone)
        const tick = () => {
            const now = new Date()
            setTime([now.getHours(), now.getMinutes(), now.getSeconds()]
                .map(n => String(n).padStart(2, '0')).join(':'))
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [])

    return (
        <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, letterSpacing: '.08em', color: 'var(--txt-2)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {time || '──:──:──'}
            </div>
            <div className={s.hint} style={{ marginTop: 4, textTransform: 'uppercase' }}>
                {tz || '─────────'}
            </div>
        </div>
    )
}

// ── Next operation ────────────────────────────────────────────────────────────

/**
 * The block the whole page now leads with.
 *
 * It is the one thing a member opens the dashboard on a Thursday to find out,
 * and it was not on the page at all. Reuses `/api/nav/status`, which the navbar
 * already polls — no new endpoint, and the two can never disagree.
 */
function NextOpPanel() {
    const [status, setStatus] = useState<NavStatus | null>(null)

    useEffect(() => {
        let cancelled = false
        fetch('/api/nav/status')
            .then(r => r.ok ? r.json() : null)
            .then(json => { if (!cancelled && json && !json.error) setStatus(json) })
            .catch(() => { })
        return () => { cancelled = true }
    }, [])

    const op = status?.nextOp
    if (!op) return null

    const running = op.status === 'Active' || op.stage === 'op_running' || op.stage === 'confirmations_open'
    const signedOn = running ? (op.confirmed || op.attending) : op.attending

    const when = new Date(op.date).toLocaleString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false,
    })

    const heading = running ? 'Op running' : op.rsvpOpen ? 'Sign-on open' : 'Sign-on not open'

    return (
        <Panel tone={running || op.rsvpOpen ? 'live' : 'warn'}>
            <PanelHeader
                before={<Badge tone={running || op.rsvpOpen ? 'live' : 'warn'} live={running || op.rsvpOpen} dot={!running && !op.rsvpOpen}>{heading}</Badge>}
                title={op.title}
                sub={`${when} AEST`}
            />
            <PanelBody>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                        {/*
                            Nothing stores a total-slots figure, so there is no
                            denominator to measure sign-on against here — the
                            count stands on its own rather than inventing a
                            target to be a fraction of.
                        */}
                        <div className={s.meterTop}>
                            <span className={s.now}>{signedOn}</span>
                            <span className={s.goal}>{running ? 'confirmed present' : 'signed on'}</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button variant='primary' href={`/operations/${op.id}`} disabled={!op.rsvpOpen || running}>
                            <DashIcons.Check /> {op.rsvpOpen && !running ? 'Sign on' : running ? 'Op running' : 'Not open yet'}
                        </Button>
                        <Button variant='ghost' href={`/operations/${op.id}`}>Orders</Button>
                    </div>
                </div>
            </PanelBody>
        </Panel>
    )
}

// ── Progression ───────────────────────────────────────────────────────────────

/**
 * How close the member is to their next rank — the second thing they open the
 * dashboard to check, and also previously absent. Same endpoint the navbar's
 * account menu uses.
 */
function ProgressionPanel() {
    const [promotion, setPromotion] = useState<PromotionProgress | null | undefined>(undefined)

    useEffect(() => {
        let cancelled = false
        fetch('/api/me/promotion-progress')
            .then(r => r.ok ? r.json() : null)
            .then(json => { if (!cancelled) setPromotion(json?.error ? null : json) })
            .catch(() => { if (!cancelled) setPromotion(null) })
        return () => { cancelled = true }
    }, [])

    // Undefined is "still loading"; null is "no rank on a known track". Neither
    // is worth a panel that says so.
    if (!promotion?.progress) return null
    const p = promotion.progress

    return (
        <Panel>
            <PanelHeader
                title='My progression'
                right={<Button variant='link' href='/me'>Milpac <DashIcons.ArrowRight /></Button>}
            />
            <PanelBody>
                {p.atMax ? (
                    <Badge tone='live' dot>Highest rank attained</Badge>
                ) : p.billetOnly ? (
                    <Badge tone='info' dot>{p.nextRank} is billet-assigned</Badge>
                ) : (
                    <Meter
                        value={p.current}
                        target={p.required}
                        unit='billet points'
                        remaining={`${Math.max(0, p.required - p.current)} to go`}
                        ticks={[
                            <>{promotion.currentRank ?? 'Current'} — current</>,
                            <>{p.nextRank} — next</>,
                        ]}
                    />
                )}
            </PanelBody>
        </Panel>
    )
}

// ── Favourites ────────────────────────────────────────────────────────────────

/* Kept: the department codes are genuinely useful for picking a pinned page out
   of a grid at a glance. The colours now come off the status palette where one
   applies and stay neutral where none does, rather than seven unrelated hues. */
function deriveCard(fav: Favourite): { code: string; color: string } {
    const h = fav.href
    if (h.includes('/j1')) return { code: 'J1', color: 'var(--info)' }
    if (h.includes('/j2')) return { code: 'J2', color: 'var(--info)' }
    if (h.includes('/j3')) return { code: 'J3', color: 'var(--live)' }
    if (h.includes('/j4')) return { code: 'J4', color: 'var(--red-hi)' }
    if (h.includes('/j5') || h.includes('/gallery')) return { code: 'J5', color: 'var(--amber)' }
    if (h.includes('/j6')) return { code: 'J6', color: 'var(--info)' }
    if (h.includes('/j7')) return { code: 'J7', color: 'var(--info)' }
    if (h.includes('/calendar')) return { code: 'CAL', color: 'var(--txt-2)' }
    if (h.includes('/orbat')) return { code: 'ORB', color: 'var(--txt-2)' }
    if (h.includes('/personnel')) return { code: 'PER', color: 'var(--txt-2)' }
    if (h.includes('/training-docs')) return { code: 'TRN', color: 'var(--txt-3)' }
    if (h.includes('/sops')) return { code: 'SOP', color: 'var(--txt-3)' }
    if (h.includes('/tickets')) return { code: 'TKT', color: 'var(--txt-3)' }
    return { code: fav.label.slice(0, 3).toUpperCase(), color: 'var(--txt-2)' }
}

function SortableFavCard({ fav, onNavigate, onUnpin }: {
    fav: Favourite
    onNavigate: (fav: Favourite) => void
    onUnpin: (id: string) => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fav.id })
    const { code, color } = deriveCard(fav)

    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.5 : 1,
                zIndex: isDragging ? 10 : undefined,
                position: 'relative',
            }}
            {...attributes}
            {...listeners}
        >
            <ListRow
                onClick={() => onNavigate(fav)}
                lead={<span className={s.hint} style={{ color, width: 26, flex: 'none' }}>{code}</span>}
                title={fav.label}
                actions={
                    <Button
                        variant='subtle'
                        size='sm'
                        icon
                        aria-label={`Unpin ${fav.label}`}
                        onClick={e => { e.stopPropagation(); onUnpin(fav.id) }}
                    ><DashIcons.Close /></Button>
                }
            />
        </div>
    )
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

type TaskItem = {
    _id: string
    title: string
    description?: string
    type?: string
    dueDate?: string | null
    status: string
    assignedByName: string
    actionUrl?: string
}

const TASK_TONE: Record<string, { label: string, tone: 'warn' | 'info' | 'muted' }> = {
    attendance: { label: 'ATT', tone: 'warn' },
    application_review: { label: 'APP', tone: 'info' },
    manual: { label: 'TSK', tone: 'muted' },
}

function TasksWidget() {
    const router = useRouter()
    const [tasks, setTasks] = useState<TaskItem[]>([])
    const [loading, setLoading] = useState(true)
    const [completing, setCompleting] = useState<string | null>(null)

    const load = useCallback(() => {
        setLoading(true)
        fetch('/api/admin/tasks?view=mine')
            .then(r => r.json())
            .then(d => { setTasks(d.tasks ?? []); setLoading(false) })
            .catch(() => setLoading(false))
    }, [])

    useEffect(() => { load() }, [load])

    async function handleComplete(taskId: string, e: React.MouseEvent) {
        e.stopPropagation()
        setCompleting(taskId)
        await fetch(`/api/admin/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'complete' }),
        })
        setTasks(prev => prev.filter(t => t._id !== taskId))
        setCompleting(null)
    }

    const preview = tasks.slice(0, 5)
    const overflow = tasks.length - preview.length
    const dueSoon = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length

    return (
        <div>
            <SectionLabel right={
                <>
                    {dueSoon > 0 && <Badge tone='alert' dot>{dueSoon} overdue</Badge>}
                    <Button variant='link' href='/dashboard/tasks'>View all <DashIcons.ArrowRight /></Button>
                </>
            }>My tasks</SectionLabel>

            <Panel tone={dueSoon > 0 ? 'alert' : 'default'}>
                {loading ? (
                    <PanelBody><span className={s.hint}>Loading…</span></PanelBody>
                ) : tasks.length === 0 ? (
                    <PanelBody>
                        <EmptyState inline icon={<DashIcons.Check />} title='Nothing assigned'>
                            Tasks assigned to you by a department lead land here.
                        </EmptyState>
                    </PanelBody>
                ) : (
                    <>
                        <Rows>
                            {preview.map(task => {
                                const overdue = !!task.dueDate && new Date(task.dueDate) < new Date()
                                const badge = TASK_TONE[task.type ?? 'manual'] ?? TASK_TONE.manual
                                return (
                                    <ListRow
                                        key={task._id}
                                        state={overdue ? 'alert' : task.dueDate ? 'warn' : 'none'}
                                        lead={<Badge tone={badge.tone} small>{badge.label}</Badge>}
                                        title={task.title}
                                        meta={
                                            <>
                                                <span>{task.assignedByName === 'System' ? 'Auto-assigned' : <>From <b>{task.assignedByName}</b></>}</span>
                                                {task.dueDate && (
                                                    <span style={{ color: overdue ? 'var(--red-hi)' : 'var(--amber)' }}>
                                                        Due {new Date(task.dueDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                                        {overdue && ' — overdue'}
                                                    </span>
                                                )}
                                            </>
                                        }
                                        onClick={() => router.push((task.actionUrl ?? '/dashboard/tasks') as never)}
                                        actions={
                                            <Button
                                                variant='subtle'
                                                size='sm'
                                                icon
                                                aria-label='Mark complete'
                                                disabled={completing === task._id}
                                                onClick={e => handleComplete(task._id, e)}
                                            ><DashIcons.Check /></Button>
                                        }
                                    />
                                )
                            })}
                        </Rows>
                        <PanelFooter>
                            <span className={s.hint}>
                                {tasks.length} pending{overflow > 0 ? ` — ${overflow} more` : ''}
                            </span>
                        </PanelFooter>
                    </>
                )}
            </Panel>
        </div>
    )
}

// ── Operations ────────────────────────────────────────────────────────────────

type OpOverview = {
    _id: string
    title: string
    date: string
    status: string
    department?: string
    ownedByName?: string
    coverImage?: string
    themeColor?: string
}

function OperationsWidget({ isHQ }: { isHQ: boolean }) {
    const [active, setActive] = useState<OpOverview[]>([])
    const [inDev, setInDev] = useState<OpOverview[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const reqs = [fetch('/api/operations?status=Active,Upcoming').then(r => r.json())]
        if (isHQ) reqs.push(fetch('/api/operations?status=In+Development').then(r => r.json()))
        Promise.all(reqs).then(([liveJson, devJson]) => {
            setActive(liveJson.missions ?? [])
            if (devJson) setInDev(devJson.missions ?? [])
            setLoading(false)
        }).catch(() => setLoading(false))
    }, [isHQ])

    const upcoming = active.filter(o => o.status === 'Upcoming')
    const live = active.filter(o => o.status === 'Active')
    const empty = live.length === 0 && upcoming.length === 0 && inDev.length === 0

    /* One row shape for all three states. The status reads twice on purpose —
       once as the coloured left edge, which is what makes the list scannable,
       and once as a badge for anyone who needs the word. */
    function OpRow({ op }: { op: OpOverview }) {
        const isActive = op.status === 'Active'
        const isDev = op.status === 'In Development'
        const tone = isActive ? 'live' : isDev ? 'info' : 'warn'

        return (
            <ListRow
                state={isActive ? 'live' : isDev ? 'none' : 'warn'}
                lead={<Thumb src={op.coverImage} />}
                title={op.title}
                meta={
                    <>
                        <Badge tone={tone} small>{op.status}</Badge>
                        <span>{new Date(op.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        {op.ownedByName && <span>Zeus <b>{op.ownedByName}</b></span>}
                    </>
                }
                actions={
                    <>
                        {isHQ && !isDev && <Button variant='subtle' size='sm' href={`/operations/${op._id}/edit`}>Edit</Button>}
                        <Button variant='ghost' size='sm' href={isDev ? `/operations/${op._id}/edit` : `/operations/${op._id}`}>
                            {isDev ? 'Open' : 'View'}
                        </Button>
                    </>
                }
            />
        )
    }

    return (
        <div>
            <SectionLabel right={
                <Button variant='link' href='/operations'>Operations board <DashIcons.ArrowRight /></Button>
            }>Operations</SectionLabel>

            <Panel>
                {loading ? (
                    <PanelBody><span className={s.hint}>Loading…</span></PanelBody>
                ) : empty ? (
                    <PanelBody>
                        <EmptyState inline title='Nothing scheduled'>
                            No active or upcoming operations.
                        </EmptyState>
                    </PanelBody>
                ) : (
                    <>
                        {/* Counts in the header rather than three separate
                            sub-headings down the list: the same information,
                            without breaking the rows into three short lists. */}
                        <PanelHeader
                            before={<Badge tone='live' dot>Active {live.length}</Badge>}
                            right={
                                <>
                                    <Badge tone='warn' dot>Upcoming {upcoming.length}</Badge>
                                    {isHQ && <Badge tone='info' dot>In development {inDev.length}</Badge>}
                                </>
                            }
                        />
                        <Rows>
                            {[...live, ...upcoming, ...(isHQ ? inDev : [])].map(op => <OpRow key={op._id} op={op} />)}
                        </Rows>
                    </>
                )}
            </Panel>
        </div>
    )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DashboardOverview({
    displayName,
    permissions,
}: {
    displayName: string
    permissions: DashboardPermissions
}) {
    const isHQ = permissions.canSeeJ2 || permissions.isStaff
    const router = useRouter()
    const { favourites, unpin, reorder } = useFavourites()

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
    )

    const today = new Date().toLocaleDateString('en-AU', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })

    function handleNavigate(fav: Favourite) {
        if (fav.tabIndex !== undefined) {
            try { localStorage.setItem(`gotoTab:${fav.href}`, String(fav.tabIndex)) } catch { }
        }
        router.push(fav.href as never)
    }

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (!over || active.id === over.id) return
        const oldIndex = favourites.findIndex(f => f.id === active.id)
        const newIndex = favourites.findIndex(f => f.id === over.id)
        reorder(arrayMove(favourites, oldIndex, newIndex))
    }

    return (
        <div style={{ padding: 'var(--gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>

            <PageHead
                kicker={<>ASOT // Unit</>}
                title='Dashboard'
                right={
                    /* Service status moved to the sidebar's identity card,
                       where it is on screen for every dashboard route rather
                       than only this one. */
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                        <LocalClock />
                        <span className={s.hint}>{today}</span>
                    </div>
                }
            />

            <span className={s.hint} style={{ marginTop: -8 }}>Welcome back, {displayName}</span>

            <Grid2>
                <Stack>
                    <NextOpPanel />
                    <TasksWidget />
                    {permissions.isStaff && <OperationsWidget isHQ={isHQ} />}
                </Stack>

                <Stack>
                    <ProgressionPanel />

                    <DashboardQuickLinks />

                    {/*
                        Demoted from the top of the page to the right rail. It is
                        a shortcut list — useful once you have built one, and
                        worth nothing at all on the day you first sign in, which
                        is exactly when it used to be the first thing you saw.
                    */}
                    <div>
                        <SectionLabel>Favourites</SectionLabel>
                        {favourites.length === 0 ? (
                            <EmptyState icon={<DashIcons.Star />} title='Nothing pinned yet'>
                                Pin the pages you use most with the ★ beside any sidebar item.
                            </EmptyState>
                        ) : (
                            <Panel>
                                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                    <SortableContext items={favourites.map(f => f.id)} strategy={rectSortingStrategy}>
                                        <Rows>
                                            {favourites.map(fav => (
                                                <SortableFavCard
                                                    key={fav.id}
                                                    fav={fav}
                                                    onNavigate={handleNavigate}
                                                    onUnpin={unpin}
                                                />
                                            ))}
                                        </Rows>
                                    </SortableContext>
                                </DndContext>
                            </Panel>
                        )}
                    </div>
                </Stack>
            </Grid2>
        </div>
    )
}
