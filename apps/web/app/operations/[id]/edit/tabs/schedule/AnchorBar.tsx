'use client'

import type { Dayjs } from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { fmtCountdown } from '@/lib/operations/schedule'
import { pickerSx } from './controls'
import s from './ribbon.module.css'

interface Props {
    date: Dayjs | null
    onChangeDate: (v: Dayjs | null) => void
    now: Date
    /** Right-hand caption — varies with the selected phase, since what the
     * anchor implies for gates is not what it implies for RSVP. */
    note: string
}

/**
 * The operation date, permanently on screen above the ribbon.
 *
 * It is the anchor: every development gate, both RSVP boundaries and the
 * confirmation window are computed from it, so it is not one field among
 * fifteen in a sidebar — it is the input the whole tab is a function of.
 *
 * This is also the single control for the date. It previously existed twice —
 * once in the deck's Details card and once as a picker in the middle of the
 * RSVP timeline — which is one of the two places the old tab could show itself
 * contradictory values.
 */
export default function AnchorBar({ date, onChangeDate, now, note }: Props) {
    const until = date ? fmtCountdown(date.toDate(), now) : null

    return (
        <div className={s.anchorBar}>
            <span className={s.anchorLabel}>Operation date</span>

            <div style={{ width: 198, flex: '0 0 auto' }}>
                <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <DateTimePicker
                        value={date}
                        format="DD/MM/YYYY HH:mm"
                        onChange={onChangeDate}
                        // data-testid: the picker renders an unlabelled masked
                        // input with no accessible name of its own, and this is
                        // the control operations-editor.spec.ts's date-edit spec
                        // selects. The id moved here with the picker when the
                        // date left RsvpWindowPanel — keep it.
                        slotProps={{ textField: { size: 'small', sx: pickerSx, inputProps: { 'data-testid': 'schedule-op-date-input' } } }}
                    />
                </LocalizationProvider>
            </div>

            <span className={s.anchorMeta}>
                {date
                    ? <>
                        {date.toDate().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        {until ? <> · <b>in {until}</b></> : <> · <b>started</b></>}
                    </>
                    : 'No date set — nothing below can be scheduled'}
            </span>

            <span className={s.anchorNote}>{note}</span>
        </div>
    )
}
