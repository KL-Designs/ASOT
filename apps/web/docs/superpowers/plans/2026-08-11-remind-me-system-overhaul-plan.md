# Remind-Me System Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the timezone-aware bot redesign, the eight bug fixes, and the new `Unit → Reminders` web dashboard tab (with a J4-Administration "Channel Access" debug panel), per `docs/superpowers/specs/2026-08-11-remind-me-system-overhaul-design.md`.

**Architecture:** Three phases, each independently shippable. Phase 1 lands the shared data model (`User.timezone`, the `Reminder` type moving to shared `types/`, schema field renames) plus a migration script and the bot bug fixes — the bot keeps working on its *current* interaction flow throughout Phase 1. Phase 2 replaces the bot's create/edit flow with timezone-aware presets. Phase 3 adds the web CRUD UI and admin Channel Access panel on top of the same `reminders` collection — no new scheduler, the existing `processReminders` cron (fixed in Phase 1) is the only consumer.

**Tech Stack:** `apps/bot` — discord.js v14, MongoDB driver, TypeScript (`tsx`, no build step). `apps/web` — Next.js 15 App Router, MUI, MongoDB driver. New dependency: `date-fns-tz` in both apps. No automated test suite exists in this repo — verify with `npm run typecheck` (bot) / `npx tsc --noEmit -p tsconfig.json` (web, run from `apps/web`) after every task, plus the manual check described in that task's Step.

## Global Constraints

- Never introduce a build step or test framework — this repo has none (`apps/web/CLAUDE.md`: "No test suite exists"); verification is typecheck + manual interaction checks.
- Bot customId convention (unchanged, `apps/bot/app/handleInteractions.ts`): `<namespace>.<arg1>.<arg2>...`, dispatched by interaction type first (Button/Modal/StringSelectMenu/MentionableSelectMenu each have their own flat `{ [namespace]: handler }` map), then routed by namespace. All new reminder-setup components stay under the `reminder_setup` namespace, added independently to each of the four maps as needed (`apps/bot/app/interactions/{buttons,modals,stringSelectMenus,mentionableSelectMenus}/index.ts`).
- Discord message components: max 5 action rows, each row is either up to 5 buttons or exactly 1 select menu. The redesigned `/reminder create` reply uses exactly 5 rows (time presets, who, repeat, chase-up, ping-me+confirm) — do not add a 6th row.
- Discord slash-command **autocomplete** (used by `/reminder timezone`) only exists on chat-input command options — it cannot be embedded in a button/select-menu interaction. Where the spec says the timezone picker appears "inline" when unset, the actual mechanism is: the ephemeral reply tells the user to run `/reminder timezone` (which has full autocomplete search over `Intl.supportedValuesOf('timeZone')`) and try again — not a live picker embedded in the reminder-creation components. This is a deliberate, documented adjustment from the spec's phrasing, not a silent deviation.
- `Reminder.repeat` (milliseconds) stays the only value `processReminders.ts` schedules off, in every task. `repeatLabel` is display-only and must never be parsed back into a duration.
- Web API routes follow the existing convention exactly (see `apps/web/app/api/admin/calendar/route.ts`): `client.fetchMe()` in a try/catch → 401, then a `client.hasRoles(me, PERMISSIONS.x.y)` or `hasPermission()` check → 403, then the DB operation, then `NextResponse.json(...)`.
- Every new/changed web route or page gets an entry in the relevant `apps/web/docs/map/*.md` part file and, if it introduces a new topic, the `Find it fast` table in `apps/web/docs/map/README.md` — in the same task that creates it, not deferred.

---

### Task 1: Shared data model — `User.timezone`, `Reminder` type migration, DB wiring

**Files:**
- Modify: `types/user.d.ts` (add `timezone` field to `interface User`)
- Modify: `types/README.md` (update the "bot-only" example list — `Reminder` is moving out of it)
- Create: `types/remindme.d.ts` (moved from `apps/bot/types/remindme.d.ts`, with schema changes)
- Delete: `apps/bot/types/remindme.d.ts`
- Modify: `apps/web/lib/mongo.ts` (add `reminders` collection)
- Modify: `apps/web/types/logs.d.ts` (add `'reminder'` to `ActionCategory`)
- Modify: `apps/bot/app/interactions/reminder_admin/shared.ts` (uses the renamed field)

**Interfaces:**
- Produces: `User.timezone: string | null` (IANA zone name), consumed by every later task that reads/writes a user's timezone. `Reminder` interface (global, in `types/remindme.d.ts`): `enabled: boolean` (was `boolean | null`), `repeatLabel: string | null` (was `repeatRaw`) — every later task reads/writes these exact field names. `Db.reminders: MongoCollection<Reminder>` on the web side, matching `apps/bot/lib/mongo.ts`'s existing `Db.reminders`.

- [ ] **Step 1: Add `timezone` to `User`**

Edit `types/user.d.ts`, inside `interface User` right after the `isChaplain?: boolean` line (`types/user.d.ts:76`):

```ts
        isChaplain?: boolean

        // IANA zone name (e.g. "Australia/Sydney"); null = not set yet.
        // Set via the /me profile page or the bot's /reminder timezone command.
        timezone?: string | null
```

- [ ] **Step 2: Move `Reminder` into shared `types/` with the schema changes**

Read `apps/bot/types/remindme.d.ts` first (current content is the starting point). Create `types/remindme.d.ts`:

```ts
import { ObjectId } from 'mongodb'

export { }

declare global {

    interface Reminder {
        _id: ObjectId

        enabled: boolean

        expected: Date
        acknowledged: string[] | true | null
        nextCheck: Date | null
        chaseUpOffset: number | null
        repeat: number

        by: string
        who: string[]

        message: string
        channel: string
        messageId: string | null
        repeatLabel: string | null
        sendFailed: boolean
    }

}
```

Delete `apps/bot/types/remindme.d.ts` — both apps' `tsconfig.json` already `include` the root `types/**/*.ts` (confirmed: `apps/bot/tsconfig.json:41`, and `apps/web`'s per `types/README.md`), so no tsconfig change is needed, and both Dockerfiles already `COPY types/ ./types/` per `types/README.md`.

- [ ] **Step 3: Update `types/README.md`'s bot-only example**

Edit the last paragraph (`types/README.md:17-20`) — remove `Reminder` from the bot-only list since it's now genuinely shared:

```markdown
Only types that are genuinely shared MongoDB document shapes belong here — `User` (the
`users` collection, referenced by both apps under that exact name — the bot used to have
its own narrower duplicate called `GuildMember`, since merged into this `User`),
`Role`/`Optional` (also shared collections), and `Reminder` (the `reminders` collection —
moved here once the web dashboard's Reminders tab started reading/writing it directly).
Everything else stays app-local: `apps/web/types/` for the ~35 web-only concepts
(operations, attendance, training, etc.), `apps/bot/types/` for bot-only ones
(`StatusData`/`SyncStateData`, the bot's runtime `Config`/`Modlist`).
```

- [ ] **Step 4: Wire `Db.reminders` into the web app**

Edit `apps/web/lib/mongo.ts`, add a line right after `calendarReminders` (`apps/web/lib/mongo.ts:46`):

```ts
    calendarReminders: db.collection('calendar_reminders') as MongoCollection<CalendarReminder>,
    reminders: db.collection('reminders') as MongoCollection<Reminder>,
```

- [ ] **Step 5: Add the `reminder` action-log category**

Edit `apps/web/types/logs.d.ts`, add to the `ActionCategory` union (`apps/web/types/logs.d.ts:7-21`):

```ts
    type ActionCategory =
        | 'orbat'
        | 'calendar'
        | 'member'
        | 'operation'
        | 'system'
        | 'discord'
        | 'meeting'
        | 'ticket'
        | 'task'
        | 'training'
        | 'award'
        | 'teamspeak'
        | 'J3'
        | 'board'
        | 'reminder'
```

- [ ] **Step 6: Fix the renamed field in the bot's admin embed builder**

Edit `apps/bot/app/interactions/reminder_admin/shared.ts:8-11` — `reminder.repeatRaw` no longer exists:

```ts
    let repeatText = 'One-time'
    if (reminder.repeat > 0) {
        repeatText = reminder.repeatLabel ?? `every ${reminder.repeat}ms`
    }
```

- [ ] **Step 7: Verify both apps typecheck**

Run: `npm run typecheck` from `apps/bot`, and `npx tsc --noEmit -p tsconfig.json` from `apps/web`.
Expected: both fail right now — every file across both apps that references `reminder.repeatRaw` or treats `Reminder.enabled` as possibly-`null` in a way TypeScript flags will show as an error. That's expected; this task only lands the type, not every consumer fix (those come in Task 2's migration and Task 3's bug-fix pass, and the redesign tasks). List the errors so you know what Task 3 must touch, but don't fix consumers here.

- [ ] **Step 8: Commit**

```bash
git add types/user.d.ts types/remindme.d.ts types/README.md apps/bot/types/remindme.d.ts apps/web/lib/mongo.ts apps/web/types/logs.d.ts apps/bot/app/interactions/reminder_admin/shared.ts
git commit -m "Move Reminder type to shared types/, add User.timezone, rename repeatRaw to repeatLabel"
```

---

### Task 2: Migration script

**Files:**
- Create: `scripts/migrate-reminders-schema.mjs` (repo root, sibling to `scripts/migrate-batch2-permissions.mjs`)

**Interfaces:**
- Consumes: `Reminder` shape from Task 1 (reads raw Mongo documents, pre-migration they may still have `enabled: null` and `repeatRaw`).
- Produces: nothing consumed by later tasks — later tasks' code assumes the migrated shape (`enabled: boolean`, `repeatLabel`), but works correctly against both migrated and not-yet-migrated data since Mongo has no schema enforcement; this script just needs to run once before Phase 2/3 code goes live in production.

- [ ] **Step 1: Write the migration script**

Follow the dry-run-by-default, `--apply`-to-write shape used by every prior migration script in this repo (`scripts/migrate-batch2-permissions.mjs` is the closest reference — same `MONGO_URI`/`MONGO_DB` env var connection boilerplate).

```js
#!/usr/bin/env node
// One-off migration: enabled: null -> true, repeatRaw -> repeatLabel (best-effort
// conversion of the old "1h/2d" syntax into a display label).
//
// Dry-run by default. Pass --apply to write changes.

import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const MONGO_URI = process.env.MONGO_URI
const MONGO_DB = process.env.MONGO_DB

if (!MONGO_URI || !MONGO_DB) {
    console.error('MONGO_URI and MONGO_DB env vars are required.')
    process.exit(1)
}

const UNIT_LABELS = { m: 'minutes', h: 'hours', d: 'days', w: 'weeks' }

function repeatRawToLabel(raw) {
    if (!raw) return null
    const parts = raw.split('/').map(part => {
        const value = Number(part.slice(0, -1))
        const unit = part.slice(-1)
        if (isNaN(value) || !UNIT_LABELS[unit]) return null
        return `${value} ${UNIT_LABELS[unit]}`
    })
    if (parts.some(p => p === null)) return 'Custom'
    return `Every ${parts.reverse().join(', ')}`
}

async function main() {
    const client = new MongoClient(MONGO_URI)
    await client.connect()
    const db = client.db(MONGO_DB)
    const reminders = db.collection('reminders')

    console.log(APPLY ? 'APPLY MODE — writing changes' : 'DRY RUN — no changes will be written (pass --apply to write)')
    console.log('')

    const nullEnabled = await reminders.find({ enabled: null }).toArray()
    console.log(`Found ${nullEnabled.length} reminder(s) with enabled: null (will become enabled: true — this changes live scheduling, since processReminders.ts currently treats null the same as false):`)
    for (const r of nullEnabled) {
        console.log(`  - ${r._id} "${r.message}" (by ${r.by}, expected ${r.expected?.toISOString?.() ?? r.expected})`)
    }
    console.log('')

    const withRepeatRaw = await reminders.find({ repeatRaw: { $exists: true } }).toArray()
    console.log(`Found ${withRepeatRaw.length} reminder(s) with repeatRaw to convert to repeatLabel:`)
    for (const r of withRepeatRaw) {
        console.log(`  - ${r._id}: "${r.repeatRaw}" -> "${repeatRawToLabel(r.repeatRaw)}"`)
    }
    console.log('')

    if (!APPLY) {
        console.log('Dry run complete. Review the enabled:null list above with the reminder owners before applying — re-run with --apply to write these changes.')
        await client.close()
        return
    }

    if (nullEnabled.length > 0) {
        await reminders.updateMany({ enabled: null }, { $set: { enabled: true } })
    }
    for (const r of withRepeatRaw) {
        await reminders.updateOne(
            { _id: r._id },
            { $set: { repeatLabel: repeatRawToLabel(r.repeatRaw) }, $unset: { repeatRaw: '' } }
        )
    }
    console.log(`Applied: ${nullEnabled.length} enabled fix(es), ${withRepeatRaw.length} repeatLabel conversion(s).`)
    await client.close()
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
```

- [ ] **Step 2: Run the dry-run to verify output**

