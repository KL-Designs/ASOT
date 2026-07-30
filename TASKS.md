# TASKS.md — ASOT Website Outstanding Tasks & Phases

This file tracks all outstanding tasks, active phases, and pending work across the project.
**Every prompt that contains tasks, steps, edits, or phases must have entries added here.**
Ask "what outstanding tasks or phases do we have?" at any time to get a current status.

Completed items are marked `[x]`. Do not delete entries.

---

## Outstanding Tasks

- [ ] **Activity Log Revamp** — expand the J4 activity log to capture in-depth information across the entire website; log every edit, change, addition, and deletion site-wide with date, time, user, department, and action detail (full prompt planned separately)
- [ ] **J2 Operations Orders Importer** — import historical operation orders (PDF format) into existing completed campaigns and single missions; to be built in the J4 Import Panel following import consolidation rules
- [ ] **AI Implementation Log update** — `AI_IMPLEMENTATION_LOG.md` still shows Phases 3–6 as "Pending"; update to reflect confirmed-complete status

---

## Dead Code Cleanup

- [ ] Delete `app/dashboard/ImportPanel.tsx` — no longer imported by anything after the J4 import hub was created
- [ ] Delete `app/dashboard/j4/tabs/TrainingImportTab.tsx` — no longer used after Training Import tab was removed from J4 Admin Panel

---

## J3 Training Guide DOCX Import (complete)

- [x] `mammoth` installed as dependency
- [x] `docs/training-guide-template.md` — structured template for trainers with H1/H2/H3/H4 heading guide
- [x] `app/api/training-guides/import/route.ts` — parses DOCX via mammoth, creates draft guide
- [x] `app/dashboard/j4/import/tabs/TrainingGuideImportTab.tsx` — drag/drop upload UI with result display
- [x] `app/dashboard/j4/import/tabs/J3ImportTab.tsx` — updated to sub-tabs: Training Records | Training Guides
- [x] `types/mammoth.d.ts` — minimal type declaration (no @types/mammoth available)

---

## Next Up — Selection & Reinforcement Cycle (S&R)

All AI system phases and pre-S&R tasks are now complete. Next work block is finishing any remaining S&R cycle edits and polish.

- [ ] Review S&R cycle for any remaining polish items or outstanding bug reports before closing off

---

## Remaining Pre-S&R Tasks (complete before S&R work resumes)

- [ ] **Dead code cleanup** — delete the two unused files listed in the Dead Code Cleanup section above
- [ ] **AI Implementation Log** — update `AI_IMPLEMENTATION_LOG.md` to mark Phases 3–6 complete
- [ ] **Operation document duplication** — confirm fix is working on existing operations (open several, verify no extra pages appear)
- [ ] **Staff Orders page colours** — confirm each section (HQ/1 PLT/2 PLT/3 PLT) shows its own colour in the document sidebar after being added

---

## Bug Fixing / Final Checks / Website Testing

Run these tests when going live, involving other department members and staff. Add items here any time a new check is identified.

### Operations & Editor
- [ ] Confirm staff can access operations editing in a condensed view to add their platoon/section orders
- [ ] Confirm only Zeus-role users can see Zeus Notes pages inside operations documents
- [ ] Organize and combine all existing campaigns into the correct structure
- [ ] Back-import all historical operation orders into completed campaigns/missions

### Tickets
- [ ] Submit each member-facing ticket type as a regular member and confirm it is received correctly
- [ ] Confirm notifications fire to the correct department for each ticket type
- [ ] Confirm department staff can action/respond to each ticket type
- [ ] Test the full ticket lifecycle: submit → assign → resolve → close

### J3 Training Hub
- [ ] J3 trainer creates a guide/document and submits it for approval
- [ ] J3 lead tests the Send Back for Review workflow
- [ ] J3 lead tests the Approve and Deny system for submitted guides

### J1 Recruitment
- [ ] Confirm the recruit video plays when arriving via the Enlist Now button on the home page
- [ ] Note: direct URL access to `/join` does not autoplay — acceptable behaviour

### General
- [ ] Run a full site accessibility pass with a non-staff member account to confirm role-gating is correct
- [ ] Confirm all department left-hand nav entries match the actual tabs in each panel

---

## Completed Phases

### AI System — Phases 1–6 (all confirmed working)
- [x] Phase 1 — Shared AI service layer + J4 AI Admin tab
- [x] Phase 2 — Intel Image Creator (J2 panel, camera overlays, image library)
- [x] Phase 3 — Intel Package slide editor + CHQ Orders rename + default page order
- [x] Phase 4 — Recruitment Video (J1 `/join` page, J1 Recruit Video tab, admin upload)
- [x] Phase 5 — Training Hub content model (guides, draft/approval/versioning)
- [x] Phase 6 — Training Videos + checkpoint questions + AI written-answer review

### J3 Course System — Phases 1–6 (all confirmed working)
- [x] Phase 1 — Course creation and candidate management
- [x] Phase 2 — Course workspace, sessions, staff assignments
- [x] Phase 3 — Peer review system (waiting room, ranking, Borda scoring)
- [x] Phase 4 — Candidate feedback and catch-up plans
- [x] Phase 5 — Training Records (filters, detail page, live sync)
- [x] Phase 6 — Historical import, post-completion approvals, Reopen Course, J4 activity logging

### Import Panel Consolidation
- [x] J4 import hub page created at `/dashboard/j4/import`
- [x] J1 Application Records import tab with duplicate detection
- [x] J3 Training CSV import tab (wrapper around existing component)
- [x] J4 sub-tabs: ORBAT & Mastersheet, Attendance, Member Emails, Retired Records
- [x] J1 check-duplicates API route created
- [x] Training import analyze route updated with duplicate detection against existing records
- [x] J4 Admin Panel: Import Panel button changed to link to `/dashboard/j4/import`; Training Import tab removed
- [x] J3 Panel: CSV Import tab removed
- [x] Left-hand sidebar: CSV Import removed from J3 nav
- [x] Left-hand sidebar: Recruit Video added to J1 nav (after TFAR Plugin, leads only)

### Operation Document Page Duplication Fix
- [x] Default page init now waits for real Hocuspocus sync signal instead of 3-second timer
- [x] Legacy operations (pre-pageOrder) detected via section content check; migrated cleanly without new defaults
- [x] CHQ Orders (main page) deletion now permitted; navigation moves to next available page
- [x] Add Document button remains available even if all pages are deleted

### J3 Historical Import — Duplicate Detection UI
- [x] Duplicate banner above type mapping table
- [x] Dupe count badge on group rows
- [x] Red highlight + EXISTS label on individual duplicate sessions in expanded view
- [x] Summary line updated to show new vs duplicate session counts separately

### Development Rules & Tooling
- [x] `DEVELOPMENT_RULES.md` created in project root
- [x] Claude Code `UserPromptSubmit` hook configured — reads rules every 10 prompts
- [x] `TASKS.md` created for phase and task tracking
- [x] Role terminology shortcuts, voice-to-text aliases, response format rules all added to `DEVELOPMENT_RULES.md`
