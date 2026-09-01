'use client'

import { useState } from 'react'
import { Typography, Dialog, DialogContent, CircularProgress } from '@mui/material'

import TacticalSkeleton from '@/app/dashboard/_components/TacticalSkeleton'
import type { FeaturedPlacement } from '@/lib/gallery/featured-order'
import type { FeaturedOrderBackfillResult } from '@/lib/gallery/featured-order-backfill'

/**
 * Backfilling the public featured rail's order, from the J4 console.
 *
 * The same migration as `npm start` -> Migrations -> Backfill: featured rail
 * order, and it keeps that flow's shape rather than collapsing to one click:
 * opening this runs the DRY pass and renders every file with the bucket it
 * fell into, and only then is Apply available. That is not ceremony. Several
 * files in `storage/gallery/featured` are the same photograph the archive
 * already holds, dated and attributed, and where one can be identified the
 * rail slot is handed to the ARCHIVE document so the tile carries its caption
 * and credit — a judgement the operator is being asked to check. It matters
 * because the write happens exactly once: afterwards documents carry
 * `featuredOrder`, and the guard refuses every later run, here and in the
 * menu. Re-ordering from then on is J5's Featured tab.
 */

const RED = 'rgba(219,0,29'

/** The archive key or the reason, as one line under the filename. */
function detailOf(placement: FeaturedPlacement): { text: string, tone: string } {
    if (placement.target === 'archive') {
        return { text: `→ ${placement.archiveKey}`, tone: 'rgb(0,195,100)' }
    }
    const rivals = placement.candidates.length ? ` — ${placement.candidates.join(', ')}` : ''
    return { text: `→ keeps its own tile (${placement.reason})${rivals}`, tone: 'rgba(237,237,237,0.35)' }
}

