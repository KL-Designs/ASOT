'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { BlockChange, DiffSummary } from '@/lib/j2/bible-diff'

// The editor is TipTap and only makes sense in the browser.
const SimpleEditor = dynamic(() => import('@/components/editor/SimpleEditor'), { ssr: false })

interface VersionMeta { version: number; summary: string; publishedAt: string; publishedByName: string }

interface Payload {
    canEdit: boolean
    latest: (VersionMeta & { html: string }) | null
    versions: VersionMeta[]
    draft: { html: string; updatedAt: string | null; updatedByName: string | null; dirty: boolean } | null
}

interface Comparison {
    changes: BlockChange[]
    summary: DiffSummary
    comparedWith: number | null
    version?: number
    days?: number
}

type View = { kind: 'read' } | { kind: 'recent' } | { kind: 'version'; version: number } | { kind: 'edit' }

const label: React.CSSProperties = { fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--txt-3)' }
const btn = (on = false): React.CSSProperties => ({
    padding: '6px 13px', cursor: 'pointer', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    background: on ? 'rgba(219,0,29,0.14)' : 'transparent',
    border: `1px solid ${on ? 'var(--red)' : 'var(--line-2)'}`, color: on ? '#ededed' : 'var(--txt-2)',
})
const when = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

const ADDED = { background: 'rgba(76,175,80,0.16)', color: '#b9e6bb' }
const REMOVED = { background: 'rgba(219,0,29,0.14)', color: '#ffb3b3', textDecoration: 'line-through' as const }

/**
 * The Mission Making Bible.
 *
 * Four views of one document: the latest published version (what everybody
 * reads), recent changes only, any one version compared with the one before
 * it, and — for J2 leads — the draft.
 *
 * The draft is never what a mission maker reads. A lead edits it, then
 * publishes it as the next numbered version with a line saying what changed,
 * and that line is what the change log on the right is made of.
 */
