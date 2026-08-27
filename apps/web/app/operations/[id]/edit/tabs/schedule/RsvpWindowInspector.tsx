'use client'

import { useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { fmtDuration, type Ribbon } from '@/lib/operations/phases'
import { chip, label, pill, pickerSx, pickerSxInvalid, selectStyle } from './controls'

interface Props {
    ribbon: Ribbon
    date: Dayjs | null
    onSetRsvpOpenManual: () => void
    onSetRsvpOpenScheduled: () => void
    onChangeRsvpOpenAt: (v: Dayjs | null) => void
    onQuickSetRsvpOpen: (mins: number) => void
    closeOffsetMins: number
    onChangeCloseOffset: (mins: number) => void
    onChangeRsvpCloseAt: (v: Dayjs | null) => void
}

/** Relative-to-op-date quick-sets for the open end — the same four as before. */
const RELATIVE_OPEN_OPTS = [
    { label: '1 day before', mins: 1440 },
    { label: '3 days before', mins: 4320 },
    { label: '1 week before', mins: 10080 },
    { label: '2 weeks before', mins: 20160 },
]

/** Close presets — the same eight as before, plus Custom…. */
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
 * Both ends of the RSVP window, edited together.
 *
 * The old panel gave open and close a row each, side by side in an auto-fit
 * grid, as though they were two independent moments that happened to be near
 * each other. They are one object with a duration, and treating them as two is
 * exactly how an operation ends up opening RSVP six weeks after it closes with
 * nothing on screen objecting.
 *
 * The asymmetry in storage stays — open is an absolute instant, close an
 * offset back from the op date — because that is what the attendance document
 * holds. It is stated in the UI rather than hidden, since it is the reason the
 * close end follows the operation date and the open end does not.
 */
export default function RsvpWindowInspector({
    ribbon, date,
    onSetRsvpOpenManual, onSetRsvpOpenScheduled, onChangeRsvpOpenAt, onQuickSetRsvpOpen,
    closeOffsetMins, onChangeCloseOffset, onChangeRsvpCloseAt,
}: Props) {
    const { window: w } = ribbon

    // Starts open when the committed offset isn't one of the presets, then
    // tracks the select so switching back to a preset hides it again without
    // waiting on closeOffsetMins to change.
    const isPresetClose = CLOSE_OFFSET_OPTS.some(o => o.mins === closeOffsetMins)
    const [closeCustomOpen, setCloseCustomOpen] = useState(() => !isPresetClose)
    const closeCustomVisible = closeCustomOpen || !isPresetClose

    if (!date) {
        return (
            <div style={{ padding: 16, fontSize: '0.72rem', color: 'var(--ink-3)', fontStyle: 'italic' }}>
                Set an operation date above to schedule the RSVP window.
            </div>
        )
    }

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>RSVP window</span>
                {w.inverted
                    ? <>
                        <span style={chip('crit')}>Inverted</span>
                        <span style={chip('crit')}>{fmtDuration(w.durationMs)}</span>
                    </>
                    : <>
                        <span style={chip('acc')}>{w.mode === 'manual' ? 'Manual' : 'Scheduled'}</span>
                        {w.durationMs !== null && <span style={chip()}>{fmtDuration(w.durationMs)}</span>}
                    </>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div style={{ ...label, color: w.inverted ? 'var(--crit)' : 'var(--ink-3)' }}>Opens</div>

                    <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={onSetRsvpOpenManual} style={pill(w.mode === 'manual')}>
                            Manual
                        </button>
                        <button type="button" onClick={onSetRsvpOpenScheduled} style={pill(w.mode === 'scheduled')}>
                            Scheduled
                        </button>
                    </div>

                    {w.opensAt && (
                        <>
                            <LocalizationProvider dateAdapter={AdapterDayjs}>
                                <DateTimePicker
                                    value={dayjs(w.opensAt)}
                                    format="DD/MM/YYYY HH:mm"
                                    onChange={onChangeRsvpOpenAt}
                                    slotProps={{ textField: { size: 'small', sx: w.inverted ? pickerSxInvalid : pickerSx } }}
                                />
                            </LocalizationProvider>
                            <select
                                defaultValue=""
                                onChange={e => {
                                    const mins = Number(e.target.value)
                                    if (mins) onQuickSetRsvpOpen(mins)
                                    e.target.value = ''
                                }}
                                style={selectStyle}
                            >
                                <option value="" disabled>Relative to op date…</option>
                                {RELATIVE_OPEN_OPTS.map(o => (
                                    <option key={o.mins} value={o.mins}>{o.label}</option>
                                ))}
                            </select>
                        </>
                    )}

                    {w.mode === 'manual' && (
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                            Nothing opens RSVP on its own. Someone advances the stage by hand.
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div style={label}>Closes</div>

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
                        style={selectStyle}
                    >
                        {CLOSE_OFFSET_OPTS.map(o => (
                            <option key={o.mins} value={o.mins}>{o.label}</option>
                        ))}
                        <option value="custom">Custom…</option>
                    </select>

                    {closeCustomVisible && (
                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                            <DateTimePicker
                                value={w.closesAt ? dayjs(w.closesAt) : null}
                                format="DD/MM/YYYY HH:mm"
                                onChange={onChangeRsvpCloseAt}
                                slotProps={{ textField: { size: 'small', sx: pickerSx } }}
                            />
                        </LocalizationProvider>
                    )}

                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                        Stored as an offset from the op date, so it follows if the date moves.
                    </div>
                </div>
            </div>

            <div style={{
                marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)',
                fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)', letterSpacing: '0.04em',
            }}>
                {w.inverted
                    ? <>Window <span style={{ color: 'var(--crit)' }}>{fmtDuration(w.durationMs)}</span> — a window cannot close before it opens</>
                    : w.mode === 'manual'
                        ? <>Opens by hand · closes <span style={{ color: 'var(--ink-2)' }}>{CLOSE_OFFSET_OPTS.find(o => o.mins === closeOffsetMins)?.label ?? `${closeOffsetMins} min before`}</span></>
                        : <>Window <span style={{ color: 'var(--ink-2)' }}>{fmtDuration(w.durationMs)}</span> · closes <span style={{ color: 'var(--ink-2)' }}>{CLOSE_OFFSET_OPTS.find(o => o.mins === closeOffsetMins)?.label ?? `${closeOffsetMins} min before`}</span></>}
            </div>
        </div>
    )
}
