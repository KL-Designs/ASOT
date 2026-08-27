/**
 * The operations editor shell (`app/operations/[id]/edit`).
 *
 * Four behaviours, one per describe block below — see the plan's task-14
 * brief for the full rationale. All four sign in the same way every other
 * spec in this suite does (`pageAs`/`signIn` — a seeded Mongo user plus a
 * `token` cookie, no OAuth), and each test seeds its own operation directly
 * via `withDb()` rather than the `/api/operations/new` route, since that
 * route requires `PERMISSIONS.operations.write` and this file only needs a
 * known, stable `_id` to navigate to — not the creation flow itself.
 *
 * ── Who is "HQ" here ──────────────────────────────────────────────────────
 * `app/operations/[id]/edit/layout.tsx` (the server redirect gate) and
 * page.tsx's own `isHQ` client flag both read the exact same permission key —
 * `PERMISSIONS.pages.operationsEdit` (`['HQ Staff', 'J2 - Mission Making']`,
 * `lib/permissions.ts`) — via `client.hasRoles()`. That function's global
 * bypass (any holder of the Discord role literally named `J4-Administration`,
 * hardcoded in `lib/discord/index.ts`) is what lets the `j4` persona
 * (tests/constants.ts) stand in for "HQ" below, exactly the way
 * `dashboard.permissions.spec.ts` already relies on the same bypass for its
 * own J4 assertions — no new persona needed.
 *
 * The `j3` persona holds neither `HQ Staff`/`J2 - Mission Making` nor the
 * bypass role, so it is genuinely turned away at the layout gate. Because
 * the gate and the client flag are the same check, there is currently no
 * reachable state where a signed-in user sees the tab bar at all with
 * `isHQ === false` — the "Attendance tab absent for non-HQ" spec below
 * therefore proves absence via that redirect (the strongest form of
 * "absent from the DOM": the DOM in question never contains an editor at
 * all), with a positive-control HQ case alongside it so the redirect being
 * asserted is known to actually gate something, not just be a slow load
 * that never settles (same reasoning `dashboard.permissions.spec.ts` gives
 * for its own positive controls).
 *
 * ── Why the tab-switch spec needs a live collab connection to pass ────────
 * `components/editor/CollabEditor.tsx` seeds the operation's first section
 * (title `defaultSectionTitle`, "Situation") only inside a
 * `provider.on('synced', ...)` handler — and Hocuspocus's `synced` flag is
 * set only after a real WebSocket handshake with the collab server
 * completes (`@hocuspocus/provider`'s `synced` setter is fed by the sync
 * protocol; there is no local/offline fallback). Until a section exists,
 * `ActiveEditor` renders no `.ProseMirror` region at all — nothing to click
 * into or type in.
 *
 * `playwright.config.ts`'s `webServer` runs `npm run dev` (`next dev`),
 * which has no `/collab` route — that upgrade handler only exists in
 * `server.mjs` (`npm run dev-collab`). So as configured today, this spec
 * will time out waiting for the editor, not because tab-switching itself is
 * broken. Deliberately not fixed by pointing `webServer` at `dev-collab`
 * here: `server.mjs` also runs `cleanupOperationImages()` on startup, which
 * deletes anything under the real repo `storage/uploads/operations` not
 * referenced by an operation in whatever Mongo it's pointed at — and unlike
 * the backups suite's `BACKUPS_STORAGE_ROOT`, there is no test-isolated
 * override for that path. Pointing `dev-collab` at the tiny E2E database
 * would make its very first run treat every real uploaded mission image as
 * orphaned and delete it. That needs its own fix (an env-overridable uploads
 * dir, mirroring `BACKUPS_STORAGE_ROOT`) before `webServer` can safely run
 * `dev-collab`, and making that call isn't this task's to make silently.
 */
import { ObjectId } from 'mongodb'
import { test, expect } from './fixtures/asot'
import { withDb } from './seed'

/** Minimal, valid `Operation` doc — see `types/operation.d.ts`. `status:
 *  'Upcoming'` keeps it out of the `In Development` view-gate in
 *  `app/api/operations/route.ts` (`GET ?id=`), which is irrelevant to what
 *  these specs cover and would otherwise need its own HQ-only handling. */
