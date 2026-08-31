import { describe, test, expect } from 'vitest'
import { planFolderStrip } from './strip-folder-numbers'
import type { ContainerListing } from './strip-folder-numbers'

/**
 * The plan half of scripts/strip-folder-numbers.ts.
 *
 * Everything here is about what the migration REFUSES to do. Renaming
 * "5. Op Northern Wall" to "Op Northern Wall" is the easy case and one test
 * covers it; the rest of the file is the collision, the folder whose name
 * merely starts with a digit, the half-applied run, and the levels that must
 * never be touched — because those are the outcomes that cannot be undone
 * afterwards.
 */

const ID = '507f1f77bcf86cd799439011'
const ID2 = '507f1f77bcf86cd799439012'
const named = (n: string) => `Koda — ${n} [${n === 'a' ? ID : ID2}].jpg`

function containers(tree: Record<string, string[]>): ContainerListing[] {
    return Object.entries(tree).map(([name, folders]) => ({ name, folders }))
}

describe('planFolderStrip', () => {
    test('strips the prefix off a numbered folder and rewrites every document under it', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['5. Op Northern Wall'] }),
            [
                `content:2021/5. Op Northern Wall/Saturday/${named('a')}`,
                `content:2021/5. Op Northern Wall/Sunday/${named('b')}`,
            ],
        )

        expect(plan.skips).toEqual([])
        expect(plan.renames).toHaveLength(1)

        const [rename] = plan.renames
        expect(rename.container).toBe('2021')
        expect(rename.from).toBe('5. Op Northern Wall')
        expect(rename.to).toBe('Op Northern Wall')
        expect(rename.renameOnDisk).toBe(true)
        expect(rename.idNamed).toBe(true)
        expect(rename.keys.map(k => k.to)).toEqual([
            `content:2021/Op Northern Wall/Saturday/${named('a')}`,
            `content:2021/Op Northern Wall/Sunday/${named('b')}`,
        ])
        // Only the top segment moves; the day folders are byte-identical.
        expect(rename.keys.every(k => k.facet === 'operation')).toBe(true)
    })

    /* The property that makes this safe to re-run from the start menu, and
       safe to run again after a failure. An unnumbered folder is not a
       candidate at all — not a rename, and not even a skip. */
    test('a second run over an already-stripped tree plans nothing', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['Op Northern Wall'] }),
            [`content:2021/Op Northern Wall/Saturday/${named('a')}`],
        )

        expect(plan.renames).toEqual([])
        expect(plan.skips).toEqual([])
    })

    /* The unrecoverable one. Both folders keep their names: merging two
       operations' photographs is not something a later run can undo, and
       nothing in this migration deletes, so there is no repair either. */
    test('refuses to strip onto a folder that already exists, and leaves both alone', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['5. Op Northern Wall', 'Op Northern Wall'] }),
            [
                `content:2021/5. Op Northern Wall/Saturday/${named('a')}`,
                `content:2021/Op Northern Wall/Saturday/${named('b')}`,
            ],
        )

        expect(plan.renames).toEqual([])
        expect(plan.skips).toHaveLength(1)
        expect(plan.skips[0].folder).toBe('5. Op Northern Wall')
        expect(plan.skips[0].reason).toContain('already exists')
        // The count is what tells an operator how much is behind the refusal.
        expect(plan.skips[0].documents).toBe(1)
    })

    /* The symmetrical form of the same collision: neither folder exists at the
       stripped name yet, so each looks safe on its own. Counting destinations
       before planning anything is what catches it. */
    test('refuses both folders when two numbered folders strip to the same name', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['5. Op Twin', '7. Op Twin'] }),
            [
                `content:2021/5. Op Twin/Saturday/${named('a')}`,
                `content:2021/7. Op Twin/Saturday/${named('b')}`,
            ],
        )

        expect(plan.renames).toEqual([])
        expect(plan.skips.map(s => s.folder)).toEqual(['5. Op Twin', '7. Op Twin'])
        for (const skip of plan.skips) expect(skip.reason).toContain('also strips to')
    })

    /* The same names in two different years are two different folders. A
       collision guard keyed on the folder name alone would refuse both. */
    test('two years may each hold a folder that strips to the same name', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['5. Op Twin'], 2022: ['1. Op Twin'] }),
            [
                `content:2021/5. Op Twin/Saturday/${named('a')}`,
                `content:2022/1. Op Twin/Saturday/${named('b')}`,
            ],
        )

        expect(plan.skips).toEqual([])
        expect(plan.renames.map(r => `${r.container}/${r.from} -> ${r.to}`)).toEqual([
            '2021/5. Op Twin -> Op Twin',
            '2022/1. Op Twin -> Op Twin',
        ])
    })

    /* Only the top-level-within-year slot ever carried a number. A campaign,
       a mission and a day folder that happen to start with digits are part of
       the archive's real names and must survive untouched — including inside
       the rewritten key. */
    test('never renames a campaign, mission or day folder', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['5. Op Trinity'] }),
            [`content:2021/5. Op Trinity/3. Mission II/Saturday/${named('a')}`],
        )

        expect(plan.renames).toHaveLength(1)
        expect(plan.renames[0].keys[0].to)
            .toBe(`content:2021/Op Trinity/3. Mission II/Saturday/${named('a')}`)
        // Five segments is the campaign grammar, so the folder being renamed
        // is the CAMPAIGN — the same reading parseContentPath makes.
        expect(plan.renames[0].keys[0].facet).toBe('campaign')
    })

    test('a four-segment key names the folder through the operation facet', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['5. Op Trinity'] }),
            [`content:2021/5. Op Trinity/Saturday/${named('a')}`],
        )

        expect(plan.renames[0].keys[0].facet).toBe('operation')
    })

    /* The latent bug the folder-numbering report flagged, and the one this
       migration would have ACTED on. It is fixed at the source — naming.ts's
       ORDER_PREFIX now requires a separator — so the folder is not a
       candidate: no rename, and no skip either, because there is nothing here
       to decide about. */
    test('a folder whose name legitimately starts with a digit is not a candidate', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['1st Recon Sweep'] }),
            [`content:2021/1st Recon Sweep/Saturday/${named('a')}`],
        )

        expect(plan.renames).toEqual([])
        expect(plan.skips).toEqual([])
    })

    /* What the separator rule cannot tell apart: "2021 Recon Sweep" is
       digits, a space and a label, exactly like "9 Op Copper Ridge". Refused
       and REPORTED, so a real folder is neither mangled nor silently passed
       over. */
    test('a leading number that reads as a year is skipped and reported', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['2021 Recon Sweep'] }),
            [`content:2021/2021 Recon Sweep/Saturday/${named('a')}`],
        )

        expect(plan.renames).toEqual([])
        expect(plan.skips).toHaveLength(1)
        expect(plan.skips[0].reason).toContain('year')
    })

    test('a folder whose whole name is a number keeps it', () => {
        const plan = planFolderStrip(containers({ 2021: ['12'] }), [])
        expect(plan.renames).toEqual([])
        // splitOperation('12') now reports no order at all, so this never
        // reaches the "unchanged or empty" rule — it is simply not a
        // candidate, and the assertion is that nothing happens to it.
        expect(plan.skips).toEqual([])
    })

    /* The recovery path for the one partial state the rename-then-update
       order can produce. Candidates come from the KEYS as well as the disk,
       which is the only reason this folder is seen at all. */
    test('finishes a folder whose directory was renamed by a run that did not update its documents', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['Op Northern Wall'] }),
            [`content:2021/5. Op Northern Wall/Saturday/${named('a')}`],
        )

        expect(plan.skips).toEqual([])
        expect(plan.renames).toHaveLength(1)
        expect(plan.renames[0].renameOnDisk).toBe(false)
        expect(plan.renames[0].keys[0].to)
            .toBe(`content:2021/Op Northern Wall/Saturday/${named('a')}`)
    })

    /* A document naming a folder that is not on disk under either spelling is
       reconcile's problem, not this migration's: there is nothing to rename,
       and inventing the destination would be creating a path rather than
       repairing one. */
    test('skips a folder that is on disk under neither name', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['Op Something Else'] }),
            [`content:2021/5. Op Northern Wall/Saturday/${named('a')}`],
        )

        expect(plan.renames).toEqual([])
        expect(plan.skips).toHaveLength(1)
        expect(plan.skips[0].reason).toContain('neither')
    })

    /* The whole legacy archive is keyed this way, and it is the bulk of what
       this migration renames. The prefix is preserved rather than upgraded:
       renaming legacy: to content: is index-gallery.mjs's job, and doing it
       here could land on a content: twin that already exists. */
    test('a legacy: key keeps its prefix and is reported as not id-named', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['5. Op Northern Wall'] }),
            ['legacy:2021/5. Op Northern Wall/I/photo.jpg'],
        )

        expect(plan.renames).toHaveLength(1)
        expect(plan.renames[0].keys[0].to).toBe('legacy:2021/Op Northern Wall/I/photo.jpg')
        /* False is what the script prints as "a backup export cannot number
           this folder again" — export-numbering.ts refuses to rename a folder
           holding a path-matched document, because reconcile's rule 2 compares
           the path character for character. */
        expect(plan.renames[0].idNamed).toBe(false)
    })

    test('one path-matched document among id-named ones is enough to clear idNamed', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['5. Op Northern Wall'] }),
            [
                `content:2021/5. Op Northern Wall/I/${named('a')}`,
                'content:2021/5. Op Northern Wall/I/photo.jpg',
            ],
        )

        expect(plan.renames[0].idNamed).toBe(false)
        // Still renamed: this migration rewrites the key itself rather than
        // leaving the document to be re-found by reconcile.
        expect(plan.renames[0].keys).toHaveLength(2)
    })

    /* Compared WITHOUT the key prefix, because content: and legacy: name the
       same directory. Two documents for one file is a condition
       index-gallery.mjs reports for a human; this must not turn it into two
       files on disk. */
    test('refuses a folder whose destination path another document already claims', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['5. Op Northern Wall'] }),
            [
                'legacy:2021/5. Op Northern Wall/I/photo.jpg',
                'content:2021/Op Northern Wall/I/photo.jpg',
            ],
        )

        expect(plan.renames).toEqual([])
        expect(plan.skips).toHaveLength(1)
        expect(plan.skips[0].reason).toContain('already claim')
    })

    /* Unknown/ is a year-level folder holding files directly, so a key with
       two segments has no folder level to rename and nothing under one to
       rewrite. It must not be read as {year}/{file} and renamed. */
    test('ignores a two-segment key with no folder level', () => {
        const plan = planFolderStrip(containers({ Unknown: [] }), ['content:Unknown/loose.jpg'])
        expect(plan.renames).toEqual([])
        expect(plan.skips).toEqual([])
    })

    test('a numbered folder nested under Unknown is stripped like any other', () => {
        const plan = planFolderStrip(
            containers({ Unknown: ['5. Op Northern Wall'] }),
            [`content:Unknown/5. Op Northern Wall/${named('a')}`],
        )

        expect(plan.renames).toHaveLength(1)
        expect(plan.renames[0].keys[0].to).toBe(`content:Unknown/Op Northern Wall/${named('a')}`)
    })

    /* Keys this tree cannot serve are left completely alone — resolveStorageKey
       would return null for them, so rewriting one would move a record from a
       path that does not resolve to another path that does not resolve. */
    test('ignores media:, featured: and sotm: keys and out-of-range paths', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['5. Op Northern Wall'] }),
            [
                `media:${ID}.jpg`,
                'featured:hero.jpg',
                'sotm:winner.jpg',
                'content:2021/5. Op Northern Wall/a/b/c/too-deep.jpg',
            ],
        )

        // The folder is still a candidate — it is on disk — but the six-segment
        // key is not one of its documents.
        expect(plan.renames).toHaveLength(1)
        expect(plan.renames[0].keys).toEqual([])
    })

    /* An operator reads the dry run, then reads the --apply that follows it.
       Two different orderings of the same tree is how a folder gets missed in
       the comparison, so the plan is sorted rather than left in readdir order. */
    test('orders the plan the same way regardless of input order', () => {
        const tree = { 2022: ['3. Op Bravo'], 2021: ['10. Op Alpha', '2. Op Charlie'] }
        const keys = [
            `content:2021/10. Op Alpha/I/${named('a')}`,
            `content:2022/3. Op Bravo/I/${named('b')}`,
        ]

        const forward = planFolderStrip(containers(tree), keys)
        const backward = planFolderStrip(containers(tree).reverse(), [...keys].reverse())

        expect(forward.renames.map(r => `${r.container}/${r.from}`)).toEqual([
            '2021/2. Op Charlie',
            '2021/10. Op Alpha',
            '2022/3. Op Bravo',
        ])
        expect(backward.renames.map(r => `${r.container}/${r.from}`))
            .toEqual(forward.renames.map(r => `${r.container}/${r.from}`))
    })

    test('a numbered folder holding no documents is still renamed', () => {
        const plan = planFolderStrip(containers({ 2021: ['5. Op Empty'] }), [])

        expect(plan.renames).toHaveLength(1)
        expect(plan.renames[0].keys).toEqual([])
        // Vacuously true: there is nothing in here a backup export could fail
        // to number.
        expect(plan.renames[0].idNamed).toBe(true)
    })

    test('accepts the separators that actually appear in storage', () => {
        const plan = planFolderStrip(
            containers({ 2021: ['9) Op A', '9 - Op B', '9 Op C', '9. Op D'] }),
            [],
        )

        expect(plan.skips).toEqual([])
        expect(plan.renames.map(r => r.to).sort()).toEqual(['Op A', 'Op B', 'Op C', 'Op D'])
    })
})
