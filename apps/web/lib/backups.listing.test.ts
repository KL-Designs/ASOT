/**
 * How restic snapshots become timeline points.
 *
 * The rule that matters: a run's database and media snapshots pair into ONE
 * restore point, and two separate runs stay separate — even inside the same
 * hour. The timeline used to bucket by hour, so a manual "Create Now" taken
 * minutes after the automatic hourly backup collapsed into a single row
 * showing only the later one, hiding a restore point that still existed.
 * (Retention deleted the earlier one independently; that half is fixed by
 * resticForget's --keep-tag manual.)
 *
 * Pure function, no repos, no mocking — the pairing is worth pinning on its
 * own, and every case below is cheap to state as data.
 */
import { describe, test, expect } from 'vitest'
import { buildBackupPoints, type ResticSnapshotEntry } from './backups'

const snap = (
    id: string,
    time: string,
    tags: string[],
    bytes?: number,
): ResticSnapshotEntry => ({ id, time, tags, summary: bytes ? { total_bytes_processed: bytes } : undefined })

describe('buildBackupPoints', () => {
    test('pairs a run\'s database and media snapshots into one point', () => {
        const run = 'run:2026-08-17T06:08:00.000Z'
        const points = buildBackupPoints(
            [snap('db1', '2026-08-17T06:08:16Z', ['db', run], 11_000_000)],
            [snap('md1', '2026-08-17T06:08:19Z', ['media', run], 7_000_000_000)],
        )

        expect(points).toHaveLength(1)
        expect(points[0]).toMatchObject({
            id: '2026-08-17T06:08:00.000Z',
            dbSnapshotId: 'db1',
            mediaSnapshotId: 'md1',
            dbSizeBytes: 11_000_000,
            mediaSizeBytes: 7_000_000_000,
        })
        // The database half runs first — that is the moment the operator asked for.
        expect(points[0].time).toBe('2026-08-17T06:08:16.000Z')
    })

    test('keeps a manual backup separate from the automatic one in the same hour', () => {
        const auto   = 'run:2026-08-17T06:08:00.000Z'
        const manual = 'run:2026-08-17T06:28:40.000Z'
        const points = buildBackupPoints(
            [
                snap('db-auto',   '2026-08-17T06:08:16Z', ['db', auto]),
                snap('db-manual', '2026-08-17T06:28:40Z', ['db', manual, 'manual']),
            ],
            [
                snap('md-auto',   '2026-08-17T06:08:19Z', ['media', auto]),
                snap('md-manual', '2026-08-17T06:28:44Z', ['media', manual, 'manual']),
            ],
        )

        // Two rows, not one. This is the regression: hour bucketing produced a
        // single row here and the automatic backup became unreachable.
        expect(points).toHaveLength(2)
        expect(points.map(p => p.dbSnapshotId)).toEqual(['db-manual', 'db-auto']) // newest first
        expect(points.find(p => p.dbSnapshotId === 'db-manual')?.isManual).toBe(true)
        expect(points.find(p => p.dbSnapshotId === 'db-auto')?.isManual).toBeUndefined()
    })

    test('falls back to hour buckets for snapshots taken before run tagging', () => {
        const points = buildBackupPoints(
            [snap('db-old', '2026-08-16T11:47:30Z', ['db'])],
            [snap('md-old', '2026-08-16T11:52:01Z', ['media'])],
        )

        // Same identity these points have always had, so historical rows keep
        // working rather than fragmenting or disappearing.
        expect(points).toHaveLength(1)
        expect(points[0].id).toBe('2026-08-16T11:00:00.000Z')
        expect(points[0].dbSnapshotId).toBe('db-old')
        expect(points[0].mediaSnapshotId).toBe('md-old')
    })

    test('marks safety backups and sorts every point newest first', () => {
        const points = buildBackupPoints(
            [
                snap('db-a', '2026-08-16T11:47:30Z', ['db', 'run:2026-08-16T11:47:00.000Z']),
                snap('db-c', '2026-08-17T06:28:40Z', ['db', 'run:2026-08-17T06:28:00.000Z', 'pre-restore']),
                snap('db-b', '2026-08-17T05:46:02Z', ['db', 'run:2026-08-17T05:46:00.000Z']),
            ],
            [],
        )

        expect(points.map(p => p.dbSnapshotId)).toEqual(['db-c', 'db-b', 'db-a'])
        expect(points[0].isSafety).toBe(true)
        // Media absent for all three — the UI renders that side as "Missing".
        expect(points.every(p => p.mediaSnapshotId === undefined)).toBe(true)
    })

    test('sorts correctly across snapshots recorded in different timezones', () => {
        // restic records each snapshot's own UTC offset; comparing those
        // strings raw would interleave them wrongly.
        const points = buildBackupPoints(
            [
                snap('local', '2026-08-16T21:47:30+10:00', ['db', 'run:a']), // 11:47Z
                snap('utc',   '2026-08-16T12:47:28Z',      ['db', 'run:b']), // 12:47Z
            ],
            [],
        )

        expect(points.map(p => p.dbSnapshotId)).toEqual(['utc', 'local'])
    })
})