Run: `node scripts/migrate-reminders-schema.mjs` (from repo root, with `MONGO_URI`/`MONGO_DB` set from `.env`).
Expected: prints the `enabled: null` list and the `repeatRaw` conversion list (both may be empty on a fresh dev DB), then "Dry run complete." Do **not** pass `--apply` — leave that decision to the human operator, same as every prior migration script.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-reminders-schema.mjs
git commit -m "Add reminders schema migration script (enabled:null -> true, repeatRaw -> repeatLabel)"
```

---

### Task 3: Bot bug fixes

**Files:**
- Modify: `apps/bot/app/processReminders.ts`
- Modify: `apps/bot/app/ready.ts`
- Modify: `apps/bot/lib/reminderSessions.ts`
- Modify: `apps/bot/app/commands/reminder/remove.ts`
- Modify: `apps/bot/app/interactions/buttons/reminder/index.ts`
- Create: `apps/bot/lib/reminderComponents.ts`
- Modify: `apps/bot/app/interactions/buttons/reminder_setup/index.ts` (import from the new shared module instead of its local copy)
- Modify: `apps/bot/app/interactions/modals/reminder_setup/index.ts` (same)

**Interfaces:**
- Produces: `buildButtonRow(sessionId: string, session: ReminderSession): Discord.ActionRowBuilder<Discord.ButtonBuilder>` in `apps/bot/lib/reminderComponents.ts`, replacing the two local copies. Task 7/8 will replace this function's *contents* (new component layout) but must keep it in this one file.

- [ ] **Step 1: Fix missing `await`s and the unguarded `author` dereference in `processReminders.ts`**

Read the current file (`apps/bot/app/processReminders.ts`) — it's reproduced in full here with the fixes applied, replace the whole file:

```ts
import App from 'app'
import Db from 'lib/mongo.ts'
import * as Discord from "discord.js"



export default async function processReminders() {
    const reminders = await Db.reminders.find().toArray()
    const today = new Date()

    for (const reminder of reminders) {
        const channel = await App.channel(reminder.channel) as Discord.TextChannel
        if (!reminder.enabled && reminder.expected.getTime() < today.getTime()) {
            await Db.reminders.updateOne({ _id: reminder._id }, { $set: { expected: new Date(reminder.expected.getTime() + reminder.repeat) } })
            continue
        }

        const author = App.user(reminder.by)
        const authorName = author ? (author.nickname || author.user.globalName || author.user.username) : 'Unknown'
        const authorAvatar = author?.user.displayAvatarURL()


        if (Array.isArray(reminder.acknowledged) && reminder.acknowledged.length > 0 && reminder.nextCheck && reminder.nextCheck.getTime() < today.getTime()) {
            await Db.reminders.updateOne({ _id: reminder._id }, { $set: { nextCheck: null } })

            const channelPings: string[] = []
            for (const mention of reminder.acknowledged) {
                if (mention.startsWith('<@&')) {
                    channelPings.push(mention)
                } else {
                    const member = App.user(mention.slice(2, -1))
                    if (member) {
                        const jumpLink = reminder.messageId
                            ? `\nhttps://discord.com/channels/${App.guild().id}/${channel.id}/${reminder.messageId}`
                            : ''
                        try {
                            await member.send(`You have an unacknowledged reminder: **${reminder.message}**${jumpLink}`)
                        } catch {
                            channelPings.push(mention)
                        }
                    } else {
                        channelPings.push(mention)
                    }
                }
            }

            if (channelPings.length > 0) {
                try {
                    await channel.send(`${channelPings.join(' ')} please acknowledge your reminder!`)
                } catch {
                    console.error(`Failed to send chase-up in "${reminder.channel}" (${reminder.message})`)
                }
            }
            continue
        }


        if (reminder.acknowledged === null && reminder.expected.getTime() < today.getTime()) {
            const ackRow = new Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>()
                .addComponents(
                    new Discord.ButtonBuilder()
                        .setCustomId(`reminder.${reminder._id.toString()}.ack`)
                        .setStyle(Discord.ButtonStyle.Success)
                        .setEmoji('👍')
                        .setLabel('Acknowledge')
                )

            const actionRows: Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>[] = [ackRow]

            if (reminder.repeat > 0) {
                actionRows.push(
                    new Discord.ActionRowBuilder<Discord.MessageActionRowComponentBuilder>()
                        .addComponents(
                            new Discord.ButtonBuilder()
                                .setCustomId(`reminder.${reminder._id.toString()}.disable`)
                                .setStyle(Discord.ButtonStyle.Danger)
                                .setEmoji('🔌')
                                .setLabel('Disable Reminder')
                        )
                )
            }

            try {
                const sent = await channel.send({
                    content: reminder.who.join(' '),
                    embeds: [
                        new Discord.EmbedBuilder()
                            .setTitle('Reminder')
                            .setAuthor({ name: 'created by ' + authorName, iconURL: authorAvatar })
                            .setDescription(reminder.message)
                            .setColor(App.colors.warning)
                            .setTimestamp()
                            .addFields({ name: '⏳ Pending', value: reminder.who.join('\n') })
                    ],
                    components: actionRows
                })

                await Db.reminders.updateOne({ _id: reminder._id }, {
                    $set: {
                        expected: new Date(reminder.expected.getTime() + reminder.repeat),
                        nextCheck: reminder.chaseUpOffset !== null ? new Date(reminder.expected.getTime() + reminder.chaseUpOffset) : null,
                        acknowledged: [...reminder.who],
                        messageId: sent.id,
                        sendFailed: false
                    }
                })

                console.log(`Reminder ${reminder._id} has been sent`)
            } catch {
                console.error(`Failed to send reminder in "${reminder.channel}" (${reminder.message})`)
                if (!reminder.sendFailed && author) {
                    try {
                        await author.send(`Failed to send your reminder **${reminder.message}** in <#${reminder.channel}>. The bot may not have access to that channel.`)
                    } catch {
                        console.error(`Failed to DM author ${reminder.by} about failed reminder (${reminder.message})`)
                    }
                }
                if (!reminder.sendFailed) {
                    await Db.reminders.updateOne({ _id: reminder._id }, { $set: { sendFailed: true } })
                }
            }
            continue
        }


        if (reminder.repeat === 0 && reminder.acknowledged === true) {
            await Db.reminders.deleteOne({ _id: reminder._id })
            console.log(`Reminder ${reminder._id} has been removed`)
            continue
        }
    }
}
```

Changes from the original: `await` added to the three previously-fire-and-forget calls (line-13-equivalent `updateOne`, the chase-up `channel.send`, the final `deleteOne`); `author` is resolved once with a fallback `authorName`/`authorAvatar` so a missing guild-member cache entry no longer throws (falls back to `'Unknown'`); the failed-send DM is now guarded by `author` being truthy (skips the DM but still marks `sendFailed` if the author can't be resolved either, instead of throwing).

- [ ] **Step 2: Add an overlap guard to the `processReminders` interval**

Read `apps/bot/app/ready.ts` first to find the exact `setInterval(processReminders, ...)` line. Replace it with:

```ts
let processRemindersRunning = false
setInterval(async () => {
    if (processRemindersRunning) return
    processRemindersRunning = true
    try {
        await processReminders()
    } finally {
        processRemindersRunning = false
    }
}, 1000 * 30)
```

(Keep whatever import of `processReminders` already exists at the top of the file — only the `setInterval` call changes.)

- [ ] **Step 3: Add a periodic sweep to `reminderSessions.ts`**

Edit `apps/bot/lib/reminderSessions.ts`, append after the existing `deleteSession` function (`apps/bot/lib/reminderSessions.ts:34-36`):

```ts
export function deleteSession(id: string): void {
    sessions.delete(id)
}

// Lazy cleanup (in getSession) only fires for sessions someone revisits. This
// sweep catches abandoned setup flows nobody ever clicks a button on again.
setInterval(() => {
    const now = Date.now()
    for (const [id, session] of sessions) {
        if (now > session.expiresAt) sessions.delete(id)
    }
}, 1000 * 60 * 5)
```

- [ ] **Step 4: Fix the `/reminder remove` autocomplete bug**

Read `apps/bot/app/commands/reminder/remove.ts` first. Find the line reading `interaction.options.getString('repeat')` inside the autocomplete `response` function for the `reminder` option, and change it to `interaction.options.getString('reminder')`.

- [ ] **Step 5: Fix missing `await`s in the reminder "disable" button handler**

Edit `apps/bot/app/interactions/buttons/reminder/index.ts:90-91` (the `if (args[1] === 'disable')` block's final two lines):

```ts
        await interaction.update({ embeds: [newEmbed], components: [] })
        await Db.reminders.updateOne({ _id: reminder._id }, { $set: { enabled: false } })
```

This requires the enclosing function to already be `async` — it is (`export default async function (...)` at the top of the file).

- [ ] **Step 6: De-duplicate `buildButtonRow`**

Create `apps/bot/lib/reminderComponents.ts` with the function currently duplicated in both `apps/bot/app/interactions/buttons/reminder_setup/index.ts:5-26` and `apps/bot/app/interactions/modals/reminder_setup/index.ts:5-26` (they're identical — copy either one verbatim):

```ts
import Discord from 'discord.js'
import { ReminderSession } from 'lib/reminderSessions.ts'


export function buildButtonRow(sessionId: string, session: ReminderSession) {
    const pingMeButton = new Discord.ButtonBuilder()
        .setCustomId(`reminder_setup.${sessionId}.pingme`)
        .setLabel(session.pingMe ? 'Ping Me: Yes' : 'Ping Me: No')
        .setEmoji(session.pingMe ? '✅' : '❌')
        .setStyle(session.pingMe ? Discord.ButtonStyle.Success : Discord.ButtonStyle.Secondary)

    const chaseUpButton = new Discord.ButtonBuilder()
        .setCustomId(`reminder_setup.${sessionId}.chaseup`)
        .setLabel(session.chaseUpTime ? 'Chase Up Set' : 'Set Chase Up')
        .setEmoji('⏰')
        .setStyle(session.chaseUpTime ? Discord.ButtonStyle.Primary : Discord.ButtonStyle.Secondary)

    const confirmButton = new Discord.ButtonBuilder()
        .setCustomId(`reminder_setup.${sessionId}.confirm`)
        .setLabel(session.editId ? 'Save Changes' : 'Create Reminder')
        .setEmoji(session.editId ? '💾' : '🔔')
        .setStyle(Discord.ButtonStyle.Primary)

    return new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
        .addComponents(pingMeButton, chaseUpButton, confirmButton)
}
```

In both `apps/bot/app/interactions/buttons/reminder_setup/index.ts` and `apps/bot/app/interactions/modals/reminder_setup/index.ts`: delete the local `function buildButtonRow(...) { ... }` block (lines 5-26 in each) and add `import { buildButtonRow } from 'lib/reminderComponents.ts'` near the top.

(Note: Task 7 replaces this function's body entirely with the redesigned component layout — this task just removes the duplication without changing behavior.)

- [ ] **Step 7: Verify the bot typechecks and the old flow still works**

Run: `npm run typecheck` from `apps/bot`.
Expected: no errors referencing files touched in this task (errors about `repeatRaw`/`enabled` in files this task didn't touch are expected — Task 1 flagged them, later tasks fix them).

Manual check: start the bot (`npm run dev` from `apps/bot`, against a dev Discord guild), run `/reminder create` end-to-end using the *current* (pre-redesign) flow, confirm a reminder still sends, confirm `/reminder remove`'s autocomplete now actually filters by typed text, confirm the bot doesn't crash if you deliberately revoke its Send Messages permission in the target channel and let a reminder fire.

- [ ] **Step 8: Commit**

```bash
git add apps/bot/app/processReminders.ts apps/bot/app/ready.ts apps/bot/lib/reminderSessions.ts apps/bot/app/commands/reminder/remove.ts apps/bot/app/interactions/buttons/reminder/index.ts apps/bot/lib/reminderComponents.ts apps/bot/app/interactions/buttons/reminder_setup/index.ts apps/bot/app/interactions/modals/reminder_setup/index.ts
git commit -m "Fix reminder bugs: missing awaits, unguarded author lookup, interval overlap, session leak, remove autocomplete, duplicated buildButtonRow"
```

---

### Task 4: `date-fns-tz` + `apps/bot/lib/reminderDate.ts`

**Files:**
- Modify: `apps/bot/package.json` (add `date-fns-tz`)
- Create: `apps/bot/lib/reminderDate.ts`

**Interfaces:**
- Produces: `fromZoned(dateStr: string, timeStr: string, timezone: string): number | null` (returns UTC epoch ms, or `null` if the date/time strings are malformed), `TIME_PRESETS: { id: string; label: string; compute: (timezone: string) => number }[]`, `REPEAT_PRESETS: { id: string; label: string; ms: number }[]`, `CHASEUP_PRESETS: { id: string; label: string; ms: number }[]`, `isRealDate(dateStr: string): boolean`. Consumed by Tasks 6, 7, 8, 9.

- [ ] **Step 1: Add the dependency**

Run: `npm install date-fns-tz` from `apps/bot`.
Expected: `apps/bot/package.json` gains a `"date-fns-tz"` entry under `dependencies`, and `apps/bot/package-lock.json` updates.

- [ ] **Step 2: Write `reminderDate.ts`**

```ts
import { fromZonedTime } from 'date-fns-tz'

