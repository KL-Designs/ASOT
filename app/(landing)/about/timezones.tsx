'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Typography, Divider } from '@mui/material'
import { DateTime } from 'luxon'



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
            <Typography>Our primary missions are run every Saturday and Sunday.</Typography>
            <br />
            <Typography>1 Platoon conducts missions on Saturday nights.</Typography>
            <Typography>2 Platoon conducts missions on Sunday nights.</Typography>
            <Typography>3 Platoon(Support Platoon) supports both Saturday and Sunday night missions.</Typography>
            <br />
            <Typography fontSize={14} className='mb-1' fontStyle={'italic'}>The times below have been converted to your local timezone.</Typography>
            <Typography className='underline'>When Daylight savings is not observed (First Sunday of April – First Sunday of October):</Typography>
            {localStandardTimes.map(({ label, time }, idx) => (
                <Typography key={idx}>
                    <b>{label}:</b>{' '}
                    <span style={{ backgroundColor: 'var(--grey)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                        {time.split(' ')[0]} {time.split(' ')[1].toUpperCase()} ({time.split(' ')[2]})
                    </span>
                </Typography>
            ))}
            <br />
            <Typography className='underline'>When Daylight savings is observed (First Sunday of October – First Sunday of April):</Typography>
            {localDaylightTimes.map(({ label, time }, idx) => (
                <Typography key={idx}>
                    <b>{label}:</b>{' '}
                    <span style={{ backgroundColor: 'var(--grey)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                        {time.split(' ')[0]} {time.split(' ')[1].toUpperCase()} ({time.split(' ')[2]})
                    </span>
                </Typography>
            ))}
            <br />
            <Typography>We also run missions and trainings throughout the week but these are optional.</Typography>
        </>
    )
}