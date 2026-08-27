'use client'

import { useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { fmtDuration, type Ribbon } from '@/lib/operations/phases'
import { chip, label, pickerSx, pickerSxInvalid, selectStyle } from './controls'

interface Props {
    ribbon: Ribbon
    date: Dayjs | null
    openOffsetMins: number | null
    onChangeOpenOffset: (mins: number | null) => void
    /** Custom mode: an exact instant, which the caller converts to an offset. */
    onChangeRsvpOpenAt: (v: Dayjs | null) => void
    closeOffsetMins: number
    onChangeCloseOffset: (mins: number) => void
    onChangeRsvpCloseAt: (v: Dayjs | null) => void
}

/** Open presets — the far end of the window, so these run long. */
const OPEN_OFFSET_OPTS = [
    { label: '2 weeks before', mins: 20160 },
    { label: '1 week before', mins: 10080 },
    { label: '5 days before', mins: 7200 },
    { label: '3 days before', mins: 4320 },
    { label: '2 days before', mins: 2880 },
    { label: '1 day before', mins: 1440 },
    { label: '12 hours before', mins: 720 },
]

/** Close presets — the near end. */
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

/** Shared shape for both ends, so the two columns cannot drift apart. */
function offsetLabel(opts: { label: string; mins: number }[], mins: number): string {
    return opts.find(o => o.mins === mins)?.label ?? `${mins} min before`
}

/**
 * Both ends of the RSVP window, expressed the same way and edited together.
 *
 * The two ends used to be authored differently — close as a lead time, open as
 * an absolute datetime with a Manual/Scheduled toggle in front of it. That
 * asymmetry was the bug: moving the operation moved the close end and left the
 * open end where it was, which is how an operation ends up with RSVP opening
 * weeks after it ran. Both are now minutes-before-the-operation, so the whole
 * window follows its anchor and ordering is a comparison of two numbers.
 *
 * The Manual/Scheduled toggle is gone with it. It offered a mode where nothing
 * opened RSVP automatically, which the stage machine already provides — the
 * Advance button opens RSVP by hand whether or not a time is scheduled — so
 * the toggle was a second way to express something the lifecycle panel already
 * says better. An operation with no offset set simply has no automatic open.
 *
 * Note the direction throughout: a *larger* offset is *earlier*, so a valid
 * window has open > close.
 */
export default function RsvpWindowInspector({
    ribbon, date,
    openOffsetMins, onChangeOpenOffset, onChangeRsvpOpenAt,
    closeOffsetMins, onChangeCloseOffset, onChangeRsvpCloseAt,
}: Props) {
    const { window: w } = ribbon

    const isPresetOpen = openOffsetMins !== null && OPEN_OFFSET_OPTS.some(o => o.mins === openOffsetMins)
    const isPresetClose = CLOSE_OFFSET_OPTS.some(o => o.mins === closeOffsetMins)

    // Each end starts in custom mode when its committed offset isn't one of the
    // presets, then tracks its own select so switching back to a preset hides
    // the picker again without waiting on the offset to change.
    const [openCustomOpen, setOpenCustomOpen] = useState(() => openOffsetMins !== null && !isPresetOpen)
    const [closeCustomOpen, setCloseCustomOpen] = useState(() => !isPresetClose)

    const openCustomVisible = openOffsetMins !== null && (openCustomOpen || !isPresetOpen)
    const closeCustomVisible = closeCustomOpen || !isPresetClose

    if (!date) {
        return (
            <div style={{ padding: 16, fontSize: '0.78rem', color: 'var(--ink-3)', fontStyle: 'italic' }}>
                Set an operation date above to schedule the RSVP window.
            </div>
        )
    }

    const hint = { fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5 } as const

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>RSVP window</span>
                {w.inverted
                    ? <>
                        <span style={chip('crit')}>Inverted</span>
                        <span style={chip('crit')}>{fmtDuration(w.durationMs)}</span>
                    </>
                    : w.mode === 'unset'
                        ? <span style={chip()}>No open scheduled</span>
                        : <span style={chip('acc')}>{fmtDuration(w.durationMs)}</span>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div style={{ ...label, color: w.inverted ? 'var(--crit)' : 'var(--ink-3)' }}>Opens</div>

                    <select
                        value={openOffsetMins === null ? 'none' : (isPresetOpen && !openCustomOpen ? openOffsetMins : 'custom')}
                        onChange={e => {
                            if (e.target.value === 'none') {
                                setOpenCustomOpen(false)
                                onChangeOpenOffset(null)
                            } else if (e.target.value === 'custom') {
                                setOpenCustomOpen(true)
                                // Give the picker something to show if there is
                                // nothing committed yet to anchor it.
                                if (openOffsetMins === null) onChangeOpenOffset(4320)
                            } else {
                                setOpenCustomOpen(false)
                                onChangeOpenOffset(Number(e.target.value))
                            }
                        }}
                        style={selectStyle}
                    >
                        <option value="none">No automatic open</option>
                        {OPEN_OFFSET_OPTS.map(o => (
                            <option key={o.mins} value={o.mins}>{o.label}</option>
                        ))}
                        <option value="custom">Custom…</option>
                    </select>

                    {openCustomVisible && (
                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                            <DateTimePicker
                                value={w.opensAt ? dayjs(w.opensAt) : null}
                                format="DD/MM/YYYY HH:mm"
                                onChange={onChangeRsvpOpenAt}
                                slotProps={{ textField: { size: 'small', sx: w.inverted ? pickerSxInvalid : pickerSx } }}
                            />
                        </LocalizationProvider>
                    )}

                    <div style={hint}>
                        {openOffsetMins === null
                            ? 'Nothing opens RSVP on its own. Advance the stage to open it by hand.'
                            : 'Stored as an offset from the op date, so it follows if the date moves.'}
                    </div>
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

                    <div style={hint}>
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
                    : openOffsetMins === null
                        ? <>Opens by hand · closes <span style={{ color: 'var(--ink-2)' }}>{offsetLabel(CLOSE_OFFSET_OPTS, closeOffsetMins)}</span></>
                        : <>
                            Window <span style={{ color: 'var(--ink-2)' }}>{fmtDuration(w.durationMs)}</span>
                            {' · opens '}<span style={{ color: 'var(--ink-2)' }}>{offsetLabel(OPEN_OFFSET_OPTS, openOffsetMins)}</span>
                            {' · closes '}<span style={{ color: 'var(--ink-2)' }}>{offsetLabel(CLOSE_OFFSET_OPTS, closeOffsetMins)}</span>
                        </>}
            </div>
        </div>
    )
}
