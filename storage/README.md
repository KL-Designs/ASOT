# Storage

Runtime/uploaded data shared by `apps/web` and `apps/bot`, kept as a root-level sibling
of `apps/` rather than nested inside either app. Entirely untracked — see the root
`.gitignore`'s `/storage` entry — and excluded from both Docker images via
`.dockerignore`, with one exception noted below.

Both apps reference these paths relative to their own `process.cwd()` (which is their
own app directory, e.g. `apps/web` or `apps/bot`), so code reads/writes via `../../storage/...`.

## Layout

- `gallery/`, `milpacs/`, `uploads/`, `snapshots/` — web app user-uploaded/generated content.
- `db-backups/`, `media-backups/` — restic repositories (deduplicating, hourly,
  tiered retention) backing the J4 dashboard's Backups tab. `backup-meta/`
  holds the shared status/retention-config files for both. Snapshots tagged
  `pre-restore` are safety copies taken automatically before every restore and
  are exempt from retention — they are never pruned. `snapshots/` is the
  older full-copy system these replaced — left in place, untouched, no longer
  written to.
- `maps/` — Arma terrain source assets (DEM/geojson) **and** the terrain tiles generated
  from them by `apps/web/scripts/generate-terrain.mjs` (`npm run menu` from the repo root →
  Setup / one-off → Generate terrain). Like everything else here, it's excluded from the
  Docker image and volume-mounted at runtime instead — run the generation script on the
  host after adding or changing a world's source assets, since the container never
  regenerates it.
- `j1/` – `j7/`, `hq/`, `all/`, `members/` — department file storage. Recreated on every
  `apps/web` server startup if missing (see `server.mjs`'s "Storage directory
  initialisation" block). Only `j1` (TFAR plugin uploads) and `j2` (J2 workspace files)
  are wired up to a feature today; the rest exist for department leads to use ad hoc.
- `bot/` — the Discord bot's local JSON/image data (modlists, optionals, song temp files).
  Renamed from the bot's old `apps/bot/data/` when everything moved out here.

## Docker

`docker-compose.yml` bind-mounts each subfolder individually (rather than mounting all of
`storage/` at once) so container paths stay explicit.

## `milpac-design-source/`

Design source files for the MilPac renderer that are deliberately **not** in git:

| File | Why it's here |
|---|---|
| `Milpac 2024.xcf` | 27 MB GIMP working file for the uniform, superseded by its own exported PNGs. |
| `save.pptx` | Abandoned partial certificate template. |
| `docker-compose.yml` | Fulcrum's original compose file. It published port 42070 with no authentication on any generation endpoint — kept for reference only. **Do not run it.** See `apps/milpac/PLAN.md` section 9. |

Excluded from the import commit rather than deleted afterwards, because git
history is permanent: anything that lands in a commit stays in the repository
forever even if a later commit removes it. See `apps/milpac/PLAN.md` section 2.
