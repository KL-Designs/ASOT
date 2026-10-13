'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Dayjs } from 'dayjs'
import TabPanel from '../TabPanel'
import AnchorBar from './AnchorBar'
import PhaseRibbon from './PhaseRibbon'
import PreProductionInspector, { type OrdersCheckTask } from './PreProductionInspector'
import RsvpWindowInspector from './RsvpWindowInspector'
import LifecycleOverride from './LifecycleOverride'
import { btnTone, chip } from './controls'
import { buildRibbon } from '@/lib/operations/phases'
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
    openOffsetMins: number | null
    onChangeOpenOffset: (mins: number | null) => void
    onChangeRsvpOpenAt: (v: Dayjs | null) => void
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
 * The Schedule tab, as two separate jobs and one correction tool.
 *
 * **Pre-production checks** is the making of the mission: what has to be done,
 * by when, what each check involves, ticking the steps off, and requesting a
 * mission check. Nothing in it is about when the mission runs.
 *
 * **Schedule** is the running of it: the operation date and when sign-ups open
 * and close. Nothing in it is about building the mission.
 *
 * They used to be one panel. A ribbon drew the operation's whole life, and
 * under it a row of five phase buttons selected which phase's controls to show
 * — the ribbon's own segments did the same, so two controls lit up and opened
 * the same thing, and the checks and the sign-up window took turns in one
 * inspector as if they were the same kind of thing. Three of the five phases
 * had no controls at all, only a paragraph. Now nothing is selected: each job
 * is on screen under its own heading, and the ribbon is a picture of the
 * timeline rather than a second way of driving the tab.
 *
 * This file only arranges. The checks' completion and the mission-check
 * request are `PreProductionInspector`, and the notifications and tasks they
 * raise for the mission maker and J2 leads are raised by the routes it calls —
 * none of that moved.
 *
 * The clock is local and coarse (30s). The ribbon only ever needs to move the
 * `now` line and re-tone a phase; page.tsx's 1s `tickNow` exists to fire
 * automation the moment a scheduled time crosses zero, which is a different
 * job and a much higher rate than this needs.
 */
export default function ScheduleTab({
    opID, isHQ, isJ2Lead, title, date, isCampaignOp, campaignStartDate,
    missionDev, setMissionDev, ordersCheckTask, setOrdersCheckTask,
    onChangeDate, openOffsetMins, onChangeOpenOffset,
    onChangeRsvpOpenAt, closeOffsetMins, onChangeCloseOffset,
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
        rsvpOpenOffsetMins: openOffsetMins,
        rsvpCloseOffsetMins: closeOffsetMins,
        isCampaignOp,
        campaignStartDate: campaignStartDate ? new Date(campaignStartDate) : null,
        completions: missionDev?.completions ?? {},
        ordersCheckAt: ordersCheckTask?.ordersCheckAt ? new Date(ordersCheckTask.ordersCheckAt) : null,
        now,
    }), [date, openOffsetMins, closeOffsetMins, isCampaignOp, campaignStartDate, missionDev, ordersCheckTask, now])

    const critical = ribbon.problems.find(p => p.severity === 'critical')
    const blocked = ribbon.problems.some(p => p.blocksPublish)

    const gatesDone = ribbon.gates.filter(g => g.state === 'done').length
    const gatesOverdue = ribbon.gates.filter(g => g.state === 'overdue').length

    const next = ribbon.boundaries.find(b => b.at && b.at > now && b.state !== 'invalid')

    return (
        <div style={{ width: '100%', padding: 'clamp(1.5rem, 2.5vw, 2.5rem)', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Making the mission ─────────────────────────────────────── */}
            <TabPanel
                title="Pre-production checks"
                horizon={ribbon.gates.length ? `${gatesDone} of ${ribbon.gates.length} complete` : undefined}
                badge={gatesOverdue > 0 ? <span style={chip('warn')}>{gatesOverdue} overdue</span> : undefined}
            >
                <div style={{ padding: 16 }}>
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
                </div>
            </TabPanel>

            {/* ── Running the mission ────────────────────────────────────── */}
            <TabPanel
                title="Schedule"
                badge={<>
                    {critical && <span style={chip('crit')}>{critical.id === 'rsvp_inverted' ? 'Sign-up window inverted' : 'Schedule error'}</span>}
                    {automationPaused && <span style={chip()}>Automation paused</span>}
                </>}
            >
                <AnchorBar date={date} onChangeDate={onChangeDate} now={now} note='when the mission runs' />

                {/* A picture of the timeline, not a control. */}
                <PhaseRibbon ribbon={ribbon} now={now} />

                <div style={{ borderTop: '1px solid var(--line)', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {critical && (
                        <div style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            border: '1px solid rgba(192,90,72,0.45)', borderLeft: '2px solid var(--crit)',
                            background: 'rgba(192,90,72,0.07)', borderRadius: 'var(--r)',
                            padding: '9px 12px', fontSize: 12, color: 'var(--ink-2)',
                        }}>
                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--crit)', flex: '0 0 auto' }}>!</span>
                            <span>{critical.message}</span>
                            {critical.fix && date && (
                                <button
                                    type="button"
                                    onClick={() => onChangeOpenOffset(critical.fix!.minutesBeforeOp)}
                                    style={{ ...btnTone('acc'), marginLeft: 'auto', flex: '0 0 auto' }}
                                >
                                    {critical.fix.label}
                                </button>
                            )}
                        </div>
                    )}

                    {isHQ && (
                        <RsvpWindowInspector
                            ribbon={ribbon}
                            date={date}
                            openOffsetMins={openOffsetMins}
                            onChangeOpenOffset={onChangeOpenOffset}
                            onChangeRsvpOpenAt={onChangeRsvpOpenAt}
                            closeOffsetMins={closeOffsetMins}
                            onChangeCloseOffset={onChangeCloseOffset}
                            onChangeRsvpCloseAt={onChangeRsvpCloseAt}
                        />
                    )}

                    {/* One line on whether the schedule is actually running.
                        It used to be a side panel that also explained the cron. */}
                    <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: blocked ? 'var(--crit)' : 'var(--ink-3)' }}>
                        {blocked
                            ? 'Fix the error above before publishing: a schedule that cannot run is worse than a paused one.'
                            : automationPaused
                                ? 'Nothing on this schedule fires until the operation is published.'
                                : next?.at
                                    ? `Running automatically. Next: ${next.label} in ${fmtCountdown(next.at, now) ?? 'moments'}.`
                                    : 'Running automatically.'}
                    </p>
                </div>
            </TabPanel>

            {/* Status and stage together: both are the same kind of thing —
                what the system believes, set by hand, against what the schedule
                would otherwise do. */}
            {isHQ && (
                <TabPanel
                    title="Lifecycle override"
                    horizon={canOverrideLifecycle ? 'manual' : 'advance only'}
                    badge={automationPaused ? <span style={chip('warn')}>Automation suspended</span> : undefined}
                >
                    <LifecycleOverride
                        status={status}
                        canOverride={canOverrideLifecycle}
                        onChangeStatus={onChangeStatus}
                        onCompleteMission={onCompleteMission}
                        completingMission={completingMission}
                        stage={stage}
                        onAdvance={onAdvance}
                        onSelectStage={onSelect}
                        advancing={advancing}
                    />
                </TabPanel>
            )}
        </div>
    )
}
