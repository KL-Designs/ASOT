'use client'

import { useState, type CSSProperties } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import Panel from './Panel'
import { rsvpCloseAt, type TimelineMoment } from '@/lib/operations/schedule'

interface Props {
    timeline: TimelineMoment[]

    /** Committed operation date — drives the op_starts picker. */
    date: Dayjs | null
    onChangeDate: (v: Dayjs | null) => void

    /**
     * Committed RSVP-open instant (null = manual). Drives the Manual/Scheduled
     * pills and the open-time picker directly — NOT timeline[i].at, which comes
     * from a 30s-polled live-status fetch and would lag every one of this
     * row's own writes by up to 30s (see git history: the card originally read
     * m.at here and the pills/picker went stale after every click).
     */
    rsvpOpenAt: string | null
    /** rsvp_opens: switch to manual (no automatic open) — a no-op if already manual. */
    onSetRsvpOpenManual: () => void
    /** rsvp_opens: switch to scheduled, defaulting to 3 days before the op date — a no-op if already scheduled, or if there's no op date to default from. */
    onSetRsvpOpenScheduled: () => void
    /** rsvp_opens: set an exact open instant directly off the picker. */
    onChangeRsvpOpenAt: (v: Dayjs | null) => void
    /** rsvp_opens: quick-set relative to the op date (see RELATIVE_OPEN_OPTS). */
    onQuickSetRsvpOpen: (mins: number) => void

    /** Committed RSVP-close lead time — drives the rsvp_closes select and (with `date`) its custom picker's value. */
    closeOffsetMins: number
    onChangeCloseOffset: (mins: number) => void
    /** rsvp_closes custom mode: set an exact close instant; the card converts it to minutes-before-op-date. */
    onChangeRsvpCloseAt: (v: Dayjs | null) => void

    /** Status is "In Development" — cron/client-side auto-open/close/activate is suppressed (page.tsx's tickNow effect), so any scheduled time below is inert until the op is published. */
    automationPaused: boolean
}

/** Relative-to-op-date quick-sets for RSVP open — same four the old panel offered. */
const RELATIVE_OPEN_OPTS = [
    { label: '1 day before', mins: 1440 },
    { label: '3 days before', mins: 4320 },
    { label: '1 week before', mins: 10080 },
    { label: '2 weeks before', mins: 20160 },
]

/** RSVP-close presets — same eight the old panel offered, plus Custom…. */
const CLOSE_OFFSET_OPTS = [
    { label: '30 min before', mins: 30 },
    { label: '1 hour before', mins: 60 },
    { label: '1.5 hours before', mins: 90 },
    { label: '2 hours before', mins: 120 },
    { label: '3 hours before', mins: 180 },
    { label: '6 hours before', mins: 360 },
    { label: '12 hours before', mins: 720 },
    { label: '1 day before', mins: 1440 },
]

/**
 * The five-moment timeline that replaces the old Schedule & Automation panel.
 * Each row states its moment once — label, computed time, and (where it has
 * one) the control(s) that change it. `confirmations_open` and `completed`
 * are derived from the attendance stage and carry no control.
 *
 * Duplication rule: a row's `detail` text (the plain-English instant) is
 * shown only when no visible picker on that row already states the same
 * instant. op_starts always has a picker, so it never shows detail.
 * rsvp_opens hides detail once scheduled (the picker takes over); "Manual"
 * still needs detail since the pills alone don't say it. rsvp_closes hides
 * detail only in custom mode, where the picker restates the instant — the
 * preset select never does (it names an offset, not a time), so detail stays
 * the one place that states the resulting instant.
 */
