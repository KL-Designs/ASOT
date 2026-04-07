# ASOT Website — Feature Plans

## Context
This document captures requested features and improvements for the ASOT milsim community platform. It is intended to be used as a prompt/reference for implementation. Items are organized by area of the site. Clarifications from the client have been incorporated throughout.

---

## Global / Cross-Site

### Discord Role ↔ ORBAT Auto-Sync *(Deferred — future)*
- When a member's ORBAT position changes on the website, their Discord guild roles should update automatically
- Uses the existing bot token (no Discord.js — use Discord REST API directly from Next.js API routes)
- Determine the role mapping: each ORBAT position/section should correspond to one or more Discord role IDs (may need a mapping config)
- Handle removal of old roles when position changes

---

## Calendar / Events

### ~~Event Reminders~~ ✓
- ~~Members can opt-in to a reminder for any calendar event~~
- ~~Default reminder time: **1 hour before** the event~~
- ~~Members can set a **custom reminder time**~~
- ~~Reminder delivery: in-app notification~~ *(Discord DM/ping via bot — deferred to future)*
- **Note:** Requires `CRON_SECRET` env var + an external scheduler hitting `GET /api/cron/calendar-reminders?secret=...` every 5 minutes

### ~~Event Filtering~~ ✓
- ~~Add filter controls to the calendar view (admin panel `/admin/unit/calendar`)~~
- ~~Filter by department, event type, or date range~~

---

## Public Applications Page (`/join`)

### Shot of the Month Background
- The current Shot of the Month image is displayed as the **hero/background** on the applications page
- Pull from the existing J5/SOTM data

### Region Latency Test
- When an applicant selects a server region, run a **browser-side ping/latency check** to that region's server
- Display the estimated latency result inline so they can confirm their connection is acceptable

### Help & Instructions
- Add contextual help text throughout the form
- Each section should have a brief explanation of **what it is, how to fill it in, and why it's needed**

### Steam ID64 Lookup
- Add a Steam ID64 lookup field that accepts a **custom Steam URL** and resolves it to the underlying ID64
- Use the Steam API or a public resolver

### Optional Integrations *(stretch goal — Discord parts deferred)*
- Optional field to **link Steam account** via OAuth, rather than manual entry
- Link Discord via OAuth — *deferred to future*

### Previous & Current Units — Separate Sections
- If an applicant selects "yes" to both previous units and current units, show **two separate input sections**
- Current unit section label: "List current group/s" (or similar)

### Availability — Op Times in Applicant's Timezone
- Below the availability section header, display the unit's standard operation times **converted to the applicant's detected timezone**

### Department Info Tabs
- Add **J4** and **J5** to the department info tabs on the applications page (currently missing)
- Centre the layout of these info tabs

---

## J1 — Recruitment

### UI: Switch Applications ↔ Recruit Applicant
- Swap the layout/order of the "Applications" list and "Recruit Applicant" form/button so the workflow is more logical

### Recruit Member Ticket — Improvements
- **Name (joining name)**:
  - Rename "in-game name" field to **"Joining Name"**
  - Max 12 characters
  - Warn if a **similar name already exists** in the system
  - Warn or block if the name is **offensive** (basic filter)
- **Steam**:
  - Remove the Steam URL field
  - **Steam URL is mandatory** — but auto-strip the URL and store only the **ID64**
- **Discord**:
  - **Discord ID** is mandatory
  - Display the resolved Discord username/tag
  - At first, show **applicant's Discord tag**; searching all guild members via bot — *deferred to future*
  - Display the Discord ID alongside the name
- **Region**:
  - If "Other" is selected, show a text field to type their country
  - For any region outside Oceania and Asia, show a **warning about ping and timezone compatibility**
- **How they heard about us**:
  - Dropdown with preset options **plus** a free-text "custom answer" field
- **Returning member detection**:
  - Auto-detect if the Discord ID or Steam ID matches a previous member
  - Auto-indicate status: **Welcome Back** / **To Be Reviewed** / **Not Welcome**
  - For "To Be Reviewed" and "Not Welcome": show a button to notify J4
- **Log Recruit**:
  - On submission, send a **notification/task to the J1 Lead** for sign-off
  - Once the J1 Lead ticks it off, the **recruiter receives their billet and stat credit**

### J1 Mastersheet — Required Columns
Ensure the mastersheet displays (at minimum):
- Discord Username
- Joining Name
- Join Date
- Discord ID
- Steam ID64
- Recruited By
- Region

### Recruiter Statistics
- Add recruiter stats to the J1 statistics section (number recruited, breakdown by period, etc.)

---

## Meetings *(New — shared across all departments J1–J7)*

### Framework
- A new "Meetings" section available in **every department** panel
- Layout similar to Operations (dot-point/section-based structure)
- Can be locked/unlocked by department leads

### Meeting Content
- Rich-text dot-point structure for notes
- Ability to **assign tasks** to a role or individual member
  - Tasks include: chase-up/reminder, set date/time for reminder
- Can **upload audio/visual recordings** or attach a YouTube link

---

## J4 — Administration

### Dashboard Parity
- J4 dashboard layout should match the other department dashboards (J1–J7 standard layout)

### Tasks & Reminders
- J4 should receive tasks/reminders for **J2 deletions** (members removed from J2/Mission Making)

---

## J6 — Game Masters

### ~~Zeus Notes Access Control~~ ✓
- ~~In operation orders/operations, the **Zeus notes section** should only be visible to members with the **J6 tag/role**~~
- ~~Other staff can see the operation exists but cannot view zeus-specific notes~~

---

## Operations

### Automate RSVP Closing *(time-based)*
- RSVP for an operation closes **automatically at a scheduled time** before the operation starts (configurable, e.g. 2 hours prior)

### Automate Attendance Confirmation *(time-based)*
- Attendance confirmation runs automatically at a scheduled time relative to the operation

### Tasks for Attendance Checking
- Automatically generate tasks for **PHQ and CHQ** to check attendance after an operation

### Reservist Allocations
- Add a system for allocating reservists to operations (details TBD)

---

## Shot of the Month (J5)

### ~~Link to Operation~~ ✓
- ~~Add a new field on SOTM entries: **"Which operation is this from?"**~~
- ~~Dropdown or search linking to an operation in the system~~

### Include Operations Screenshots
- Operations-related screenshots (from the gallery or uploaded) can be submitted/nominated for SOTM

---

## Notes & Dependencies

| Feature | Dependency |
|---|---|
| RSVP/Confirmation automation | Scheduled jobs (cron or Next.js route + external scheduler) |
| Latency test | Client-side fetch to region endpoints |
| Steam ID64 lookup | Steam API or public resolver |
| Notifications (in-app) | New DB collection + real-time delivery (polling or WebSocket) |

### Deferred — Requires Discord Bot Integration
| Feature | Dependency |
|---|---|
| Discord role ↔ ORBAT sync | Discord REST API, bot token, ORBAT position→role mapping config |
| Discord guild member search (J1) | Discord REST API, bot token — no Discord.js (incompatible with Next.js) |
| Calendar reminders via Discord | Bot token, DM/notification endpoint |
| Link Discord via OAuth (applications) | Extended OAuth scopes |