function PlacementList({ title, placements }: { title: string, placements: FeaturedPlacement[] }) {
    return (
        <>
            <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', margin: '20px 0 8px' }}>
                {title}
            </Typography>
            {placements.length === 0 ? (
                <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.3)', fontStyle: 'italic' }}>
                    None.
                </Typography>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
                    {placements.map(p => {
                        const detail = detailOf(p)
                        return (
                            <div
                                key={p.featuredId}
                                style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                            >
                                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)', fontVariantNumeric: 'tabular-nums' }}>
                                        {String(p.order).padStart(2, '0')}
                                    </span>
                                    <span style={{ fontSize: '0.74rem', color: 'rgba(237,237,237,0.9)', wordBreak: 'break-all' }}>
                                        {p.featuredFile}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.64rem', color: detail.tone, marginLeft: 26, wordBreak: 'break-all' }}>
                                    {detail.text}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </>
    )
}

export default function FeaturedOrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [result, setResult] = useState<FeaturedOrderBackfillResult | null>(null)
    const [loading, setLoading] = useState(true)
    const [applying, setApplying] = useState(false)
    const [applied, setApplied] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function run(apply: boolean) {
        setError(null)
        try {
            const res = await fetch('/api/admin/gallery/featured-order-backfill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apply }),
            })
            const data = await res.json().catch(() => null)
            if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`)
            setResult(data as FeaturedOrderBackfillResult)
            if (apply) setApplied(true)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not reach the server')
        }
    }

    /* Re-run on every open rather than caching: the whole point of the dry
       pass is that it describes the database as it is right now, and a stale
       plan is the one thing an operator must not press Apply against. */
    async function load() {
        setLoading(true)
        setApplied(false)
        setResult(null)
        await run(false)
        setLoading(false)
    }

    async function apply() {
        if (applying) return
        setApplying(true)
        await run(true)
        setApplying(false)
    }

    const partial = result?.status === 'ok'
        && result.modifiedCount !== null
        && result.modifiedCount < result.placements.length

    return (
        <Dialog
            open={open}
            onClose={applying ? undefined : onClose}
            TransitionProps={{ onEntered: load }}
            PaperProps={{
                style: {
                    background: '#111',
                    border: `1px solid ${RED},0.32)`,
                    borderTop: '2px solid var(--red)',
                    borderRadius: 0,
                    minWidth: 520,
                    maxWidth: 720,
                    color: '#ededed',
                },
            }}
        >
            <DialogContent style={{ padding: '28px 28px 24px' }}>
                <Typography fontSize='0.6rem' fontWeight={700} letterSpacing={3} style={{ textTransform: 'uppercase', color: `${RED},0.7)`, marginBottom: 4 }}>
                    J4 — Administration
                </Typography>
                <Typography fontWeight={700} fontSize='0.9rem' letterSpacing={3} style={{ textTransform: 'uppercase', marginBottom: 6 }}>
                    Featured Rail Order
                </Typography>
                <Typography fontSize='0.68rem' style={{ color: 'rgba(237,237,237,0.4)', marginBottom: 20 }}>
                    Gives the public featured rail its order. Runs once — afterwards the rotation is J5&rsquo;s Featured tab.
                </Typography>

                {loading ? <TacticalSkeleton rows={4} /> : error ? (
                    <Typography fontSize='0.76rem' style={{ color: '#ff4444' }}>{error}</Typography>
                ) : result?.status === 'already-ordered' ? (
                    <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <Typography fontSize='0.8rem' fontWeight={600}>
                            The rail already has an order.
                        </Typography>
                        <Typography fontSize='0.68rem' style={{ color: 'rgba(237,237,237,0.4)', marginTop: 8 }}>
                            {result.ordered} document{result.ordered === 1 ? '' : 's'} carry a position, so this migration has run
                            or a curator has set one. Nothing was read or written. Re-order in J5 → Gallery → Featured.
                        </Typography>
                    </div>
                ) : result?.status === 'no-featured' ? (
                    <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <Typography fontSize='0.8rem' fontWeight={600}>
                            No featured files are indexed.
                        </Typography>
                        <Typography fontSize='0.68rem' style={{ color: 'rgba(237,237,237,0.4)', marginTop: 8 }}>
                            Nothing in <code>storage/gallery/featured</code> has a document yet. Run
                            {' '}<code>npm start</code> → Migrations → Index: gallery media from the repo root first; that is what
                            writes them, and it is not something this console can do.
                        </Typography>
                    </div>
                ) : result?.status === 'ok' ? (
                    <>
                        <Typography fontSize='0.76rem' style={{ color: 'rgba(237,237,237,0.6)' }}>
                            {result.featuredCount} featured file{result.featuredCount === 1 ? '' : 's'}, matched against{' '}
                            {result.archiveCount.toLocaleString()} archive image{result.archiveCount === 1 ? '' : 's'}.
                        </Typography>
                        {result.notLive > 0 && (
                            <Typography fontSize='0.68rem' style={{ color: '#e0a800', marginTop: 6 }}>
                                {result.notLive} featured file{result.notLive === 1 ? ' is' : 's are'} not live and{' '}
                                {result.notLive === 1 ? 'was' : 'were'} left out — nothing not-live can reach the rail.
                            </Typography>
                        )}

                        <PlacementList
                            title={`${result.placements.filter(p => p.target === 'archive').length} handed to an archive original — the tile gets its caption and credit`}
                            placements={result.placements.filter(p => p.target === 'archive')}
                        />
                        <PlacementList
                            title={`${result.placements.filter(p => p.target !== 'archive').length} kept their own tile`}
                            placements={result.placements.filter(p => p.target !== 'archive')}
                        />

                        {applied && (
                            <div style={{ marginTop: 20, padding: '14px 16px', background: partial ? 'rgba(219,0,29,0.08)' : 'rgba(0,195,100,0.06)', border: `1px solid ${partial ? `${RED},0.4)` : 'rgba(0,195,100,0.28)'}` }}>
                                <Typography fontSize='0.8rem' fontWeight={600} style={{ color: partial ? '#ff4444' : 'rgb(0,195,100)' }}>
                                    Set featuredOrder on {result.modifiedCount} document{result.modifiedCount === 1 ? '' : 's'}.
                                </Typography>
                                {partial && (
                                    <Typography fontSize='0.68rem' style={{ color: 'rgba(237,237,237,0.55)', marginTop: 8 }}>
                                        Only {result.modifiedCount} of {result.placements.length} landed, so the rail has holes in its
                                        sequence — and it will not run again, because the documents that did land now carry a position.
                                        Finish the rotation in J5 → Gallery → Featured.
                                    </Typography>
                                )}
                            </div>
                        )}
                    </>
                ) : null}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                    {result?.status === 'ok' && !applied && (
                        <button
                            onClick={apply}
                            disabled={applying}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: `${RED},0.14)`, border: `1px solid ${RED},0.4)`,
                                color: applying ? 'rgba(237,237,237,0.3)' : '#ededed',
                                padding: '7px 18px', cursor: applying ? 'not-allowed' : 'pointer',
                                fontSize: '0.72rem', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                            }}
                        >
                            {applying && <CircularProgress size={12} style={{ color: 'var(--red)' }} />}
                            {applying ? 'Writing…' : `Apply to ${result.placements.length} document${result.placements.length === 1 ? '' : 's'}`}
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        disabled={applying}
                        style={{ background: 'none', border: '1px solid rgba(237,237,237,0.15)', color: 'rgba(237,237,237,0.6)', padding: '7px 18px', cursor: applying ? 'not-allowed' : 'pointer', fontSize: '0.78rem', letterSpacing: 1 }}
                    >
                        CLOSE
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
