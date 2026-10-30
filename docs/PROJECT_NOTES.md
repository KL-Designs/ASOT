# ASOT project notes

Everything needed to pick this work up again without the Claude Projects workspace
it was planned in. Last updated 2026-10-19. Code architecture lives in the
`CLAUDE.md` files; this file holds the working context around it.

## Where things are

- **Repository:** [KL-Designs/ASOT](https://github.com/KL-Designs/ASOT). A push to
  `main` deploys (see the root `CLAUDE.md`).
- **Local checkout:** `D:\Projects\ASOT` on Dakoda's PC. Claude sessions have done
  most of their work there through a device session.
- **Task tracker:** [site task sheet](https://docs.google.com/spreadsheets/d/1F_J-pEbXozhrgc-bD3kIbKCAslKsNsIcANYKIqbr8Ik)
  (Google Sheets). Row numbers below refer to it.
- **Metis Marker reference source:** `D:\Projects\ASOT\.training\metis_markers` on
  Dakoda's PC (not in git). The map editor is modelled on Metis Marker 1.9.0.

## Task sheet rules

- Notes about a row go in **column L**.
- Claude ticks only the **Done** checkbox when a task is finished. **Checked** is
  for Dakoda's team to tick after they have verified it.
- Thomas's rows are his. Leave them untouched unless told otherwise.

## Working conventions

- Claude commits each batch of work on its own branch; Dakoda pushes and merges.
- Never commit straight to `main`: it deploys immediately.
- When a decision is needed and nobody has answered, Claude picks a sensible default,
  records it here and in the sheet, and carries on.

## Current branch: `claude/project-thread-sfn86b`

39 commits ahead of `main` (plus this file), pushed to GitHub, **no pull request
yet**. Typecheck, 1,504 unit tests, lint and a production build passed on
2026-10-13. **None of it has been checked in a browser, and nothing has run against
live Discord or TeamSpeak.** Merging it to `main` deploys it.

### Built and ticked on this branch

| Rows | What |
| --- | --- |
| Batches 1 and 2 | 57 quick and medium rows from the sheet walkthrough (2026-10-13) |
| 106 | Roll call: Confirm retired, Resolved is an accepted absence, PHQ can confirm their platoon, late joiners by search |
| 48 | Callsign galleries: file under your section, approved by J5 or section staff, public "By callsign" filter |
| 58 | About pages and Support: photo bands, Support moved to the new design |
| 427 | TeamSpeak rank, award, campaign and certification sync; Mastersheet Apply fix |
| 324, 325 | Notify-mission-maker toggle on orders comments |
| 326 | Flowcharts in operation documents |
| 365 to 369 | Training pre-learning: locked until seated, two-week window, waitlist priority |
| 353 to 361 | NCO assessment requests, assessor assignment, shadow approval, attendance marker |
| 309, 310 | Mod Database and the ticket's "Send to mod database" button |
| 318 to 320 | Mission Bible tab with versions and change log |
| 321 to 323 | Objective Idea ticket option and Objective Suggestions tabs (J2 editable, All Staff live mirror) |
| 362 to 364 | Training booking warns when the time overlaps a mission, training or J2 event |
| 337 to 339 | Discord attendance post: timings in each reader's timezone, sign-up buttons, roster picture |
| 88 to 97 | Schedule tab: checks and schedule as separate panels, one selector removed |
| 305, 306, 308 | Map: real Metis model, sub-layers, copyable overlays, per-viewer visibility, double-click fix |

## Open items

1. **Review the branch in a browser**, then open a PR and merge when happy.
2. **Discord attendance posts (337 to 339) are built but switched off.** They post
   nothing until these are set in the server's `.env`:
   - `DISCORD_ATTENDANCE_CHANNEL_ID` (main missions) and
     `DISCORD_ATTENDANCE_MIDWEEK_CHANNEL_ID` (mid-weeks)
   - `ARMA_SERVER_ADDRESS`, `ARMA_SERVER_PORT`, `ARMA_SERVER_PASSWORD`, `ARMA_MODLIST_URL`
   - `BOT_API_SECRET`, the same value on the site and the bot, or the sign-up
     buttons fail.

   Try it first on one operation, in a test channel, with Discord developer mode off.
3. **Map faults (row 307, left unticked).** Waiting on Dakoda to report anything that
   still misbehaves after trying the rebuilt map.
4. **Department admin tab layout (row 84).** Dakoda's decision; still on hold.
5. **Confirm already built:** rows 230, 231 and 333 appear to be done already.
6. **On hold by Dakoda's call:** 84, 212, 213, 328 to 332, 334, 335, 348 to 350, 372,
   373, 384 to 386, 409.

## Defaults chosen without an answer (change if wrong)

- **Training clash check (362):** warns but still allows the booking.
- **Attendance post timings:** weekend operations are main missions, weekdays are
  mid-weeks.
  - Main: staff load in 60 minutes before start, staff briefing 45 before, all
    members load in 30 before, mission ends 3 hours after start.
  - Mid-week: 30, 20 and 15 minutes before, ends 2 hours after.
  - Each operation can override timings, server and modlist on its Attendance tab.
  - The roster picture is redrawn at most every 5 minutes.

## Things to know before relying on them

- **TeamSpeak sync (427).** Ranks, awards, campaigns and certifications map to server
  groups by a saved link (J4 > TeamSpeak > Group links) or by group name. Only rank
  groups are ever removed, and only for a member whose own rank resolves. Run it on
  one member from the ORBAT Member Sync tab before Sync All. New campaigns need
  linking in that tab.
- **Mastersheet Apply (427).** Rows attached by name, and discharged rows with no
  account, were being saved to a record the sheet never reads. Fixed. Report any row
  that still fails.
- **Map (305, 306, 308).** Markers and SQF export were rebuilt from Metis Marker
  1.9.0's own source (icon 6 is Anti-armour, modifiers are drawn, HQ and task force
  no longer land in the reinforced/reduced slot). Existing markers keep their old
  picture. Task force and feint flags have no Metis equivalent and are dropped. An
  exported script still needs testing in game.
- **Mission Bible (318 to 320).** The Google Doc was not imported: a J2 lead pastes it
  into the draft and publishes version 1.
- **NCO assessments (353 to 361).** The assessment sheet is a link plus the assessor's
  notes and outcome, not an on-site form, because the sheet's criteria were not
  available.
- **Roll call (106).** "Repeated No Notice triggers a warning" is not built: no
  threshold was agreed.
- **Discharge clean-up (382).** Untested against live Discord and TeamSpeak. Try it
  on a test account first.
- **About pages (58).** Photo bands use existing site images chosen by filename; swap
  any that do not suit.
- **Pre-learning (365 to 369).** Material is only sent to a member while it is open to
  them; the training types list no longer returns it to members.

## Earlier work (already merged to `main`)

- Reminder system review and fixes (PR #113): day-based repeats stay on wall-clock
  time, warnings about silent role pings, autocomplete timezone, disabled chase-ups.
- Enlist buttons point at the Discord invite while `/join` is unfinished (PR #114).