/** DD/MM/YYYY -> {day,month,year} or null if malformed / not a real calendar date. */
function parseDateStr(dateStr: string): { day: number; month: number; year: number } | null {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return null
    const [day, month, year] = dateStr.split('/').map(Number)
    const check = new Date(year, month - 1, day)
    if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null
    return { day, month, year }
}

export function isRealDate(dateStr: string): boolean {
    return parseDateStr(dateStr) !== null
}

/**
 * Interpret a DD/MM/YYYY date and HH:MM time as wall-clock time in `timezone`,
 * returning the correct UTC epoch ms. Returns null if either string is malformed.
 * Replaces the old setDate()-before-setMonth() construction, which overflowed
 * into the wrong month whenever the target day exceeded the *current* month's length.
 */
export function fromZoned(dateStr: string, timeStr: string, timezone: string): number | null {
    const date = parseDateStr(dateStr)
    if (!date) return null
    if (!/^\d{2}:\d{2}$/.test(timeStr)) return null
    const [hours, minutes] = timeStr.split(':').map(Number)
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

    const iso = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
    return fromZonedTime(iso, timezone).getTime()
}

function nextWeekday(from: Date, targetDay: number): Date {
    const result = new Date(from)
    const diff = (targetDay + 7 - result.getDay()) % 7 || 7
    result.setDate(result.getDate() + diff)
    return result
}

export const TIME_PRESETS: { id: string; label: string; compute: (timezone: string) => number }[] = [
    { id: '1h', label: 'In 1 Hour', compute: () => Date.now() + 60 * 60_000 },
    { id: '3h', label: 'In 3 Hours', compute: () => Date.now() + 3 * 60 * 60_000 },
    {
        id: 'tomorrow9', label: 'Tomorrow 9am', compute: (timezone) => {
            const tomorrow = new Date(Date.now() + 24 * 60 * 60_000)
            const dateStr = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}/${tomorrow.getFullYear()}`
            return fromZoned(dateStr, '09:00', timezone)!
        }
    },
    {
        id: 'nextmon9', label: 'Next Monday 9am', compute: (timezone) => {
            const monday = nextWeekday(new Date(), 1)
            const dateStr = `${String(monday.getDate()).padStart(2, '0')}/${String(monday.getMonth() + 1).padStart(2, '0')}/${monday.getFullYear()}`
            return fromZoned(dateStr, '09:00', timezone)!
        }
    },
]

export const REPEAT_PRESETS: { id: string; label: string; ms: number }[] = [
    { id: 'none', label: 'None', ms: 0 },
    { id: '15m', label: 'Every 15 minutes', ms: 15 * 60_000 },
    { id: '30m', label: 'Every 30 minutes', ms: 30 * 60_000 },
    { id: 'hourly', label: 'Hourly', ms: 60 * 60_000 },
    { id: 'daily', label: 'Daily', ms: 24 * 60 * 60_000 },
    { id: 'weekly', label: 'Weekly', ms: 7 * 24 * 60 * 60_000 },
    { id: 'monthly', label: 'Every 30 days', ms: 30 * 24 * 60 * 60_000 },
]

export const CHASEUP_PRESETS: { id: string; label: string; ms: number }[] = [
    { id: 'none', label: 'None', ms: 0 },
    { id: '15m', label: '15 min after', ms: 15 * 60_000 },
    { id: '30m', label: '30 min after', ms: 30 * 60_000 },
    { id: '1h', label: '1 hour after', ms: 60 * 60_000 },
]
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck` from `apps/bot`.
Expected: no errors in `apps/bot/lib/reminderDate.ts` (this file isn't imported anywhere yet, so it can't introduce new errors elsewhere).

- [ ] **Step 4: Commit**

```bash
git add apps/bot/package.json apps/bot/package-lock.json apps/bot/lib/reminderDate.ts
git commit -m "Add date-fns-tz and a timezone-aware date/preset helper for reminders"
```

---

### Task 5: `/reminder timezone` command

**Files:**
- Create: `apps/bot/lib/timezones.ts`
- Create: `apps/bot/app/commands/reminder/timezone.ts`
- Modify: `apps/bot/app/commands/reminder/index.ts`

**Interfaces:**
- Produces: `searchTimezones(query: string): { name: string; value: string }[]` in `apps/bot/lib/timezones.ts`, used by this task and Task 7/8 (for the "no timezone set" message text).
- Consumes: nothing new.

- [ ] **Step 1: Write the timezone search helper**

```ts
const ALL_TIMEZONES = Intl.supportedValuesOf('timeZone')

/** Filters IANA zone names by a case-insensitive substring match, capped to Discord's 25-option autocomplete limit. */
export function searchTimezones(query: string): { name: string; value: string }[] {
    const q = query.trim().toLowerCase()
    const matches = q ? ALL_TIMEZONES.filter(tz => tz.toLowerCase().includes(q)) : ALL_TIMEZONES
    return matches.slice(0, 25).map(tz => ({ name: tz.replace(/_/g, ' '), value: tz }))
}
```

- [ ] **Step 2: Write the `/reminder timezone` subcommand**

Follow the exact `AutocompleteOption`/`ChatSubcommand` shape used by `apps/bot/app/commands/reminder/create.ts`'s `date`/`time` options:

```ts
import Db from 'lib/mongo.ts'
import { ApplicationCommandOptionType } from 'discord.js'
import { searchTimezones } from 'lib/timezones.ts'


export default {
    name: 'timezone',
    description: 'Set your timezone, used to interpret every reminder time you enter',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'zone',
            description: 'Search for your city or region, e.g. "sydney" or "new york"',
            type: ApplicationCommandOptionType.String,
            required: true,
            autocomplete: true,

            response(interaction) {
                const search = interaction.options.getString('zone') || ''
                const matches = searchTimezones(search)
                if (matches.length === 0) return interaction.respond([{ name: 'No matching timezone found', value: 'invalid' }])
                return interaction.respond(matches)
            }
        } as AutocompleteOption,
    ],

    async execute(interaction) {
        const zone = interaction.options.getString('zone', true)
        if (zone === 'invalid' || !Intl.supportedValuesOf('timeZone').includes(zone)) {
            return interaction.reply({ content: 'Please select a timezone from the autocomplete list.', ephemeral: true })
        }

        await Db.users.updateOne({ id: interaction.user.id }, { $set: { timezone: zone } })

        return interaction.reply({ content: `✅ Your timezone is now set to **${zone.replace(/_/g, ' ')}**.`, ephemeral: true })
    }
} as ChatSubcommand
```

- [ ] **Step 3: Register the subcommand**

Edit `apps/bot/app/commands/reminder/index.ts` — add the import and the entry in `options`:

```ts
import help from './help.ts'
import create from './create.ts'
import edit from './edit.ts'
import remove from "./remove.ts"
import enable from "./enable.ts"
import disable from "./disable.ts"
import admin from "./admin.ts"
import timezone from "./timezone.ts"


export default {
    name: 'reminder',
    description: 'Reminder Commands',
    type: ApplicationCommandType.ChatInput,

    options: [
        help,
        create,
        edit,
        remove,
        enable,
        disable,
        admin,
        timezone,
    ]
} as ChatCommand
```

- [ ] **Step 4: Verify typecheck and manual check**

Run: `npm run typecheck` from `apps/bot`.
Expected: no new errors.

Manual check: restart the bot (Discord command registration picks up new subcommands on the app's existing registration path — check `apps/bot/app/ready.ts` or wherever `applicationCommands.set` is called if commands don't appear within a minute), run `/reminder timezone zone:syd`, confirm the autocomplete suggests `Australia/Sydney`, select it, confirm the reply and that `Db.users` now has `timezone: "Australia/Sydney"` on your user document.

- [ ] **Step 5: Commit**

```bash
git add apps/bot/lib/timezones.ts apps/bot/app/commands/reminder/timezone.ts apps/bot/app/commands/reminder/index.ts
git commit -m "Add /reminder timezone command"
```

---

### Task 6: `ReminderSession` redesign + `/reminder create` rewrite

**Files:**
- Modify: `apps/bot/lib/reminderSessions.ts`
- Modify: `apps/bot/app/commands/reminder/create.ts`

**Interfaces:**
- Produces: new `ReminderSession` shape (replacing `time`/`date`/`repeat`/`chaseUpTime`/`chaseUpDate` string fields):
```ts
export interface ReminderSession {
    editId: string | null
    message: string
    expected: number | null       // UTC epoch ms once a time is chosen; null until then
    repeatMs: number               // 0 = none
    repeatLabel: string | null     // display label; null = none
    chaseUpOffset: number | null   // ms after `expected`; null = no chase-up
    channel: string
    userId: string
    pingMe: boolean
    who: string[]
    expiresAt: number
}
```
Consumed by Tasks 7, 8, 9.

- [ ] **Step 1: Rewrite `reminderSessions.ts`'s interface**

Edit `apps/bot/lib/reminderSessions.ts` — replace only the `ReminderSession` interface (lines 1-14), keep `createSession`/`getSession`/`updateSession`/`deleteSession` and the Task-3 sweep unchanged:

```ts
export interface ReminderSession {
    editId: string | null
    message: string
    expected: number | null
    repeatMs: number
    repeatLabel: string | null
    chaseUpOffset: number | null
    channel: string
    userId: string
    pingMe: boolean
    who: string[]
    expiresAt: number
}
```

- [ ] **Step 2: Rewrite `/reminder create`**

Replace `apps/bot/app/commands/reminder/create.ts` entirely — the slash command now takes only `reminder` (the message); everything else moves to components built in Task 7/8:

```ts
import { ApplicationCommandOptionType } from 'discord.js'
import { createSession } from 'lib/reminderSessions.ts'
import { buildReminderComponents } from 'lib/reminderComponents.ts'


export default {
    name: 'create',
    description: 'Create a New Reminder',
    type: ApplicationCommandOptionType.Subcommand,

    options: [
        {
            name: 'reminder',
            description: 'Whats the reminder for?',
            type: ApplicationCommandOptionType.String,
            required: true
        },
    ],

    execute(interaction) {
        const sessionId = interaction.id
        const message = interaction.options.getString('reminder', true)

        createSession(sessionId, {
            editId: null,
            message,
            expected: null,
            repeatMs: 0,
            repeatLabel: null,
            chaseUpOffset: null,
            channel: interaction.channelId,
            userId: interaction.user.id,
            pingMe: true,
            who: [],
        })

        const session = { editId: null, message, expected: null, repeatMs: 0, repeatLabel: null, chaseUpOffset: null, channel: interaction.channelId, userId: interaction.user.id, pingMe: true, who: [], expiresAt: 0 }

        interaction.reply({
            content: `**Reminder:** ${message}\nPick a time, who to remind, and any repeat/chase-up, then confirm.`,
            components: buildReminderComponents(sessionId, session),
            ephemeral: true
        })
    }
} as ChatSubcommand
```

(`buildReminderComponents` is written in Task 7 — it replaces this task's placeholder-free reference to it, which is fine since Task 7 lands before this code ships; if executed out of order, this file simply won't typecheck until Task 7 lands, which is expected and matches how `reminderComponents.ts` already gets extended incrementally in this plan.)

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck` from `apps/bot`.
Expected: error in `create.ts` — `buildReminderComponents` doesn't exist yet (Task 7 adds it). This is expected; do not stub it out here.

- [ ] **Step 4: Commit**

```bash
git add apps/bot/lib/reminderSessions.ts apps/bot/app/commands/reminder/create.ts
git commit -m "Redesign ReminderSession shape and simplify /reminder create to message-only"
```

---

### Task 7: Redesigned `reminder_setup` components — time, who, repeat, chase-up, confirm

**Files:**
- Modify: `apps/bot/lib/reminderComponents.ts` (replace `buildButtonRow` with `buildReminderComponents`)
- Modify: `apps/bot/app/interactions/buttons/reminder_setup/index.ts` (time presets, ping-me, confirm)
- Create: `apps/bot/app/interactions/stringSelectMenus/reminder_setup/index.ts` (repeat, chase-up selects)
- Modify: `apps/bot/app/interactions/stringSelectMenus/index.ts` (register it)
- Modify: `apps/bot/app/interactions/modals/reminder_setup/index.ts` (custom time / repeat / chase-up modal submissions)
- Modify: `apps/bot/app/interactions/mentionableSelectMenus/reminder_setup/index.ts` (no logic change needed — verify it still matches the new session shape)

**Interfaces:**
- Consumes: `ReminderSession` (Task 6), `TIME_PRESETS`/`REPEAT_PRESETS`/`CHASEUP_PRESETS`/`fromZoned`/`isRealDate` (Task 4), `Db.users` (Task 1's `timezone` field).
- Produces: `buildReminderComponents(sessionId: string, session: ReminderSession): Discord.ActionRowBuilder<any>[]` — the 5-row layout described in Global Constraints. Consumed by Task 6 (create), Task 9 (edit).

- [ ] **Step 1: Replace `buildButtonRow` with `buildReminderComponents` in `reminderComponents.ts`**

Replace the entire contents of `apps/bot/lib/reminderComponents.ts`:

```ts
import Discord from 'discord.js'
import { ReminderSession } from 'lib/reminderSessions.ts'
import { TIME_PRESETS, REPEAT_PRESETS, CHASEUP_PRESETS } from 'lib/reminderDate.ts'


export function buildReminderComponents(sessionId: string, session: ReminderSession) {
    const timeRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
        ...TIME_PRESETS.map(preset =>
            new Discord.ButtonBuilder()
                .setCustomId(`reminder_setup.${sessionId}.time.${preset.id}`)
                .setLabel(preset.label)
                .setStyle(Discord.ButtonStyle.Secondary)
        ),
        new Discord.ButtonBuilder()
            .setCustomId(`reminder_setup.${sessionId}.timecustom`)
            .setLabel('Custom time…')
            .setStyle(Discord.ButtonStyle.Secondary)
    )

    const whoRow = new Discord.ActionRowBuilder<Discord.MentionableSelectMenuBuilder>().addComponents(
        new Discord.MentionableSelectMenuBuilder()
            .setCustomId(`reminder_setup.${sessionId}.select`)
            .setPlaceholder('Select who to remind... (leave empty for just yourself)')
            .setMinValues(0)
            .setMaxValues(20)
    )

    const repeatRow = new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
        new Discord.StringSelectMenuBuilder()
            .setCustomId(`reminder_setup.${sessionId}.repeat`)
            .setPlaceholder(session.repeatLabel ? `Repeat: ${session.repeatLabel}` : 'Repeat: None')
            .addOptions(
                ...REPEAT_PRESETS.map(p => new Discord.StringSelectMenuOptionBuilder().setLabel(p.label).setValue(p.id)),
                new Discord.StringSelectMenuOptionBuilder().setLabel('Custom…').setValue('custom')
            )
    )

    const chaseUpRow = new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
        new Discord.StringSelectMenuBuilder()
            .setCustomId(`reminder_setup.${sessionId}.chaseup`)
            .setPlaceholder(session.chaseUpOffset !== null ? 'Chase Up: Set' : 'Chase Up: None')
            .addOptions(
                ...CHASEUP_PRESETS.map(p => new Discord.StringSelectMenuOptionBuilder().setLabel(p.label).setValue(p.id)),
                new Discord.StringSelectMenuOptionBuilder().setLabel('Custom…').setValue('custom')
            )
    )

    const pingMeButton = new Discord.ButtonBuilder()
        .setCustomId(`reminder_setup.${sessionId}.pingme`)
        .setLabel(session.pingMe ? 'Ping Me: Yes' : 'Ping Me: No')
        .setEmoji(session.pingMe ? '✅' : '❌')
        .setStyle(session.pingMe ? Discord.ButtonStyle.Success : Discord.ButtonStyle.Secondary)

    const confirmButton = new Discord.ButtonBuilder()
        .setCustomId(`reminder_setup.${sessionId}.confirm`)
        .setLabel(session.editId ? 'Save Changes' : 'Create Reminder')
        .setEmoji(session.editId ? '💾' : '🔔')
        .setStyle(Discord.ButtonStyle.Primary)

    const actionRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(pingMeButton, confirmButton)

    return [timeRow, whoRow, repeatRow, chaseUpRow, actionRow]
}
```

- [ ] **Step 2: Rewrite the `reminder_setup` button handler**

Replace `apps/bot/app/interactions/buttons/reminder_setup/index.ts` entirely:

```ts
import Discord from 'discord.js'
import Db from 'lib/mongo.ts'
import { ObjectId } from 'mongodb'
import { getSession, updateSession, deleteSession, ReminderSession } from 'lib/reminderSessions.ts'
import { buildReminderComponents } from 'lib/reminderComponents.ts'
import { TIME_PRESETS } from 'lib/reminderDate.ts'


