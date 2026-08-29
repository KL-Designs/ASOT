'use client'

import React, { useState } from 'react'
import s from '@/styles/gallery.module.css'
import { ThumbUpIcon, ThumbDownIcon } from './icons'

/**
 * Two buttons and a proportion.
 *
 * Optimistic: the counts move on click and are replaced by the server's answer
 * when it lands. A vote that fails rolls back rather than leaving the interface
 * claiming something the database does not agree with.
 *
 * The `busy` guard is not just a spinner-avoidance nicety — it is what keeps a
 * second click from landing while the first request is still in flight. Both
 * the optimistic `onChange` and `setBusy(true)` run synchronously, before the
 * first `await`, so React commits them as part of the same click's event
 * dispatch; a second click can only be handled once that commit has happened,
 * which is what `busy` is checking by then. Without the guard, two clicks
 * in flight together would both compute their deltas from the same starting
 * `up`/`down`/`mine`, and whichever response landed second would overwrite
 * the first's result rather than compound it — the same desync the route's
 * atomic update exists to prevent, just moved to the client. With the guard,
 * calls are strictly sequential: a call only starts once the previous one has
 * already reconciled (server response or rollback), so the counts it reads are
 * always the real current ones.
 *
 * A guest sees the bar — the score is public information — and gets a prompt
 * on click rather than a disabled button, which explains nothing.
 */
export default function VoteBar({ mediaId, up, down, mine, canVote, onChange, compact }: {
    mediaId: string
    up: number
    down: number
    mine: 1 | -1 | null
    canVote: boolean
    onChange: (next: { up: number, down: number, mine: 1 | -1 | null }) => void
    compact?: boolean
}) {
    const [busy, setBusy] = useState(false)
    const [prompt, setPrompt] = useState(false)

    const total = up + down
    const ratio = total ? up / total : 0

    async function cast(value: 1 | -1) {
        if (!canVote) { setPrompt(true); return }
        if (busy) return
        setBusy(true)

        const rollback = { up, down, mine }
        // Clicking the vote you hold withdraws it — the server agrees, this is
        // just the local guess at the same answer.
        const next = value === mine ? null : value
        const delta = (v: 1 | -1) => (next === v ? 1 : 0) - (mine === v ? 1 : 0)
        onChange({ up: up + delta(1), down: down + delta(-1), mine: next })

        try {
            const res = await fetch('/api/gallery/vote', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaId, value: next }),
            })
            if (!res.ok) throw new Error()
            onChange(await res.json())
        } catch {
            onChange(rollback)
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className={compact ? `${s.vote} ${s.voteCompact}` : s.vote}>
            <button type='button' className={mine === 1 ? s.voteOn : ''} onClick={() => cast(1)}
                aria-label='Thumbs up' aria-pressed={mine === 1}>
                <ThumbUpIcon />{up}
            </button>
            <button type='button' className={mine === -1 ? s.voteOn : ''} onClick={() => cast(-1)}
                aria-label='Thumbs down' aria-pressed={mine === -1}>
                <ThumbDownIcon />{down}
            </button>

            {/* A bar with nothing behind it would read as 0% rather than as
                "nobody has voted", so an unvoted item shows no bar at all. */}
            {total > 0 && (
                <div className={s.voteBar} title={`${up} up, ${down} down`}>
                    <div className={s.voteBarFill} style={{ width: `${Math.round(ratio * 100)}%` }} />
                </div>
            )}
            {total > 0 && <span className={s.voteN}>{total}</span>}

            {prompt && <span className={s.voteHint}>Sign in to vote</span>}
        </div>
    )
}
