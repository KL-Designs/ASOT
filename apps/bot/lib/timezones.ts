const ALL_TIMEZONES = Intl.supportedValuesOf('timeZone')

/** Filters IANA zone names by a case-insensitive substring match, capped to Discord's 25-option autocomplete limit. */
export function searchTimezones(query: string): { name: string; value: string }[] {
    const q = query.trim().toLowerCase()
    const matches = q ? ALL_TIMEZONES.filter(tz => tz.toLowerCase().includes(q)) : ALL_TIMEZONES
    return matches.slice(0, 25).map(tz => ({ name: tz.replace(/_/g, ' '), value: tz }))
}
