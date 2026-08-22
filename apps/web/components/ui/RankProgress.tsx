import React from 'react'
import ProgressTrack from './ProgressTrack'
import s from '@/styles/ui.module.css'

/**
 * A member's progress toward their next rank.
 *
 * Extracted from the milpac file so the navbar account menu and the milpac
 * itself draw the same bar from the same component — two renderers of one
 * number is how they drift. The shape is exactly what `getPromotionProgress()`
 * in `lib/military/milpac-stats.ts` returns.
 *
 * Renders nothing at max rank or on a billet-assigned rank: there is no
 * meaningful bar to draw, and a full or empty one would both mislead.
 */

export type RankProgressValue =
    | { atMax: true }
    | { atMax: false, nextRank: string, billetOnly: true }
    | { atMax: false, nextRank: string, required: number, current: number, pct: number, billetOnly: false }
    | null

export default function RankProgress({ currentRank, progress, accent }: {
    /** Abbreviation of the rank held now, e.g. `PTE(S)`. */
    currentRank?: string | null
    progress: RankProgressValue
    /** The member's own accent colour; falls back to the unit red. */
    accent?: string
}) {
    if (!progress || progress.atMax || progress.billetOnly) return null

    return (
        <div>
            <div className={s.rankRow}>
                <span style={{ color: accent ?? 'var(--red)' }}>{currentRank}</span>
                <span className={s.rankPts}>{progress.current} / {progress.required} pts</span>
                <span>{progress.nextRank}</span>
            </div>
            <ProgressTrack pct={progress.pct} accent={accent} />
        </div>
    )
}
