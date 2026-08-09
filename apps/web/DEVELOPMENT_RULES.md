# ASOT Website Development Rules

Auto-injected every 10 prompts via Claude Code hook. Add rules here as the project evolves.

---

## Terminology & Aliases

### Voice-to-Text Common Misreadings
The user uses voice-to-text. The following garbled words should be interpreted as:
- "AESOT", "AESOD", "Acehot", "Aisot", or similar → **ASOT**
- "mill pack", "Neopack", "Nillpack", "Millpack", or similar → **MILPAC**
- "J one", "J two" etc. (spoken) → **J1, J2, J3, J4, J5, J6, J7** (the departments)
- "left hand side navigation panel", "left nav bar", "left-hand nav", or similar → **StaffSidebar.tsx**
- "mill sim" or similar → **milsim**

### J + Number Notation
In this project, "J" followed by a number always refers to a department, not a generic label:
J1 = Recruitment, J2 = Intelligence, J3 = Training, J4 = Administration, J5 = Media, J6 = Technology, J7 = Development

### Role Terminology Shortcuts
When the user says any of the following, these are the Discord roles they mean:

| What the user says | Discord roles |
|---|---|
| "all staff" / "section or all staff" | `All Staff` |
| "platoon staff" / "PHQ" | `HQ Staff` |
| "non-staff" / "section members" | Anyone without a staff role |
| "J1 staff/leads/team leads" | `J1 - Department Leader`, `J1 - Head Recruiter`, `J1 - Recruiter Trainer` |
| "J2 staff/leads/team leads" | `J2 - Department Leader`, `J2 - Team Leader`, `J2 - Creator Trainer` |
| "J3 staff/leads/head trainers/team leads" | `J3 - Department Leader`, `J3 - Head Trainer`, `J3 - Assistant Head Trainer` |
| "J5 staff/leads/team leads" | `J5 - Department Leader`, `J5 - Team Leader`, `J5 - Lead Content Creator` |
| "J6 staff/leads/team leads" | `J6 - Department Lead`, `J6 - Team Leader`, `J6 - Assistant Team Leader` |
| "J7 staff/leads/team leads" | `J7 - Department Leader`, `J7 - Team Leader`, `J7 - Assistant Team Leader` |

---

## Response Format Rules

### After Every Prompt
- Provide a brief, non-technical **change log** of what was done (no file names or API paths unless needed to identify something)
- Provide a short **checklist** of things the user should verify or test

### Before Large Prompts or Edits
- Ask clarifying or confirming questions **before** starting implementation
- Wait for the user to confirm, then implement in one go
- Goal: minimise back-and-forth corrections after the fact

### Phase Tracking
- At the end of every phase or after completing a multi-step task, call out any **incomplete steps from any previous phase** that have not yet been resolved
- Any prompt that contains tasks, steps, edits, or phases must have those items **automatically added to `TASKS.md`**
- When a phase completes, move its items to the Completed section of `TASKS.md`

---

## J4 Activity Log Rule

- **Every** new feature, edit, deletion, or addition across the website must be logged in the J4 activity log
- Log entries must include: date, time, the user who performed the action, what was done, and which department/area it relates to
- If a new feature needs activity log integration and the scope is unclear, flag it and ask the user how it should be recorded
- A full activity log revamp is a pending task (see `TASKS.md`) — do not block new features on it, but note when something will need log coverage once the revamp is done

---

## Left-Hand Sidebar Sync Rule

- Whenever a tab is **added** to a department panel, add the matching entry to `StaffSidebar.tsx`
- Whenever a tab is **removed** from a department panel, remove it from `StaffSidebar.tsx`
- Tab index numbers in `StaffSidebar.tsx` must match the actual tab order in the panel component exactly
- After any tab change: mentally check sidebar — "does the nav still match the panel?"

---

## Import Functions

- **ALL import functions must live in the J4 Import Panel** at `/dashboard/j4/import`
- Department panels may have import tabs temporarily during dev/testing; they must be removed before go-live
- When adding a new import function: add it to J4 import panel first; ask before adding it anywhere else
- Before removing an import tab from a department panel: confirm it already exists and works in J4 import panel

---

## Duplicate Detection

- Every import function must detect and display duplicates before writing to the database
- Never silently overwrite existing records — always show the user a preview of what already exists
- Initial go-live import: one clean sweep (wipe existing data, then full import in J4 panel)
- Subsequent imports: flag duplicates, let the user decide whether to skip or override each one

---

## Dead Code Rule

- When a feature or file is moved to a new location, **delete the old file** if nothing else references it
- Before deleting: confirm nothing imports the file (search for its name across the codebase)
- Do not leave renamed, commented-out, or empty stub files behind
- Common example: if an import tab is moved to the J4 panel, remove the original tab component file from the old department folder

---

## Code Conventions

- **MUI + Tailwind**: Tailwind utility classes override MUI because `important: true` is set globally in Tailwind config
- **Permissions**: always use `PERMISSIONS` from `@/lib/permissions.ts`; never hardcode Discord role strings in routes
- **Database**: always use `Db` from `@/lib/mongo.ts`; never create new `MongoClient` instances in routes
- **Types**: global types in `types/*.d.ts` require no import — use `User`, `Operation`, etc. directly
- **API routes**: always call `client.fetchMe()` and check permissions at the top of every handler

---

## Asking Before Acting

- If unsure whether a feature belongs in J4 panel or a department panel: **ask first**
- If removing functionality from a department: **confirm it exists in J4 import panel first**
- Destructive operations (delete, wipe, reset): **always confirm with the user before implementing**
- When an import function is added to any department — ask: should it also go in J4 panel?