async function createOperation(overrides: Record<string, unknown> = {}): Promise<string> {
    const id = new ObjectId()
    await withDb(db =>
        db.collection('operations').insertOne({
            _id: id,
            title: 'E2E Editor Op',
            department: '1-0 HQ',
            date: new Date('2026-12-01T00:00:00.000Z'),
            loreDate: '',
            status: 'Upcoming',
            ...overrides,
        } as never),
    )
    return id.toHexString()
}

/** Fresh operations collection before each test — these specs don't share
 *  fixture ops with each other or with other spec files, and each test
 *  seeds its own via `createOperation()` anyway; this just keeps a re-run
 *  from accumulating stale ones. */
test.beforeEach(async () => {
    await withDb(db => db.collection('operations').deleteMany({}))
})

function editorTab(page: import('@playwright/test').Page, name: string) {
    return page.getByRole('navigation', { name: 'Operation editor sections' })
        .getByRole('button', { name, exact: true })
}

// ── Tab switching preserves the collaborative editor ───────────────────────
//
// See the module doc above for why this requires a live collab connection
// to pass as written — it is written against the intended behaviour, not
// against today's `webServer` command.

test.describe('Tab switching preserves the collaborative editor', () => {
    test('typed content and the connection indicator survive a Brief → Map → Brief round trip', async ({ pageAs }) => {
        const opId = await createOperation()
        const page = await pageAs('j4')
        await page.goto(`/operations/${opId}/edit`)

        // CollabEditor renders no `.ProseMirror` region until its first
        // section is seeded on the Hocuspocus 'synced' event (see module
        // doc) — a generous timeout here, not a race.
        const editor = page.locator('.ProseMirror[contenteditable="true"]')
        await expect(editor).toBeVisible({ timeout: 30_000 })

        const marker = `e2e-marker-${Date.now()}`
        await editor.click()
        await page.keyboard.type(marker)
        await expect(editor).toContainText(marker)

        // Baseline, not an assertion that it reads "Live" — the property
        // under test is that switching tabs alone doesn't change it, not
        // that this environment's WebSocket happens to be reachable. See
        // StatusBar.tsx's `data-testid` comment.
        const connection = page.getByTestId('status-connection')
        const connectionBefore = await connection.textContent()

        await editorTab(page, 'MAP').click()
        await expect(editorTab(page, 'MAP')).toHaveAttribute('aria-current', 'page')

        await editorTab(page, 'BRIEF').click()
        await expect(editorTab(page, 'BRIEF')).toHaveAttribute('aria-current', 'page')

        // The regression this spec exists to catch: if EditorShell ever
        // stops keeping Brief mounted (display:none) and instead unmounts
        // it per tab, CollabEditor's `useState(() => new Y.Doc())` rebuilds
        // from scratch on remount and this text is gone.
        await expect(editor).toContainText(marker)
        await expect(connection).toHaveText(connectionBefore ?? '')
    })
})

// ── Deck collapse persists across a reload ──────────────────────────────────

test.describe('Mission deck collapse state', () => {
    test('collapsing the deck persists across a reload', async ({ pageAs }) => {
        const opId = await createOperation()
        const page = await pageAs('j4')
        // >=1280px so MissionDeck treats collapse as the persisted push-layout
        // preference rather than the narrow band's never-persisted overlay
        // (deck/MissionDeck.tsx — `useIsWide`/`WIDE_QUERY`).
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`/operations/${opId}/edit`)

        const collapseBtn = page.getByRole('button', { name: 'Collapse mission deck' })
        await expect(collapseBtn).toBeVisible({ timeout: 30_000 })
        await collapseBtn.click()

        const expandBtn = page.getByRole('button', { name: 'Expand mission deck' })
        await expect(expandBtn).toBeVisible()
        await expect.poll(() =>
            page.evaluate(() => window.localStorage.getItem('asot.opsdeck.collapsed')),
        ).toBe('1')

        await page.reload()

        await expect(page.getByRole('button', { name: 'Expand mission deck' })).toBeVisible({ timeout: 30_000 })
        // The rail state, not just the storage key — proves the reload
        // actually reads it back, not just that the write landed.
        await expect(page.getByRole('button', { name: 'Collapse mission deck' })).toHaveCount(0)
    })
})

// ── Editing the operation date in the timeline persists ────────────────────

