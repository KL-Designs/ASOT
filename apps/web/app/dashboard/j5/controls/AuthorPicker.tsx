'use client'

import { useState } from 'react'

import { Field } from './Field'
import { Select, type SelectOption } from './Select'
import { useMembers } from './useMembers'
import f from '@/styles/j5-fields.module.css'

/**
 * Who took it — a member, or a name.
 *
 * A free-text box was wrong for two different reasons at once. `gallery_media`
 * carries `authorId` as well as `authorName`, and `authorId` decides who can
 * see an unpublished item and who gets its accept/reject notification, so
 * typing a correction over a submitted photo changed the label and left the
 * link pointing at whoever actually uploaded it. And it made every credit a
 * guess at spelling — the same photographer written three ways is three
 * different people to anything that ever groups on the field.
 *
 * The two are one control rather than two, because they are one question with
 * two kinds of answer, and a reviewer must be able to see at a glance which
 * one this item got. The select IS the answer: it either names a member or it
 * says, in its own row, that this is a typed name and nothing is linked. The
 * text box only exists while that row is chosen, so a name can never be sitting
 * in a box underneath a selected member, quietly disagreeing with it.
 *
 * Free text has to stay possible: some archive photographers left before the
 * CSV import and are in `Db.users` under no shape at all. Choosing it is an
 * explicit act with its consequence stated, not the default that a link has to
 * be argued out of.
 */

/** Values no member id can collide with — a Discord snowflake and a skeleton
 *  account's ObjectId string are both plain digits/hex. */
const NONE = '__none__'
const TYPED = '__typed__'

export type AuthorValue = {
    /** A member id (`User.id`), or null for "no link". */
    id: string | null
    /** The name to record. Meaningful only when `id` is null — a linked
     *  author's name is read off the user document by the route, never taken
     *  from here, so a renamed member cannot be filed under a stale label. */
    name: string
}

export function AuthorPicker({ label = 'Author', value, onChange, disabled }: {
    label?: string
    value: AuthorValue
    onChange: (value: AuthorValue) => void
    disabled?: boolean
}) {
    const { members, error } = useMembers()

    /* Held here rather than derived from `value` on every render, because
       "typed, box still empty" and "no author" are the same `value` and must
       not be the same control state: deriving it would snap the box shut the
       moment the reviewer cleared it to retype. Seeded once — the parent
       remounts this with a key when it switches to another item. */
    const [mode, setMode] = useState<'none' | 'member' | 'typed'>(
        value.id ? 'member' : value.name ? 'typed' : 'none',
    )

    const linked = mode === 'member' && value.id ? members.find(m => m.id === value.id) ?? null : null

    /* A stored `authorId` with no row behind it — either the roster has not
       arrived yet, or the member was removed from the database since the
       credit was written. Either way the trigger must not fall back to the
       placeholder: "No author" on an item that IS credited reads as never
       having been credited, and invites a save that quietly drops the link.
       `muted` marks it as a state rather than a peer of the real names — the
       same idiom Inspector uses for an unlinked operation. */
    const unmatched = mode === 'member' && value.id && !linked ? value.id : null
    const unmatchedLabel = members.length === 0
        ? (value.name || 'Loading members…')
        : `${value.name || value.id} — linked to a member no longer on the roster`

    const options: SelectOption[] = [
        { value: NONE, label: 'No author' },
        { value: TYPED, label: 'A name not on the roster…', note: 'no link' },
        ...(unmatched ? [{ value: unmatched, label: unmatchedLabel, muted: true }] : []),
        ...members.map(m => ({
            value: m.id,
            label: m.displayName,
            // Which of two similar names is the archive-era CSV stub. Said
            // plainly, because picking one is still a real link and the
            // reviewer should not have to wonder why it looks different.
            note: m.skeleton ? 'no Discord' : undefined,
        })),
    ]

    const selected = mode === 'member' ? (value.id ?? NONE) : mode === 'typed' ? TYPED : NONE

    function pick(next: string) {
        if (next === NONE) { setMode('none'); onChange({ id: null, name: '' }); return }
        if (next === TYPED) {
            // Deliberately not carried over from a member that was selected a
            // moment ago: pre-filling their name would turn "this is not a
            // member" into a copy of a member's label, which is the exact
            // ambiguity this control exists to remove.
            setMode('typed')
            onChange({ id: null, name: '' })
            return
        }
        setMode('member')
        onChange({ id: next, name: members.find(m => m.id === next)?.displayName ?? '' })
    }

    return (
        <div className={f.field}>
            <Select
                label={label}
                searchable
                value={selected}
                onChange={pick}
                options={options}
                disabled={disabled}
                placeholder='No author'
            />

            {mode === 'typed' && (
                <>
                    <Field
                        label='Name'
                        value={value.name}
                        onChange={name => onChange({ id: null, name })}
                        placeholder='As it should be credited'
                        disabled={disabled}
                    />
                    <span className={f.hint}>Saved as text. This item will not be linked to a member.</span>
                </>
            )}

            {mode === 'member' && linked && (
                <span className={f.hint}>
                    Linked to {linked.displayName}{linked.skeleton ? ' — an imported record, not a Discord account' : ''}.
                </span>
            )}

            {error && <span className={f.error}>Members could not be loaded ({error}). Only a typed name is available.</span>}
        </div>
    )
}
