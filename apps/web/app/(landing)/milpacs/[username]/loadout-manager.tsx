'use client'

import { useEffect, useState } from 'react'
import type { Route } from 'next'
import Link from 'next/link'
import { copyText } from '@/lib/clipboard'
import { MAX_NAME, MAX_DESCRIPTION } from '@/lib/loadout/limits'
import { KIT_ICON_KEYS, DEFAULT_KIT_ICON, type KitIconKey } from '@/lib/loadout/kit-icons'
import { KitIcon, UiIcon } from '@/components/loadout/kit-icons'
import s from './profile.module.css'

/**
 * The kit picker and the owner's controls.
 *
 * The picker is a row of links, not a `<select>` and not client state. Two
 * reasons: `LoadoutPanel` is a server component (item names are resolved
 * against a dictionary far too large to ship to the browser), so switching kit
 * has to be a navigation; and a link to a specific kit can be pasted into
 * Discord and will open on it.
 *
 * Viewing and the default are separate actions. The old `<select>` set
 * `isDefault` purely to change what was on screen, so a member could not look
 * at their second kit without demoting their first. Now the chip changes the
 * view and the star changes the default.
 *
 * The controls are grouped by what they do to the kit on screen, not by who may
 * press them: its visibility and its export on the left, and the two actions
 * that add or remove a kit pushed to the right, away from them.
 *
 * Privacy is enforced in `page.tsx`, which never puts another member's private
 * kit in `loadouts` at all — so nothing here has to hide one, and the copy
 * button can be offered for every kit in the list.
 *
 * Renders a fragment, not a wrapping div — `LoadoutPanel` already supplies the
 * `.kitActions` column this content lives in.
 */

type Summary = {
    id: string
    name: string
    description: string
    icon: KitIconKey
    isDefault: boolean
    shared: boolean
    raw: string
}

/** Filled for the nominated kit, outlined for one that could be nominated. */
function Star({ filled }: { filled: boolean }) {
    return (
        <svg viewBox='0 0 24 24' width={13} height={13} aria-hidden='true'
            fill={filled ? 'currentColor' : 'none'} stroke='currentColor' strokeWidth={1.6}
            strokeLinejoin='round'>
            <path d='M12 3.4 14.7 9l6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.9 9.3 9z' />
        </svg>
    )
}

/** Lit when the kit is published. Green rather than the member's accent: this is
 *  a state anyone reads the same way, not a piece of their file's styling. */
function Dot({ on }: { on: boolean }) {
    return <span className={on ? `${s.kitDot} ${s.kitDotOn}` : s.kitDot} aria-hidden='true' />
}

/** The badge grid. A radiogroup rather than a row of toggles — exactly one is
 *  chosen, and arrow keys should move between them like any other radio set. */
function IconPicker({ value, onPick }: { value: KitIconKey; onPick: (key: KitIconKey) => void }) {
    return (
        <div className={s.kitIconGrid} role='radiogroup' aria-label='Kit icon'>
            {KIT_ICON_KEYS.map(key => (
                <button
                    key={key}
                    type='button'
                    role='radio'
                    aria-checked={key === value}
                    aria-label={key}
                    title={key}
                    className={key === value ? `${s.kitIconOpt} ${s.kitIconOptOn}` : s.kitIconOpt}
                    onClick={() => onPick(key)}
                >
                    <KitIcon icon={key} size={19} />
                </button>
            ))}
        </div>
    )
}