test.describe('Timeline op-date edit', () => {
    test('changing the operation date via the Schedule tab\'s RSVP window panel persists across a reload', async ({ pageAs }) => {
        const opId = await createOperation()
        const page = await pageAs('j4')
        await page.setViewportSize({ width: 1440, height: 900 })
        // The op-date picker lives in the Schedule tab's AnchorBar, inside the
        // tab — not the default tab (Brief) — so the deep link is needed to
        // land there directly instead of clicking the tab button first.
        await page.goto(`/operations/${opId}/edit?tab=schedule`)

        const dateInput = page.getByTestId('schedule-op-date-input')
        await expect(dateInput).toBeVisible({ timeout: 30_000 })

        // scheduleSave (page.tsx) debounces ~1s before the write even starts —
        // wait for StatusBar's savedAt cell to move rather than racing it
        // (spec instruction). This cell is fed only by that debounced save,
        // not by CollabEditor's WS-driven saveStatus, so it isn't muddied by
        // the collab socket's own connect/reconnect cycle (see StatusBar.tsx
        // comment).
        const savedCell = page.getByTestId('status-saved-at')
        const savedBefore = await savedCell.textContent()

        // MUI's date-field sections accept keyboard entry directly: Home
        // moves focus to the first (day) section, then typing digits fills
        // each section and auto-advances once it's full — dd, mm, yyyy, HH,
        // mm for the "DD/MM/YYYY HH:mm" format this picker uses.
        await dateInput.click()
        await page.keyboard.press('Home')
        await page.keyboard.type('160120271030', { delay: 40 })

        await expect(savedCell).not.toHaveText(savedBefore ?? '', { timeout: 10_000 })

        await page.reload()

        await expect(page.getByTestId('schedule-op-date-input')).toHaveValue('16/01/2027 10:30', { timeout: 30_000 })
    })
})

// ── A non-HQ user has no Attendance tab ─────────────────────────────────────

test.describe('Attendance tab visibility', () => {
    test('a non-HQ user is redirected before any Attendance tab can exist', async ({ pageAs }) => {
        const opId = await createOperation()
        const page = await pageAs('j3')
        await page.goto(`/operations/${opId}/edit`)

        // See module doc: the layout gate and the client isHQ flag share one
        // permission key, so a non-HQ session never reaches the tab bar —
        // the settled URL is the observable proof, per this suite's own
        // "a gated page returns 200 before it redirects" note (README.md).
        await expect(page).toHaveURL(/\/operations\/?$/)

        // Absent from the DOM outright, not merely unrendered because the
        // whole page redirected away — this holds regardless of which page
        // the user lands on.
        await expect(page.getByRole('button', { name: 'ATTENDANCE', exact: true })).toHaveCount(0)
    })

    test('positive control: an HQ user does see the Attendance tab', async ({ pageAs }) => {
        // Proves the redirect above is the gate actually doing the work,
        // not a slow load that never settles anywhere — same reasoning
        // dashboard.permissions.spec.ts gives for its own positive controls.
        const opId = await createOperation()
        const page = await pageAs('j4')
        await page.goto(`/operations/${opId}/edit`)

        await expect(editorTab(page, 'ATTENDANCE')).toBeVisible({ timeout: 30_000 })
    })
})

// ── Legacy tab deep links still resolve ─────────────────────────────────────

test.describe('Schedule tab deep links', () => {
    test('a legacy ?tab=development link lands on Schedule, not Brief', async ({ pageAs }) => {
        // The tab was renamed development → schedule. An unrecognised ?tab=
        // value falls back to 'brief' (EditorShell.tsx tabFromLocation), so
        // without the alias every saved link would silently open the wrong
        // tab — a failure with no error message. This is that alias.
        const opId = await createOperation()
        const page = await pageAs('j4')
        await page.goto(`/operations/${opId}/edit?tab=development`)

        await expect(editorTab(page, 'SCHEDULE')).toHaveAttribute('aria-current', 'page', { timeout: 30_000 })
    })

    test('positive control: ?tab=schedule selects the same tab', async ({ pageAs }) => {
        const opId = await createOperation()
        const page = await pageAs('j4')
        await page.goto(`/operations/${opId}/edit?tab=schedule`)

        await expect(editorTab(page, 'SCHEDULE')).toHaveAttribute('aria-current', 'page', { timeout: 30_000 })
    })
})
