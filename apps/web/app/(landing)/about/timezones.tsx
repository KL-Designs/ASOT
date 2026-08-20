'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { DateTime } from 'luxon'

import List from '@/components/ui/List'
import s from '@/styles/shell.module.css'



/**
 * `06:10 pm AEST` → `06:10 PM (AEST)`.
 *
 * The Intl output is restructured, not reformatted: this is exactly what the
 * page has always printed, and the redesign only moved it into a table.
 */
function formatTime(time: string): string {
    const [clock, meridiem, zone] = time.split(' ')
    if (!meridiem || !zone) return time
    return `${clock} ${meridiem.toUpperCase()} (${zone})`
}

export default function TimeZones() {
    interface LocalTime {
        label: string
        time: string
    }

    const [localStandardTimes, setLocalStandardTimes] = useState<LocalTime[]>([])
    const [localDaylightTimes, setLocalDaylightTimes] = useState<LocalTime[]>([])

    const standardTimes = [
        { label: 'Staff load in', time: '17:45', timezone: 'Australia/Brisbane' }, // AEST
        { label: 'Staff briefing', time: '17:50', timezone: 'Australia/Brisbane' },
        { label: 'All members load in', time: '18:00', timezone: 'Australia/Brisbane' },
        { label: 'Step off', time: '18:10', timezone: 'Australia/Brisbane' },
        { label: 'Mission end', time: '20:30', timezone: 'Australia/Brisbane' },
    ]

    const daylightTimes = [
        { label: 'Staff load in', time: '18:15', timezone: 'Australia/Sydney' }, // AEDT
        { label: 'Staff briefing', time: '18:20', timezone: 'Australia/Sydney' },
        { label: 'All members load in', time: '18:30', timezone: 'Australia/Sydney' },
        { label: 'Step off', time: '18:40', timezone: 'Australia/Sydney' },
        { label: 'Mission end', time: '21:00', timezone: 'Australia/Sydney' },
    ]

    function convertToLocal(times: { label: string; time: string; timezone: string }[], useStandardTime = false) {
        const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone

        return times.map(({ label, time, timezone }) => {
            const [hours, minutes] = time.split(':').map(Number)

            // Pick a fixed date in winter (June 1) for standard times to avoid DST
            const fixedDate = useStandardTime ? { year: 2025, month: 6, day: 1 } : undefined;

            const dt = DateTime.fromObject(
                {
                    hour: hours,
                    minute: minutes,
                    ...fixedDate,
                },
                { zone: timezone }
            );

            const userDT = dt.setZone(userTZ)

            const localTimeString = new Intl.DateTimeFormat('en-AU', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: userTZ,
                timeZoneName: 'short',
            }).format(userDT.toJSDate())

            return { label, time: localTimeString }
        })
    }


    useEffect(() => {
        setLocalStandardTimes(convertToLocal(standardTimes, true))
        setLocalDaylightTimes(convertToLocal(daylightTimes))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- convert once on mount; prop values are static schedule data
    }, [])

    return (
        <>
            <p>Our primary missions are run every Saturday and Sunday.</p>
            <List
                columns={3}
                items={[
                    '1 Platoon conducts missions on Saturday nights.',
                    '2 Platoon conducts missions on Sunday nights.',
                    '3 Platoon(Support Platoon) supports both Saturday and Sunday night missions.',
                ]}
            />

            <div className={s.sched}>
                <div className={s.schedCol}>
                    <h4>When Daylight savings is not observed</h4>
                    <span className={s.schedWin}>First Sunday of April – First Sunday of October</span>
                    {localStandardTimes.map(({ label, time }, i) => (
                        <div key={i} className={label === 'Step off' ? `${s.schedRow} ${s.schedHi}` : s.schedRow}>
                            <span>{label}</span>
                            <b>{formatTime(time)}</b>
                        </div>
                    ))}
                </div>
                <div className={s.schedCol}>
                    <h4>When Daylight savings is observed</h4>
                    <span className={s.schedWin}>First Sunday of October – First Sunday of April</span>
                    {localDaylightTimes.map(({ label, time }, i) => (
                        <div key={i} className={label === 'Step off' ? `${s.schedRow} ${s.schedHi}` : s.schedRow}>
                            <span>{label}</span>
                            <b>{formatTime(time)}</b>
                        </div>
                    ))}
                </div>
            </div>

            <p className={s.schedNote}>The times above have been converted to your local timezone.</p>
            <p>We also run missions and trainings throughout the week but these are optional.</p>
        </>
    )
}