export default function MissionBibleTab() {
    const [data, setData] = useState<Payload | null>(null)
    const [failed, setFailed] = useState(false)
    const [view, setView] = useState<View>({ kind: 'read' })
    const [comparison, setComparison] = useState<Comparison | null>(null)

    // Draft editing
    const draftHtml = useRef('')
    const [dirty, setDirty] = useState(false)
    const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
    const [summary, setSummary] = useState('')
    const [publishing, setPublishing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(() => {
        fetch('/api/j2/mission-bible')
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((d: Payload) => { setData(d); draftHtml.current = d.draft?.html ?? '' })
            .catch(() => setFailed(true))
    }, [])
    useEffect(() => { load() }, [load])

    // The two comparison views fetch their change list when opened.
    useEffect(() => {
        if (view.kind !== 'recent' && view.kind !== 'version') return
        let live = true
        const url = view.kind === 'recent' ? '/api/j2/mission-bible?recent=1' : `/api/j2/mission-bible?version=${view.version}`
        fetch(url)
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (live) setComparison(d) })
            .catch(() => { if (live) setComparison(null) })
        return () => { live = false }
    }, [view])

    // An unsaved draft is the one thing here worth a warning on the way out.
    useEffect(() => {
        if (!dirty) return
        const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [dirty])

    const saveDraft = async (): Promise<boolean> => {
        setSaving('saving')
        setError(null)
        const res = await fetch('/api/j2/mission-bible', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: draftHtml.current }),
        }).catch(() => null)
        if (!res?.ok) {
            const info = await res?.json().catch(() => null)
            setError(info?.error ?? 'The draft did not save.')
            setSaving('failed')
            return false
        }
        setDirty(false)
        setSaving('saved')
        return true
    }

    const publish = async () => {
        setPublishing(true)
        // Publishing takes what is in the database, so whatever is on screen is saved first.
        if (dirty && !await saveDraft()) { setPublishing(false); return }
        const res = await fetch('/api/j2/mission-bible', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary }),
        }).catch(() => null)
        setPublishing(false)
        if (!res?.ok) {
            const info = await res?.json().catch(() => null)
            setError(info?.error ?? 'That did not publish.')
            return
        }
        setSummary('')
        setView({ kind: 'read' })
        load()
    }

    const go = (next: View) => {
        if (view.kind === 'edit' && dirty && !window.confirm('You have unsaved changes to the draft. Leave without saving them?')) return
        if (view.kind === 'edit' && dirty) { setDirty(false); draftHtml.current = data?.draft?.html ?? '' }
        setComparison(null)
        setError(null)
        setView(next)
    }

    if (failed) return <p style={{ padding: 24, color: 'var(--txt-3)' }}>The Mission Bible did not load. Reload to try again.</p>
    if (!data) return <p style={{ padding: 24, color: 'var(--txt-3)' }}>Loading…</p>

    const { latest, versions, canEdit } = data

    return (
        <div style={{ display: 'flex', gap: 24, padding: '20px 24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 620px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type='button' style={btn(view.kind === 'read')} onClick={() => go({ kind: 'read' })}>Latest version</button>
                    <button type='button' style={btn(view.kind === 'recent')} onClick={() => go({ kind: 'recent' })} disabled={!latest}>Recent changes only</button>
                    {canEdit && <button type='button' style={btn(view.kind === 'edit')} onClick={() => go({ kind: 'edit' })}>Edit draft{data.draft?.dirty ? ' · unpublished' : ''}</button>}
                    {latest && view.kind === 'read' && (
                        <span style={{ ...label, marginLeft: 'auto' }}>Version {latest.version} · {when(latest.publishedAt)} · {latest.publishedByName}</span>
                    )}
                </div>

                {error && <div role='alert' style={{ color: '#ff8a80', fontSize: '0.8rem' }}>{error}</div>}

                {view.kind === 'read' && (
                    latest
                        ? <SimpleEditor key={`read-${latest.version}`} initialContent={latest.html} readOnly minHeight={200} />
                        : (
                            <p style={{ color: 'var(--txt-3)', fontSize: '0.85rem' }}>
                                Nothing has been published yet.{canEdit ? ' Open the draft, write the Bible, and publish it as version 1.' : ''}
                            </p>
                        )
                )}

                {(view.kind === 'recent' || view.kind === 'version') && (
                    <ComparisonView comparison={comparison} recent={view.kind === 'recent'} />
                )}

                {view.kind === 'edit' && data.draft && (
                    <>
                        <p style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.55, color: 'var(--txt-2)' }}>
                            This is the working copy. Nobody else in J2 sees it until you publish it as a new version.
                            {data.draft.updatedByName && data.draft.updatedAt && ` Last saved by ${data.draft.updatedByName} on ${when(data.draft.updatedAt)}.`}
                        </p>
                        <SimpleEditor
                            key='draft'
                            initialContent={data.draft.html}
                            minHeight={420}
                            onChange={html => { draftHtml.current = html; setDirty(true); setSaving('idle') }}
                        />
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button type='button' style={btn(true)} disabled={!dirty || saving === 'saving'} onClick={saveDraft}>
                                {saving === 'saving' ? 'Saving…' : 'Save draft'}
                            </button>
                            <span style={{ fontSize: '0.72rem', color: 'var(--txt-3)' }}>
                                {dirty ? 'Unsaved changes' : saving === 'saved' ? 'Draft saved' : ''}
                            </span>
                        </div>
                        <div style={{ border: '1px solid var(--line-2)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <span style={label}>Publish as version {(latest?.version ?? 0) + 1}</span>
                            <input
                                aria-label='What changed in this version'
                                style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line-2)', color: 'inherit', fontSize: '0.82rem', fontFamily: 'inherit' }}
                                placeholder='What changed in this version, in a sentence'
                                maxLength={600}
                                value={summary}
                                onChange={e => setSummary(e.target.value)}
                            />
                            <div>
                                <button type='button' style={btn(true)} disabled={publishing || !summary.trim()} onClick={publish}>
                                    {publishing ? 'Publishing…' : 'Publish to J2'}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <aside style={{ flex: '0 1 300px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={label}>Change log</span>
                {versions.length === 0 && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--txt-3)' }}>No versions yet.</p>}
                {versions.map(v => {
                    const on = view.kind === 'version' && view.version === v.version
                    return (
                        <button
                            key={v.version}
                            type='button'
                            onClick={() => go({ kind: 'version', version: v.version })}
                            style={{
                                textAlign: 'left', padding: '10px 12px', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit',
                                background: on ? 'rgba(219,0,29,0.1)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${on ? 'var(--red)' : 'var(--line-2)'}`, display: 'flex', flexDirection: 'column', gap: 4,
                            }}
                        >
                            <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Version {v.version}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--txt-3)' }}>{when(v.publishedAt)} · {v.publishedByName}</span>
                            <span style={{ fontSize: '0.78rem', lineHeight: 1.45, color: 'var(--txt-2)' }}>{v.summary}</span>
                        </button>
                    )
                })}
            </aside>
        </div>
    )
}

const TAG_STYLE: Record<string, React.CSSProperties> = {
    h1: { fontSize: '1.15rem', fontWeight: 700, marginTop: 14 },
    h2: { fontSize: '1rem', fontWeight: 700, marginTop: 12 },
    h3: { fontSize: '0.9rem', fontWeight: 700, marginTop: 10 },
    li: { paddingLeft: 18 },
}

/** A change list: additions and removals marked, everything else as it reads. */
function ComparisonView({ comparison, recent }: { comparison: Comparison | null; recent: boolean }) {
    if (!comparison) return <p style={{ color: 'var(--txt-3)' }}>Working out what changed…</p>

    const { added, removed, changed } = comparison.summary
    const nothing = added + removed + changed === 0

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.78rem', color: 'var(--txt-2)' }}>
                {recent
                    ? (nothing
                        ? `Nothing has changed in the last ${comparison.days} days.`
                        : `Changes in the last ${comparison.days} days, since version ${comparison.comparedWith}: ${added} added, ${changed} reworded, ${removed} removed.`)
                    : comparison.comparedWith === null
                        ? `Version ${comparison.version} is the first version, so all of it is new.`
                        : (nothing
                            ? `Version ${comparison.version} reads the same as version ${comparison.comparedWith}.`
                            : `Version ${comparison.version} compared with version ${comparison.comparedWith}: ${added} added, ${changed} reworded, ${removed} removed.`)}
                {!nothing && (
                    <>
                        {' '}<span style={{ ...ADDED, padding: '0 5px' }}>Added</span>{' '}
                        <span style={{ ...REMOVED, padding: '0 5px' }}>Removed</span>
                    </>
                )}
            </p>

            {comparison.changes.map((c, i) => {
                const base: React.CSSProperties = { fontSize: '0.86rem', lineHeight: 1.6, padding: '2px 8px', ...TAG_STYLE[c.tag] }
                if (c.op === 'changed') {
                    return (
                        <div key={i} style={{ ...base, borderLeft: '2px solid rgba(245,180,90,0.7)' }}>
                            {c.tag === 'li' ? '• ' : ''}
                            {c.parts.map((p, j) => (
                                <span key={j} style={p.op === 'added' ? ADDED : p.op === 'removed' ? REMOVED : undefined}>{p.text}{' '}</span>
                            ))}
                        </div>
                    )
                }
                return (
                    <div key={i} style={{ ...base, ...(c.op === 'added' ? ADDED : c.op === 'removed' ? REMOVED : { color: 'var(--txt-2)' }) }}>
                        {c.tag === 'li' ? '• ' : ''}{c.text}
                    </div>
                )
            })}
        </div>
    )
}
