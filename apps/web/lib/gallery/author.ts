import type { Filter, FindOptions, WithId } from 'mongodb'

/**
 * Who took the photograph — resolved once, for every admin write path.
 *
 * `gallery_media` carries BOTH `authorId` and `authorName`, and `authorId` is
 * load-bearing rather than decorative: `app/api/gallery/media/[id]/route.ts`
 * and `.../poster/route.ts` grant a submitter access to their own unpublished
 * bytes by comparing `me.id === doc.authorId`, and
 * `app/api/gallery/submissions/[id]/route.ts` sends the accept/reject
 * notification to it. Both J5 admin write paths used to set only the name, so
 * correcting the author on a submitted photo left the document naming one
 * member while still pointing at another member's id — the original submitter
 * kept owner access to the file and would have kept receiving its
 * notifications. The two fields are only ever written together, and only ever
 * cleared together, and this module is the single place that decides which.
 *
 * The name of a LINKED author is read off the user document, never off the
 * request. A client is trusted to say *which member*, not what that member is
 * called: a member who is later renamed would otherwise stay recorded under
 * whatever label the reviewer's browser happened to have cached.
 *
 * Free text stays possible, because it has to. Some archive photographers left
 * the unit before the CSV import and are in no collection at all. Naming one
 * of them writes the name and explicitly `$unset`s `authorId`, so the pair can
 * never disagree again — a name with no link is a name with no link, not a
 * name over somebody else's id.
 *
 * `deps` is passed in rather than reaching for `@/lib/mongo` directly, the
 * same convention `lib/gallery/relocate.ts` and `operation-facets.ts` use, so
 * a test can exercise this without connecting to anything.
 */

export type AuthorDeps = {
    users: {
        findOne(filter: Filter<User>, options?: FindOptions): Promise<WithId<User> | null>
    }
}

/** What to merge into a caller's own `$set`/`$unset`. Never one field alone —
 *  see the module comment. */
export type AuthorWrite = {
    set: { authorId?: string, authorName?: string }
    unset: { authorId?: '', authorName?: '' }
}

export type AuthorResolution =
    /** `write: null` means the payload asked for no author change at all —
     *  distinct from asking to clear it, which is a write of two `$unset`s. */
    | { ok: true, write: AuthorWrite | null }
    | { ok: false, error: string }

/** The display-name chain the rest of the app uses — `submissions/route.ts`
 *  writes `authorName` with exactly this, and `submissions/[id]/route.ts`
 *  documents it. `id` is the last resort so a row can never render blank. */
export function memberDisplayName(user: Pick<User, 'id' | 'globalName' | 'username'> & { guild?: { displayName?: string | null, nickname?: string | null } | null }): string {
    return user.guild?.displayName || user.guild?.nickname || user.globalName || user.username || user.id
}

/**
 * Read an author change out of a request body.
 *
 * The contract, in the order it is applied:
 *   - a non-empty `authorId` string LINKS: the id is verified against
 *     `Db.users` and the name comes from that document, whatever the request
 *     said the name was;
 *   - otherwise a string `authorName` NAMES: free text, with `authorId`
 *     unset, because a typed name is by definition not a link;
 *   - an empty `authorName`, or an explicitly null/empty `authorId` with no
 *     name beside it, CLEARS both;
 *   - neither key present changes nothing.
 *
 * An `authorId` matching no user is an error, not a silent fallback to the
 * name the client sent: writing that name would produce exactly the split this
 * module exists to prevent, one field further along.
 */
export async function resolveAuthor(
    deps: AuthorDeps,
    input: { authorId?: unknown, authorName?: unknown },
): Promise<AuthorResolution> {
    const { authorId, authorName } = input

    if (typeof authorId === 'string' && authorId.trim() !== '') {
        const user = await deps.users.findOne(
            { id: authorId.trim() },
            { projection: { id: 1, globalName: 1, username: 1, 'guild.displayName': 1, 'guild.nickname': 1 } },
        )
        // Skeleton accounts are deliberately linkable here — see the members
        // route — so the only rejection is an id that names nobody at all.
        if (!user) return { ok: false, error: 'No such member' }
        return { ok: true, write: { set: { authorId: user.id, authorName: memberDisplayName(user) }, unset: {} } }
    }

    if (typeof authorName === 'string') {
        const trimmed = authorName.trim().slice(0, 120)
        return trimmed
            ? { ok: true, write: { set: { authorName: trimmed }, unset: { authorId: '' } } }
            : { ok: true, write: { set: {}, unset: { authorId: '', authorName: '' } } }
    }

    // `authorId: null` on its own — the picker's "No author" with no name box
    // open. Clearing the link alone would leave a name nobody chose.
    if (authorId === null || authorId === '') {
        return { ok: true, write: { set: {}, unset: { authorId: '', authorName: '' } } }
    }

    return { ok: true, write: null }
}

/** What `logAction` should record about an author change, so the audit trail
 *  distinguishes "linked to a member" from "written down as a name" — the
 *  whole point of the pair. */
export function describeAuthorWrite(write: AuthorWrite): { author: string | null, authorId: string | null, linked: boolean } {
    return {
        author: write.set.authorName ?? null,
        authorId: write.set.authorId ?? null,
        linked: !!write.set.authorId,
    }
}
