'use client'

import { useEffect, useState } from 'react'
import { Badge, Panel, PanelBody, PanelHeader, Select } from '@/components/dashboard'
import s from '@/styles/dashboard.module.css'

const ALL_TIMEZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []

/**
 * The timezone every reminder you set is interpreted in — on the site and in
 * the Discord bot both.
 */
export function TimezoneCard({ initialTimezone }: { initialTimezone: string | null }) {
    const [timezone, setTimezone] = useState(initialTimezone ?? '')
    const [saving, setSaving] = useState(false)
    const [autoDetected, setAutoDetected] = useState(false)

    async function saveTimezone(value: string) {
        setTimezone(value)
        setSaving(true)
        await fetch('/api/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone: value }),
        })
        setSaving(false)
    }

    // Auto-detect once on mount if the user has no timezone saved yet. Runs only
    // when initialTimezone was null/empty at page load — deliberately excluded
    // from the dependency array so it never re-fires after the user picks one.
    useEffect(() => {
        if (initialTimezone) return
        const detected = typeof Intl.DateTimeFormat === 'function'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : null
        if (detected && ALL_TIMEZONES.includes(detected)) {
            setAutoDetected(true)
            saveTimezone(detected)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function handleChange(value: string) {
        setAutoDetected(false)
        saveTimezone(value)
    }

    return (
        <Panel>
            <PanelHeader
                title='Timezone'
                sub='Interprets the times you type into reminders, here and in Discord.'
                right={autoDetected ? <Badge tone='info' dot>From your browser</Badge> : null}
            />
            <PanelBody className='flex flex-col gap-2'>
                <Select
                    value={timezone}
                    onChange={e => handleChange(e.target.value)}
                    disabled={saving}
                    aria-label='Timezone'
                >
                    {!timezone && <option value=''>Select your timezone…</option>}
                    {ALL_TIMEZONES.map(tz => (
                        <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                    ))}
                </Select>
                {autoDetected && (
                    <span className={s.hint}>
                        Detected as {timezone.replace(/_/g, ' ')} — change it above if that&apos;s wrong.
                    </span>
                )}
            </PanelBody>
        </Panel>
    )
}

export default TimezoneCard