async function requireTimezone(interaction: Discord.ButtonInteraction): Promise<string | null> {
    const user = await Db.users.findOne({ id: interaction.user.id })
    if (user?.timezone) return user.timezone
    await interaction.reply({ content: 'You haven\'t set a timezone yet. Run `/reminder timezone` to set one, then click that button again.', ephemeral: true })
    return null
}

function refreshMessage(interaction: Discord.ButtonInteraction, sessionId: string, session: ReminderSession) {
    const components = buildReminderComponents(sessionId, session)
    return interaction.update({ components })
}


export default async function (interaction: Discord.ButtonInteraction, args: string[]) {
    const sessionId = args[0]
    const action = args[1]

    const session = getSession(sessionId)
    if (!session) return interaction.reply({ content: 'This reminder setup has expired. Please run the command again.', ephemeral: true })

    if (action === 'time') {
        const timezone = await requireTimezone(interaction)
        if (!timezone) return

        const presetId = args[2]
        const preset = TIME_PRESETS.find(p => p.id === presetId)
        if (!preset) return interaction.reply({ content: 'Unknown time preset.', ephemeral: true })

        const expected = preset.compute(timezone)
        updateSession(sessionId, { expected })
        return refreshMessage(interaction, sessionId, { ...session, expected })
    }

    if (action === 'timecustom') {
        const timezone = await requireTimezone(interaction)
        if (!timezone) return

        const modal = new Discord.ModalBuilder()
            .setCustomId(`reminder_setup.${sessionId}.timecustom`)
            .setTitle('Set Custom Time')
            .addComponents(
                new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
                    new Discord.TextInputBuilder()
                        .setCustomId('date')
                        .setLabel(`Date (DD/MM/YYYY), timezone: ${timezone}`)
                        .setStyle(Discord.TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('31/12/2026')
                ),
                new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
                    new Discord.TextInputBuilder()
                        .setCustomId('time')
                        .setLabel('Time (HH:MM, 24-hour)')
                        .setStyle(Discord.TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('14:30')
                )
            )
        return interaction.showModal(modal)
    }

    if (action === 'pingme') {
        const newPingMe = !session.pingMe
        updateSession(sessionId, { pingMe: newPingMe })
        return refreshMessage(interaction, sessionId, { ...session, pingMe: newPingMe })
    }

    if (action === 'confirm') {
        if (session.expected === null) {
            return interaction.reply({ content: 'Please pick a time first.', ephemeral: true })
        }

        const who: string[] = []
        if (session.pingMe) who.push(`<@${session.userId}>`)
        for (const mention of session.who) who.push(mention)

        if (who.length === 0) {
            return interaction.reply({ content: 'Please select at least one person to remind, or enable "Ping Me".', ephemeral: true })
        }

        if (session.editId) {
            await Db.reminders.updateOne({ _id: new ObjectId(session.editId) }, {
                $set: {
                    expected: new Date(session.expected),
                    repeat: session.repeatMs,
                    repeatLabel: session.repeatLabel,
                    who,
                    chaseUpOffset: session.chaseUpOffset,
                    acknowledged: null,
                    nextCheck: null,
                    messageId: null,
                }
            })
        } else {
            await Db.reminders.insertOne({
                _id: new ObjectId(),
                enabled: true,
                expected: new Date(session.expected),
                acknowledged: null,
                nextCheck: null,
                chaseUpOffset: session.chaseUpOffset,
                repeat: session.repeatMs,
                repeatLabel: session.repeatLabel,
                by: session.userId,
                who,
                message: session.message,
                channel: session.channel,
                messageId: null,
                sendFailed: false,
            })
        }

        deleteSession(sessionId)

        const verb = session.editId ? '✅ Reminder updated for' : '✅ Reminder set for'
        let confirmContent = `${verb} <t:${Math.floor(session.expected / 1000)}:F>`
        if (session.chaseUpOffset !== null) {
            const chaseUpTs = Math.floor((session.expected + session.chaseUpOffset) / 1000)
            confirmContent += `\n⏰ Chase up: <t:${chaseUpTs}:F>`
        }
        confirmContent += `\n>>> ${session.message}`

        return interaction.update({ content: confirmContent, components: [] })
    }
}
```

- [ ] **Step 3: Write the `reminder_setup` string-select handler (repeat + chase-up)**

Create `apps/bot/app/interactions/stringSelectMenus/reminder_setup/index.ts`:

```ts
import Discord from 'discord.js'
import { getSession, updateSession, ReminderSession } from 'lib/reminderSessions.ts'
import { buildReminderComponents } from 'lib/reminderComponents.ts'
import { REPEAT_PRESETS, CHASEUP_PRESETS } from 'lib/reminderDate.ts'


export default async function (interaction: Discord.StringSelectMenuInteraction, args: string[]) {
    const sessionId = args[0]
    const field = args[1] // 'repeat' | 'chaseup'

    const session = getSession(sessionId)
    if (!session) return interaction.reply({ content: 'This reminder setup has expired. Please run the command again.', ephemeral: true })

    const value = interaction.values[0]

    if (field === 'repeat') {
        if (value === 'custom') {
            const modal = new Discord.ModalBuilder()
                .setCustomId(`reminder_setup.${sessionId}.repeatcustom`)
                .setTitle('Custom Repeat Interval')
                .addComponents(
                    new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
                        new Discord.TextInputBuilder().setCustomId('amount').setLabel('Amount').setStyle(Discord.TextInputStyle.Short).setRequired(true).setPlaceholder('3')
                    ),
                    new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
                        new Discord.TextInputBuilder().setCustomId('unit').setLabel('Unit: m / h / d / w').setStyle(Discord.TextInputStyle.Short).setRequired(true).setPlaceholder('d')
                    )
                )
            return interaction.showModal(modal)
        }

        const preset = REPEAT_PRESETS.find(p => p.id === value)
        if (!preset) return interaction.reply({ content: 'Unknown repeat option.', ephemeral: true })

        const patch = { repeatMs: preset.ms, repeatLabel: preset.id === 'none' ? null : preset.label }
        updateSession(sessionId, patch)
        const updated: ReminderSession = { ...session, ...patch }
        return interaction.update({ components: buildReminderComponents(sessionId, updated) })
    }

    if (field === 'chaseup') {
        if (value === 'custom') {
            const modal = new Discord.ModalBuilder()
                .setCustomId(`reminder_setup.${sessionId}.chaseupcustom`)
                .setTitle('Custom Chase-Up Time')
                .addComponents(
                    new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
                        new Discord.TextInputBuilder().setCustomId('date').setLabel('Date (DD/MM/YYYY, blank = same day)').setStyle(Discord.TextInputStyle.Short).setRequired(false).setPlaceholder('DD/MM/YYYY')
                    ),
                    new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
                        new Discord.TextInputBuilder().setCustomId('time').setLabel('Time (HH:MM)').setStyle(Discord.TextInputStyle.Short).setRequired(true).setPlaceholder('07:00')
                    )
                )
            return interaction.showModal(modal)
        }

        const preset = CHASEUP_PRESETS.find(p => p.id === value)
        if (!preset) return interaction.reply({ content: 'Unknown chase-up option.', ephemeral: true })

        const patch = { chaseUpOffset: preset.id === 'none' ? null : preset.ms }
        updateSession(sessionId, patch)
        const updated: ReminderSession = { ...session, ...patch }
        return interaction.update({ components: buildReminderComponents(sessionId, updated) })
    }
}
```

- [ ] **Step 4: Register the new string-select handler**

Edit `apps/bot/app/interactions/stringSelectMenus/index.ts`:

```ts
import modlist from './modlist/index.ts'
import reminder_admin from './reminder_admin/index.ts'
import reminder_setup from './reminder_setup/index.ts'


const menus: { [key: string]: any } = {
    modlist,
    reminder_admin,
    reminder_setup,
}


export default menus
```

- [ ] **Step 5: Rewrite the `reminder_setup` modal handler (custom time / repeat / chase-up)**

Replace `apps/bot/app/interactions/modals/reminder_setup/index.ts` entirely:

```ts
import Discord from 'discord.js'
import Db from 'lib/mongo.ts'
import { getSession, updateSession, ReminderSession } from 'lib/reminderSessions.ts'
import { buildReminderComponents } from 'lib/reminderComponents.ts'
import { fromZoned, isRealDate } from 'lib/reminderDate.ts'


