# Phase 4 — Peer Review System

**Status:** 🔲 Not started  
**Depends on:** Phases 1–3 complete (they are). Read `docs/global-spec.md` first.

---

## What to Build

Candidate peer reviews for active Selection/Reinforcement Cycle courses. Instructors manage the round; candidates complete timed ranking + feedback forms. Fully confidential — candidates never see each other's submissions.

---

## New MongoDB Collections Needed

```typescript
// peer_review_rounds
interface PeerReviewRound {
    _id?: ObjectId
    courseInstanceId: string
    status: 'draft' | 'sent' | 'unlocked' | 'completed'
    selectedCandidateIds: string[]          // courseCandidateId strings
    candidateCount: number
    rankingDurationMs: number               // calculated from count (see spec §29)
    feedbackDurationMs: number
    sentAt?: Date
    sentById?: string
    sentByName?: string
    unlockedAt?: Date
    unlockedById?: string
    unlockedByName?: string
    completedAt?: Date
    createdAt: Date
}

// peer_review_submissions — one per selected candidate
interface PeerReviewSubmission {
    _id?: ObjectId
    roundId: string                         // PeerReviewRound._id.toString()
    courseInstanceId: string
    reviewerCandidateId: string             // CourseCandidate._id.toString()
    reviewerCandidateNumber: number
    reviewerUserId: string                  // linked Discord userId (for auth)
    reviewerDisplayName: string
    status: 'waiting' | 'ready' | 'started' | 'ranking_complete' | 'feedback_active' | 'time_expired' | 'submitted'
    hasOpenedWaitingRoom: boolean
    isReady: boolean                        // candidate clicked "I'm Ready"
    rankingStartedAt?: Date                 // when Begin pressed
    rankingCompletedAt?: Date               // when Next pressed or timer expired
    feedbackStartedAt?: Date
    submittedAt?: Date
    ranking: string[]                       // ordered array of courseCandidateIds
    feedback: Record<string, {             // key: courseCandidateId
        text: string
        noFeedback: boolean
    }>
    rankingBonusMs: number                  // unused ranking time transferred to feedback (default 0)
    rankingUsedMs?: number
    feedbackUsedMs?: number
    isIncomplete: boolean                   // flagged if timer expired before ranking complete
    validationFlags: string[]
    extensions: PeerReviewExtension[]
    createdAt: Date
    updatedAt: Date
}

interface PeerReviewExtension {
    id: string
    requestedAt: Date
    reason?: string
    status: 'pending' | 'approved' | 'rejected'
    decidedAt?: Date
    decidedById?: string
    decidedByName?: string
    additionalMs?: number
    currentStage?: 'ranking' | 'feedback'   // stage when requested
}
```

Add to `lib/mongo.ts`:
```typescript
peerReviewRounds:      db.collection('peer_review_rounds')      as MongoCollection<PeerReviewRound>,
peerReviewSubmissions: db.collection('peer_review_submissions') as MongoCollection<PeerReviewSubmission>,
```

Add types to `types/course-workspace.d.ts`.

---

## Timer Calculation (spec §29)

```typescript
function calcTimers(candidateCount: number): { rankingMs: number; feedbackMs: number } {
    const extraGroups = Math.max(0, Math.ceil((candidateCount - 10) / 5))
    const rankingMin  = 5 + (extraGroups * 2.5)
    const feedbackMin = 15 + (extraGroups * 7.5)
    return { rankingMs: rankingMin * 60000, feedbackMs: feedbackMin * 60000 }
}
```

Examples:
- 1–10 candidates → 5 min ranking, 15 min feedback
- 11–15 → 7.5 min, 22.5 min
- 16–20 → 10 min, 30 min

Unused ranking time transfers to feedback. Do not reduce below minimums.

---

## Borda Score Calculation (spec §34)

For each submission where reviewer submitted a valid ranking:
- N = candidateCount in that reviewer's form
- 1st place = N points, 2nd = N-1, ..., last = 1 point
- **Exclude the reviewer's self-ranking from scoring for that candidate.**
  - i.e. when tallying candidate X's score, skip submissions where X was the reviewer.
- If a reviewer ranked themselves 1st, set a `selfRankedFirst: true` flag on that submission (does NOT affect score).

Consolidated summary per candidate:
- Total Borda score (excluding self-reviews)
- Average rank position (across valid reviewers)
- Number of valid reviews received
- Number of 1st-place rankings received
- selfRankedFirst count (how many reviewers who were that candidate ranked themselves 1st — internal indicator only)
- Submission completeness (% of expected reviewers submitted)
- Tie detection: if two candidates have equal total score, flag both as tied; show first-place votes as tiebreaker info but do NOT auto-break ties

---

## New API Routes

