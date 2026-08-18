'use client'

import type { CSSProperties } from 'react'
import type { Dayjs } from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import Panel from './Panel'
import type { TimelineMoment } from '@/lib/operations/schedule'

interface Props {
    timeline: TimelineMoment[]
    /** Committed operation date — drives the op_starts picker. */
    date: Dayjs | null
    onChangeDate: (v: Dayjs | null) => void
    /** Toggles rsvp_opens between manual (null) and a computed default. */
    onChangeRsvpMode: () => void
    /** Committed RSVP-close lead time — drives the rsvp_closes select. */
    closeOffsetMins: number
    onChangeCloseOffset: (mins: number) => void
}

const CLOSE_OFFSETS = [30, 60, 90, 120, 180]

/**
 * The five-moment timeline that replaces the old Schedule & Automation panel.
 * Each row states its moment once — label, computed time, and (where it has
 * one) the single control that changes it. `confirmations_open` and
 * `completed` are derived from the attendance stage and carry no control.
 */
export default function ScheduleCard({
    timeline, date, onChangeDate, onChangeRsvpMode, closeOffsetMins, onChangeCloseOffset,
}: Props) {
    return (
        <Panel title="Timeline">
            <div style={{ padding: '20px 16px 16px' }}>
                <div style={{ position: 'relative', paddingLeft: 24 }}>
                    <div style={{
                        position: 'absolute', left: 4, top: 8, bottom: 8,
                        width: 1, background: 'var(--line-2)',
                    }} />

                    {timeline.map((m, i) => (
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

                            <div style={{
                                fontFamily: 'var(--mono)', fontSize: 12,
                                color: m.state === 'current' ? 'var(--acc)' : 'var(--ink-3)',
                                marginTop: 3,
                            }}>
                                {m.detail}
                            </div>

                            {m.id === 'rsvp_opens' && (
                                <button type="button" onClick={onChangeRsvpMode} style={controlStyle}>
                                    {m.at ? 'Switch to manual' : 'Schedule it'}
                                </button>
                            )}

                            {m.id === 'rsvp_closes' && (
                                <select
                                    value={closeOffsetMins}
                                    onChange={e => onChangeCloseOffset(Number(e.target.value))}
                                    style={{ ...controlStyle, appearance: 'none' }}
                                >
                                    {CLOSE_OFFSETS.map(o => (
                                        <option key={o} value={o}>{o} min before</option>
                                    ))}
                                </select>
                            )}

                            {m.id === 'op_starts' && (
                                <div style={{ marginTop: 8 }}>
                                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                                        <DateTimePicker
                                            value={date}
                                            format="DD/MM/YYYY HH:mm"
                                            onChange={onChangeDate}
                                            slotProps={{
                                                textField: {
                                                    size: 'small',
                                                    sx: {
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
                                                    },
                                                },
                                            }}
                                        />
                                    </LocalizationProvider>
                                </div>
                            )}
                        </div>
                    ))}
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
