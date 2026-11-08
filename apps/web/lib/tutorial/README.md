# Guided tutorials

A member presses **Tutorial** on a page (or a help-wiki "Start walkthrough"
link) and is walked through it step by step, doing real clicks on the real
page against practice records. Nothing they change is saved.

## How "nothing is saved" is enforced

`sandbox.ts` patches the browser while a tutorial runs:

| Channel | While a tutorial runs |
|---|---|
| `fetch` GET/HEAD | Sent as normal. A tutorial handler may rewrite the JSON (add practice records, apply practice edits). |
| `fetch` anything else | **Never sent.** A handler's `respond` answers it, else `{ ok: true, success: true, tutorial: true }`. |
| `XMLHttpRequest` writes (uploads) | Never sent; the caller gets a network error. |
| `navigator.sendBeacon` | Never sent; returns `true`. |
| WebSocket `send` (collab editor) | Dropped, except Next's dev hot-reload socket. |

It is default-deny: a button no tutorial script thought about is still harmless.
Ending a tutorial, finished or quit, takes the sandbox down and **reloads the
page**, which throws away every practice record and edit components still hold
and any collab-editor change that was never sent.

The one real write a tutorial makes is `POST /api/tutorials/progress`
(the member finished it), sent through `realFetch`.

Known limit: a GET with side effects would get through. No route should have
one; if one appears, give its tutorial a handler with `respond`.

## Pieces

- `types.ts` — `Tutorial`, `TutorialStep`, `StepAdvance`.
- `registry.ts` — every tutorial; `TUTORIALS` (id/title/summary/area/pages) is safe to list anywhere, e.g. the help wiki.
- `tutorials/*.ts` — one file per tutorial: steps plus a `sandbox(ctx)` that builds fresh practice state per run.
- `components/tutorial/TutorialProvider.tsx` — mounted in the root layout; runs the steps, owns the sandbox.
- `components/tutorial/TutorialOverlay.tsx` — the spotlight, the step card and the "Tutorial mode" banner.
- `components/tutorial/TutorialButton.tsx` — the header pill; lists the tutorials registered for the current path and renders nothing when there are none. Already in every J-department header.
- `app/api/tutorials/progress` — GET the caller's id and finished tutorials; POST `{ tutorialId }`. Collection `tutorial_progress`.

## Starting one

- `useTutorials().start(id)`
- `?tutorial=<id>` on any URL
- `window.dispatchEvent(new CustomEvent('asot:tutorial-start', { detail: { id } }))`

The tutorial navigates to its own `startPath`, so a link need not know it.
Two triggers for the same id start it once.

## Writing a tutorial

1. Add `data-tour="..."` to each element a step points at. Practice records get
   ids starting `tutorial-`, so a list row can mark itself:
   `data-tour={id.startsWith('tutorial-') ? 'tutorial-practice-row' : undefined}`.
2. Write `tutorials/<id>.ts`: `sandbox(ctx)` returns handlers that add practice
   records to the page's reads and answer its writes so the UI updates the way
   the real thing would. Keep the state in the closure.
3. Steps: `target` (selector), `path` (navigate first; only the query params it
   names must match), `advance` (`next`, `click`, `visible`, or `write` with an
   optional body `test`), `requires` (skip the step when a control only some
   roles get is absent), `hint`.
4. List it in `registry.ts` with the `pages` whose Tutorial button should show it.
5. Cover it in `sandbox.test.ts` (practice data) and `tests/tutorial.spec.ts`.
