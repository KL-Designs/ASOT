'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Typography } from '@mui/material'

import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import s from '@/styles/media-console.module.css'

/**
 * Where the database and the disk disagree.
 *
 * Not a tab of its own — a view in the rail, because everything it lists is
 * still media. Nothing here resolves itself: every fix is a button a person
 * presses. A reconcile that deleted records for missing files would destroy
 * the index for the whole archive the first time a restore failed halfway.
 *
 * `Report` is derived from the ambient `GalleryHealth` (types/gallery-health
 * .d.ts) rather than hand-copied, per controller ruling F2 — GalleryHealth
 * itself is `ReconcileReport & { _id }`, so this is the same nine fields the
 * reconcile module owns, minus the two that don't survive JSON transit
 * unchanged: `_id` (an ObjectId this view never needs) and `at`, which
 * `JSON.stringify` turns into a string, not a `Date`. A hand-copied second
 * definition of the same fields would drift the moment reconcile.ts grows
 * one — which is already anticipated: a whole-branch review noted this view
 * should eventually carry a per-item error field that reconcile does not yet
 * produce, and deriving from the ambient type means that field just appears
 * here instead of needing a second edit.
 */

type Report = Omit<GalleryHealth, '_id' | 'at'> & { at: string }

/** `notIndexed` and `missingFiles` can each hold thousands of entries after a
 *  bad restore — rendering all of them would freeze the tab. Capped, with the
 *  overflow said out loud rather than silently dropped. */
const LIST_CAP = 50

export default function HealthView({ onChanged }: { onChanged: () => void }) {
    const [report, setReport] = useState<Report | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/gallery/admin/health')
            if (res.ok) setReport((await res.json()).report)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    async function post(body: Record<string, unknown>) {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch('/api/gallery/admin/health', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                // The server's own message — same idiom as Inspector.tsx and
                // BulkPanel.tsx — rather than a generic one that would hide
                // why an index attempt was refused.
                setError(typeof data.error === 'string' ? data.error : 'Failed.')
                return
            }
            // The response already carries a fresh report (rescan and index
            // both re-run reconcile server-side) — used directly rather than
            // triggering a second GET for the same data.
            setReport(data.report)
            onChanged()
        } catch {
            setError('Could not reach the server.')
        } finally {
            setBusy(false)
        }
    }

    if (loading) return <TacticalSkeleton />

    const total = report ? report.missingFiles.length + report.notIndexed.length + report.failedProcessing.length : 0

    return (
        <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', letterSpacing: '0.14em', color: 'rgba(237,237,237,0.5)' }}>
                    {report
                        ? `LAST SCAN ${new Date(report.at).toLocaleString('en-AU')} · ${report.scanned.toLocaleString('en-AU')} FILES WALKED`
                        : 'NEVER SCANNED'}
                </Typography>
                <Button size='small' variant='outlined' disabled={busy} onClick={() => post({ action: 'rescan' })} sx={{ ml: 'auto', fontSize: '0.7rem' }}>
                    {/* A rescan walks 4,781 files — slow enough that the
                        button must say so and refuse a second click while
                        one is already running. */}
                    {busy ? 'Scanning the whole archive…' : 'Re-scan disk'}
                </Button>
            </div>

            {error && <Typography sx={{ fontSize: '0.75rem', color: 'var(--red-hi)', mb: 1.5 }}>{error}</Typography>}

            {!report && (
                <div className={s.empty}>Never scanned. Re-scan disk to build the first report.</div>
            )}

            {report && total === 0 && (
                <div className={s.empty}>Nothing to resolve. The database and the disk agree.</div>
            )}

            {report && report.missingFiles.length > 0 && (
                <section style={{ marginBottom: 18 }}>
                    <Typography sx={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.08em', color: 'var(--red-hi)', mb: 1 }}>
                        MISSING FILE · {report.missingFiles.length}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', mb: 1 }}>
                        These records are on the gallery but their file is not on disk. Visitors see a broken tile.
                    </Typography>
                    {report.missingFiles.slice(0, LIST_CAP).map(m => (
                        <div key={m.id} className={s.path} style={{ marginBottom: 4 }}>
                            {m.caption ? `“${m.caption}” — ` : ''}{m.storageKey}
                        </div>
                    ))}
                    {report.missingFiles.length > LIST_CAP && (
                        <Typography sx={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.38)', mt: 0.5 }}>
                            {report.missingFiles.length - LIST_CAP} more not shown.
                        </Typography>
                    )}
                </section>
            )}

            {report && report.notIndexed.length > 0 && (
                <section style={{ marginBottom: 18 }}>
                    <Typography sx={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.08em', color: '#5b8dd9', mb: 1 }}>
                        NOT INDEXED · {report.notIndexed.length}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.5)', mb: 1 }}>
                        Files on disk with no record. Drop files into a folder and index them here.
                    </Typography>
                    {report.notIndexed.slice(0, LIST_CAP).map(f => (
                        <div key={f.path} className={s.path} style={{ marginBottom: 4 }}>{f.path}</div>
                    ))}
                    {report.notIndexed.length > LIST_CAP && (
                        <Typography sx={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.38)', mt: 0.5 }}>
                            {report.notIndexed.length - LIST_CAP} more not shown.
                        </Typography>
                    )}
                    <Button
                        size='small'
                        variant='outlined'
                        disabled={busy}
                        // Every not-indexed path, not just the ones shown —
                        // the cap is a display limit, not a scope limit. The
                        // route only accepts paths its own last report listed
                        // (route.ts's `allowed` set), so sending the full
                        // list here still can't index anything the reviewer
                        // hasn't actually seen a report of.
                        onClick={() => post({ action: 'index', paths: report.notIndexed.map(f => f.path) })}
                        sx={{ fontSize: '0.7rem', mt: 1 }}
                    >
                        Index all {report.notIndexed.length}
                    </Button>
                </section>
            )}

            {report && report.failedProcessing.length > 0 && (
                <section>
                    <Typography sx={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.08em', color: '#d8ac45', mb: 1 }}>
                        PROCESSING FAILED · {report.failedProcessing.length}
                    </Typography>
                    {report.failedProcessing.map(f => (
                        <div key={f.id} className={s.path} style={{ marginBottom: 4 }}>{f.error}</div>
                    ))}
                </section>
            )}
        </div>
    )
}