export default function ScheduleCard({
    timeline, date, onChangeDate,
    rsvpOpenAt, onSetRsvpOpenManual, onSetRsvpOpenScheduled, onChangeRsvpOpenAt, onQuickSetRsvpOpen,
    closeOffsetMins, onChangeCloseOffset, onChangeRsvpCloseAt,
    automationPaused,
}: Props) {
    // Whether the rsvp_closes row shows the "Custom…" date picker. Starts open
    // if the committed offset isn't one of the presets (an existing custom
    // value), then tracks the select explicitly so switching back to a preset
    // hides it again without waiting for closeOffsetMins to change.
    const [closeCustomOpen, setCloseCustomOpen] = useState(
        () => !CLOSE_OFFSET_OPTS.some(o => o.mins === closeOffsetMins),
    )
    const isPresetClose = CLOSE_OFFSET_OPTS.some(o => o.mins === closeOffsetMins)
    const closeCustomVisible = closeCustomOpen || !isPresetClose

    // Local, immediate — not the polled timeline. See the `rsvpOpenAt` prop doc.
    const closeAtLocal = date ? rsvpCloseAt(date.toDate(), closeOffsetMins) : null

    return (
        <Panel title="Timeline">
            <div style={{ padding: '20px 16px 16px' }}>
                <div style={{ position: 'relative', paddingLeft: 24 }}>
                    <div style={{
                        position: 'absolute', left: 4, top: 8, bottom: 8,
                        width: 1, background: 'var(--line-2)',
                    }} />

                    {timeline.map((m, i) => {
                        const suppressDetail =
                            m.id === 'op_starts' ||
                            (m.id === 'rsvp_opens' && !!rsvpOpenAt) ||
                            (m.id === 'rsvp_closes' && closeCustomVisible)

                        return (
                        <div key={m.id} style={{ position: 'relative', paddingBottom: i === timeline.length - 1 ? 0 : 20 }}>
                            <div style={{
                                position: 'absolute', left: -24, top: 4,
                                width: 9, height: 9, borderRadius: '50%',
                                background: 'var(--bg)',
                                border: `2px solid ${m.state === 'current' ? 'var(--acc)' : 'var(--line-2)'}`,
                                boxShadow: m.state === 'current' ? '0 0 0 4px rgba(var(--acc-rgb), 0.12)' : undefined,
                            }} />

                            <div style={{
                                fontSize: 13.5, fontWeight: 600,
                                color: m.state === 'pending' ? 'var(--ink-2)' : 'var(--ink)',
                            }}>
                                {m.label}
                            </div>

                            {!suppressDetail && (
                                <div style={{
                                    fontFamily: 'var(--mono)', fontSize: 12,
                                    color: m.state === 'current' ? 'var(--acc)' : 'var(--ink-3)',
                                    marginTop: 3,
                                }}>
                                    {m.detail}
                                </div>
                            )}

                            {m.id === 'rsvp_opens' && (
                                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button type="button" onClick={onSetRsvpOpenManual} style={pillStyle(!rsvpOpenAt)}>
                                            Manual
                                        </button>
                                        <button type="button" onClick={onSetRsvpOpenScheduled} style={pillStyle(!!rsvpOpenAt)}>
                                            Scheduled
                                        </button>
                                    </div>

                                    {rsvpOpenAt && (
                                        <>
                                            <LocalizationProvider dateAdapter={AdapterDayjs}>
                                                <DateTimePicker
                                                    value={dayjs(rsvpOpenAt)}
                                                    format="DD/MM/YYYY HH:mm"
                                                    onChange={onChangeRsvpOpenAt}
                                                    slotProps={{ textField: { size: 'small', sx: pickerSx } }}
                                                />
                                            </LocalizationProvider>
                                            <select
                                                defaultValue=""
                                                onChange={e => {
                                                    const mins = Number(e.target.value)
                                                    if (mins) onQuickSetRsvpOpen(mins)
                                                    e.target.value = ''
                                                }}
                                                style={{ ...controlStyle, marginTop: 0, appearance: 'none' }}
                                            >
                                                <option value="" disabled>Relative to op date…</option>
                                                {RELATIVE_OPEN_OPTS.map(o => (
                                                    <option key={o.mins} value={o.mins}>{o.label}</option>
                                                ))}
                                            </select>
                                        </>
                                    )}

                                    {automationPaused && (
                                        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--warn)' }}>
                                            Automation paused — In Development
                                        </div>
                                    )}
                                </div>
                            )}

                            {m.id === 'rsvp_closes' && (
                                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <select
                                        value={isPresetClose && !closeCustomOpen ? closeOffsetMins : 'custom'}
                                        onChange={e => {
                                            if (e.target.value === 'custom') {
                                                setCloseCustomOpen(true)
                                            } else {
                                                setCloseCustomOpen(false)
                                                onChangeCloseOffset(Number(e.target.value))
                                            }
                                        }}
                                        style={{ ...controlStyle, appearance: 'none' }}
                                    >
                                        {CLOSE_OFFSET_OPTS.map(o => (
                                            <option key={o.mins} value={o.mins}>{o.label}</option>
                                        ))}
                                        <option value="custom">Custom…</option>
                                    </select>

                                    {closeCustomVisible && (
                                        <>
                                            <LocalizationProvider dateAdapter={AdapterDayjs}>
                                                <DateTimePicker
                                                    value={closeAtLocal ? dayjs(closeAtLocal) : null}
                                                    format="DD/MM/YYYY HH:mm"
                                                    onChange={onChangeRsvpCloseAt}
                                                    slotProps={{ textField: { size: 'small', sx: pickerSx } }}
                                                />
                                            </LocalizationProvider>
                                            {!date && (
                                                <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--warn)' }}>
                                                    Set an operation date first to compute the offset.
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {m.id === 'op_starts' && (
                                <div style={{ marginTop: 8 }}>
                                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                                        <DateTimePicker
                                            value={date}
                                            format="DD/MM/YYYY HH:mm"
                                            onChange={onChangeDate}
                                            // data-testid: the op-date input has no accessible
                                            // name/label of its own (MUI renders the picker's
                                            // sections as an unlabelled masked input), and it's
                                            // the one control operations-editor.spec.ts's
                                            // date-edit spec needs to select unambiguously among
                                            // the timeline's several other pickers/selects.
                                            slotProps={{ textField: { size: 'small', sx: pickerSx, inputProps: { 'data-testid': 'schedule-op-date-input' } } }}
                                        />
                                    </LocalizationProvider>
                                </div>
                            )}
                        </div>
                        )
                    })}
                </div>
            </div>
        </Panel>
    )
}

const controlStyle: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    marginTop: 8,
    border: '1px solid var(--line-2)', background: 'var(--s2)',
    borderRadius: 'var(--r)', padding: '6px 11px',
    fontFamily: 'var(--mono)', fontSize: 9.5,
    letterSpacing: '0.14em', textTransform: 'uppercase',
    color: 'var(--ink-2)', cursor: 'pointer',
}

function pillStyle(active: boolean): CSSProperties {
    return {
        flex: '1 1 0', textAlign: 'center',
        border: '1px solid var(--line-2)',
        background: active ? 'rgba(var(--acc-rgb), 0.18)' : 'var(--s2)',
        borderRadius: 'var(--r)', padding: '6px 11px',
        fontFamily: 'var(--mono)', fontSize: 9.5,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: active ? 'var(--ink)' : 'var(--ink-2)',
        cursor: 'pointer',
    }
}

const pickerSx = {
    width: '100%',
    '& .MuiInputBase-root': {
        background: 'var(--s2)',
        borderRadius: 'var(--r)',
        fontFamily: 'var(--mono)',
        fontSize: 12,
    },
    '& .MuiOutlinedInput-notchedOutline': {
        border: '1px solid var(--line-2)',
    },
    '& .MuiInputBase-input': {
        color: 'var(--ink-2)',
        padding: '6px 10px',
    },
    '& .MuiSvgIcon-root': {
        color: 'var(--ink-3)',
        fontSize: 16,
    },
}
