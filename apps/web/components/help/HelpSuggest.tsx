'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import HelpMarkdown from './HelpMarkdown'
import { HELP_CATEGORIES, type HelpArticleView } from '@/lib/help/search'
import s from '@/styles/help.module.css'

export interface SuggestDraft {
    kind: HelpSuggestionKind
    /** The guide it's about, by slug. */
    slug?: string
    body?: string
}

const KIND_INFO: Record<HelpSuggestionKind, { label: string; blurb: string }> = {
    edit: { label: 'Fix a guide', blurb: 'Correct or improve an existing guide' },
    new: { label: 'New guide', blurb: 'Propose a guide that is missing' },
    bug: { label: 'Report a bug', blurb: 'Something on the site is broken' },
    question: { label: 'Ask J7', blurb: "A question the guides don't answer" },
}

/**
 * The form behind "Suggest an edit", "Report a bug" and the Suggest tab.
 * Everything goes to J7's Help Wiki review tab; nothing is published until
 * they approve it. The page the reader is on travels with it.
 */
export default function HelpSuggest({ draft, articles, pathname, signedIn, onDone, onOpenArticle }: {
    draft: SuggestDraft
    articles: HelpArticleView[]
    pathname: string
    signedIn: boolean
    onDone?: () => void
    onOpenArticle?: (slug: string) => void
}) {
    const [kind, setKind] = useState<HelpSuggestionKind>(draft.kind)
    const [slug, setSlug] = useState(draft.slug ?? '')
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [summary, setSummary] = useState('')
    const [category, setCategory] = useState<HelpCategory>('faq')
    const [note, setNote] = useState('')
    const [preview, setPreview] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [sent, setSent] = useState<HelpSuggestionKind | null>(null)

    const article = articles.find(a => a.slug === slug)

    // A new draft (another article's "Suggest an edit", or Ask's "Send to J7") resets the form.
    useEffect(() => {
        const target = draft.slug ? articles.find(a => a.slug === draft.slug) : undefined
        setKind(draft.kind)
        setSlug(target?.slug ?? '')
        setSent(null)
        setError(null)
        setPreview(false)
        setNote('')
        if (draft.kind === 'edit' && target) { setTitle(target.title); setBody(target.body) }
        else { setTitle(draft.kind === 'question' ? (draft.body ?? '').split('\n')[0].slice(0, 120) : ''); setBody(draft.body ?? '') }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new draft resets the form, not a reload of the wiki
    }, [draft])

    // Picking another article for an edit loads its text to edit.
    const pickArticle = (next: string) => {
        setSlug(next)
        const a = articles.find(x => x.slug === next)
        if (kind === 'edit') { setTitle(a?.title ?? ''); setBody(a?.body ?? '') }
    }

    const switchKind = (k: HelpSuggestionKind) => {
        setKind(k)
        setError(null)
        setPreview(false)
        if (k === 'edit' && article) { setTitle(article.title); setBody(article.body) }
        else if (kind === 'edit') { setTitle(''); setBody('') }
    }

    if (!signedIn) {
        return (
            <div className={s.empty}>
                <Link href='/login'>Sign in</Link> with Discord to suggest edits, report bugs or ask J7 a question.
            </div>
        )
    }

    if (sent) {
        return (
            <div className={s.success}>
                <strong>Thanks, that's with J7.</strong>
                <div style={{ marginTop: 4 }}>
                    {sent === 'edit' || sent === 'new'
                        ? 'They review every change before it goes live. You get a notification when they have.'
                        : "They'll look into it, and you get a notification when they reply."}
                </div>
                <div className={s.row} style={{ marginTop: 10 }}>
                    <button type='button' className={s.btn} onClick={() => setSent(null)}>Send something else</button>
                    {onDone && <button type='button' className={`${s.btn} ${s.btnGhost}`} onClick={onDone}>Back to the guides</button>}
                </div>
            </div>
        )
    }

    const unchanged = kind === 'edit' && !!article && title.trim() === article.title && body.trim() === article.body.trim()

    const submit = async () => {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch('/api/help/suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    kind,
                    articleSlug: slug || undefined,
                    baseVersion: kind === 'edit' ? article?.version : undefined,
                    title, body, summary, category, note,
                    pagePath: pathname,
                }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) { setError(json.error ?? 'That could not be sent. Try again.'); return }
            setSent(kind)
        } catch {
            setError('That could not be sent. Check your connection and try again.')
        } finally {
            setBusy(false)
        }
    }

    const isArticle = kind === 'edit' || kind === 'new'

    return (
        <div>
            <div className={s.kinds} role='radiogroup' aria-label='What would you like to send?'>
                {(Object.keys(KIND_INFO) as HelpSuggestionKind[]).map(k => (
                    <button key={k} type='button' role='radio' aria-checked={kind === k}
                        className={`${s.kind} ${kind === k ? s.kindActive : ''}`} onClick={() => switchKind(k)}>
                        <strong>{KIND_INFO[k].label}</strong>{KIND_INFO[k].blurb}
                    </button>
                ))}
            </div>

            {error && <div className={s.error}>{error}</div>}

            {(kind === 'edit' || kind === 'bug' || kind === 'question') && (
                <div className={s.field}>
                    <label htmlFor='help-s-article'>{kind === 'edit' ? 'Guide to fix' : 'Related guide (optional)'}</label>
                    <select id='help-s-article' value={slug} onChange={e => pickArticle(e.target.value)}>
                        <option value=''>{kind === 'edit' ? 'Choose a guide…' : 'None'}</option>
                        {articles.map(a => <option key={a.slug} value={a.slug}>{a.title}</option>)}
                    </select>
                </div>
            )}

            {(kind !== 'edit' || article) && (
                <>
                    <div className={s.field}>
                        <label htmlFor='help-s-title'>{isArticle ? 'Title' : kind === 'bug' ? 'What broke, in a few words' : 'Your question, in a few words'}</label>
                        <input id='help-s-title' value={title} onChange={e => setTitle(e.target.value)} maxLength={120}
                            placeholder={kind === 'bug' ? 'e.g. RSVP button does nothing' : kind === 'question' ? 'e.g. How do I change platoon?' : ''} />
                    </div>

                    {kind === 'new' && (
                        <div className={s.row} style={{ alignItems: 'flex-start' }}>
                            <div className={s.field} style={{ flex: 2, minWidth: 180 }}>
                                <label htmlFor='help-s-summary'>One-line summary</label>
                                <input id='help-s-summary' value={summary} onChange={e => setSummary(e.target.value)} maxLength={240} />
                            </div>
                            <div className={s.field} style={{ flex: 1, minWidth: 140 }}>
                                <label htmlFor='help-s-cat'>Topic</label>
                                <select id='help-s-cat' value={category} onChange={e => setCategory(e.target.value as HelpCategory)}>
                                    {HELP_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

                    <div className={s.field}>
                        <div className={s.row}>
                            <label htmlFor='help-s-body'>
                                {isArticle ? 'Guide text' : kind === 'bug' ? 'What you did, what you expected, and what happened' : 'Details'}
                            </label>
                            <span className={s.spacer} />
                            {isArticle && (
                                <button type='button' className={`${s.btn} ${s.btnSmall} ${s.btnGhost}`} onClick={() => setPreview(p => !p)}>
                                    {preview ? 'Edit' : 'Preview'}
                                </button>
                            )}
                        </div>
                        {preview
                            ? <div style={{ border: '1px solid var(--line-2)', padding: '10px 12px', background: 'var(--ink-2)' }}><HelpMarkdown source={body} onArticle={onOpenArticle} titles={new Map(articles.map(a => [a.slug, a.title]))} /></div>
                            : <textarea id='help-s-body' className={isArticle ? s.mono : undefined} rows={isArticle ? 14 : 6} value={body} onChange={e => setBody(e.target.value)} />}
                        {isArticle && !preview && (
                            <span className={s.hint}>**bold**, - bullets, 1. steps, ## headings, [link text](/page), [[guide-slug]] to link another guide.</span>
                        )}
                    </div>

                    {isArticle && (
                        <div className={s.field}>
                            <label htmlFor='help-s-note'>Why the change? (optional, for J7)</label>
                            <input id='help-s-note' value={note} onChange={e => setNote(e.target.value)} maxLength={1000} />
                        </div>
                    )}

                    <div className={s.row}>
                        <span className={s.hint}>Sent from {pathname}</span>
                        <span className={s.spacer} />
                        <button type='button' className={`${s.btn} ${s.btnPrimary}`} disabled={busy || !body.trim() || (isArticle && !title.trim()) || unchanged} onClick={submit}>
                            {busy ? 'Sending…' : 'Send to J7'}
                        </button>
                    </div>
                    {unchanged && <div className={s.hint} style={{ marginTop: 6, textAlign: 'right' }}>Make your change above, then send it.</div>}
                </>
            )}
        </div>
    )
}
