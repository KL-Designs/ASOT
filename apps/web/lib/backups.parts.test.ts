/**
 * parseBackupParts() decides which parts of a backup an operation touches, and
 * two of its three callers overwrite live data with the result. So the rule it
 * encodes is deliberately asymmetric:
 *
 *   absent  → everything (what all three endpoints did before scoping existed)
 *   valid   → exactly what was asked for
 *   ANYTHING else → null, i.e. reject the request
 *
 * The failure mode being designed out is a malformed value silently widening a
 * gallery-only restore into one that also drops the database. Falling back to
 * "everything" on bad input would do exactly that.
 */
import { describe, test, expect } from 'vitest'
import { parseBackupParts, ALL_BACKUP_PARTS } from './backups'

describe('parseBackupParts', () => {
    test('absent input means every part', () => {
        expect(parseBackupParts(null)).toEqual([...ALL_BACKUP_PARTS])
        expect(parseBackupParts(undefined)).toEqual([...ALL_BACKUP_PARTS])
        expect(parseBackupParts('')).toEqual([...ALL_BACKUP_PARTS])
    })

    test('accepts a comma-separated string, as the query and form callers send', () => {
        expect(parseBackupParts('database')).toEqual(['database'])
        expect(parseBackupParts('gallery,uploads')).toEqual(['gallery', 'uploads'])
        expect(parseBackupParts(' database , gallery ')).toEqual(['database', 'gallery'])
    })

    test('accepts an array, as the JSON revert body sends', () => {
        expect(parseBackupParts(['uploads'])).toEqual(['uploads'])
        expect(parseBackupParts(['database', 'gallery', 'uploads'])).toEqual([...ALL_BACKUP_PARTS])
    })

    test('rejects unknown parts rather than ignoring them', () => {
        // Ignoring the unknown value would turn this into a database-only
        // restore, quietly doing something the caller did not ask for.
        expect(parseBackupParts('database,everything')).toBeNull()
        expect(parseBackupParts(['gallery', 'Uploads'])).toBeNull()   // case-sensitive on purpose
        expect(parseBackupParts('media')).toBeNull()                  // plausible but not a real part
    })

    test('rejects an explicitly empty selection', () => {
        // Distinct from absent: asking for nothing is a bug in the caller, and
        // treating it as "everything" would be the worst possible reading.
        expect(parseBackupParts([])).toBeNull()
        expect(parseBackupParts(',')).toBeNull()
        expect(parseBackupParts('   ')).toBeNull()
    })

    test('de-duplicates without changing the outcome', () => {
        expect(parseBackupParts('gallery,gallery')).toEqual(['gallery'])
    })
})
