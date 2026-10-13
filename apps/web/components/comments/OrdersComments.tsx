'use client'

import { useCallback, useEffect, useState } from 'react'
import { buildThread } from '@/lib/comments/thread'
import type { OperationCommentView } from '@/lib/operations/comments'
import s from './comments.module.css'

/**
 * The comment thread under an operation's orders.
 *
 * Laid out like a ticket's thread — replies indented under what they answer,
 * foldable, each comment edged in its author's callsign colour — because the
 * two are meant to read the same, and both go through `buildThread`.
 *
 * What is particular to orders is the "Notify the mission maker" switch: this
 * is where CHQ and staff ask whoever wrote the orders a question, and a
 * question nobody is told about is a question nobody answers.
 *
 * Renders nothing for a visitor or a signed-in non-member. The API answers 401
 * for both, and a box saying "sign in to comment" under a public set of orders
 * would advertise a thread they cannot read either.
 */

type Payload = {
    comments: OperationCommentView[]
    myId: string
    canModerate: boolean
    missionMakerName: string | null
}

const when = (iso: string) => new Date(iso).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})

export default function OrdersComments({ operationId }: { operationId: string }) {
    const [data, setData] = useState<Payload | null>(null)
    const [hidden, setHidden] = useState(false)

    const [draft, setDraft] = useState('')
    const [notify, setNotify] = useState(false)
    const [replyTo, setReplyTo] = useState<string | null>(null)
    const [replyDraft, setReplyDraft] = useState('')
    const [replyNotify, setReplyNotify] = useState(false)
    const [editing, setEditing] = useState<string | null>(null)
    const [editDraft, setEditDraft] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

    const base = `/api/operations/${operationId}/comments`

    const load = useCallback(async () => {
        const res = await fetch(base, { cache: 'no-store' }).catch(() => null)
        if (!res || res.status === 401 || res.status === 404) { setHidden(true); return }
        if (res.ok) setData(await res.json())
    }, [base])

    useEffect(() => { load() }, [load])

    if (hidden || !data) return null

    async function post(content: string, parentId: string | null, notifyMissionMaker: boolean) {
        if (!content.trim() || busy) return false
        setBusy(true)
        setError(null)
        const res = await fetch(base, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content.trim(), parentId, notifyMissionMaker }),
        }).catch(() => null)
        setBusy(false)
        if (!res?.ok) {
            setError((await res?.json().catch(() => null))?.error ?? 'That comment could not be posted. Try again.')
            return false
        }
        const created: OperationCommentView = await res.json()
        setData(d => d ? { ...d, comments: [...d.comments, created] } : d)
        return true
    }

    async function submitTop(e: React.FormEvent) {
        e.preventDefault()
        if (await post(draft, null, notify)) { setDraft(''); setNotify(false) }
    }

    async function submitReply(parentId: string) {
        if (await post(replyDraft, parentId, replyNotify)) {
            // A reply posted under a folded thread should be visible at once.
            setCollapsed(c => { const n = new Set(c); n.delete(parentId); return n })
            setReplyTo(null)
            setReplyDraft('')
            setReplyNotify(false)
        }
    }

    async function saveEdit(id: string) {
        if (!editDraft.trim() || busy) return
        setBusy(true)
        const res = await fetch(`${base}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: editDraft.trim() }),
        }).catch(() => null)
        setBusy(false)
        if (!res?.ok) { setError('That edit could not be saved. Try again.'); return }
        const updated: OperationCommentView = await res.json()
        setData(d => d ? { ...d, comments: d.comments.map(c => c._id === id ? updated : c) } : d)
        setEditing(null)
    }

    async function remove(id: string) {
        if (busy) return
        setBusy(true)
        const res = await fetch(`${base}/${id}`, { method: 'DELETE' }).catch(() => null)
        setBusy(false)
        if (!res?.ok) { setError('That comment could not be removed. Try again.'); return }
        // Reload rather than patch locally: whether the comment leaves the
        // thread or stays as a shell depends on its replies, and the server
        // already knows how to decide that.
        load()
    }

    const toggle = (id: string) => setCollapsed(c => {
        const n = new Set(c)
        if (n.has(id)) n.delete(id); else n.add(id)
        return n
    })

    const rows = buildThread(data.comments, collapsed)
    const live = data.comments.filter(c => !c.isDeleted).length
    const mm = data.missionMakerName

    return (
        <section className={`${s.root} print-hide`} id='comments' aria-label='Comments on these orders'>
            <div className={s.inner}>
                <header className={s.head}>
                    <h2 className={s.title}>Comments</h2>
                    <span className={s.count}>{String(live).padStart(2, '0')}</span>
                    <span className={s.note}>Visible to members. Not shown on the printed orders.</span>
                </header>

                {error && <p className={s.error} role='alert'>{error}</p>}

                <div className={s.list}>
                    {rows.map(({ comment: c, depth, descendants }) => {
                        const folded = collapsed.has(c._id)
                        const mine = c.authorId === data.myId
                        return (
                            <article
                                key={c._id}
                                className={`${s.card} ${c.isDeleted ? s.deleted : ''}`}
                                style={{
                                    marginLeft: `calc(${depth} * var(--indent))`,
                                    ...(c.authorColor ? { ['--edge' as string]: c.authorColor } : {}),
                                }}
                            >
                                <div className={s.meta}>
                                    {descendants > 0 && (
                                        <button
                                            type='button'
                                            className={s.fold}
                                            onClick={() => toggle(c._id)}
                                            aria-expanded={!folded}
                                            title={folded ? 'Show replies' : 'Hide replies'}
                                        >{folded ? '▸' : '▾'}</button>
                                    )}
                                    <span className={s.author} style={c.authorColor ? { color: c.authorColor } : undefined}>{c.isDeleted ? '[deleted]' : c.authorName}</span>
                                    {c.notifiedMissionMaker && <span className={s.tag} title='The mission maker was notified of this comment'>Mission maker notified</span>}
                                    {c.isEdited && !c.isDeleted && <span className={s.dim}>edited</span>}
                                    {folded && <span className={s.dim}>{descendants} {descendants === 1 ? 'reply' : 'replies'} hidden</span>}
                                    <time className={s.time} dateTime={c.createdAt}>{when(c.createdAt)}</time>
                                </div>

                                {c.isDeleted ? (
                                    <p className={s.gone}>Comment deleted.</p>
                                ) : editing === c._id ? (
                                    <div className={s.compose}>
                                        <textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} rows={3} maxLength={4000} autoFocus />
                                        <div className={s.actions}>
                                            <button type='button' className={s.primary} disabled={busy || !editDraft.trim()} onClick={() => saveEdit(c._id)}>Save</button>
                                            <button type='button' className={s.ghost} onClick={() => setEditing(null)}>Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <p className={s.body}>{c.content}</p>
                                        <div className={s.links}>
                                            <button type='button' onClick={() => { setReplyTo(replyTo === c._id ? null : c._id); setReplyDraft(''); setReplyNotify(false) }}>Reply</button>
                                            {mine && <button type='button' onClick={() => { setEditing(c._id); setEditDraft(c.content) }}>Edit</button>}
                                            {(mine || data.canModerate) && <button type='button' className={s.danger} onClick={() => remove(c._id)}>Delete</button>}
                                        </div>
                                    </>
                                )}

                                {replyTo === c._id && !c.isDeleted && (
                                    <div className={s.compose}>
                                        <textarea
                                            value={replyDraft}
                                            onChange={e => setReplyDraft(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Escape') setReplyTo(null)
                                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitReply(c._id)
                                            }}
                                            placeholder={`Reply to ${c.authorName}…`}
                                            rows={3}
                                            maxLength={4000}
                                            autoFocus
                                        />
                                        <div className={s.actions}>
                                            {mm && <NotifyToggle name={mm} checked={replyNotify} onChange={setReplyNotify} />}
                                            <button type='button' className={s.primary} disabled={busy || !replyDraft.trim()} onClick={() => submitReply(c._id)}>Reply</button>
                                            <button type='button' className={s.ghost} onClick={() => setReplyTo(null)}>Cancel</button>
                                        </div>
                                    </div>
                                )}
                            </article>
                        )
                    })}

                    {rows.length === 0 && <p className={s.empty}>No comments yet. Questions about these orders go here.</p>}
                </div>

                <form className={s.compose} onSubmit={submitTop}>
                    <textarea
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        placeholder='Add a comment or ask a question about these orders…'
                        rows={4}
                        maxLength={4000}
                    />
                    <div className={s.actions}>
                        {mm && <NotifyToggle name={mm} checked={notify} onChange={setNotify} />}
                        <button type='submit' className={s.primary} disabled={busy || !draft.trim()}>Post comment</button>
                    </div>
                </form>
            </div>
        </section>
    )
}

function NotifyToggle({ name, checked, onChange }: { name: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className={s.notify}>
            <input type='checkbox' checked={checked} onChange={e => onChange(e.target.checked)} />
            <span>Notify the mission maker ({name})</span>
        </label>
    )
}