All routes require `PERMISSIONS.training.manage` except candidate-facing routes (which require matching `reviewerUserId`).

### Instructor routes
```
POST   /api/j3/course-instances/[id]/peer-review
       — create round (status: draft), calculate timers, select candidates
       — body: { selectedCandidateIds: string[] }

GET    /api/j3/course-instances/[id]/peer-review
       — get current round + all submission statuses (instructor dashboard data)
       — includes waiting-room presence, readiness count, extension requests

POST   /api/j3/course-instances/[id]/peer-review/send
       — change status to 'sent', create one PeerReviewSubmission per selectedCandidateId
       — send website notification + task + Discord DM to each candidate's linked userId

POST   /api/j3/course-instances/[id]/peer-review/unlock
       — set status to 'unlocked', set unlockedAt, record who unlocked
       — enables Begin button on candidate waiting room

GET    /api/j3/course-instances/[id]/peer-review/submissions
       — list all submissions with status, times, flags (instructor only)

GET    /api/j3/course-instances/[id]/peer-review/submissions/[subId]
       — full submission detail: ranking, feedback, autosave history, flags (instructor only)

GET    /api/j3/course-instances/[id]/peer-review/results
       — consolidated Borda results (instructor/J3 leads/J4 only)

PATCH  /api/j3/course-instances/[id]/peer-review/submissions/[subId]/extension
       — body: { action: 'approve'|'reject', additionalMs?: number, reason?: string }
       — approve/reject additional time request
       — on approve: add additionalMs to submission's current stage expiry, unlock form, notify candidate
```

### Candidate-facing routes
These authenticate by verifying `me.id === submission.reviewerUserId`.

```
GET    /api/j3/peer-review/[roundId]
       — get own submission state (for waiting room + form)
       — returns: round status, unlockedAt, submission status, ranking, feedback, expiryAt

POST   /api/j3/peer-review/[roundId]/ready
       — candidate marks themselves ready in waiting room (sets isReady: true, hasOpenedWaitingRoom: true)

POST   /api/j3/peer-review/[roundId]/begin
       — record rankingStartedAt (only if round.status === 'unlocked' and not already started)
       — returns: ranking expiry timestamp (rankingStartedAt + rankingDurationMs)

PATCH  /api/j3/peer-review/[roundId]/ranking
       — autosave ranking array
       — body: { ranking: string[] }

POST   /api/j3/peer-review/[roundId]/ranking/complete
       — candidate presses Next; record rankingCompletedAt, calculate bonus time, set status to feedback_active
       — returns: feedback expiry timestamp

PATCH  /api/j3/peer-review/[roundId]/feedback
       — autosave feedback fields
       — body: { feedback: Record<string, { text: string; noFeedback: boolean }> }

POST   /api/j3/peer-review/[roundId]/request-time
       — body: { reason?: string }
       — sets extension status to 'pending', notifies instructors

POST   /api/j3/peer-review/[roundId]/submit
       — validate: all candidates ranked (or auto-placed), all candidates have feedback or noFeedback
       — set status: 'submitted', record submittedAt
       — return confirmation
```

---

## Waiting Room — Presence

Use **polling** (every 10 seconds) rather than SSE for simplicity in Phase 4. Instructor dashboard polls `GET /api/j3/course-instances/[id]/peer-review` for submission statuses.

If live presence is needed later, add SSE in a patch.

Candidate marks ready via `POST /api/j3/peer-review/[roundId]/ready`.

---

## New UI Components / Pages

### Instructor side (inside CourseWorkspaceClient)

Replace the current "Phase 4" placeholder tab:

```
app/dashboard/unit/training-hub/course/[id]/tabs/PeerReviewTab.tsx
```

This is the parent dashboard (spec §23). Sections:
1. **Setup panel** (when status = draft/sent): candidate selector (checkboxes, defaults to active candidates), send button, timer preview
2. **Waiting room panel** (when status = sent/unlocked): table of selected candidates — candidate number, name, online status, hasOpenedWaitingRoom, isReady, status. Shows "X of Y ready". "Unlock for Everyone" button (single global action).
3. **Progress panel** (when status = unlocked/completed): per-candidate submission status, time used, extension requests
4. **Individual forms** (links): list of submissions, open each in a modal or sub-view
5. **Consolidated results** (when submissions exist): Borda table

### Candidate side (separate page, not inside the instructor workspace)

```
app/peer-review/[roundId]/page.tsx        — server component, passes data to client
app/peer-review/[roundId]/PeerReviewClient.tsx  — state-machine driven UI
```

Candidate state machine: `waiting → ready → started (ranking) → feedback → time_expired | submitted`

The candidate accesses this page via the link in their task/notification.