export function LoadoutManager({ loadouts, isOwn, activeId, basePath }: {
    loadouts: Summary[]
    isOwn: boolean
    activeId: string | null
    /** `/milpacs/<canonical>` — the picker's links are absolute, not relative. */
    basePath: string
}) {
    const [importing, setImporting] = useState(false)
    const [raw, setRaw] = useState('')
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [makePublic, setMakePublic] = useState(false)
    const [importIcon, setImportIcon] = useState<KitIconKey>(DEFAULT_KIT_ICON)
    const [editing, setEditing] = useState(false)
    const [descDraft, setDescDraft] = useState('')
    const [iconDraft, setIconDraft] = useState<KitIconKey>(DEFAULT_KIT_ICON)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [copied, setCopied] = useState(false)
    const [linked, setLinked] = useState(false)

    const active = loadouts.find(l => l.id === activeId) ?? null

    const submit = async () => {
        setBusy(true); setError(null)
        try {
            const res = await fetch('/api/loadouts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw, name, description, shared: makePublic, icon: importIcon }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) {
                setError(json.error ?? 'That import failed.')
                setBusy(false)
                return
            }
            window.location.reload()
        } catch {
            // A thrown fetch would otherwise leave busy set and the Import button
            // dead, with the member's pasted export still sitting in the textarea.
            setError('Could not reach the server. Try again.')
            setBusy(false)
        }
    }

    const patch = async (id: string, body: Record<string, unknown>) => {
        setBusy(true); setError(null)
        try {
            const res = await fetch(`/api/loadouts/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (!res.ok) {
                const json = await res.json().catch(() => ({}))
                setError(json.error ?? 'That change could not be saved.')
                setBusy(false)
                return
            }
            window.location.reload()
        } catch {
            // A thrown fetch would otherwise leave busy set and every control dead.
            setError('Could not reach the server. Try again.')
            setBusy(false)
        }
    }

    const remove = async (id: string) => {
        if (!confirm('Delete this kit?')) return
        setBusy(true); setError(null)
        try {
            const res = await fetch(`/api/loadouts/${id}`, { method: 'DELETE' })
            if (!res.ok) {
                const json = await res.json().catch(() => ({}))
                setError(json.error ?? 'That kit could not be deleted.')
                setBusy(false)
                return
            }
            window.location.reload()
        } catch {
            setError('Could not reach the server. Try again.')
            setBusy(false)
        }
    }

    const saveDetails = () => {
        if (!active) return
        patch(active.id, { description: descDraft, icon: iconDraft })
    }

    // Escape closes the import dialog. The page behind it is deliberately left
    // scrollable — the usual scroll lock would trap a member who opened the
    // dialog on a short window and needs to reach the rest of the page.
    useEffect(() => {
        if (!importing) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setImporting(false) }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [importing])

    /* A dialog rather than a panel that grows out of the kit row: the form
       asks five things, and unfolding that much below the kits pushed
       everything the member was looking at off the screen. Rendered in place
       rather than through a portal — the palette and the member's accent are
       custom properties on `.shell`, and a portal to document.body would
       leave every one of them unresolved.

       Hoisted into a variable because both the blank slate and the populated
       panel below render it, and it must not be duplicated between them. */
    const importDialog = isOwn && importing && (
                <div
                    className={s.modalBack}
                    // mousedown, not click: a drag-select that starts inside the
                    // dialog and ends on the backdrop must not close it.
                    onMouseDown={e => { if (e.target === e.currentTarget) setImporting(false) }}
                >
                <div className={s.modal} role='dialog' aria-modal='true' aria-labelledby='kit-import-heading'>
                    <header className={s.modalHead}>
                        <h2 id='kit-import-heading'>Import a kit</h2>
                        <button type='button' className={s.modalClose} aria-label='Close'
                            onClick={() => setImporting(false)}>
                            <UiIcon icon='close' size={14} />
                        </button>
                    </header>

                    <div className={s.modalBody}>
                    <p className={s.kitImportHelp}>
                        In game, open ACE arsenal, load the kit you want to record, then click
                        <strong> Export </strong> at the bottom of the arsenal screen and paste it below.
                    </p>

                    <label className={s.kitField}>
                        <span className={s.lbl}>Name</span>
                        <input
                            className={s.kitImportName}
                            placeholder='e.g. Section Medic'
                            maxLength={MAX_NAME}
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </label>

                    <div className={s.kitField}>
                        <span className={s.lbl}>Icon</span>
                        <IconPicker value={importIcon} onPick={setImportIcon} />
                    </div>

                    <label className={s.kitField}>
                        <span className={s.lbl}>Description — optional</span>
                        <input
                            className={s.kitImportName}
                            placeholder='One line on what this kit is for'
                            maxLength={MAX_DESCRIPTION}
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                        />
                    </label>

                    <div className={s.kitField}>
                        <span className={s.lbl}>Visibility</span>
                        <div>
                            <button
                                type='button'
                                className={makePublic ? `${s.btn} ${s.kitPublic} ${s.kitPublicOn}` : `${s.btn} ${s.kitPublic}`}
                                aria-pressed={makePublic}
                                onClick={() => setMakePublic(v => !v)}
                            >
                                <Dot on={makePublic} />
                                {makePublic ? 'Public' : 'Private'}
                            </button>
                        </div>
                        {/* Stated at the moment of the decision rather than in a
                            blanket warning above it: publishing is the one part of
                            this form that other people can act on. */}
                        <p className={s.kitFieldNote}>
                            {makePublic
                                ? 'Anyone can see this kit on your milpac and copy it from the unit kit shelf.'
                                : 'Only you can see this kit. You can publish it later.'}
                        </p>
                    </div>

                    <label className={s.kitField}>
                        <span className={s.lbl}>ACE arsenal export</span>
                        <textarea
                            className={s.kitImportBox}
                            rows={5}
                            placeholder='Paste your ACE arsenal export'
                            value={raw}
                            onChange={e => setRaw(e.target.value)}
                        />
                    </label>
                    </div>

                    <footer className={s.modalFoot}>
                        {error && <p className={s.kitImportError}>{error}</p>}
                        <button type='button' className={s.btn} disabled={busy}
                            onClick={() => setImporting(false)}>
                            <UiIcon icon='close' />Cancel
                        </button>
                        <button type='button' className={`${s.btn} ${s.btnAcc}`} disabled={busy || !raw.trim()} onClick={submit}>
                            <UiIcon icon='import' />{busy ? 'Importing' : 'Import'}
                        </button>
                    </footer>
                </div>
                </div>
    )

    // A file with no kits gets a blank slate instead of the picker and controls:
    // a bare `+` above an empty panel collapses the tab to a single row, and the
    // import dialog then opens over a strip of page with the footer beneath it.
    // One clear invitation reads better than a toolbar for nothing.
    const blank = isOwn && loadouts.length === 0

    if (blank) {
        return (
            <>
                <div className={`${s.kitBlank} ${s.kitBlankOwn}`}>
                    <KitIcon icon='kit' size={30} />
                    <p className={s.kitBlankTitle}>No kits recorded</p>
                    <p className={s.kitBlankNote}>
                        Import a kit from ACE arsenal to record what you carry. Kits stay
                        private until you publish them.
                    </p>
                    <button type='button' className={`${s.btn} ${s.btnAcc}`} onClick={() => setImporting(true)}>
                        <UiIcon icon='import' />Import a kit
                    </button>
                    {error && <p className={s.kitImportError}>{error}</p>}
                </div>
                {importDialog}
            </>
        )
    }

    return (
        <>
            {/* The kit row doubles as the panel's own header: add a kit, then the
                kits. It renders for the owner even with no kits at all, because
                that is exactly when adding one is the only thing to do here. */}
            {(isOwn || loadouts.length > 1) && (
                <div className={s.kitPicks}>
                    {isOwn && (
                        <button
                            type='button'
                            className={s.kitAdd}
                            // Icon-only, so the label carries the whole meaning —
                            // a bare "+" tells a screen reader nothing.
                            title={importing ? 'Cancel' : 'Import a kit'}
                            aria-label={importing ? 'Cancel importing a kit' : 'Import a kit'}
                            aria-expanded={importing}
                            onClick={() => setImporting(v => !v)}
                        >
                            <UiIcon icon={importing ? 'close' : 'plus'} size={15} />
                        </button>
                    )}

                    <div className={s.kitPickList}>
                        {loadouts.length > 1 && loadouts.map(l => {
                        const on = l.id === activeId
                        return (
                            <div key={l.id} className={on ? `${s.kitPick} ${s.kitPickOn}` : s.kitPick}>
                                <Link
                                    // The tab is carried along: a chip that dropped it
                                    // would bounce the reader back to the overview.
                                    href={`${basePath}/kits/${l.id}` as Route}
                                    scroll={false}
                                    aria-current={on ? 'true' : undefined}
                                    className={s.kitPickName}
                                    title={l.description || undefined}
                                >
                                    <KitIcon icon={l.icon} size={14} />
                                    {l.name}
                                </Link>

                                {/* The nominated kit shows a lit star to everyone;
                                    only the owner gets one to press on the others. A
                                    disabled button on the current default would lose
                                    its tooltip and its focus, so it is a span. */}
                                {l.isDefault ? (
                                    <span className={`${s.kitStar} ${s.kitStarOn}`} title='Default kit'>
                                        <Star filled />
                                        <span className={s.srOnly}>Default kit</span>
                                    </span>
                                ) : isOwn && (
                                    <button
                                        type='button'
                                        className={s.kitStar}
                                        title='Set as default'
                                        aria-label={`Set ${l.name} as the default kit`}
                                        disabled={busy}
                                        onClick={() => patch(l.id, { isDefault: true })}
                                    >
                                        <Star filled={false} />
                                    </button>
                                )}
                            </div>
                        )
                        })}
                    </div>
                </div>
            )}

            {/* The icon and description are editable at any time, not only at
                import — they are the two fields a member is likely to get wrong
                first go, and the alternative was delete-and-reimport. Saving an
                empty description box removes it. */}
            {active && (isOwn || active.description) && (
                editing
                    ? (
                        <div className={s.kitEdit}>
                            <div className={s.kitField}>
                                <span className={s.lbl}>Icon</span>
                                <IconPicker value={iconDraft} onPick={setIconDraft} />
                            </div>
                            <div className={s.kitField}>
                                <span className={s.lbl}>Description</span>
                                <div className={s.kitDescEdit}>
                                    <input
                                        className={`${s.kitImportName} ${s.kitDescInput}`}
                                        placeholder='One line on what this kit is for'
                                        aria-label='Kit description'
                                        maxLength={MAX_DESCRIPTION}
                                        value={descDraft}
                                        autoFocus
                                        onChange={e => setDescDraft(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') saveDetails()
                                            if (e.key === 'Escape') setEditing(false)
                                        }}
                                    />
                                    <button type='button' className={`${s.btn} ${s.btnAcc}`} disabled={busy}
                                        onClick={saveDetails}>
                                        <UiIcon icon='check' />{busy ? 'Saving' : 'Save'}
                                    </button>
                                    <button type='button' className={s.btn} disabled={busy}
                                        onClick={() => setEditing(false)}>
                                        <UiIcon icon='close' />Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                    : (
                        <p className={s.kitBlurb}>
                            {active.description || <span className={s.kitBlurbNone}>No description</span>}
                            {isOwn && (
                                <button
                                    type='button'
                                    className={s.kitDescBtn}
                                    onClick={() => {
                                        setDescDraft(active.description)
                                        setIconDraft(active.icon)
                                        setEditing(true)
                                    }}
                                >
                                    <UiIcon icon='pencil' size={10} />Edit
                                </button>
                            )}
                        </p>
                    )
            )}

            <div className={s.kitControls}>
                {isOwn && active && (
                    <button
                        type='button'
                        className={active.shared ? `${s.btn} ${s.kitPublic} ${s.kitPublicOn}` : `${s.btn} ${s.kitPublic}`}
                        aria-pressed={active.shared}
                        title={active.shared
                            ? 'On the unit kit shelf — press to make it private'
                            : 'Only you can see this kit — press to publish it'}
                        disabled={busy}
                        onClick={() => patch(active.id, { shared: !active.shared })}
                    >
                        <Dot on={active.shared} />
                        {active.shared ? 'Public' : 'Private'}
                    </button>
                )}

                {/* The owner can copy their own kit whether or not it is published
                    — it is their export. Visitors only ever hold public ones. */}
                {active && (isOwn || active.shared) && (
                    <button
                        type='button'
                        className={`${s.btn} ${s.kitCopy}`}
                        aria-live='polite'
                        title='Copy the ACE arsenal export, to paste into the arsenal'
                        onClick={async () => { setCopied(await copyText(active.raw)); setTimeout(() => setCopied(false), 1800) }}
                    >
                        <UiIcon icon={copied ? 'check' : 'copy'} />
                        {copied ? 'Copied' : 'Copy kit'}
                    </button>
                )}

                {/* Only for a published kit: the link would land anyone else on
                    this member's default kit instead, since a private one is
                    filtered out of the page before it is ever rendered. */}
                {active?.shared && (
                    <button
                        type='button'
                        className={s.btn}
                        aria-live='polite'
                        title='Copy a link straight to this kit'
                        onClick={async () => {
                            // Built from the canonical basePath rather than
                            // window.location, so it is right even on a URL that
                            // has not been redirected to the name slug yet.
                            const url = `${window.location.origin}${basePath}/kits/${active.id}`
                            setLinked(await copyText(url))
                            setTimeout(() => setLinked(false), 1800)
                        }}
                    >
                        <UiIcon icon={linked ? 'check' : 'link'} />
                        {linked ? 'Link copied' : 'Share'}
                    </button>
                )}

                {isOwn && active && (
                    <button type='button' className={`${s.btn} ${s.btnDanger}`} disabled={busy}
                        onClick={() => remove(active.id)}>
                        <UiIcon icon='trash' />Delete
                    </button>
                )}
            </div>

            {error && !importing && <p className={s.kitImportError}>{error}</p>}

            {importDialog}
        </>
    )
}
