'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Dayjs } from 'dayjs'
import TabPanel from '../TabPanel'
import AnchorBar from './AnchorBar'
import PhaseRibbon from './PhaseRibbon'
import PhaseStrip from './PhaseStrip'
import PreProductionInspector, { type OrdersCheckTask } from './PreProductionInspector'
import RsvpWindowInspector from './RsvpWindowInspector'
import StagePanel from './StagePanel'
import LifecycleOverride from './LifecycleOverride'
import { btnTone, chip, label } from './controls'
import { buildRibbon, type PhaseId } from '@/lib/operations/phases'
import { fmtCountdown } from '@/lib/operations/schedule'
import type { AttendanceStage } from '@/lib/operations/schedule'

interface Props {
    opID: string
    isHQ: boolean
    isJ2Lead: boolean
    title: string
    date: Dayjs | null
    isCampaignOp: boolean
    campaignStartDate: string | null
    missionDev: MissionDevelopment | null
    setMissionDev: React.Dispatch<React.SetStateAction<MissionDevelopment | null>>
    ordersCheckTask: OrdersCheckTask | null
    setOrdersCheckTask: React.Dispatch<React.SetStateAction<OrdersCheckTask | null>>

    onChangeDate: (v: Dayjs | null) => void
    rsvpOpenAt: string | null
    onSetRsvpOpenManual: () => void
    onSetRsvpOpenScheduled: () => void
    onChangeRsvpOpenAt: (v: Dayjs | null) => void
    onQuickSetRsvpOpen: (mins: number) => void
    closeOffsetMins: number
    onChangeCloseOffset: (mins: number) => void
    onChangeRsvpCloseAt: (v: Dayjs | null) => void
    automationPaused: boolean

    stage: AttendanceStage | null
    onAdvance: (to: AttendanceStage) => void
    onSelect: (to: AttendanceStage) => void
    advancing: boolean

    /** Lifecycle override — moved here from the deck's Details card. */
    status: string
    canOverrideLifecycle: boolean
    onChangeStatus: (v: string) => void
    onCompleteMission: () => void
    completingMission: boolean
}

/**
 * The operation's lifecycle as one ribbon, read left to right: development
 * gates weeks out, the lead-up, the RSVP window, the final hour, then the
 * operation and its confirmation window.
 *
 * This replaces three stacked panels that each drew the same line in a
 * different idiom at a different scale — a gate rail, five RSVP columns, six
 * stage segments — and never said they were the same line. The ribbon draws it
 * once; selecting a phase opens its controls beneath.
 *
 * Ordering errors are structural here rather than validated. Because phases
 * are adjacent by construction, an RSVP window set to open after it closes has
 * negative width, which the ribbon renders as a hatched, backwards segment. It
 * is caught by the geometry before any check runs — see lib/operations/phases.
 *
 * The clock is local and coarse (30s). The ribbon only ever needs to move the
 * `now` line and re-tone a phase; page.tsx's 1s `tickNow` exists to fire
 * automation the moment a scheduled time crosses zero, which is a different
 * job and a much higher rate than this needs.
 */
