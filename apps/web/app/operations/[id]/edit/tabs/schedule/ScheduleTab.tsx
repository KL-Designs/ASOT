'use client'

import type { Dayjs } from 'dayjs'
import PreProductionPanel, { type OrdersCheckTask } from './PreProductionPanel'
import RsvpWindowPanel from './RsvpWindowPanel'
import type { TimelineMoment } from '@/lib/operations/schedule'

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

    timeline: TimelineMoment[]
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
}

/**
 * The operation's lifecycle, read top to bottom as one countdown: development
 * gates weeks out, the RSVP window days and hours out, then the stage machine
 * on the day. Merged here from the old Development tab and the mission deck's
 * Timeline and Stage cards, which were three zoom levels on the same clock
 * split across two surfaces.
 *
 * `isHQ` gates the RSVP Window and Stage panels by not rendering them, exactly
 * as the deck cards were gated. Note it is true for every user who reaches
 * this editor (see the spec's Permissions section) — kept for continuity and
 * to suppress a flash before the permission fetch resolves.
 */
export default function ScheduleTab({
    opID, isHQ, isJ2Lead, title, date, isCampaignOp, campaignStartDate,
    missionDev, setMissionDev, ordersCheckTask, setOrdersCheckTask,
    timeline, onChangeDate, rsvpOpenAt, onSetRsvpOpenManual, onSetRsvpOpenScheduled,
    onChangeRsvpOpenAt, onQuickSetRsvpOpen, closeOffsetMins, onChangeCloseOffset,
    onChangeRsvpCloseAt, automationPaused,
}: Props) {
    return (
        <div style={{ width: '100%', maxWidth: 1220, margin: '0 auto', padding: 'clamp(1.5rem, 2.5vw, 2.5rem)', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <PreProductionPanel
                opID={opID}
                isJ2Lead={isJ2Lead}
                title={title}
                date={date}
                isCampaignOp={isCampaignOp}
                campaignStartDate={campaignStartDate}
                missionDev={missionDev}
                setMissionDev={setMissionDev}
                ordersCheckTask={ordersCheckTask}
                setOrdersCheckTask={setOrdersCheckTask}
            />
            {isHQ && (
                <RsvpWindowPanel
                    timeline={timeline}
                    date={date}
                    onChangeDate={onChangeDate}
                    rsvpOpenAt={rsvpOpenAt}
                    onSetRsvpOpenManual={onSetRsvpOpenManual}
                    onSetRsvpOpenScheduled={onSetRsvpOpenScheduled}
                    onChangeRsvpOpenAt={onChangeRsvpOpenAt}
                    onQuickSetRsvpOpen={onQuickSetRsvpOpen}
                    closeOffsetMins={closeOffsetMins}
                    onChangeCloseOffset={onChangeCloseOffset}
                    onChangeRsvpCloseAt={onChangeRsvpCloseAt}
                    automationPaused={automationPaused}
                />
            )}
            {/* Task 5 adds StagePanel here. */}
        </div>
    )
}
