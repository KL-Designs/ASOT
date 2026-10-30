/**
 * Dates and times written into server-made text: notifications, Discord DMs,
 * task notes.
 *
 * A browser formats in its own zone, but these strings are made on the server,
 * whose zone is UTC — which is how a 12:00 training session went out as
 * "approved for 6 Nov 2026, 02:00". They are read later, by members anywhere
 * in Australia, so the zone is named rather than assumed: "1:00 pm AEDT".
 *
 * Sydney because it is the zone the rest of the server already writes in
 * (operation previews, Discord attendance posts).
 */
export const UNIT_TIME_ZONE = 'Australia/Sydney'

type Style = 'short' | 'medium' | 'long' | 'full'

function zoneName(d: Date): string {
    return new Intl.DateTimeFormat('en-AU', { timeZone: UNIT_TIME_ZONE, timeZoneName: 'short' })
        .formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? ''
}

/** "6 Nov 2026, 1:00 pm AEDT". */
export function unitDateTime(d: Date | string | number, dateStyle: Style = 'medium', locale = 'en-AU'): string {
    const at = new Date(d)
    const text = at.toLocaleString(locale, { dateStyle, timeStyle: 'short', timeZone: UNIT_TIME_ZONE })
    return `${text} ${zoneName(at)}`.trim()
}

/** A date with no time, on the unit's calendar: "6 Nov 2026". */
export function unitDate(d: Date | string | number, options: Intl.DateTimeFormatOptions = {}, locale = 'en-AU'): string {
    return new Date(d).toLocaleDateString(locale, { ...options, timeZone: UNIT_TIME_ZONE })
}
