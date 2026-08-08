'use client'

export default function LocalDate({ iso }: { iso: string }) {
    const date = new Date(iso)

    const parts = new Intl.DateTimeFormat('en-AU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
    }).formatToParts(date)

    const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''

    const formatted = `${get('day')} ${get('month')} ${get('year')} — ${get('hour')}:${get('minute')} ${get('dayPeriod')} ${get('timeZoneName')}`

    return <>{formatted.toUpperCase()}</>
}