export default function ScheduleTab({
    opID, isHQ, isJ2Lead, title, date, isCampaignOp, campaignStartDate,
    missionDev, setMissionDev, ordersCheckTask, setOrdersCheckTask,
    onChangeDate, rsvpOpenAt, onSetRsvpOpenManual, onSetRsvpOpenScheduled,
    onChangeRsvpOpenAt, onQuickSetRsvpOpen, closeOffsetMins, onChangeCloseOffset,
    onChangeRsvpCloseAt, automationPaused,
    stage, onAdvance, onSelect, advancing,
    status, canOverrideLifecycle, onChangeStatus, onCompleteMission, completingMission,
}: Props) {
    const [now, setNow] = useState(() => new Date())
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 30_000)
        return () => clearInterval(id)
    }, [])

    const ribbon = useMemo(() => buildRibbon({
        operationDate: date?.toDate() ?? null,
        rsvpOpenAt: rsvpOpenAt ? new Date(rsvpOpenAt) : null,
        rsvpCloseOffsetMins: closeOffsetMins,
        isCampaignOp,
        campaignStartDate: campaignStartDate ? new Date(campaignStartDate) : null,
        completions: missionDev?.completions ?? {},
        ordersCheckAt: ordersCheckTask?.ordersCheckAt ? new Date(ordersCheckTask.ordersCheckAt) : null,
        now,
    }), [date, rsvpOpenAt, closeOffsetMins, isCampaignOp, campaignStartDate, missionDev, ordersCheckTask, now])

    // Open on whatever most needs attention: a broken phase first, otherwise
    // the phase the operation is actually in. Explicit selection wins after that.
    const suggested: PhaseId =
        ribbon.phases.find(p => p.invalid)?.id
        ?? ribbon.phases.find(p => p.state === 'current')?.id
        ?? 'pre_production'
    const [chosen, setChosen] = useState<PhaseId | null>(null)
    const selected = chosen ?? suggested

    const critical = ribbon.problems.find(p => p.severity === 'critical')

    const anchorNote = selected === 'pre_production'
        ? 'move this and every gate below moves with it'
        : 'anchor — every phase below is measured from here'

    return (
        // No max-width, unlike AttendanceTab's 1220. The ribbon is a
        // wide-format diagram: every extra pixel goes into separating boundary
        // labels and milestones that would otherwise collide, so capping it
        // reintroduces the crowding the rebuild set out to remove. Attendance
        // keeps its cap because it is 420px form controls, which only look
        // worse stretched.
        <div style={{ width: '100%', padding: 'clamp(1.5rem, 2.5vw, 2.5rem)', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <TabPanel
                title="Operation timeline"
                horizon={isCampaignOp ? '16w out → +24h' : '12w out → +24h'}
                badge={<>
                    {ribbon.gates.some(g => g.state === 'overdue') && (
                        <span style={chip('warn')}>{ribbon.gates.filter(g => g.state === 'overdue').length} gates overdue</span>
                    )}
                    {critical && <span style={chip('crit')}>{critical.id === 'rsvp_inverted' ? 'RSVP window inverted' : 'Schedule error'}</span>}
                    {automationPaused && <span style={chip()}>Automation paused</span>}
                </>}
            >
                <AnchorBar date={date} onChangeDate={onChangeDate} now={now} note={anchorNote} />

                <PhaseRibbon ribbon={ribbon} selected={selected} onSelect={setChosen} now={now} />

                <PhaseStrip ribbon={ribbon} selected={selected} onSelect={setChosen} now={now} />

                <div style={{
                    borderTop: '1px solid var(--line)', padding: 16,
                    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 360px)', gap: 26,
                }}>
                    <div style={{ minWidth: 0 }}>
                        {critical && (
                            <div style={{
                                display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14,
                                border: '1px solid rgba(192,90,72,0.45)', borderLeft: '2px solid var(--crit)',
                                background: 'rgba(192,90,72,0.07)', borderRadius: 'var(--r)',
                                padding: '9px 12px', fontSize: 12, color: 'var(--ink-2)',
                            }}>
                                <span style={{ fontFamily: 'var(--mono)', color: 'var(--crit)', flex: '0 0 auto' }}>!</span>
                                <span>{critical.message}</span>
                                {critical.fix && date && (
                                    <button
                                        type="button"
                                        onClick={() => onQuickSetRsvpOpen(critical.fix!.minutesBeforeOp)}
                                        style={{ ...btnTone('acc'), marginLeft: 'auto', flex: '0 0 auto' }}
                                    >
                                        {critical.fix.label}
                                    </button>
                                )}
                            </div>
                        )}

                        {selected === 'pre_production' && (
                            <PreProductionInspector
                                opID={opID}
                                isJ2Lead={isJ2Lead}
                                title={title}
                                isCampaignOp={isCampaignOp}
                                gates={ribbon.gates}
                                now={now}
                                missionDev={missionDev}
                                setMissionDev={setMissionDev}
                                ordersCheckTask={ordersCheckTask}
                                setOrdersCheckTask={setOrdersCheckTask}
                            />
                        )}

                        {selected === 'rsvp_window' && isHQ && (
                            <RsvpWindowInspector
                                ribbon={ribbon}
                                date={date}
                                onSetRsvpOpenManual={onSetRsvpOpenManual}
                                onSetRsvpOpenScheduled={onSetRsvpOpenScheduled}
                                onChangeRsvpOpenAt={onChangeRsvpOpenAt}
                                onQuickSetRsvpOpen={onQuickSetRsvpOpen}
                                closeOffsetMins={closeOffsetMins}
                                onChangeCloseOffset={onChangeCloseOffset}
                                onChangeRsvpCloseAt={onChangeRsvpCloseAt}
                            />
                        )}

                        {selected === 'lead_up' && (
                            <PhaseNote
                                heading="Lead-up"
                                lines={[
                                    'Development is signed off and RSVP has not opened yet. Nothing fires automatically in this window.',
                                    ordersCheckTask
                                        ? 'An orders check is booked — it is on the ribbon above.'
                                        : 'This is when an orders check is usually requested; do that from the pre-production phase.',
                                ]}
                            />
                        )}

                        {selected === 'final_hour' && (
                            <PhaseNote
                                heading="Final hour"
                                lines={[
                                    'RSVP has closed and the operation has not started. Section leaders are asked to review their allocations when RSVP closes.',
                                    'Company HQ is chased separately one hour out if any attending reservist still has no section.',
                                ]}
                            />
                        )}

                        {selected === 'op_confirmation' && (
                            <PhaseNote
                                heading="Operation & confirmation"
                                lines={[
                                    'The operation activates at its start time. Confirmations open when it is marked completed, and close automatically twenty-four hours later.',
                                    'Stage can be advanced or corrected below.',
                                ]}
                            />
                        )}
                    </div>

                    <AutomationPanel
                        paused={automationPaused}
                        blocked={ribbon.problems.some(p => p.blocksPublish)}
                        nextAt={ribbon.boundaries.find(b => b.at && b.at > now && b.state !== 'invalid')?.at ?? null}
                        nextLabel={ribbon.boundaries.find(b => b.at && b.at > now && b.state !== 'invalid')?.label ?? null}
                        now={now}
                    />
                </div>
            </TabPanel>

            {/* The stage machine stays its own panel. It is not part of the
                schedule — it is where the operation actually *is*, which the
                cron and this tab both move, and which a person can correct by
                hand when either gets it wrong. Folding it into the ribbon would
                conflate "when things are meant to happen" with "what has
                happened", which is the confusion the ribbon exists to end. */}
            {isHQ && (
                <StagePanel stage={stage} onAdvance={onAdvance} onSelect={onSelect} advancing={advancing} />
            )}

            {/* The lifecycle override. Distinct from the stage above it: stage
                is where the operation is in its run, status is what the rest of
                the system believes about it — and unlike stage, setting it by
                hand needs `operations.overrideLifecycle`. */}
            {isHQ && (
                <TabPanel
                    title="Lifecycle override"
                    horizon={canOverrideLifecycle ? 'manual' : 'read-only'}
                    badge={automationPaused ? <span style={chip('warn')}>Automation suspended</span> : undefined}
                >
                    <LifecycleOverride
                        status={status}
                        canOverride={canOverrideLifecycle}
                        onChangeStatus={onChangeStatus}
                        onCompleteMission={onCompleteMission}
                        completingMission={completingMission}
                    />
                </TabPanel>
            )}
        </div>
    )
}