export default async function (interaction: Discord.ModalSubmitInteraction, args: string[]) {
    const sessionId = args[0]
    const action = args[1]

    const session = getSession(sessionId)
    if (!session) return interaction.reply({ content: 'This reminder setup has expired. Please run the command again.', ephemeral: true })

    if (action === 'timecustom') {
        const dateInput = interaction.fields.getTextInputValue('date').trim()
        const timeInput = interaction.fields.getTextInputValue('time').trim()

        if (!isRealDate(dateInput)) return interaction.reply({ content: 'Invalid date. Use DD/MM/YYYY and check it\'s a real date.', ephemeral: true })

        const user = await Db.users.findOne({ id: interaction.user.id })
        const timezone = user?.timezone
        if (!timezone) return interaction.reply({ content: 'You haven\'t set a timezone yet. Run `/reminder timezone` to set one, then try again.', ephemeral: true })

        const expected = fromZoned(dateInput, timeInput, timezone)
        if (expected === null) return interaction.reply({ content: 'Invalid time. Use HH:MM, 24-hour.', ephemeral: true })
        if (expected < Date.now()) return interaction.reply({ content: 'That time is in the past.', ephemeral: true })

        updateSession(sessionId, { expected })
        const updated: ReminderSession = { ...session, expected }
        return interaction.update({ components: buildReminderComponents(sessionId, updated) })
    }

    if (action === 'repeatcustom') {
        const amountInput = interaction.fields.getTextInputValue('amount').trim()
        const unitInput = interaction.fields.getTextInputValue('unit').trim().toLowerCase()

        const amount = Number(amountInput)
        const unitMs: Record<string, number> = { m: 60_000, h: 60 * 60_000, d: 24 * 60 * 60_000, w: 7 * 24 * 60 * 60_000 }
        const unitLabel: Record<string, string> = { m: 'minutes', h: 'hours', d: 'days', w: 'weeks' }

        if (isNaN(amount) || amount <= 0 || !(unitInput in unitMs)) {
            return interaction.reply({ content: 'Invalid repeat interval. Amount must be a positive number, unit must be m/h/d/w.', ephemeral: true })
        }

        const patch = { repeatMs: amount * unitMs[unitInput], repeatLabel: `Every ${amount} ${unitLabel[unitInput]}` }
        updateSession(sessionId, patch)
        const updated: ReminderSession = { ...session, ...patch }
        return interaction.update({ components: buildReminderComponents(sessionId, updated) })
    }

    if (action === 'chaseupcustom') {
        const dateInput = interaction.fields.getTextInputValue('date').trim()
        const timeInput = interaction.fields.getTextInputValue('time').trim()

        if (dateInput && !isRealDate(dateInput)) return interaction.reply({ content: 'Invalid date. Use DD/MM/YYYY.', ephemeral: true })
        if (session.expected === null) return interaction.reply({ content: 'Pick a reminder time before setting a chase-up.', ephemeral: true })

        const user = await Db.users.findOne({ id: interaction.user.id })
        const timezone = user?.timezone
        if (!timezone) return interaction.reply({ content: 'You haven\'t set a timezone yet. Run `/reminder timezone` to set one, then try again.', ephemeral: true })

        const reminderDate = new Date(session.expected)
        const fallbackDateStr = `${String(reminderDate.getDate()).padStart(2, '0')}/${String(reminderDate.getMonth() + 1).padStart(2, '0')}/${reminderDate.getFullYear()}`
        const chaseUpDateStr = dateInput || fallbackDateStr

        const chaseUpTime = fromZoned(chaseUpDateStr, timeInput, timezone)
        if (chaseUpTime === null) return interaction.reply({ content: 'Invalid time. Use HH:MM.', ephemeral: true })
        if (chaseUpTime <= session.expected) return interaction.reply({ content: 'Chase up time must be after the reminder time.', ephemeral: true })

        const patch = { chaseUpOffset: chaseUpTime - session.expected }
        updateSession(sessionId, patch)
        const updated: ReminderSession = { ...session, ...patch }
        return interaction.update({ components: buildReminderComponents(sessionId, updated) })
    }
}
```

- [ ] **Step 6: Verify `mentionableSelectMenus/reminder_setup/index.ts` still matches**

Read `apps/bot/app/interactions/mentionableSelectMenus/reminder_setup/index.ts` — it only calls `updateSession(sessionId, { who })` and `interaction.deferUpdate()`, neither of which reference any removed session field. No change needed; confirm this by reading it, don't skip the check.

- [ ] **Step 7: Verify typecheck and full manual flow**

Run: `npm run typecheck` from `apps/bot`.
Expected: no errors (this task resolves the `buildReminderComponents` reference Task 6 left dangling).

Manual check, with a user who has `/reminder timezone` set already: run `/reminder create reminder:"Test reminder"`, click "In 1 Hour", confirm the row updates; open the who select and pick yourself; open the Repeat select, pick "Daily"; open the Chase Up select, pick "Custom…", fill in a valid future time, confirm it saves; click Confirm; confirm the reminder fires at the right UTC instant relative to your local timezone (spot-check by comparing the Discord `<t:...:F>` render, which auto-converts to your Discord client's local time, against what you actually picked). Then repeat with a user who has **no** timezone set — confirm every entry point (time preset, custom time, custom chase-up) replies with the "run /reminder timezone" message instead of proceeding.

- [ ] **Step 8: Commit**

```bash
git add apps/bot/lib/reminderComponents.ts apps/bot/app/interactions/buttons/reminder_setup/index.ts apps/bot/app/interactions/stringSelectMenus/reminder_setup/index.ts apps/bot/app/interactions/stringSelectMenus/index.ts apps/bot/app/interactions/modals/reminder_setup/index.ts
git commit -m "Redesign reminder creation components: timezone-aware time presets, repeat/chase-up select menus"
```

---

### Task 8: `/reminder edit` prefill wiring

**Files:**
- Modify: `apps/bot/app/commands/reminder/edit.ts`

**Interfaces:**
- Consumes: `buildReminderComponents` (Task 7), `ReminderSession` (Task 6).

- [ ] **Step 1: Read the current `edit.ts` to see how it looks up the reminder and builds the old session**

The exact autocomplete/lookup logic (finding the user's own reminders to edit) doesn't need to change — only the part that builds the `ReminderSession` from the found `Reminder` document and the part that renders the initial reply need updating.

- [ ] **Step 2: Update the session construction and reply**

Wherever `edit.ts` currently does `createSession(sessionId, { editId: reminder._id.toString(), message: reminder.message, time: ..., date: ..., ... })`, replace that object with:

```ts
createSession(sessionId, {
    editId: reminder._id.toString(),
    message: reminder.message,
    expected: reminder.expected.getTime(),
    repeatMs: reminder.repeat,
    repeatLabel: reminder.repeatLabel,
    chaseUpOffset: reminder.chaseUpOffset,
    channel: reminder.channel,
    userId: interaction.user.id,
    pingMe: reminder.who.includes(`<@${interaction.user.id}>`),
    who: reminder.who.filter(w => w !== `<@${interaction.user.id}>`),
})
```

And wherever it builds the reply's `components`, replace the old button-row-only construction with:

```ts
const session = { editId: reminder._id.toString(), message: reminder.message, expected: reminder.expected.getTime(), repeatMs: reminder.repeat, repeatLabel: reminder.repeatLabel, chaseUpOffset: reminder.chaseUpOffset, channel: reminder.channel, userId: interaction.user.id, pingMe: reminder.who.includes(`<@${interaction.user.id}>`), who: reminder.who.filter(w => w !== `<@${interaction.user.id}>`), expiresAt: 0 }

interaction.reply({
    content: `**Editing Reminder:** ${reminder.message}`,
    components: buildReminderComponents(sessionId, session),
    ephemeral: true
})
```

Add `import { buildReminderComponents } from 'lib/reminderComponents.ts'` at the top if not already present.

- [ ] **Step 3: Verify typecheck and manual check**

Run: `npm run typecheck` from `apps/bot`.
Expected: no errors.

Manual check: create a reminder, then `/reminder edit` it, confirm every field (time, who, repeat, chase-up) shows its current value in the select-menu placeholders/button states, change one field, save, confirm the change persisted.

- [ ] **Step 4: Commit**

```bash
git add apps/bot/app/commands/reminder/edit.ts
git commit -m "Wire /reminder edit to the redesigned session shape and components"
```

---

### Task 9: Web timezone setting on `/me`

**Files:**
- Modify: `apps/web/package.json` (add `date-fns-tz`)
- Modify: `apps/web/app/api/me/route.ts`
- Create: `apps/web/app/me/TimezoneSelector.tsx`
- Modify: `apps/web/app/me/page.tsx`

**Interfaces:**
- Produces: `POST /api/me` now accepts a top-level `{ timezone: string }` body (in addition to its existing `{ [bioField]: value }` shape, which nests under `bio.`).

- [ ] **Step 1: Add the dependency**

Run: `npm install date-fns-tz` from `apps/web`.

- [ ] **Step 2: Special-case `timezone` in `POST /api/me`**

Edit `apps/web/app/api/me/route.ts:24-38` — the current loop nests every body key under `bio.`; `timezone` must be a top-level field instead:

```ts
export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()

    if ('timezone' in body) {
        if (typeof body.timezone !== 'string' || !Intl.supportedValuesOf('timeZone').includes(body.timezone)) {
            return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
        }
        await Db.users.updateOne({ _id: me._id }, { $set: { timezone: body.timezone } }, { upsert: true })
        return NextResponse.json({ success: true }, { status: 200 })
    }

    const update: Record<string, any> = {}
    for (const [key, value] of Object.entries(body)) {
        update[`bio.${key}`] = value
    }

    await Db.users.updateOne({ _id: me._id }, { $set: update }, { upsert: true })

    return NextResponse.json({ success: true }, { status: 200 })
}
```

- [ ] **Step 3: Write the `TimezoneSelector` component**

**Amended after Task 7's review surfaced a UX improvement, approved before this task was dispatched:** in addition to the manual dropdown, auto-detect the browser's timezone via the standard `Intl.DateTimeFormat().resolvedOptions().timeZone` API (a JS built-in, no new dependency) and save it automatically the first time a user with no `timezone` set visits `/me` — matching how Discord scheduling bots like Sesh acquire timezone via a browser-side detection step, except we can do it silently since `/me` is already an authenticated page tied to the user's Discord account. The manual dropdown remains fully functional as an override.

Follow `apps/web/app/me/TSLinkButton.tsx`'s self-contained-fetch-on-mount pattern (own `fetch('/api/me')` for current value, own save call):

```tsx
'use client'

import { useEffect, useState } from 'react'
import { TextField, MenuItem, Typography } from '@mui/material'

const ALL_TIMEZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []

const cardStyle = {
    border: '1px solid rgba(219,0,29,0.15)',
    borderTop: '2px solid var(--red)',
    background: 'rgba(255,255,255,0.02)',
}

const headerStyle = {
    borderBottom: '1px solid rgba(255,255,255,0.05)',
}

