import { fromZonedTime } from 'date-fns-tz'

/** DD/MM/YYYY -> {day,month,year} or null if malformed / not a real calendar date. */
function parseDateStr(dateStr: string): { day: number; month: number; year: number } | null {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return null
    const [day, month, year] = dateStr.split('/').map(Number)
    const check = new Date(year, month - 1, day)
    if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null
    return { day, month, year }
}

export function isRealDate(dateStr: string): boolean {
    return parseDateStr(dateStr) !== null
}

/**
 * Interpret a DD/MM/YYYY date and HH:MM time as wall-clock time in `timezone`,
 * returning the correct UTC epoch ms. Returns null if either string is malformed.
 * Replaces the old setDate()-before-setMonth() construction, which overflowed
 * into the wrong month whenever the target day exceeded the *current* month's length.
 */
export function fromZoned(dateStr: string, timeStr: string, timezone: string): number | null {
    const date = parseDateStr(dateStr)
    if (!date) return null
    if (!/^\d{2}:\d{2}$/.test(timeStr)) return null
    const [hours, minutes] = timeStr.split(':').map(Number)
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

    const iso = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
    return fromZonedTime(iso, timezone).getTime()
}

function nextWeekday(from: Date, targetDay: number): Date {
    const result = new Date(from)
    const diff = (targetDay + 7 - result.getDay()) % 7 || 7
    result.setDate(result.getDate() + diff)
    return result
}

export const TIME_PRESETS: { id: string; label: string; compute: (timezone: string) => number }[] = [
    { id: '1h', label: 'In 1 Hour', compute: () => Date.now() + 60 * 60_000 },
    { id: '3h', label: 'In 3 Hours', compute: () => Date.now() + 3 * 60 * 60_000 },
    {
        id: 'tomorrow9', label: 'Tomorrow 9am', compute: (timezone) => {
            const tomorrow = new Date(Date.now() + 24 * 60 * 60_000)
            const dateStr = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}/${tomorrow.getFullYear()}`
            return fromZoned(dateStr, '09:00', timezone)!
        }
    },
    {
        id: 'nextmon9', label: 'Next Monday 9am', compute: (timezone) => {
            const monday = nextWeekday(new Date(), 1)
            const dateStr = `${String(monday.getDate()).padStart(2, '0')}/${String(monday.getMonth() + 1).padStart(2, '0')}/${monday.getFullYear()}`
            return fromZoned(dateStr, '09:00', timezone)!
        }
    },
]

export const REPEAT_PRESETS: { id: string; label: string; ms: number }[] = [
    { id: 'none', label: 'None', ms: 0 },
    { id: '15m', label: 'Every 15 minutes', ms: 15 * 60_000 },
    { id: '30m', label: 'Every 30 minutes', ms: 30 * 60_000 },
    { id: 'hourly', label: 'Hourly', ms: 60 * 60_000 },
    { id: 'daily', label: 'Daily', ms: 24 * 60 * 60_000 },
    { id: 'weekly', label: 'Weekly', ms: 7 * 24 * 60 * 60_000 },
    { id: 'monthly', label: 'Every 30 days', ms: 30 * 24 * 60 * 60_000 },
]

export const CHASEUP_PRESETS: { id: string; label: string; ms: number }[] = [
    { id: 'none', label: 'None', ms: 0 },
    { id: '15m', label: '15 min after', ms: 15 * 60_000 },
    { id: '30m', label: '30 min after', ms: 30 * 60_000 },
    { id: '1h', label: '1 hour after', ms: 60 * 60_000 },
]
