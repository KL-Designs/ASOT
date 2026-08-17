/**
 * Parsing the dates on a milpac.
 *
 * `enlistedDate`, `promotions[].date` and `awards[].date` are free-form strings
 * written by CSV imports, by the editor's text field and by hand over several
 * years. They arrive as "15 August 2020", "04 October 2024", "27/09/2024" and
 * "27-09-2024", and the day-first forms are the trap: `new Date('04/10/2024')`
 * reads that as 10 April, not 4 October, because bare slash dates are treated
 * as US month-first.
 *
 * Getting this wrong is not cosmetic. These dates are printed on certificates a
 * member keeps, and they decide which rank a historical citation is titled with.
 */

/** A milpac date, or null when nothing usable can be read from it. */
export function parseMilpacDate(raw: string | null | undefined): Date | null {
    if (!raw) return null
    const value = raw.trim()
    if (!value) return null

    // Day-first, parsed explicitly rather than handed to Date().
    const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value)
    if (dmy) {
        const [, day, month, year] = dmy
        const date = new Date(Number(year), Number(month) - 1, Number(day))
        // Rejects 31/02/2024: Date rolls it forward to 2 March rather than
        // failing, so the round-trip is what catches it.
        return date.getDate() === Number(day) && date.getMonth() === Number(month) - 1
            ? date
            : null
    }

    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}