export default function TimezoneSelector({ initialTimezone }: { initialTimezone: string | null }) {
    const [timezone, setTimezone] = useState(initialTimezone ?? '')
    const [saving, setSaving] = useState(false)
    const [autoDetected, setAutoDetected] = useState(false)

    async function saveTimezone(value: string) {
        setTimezone(value)
        setSaving(true)
        await fetch('/api/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone: value }),
        })
        setSaving(false)
    }

    // Auto-detect once on mount if the user has no timezone saved yet. Runs only
    // when initialTimezone was null/empty at page load — deliberately excluded
    // from the dependency array so it never re-fires after the user picks one.
    useEffect(() => {
        if (initialTimezone) return
        const detected = typeof Intl.DateTimeFormat === 'function'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : null
        if (detected && ALL_TIMEZONES.includes(detected)) {
            setAutoDetected(true)
            saveTimezone(detected)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function handleChange(value: string) {
        setAutoDetected(false)
        saveTimezone(value)
    }

    return (
        <div style={cardStyle}>
            <div className='flex items-center px-4 py-3' style={headerStyle}>
                <Typography fontWeight={600} fontSize='0.8rem' letterSpacing={2} style={{ textTransform: 'uppercase', flex: 1 }}>
                    Timezone
                </Typography>
            </div>
            <div className='p-5'>
                <Typography fontSize='0.75rem' style={{ color: 'rgba(237,237,237,0.5)', marginBottom: 10 }}>
                    Used to interpret times you enter when creating reminders, on both the website and the Discord bot.
                </Typography>
                {autoDetected && (
                    <Typography fontSize='0.72rem' style={{ color: 'rgba(63,174,92,0.85)', marginBottom: 8 }}>
                        Detected as {timezone.replace(/_/g, ' ')} from your browser — change it below if that&apos;s wrong.
                    </Typography>
                )}
                <TextField
                    select
                    size='small'
                    fullWidth
                    value={timezone}
                    onChange={e => handleChange(e.target.value)}
                    disabled={saving}
                    placeholder='Select your timezone…'
                    sx={{
                        '& .MuiOutlinedInput-root': {
                            borderRadius: 0,
                            fontSize: '0.85rem',
                            '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                            '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.3)' },
                            '&.Mui-focused fieldset': { borderColor: 'rgba(219,0,29,0.5)', borderWidth: 1 },
                        },
                    }}
                >
                    {!timezone && <MenuItem value='' disabled>Select your timezone…</MenuItem>}
                    {ALL_TIMEZONES.map(tz => (
                        <MenuItem key={tz} value={tz} sx={{ fontSize: '0.82rem' }}>{tz.replace(/_/g, ' ')}</MenuItem>
                    ))}
                </TextField>
            </div>
        </div>
    )
}
```

(A plain MUI `select` `TextField` with the full ~400-zone `Intl.supportedValuesOf('timeZone')` list is acceptable here — unlike Discord's 25-option component limit, a native `<select>`-backed MUI field has no such cap and users can type to jump to an option. The `detected && ALL_TIMEZONES.includes(detected)` guard defends against a browser reporting a timezone string the IANA database in this Node/browser version doesn't recognize — falls back to leaving the field blank for manual selection rather than saving a bogus value.)

- [ ] **Step 4: Add it to the `/me` page**

Edit `apps/web/app/me/page.tsx` — add the import and render it in the left column, right after `<BioSections .../>` (`apps/web/app/me/page.tsx:110-115`):

```tsx
import TimezoneSelector from './TimezoneSelector'
```

```tsx
                    <BioSections canUploadImage={isHQ} isHQ={isHQ} />
                    <TimezoneSelector initialTimezone={me.timezone ?? null} />
                    <TSLinkButton
```

- [ ] **Step 5: Verify typecheck and manual check**

Run: `npx tsc --noEmit -p tsconfig.json` from `apps/web`.
Expected: no errors.

Manual check: visit `/me` on an account with no `timezone` saved yet — confirm the field auto-fills with a plausible zone within a moment of page load, the "Detected as…" note appears, and refreshing the page shows the same value persisted (confirming it actually saved, not just displayed client-side). Then manually change it to a different zone, confirm the note disappears and the new value persists across a refresh.

- [ ] **Step 6: Update the docs map**

Edit `apps/web/docs/map/g-public-pages.md` — find the existing `app/me/**` entry and add a line noting `TimezoneSelector.tsx` alongside `TSLinkButton.tsx`/`ResetTokenButton.tsx`/`bio.tsx`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/app/api/me/route.ts apps/web/app/me/TimezoneSelector.tsx apps/web/app/me/page.tsx apps/web/docs/map/g-public-pages.md
git commit -m "Add timezone setting to the /me profile page"
```

---

### Task 10: Reminders CRUD API

**Files:**
- Modify: `apps/web/lib/permissions.ts` (add `reminders.admin`)
- Create: `apps/web/app/api/reminders/route.ts`
- Create: `apps/web/app/api/reminders/[id]/route.ts`

**Interfaces:**
- Produces: `GET /api/reminders` (mine + pinged-in, or `?all=1` for J4-Administration), `POST /api/reminders` (create), `GET/PATCH/DELETE /api/reminders/[id]`. Response shape for a reminder (serialized for JSON):
```ts
{
    _id: string
    enabled: boolean
    expected: string        // ISO
    nextCheck: string | null
    chaseUpOffset: number | null
    repeat: number
    repeatLabel: string | null
    by: string
    byName: string
    who: string[]
    message: string
    channel: string
    sendFailed: boolean
}
```
Consumed by Task 13/14's `ReminderPanel.tsx`.

- [ ] **Step 1: Add the permission key**

Edit `apps/web/lib/permissions.ts` — add a new top-level key (place it near `sops`/`tickets`, following the file's existing JSDoc-per-key convention seen at `pages.member`):

```ts
    /**
     * Reminders admin — "All Reminders" and "Channel Access" views on the
     * Unit > Reminders dashboard tab. Every ASOT member can use the tab's
     * default "My Reminders" view without this key; this only gates the
     * cross-user admin views, mirroring the bot's /reminder admin command's
     * J4-Administration-only gate.
     */
    reminders: {
        admin: ['J4-Administration'],
    },
```

- [ ] **Step 2: Write `GET`/`POST /api/reminders`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'

function serialize(r: Reminder, byName: string) {
    return {
        _id: r._id.toString(),
        enabled: r.enabled,
        expected: r.expected.toISOString(),
        nextCheck: r.nextCheck ? r.nextCheck.toISOString() : null,
        chaseUpOffset: r.chaseUpOffset,
        repeat: r.repeat,
        repeatLabel: r.repeatLabel,
        by: r.by,
        byName,
        who: r.who,
        message: r.message,
        channel: r.channel,
        sendFailed: r.sendFailed,
    }
}

async function resolveNames(reminders: Reminder[]): Promise<Map<string, string>> {
    const ids = [...new Set(reminders.map(r => r.by))]
    const users = await Db.users.find({ id: { $in: ids } }).toArray()
    const map = new Map<string, string>()
    for (const u of users) map.set(u.id, u.name ?? u.globalName ?? u.username)
    return map
}

// GET /api/reminders — mine (+ pinged-in), or ?all=1 for admins
export async function GET(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await hasPermission(me, 'pages.member'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const wantsAll = req.nextUrl.searchParams.get('all') === '1'
    if (wantsAll && !client.hasRoles(me, PERMISSIONS.reminders.admin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const search = req.nextUrl.searchParams.get('search') || ''
    const filter: Record<string, unknown> = wantsAll
        ? (search ? { message: { $regex: search, $options: 'i' } } : {})
        : { $or: [{ by: me.id }, { who: `<@${me.id}>` }] }

    const reminders = await Db.reminders.find(filter).sort({ expected: 1 }).toArray()
    const names = await resolveNames(reminders)

    return NextResponse.json({ reminders: reminders.map(r => serialize(r, names.get(r.by) ?? r.by)) })
}

// POST /api/reminders — create
export async function POST(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await hasPermission(me, 'pages.member'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { message, channel, expected, repeat, repeatLabel, chaseUpOffset, who } = body as {
        message: string; channel: string; expected: string; repeat: number; repeatLabel: string | null; chaseUpOffset: number | null; who: string[]
    }

    if (!message?.trim()) return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    if (!channel) return NextResponse.json({ error: 'Channel is required' }, { status: 400 })
    if (!Array.isArray(who) || who.length === 0) return NextResponse.json({ error: 'At least one person to remind is required' }, { status: 400 })
    const expectedDate = new Date(expected)
    if (isNaN(expectedDate.getTime()) || expectedDate.getTime() < Date.now()) {
        return NextResponse.json({ error: 'Reminder time must be a valid time in the future' }, { status: 400 })
    }

    const doc: Reminder = {
        _id: new ObjectId(),
        enabled: true,
        expected: expectedDate,
        acknowledged: null,
        nextCheck: null,
        chaseUpOffset: chaseUpOffset ?? null,
        repeat: repeat ?? 0,
        repeatLabel: repeatLabel ?? null,
        by: me.id,
        who,
        message: message.trim(),
        channel,
        messageId: null,
        sendFailed: false,
    }
    await Db.reminders.insertOne(doc)

    await logAction({
        action: 'reminder.create',
        category: 'reminder',
        performedBy: me.id,
        performedByName: me.name ?? me.globalName,
        entityType: 'reminder',
        entityId: doc._id.toString(),
        target: doc.message,
    })

    return NextResponse.json(serialize(doc, me.name ?? me.globalName), { status: 201 })
}
```

- [ ] **Step 3: Write `GET`/`PATCH`/`DELETE /api/reminders/[id]`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'

async function canManage(me: User, reminder: Reminder): Promise<boolean> {
    if (reminder.by === me.id) return true
    if (client.hasRoles(me, PERMISSIONS.reminders.admin)) return true
    return false
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await hasPermission(me, 'pages.member'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const reminder = await Db.reminders.findOne({ _id: new ObjectId(id) })
    if (!reminder) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!(await canManage(me, reminder))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    return NextResponse.json({
        _id: reminder._id.toString(),
        enabled: reminder.enabled,
        expected: reminder.expected.toISOString(),
        chaseUpOffset: reminder.chaseUpOffset,
        repeat: reminder.repeat,
        repeatLabel: reminder.repeatLabel,
        by: reminder.by,
        who: reminder.who,
        message: reminder.message,
        channel: reminder.channel,
    })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await hasPermission(me, 'pages.member'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const reminder = await Db.reminders.findOne({ _id: new ObjectId(id) })
    if (!reminder) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!(await canManage(me, reminder))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const update: Record<string, unknown> = {}

    if ('enabled' in body) update.enabled = !!body.enabled
    if ('message' in body) update.message = String(body.message).trim()
    if ('channel' in body) update.channel = String(body.channel)
    if ('who' in body) update.who = body.who
    if ('repeat' in body) update.repeat = Number(body.repeat)
    if ('repeatLabel' in body) update.repeatLabel = body.repeatLabel
    if ('chaseUpOffset' in body) update.chaseUpOffset = body.chaseUpOffset
    if ('expected' in body) {
        const expectedDate = new Date(body.expected)
        if (isNaN(expectedDate.getTime())) return NextResponse.json({ error: 'Invalid expected time' }, { status: 400 })
        update.expected = expectedDate
        // Any time/who/repeat edit resets delivery tracking, same as the bot's edit flow
        update.acknowledged = null
        update.nextCheck = null
        update.messageId = null
    }

    await Db.reminders.updateOne({ _id: reminder._id }, { $set: update })

    await logAction({
        action: 'reminder.update',
        category: 'reminder',
        performedBy: me.id,
        performedByName: me.name ?? me.globalName,
        entityType: 'reminder',
        entityId: id,
        target: reminder.message,
        before: reminder,
        after: update,
    })

    return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await hasPermission(me, 'pages.member'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const reminder = await Db.reminders.findOne({ _id: new ObjectId(id) })
    if (!reminder) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!(await canManage(me, reminder))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await Db.reminders.deleteOne({ _id: reminder._id })

    await logAction({
        action: 'reminder.delete',
        category: 'reminder',
        performedBy: me.id,
        performedByName: me.name ?? me.globalName,
        entityType: 'reminder',
        entityId: id,
        target: reminder.message,
    })

    return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` from `apps/web`.
Expected: no errors.

- [ ] **Step 5: Update the docs map**

Edit `apps/web/docs/map/d-misc-api.md` — add an entry for `/api/reminders/**` (list mine + pinged-in, create, edit, delete — member-level, not admin-prefixed). Add a new row to the `Find it fast` table in `apps/web/docs/map/README.md`:

```markdown
| Reminders (Discord bot's channel-posted reminders — create/edit/delete from the web, timezone-aware) | D (`/api/reminders/**`), A (`/api/admin/reminders/channel-access`), F (`unit/reminders/ReminderPanel.tsx`), H (`types/remindme.d.ts` — shared with `apps/bot`) — design spec: `docs/superpowers/specs/2026-08-11-remind-me-system-overhaul-design.md` |
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/permissions.ts apps/web/app/api/reminders/route.ts apps/web/app/api/reminders/[id]/route.ts apps/web/docs/map/d-misc-api.md apps/web/docs/map/README.md
git commit -m "Add reminders CRUD API routes and PERMISSIONS.reminders.admin"
```

---

### Task 11: Picker APIs — channels, roles, member search

**Files:**
- Create: `apps/web/app/api/reminders/meta/route.ts`
- Create: `apps/web/app/api/reminders/members/route.ts`

**Interfaces:**
- Produces: `GET /api/reminders/meta` → `{ channels: { id: string; name: string }[]; roles: { id: string; name: string; color: number }[] }`. `GET /api/reminders/members?search=` → `{ members: { id: string; displayName: string; username: string }[] }`. Consumed by Task 13's create/edit modal.

- [ ] **Step 1: Write `GET /api/reminders/meta`**

```ts
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { botRequest } from '@/lib/discord/bot'
import Db from '@/lib/mongo'

interface DiscordChannel {
    id: string
    name: string
    type: number
}

// Text-capable channel types (GUILD_TEXT, GUILD_ANNOUNCEMENT, GUILD_FORUM excluded — reminders post plain messages)
const TEXT_CHANNEL_TYPES = new Set([0, 5])

export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await hasPermission(me, 'pages.member'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const [rawChannels, roles] = await Promise.all([
        botRequest<DiscordChannel[]>('GET', `/guilds/${process.env.DISCORD_GUILD_ID}/channels`),
        Db.roles.find({}).toArray(),
    ])

    const channels = rawChannels
        .filter(c => TEXT_CHANNEL_TYPES.has(c.type))
        .map(c => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
        channels,
        roles: roles.map(r => ({ id: r.id, name: r.name, color: r.color })).sort((a, b) => a.name.localeCompare(b.name)),
    })
}
```

- [ ] **Step 2: Write `GET /api/reminders/members`**

Any member can tag any other member in a reminder (matching the bot's mentionable-select, which has no restriction) — this is intentionally *not* the admin-gated `/api/admin/members` route, just narrower in the fields it returns.

```ts
import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import Db from '@/lib/mongo'

export async function GET(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await hasPermission(me, 'pages.member'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const search = req.nextUrl.searchParams.get('search') || ''
    if (search.length < 2) return NextResponse.json({ members: [] })

    const users = await Db.users
        .find({
            discharged: { $exists: false },
            isSkeletonAccount: { $ne: true },
            $or: [
                { name: { $regex: search, $options: 'i' } },
                { 'guild.nickname': { $regex: search, $options: 'i' } },
                { globalName: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } },
            ],
        })
        .limit(15)
        .toArray()

    return NextResponse.json({
        members: users.map(u => ({ id: u.id, displayName: u.name ?? u.guild?.nickname ?? u.globalName, username: u.username })),
    })
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` from `apps/web`.
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/reminders/meta/route.ts apps/web/app/api/reminders/members/route.ts
git commit -m "Add channel/role/member picker APIs for the reminders create/edit modal"
```

---

### Task 12: `Unit → Reminders` page — My Reminders + create/edit modal

**Files:**
- Create: `apps/web/app/dashboard/unit/reminders/page.tsx`
- Create: `apps/web/app/dashboard/unit/reminders/loading.tsx`
- Create: `apps/web/app/dashboard/unit/reminders/ReminderPanel.tsx`
- Create: `apps/web/app/dashboard/unit/reminders/ReminderModal.tsx`
- Modify: `apps/web/app/dashboard/StaffSidebar.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/reminders`, `GET/PATCH/DELETE /api/reminders/[id]`, `GET /api/reminders/meta`, `GET /api/reminders/members` (Tasks 10-11).
- Produces: `ReminderPanel` accepts `{ isAdmin: boolean; timezone: string | null }` — Task 14 (All Reminders) and Task 15 (Channel Access) both extend this same component with additional tabs, so its internal `view` state must stay easy to add a third/fourth case to.

- [ ] **Step 1: Write the page (server component, permission gate)**

Follow `apps/web/app/dashboard/unit/sops/page.tsx`'s exact shape:

```tsx
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { hasPermission } from '@/lib/orbat/hasPermission'
import ReminderPanel from './ReminderPanel'

export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!(await hasPermission(me, 'pages.member'))) redirect('/me')

    const isAdmin = client.hasRoles(me, PERMISSIONS.reminders.admin)

    return <ReminderPanel isAdmin={isAdmin} timezone={me.timezone ?? null} />
}
```

- [ ] **Step 2: Write `loading.tsx`**

Read `apps/web/app/dashboard/unit/sops/loading.tsx` first and mirror its exact skeleton pattern (same `TacticalSkeleton` component import if that's what it uses).

- [ ] **Step 3: Write `ReminderModal.tsx` (create/edit form)**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, TextField, MenuItem, Button, Autocomplete, Chip, Alert } from '@mui/material'

interface ChannelOption { id: string; name: string }
interface RoleOption { id: string; name: string; color: number }
interface MemberOption { id: string; displayName: string; username: string }
type WhoOption = { kind: 'member'; id: string; label: string } | { kind: 'role'; id: string; label: string }

const REPEAT_PRESETS = [
    { id: 'none', label: 'None', ms: 0 },
    { id: '15m', label: 'Every 15 minutes', ms: 15 * 60_000 },
    { id: '30m', label: 'Every 30 minutes', ms: 30 * 60_000 },
    { id: 'hourly', label: 'Hourly', ms: 60 * 60_000 },
    { id: 'daily', label: 'Daily', ms: 24 * 60 * 60_000 },
    { id: 'weekly', label: 'Weekly', ms: 7 * 24 * 60 * 60_000 },
    { id: 'monthly', label: 'Every 30 days', ms: 30 * 24 * 60 * 60_000 },
]

const CHASEUP_PRESETS = [
    { id: 'none', label: 'None', ms: null as number | null },
    { id: '15m', label: '15 min after', ms: 15 * 60_000 },
    { id: '30m', label: '30 min after', ms: 30 * 60_000 },
    { id: '1h', label: '1 hour after', ms: 60 * 60_000 },
]

const inputSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: 0,
        fontSize: '0.85rem',
        '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
        '&:hover fieldset': { borderColor: 'rgba(219,0,29,0.3)' },
        '&.Mui-focused fieldset': { borderColor: 'rgba(219,0,29,0.5)', borderWidth: 1 },
    },
}

export interface EditingReminder {
    _id: string
    message: string
    channel: string
    expected: string
    repeat: number
    repeatLabel: string | null
    chaseUpOffset: number | null
    who: string[]
}

export default function ReminderModal({
    open, onClose, onSaved, timezone, editing,
}: {
    open: boolean
    onClose: () => void
    onSaved: () => void
    timezone: string | null
    editing: EditingReminder | null
}) {
    const [message, setMessage] = useState('')
    const [channel, setChannel] = useState('')
    const [dateTime, setDateTime] = useState('')
    const [repeatPreset, setRepeatPreset] = useState('none')
    const [chaseUpPreset, setChaseUpPreset] = useState('none')
    const [who, setWho] = useState<WhoOption[]>([])
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const [channels, setChannels] = useState<ChannelOption[]>([])
    const [roles, setRoles] = useState<RoleOption[]>([])
    const [memberSearch, setMemberSearch] = useState('')
    const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])

    useEffect(() => {
        if (!open) return
        fetch('/api/reminders/meta').then(r => r.json()).then(d => { setChannels(d.channels ?? []); setRoles(d.roles ?? []) })

        if (editing) {
            setMessage(editing.message)
            setChannel(editing.channel)
            setDateTime(editing.expected.slice(0, 16))
            const repeatMatch = REPEAT_PRESETS.find(p => p.ms === editing.repeat)
            setRepeatPreset(repeatMatch?.id ?? 'none')
            const chaseUpMatch = CHASEUP_PRESETS.find(p => p.ms === editing.chaseUpOffset)
            setChaseUpPreset(chaseUpMatch?.id ?? 'none')
            setWho(editing.who.map(w => w.startsWith('<@&')
                ? { kind: 'role', id: w.slice(3, -1), label: w }
                : { kind: 'member', id: w.slice(2, -1), label: w }))
        } else {
            setMessage(''); setChannel(''); setDateTime(''); setRepeatPreset('none'); setChaseUpPreset('none'); setWho([])
        }
        setError('')
    }, [open, editing])

    useEffect(() => {
        if (memberSearch.length < 2) { setMemberOptions([]); return }
        const timer = setTimeout(async () => {
            const d = await fetch(`/api/reminders/members?search=${encodeURIComponent(memberSearch)}`).then(r => r.json())
            setMemberOptions(d.members ?? [])
        }, 300)
        return () => clearTimeout(timer)
    }, [memberSearch])

    async function handleSave() {
        if (!message.trim()) return setError('Message is required.')
        if (!channel) return setError('Channel is required.')
        if (!dateTime) return setError('Date & time is required.')
        if (who.length === 0) return setError('Select at least one person or role to remind.')

        setSaving(true); setError('')

        const repeat = REPEAT_PRESETS.find(p => p.id === repeatPreset)!
        const chaseUp = CHASEUP_PRESETS.find(p => p.id === chaseUpPreset)!
        const whoTags = who.map(w => w.kind === 'role' ? `<@&${w.id}>` : `<@${w.id}>`)

        const body = {
            message: message.trim(),
            channel,
            expected: new Date(dateTime).toISOString(),
            repeat: repeat.ms,
            repeatLabel: repeat.id === 'none' ? null : repeat.label,
            chaseUpOffset: chaseUp.ms,
            who: whoTags,
        }

        const res = editing
            ? await fetch(`/api/reminders/${editing._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            : await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

        setSaving(false)
        if (res.ok) { onSaved(); onClose() }
        else { const d = await res.json(); setError(d.error ?? 'Failed to save reminder') }
    }

    const whoOptions: WhoOption[] = [
        ...roles.map(r => ({ kind: 'role' as const, id: r.id, label: `@${r.name}` })),
        ...memberOptions.map(m => ({ kind: 'member' as const, id: m.id, label: `${m.displayName} (@${m.username})` })),
    ]

    return (
        <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth PaperProps={{ style: { background: '#0f0f0f', border: '1px solid rgba(219,0,29,0.32)', borderRadius: 0 } }}>
            <DialogContent style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)' }}>
                    {editing ? 'EDIT REMINDER' : 'NEW REMINDER'}
                </span>

                {!timezone && (
                    <Alert severity='warning' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>
                        You haven&apos;t set a timezone yet — set one in your <a href='/me' style={{ color: 'inherit' }}>profile</a> so the time below is interpreted correctly.
                    </Alert>
                )}

                <TextField label='Message' size='small' fullWidth required value={message} onChange={e => setMessage(e.target.value)} sx={inputSx} autoFocus />

                <TextField label='Channel' size='small' select fullWidth value={channel} onChange={e => setChannel(e.target.value)} sx={inputSx}>
                    {channels.map(c => <MenuItem key={c.id} value={c.id} sx={{ fontSize: '0.82rem' }}>#{c.name}</MenuItem>)}
                </TextField>

                <TextField
                    label={`When${timezone ? ` (${timezone})` : ''}`}
                    size='small'
                    type='datetime-local'
                    value={dateTime}
                    onChange={e => setDateTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={inputSx}
                />

                <Autocomplete
                    multiple
                    options={whoOptions}
                    value={who}
                    onChange={(_, v) => setWho(v)}
                    inputValue={memberSearch}
                    onInputChange={(_, v) => setMemberSearch(v)}
                    getOptionLabel={o => o.label}
                    isOptionEqualToValue={(a, b) => a.kind === b.kind && a.id === b.id}
                    renderTags={(value, getTagProps) => value.map((option, index) => (
                        <Chip label={option.label} size='small' {...getTagProps({ index })} key={`${option.kind}-${option.id}`} sx={{ borderRadius: 0 }} />
                    ))}
                    renderInput={params => <TextField {...params} label='Remind' placeholder='Search members or pick a role…' size='small' sx={inputSx} />}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <TextField label='Repeat' size='small' select fullWidth value={repeatPreset} onChange={e => setRepeatPreset(e.target.value)} sx={inputSx}>
                        {REPEAT_PRESETS.map(p => <MenuItem key={p.id} value={p.id} sx={{ fontSize: '0.82rem' }}>{p.label}</MenuItem>)}
                    </TextField>
                    <TextField label='Chase Up' size='small' select fullWidth value={chaseUpPreset} onChange={e => setChaseUpPreset(e.target.value)} sx={inputSx}>
                        {CHASEUP_PRESETS.map(p => <MenuItem key={p.id} value={p.id} sx={{ fontSize: '0.82rem' }}>{p.label}</MenuItem>)}
                    </TextField>
                </div>

                {error && <Alert severity='error' sx={{ borderRadius: 0, fontSize: '0.8rem' }}>{error}</Alert>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <Button onClick={onClose} sx={{ borderRadius: 0 }}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} variant='contained' sx={{ borderRadius: 0, background: 'var(--red)' }}>
                        {editing ? 'Save Changes' : 'Create Reminder'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
```

- [ ] **Step 4: Write `ReminderPanel.tsx` (My Reminders view + entry point for Tasks 14/15's extra tabs)**

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Typography, Tabs, Tab, IconButton, Switch } from '@mui/material'
import { Add, Edit, Delete } from '@mui/icons-material'
import ReminderModal, { EditingReminder } from './ReminderModal'

interface ReminderRow {
    _id: string
    enabled: boolean
    expected: string
    repeat: number
    repeatLabel: string | null
    chaseUpOffset: number | null
    by: string
    byName: string
    who: string[]
    message: string
    channel: string
}

type View = 'mine' | 'all' | 'channels'

export default function ReminderPanel({ isAdmin, timezone }: { isAdmin: boolean; timezone: string | null }) {
    const [view, setView] = useState<View>('mine')
    const [reminders, setReminders] = useState<ReminderRow[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [editing, setEditing] = useState<EditingReminder | null>(null)

    const fetchReminders = useCallback(async () => {
        setLoading(true)
        const url = view === 'all' ? '/api/reminders?all=1' : '/api/reminders'
        const res = await fetch(url)
        const data = await res.json()
        setReminders(data.reminders ?? [])
        setLoading(false)
    }, [view])

    useEffect(() => { if (view !== 'channels') fetchReminders() }, [view, fetchReminders])

    async function toggleEnabled(r: ReminderRow) {
        await fetch(`/api/reminders/${r._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !r.enabled }) })
        fetchReminders()
    }

    async function handleDelete(r: ReminderRow) {
        if (!confirm(`Delete reminder "${r.message}"?`)) return
        await fetch(`/api/reminders/${r._id}`, { method: 'DELETE' })
        fetchReminders()
    }

    function formatWhen(iso: string) {
        if (!timezone) return new Date(iso).toLocaleString()
        return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(iso))
    }

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-5 max-w-[1100px] mx-auto'>
            <div className='flex items-center justify-between'>
                <Typography fontWeight={700} fontSize='1rem' letterSpacing={3} style={{ textTransform: 'uppercase' }}>Reminders</Typography>
                {view !== 'channels' && (
                    <button
                        onClick={() => { setEditing(null); setModalOpen(true) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid rgba(219,0,29,0.4)', color: 'var(--red)', padding: '8px 14px', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
                    >
                        <Add sx={{ fontSize: 16 }} /> New Reminder
                    </button>
                )}
            </div>

            {isAdmin && (
                <Tabs value={view} onChange={(_, v) => setView(v)} sx={{ minHeight: 32, '& .MuiTab-root': { minHeight: 32, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }, '& .Mui-selected': { color: 'var(--red) !important' }, '& .MuiTabs-indicator': { background: 'var(--red)' } }}>
                    <Tab value='mine' label='My Reminders' />
                    <Tab value='all' label='All Reminders' />
                    <Tab value='channels' label='Channel Access' />
                </Tabs>
            )}

            {view !== 'channels' && (
                <div className='flex flex-col gap-2'>
                    {loading && <Typography fontSize='0.8rem' style={{ color: 'rgba(237,237,237,0.4)' }}>Loading…</Typography>}
                    {!loading && reminders.length === 0 && <Typography fontSize='0.8rem' style={{ color: 'rgba(237,237,237,0.4)' }}>No reminders.</Typography>}
                    {reminders.map(r => (
                        <div key={r._id} style={{ border: '1px solid rgba(219,0,29,0.15)', borderLeft: `2px solid ${r.enabled ? 'var(--red)' : 'rgba(237,237,237,0.2)'}`, background: 'rgba(255,255,255,0.02)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div className='flex-grow min-w-0'>
                                <Typography fontSize='0.85rem' fontWeight={600}>{r.message}</Typography>
                                <Typography fontSize='0.72rem' style={{ color: 'rgba(237,237,237,0.45)' }}>
                                    {formatWhen(r.expected)} {r.repeatLabel ? `· ${r.repeatLabel}` : ''} {view === 'all' ? `· by ${r.byName}` : ''}
                                </Typography>
                            </div>
                            <Switch checked={r.enabled} onChange={() => toggleEnabled(r)} size='small' sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--red)' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--red)' } }} />
                            <IconButton size='small' onClick={() => { setEditing({ _id: r._id, message: r.message, channel: r.channel, expected: r.expected, repeat: r.repeat, repeatLabel: r.repeatLabel, chaseUpOffset: r.chaseUpOffset, who: r.who }); setModalOpen(true) }}>
                                <Edit sx={{ fontSize: 16 }} />
                            </IconButton>
                            <IconButton size='small' onClick={() => handleDelete(r)}>
                                <Delete sx={{ fontSize: 16 }} />
                            </IconButton>
                        </div>
                    ))}
                </div>
            )}

            <ReminderModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchReminders} timezone={timezone} editing={editing} />
        </div>
    )
}
```

(Task 14 adds no new file here — the "All Reminders" tab is already wired via `view === 'all'` toggling the fetch URL. Task 15 replaces the `view === 'channels'` placeholder — currently rendering nothing — with the Channel Access table.)

- [ ] **Step 5: Add the sidebar entry**

Edit `apps/web/app/dashboard/StaffSidebar.tsx` — add `NotificationsActive` to the icon import list (`apps/web/app/dashboard/StaffSidebar.tsx:10-11`) and a new item in the `Unit` section's `items` array (`apps/web/app/dashboard/StaffSidebar.tsx:576-582`, right after `Tasks`):

```tsx
    AccountTree, CalendarMonth, MenuBook, Policy, ConfirmationNumber,
    Dashboard, TaskAlt, NotificationsActive,
```

```tsx
                { label: 'Tasks',         href: '/dashboard/tasks',              visible: permissions.isStaff,     icon: <TaskAlt sx={{ fontSize: 14 }} /> },
                { label: 'Reminders',     href: '/dashboard/unit/reminders',     visible: true,                    icon: <NotificationsActive sx={{ fontSize: 14 }} /> },
```

- [ ] **Step 6: Verify typecheck and manual check**

Run: `npx tsc --noEmit -p tsconfig.json` from `apps/web`.
Expected: no errors (the `view === 'channels'` tab rendering nothing is expected at this point — Task 15 fills it in).

Manual check: visit `/dashboard/unit/reminders`, confirm "Reminders" appears in the sidebar under Unit, create a reminder via the modal, confirm it appears in "My Reminders" with the right time (compare against your `/me` timezone), edit it, toggle it disabled/enabled, delete it. Confirm the reminder you create here actually gets picked up and sent by the bot's `processReminders` cron (same `reminders` collection).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/dashboard/unit/reminders apps/web/app/dashboard/StaffSidebar.tsx
git commit -m "Add Unit > Reminders dashboard tab with create/edit/delete"
```

---

### Task 13: All Reminders admin view — search

**Files:**
- Modify: `apps/web/app/dashboard/unit/reminders/ReminderPanel.tsx`

**Interfaces:**
- Consumes: `GET /api/reminders?all=1&search=...` (Task 10, already supports `search`).

- [ ] **Step 1: Add a search box, visible only on the `all` tab**

Edit `ReminderPanel.tsx` — add search state and wire it into the fetch, and render a `TextField` search box above the list when `view === 'all'`:

```tsx
import { TextField } from '@mui/material'
```

```tsx
    const [search, setSearch] = useState('')
```

```tsx
    const fetchReminders = useCallback(async () => {
        setLoading(true)
        const url = view === 'all'
            ? `/api/reminders?all=1${search ? `&search=${encodeURIComponent(search)}` : ''}`
            : '/api/reminders'
        const res = await fetch(url)
        const data = await res.json()
        setReminders(data.reminders ?? [])
        setLoading(false)
    }, [view, search])
```

Add the search box right before the reminder list `<div className='flex flex-col gap-2'>`:

```tsx
            {view === 'all' && (
                <TextField
                    size='small'
                    placeholder='Search by message…'
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    sx={{ maxWidth: 320, '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.8rem' } }}
                />
            )}
```

- [ ] **Step 2: Verify typecheck and manual check**

Run: `npx tsc --noEmit -p tsconfig.json` from `apps/web`.
Expected: no errors.

Manual check (as a J4-Administration user): switch to "All Reminders," confirm reminders created by other users appear with `byName`, type into the search box, confirm it filters server-side.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/dashboard/unit/reminders/ReminderPanel.tsx
git commit -m "Add search to the All Reminders admin view"
```

---

### Task 14: Channel Access debug panel

**Files:**
- Create: `apps/web/lib/discord/permissions.ts`
- Create: `apps/web/app/api/admin/reminders/channel-access/route.ts`
- Create: `apps/web/app/dashboard/unit/reminders/ChannelAccessPanel.tsx`
- Modify: `apps/web/app/dashboard/unit/reminders/ReminderPanel.tsx`

**Interfaces:**
- Produces: `computeChannelAccess(channels: DiscordChannel[], guildRoles: DiscordRole[], botMemberRoleIds: string[]): { channelId: string; view: boolean; send: boolean }[]` in `lib/discord/permissions.ts`. `GET /api/admin/reminders/channel-access` → `{ channels: { id: string; name: string; view: boolean; send: boolean }[] }`.

- [ ] **Step 1: Write the permission-overwrite calculator**

Discord permission bitfields exceed 32 bits — every value here is a `bigint`.

```ts
const VIEW_CHANNEL = 1n << 10n   // 0x400
const SEND_MESSAGES = 1n << 11n  // 0x800
const ADMINISTRATOR = 1n << 3n   // 0x8

export interface DiscordRole {
    id: string
    permissions: string // decimal string, e.g. "8589934591"
}

export interface DiscordOverwrite {
    id: string
    type: 0 | 1 // 0 = role, 1 = member
    allow: string
    deny: string
}

export interface DiscordChannel {
    id: string
    name: string
    type: number
    permission_overwrites?: DiscordOverwrite[]
}

/**
 * Replicates Discord's permission-overwrite resolution algorithm purely from
 * REST data (base role permissions -> @everyone overwrite -> the bot's other
 * role overwrites -> a bot-specific member overwrite), since the web app has
 * no live gateway client to ask discord.js's `channel.permissionsFor()`.
 */
export function computeChannelAccess(
    channels: DiscordChannel[],
    guildRoles: DiscordRole[],
    guildId: string,
    botUserId: string,
    botRoleIds: string[],
): { channelId: string; name: string; view: boolean; send: boolean }[] {
    const roleById = new Map(guildRoles.map(r => [r.id, BigInt(r.permissions)]))
    const everyonePerms = roleById.get(guildId) ?? 0n

    let base = everyonePerms
    for (const roleId of botRoleIds) {
        base |= roleById.get(roleId) ?? 0n
    }

    return channels.map(channel => {
        if (base & ADMINISTRATOR) return { channelId: channel.id, name: channel.name, view: true, send: true }

        let perms = base
        const overwrites = channel.permission_overwrites ?? []

        const everyoneOverwrite = overwrites.find(o => o.id === guildId && o.type === 0)
        if (everyoneOverwrite) perms = (perms & ~BigInt(everyoneOverwrite.deny)) | BigInt(everyoneOverwrite.allow)

        let roleAllow = 0n, roleDeny = 0n
        for (const roleId of botRoleIds) {
            const overwrite = overwrites.find(o => o.id === roleId && o.type === 0)
            if (overwrite) { roleAllow |= BigInt(overwrite.allow); roleDeny |= BigInt(overwrite.deny) }
        }
        perms = (perms & ~roleDeny) | roleAllow

        const memberOverwrite = overwrites.find(o => o.id === botUserId && o.type === 1)
        if (memberOverwrite) perms = (perms & ~BigInt(memberOverwrite.deny)) | BigInt(memberOverwrite.allow)

        return {
            channelId: channel.id,
            name: channel.name,
            view: (perms & VIEW_CHANNEL) !== 0n,
            send: (perms & SEND_MESSAGES) !== 0n,
        }
    })
}
```

- [ ] **Step 2: Write the API route**

```ts
import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { botRequest } from '@/lib/discord/bot'
import { computeChannelAccess, DiscordChannel, DiscordRole } from '@/lib/discord/permissions'

interface DiscordMember {
    roles: string[]
}

export async function GET() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!client.hasRoles(me, PERMISSIONS.reminders.admin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const guildId = process.env.DISCORD_GUILD_ID!
    const botUserId = process.env.DISCORD_CLIENT_ID!

    const [channels, roles, botMember] = await Promise.all([
        botRequest<DiscordChannel[]>('GET', `/guilds/${guildId}/channels`),
        botRequest<DiscordRole[]>('GET', `/guilds/${guildId}/roles`),
        botRequest<DiscordMember>('GET', `/guilds/${guildId}/members/${botUserId}`),
    ])

    const textChannels = channels.filter(c => c.type === 0 || c.type === 5)
    const access = computeChannelAccess(textChannels, roles, guildId, botUserId, botMember.roles)
        .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ channels: access })
}
```

- [ ] **Step 3: Write `ChannelAccessPanel.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Typography } from '@mui/material'
import { CheckCircle, Cancel } from '@mui/icons-material'

interface ChannelAccessRow { channelId: string; name: string; view: boolean; send: boolean }

export default function ChannelAccessPanel() {
    const [rows, setRows] = useState<ChannelAccessRow[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch('/api/admin/reminders/channel-access')
            .then(r => r.json())
            .then(d => { setRows(d.channels ?? []); setLoading(false) })
            .catch(() => setLoading(false))
    }, [])

    function Flag({ ok }: { ok: boolean }) {
        return ok
            ? <CheckCircle sx={{ fontSize: 16, color: '#3fae5c' }} />
            : <Cancel sx={{ fontSize: 16, color: 'var(--red)' }} />
    }

    return (
        <div className='flex flex-col gap-2'>
            <Typography fontSize='0.75rem' style={{ color: 'rgba(237,237,237,0.5)' }}>
                Whether the bot can view/send in each text channel — for diagnosing "Failed to send reminder" DMs without digging through bot logs.
            </Typography>
            {loading && <Typography fontSize='0.8rem' style={{ color: 'rgba(237,237,237,0.4)' }}>Loading…</Typography>}
            {!loading && (
                <div style={{ border: '1px solid rgba(219,0,29,0.15)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)' }}>
                        <span>Channel</span><span>View</span><span>Send</span>
                    </div>
                    {rows.map(r => (
                        <div key={r.channelId} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center' }}>
                            <Typography fontSize='0.8rem'>#{r.name}</Typography>
                            <Flag ok={r.view} />
                            <Flag ok={r.send} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 4: Wire it into `ReminderPanel.tsx`**

Add the import and replace the (currently empty) `view === 'channels'` case:

```tsx
import ChannelAccessPanel from './ChannelAccessPanel'
```

```tsx
            {view === 'channels' && <ChannelAccessPanel />}
```

- [ ] **Step 5: Verify typecheck and manual check**

Run: `npx tsc --noEmit -p tsconfig.json` from `apps/web`.
Expected: no errors.

Manual check (as J4-Administration): switch to "Channel Access," confirm every text channel in the guild is listed with accurate view/send flags. Deliberately deny the bot's role "Send Messages" in one test channel via Discord's channel permission settings, refresh the panel, confirm that channel now shows a red "Send" flag.

- [ ] **Step 6: Update the docs map**

Edit `apps/web/docs/map/a-admin-api.md` — add an entry for `/api/admin/reminders/channel-access`. Edit `apps/web/docs/map/f-dashboard-j5-j7-other.md` — add `unit/reminders/ReminderPanel.tsx`, `ReminderModal.tsx`, `ChannelAccessPanel.tsx` to the `unit/**` listing. Edit `apps/web/docs/map/h-lib-types-components.md` — add `lib/discord/permissions.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/discord/permissions.ts apps/web/app/api/admin/reminders/channel-access apps/web/app/dashboard/unit/reminders/ChannelAccessPanel.tsx apps/web/app/dashboard/unit/reminders/ReminderPanel.tsx apps/web/docs/map/a-admin-api.md apps/web/docs/map/f-dashboard-j5-j7-other.md apps/web/docs/map/h-lib-types-components.md
git commit -m "Add Channel Access debug panel to the Reminders admin view"
```

---

## Self-Review Notes

**Spec coverage:** every spec section has a task — data model/migration (Tasks 1-2), bot bug fixes (Task 3), bot redesign incl. timezone (Tasks 4-9), web timezone setting (Task 9), web CRUD (Tasks 10-13), Channel Access panel (Task 14). Non-goals (no delivery-mechanism change, no free-text NLP parsing, no history/analytics) are respected — nothing in any task adds them.

**Type consistency check performed:** `ReminderSession.expected`/`repeatMs`/`repeatLabel`/`chaseUpOffset` (Task 6) are used with those exact names in Tasks 7, 8, 9. `buildReminderComponents(sessionId, session)` (Task 7) signature matches every call site in Tasks 6, 8. `Reminder.enabled`/`repeatLabel` (Task 1) match every read/write site across Tasks 3, 7, 10. Web API response field names (`repeatLabel`, `chaseUpOffset`, `who`, `byName`) match what `ReminderModal.tsx`/`ReminderPanel.tsx` (Task 12) destructure.

**Placeholder scan:** no TBD/TODO — the one deliberately-deferred cross-task reference (`create.ts` calling `buildReminderComponents` before Task 7 lands, noted explicitly in Task 6 Step 2) is flagged as expected-to-fail-typecheck-until-the-next-task, not a placeholder.