**Waiting room view:**
- Instructions paragraph
- "Ranking example" image/diagram (placeholder initially)
- "Feedback example" image/diagram
- "I'm Ready" button (marks ready, stays on page)
- Disabled "Begin" button until `round.status === 'unlocked'`
- After unlock: "Begin" becomes enabled

**Ranking view:**
- Timer countdown top-right (uses server-calculated expiry, not local time)
- All included candidates listed (draggable)
- Candidate number + name shown for each
- "Next →" button (validates all ranked, no duplicates)
- DnD library: use `@hello-pangea/dnd` (already in project) or native HTML5 drag events

**Feedback view:**
- Timer countdown top-right (feedback expiry = feedbackStartedAt + feedbackDurationMs + bonusMs + extensionMs)
- Candidates in ascending candidate-number order
- For each: number, name, textarea (300 char max + counter), "No Feedback to Provide" toggle
- "← Back" link to return to ranking (no timer reset)
- When timer expires: lock fields, show Submit + Request Time buttons

**Timer warnings:**
- Ranking: halfway → pulse class on timer; 60s remaining → warning colour; 15s remaining → red flash + tick sound
- Feedback: halfway → pulse; 120s remaining → warning; 10s remaining → red flash + tick
- CSS animation classes: `.timer-pulse`, `.timer-warning`, `.timer-danger`
- Sound: short audio files via Web Audio API; catch and silently ignore autoplay errors
- All warnings also have visual-only equivalents (no audio dependency)
- Respect `prefers-reduced-motion`

**Timer implementation:** Store expiry as UTC timestamp from server. Client shows `Math.max(0, expiryAt - Date.now())`. Poll server every 30 seconds to confirm expiry hasn't changed (extension). Timer state must survive page refresh (read from server on mount).

---

## Timer Expiry Logic (client-side)

**Ranking expires:**
1. Call `POST /api/j3/peer-review/[roundId]/ranking/complete` automatically (marks rankingCompletedAt)
2. If any candidates unranked, server places them at bottom, sets `isIncomplete: true`, adds validation flag
3. Animate/scroll to feedback view

**Feedback expires:**
1. Call `PATCH .../feedback` to save current state
2. Server sets status to `time_expired`
3. Lock all inputs
4. Scroll to bottom
5. Show "Submit Peer Review" + "Request Additional Time" buttons

**Submit confirmation dialog:**
> "Once submitted, you cannot edit this peer review unless an instructor reopens it. Are you sure?"

---

## Confidentiality Rules (spec §33)

- Candidate routes return ONLY the requesting candidate's own submission
- Never return another candidate's ranking or feedback via any candidate-facing route
- Consolidated results route: instructor/J3/J4 only — blocked for candidates
- Individual submission detail route: instructor/J3/J4 only

---

## Activity Logging

Log to `course_activity_logs` (existing collection):
- `peer_review.round_created`
- `peer_review.sent`
- `peer_review.unlocked`
- `peer_review.submitted` (per candidate)
- `peer_review.extension_requested`
- `peer_review.extension_approved`
- `peer_review.extension_rejected`

---

## Sidebar Update (CourseWorkspaceClient)

Replace the current "Peer Review Forms — Phase 4" dimmed placeholder with a real nav item:
```
Candidate Peer Review Forms    (links to PeerReviewTab)
```

No child items needed initially — the tab contains everything.

---

## Acceptance Checks (from spec §50)

- [ ] Peer-review tasks send website notification, website task, and Discord DM
- [ ] Candidates wait for the instructor's single global unlock
- [ ] Timer does not start when notification/task is opened — only when Begin is pressed
- [ ] Ranking and feedback timers calculate correctly for all candidate counts (test 10, 11, 15, 16, 20)
- [ ] Unused ranking time transfers to feedback time
- [ ] Timer state survives browser refresh (server expiry timestamp)
- [ ] Timer warnings trigger at correct milestones (halfway, 1 min, 15s for ranking; halfway, 2 min, 10s for feedback)
- [ ] Ranking expiry auto-places unranked candidates at bottom and flags for review
- [ ] Feedback expiry locks form, shows Submit + Request Time
- [ ] Submit requires confirmation dialog
- [ ] Additional-time requests flow: candidate requests → notifies instructors → instructor approves/rejects → candidate notified, form unlocked
- [ ] Candidate cannot see another candidate's submission
- [ ] Candidate cannot see consolidated scores
- [ ] Reviewer self-ranking is excluded from that candidate's consolidated Borda score
- [ ] Self-ranked-first is internally flagged (does not affect score)
- [ ] Tied results remain tied — no auto-break — first-place votes shown as tiebreaker info
- [ ] Every candidate requires feedback text OR "No Feedback to Provide"
- [ ] Candidates removed/withdrawn/failed excluded from generated form by default
