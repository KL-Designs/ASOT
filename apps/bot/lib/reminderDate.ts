import { fromZonedTime, toZonedTime } from 'date-fns-tz'

const DAY_MS = 24 * 60 * 60_000

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

/**
 * The first scheduled occurrence after `now`. Stepping just one `repeat` from the
 * previous expected time left it in the past after any downtime, so the bot would
 * then fire every missed occurrence back-to-back.
 *
 * Repeats in whole days step on the wall clock in `timezone` when there is one, so
 * a daily 9am reminder stays at 9am across a daylight saving change instead of
 * drifting to 8am or 10am. Shorter repeats ("every 3 hours") stay fixed intervals.
 */
export function nextOccurrence(expected: Date, repeat: number, now: Date, timezone?: string | null): Date {
    if (repeat <= 0) return expected
    const steps = Math.max(Math.floor((now.getTime() - expected.getTime()) / repeat) + 1, 1)

    if (timezone && repeat % DAY_MS === 0) {
        try {
            const days = repeat / DAY_MS
            const wallClock = toZonedTime(expected, timezone)
            let next: Date
            let k = steps
            do {
                const candidate = new Date(wallClock)
                candidate.setDate(candidate.getDate() + k * days)
                next = fromZonedTime(candidate, timezone)
                if (isNaN(next.getTime())) throw new RangeError(`Bad timezone ${timezone}`)
                k++
            } while (next.getTime() <= now.getTime())
            return next
        } catch { /* unrecognised zone stored, fall back to a fixed interval */ }
    }

    return new Date(expected.getTime() + steps * repeat)
}

function nextWeekday(from: Date, targetDay: number): Date {
    const result = new Date(from)
    const diff = (targetDay + 7 - result.getDay()) % 7 || 7
    result.setDate(result.getDate() + diff)
    return result
}

export const TIME_PRESETS: { id: string; label: string; needsTimezone: boolean; compute: (timezone: string) => number }[] = [
    { id: '1h', label: 'In 1 Hour', needsTimezone: false, compute: () => Date.now() + 60 * 60_000 },
    { id: '3h', label: 'In 3 Hours', needsTimezone: false, compute: () => Date.now() + 3 * 60 * 60_000 },
    {
        id: 'tomorrow9', label: 'Tomorrow 9am', needsTimezone: true, compute: (timezone) => {
            const nowInZone = toZonedTime(new Date(), timezone)
            nowInZone.setDate(nowInZone.getDate() + 1)
            const dateStr = `${String(nowInZone.getDate()).padStart(2, '0')}/${String(nowInZone.getMonth() + 1).padStart(2, '0')}/${nowInZone.getFullYear()}`
            return fromZoned(dateStr, '09:00', timezone)!
        }
    },
    {
        id: 'nextmon9', label: 'Next Monday 9am', needsTimezone: true, compute: (timezone) => {
            const nowInZone = toZonedTime(new Date(), timezone)
            const monday = nextWeekday(nowInZone, 1)
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