function PhaseNote({ heading, lines }: { heading: string; lines: string[] }) {
    return (
        <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>{heading}</div>
            {lines.map((l, i) => (
                <p key={i} style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.55, margin: '0 0 8px' }}>{l}</p>
            ))}
        </div>
    )
}

/**
 * Who actually fires these transitions, and whether they are firing at all.
 *
 * "Automation paused" used to be a bare orange line under the RSVP open
 * control, which said neither what was paused nor what would un-pause it.
 */
function AutomationPanel({ paused, blocked, nextAt, nextLabel, now }: {
    paused: boolean
    blocked: boolean
    nextAt: Date | null
    nextLabel: string | null
    now: Date
}) {
    const row = { display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 0', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)' } as const
    const key = { color: 'var(--ink-2)', minWidth: 112, display: 'inline-block' } as const

    return (
        <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'var(--s1)', padding: '12px 14px', alignSelf: 'start' }}>
            <div style={{ ...label, marginBottom: 8 }}>Automation</div>
            <div style={row}><span style={key}>Driven by</span> cron, every 5 min</div>
            <div style={row}><span style={key}>Also fires from</span> this tab, live</div>
            <div style={row}>
                <span style={key}>Status</span>
                {paused
                    ? <span style={{ color: 'var(--warn)' }}>Paused — In Development</span>
                    : <span style={{ color: 'var(--good)' }}>Live</span>}
            </div>
            {nextAt && nextLabel && (
                <div style={row}>
                    <span style={key}>Next</span>
                    {nextLabel} in {fmtCountdown(nextAt, now) ?? 'moments'}
                </div>
            )}

            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)', fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                {blocked
                    ? <span style={{ color: 'var(--crit)' }}>Fix the error before publishing — a live schedule that cannot execute is worse than a paused one.</span>
                    : paused
                        ? 'Nothing on this timeline fires until the operation is published.'
                        : 'RSVP opens and closes, and the operation activates, without anyone here.'}
            </div>
        </div>
    )
}
