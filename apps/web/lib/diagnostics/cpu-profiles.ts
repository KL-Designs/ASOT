import { resolve, join } from 'path'
import { existsSync, readdirSync, statSync } from 'fs'

/**
 * Shared file store for captured CPU profiles.
 *
 * The capture route and the download route previously carried their own copies
 * of the storage path and the filename regex. Keeping them here means the name
 * a capture writes cannot drift from the name a download is willing to serve.
 *
 * Overridable so unit tests can point at a scratch directory instead of the
 * real storage/ tree — same pattern as BACKUPS_STORAGE_ROOT in lib/backups.ts.
 */
const STORAGE_ROOT = process.env.DIAGNOSTICS_STORAGE_ROOT ?? resolve('../../storage')

export const DIAGNOSTICS_DIR = join(STORAGE_ROOT, 'diagnostics')

// `cpu-<ISO timestamp with : and . replaced by ->.cpuprofile`. Anchored, and
// with no wildcards, so it doubles as the path-traversal guard on the download
// route — nothing containing `/`, `\` or `..` can match it.
const FILENAME_PATTERN = /^cpu-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.cpuprofile$/

export type CpuProfileFile = {
    filename:   string
    capturedAt: string   // ISO 8601, decoded back out of the filename
    sizeBytes:  number
}

export function cpuProfileFilename(date: Date): string {
    return `cpu-${date.toISOString().replace(/[:.]/g, '-')}.cpuprofile`
}

export function isValidCpuProfileFilename(filename: string): boolean {
    return FILENAME_PATTERN.test(filename)
}

/** Absolute path for a profile, or null if the name is not one we generated. */
export function cpuProfilePath(filename: string): string | null {
    if (!isValidCpuProfileFilename(filename)) return null
    return join(DIAGNOSTICS_DIR, filename)
}

/**
 * Every captured profile on disk, newest first. Returns an empty list when the
 * directory is absent — that is the normal state until the first capture, not
 * an error worth surfacing to the panel.
 */
export function listCpuProfiles(): CpuProfileFile[] {
    if (!existsSync(DIAGNOSTICS_DIR)) return []

    return readdirSync(DIAGNOSTICS_DIR)
        .map(filename => {
            const match = FILENAME_PATTERN.exec(filename)
            if (!match) return null

            const [, date, hh, mm, ss, ms] = match
            return {
                filename,
                capturedAt: `${date}T${hh}:${mm}:${ss}.${ms}Z`,
                sizeBytes:  statSync(join(DIAGNOSTICS_DIR, filename)).size,
            }
        })
        .filter((p): p is CpuProfileFile => p !== null)
        .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
}
